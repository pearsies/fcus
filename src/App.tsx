import { useState, useEffect, useRef, FormEvent, ChangeEvent } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  auth,
  googleProvider,
  db,
  isFirebaseConfigured,
  onAuthStateChanged,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  firebaseSignOut,
  deleteUser,
  doc,
  getDoc,
  setDoc,
  deleteDoc,
  User
} from './lib/firebase';

type ScreenType = 'settings' | 'record' | 'questions' | 'quests' | 'you' | 'streak' | 'what_is_this' | null;

interface Quest {
  id: string;
  title: string;
  description: string;
  rewardMinutes: number;
  getProgress: (todayFocusSecs: number, multiplier: number, manualLogged: boolean) => { current: number; total: number; label: string; ratio: number };
  isCompleted: (todayFocusSecs: number, multiplier: number, manualLogged: boolean) => boolean;
}

interface GeneratedQuestion {
  id: string;
  type: 'multiple_choice' | 'open_ended';
  questionText: string;
  options?: string[];
  correctAnswer: string;
  explanation: string;
}

const QUESTS_LIST: Quest[] = [
  {
    id: 'focus_30m',
    title: 'Focus for 30 minutes',
    description: 'Complete 30 minutes of total focus time today',
    rewardMinutes: 5,
    getProgress: (todayFocusSecs) => {
      const mins = Math.floor(todayFocusSecs / 60);
      const ratio = Math.min(1, mins / 30);
      return { current: mins, total: 30, label: `${mins}/30 mins (${Math.round(ratio * 100)}%)`, ratio };
    },
    isCompleted: (todayFocusSecs) => todayFocusSecs >= 1800,
  },
  {
    id: 'reach_multiplier',
    title: 'Reach 1.25x Multiplier',
    description: 'Maintain an active work session to build session multiplier',
    rewardMinutes: 5,
    getProgress: (_, mult) => {
      const ratio = Math.min(1, mult / 1.25);
      return { current: mult, total: 1.25, label: `${mult.toFixed(2)}x / 1.25x (${Math.round(ratio * 100)}%)`, ratio };
    },
    isCompleted: (_, mult) => mult >= 1.25,
  },
  {
    id: 'log_manual',
    title: 'Log manual work',
    description: 'Record an offline productive activity',
    rewardMinutes: 5,
    getProgress: (_, __, manualLogged) => {
      const ratio = manualLogged ? 1 : 0;
      return { current: ratio, total: 1, label: manualLogged ? 'Completed (100%)' : '0/1 logged (0%)', ratio };
    },
    isCompleted: (_, __, manualLogged) => manualLogged,
  },
];

export default function App() {
  // Mode state: 'relax' (using free time) vs 'work' (working)
  const [mode, setMode] = useState<'relax' | 'work'>(() => {
    const saved = localStorage.getItem('fcus_mode');
    return saved === 'work' || saved === 'relax' ? saved : 'relax';
  });

  // Free time left in seconds
  const [secondsLeft, setSecondsLeft] = useState<number>(() => {
    const saved = localStorage.getItem('fcus_free_time');
    if (saved !== null && !isNaN(Number(saved))) {
      return Math.max(0, Number(saved));
    }
    return 1800; // 30 minutes default
  });

  // Total work seconds in current session
  const [workSeconds, setWorkSeconds] = useState<number>(() => {
    const saved = localStorage.getItem('fcus_work_time');
    if (saved !== null && !isNaN(Number(saved))) {
      return Number(saved);
    }
    return 0;
  });

  // Continuous work seconds in current uninterrupted session
  const [continuousSeconds, setContinuousSeconds] = useState<number>(0);

  // Free time earned in current session
  const [sessionEarnedSeconds, setSessionEarnedSeconds] = useState<number>(0);

  // Streak state (days with 30+ mins focus)
  const [streak, setStreak] = useState<number>(() => {
    const saved = localStorage.getItem('fcus_streak');
    return saved ? Math.max(0, parseInt(saved, 10)) : 0;
  });

  // Today's focus time in seconds
  const [todayFocusSeconds, setTodayFocusSeconds] = useState<number>(() => {
    const savedDate = localStorage.getItem('fcus_last_date');
    const today = new Date().toISOString().split('T')[0];
    if (savedDate === today) {
      const savedSecs = localStorage.getItem('fcus_today_secs');
      return savedSecs ? Number(savedSecs) : 0;
    }
    return 0;
  });

  // Whether today's streak has already been credited
  const [todayCredited, setTodayCredited] = useState<boolean>(() => {
    const savedDate = localStorage.getItem('fcus_last_date');
    const today = new Date().toISOString().split('T')[0];
    if (savedDate === today) {
      return localStorage.getItem('fcus_today_credited') === 'true';
    }
    return false;
  });

  // Manual logged state for quest
  const [manualLogged, setManualLogged] = useState<boolean>(() => {
    return localStorage.getItem('fcus_manual_logged') === 'true';
  });

  // Claimed quest rewards
  const [claimedQuests, setClaimedQuests] = useState<string[]>(() => {
    const saved = localStorage.getItem('fcus_claimed_quests');
    return saved ? JSON.parse(saved) : [];
  });

  // Sound enabled
  const [soundEnabled, setSoundEnabled] = useState<boolean>(() => {
    const saved = localStorage.getItem('fcus_sound');
    return saved !== null ? saved === 'true' : true;
  });

  const [isRunning, setIsRunning] = useState<boolean>(true);
  const [activeScreen, setActiveScreen] = useState<ScreenType>(null);

  // Work activity description form state
  const [workDescription, setWorkDescription] = useState<string>('');
  const [isEvaluatingWork, setIsEvaluatingWork] = useState<boolean>(false);
  const [evaluationFeedback, setEvaluationFeedback] = useState<string | null>(null);

  // Question generator & solver state
  const [questionTopic, setQuestionTopic] = useState<string>('');
  const [questionDifficulty, setQuestionDifficulty] = useState<string>('Intermediate');
  const [questionMaterialText, setQuestionMaterialText] = useState<string>('');
  const [questionCount, setQuestionCount] = useState<number>(3);
  const [isGeneratingQuestions, setIsGeneratingQuestions] = useState<boolean>(false);
  const [generatedQuestions, setGeneratedQuestions] = useState<GeneratedQuestion[]>([]);
  const [activeQuestionIndex, setActiveQuestionIndex] = useState<number>(0);
  const [userAnswers, setUserAnswers] = useState<Record<string, string>>({});
  const [gradingResults, setGradingResults] = useState<Record<string, { isCorrect: boolean; feedback: string; graded: boolean }>>({});
  const [isGradingAnswer, setIsGradingAnswer] = useState<boolean>(false);

  // Notification Toast state
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Firebase Auth & Cloud Sync States
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [showAuthModal, setShowAuthModal] = useState<boolean>(false);
  const [authEmail, setAuthEmail] = useState<string>('');
  const [authPassword, setAuthPassword] = useState<string>('');
  const [authIsSignUp, setAuthIsSignUp] = useState<boolean>(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [isSubmittingAuth, setIsSubmittingAuth] = useState<boolean>(false);

  // Custom Confirmation Dialog State
  const [confirmModal, setConfirmModal] = useState<{
    type: 'resetTime' | 'clearData' | 'deleteAccount';
    title: string;
    description: string;
    actionLabel: string;
  } | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 2800);
  };

  // Listen for Firebase Auth state changes & sync stats
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      if (user) {
        try {
          const userRef = doc(db, 'users', user.uid);
          const userSnap = await getDoc(userRef);
          if (userSnap.exists()) {
            const data = userSnap.data();
            if (data) {
              if (typeof data.secondsLeft === 'number') setSecondsLeft(data.secondsLeft);
              if (typeof data.workSeconds === 'number') setWorkSeconds(data.workSeconds);
              if (typeof data.streak === 'number') setStreak(data.streak);
              if (typeof data.todayFocusSeconds === 'number') setTodayFocusSeconds(data.todayFocusSeconds);
              if (typeof data.todayCredited === 'boolean') setTodayCredited(data.todayCredited);
              if (typeof data.manualLogged === 'boolean') setManualLogged(data.manualLogged);
              if (Array.isArray(data.claimedQuests)) setClaimedQuests(data.claimedQuests);
              showToast(`Signed in as ${user.email || user.displayName || 'user'}`);
            }
          } else {
            // New user account: import existing local stats into Firebase Firestore
            const today = new Date().toISOString().split('T')[0];
            await setDoc(userRef, {
              uid: user.uid,
              email: user.email,
              displayName: user.displayName,
              secondsLeft,
              workSeconds,
              streak,
              todayFocusSeconds,
              todayCredited,
              manualLogged,
              claimedQuests,
              lastDate: today,
              updatedAt: new Date().toISOString(),
            });
            showToast(`Signed in! Local stats synced to cloud account.`);
          }
        } catch (err: any) {
          console.error('Error Syncing Firebase Account:', err);
        }
      }
    });
    return () => unsubscribe();
  }, []);

  // Auto-sync to Firestore whenever stats update and user is logged in
  useEffect(() => {
    if (!currentUser) return;
    const today = new Date().toISOString().split('T')[0];
    const userRef = doc(db, 'users', currentUser.uid);

    const timeout = setTimeout(async () => {
      try {
        await setDoc(
          userRef,
          {
            uid: currentUser.uid,
            email: currentUser.email,
            displayName: currentUser.displayName,
            secondsLeft,
            workSeconds,
            streak,
            todayFocusSeconds,
            todayCredited,
            manualLogged,
            claimedQuests,
            lastDate: today,
            updatedAt: new Date().toISOString(),
          },
          { merge: true }
        );
      } catch (err) {
        console.error('Firestore auto sync failed:', err);
      }
    }, 1000);

    return () => clearTimeout(timeout);
  }, [currentUser, secondsLeft, workSeconds, streak, todayFocusSeconds, todayCredited, manualLogged, claimedQuests]);

  // Sound chime helper
  const playChime = () => {
    if (!soundEnabled) return;
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
      osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.3); // A5
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.5);
    } catch {
      // Audio context play restriction ignore
    }
  };

  // Check and handle day roll-over for streak & daily quests logic
  useEffect(() => {
    const today = new Date().toISOString().split('T')[0];
    const savedDate = localStorage.getItem('fcus_last_date');

    if (savedDate && savedDate !== today) {
      const lastDateObj = new Date(savedDate);
      const todayObj = new Date(today);
      const diffDays = Math.round((todayObj.getTime() - lastDateObj.getTime()) / (1000 * 3600 * 24));

      const yesterdayCredited = localStorage.getItem('fcus_today_credited') === 'true';
      if (diffDays > 1 || !yesterdayCredited) {
        setStreak(0);
        localStorage.setItem('fcus_streak', '0');
      }

      setTodayFocusSeconds(0);
      setTodayCredited(false);
      setClaimedQuests([]);
      setManualLogged(false);
      localStorage.setItem('fcus_today_secs', '0');
      localStorage.setItem('fcus_today_credited', 'false');
      localStorage.setItem('fcus_claimed_quests', '[]');
      localStorage.setItem('fcus_manual_logged', 'false');
    }
    localStorage.setItem('fcus_last_date', today);
  }, []);

  // Save persistent state
  useEffect(() => {
    localStorage.setItem('fcus_free_time', secondsLeft.toString());
  }, [secondsLeft]);

  useEffect(() => {
    localStorage.setItem('fcus_mode', mode);
  }, [mode]);

  useEffect(() => {
    localStorage.setItem('fcus_work_time', workSeconds.toString());
  }, [workSeconds]);

  useEffect(() => {
    localStorage.setItem('fcus_streak', streak.toString());
  }, [streak]);

  useEffect(() => {
    localStorage.setItem('fcus_today_secs', todayFocusSeconds.toString());
  }, [todayFocusSeconds]);

  useEffect(() => {
    localStorage.setItem('fcus_today_credited', todayCredited.toString());
  }, [todayCredited]);

  useEffect(() => {
    localStorage.setItem('fcus_sound', soundEnabled.toString());
  }, [soundEnabled]);

  useEffect(() => {
    localStorage.setItem('fcus_claimed_quests', JSON.stringify(claimedQuests));
  }, [claimedQuests]);

  useEffect(() => {
    localStorage.setItem('fcus_manual_logged', manualLogged.toString());
  }, [manualLogged]);

  // Base multiplier based on streak: +0.05x per day streak, capped at +0.5x
  const baseMultiplier = 1.0 + Math.min(0.5, streak * 0.05);

  // Session duration bonus: +0.25x per 20 minutes (1200s), capped at +1.5x
  const sessionBonus = Math.min(1.5, Math.floor(continuousSeconds / 1200) * 0.25);

  // Current total multiplier
  const currentMultiplier = baseMultiplier + sessionBonus;

  // Sync refs for background-safe real-time timer calculations
  const modeRef = useRef(mode);
  modeRef.current = mode;

  const streakRef = useRef(streak);
  streakRef.current = streak;

  const continuousSecondsRef = useRef(continuousSeconds);
  continuousSecondsRef.current = continuousSeconds;

  const todayFocusSecondsRef = useRef(todayFocusSeconds);
  todayFocusSecondsRef.current = todayFocusSeconds;

  const todayCreditedRef = useRef(todayCredited);
  todayCreditedRef.current = todayCredited;

  const secondsLeftRef = useRef(secondsLeft);
  secondsLeftRef.current = secondsLeft;

  const lastTickRef = useRef<number>(Date.now());

  useEffect(() => {
    if (!isRunning) return;

    lastTickRef.current = Date.now();

    const tick = () => {
      const now = Date.now();
      const elapsedMs = now - lastTickRef.current;
      if (elapsedMs < 1000) return;

      const elapsedSeconds = Math.floor(elapsedMs / 1000);
      lastTickRef.current += elapsedSeconds * 1000;

      const currentMode = modeRef.current;

      if (currentMode === 'relax') {
        const curLeft = secondsLeftRef.current;
        if (curLeft <= elapsedSeconds) {
          setSecondsLeft(0);
          setIsRunning(false);
          playChime();
          showToast("Relaxation time ended!");
        } else {
          setSecondsLeft((prev) => Math.max(0, prev - elapsedSeconds));
        }
      } else {
        // Work mode: count work time & earn free time
        const baseMult = 1.0 + Math.min(0.5, streakRef.current * 0.05);
        let tempContinuous = continuousSecondsRef.current;
        let totalEarned = 0;

        for (let i = 0; i < elapsedSeconds; i++) {
          tempContinuous += 1;
          const sBonus = Math.min(1.5, Math.floor(tempContinuous / 1200) * 0.25);
          const mult = baseMult + sBonus;
          totalEarned += 0.2 * mult;
        }

        setWorkSeconds((prev) => prev + elapsedSeconds);
        setContinuousSeconds((prev) => prev + elapsedSeconds);
        setSecondsLeft((prev) => prev + totalEarned);
        setSessionEarnedSeconds((prev) => prev + totalEarned);

        const curFocus = todayFocusSecondsRef.current;
        const nextFocus = curFocus + elapsedSeconds;
        if (curFocus < 1800 && nextFocus >= 1800 && !todayCreditedRef.current) {
          setStreak((s) => s + 1);
          setTodayCredited(true);
          playChime();
          showToast("Daily 30m goal reached! Streak increased.");
        }
        setTodayFocusSeconds((prev) => prev + elapsedSeconds);
      }
    };

    const interval = setInterval(tick, 250);

    const handleSync = () => {
      tick();
    };

    document.addEventListener('visibilitychange', handleSync);
    window.addEventListener('focus', handleSync);
    window.addEventListener('pageshow', handleSync);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleSync);
      window.removeEventListener('focus', handleSync);
      window.removeEventListener('pageshow', handleSync);
    };
  }, [isRunning, mode]);

  const toggleMode = () => {
    const nextMode = mode === 'relax' ? 'work' : 'relax';
    if (nextMode === 'relax') {
      setWorkSeconds(0);
      setContinuousSeconds(0);
      setSessionEarnedSeconds(0);
    }
    setMode(nextMode);
  };

  const togglePlay = () => {
    if (isRunning) {
      if (mode === 'work') {
        setContinuousSeconds(0);
      }
      setIsRunning(false);
    } else {
      if (mode === 'relax' && secondsLeft === 0) {
        setSecondsLeft(1800);
      }
      setIsRunning(true);
    }
  };

  const formatTime = (totalSeconds: number): string => {
    const rounded = Math.floor(totalSeconds);
    const h = Math.floor(rounded / 3600);
    const m = Math.floor((rounded % 3600) / 60);
    const s = rounded % 60;
    const mStr = m.toString().padStart(2, '0');
    const sStr = s.toString().padStart(2, '0');
    return `${h}:${mStr}:${sStr}`;
  };

  const formatEarnedTime = (totalSeconds: number): string => {
    const rounded = Math.floor(totalSeconds);
    const h = Math.floor(rounded / 3600);
    const m = Math.floor((rounded % 3600) / 60);
    const s = rounded % 60;
    const sStr = s.toString().padStart(2, '0');
    if (h > 0) {
      const mStr = m.toString().padStart(2, '0');
      return `${h}:${mStr}:${sStr}`;
    }
    return `${m}:${sStr}`;
  };

  const formatMultiplier = (val: number): string => {
    const rounded = Math.round(val * 100) / 100;
    if (Number.isInteger(rounded)) {
      return `${rounded.toFixed(1)}x`;
    }
    return `${rounded}x`;
  };

  // Evaluate activity & record work
  const handleEvaluateWorkActivity = async (e: FormEvent) => {
    e.preventDefault();
    if (!workDescription.trim() || workDescription.trim().length < 5) {
      showToast("Please describe your work activity in more detail.");
      return;
    }

    setIsEvaluatingWork(true);
    setEvaluationFeedback(null);

    try {
      const res = await fetch('/api/evaluate-work', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: workDescription }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to evaluate activity');

      if (data.minutes && data.minutes > 0) {
        const addedWorkSeconds = data.minutes * 60;
        const earnedFreeSeconds = addedWorkSeconds * 0.2 * currentMultiplier;
        const earnedMins = Math.round(earnedFreeSeconds / 60);

        // Does NOT affect current active work timer (workSeconds), but adds free time and counts towards focus/streak/quests
        setSecondsLeft((prev) => prev + earnedFreeSeconds);
        setTodayFocusSeconds((prev) => {
          const next = prev + addedWorkSeconds;
          if (next >= 1800 && !todayCredited) {
            setStreak((s) => s + 1);
            setTodayCredited(true);
          }
          return next;
        });
        setManualLogged(true);

        playChime();
        showToast(`Earned +${earnedMins}m free time from ${data.minutes}m activity`);
        setEvaluationFeedback(`Earned +${earnedMins}m free time from ${data.minutes} focus minutes (${data.activitySummary}).`);
        setWorkDescription('');
      } else {
        setEvaluationFeedback(data.feedback || "Activity description was not recognized as productive focus.");
      }
    } catch (err: any) {
      showToast(err.message || "Evaluation failed. Check your description.");
    } finally {
      setIsEvaluatingWork(false);
    }
  };

  // Auth Handlers
  const handleGoogleSignIn = async () => {
    setAuthError(null);
    if (!isFirebaseConfigured) {
      setAuthError('Firebase credentials are not configured yet. Set up your Firebase project keys in .env (see .env.example) to enable Google Sign-In.');
      return;
    }
    setIsSubmittingAuth(true);
    try {
      await signInWithPopup(auth, googleProvider);
      setShowAuthModal(false);
    } catch (err: any) {
      console.error('Google Sign In error:', err);
      const msg = err.message || '';
      if (msg.includes('popup-closed-by-user')) {
        setAuthError('Sign in popup was closed before completion.');
      } else if (msg.includes('closing/hidden')) {
        setAuthError('Sign in process was interrupted. Please try again or use email sign in.');
      } else {
        setAuthError(msg.replace(/^Firebase:\s*/, '') || 'Google sign in failed');
      }
    } finally {
      setIsSubmittingAuth(false);
    }
  };

  const handleEmailAuth = async (e: FormEvent) => {
    e.preventDefault();
    if (!isFirebaseConfigured) {
      setAuthError('Firebase credentials are not configured yet. Set up your Firebase project keys in .env (see .env.example) to enable authentication.');
      return;
    }
    if (!authEmail.trim() || !authPassword.trim()) {
      setAuthError("Email and password are required.");
      return;
    }
    setAuthError(null);
    setIsSubmittingAuth(true);
    try {
      if (authIsSignUp) {
        await createUserWithEmailAndPassword(auth, authEmail, authPassword);
      } else {
        await signInWithEmailAndPassword(auth, authEmail, authPassword);
      }
      setShowAuthModal(false);
      setAuthEmail('');
      setAuthPassword('');
    } catch (err: any) {
      console.error('Email Auth error:', err);
      const msg = err.message || '';
      if (msg.includes('closing/hidden')) {
        setAuthError('Sign in process was interrupted. Please try again.');
      } else {
        setAuthError(msg.replace(/^Firebase:\s*/, '') || 'Authentication error');
      }
    } finally {
      setIsSubmittingAuth(false);
    }
  };

  const handleSignOut = async () => {
    try {
      await firebaseSignOut(auth);
      showToast("Signed out");
    } catch (err: any) {
      showToast(err.message || "Sign out failed");
    }
  };

  const triggerDeleteAccount = () => {
    if (!currentUser) return;
    setConfirmModal({
      type: 'deleteAccount',
      title: 'delete cloud account',
      description: 'Are you sure you want to permanently delete your account and all cloud saved statistics?',
      actionLabel: 'Delete Account',
    });
  };

  const triggerResetFreeTime = () => {
    setConfirmModal({
      type: 'resetTime',
      title: 'reset free time balance',
      description: 'Are you sure you want to reset your free relaxation time balance back to 30 minutes?',
      actionLabel: 'Reset Time',
    });
  };

  const triggerClearAllData = () => {
    setConfirmModal({
      type: 'clearData',
      title: 'clear all statistics',
      description: 'Are you sure you want to clear all app statistics, streak progress, and local/cloud saved data?',
      actionLabel: 'Clear All Data',
    });
  };

  const executeConfirmedAction = async () => {
    if (!confirmModal) return;
    const type = confirmModal.type;
    setConfirmModal(null);

    if (type === 'resetTime') {
      setSecondsLeft(1800);
      localStorage.setItem('fcus_free_time', '1800');
      if (currentUser) {
        try {
          await setDoc(doc(db, 'users', currentUser.uid), { secondsLeft: 1800 }, { merge: true });
        } catch (err) {
          console.error('Firebase update failed:', err);
        }
      }
      showToast("Free time reset to 30m");
    } else if (type === 'clearData') {
      localStorage.clear();
      setSecondsLeft(1800);
      setWorkSeconds(0);
      setStreak(0);
      setTodayFocusSeconds(0);
      setTodayCredited(false);
      setClaimedQuests([]);
      setManualLogged(false);
      setContinuousSeconds(0);
      setSessionEarnedSeconds(0);

      if (currentUser) {
        try {
          const today = new Date().toISOString().split('T')[0];
          await setDoc(
            doc(db, 'users', currentUser.uid),
            {
              secondsLeft: 1800,
              workSeconds: 0,
              streak: 0,
              todayFocusSeconds: 0,
              todayCredited: false,
              manualLogged: false,
              claimedQuests: [],
              lastDate: today,
              updatedAt: new Date().toISOString(),
            },
            { merge: true }
          );
        } catch (err) {
          console.error('Firebase reset error:', err);
        }
      }

      showToast("All data cleared");
      setActiveScreen(null);
    } else if (type === 'deleteAccount') {
      if (!currentUser) return;
      try {
        const uid = currentUser.uid;
        await deleteDoc(doc(db, 'users', uid));
        await deleteUser(currentUser);
        localStorage.clear();
        setSecondsLeft(1800);
        setWorkSeconds(0);
        setStreak(0);
        setTodayFocusSeconds(0);
        setTodayCredited(false);
        setClaimedQuests([]);
        setManualLogged(false);
        showToast("Account and cloud data deleted");
      } catch (err: any) {
        showToast(err.message || "Delete failed. Re-authenticating may be required.");
      }
    }
  };

  // File upload reader for question generation material
  const handleFileUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result;
      if (typeof text === 'string') {
        setQuestionMaterialText(text.slice(0, 8000));
        showToast(`Loaded "${file.name}" study text`);
      }
    };
    reader.readAsText(file);
  };

  // Generate questions
  const handleGenerateQuestions = async (e: FormEvent) => {
    e.preventDefault();
    if (!questionTopic.trim() && !questionMaterialText.trim()) {
      showToast("Enter a topic or attach study material.");
      return;
    }

    setIsGeneratingQuestions(true);
    setGeneratedQuestions([]);
    setActiveQuestionIndex(0);
    setUserAnswers({});
    setGradingResults({});

    try {
      const res = await fetch('/api/generate-questions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic: questionTopic,
          difficulty: questionDifficulty,
          materialText: questionMaterialText,
          count: questionCount,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to generate questions');

      if (data.questions && Array.isArray(data.questions) && data.questions.length > 0) {
        setGeneratedQuestions(data.questions);
        showToast(`Generated ${data.questions.length} questions`);
      } else {
        showToast("Could not generate questions. Please try another topic.");
      }
    } catch (err: any) {
      showToast(err.message || "Failed to generate questions");
    } finally {
      setIsGeneratingQuestions(false);
    }
  };

  // Grade user's answer
  const handleGradeCurrentQuestion = async (e: FormEvent) => {
    e.preventDefault();
    const currentQ = generatedQuestions[activeQuestionIndex];
    if (!currentQ) return;

    const answer = userAnswers[currentQ.id];
    if (!answer || !answer.trim()) {
      showToast("Please provide or select an answer.");
      return;
    }

    setIsGradingAnswer(true);
    try {
      const res = await fetch('/api/grade-answer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          questionText: currentQ.questionText,
          userAnswer: answer,
          correctAnswer: currentQ.correctAnswer,
          questionType: currentQ.type,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to evaluate answer');

      setGradingResults((prev) => ({
        ...prev,
        [currentQ.id]: {
          isCorrect: data.isCorrect,
          feedback: data.feedback,
          graded: true,
        },
      }));

      if (data.isCorrect) {
        // 30 seconds multiplied by current work multiplier
        const rewardSeconds = Math.round(30 * currentMultiplier);
        setSecondsLeft((prev) => prev + rewardSeconds);
        playChime();
        showToast(`Correct! Earned +${rewardSeconds}s free relaxation time`);
      } else {
        showToast("Response reviewed");
      }
    } catch (err: any) {
      showToast(err.message || "Evaluation error");
    } finally {
      setIsGradingAnswer(false);
    }
  };

  // Quest claim handler
  const handleClaimQuest = (questId: string, rewardMins: number) => {
    if (claimedQuests.includes(questId)) return;
    setSecondsLeft((prev) => prev + rewardMins * 60);
    setClaimedQuests((prev) => [...prev, questId]);
    playChime();
  };

  const completedQuestsCount = QUESTS_LIST.filter((q) =>
    q.isCompleted(todayFocusSeconds, currentMultiplier, manualLogged)
  ).length;

  return (
    <div className="w-full bg-[#fafafa] text-[#111111] font-['Open_Sauce_Sans','Open_Sauce_One','Open_Sauce',sans-serif]">
      {/* Toast Notification */}
      <AnimatePresence>
        {toastMessage && (
          <motion.div
            initial={{ opacity: 0, y: -12, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.96 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            className="fixed top-6 left-1/2 -translate-x-1/2 z-50 bg-[#efeeea] text-[#111111] px-5 py-2 rounded-full text-[13px] font-normal border-none shadow-xs pointer-events-none"
          >
            {toastMessage}
          </motion.div>
        )}
      </AnimatePresence>

      {activeScreen ? (
        /* DEDICATED SEPARATE FULL SCREEN VIEW */
        <div className="h-screen max-h-screen w-full flex flex-col justify-between items-center select-none px-6 py-6 md:px-12 md:py-8 relative overflow-hidden">
          {/* Header */}
          <header className="w-full max-w-7xl flex justify-between items-center z-10 shrink-0">
            <button
              onClick={() => setActiveScreen(null)}
              className="text-[26px] font-bold lowercase tracking-normal text-[#111111] opacity-70 hover:opacity-100 transition-all cursor-pointer bg-transparent border-none p-0 outline-none"
            >
              fcus
            </button>

            <button
              onClick={() => setActiveScreen(null)}
              className="text-[16px] font-normal lowercase tracking-normal text-[#111111] opacity-50 hover:opacity-85 hover:scale-105 active:scale-95 transition-all duration-150 cursor-pointer bg-transparent border-none p-0 outline-none"
            >
              ← timer
            </button>
          </header>

          {/* Main Content Area */}
          <main className="w-full max-w-[500px] my-auto flex flex-col gap-5 z-10 text-[#111111] overflow-y-auto max-h-[calc(100vh-120px)] py-2 pr-1">
            <h2 className="text-[28px] md:text-[34px] font-normal lowercase tracking-tight opacity-80 text-left shrink-0">
              {activeScreen === 'settings' && 'settings'}
              {activeScreen === 'record' && 'record work time'}
              {activeScreen === 'questions' && 'answer questions'}
              {activeScreen === 'quests' && 'daily quests'}
              {activeScreen === 'you' && 'your statistics'}
              {activeScreen === 'streak' && 'streak progress'}
              {activeScreen === 'what_is_this' && 'what is this?'}
            </h2>

            <div className="w-full flex flex-col gap-5">
              {/* Screen 1: Settings */}
              {activeScreen === 'settings' && (
                <div className="flex flex-col gap-5 text-left">
                  <div className="flex justify-between items-center py-1 border-b border-[#111111]/10">
                    <span className="text-[15px] opacity-70">Sound Notifications</span>
                    <button
                      onClick={() => setSoundEnabled(!soundEnabled)}
                      className="text-[14px] opacity-75 hover:opacity-100 transition-all cursor-pointer bg-transparent border-none p-0 underline"
                    >
                      {soundEnabled ? 'Enabled' : 'Muted'}
                    </button>
                  </div>

                  <div className="flex justify-between items-center py-1 border-b border-[#111111]/10">
                    <span className="text-[15px] opacity-70">Base Multiplier</span>
                    <span className="text-[15px] opacity-80 font-normal">{formatMultiplier(baseMultiplier)}</span>
                  </div>

                  <div className="pt-2 flex justify-between items-center opacity-60">
                    <button
                      onClick={triggerResetFreeTime}
                      className="text-[13px] hover:opacity-100 transition-all underline cursor-pointer bg-transparent border-none p-0"
                    >
                      reset free time
                    </button>
                    <button
                      onClick={triggerClearAllData}
                      className="text-[13px] hover:opacity-100 transition-all underline cursor-pointer bg-transparent border-none p-0"
                    >
                      clear all data
                    </button>
                  </div>
                </div>
              )}

              {/* Screen 2: Record Work Time */}
              {activeScreen === 'record' && (
                <form onSubmit={handleEvaluateWorkActivity} className="flex flex-col gap-4 text-left">
                  <p className="text-[13px] opacity-60 leading-relaxed">
                    Describe offline study, coding, or reading sessions. The activity evaluator will determine focus time and calculate free relaxation time earned with your current {formatMultiplier(currentMultiplier)} multiplier.
                  </p>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-[12px] opacity-50">Work Activity Description</label>
                    <textarea
                      rows={3}
                      value={workDescription}
                      onChange={(e) => setWorkDescription(e.target.value)}
                      className="w-full bg-transparent border-b border-[#111111]/20 py-1.5 text-[15px] text-[#111111] opacity-90 outline-none focus:border-[#111111]/70 transition-all placeholder-[#111111]/30 resize-none"
                      placeholder="e.g., Read 3 chapters of biology textbook and took summary notes on cellular respiration for 45 minutes."
                      required
                    />
                  </div>

                  {evaluationFeedback && (
                    <div className="p-2.5 bg-[#dddcdc]/50 text-[12px] opacity-80 rounded-lg leading-relaxed">
                      {evaluationFeedback}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={isEvaluatingWork}
                    className="mt-1 text-left text-[15px] font-normal text-[#111111] opacity-80 hover:opacity-100 transition-all cursor-pointer bg-transparent border-none p-0 underline disabled:opacity-40"
                  >
                    {isEvaluatingWork ? 'Evaluating activity...' : 'Evaluate & Log Work →'}
                  </button>
                </form>
              )}

              {/* Screen 3: Answer Questions */}
              {activeScreen === 'questions' && (
                <div className="flex flex-col gap-4 text-left">
                  {generatedQuestions.length === 0 ? (
                    /* Setup Form to Generate Questions */
                    <form onSubmit={handleGenerateQuestions} className="flex flex-col gap-4">
                      <p className="text-[13px] opacity-60 leading-relaxed">
                        Input a topic, select difficulty, or upload study notes. Generate practice questions to test your knowledge and earn +30s free relaxation time (scaled by your current {formatMultiplier(currentMultiplier)} multiplier) per correct answer.
                      </p>

                      <div className="flex flex-col gap-1">
                        <label className="text-[12px] opacity-50">Topic or Subject</label>
                        <input
                          type="text"
                          value={questionTopic}
                          onChange={(e) => setQuestionTopic(e.target.value)}
                          className="w-full bg-transparent border-b border-[#111111]/20 py-1.5 text-[15px] text-[#111111] opacity-90 outline-none focus:border-[#111111]/70 transition-all placeholder-[#111111]/30"
                          placeholder="e.g. World History, Calculus, Python Data Structures"
                        />
                      </div>

                      <div className="flex justify-between gap-3">
                        <div className="flex flex-col gap-1 flex-1">
                          <label className="text-[12px] opacity-50">Level</label>
                          <select
                            value={questionDifficulty}
                            onChange={(e) => setQuestionDifficulty(e.target.value)}
                            className="bg-transparent border-b border-[#111111]/20 py-1.5 text-[14px] text-[#111111] opacity-90 outline-none focus:border-[#111111]/70 cursor-pointer"
                          >
                            <option value="Beginner">Beginner</option>
                            <option value="Intermediate">Intermediate</option>
                            <option value="Advanced">Advanced</option>
                            <option value="Expert">Expert</option>
                          </select>
                        </div>

                        <div className="flex flex-col gap-1 flex-1">
                          <label className="text-[12px] opacity-50">Question Count</label>
                          <select
                            value={questionCount}
                            onChange={(e) => setQuestionCount(Number(e.target.value))}
                            className="bg-transparent border-b border-[#111111]/20 py-1.5 text-[14px] text-[#111111] opacity-90 outline-none focus:border-[#111111]/70 cursor-pointer"
                          >
                            <option value={3}>3 Questions</option>
                            <option value={5}>5 Questions</option>
                            <option value={10}>10 Questions</option>
                          </select>
                        </div>
                      </div>

                      <div className="flex flex-col gap-1">
                        <div className="flex justify-between items-center">
                          <label className="text-[12px] opacity-50">Study Notes / Text Context (Optional)</label>
                          <label className="text-[11px] opacity-70 underline cursor-pointer hover:opacity-100">
                            Upload Text File
                            <input
                              type="file"
                              accept=".txt,.md,.js,.ts,.py,.json,.csv"
                              onChange={handleFileUpload}
                              className="hidden"
                            />
                          </label>
                        </div>
                        <textarea
                          rows={2}
                          value={questionMaterialText}
                          onChange={(e) => setQuestionMaterialText(e.target.value)}
                          placeholder="Paste study material, notes, or chapter excerpts here..."
                          className="w-full bg-transparent border-b border-[#111111]/20 py-1 text-[13px] text-[#111111] opacity-90 outline-none focus:border-[#111111]/70 transition-all resize-none placeholder-[#111111]/30"
                        />
                      </div>

                      <button
                        type="submit"
                        disabled={isGeneratingQuestions}
                        className="text-left text-[15px] font-normal text-[#111111] opacity-80 hover:opacity-100 transition-all cursor-pointer bg-transparent border-none p-0 underline disabled:opacity-40"
                      >
                        {isGeneratingQuestions ? 'Generating questions...' : 'Generate Questions →'}
                      </button>
                    </form>
                  ) : (
                    /* Active Question Solving View */
                    <div className="flex flex-col gap-4">
                      <div className="flex justify-between items-center text-[12px] opacity-50">
                        <span>Question {activeQuestionIndex + 1} of {generatedQuestions.length}</span>
                        <button
                          type="button"
                          onClick={() => setGeneratedQuestions([])}
                          className="underline cursor-pointer hover:opacity-100"
                        >
                          New topic ↻
                        </button>
                      </div>

                      {(() => {
                        const currentQ = generatedQuestions[activeQuestionIndex];
                        const userAns = userAnswers[currentQ.id] || '';
                        const result = gradingResults[currentQ.id];

                        return (
                          <form onSubmit={handleGradeCurrentQuestion} className="flex flex-col gap-4">
                            <p className="text-[16px] md:text-[17px] opacity-90 font-normal leading-snug">
                              {currentQ.questionText}
                            </p>

                            {currentQ.type === 'multiple_choice' && currentQ.options ? (
                              <div className="flex flex-col gap-2 py-1">
                                {currentQ.options.map((optionText, optIdx) => (
                                  <label
                                    key={optIdx}
                                    className={`flex items-start gap-2.5 text-[14px] opacity-85 cursor-pointer py-0.5 transition-all ${
                                      userAns === optionText ? 'font-medium opacity-100' : 'hover:opacity-100'
                                    }`}
                                  >
                                    <input
                                      type="radio"
                                      name={`question_${currentQ.id}`}
                                      value={optionText}
                                      checked={userAns === optionText}
                                      onChange={() => setUserAnswers((prev) => ({ ...prev, [currentQ.id]: optionText }))}
                                      className="mt-1 accent-[#111111] cursor-pointer"
                                      disabled={result?.graded}
                                    />
                                    <span>{optionText}</span>
                                  </label>
                                ))}
                              </div>
                            ) : (
                              <textarea
                                rows={2}
                                value={userAns}
                                onChange={(e) => setUserAnswers((prev) => ({ ...prev, [currentQ.id]: e.target.value }))}
                                placeholder="Type your answer or conceptual summary..."
                                className="w-full bg-transparent border-b border-[#111111]/20 py-1.5 text-[14px] text-[#111111] opacity-90 outline-none focus:border-[#111111]/70 transition-all resize-none placeholder-[#111111]/30"
                                disabled={result?.graded}
                                required
                              />
                            )}

                            {result && (
                              <div className="p-2.5 bg-[#dddcdc]/50 text-[12px] opacity-80 rounded-lg flex flex-col gap-1 leading-relaxed">
                                <span className="font-medium">
                                  {result.isCorrect ? '✓ Correct' : '✕ Needs Review'}
                                </span>
                                <span>{result.feedback}</span>
                              </div>
                            )}

                            <div className="flex justify-between items-center pt-1">
                              <div className="flex gap-4 text-[12px] opacity-60">
                                {activeQuestionIndex > 0 && (
                                  <button
                                    type="button"
                                    onClick={() => setActiveQuestionIndex((prev) => prev - 1)}
                                    className="hover:opacity-100 cursor-pointer bg-transparent border-none p-0"
                                  >
                                    ← Previous
                                  </button>
                                )}
                                {activeQuestionIndex < generatedQuestions.length - 1 && (
                                  <button
                                    type="button"
                                    onClick={() => setActiveQuestionIndex((prev) => prev + 1)}
                                    className="hover:opacity-100 cursor-pointer bg-transparent border-none p-0"
                                  >
                                    Next →
                                  </button>
                                )}
                              </div>

                              {!result?.graded && (
                                <button
                                  type="submit"
                                  disabled={isGradingAnswer}
                                  className="text-[14px] font-normal text-[#111111] opacity-80 hover:opacity-100 transition-all cursor-pointer bg-transparent border-none p-0 underline disabled:opacity-40"
                                >
                                  {isGradingAnswer ? 'Evaluating answer...' : 'Submit Answer →'}
                                </button>
                              )}
                            </div>
                          </form>
                        );
                      })()}
                    </div>
                  )}
                </div>
              )}

              {/* Screen 4: Quests */}
              {activeScreen === 'quests' && (
                <div className="flex flex-col gap-4 text-left">
                  <div className="flex justify-between items-center text-[12px] opacity-60">
                    <span>Daily Objectives</span>
                    <span>Refreshes Daily at Midnight</span>
                  </div>

                  <div className="flex flex-col gap-4 pt-1">
                    {QUESTS_LIST.map((q) => {
                      const completed = q.isCompleted(todayFocusSeconds, currentMultiplier, manualLogged);
                      const claimed = claimedQuests.includes(q.id);
                      const progress = q.getProgress(todayFocusSeconds, currentMultiplier, manualLogged);

                      return (
                        <div key={q.id} className="flex flex-col gap-2 py-1 border-b border-[#111111]/08 pb-3">
                          <div className="flex justify-between items-start gap-3">
                            <div className="flex flex-col gap-0.5">
                              <span className="text-[15px] opacity-85 font-normal">{q.title}</span>
                              <span className="text-[12px] opacity-50 leading-normal">{q.description}</span>
                            </div>

                            {claimed ? (
                              <span className="text-[12px] opacity-40 shrink-0">Claimed</span>
                            ) : completed ? (
                              <button
                                onClick={() => handleClaimQuest(q.id, q.rewardMinutes)}
                                className="text-[13px] opacity-85 hover:opacity-100 transition-all underline cursor-pointer bg-transparent border-none p-0 shrink-0 font-medium"
                              >
                                Claim +{q.rewardMinutes}m
                              </button>
                            ) : (
                              <span className="text-[12px] opacity-40 shrink-0">In Progress</span>
                            )}
                          </div>

                          {/* Progress Line */}
                          <div className="flex flex-col gap-1">
                            <div className="w-full h-1.5 bg-[#111111]/10 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-[#111111] opacity-75 transition-all duration-300"
                                style={{ width: `${Math.round(progress.ratio * 100)}%` }}
                              />
                            </div>
                            <span className="text-[11px] opacity-50 text-right">{progress.label}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Screen 5: You (Statistics) */}
              {activeScreen === 'you' && (
                <div className="flex flex-col gap-6 text-left">
                  <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                    <div className="flex flex-col gap-0.5">
                      <span className="text-[11px] opacity-50 lowercase">total work time</span>
                      <span className="text-[22px] opacity-85 font-normal">{formatEarnedTime(workSeconds)}</span>
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <span className="text-[11px] opacity-50 lowercase">current streak</span>
                      <span className="text-[22px] opacity-85 font-normal">{streak} days</span>
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <span className="text-[11px] opacity-50 lowercase">free time balance</span>
                      <span className="text-[22px] opacity-85 font-normal">{formatEarnedTime(secondsLeft)}</span>
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <span className="text-[11px] opacity-50 lowercase">current multiplier</span>
                      <span className="text-[22px] opacity-85 font-normal">{formatMultiplier(currentMultiplier)}</span>
                    </div>
                  </div>

                  <div className="flex flex-col gap-1.5 pt-1 border-t border-[#111111]/10">
                    <span className="text-[12px] opacity-60 font-normal">Multiplier Breakdown</span>
                    <div className="text-[12px] opacity-50 flex justify-between">
                      <span>Base (Streak bonus):</span>
                      <span>{formatMultiplier(baseMultiplier)}</span>
                    </div>
                    <div className="text-[12px] opacity-50 flex justify-between">
                      <span>Session duration bonus:</span>
                      <span>+{formatMultiplier(sessionBonus)}</span>
                    </div>
                  </div>

                  <div className="flex flex-col gap-2 pt-2 border-t border-[#111111]/10">
                    <span className="text-[12px] opacity-60 font-normal">Account & Cloud Data</span>
                    {currentUser ? (
                      <div className="flex flex-col gap-1.5 text-[12px] opacity-80">
                        <div className="flex justify-between items-center">
                          <span className="opacity-60">Signed in as</span>
                          <span className="font-medium truncate max-w-[210px]">{currentUser.email || currentUser.displayName || 'User'}</span>
                        </div>
                        <div className="flex gap-4 pt-1 opacity-75">
                          <button
                            onClick={handleSignOut}
                            className="text-[12px] hover:opacity-100 transition-all underline cursor-pointer bg-transparent border-none p-0 text-[#111111]"
                          >
                            sign out
                          </button>
                          <button
                            onClick={triggerDeleteAccount}
                            className="text-[12px] hover:opacity-100 transition-all underline cursor-pointer bg-transparent border-none p-0 text-[#111111]"
                          >
                            delete account
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex justify-between items-center pt-0.5">
                        <span className="text-[12px] opacity-50">Sync stats across devices</span>
                        <button
                          onClick={() => setShowAuthModal(true)}
                          className="text-[12px] opacity-80 hover:opacity-100 transition-all underline cursor-pointer bg-transparent border-none p-0 font-medium"
                        >
                          sign in
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Screen 6: Streak */}
              {activeScreen === 'streak' && (
                <div className="flex flex-col gap-5 text-left">
                  <div className="flex items-center gap-3">
                    <div className="text-[#111111] opacity-80">
                      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 3z" />
                      </svg>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[24px] font-normal opacity-85 leading-tight">{streak} Day Streak</span>
                      <span className="text-[12px] opacity-50">Focus 30 mins each day to build your streak</span>
                    </div>
                  </div>

                  <div className="flex flex-col gap-1.5 pt-1">
                    <div className="flex justify-between text-[12px] opacity-60">
                      <span>Today's Progress</span>
                      <span>{Math.min(30, Math.floor(todayFocusSeconds / 60))}/30 mins</span>
                    </div>
                    <div className="w-full h-1.5 bg-[#111111]/10 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-[#111111] opacity-75 transition-all duration-300"
                        style={{ width: `${Math.min(100, (todayFocusSeconds / 1800) * 100)}%` }}
                      />
                    </div>
                  </div>

                  <p className="text-[12px] opacity-50 leading-relaxed">
                    Each day you maintain your streak, your base multiplier increases by +0.05x (capped at +0.5x for 10 days).
                  </p>
                </div>
              )}

              {/* Screen 7: What is this? */}
              {activeScreen === 'what_is_this' && (
                <div className="flex flex-col gap-5 text-left text-[#111111]">
                  <p className="text-[13px] opacity-70 leading-relaxed">
                    <strong className="font-medium opacity-90">fcus</strong> is a minimalist productivity & relaxation balance app built to help you stay focused without burning out.
                  </p>

                  <div className="flex flex-col gap-3.5">
                    <div className="flex flex-col gap-1 py-1.5 border-b border-[#111111]/08">
                      <h3 className="text-[14px] font-medium opacity-85 lowercase">1. earn relaxation time</h3>
                      <p className="text-[12px] opacity-60 leading-relaxed">
                        Switch to <strong className="font-medium opacity-75">Work Mode</strong> and lock in. At the standard rate (1x), you earn 1 minute of free time for every 5 minutes focused. The longer you focus without stopping, the higher your session multiplier grows (up to 2.5x with up to +1.5x bonus), accumulating free relaxation time faster.
                      </p>
                    </div>

                    <div className="flex flex-col gap-1 py-1.5 border-b border-[#111111]/08">
                      <h3 className="text-[14px] font-medium opacity-85 lowercase">2. record productive work</h3>
                      <p className="text-[12px] opacity-60 leading-relaxed">
                        Completed productive work offline or elsewhere? Describe what you accomplished in <strong className="font-medium opacity-75">Record Work Time</strong> to get evaluated and credited with earned relaxation time.
                      </p>
                    </div>

                    <div className="flex flex-col gap-1 py-1.5 border-b border-[#111111]/08">
                      <h3 className="text-[14px] font-medium opacity-85 lowercase">3. test your knowledge</h3>
                      <p className="text-[12px] opacity-60 leading-relaxed">
                        Generate practice questions on any topic in <strong className="font-medium opacity-75">Answer Questions</strong>. Solve them correctly to earn bonus relaxation minutes.
                      </p>
                    </div>

                    <div className="flex flex-col gap-1 py-1.5 border-b border-[#111111]/08">
                      <h3 className="text-[14px] font-medium opacity-85 lowercase">4. enjoy guilt-free breaks</h3>
                      <p className="text-[12px] opacity-60 leading-relaxed">
                        Switch to <strong className="font-medium opacity-75">Relax Mode</strong> to spend your earned balance. When your free time runs out, it's time to lock back in!
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </main>

          <footer className="w-full h-4 pointer-events-none shrink-0" />
        </div>
      ) : (
        /* MAIN TIMER & BENTO GRID SCREEN */
        <>
          {/* SECTION 1: TIMER PAGE */}
          <section className="min-h-screen w-full flex flex-col justify-between items-center select-none px-8 py-10 md:px-16 md:py-14 relative overflow-hidden">
            {/* Top Header Bar */}
            <header className="w-full max-w-7xl flex justify-between items-center z-10">
              <button
                onClick={() => setActiveScreen('settings')}
                className="text-[18px] font-normal lowercase tracking-normal text-[#111111] opacity-50 hover:opacity-85 hover:scale-105 active:scale-95 transition-all duration-200 select-none cursor-pointer bg-transparent border-none p-0 outline-none"
                id="settings-text"
              >
                settings
              </button>

              <h1
                className="text-[28px] font-bold lowercase tracking-normal text-[#111111] opacity-70 select-none"
                id="logo-title"
              >
                fcus
              </h1>

              <button
                onClick={toggleMode}
                className="text-[18px] font-normal lowercase tracking-normal text-[#111111] opacity-50 hover:opacity-85 hover:scale-105 active:scale-95 transition-all duration-200 select-none cursor-pointer bg-transparent border-none p-0 outline-none"
                id="work-text"
                title="Click to switch between work & relax"
              >
                {mode}
              </button>
            </header>

            {/* Main Display Area */}
            <main className="flex flex-col items-center justify-center my-auto text-center z-10 gap-4 max-w-2xl px-4">
              {mode === 'relax' ? (
                <>
                  {/* Subtitle */}
                  <p
                    className="text-[35.1px] font-normal lowercase tracking-normal text-[#111111] opacity-75 leading-none select-none"
                    id="timer-subtitle"
                  >
                    free time remaining
                  </p>

                  {/* Timer Digits */}
                  <div
                    className="text-[76.7px] font-normal tracking-tight text-[#111111] opacity-85 leading-none select-none"
                    id="timer-display"
                  >
                    {formatTime(secondsLeft)}
                  </div>
                </>
              ) : (
                <>
                  {/* Subtitle for Work Mode */}
                  <p
                    className="text-[35.1px] font-normal lowercase tracking-normal text-[#111111] opacity-75 leading-none select-none"
                    id="timer-subtitle"
                  >
                    locking in on work
                  </p>

                  {/* Work Timer Digits */}
                  <div
                    className="text-[76.7px] font-normal tracking-tight text-[#111111] opacity-85 leading-none select-none"
                    id="timer-display"
                  >
                    {formatTime(workSeconds)}
                  </div>

                  {/* Earned Free Time & Multiplier Tracker */}
                  <p className="text-[16px] md:text-[18px] font-normal text-[#111111] opacity-60 lowercase tracking-normal leading-none select-none">
                    earned: {formatEarnedTime(sessionEarnedSeconds)} | multiplier {formatMultiplier(currentMultiplier)}
                  </p>
                </>
              )}

              {/* Minimal Control Button */}
              <button
                onClick={togglePlay}
                className="w-[44px] h-[44px] rounded-full border border-[#111111] opacity-60 hover:opacity-100 hover:scale-105 active:scale-95 transition-all duration-200 flex items-center justify-center cursor-pointer bg-transparent outline-none"
                aria-label={isRunning ? 'Pause' : 'Start'}
                title={isRunning ? 'Pause' : 'Start'}
                id="timer-control-btn"
              >
                {isRunning ? (
                  // Minimal Pause Icon (||)
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" className="text-[#111111]">
                    <rect x="6.5" y="4" width="3" height="16" rx="0.5" />
                    <rect x="14.5" y="4" width="3" height="16" rx="0.5" />
                  </svg>
                ) : (
                  // Minimal Play Icon (▶)
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" className="text-[#111111] translate-x-[1px]">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                )}
              </button>
            </main>

            {/* Bottom spacer / What is this link right at the bottom of the fold */}
            <footer className="w-full py-2 flex justify-center items-center z-10 shrink-0">
              <button
                type="button"
                onClick={() => setActiveScreen('what_is_this')}
                className="text-[12px] font-normal underline text-[#111111] opacity-40 hover:opacity-80 transition-all cursor-pointer bg-transparent border-none p-0 outline-none"
              >
                what is this?
              </button>
            </footer>
          </section>

          {/* SECTION 2: BENTO GRID PAGE */}
          <section className="min-h-screen w-full flex flex-col items-center justify-center py-12 px-6 sm:px-12 md:px-16 bg-[#fafafa] select-none relative">
            <div className="w-full max-w-[1100px] grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch relative">
              
              {/* Left Column Group (8 of 12 cols) */}
              <div className="lg:col-span-8 flex flex-col gap-5 justify-between">
                
                {/* Top Row: Box 1 & Box 2 */}
                <div className="grid grid-cols-1 sm:grid-cols-12 gap-5">
                  
                  {/* Box 1: Record your own work time */}
                  <div
                    onClick={() => setActiveScreen('record')}
                    className="sm:col-span-5 bg-[#dddcdc] rounded-[28px] p-7 h-[220px] relative overflow-hidden flex flex-col justify-start hover:scale-105 active:scale-95 transition-all duration-300 ease-out cursor-pointer hover:shadow-sm"
                    id="bento-box-1"
                  >
                    <div className="flex flex-col items-start text-left relative z-20 max-w-[200px] space-y-2">
                      <h2 className="text-[24px] font-normal leading-[1.15] text-[#111111] opacity-70">
                        Record your own work time
                      </h2>

                      <p className="text-[12px] font-normal leading-[1.3] text-[#111111] opacity-60">
                        Record anything productive you've done and you'll get time to relax for it
                      </p>
                    </div>
                  </div>

                  {/* Box 2: Answer questions */}
                  <div
                    onClick={() => setActiveScreen('questions')}
                    className="sm:col-span-7 bg-[#dddcdc] rounded-[28px] p-7 h-[220px] relative overflow-hidden flex flex-col justify-between hover:scale-105 active:scale-95 transition-all duration-300 ease-out cursor-pointer hover:shadow-sm"
                    id="bento-box-2"
                  >
                    <h2 className="text-[24px] font-normal leading-[1.15] text-[#111111] opacity-70 relative z-20 max-w-[160px] text-left">
                      Answer questions
                    </h2>

                    <p className="text-[12px] font-normal leading-[1.3] text-[#111111] opacity-60 text-right relative z-20 self-end max-w-[185px]">
                      Answer generated questions to prep for anything for relaxation time
                    </p>
                  </div>
                </div>

                {/* Bottom Row: Box 4 & Box 5 */}
                <div className="grid grid-cols-1 sm:grid-cols-12 gap-5">
                  
                  {/* Box 4: Work timer */}
                  <div
                    onClick={() => {
                      setMode('work');
                      setIsRunning(true);
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                    className="sm:col-span-7 bg-[#dddcdc] rounded-[28px] p-7 h-[220px] relative overflow-hidden flex flex-col items-end justify-start text-right hover:scale-105 active:scale-95 transition-all duration-300 ease-out cursor-pointer hover:shadow-sm"
                    id="bento-box-4"
                  >
                    <div className="flex flex-col items-end text-right relative z-20 max-w-[210px] space-y-2">
                      <h2 className="text-[24px] font-normal leading-[1.15] text-[#111111] opacity-70">
                        Work timer
                      </h2>

                      <p className="text-[12px] font-normal leading-[1.3] text-[#111111] opacity-60">
                        Use a customizable work timer to finish up any leftover things while racking up multipliers
                      </p>
                    </div>
                  </div>

                  {/* Box 5: Quests */}
                  <div
                    onClick={() => setActiveScreen('quests')}
                    className="sm:col-span-5 bg-[#dddcdc] rounded-[28px] p-7 h-[220px] relative overflow-hidden flex flex-col items-end justify-start text-right hover:scale-105 active:scale-95 transition-all duration-300 ease-out cursor-pointer hover:shadow-sm"
                    id="bento-box-5"
                  >
                    <div className="flex flex-col items-end text-right relative z-20 space-y-1.5 max-w-[180px]">
                      <h2 className="text-[24px] font-normal leading-[1.15] text-[#111111] opacity-70">
                        Quests
                      </h2>

                      <p className="text-[12px] font-normal leading-[1.3] text-[#111111] opacity-60">
                        Complete objectives and goals to gain bonuses and extra time
                      </p>
                      
                      <span className="text-[12px] font-normal text-[#111111] opacity-70 pt-0.5">
                        {completedQuestsCount}/3 completed
                      </span>
                    </div>
                  </div>
                </div>

              </div>

              {/* Right Column Group (4 of 12 cols) */}
              <div className="lg:col-span-4 flex flex-col gap-5 h-full justify-between">
                
                {/* Box 3: You (Upper Right) */}
                <div
                  onClick={() => setActiveScreen('you')}
                  className="bg-[#dddcdc] rounded-[28px] p-7 flex-1 min-h-[300px] relative overflow-hidden flex flex-col justify-start items-end text-right hover:scale-105 active:scale-95 transition-all duration-300 ease-out cursor-pointer hover:shadow-sm"
                  id="bento-box-3"
                >
                  <div className="flex flex-col items-end text-right relative z-20 max-w-[160px] space-y-2">
                    <h2 className="text-[24px] font-normal leading-[1.15] text-[#111111] opacity-70">
                      You
                    </h2>

                    <p className="text-[12px] font-normal leading-[1.3] text-[#111111] opacity-60">
                      Track your progress, accomplishments, stats and change settings
                    </p>
                  </div>
                </div>

                {/* Box 6: Streak */}
                <div
                  onClick={() => setActiveScreen('streak')}
                  className="bg-[#dddcdc] rounded-[28px] p-7 h-[140px] relative overflow-hidden flex items-center justify-center hover:scale-105 active:scale-95 transition-all duration-300 ease-out cursor-pointer hover:shadow-sm"
                  id="bento-box-6"
                >
                  <div className="flex items-center justify-center gap-2.5 text-[#111111] opacity-70">
                    <svg
                      width="26"
                      height="26"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="w-6 h-6 shrink-0"
                    >
                      <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 3z" />
                    </svg>
                    <h2 className="text-[24px] font-normal leading-none select-none">
                      Streak {streak}
                    </h2>
                  </div>
                </div>

              </div>

            </div>
          </section>
        </>
      )}

      {/* Auth Modal */}
      <AnimatePresence>
        {showAuthModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
            className="fixed inset-0 z-50 bg-[#111111]/10 backdrop-blur-[2px] flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 6 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 6 }}
              transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
              className="w-full max-w-[350px] bg-[#fafafa] rounded-2xl p-6 flex flex-col gap-4 text-left text-[#111111]"
            >
              <div className="flex justify-between items-center">
                <h3 className="text-[17px] font-normal lowercase opacity-80">
                  {authIsSignUp ? 'create account' : 'sign in'}
                </h3>
                <button
                  onClick={() => {
                    setShowAuthModal(false);
                    setAuthError(null);
                  }}
                  className="text-[15px] opacity-35 hover:opacity-75 transition-all cursor-pointer bg-transparent border-none p-0"
                >
                  ✕
                </button>
              </div>

              <button
                type="button"
                onClick={handleGoogleSignIn}
                disabled={isSubmittingAuth}
                className="w-full py-2.5 px-4 rounded-xl bg-[#f2f1ec] hover:bg-[#ebe9e2] text-[13px] text-[#111111] opacity-85 hover:opacity-100 transition-all cursor-pointer font-medium flex items-center justify-center gap-2.5 border-none"
              >
                <svg width="15" height="15" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"/>
                  <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.15C3.26 21.3 7.31 24 12 24z"/>
                  <path fill="#FBBC05" d="M5.28 14.24c-.25-.72-.38-1.49-.38-2.24s.13-1.52.38-2.24V6.61H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.39l3.99-3.15z"/>
                  <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.61l3.99 3.15c.95-2.85 3.6-4.96 6.72-4.96z"/>
                </svg>
                Continue with Google
              </button>

              <div className="flex items-center gap-3 opacity-25 text-[11px] my-0.5">
                <div className="h-[1px] bg-[#111111]/08 flex-1" />
                <span>or email</span>
                <div className="h-[1px] bg-[#111111]/08 flex-1" />
              </div>

              <form onSubmit={handleEmailAuth} className="flex flex-col gap-3.5">
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] opacity-45">Email Address</label>
                  <input
                    type="email"
                    required
                    value={authEmail}
                    onChange={(e) => setAuthEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="w-full bg-transparent border-b border-[#111111]/10 py-1 text-[13px] text-[#111111] opacity-90 outline-none focus:border-[#111111]/30 transition-all placeholder-[#111111]/25"
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-[11px] opacity-45">Password</label>
                  <input
                    type="password"
                    required
                    value={authPassword}
                    onChange={(e) => setAuthPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full bg-transparent border-b border-[#111111]/10 py-1 text-[13px] text-[#111111] opacity-90 outline-none focus:border-[#111111]/30 transition-all placeholder-[#111111]/25"
                  />
                </div>

                {authError && (
                  <p className="text-[12px] text-red-600 opacity-80 pt-0.5 leading-snug">{authError}</p>
                )}

                <button
                  type="submit"
                  disabled={isSubmittingAuth}
                  className="mt-1 text-left text-[13px] font-normal text-[#111111] opacity-75 hover:opacity-100 transition-all cursor-pointer underline disabled:opacity-40"
                >
                  {isSubmittingAuth ? 'Processing...' : authIsSignUp ? 'Create Account →' : 'Sign In →'}
                </button>
              </form>

              <div className="pt-1 text-[11px] opacity-50 flex justify-between">
                <span>{authIsSignUp ? 'Already have an account?' : 'Need an account?'}</span>
                <button
                  type="button"
                  onClick={() => {
                    setAuthIsSignUp(!authIsSignUp);
                    setAuthError(null);
                  }}
                  className="underline cursor-pointer hover:opacity-100 bg-transparent border-none p-0 text-[#111111]"
                >
                  {authIsSignUp ? 'Sign in' : 'Create account'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Confirmation Modal for Reset Time / Clear Data / Delete Account */}
      <AnimatePresence>
        {confirmModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
            className="fixed inset-0 z-50 bg-[#111111]/10 backdrop-blur-[2px] flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 6 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 6 }}
              transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
              className="w-full max-w-[340px] bg-[#fafafa] rounded-2xl p-6 flex flex-col gap-4 text-left text-[#111111]"
            >
              <h3 className="text-[16px] font-normal lowercase opacity-85">
                {confirmModal.title}
              </h3>
              <p className="text-[13px] opacity-60 leading-relaxed">
                {confirmModal.description}
              </p>
              <div className="flex justify-end items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setConfirmModal(null)}
                  className="text-[12px] opacity-50 hover:opacity-90 transition-all cursor-pointer underline bg-transparent border-none p-0"
                >
                  cancel
                </button>
                <button
                  type="button"
                  onClick={executeConfirmedAction}
                  className="px-3.5 py-1.5 rounded-lg bg-[#111111]/90 hover:bg-[#111111] text-[#fafafa] text-[12px] font-medium transition-all cursor-pointer border-none"
                >
                  {confirmModal.actionLabel}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
