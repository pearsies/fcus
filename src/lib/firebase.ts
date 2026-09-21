import { initializeApp, getApps, getApp } from 'firebase/app';
import { 
  getAuth, 
  GoogleAuthProvider, 
  signInWithPopup, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signOut as firebaseSignOut, 
  deleteUser, 
  onAuthStateChanged,
  browserLocalPersistence,
  setPersistence,
  User 
} from 'firebase/auth';
import { 
  initializeFirestore,
  memoryLocalCache,
  doc, 
  getDoc, 
  setDoc, 
  deleteDoc 
} from 'firebase/firestore';
interface FirebaseConfigShape {
  apiKey?: string;
  authDomain?: string;
  projectId?: string;
  storageBucket?: string;
  messagingSenderId?: string;
  appId?: string;
  firestoreDatabaseId?: string;
  oAuthClientId?: string;
  [key: string]: any;
}

// Support optional firebase-applet-config.json (present in AI Studio) without breaking builds when cloned externally
const appletConfigs = import.meta.glob<{ default: FirebaseConfigShape }>('/firebase-applet-config.json', { eager: true });
const rawAppletConfig: FirebaseConfigShape = appletConfigs['/firebase-applet-config.json']?.default || {};

// Read from Vite environment variables first (Open Source standard), fallback to applet config
const resolvedConfig: FirebaseConfigShape = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || rawAppletConfig.apiKey || '',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || rawAppletConfig.authDomain || '',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || rawAppletConfig.projectId || '',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || rawAppletConfig.storageBucket || '',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || rawAppletConfig.messagingSenderId || '',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || rawAppletConfig.appId || '',
  firestoreDatabaseId: import.meta.env.VITE_FIREBASE_DATABASE_ID || rawAppletConfig.firestoreDatabaseId || '',
};

export const isFirebaseConfigured = Boolean(
  resolvedConfig.apiKey &&
  resolvedConfig.projectId &&
  resolvedConfig.apiKey !== 'your-api-key-here' &&
  resolvedConfig.projectId !== 'your-project-id'
);

// Fallback config so app initializes without crashing when running in guest/offline mode without keys
const activeConfig: FirebaseConfigShape = isFirebaseConfigured
  ? resolvedConfig
  : {
      apiKey: 'demo-api-key-placeholder',
      authDomain: 'demo-project.firebaseapp.com',
      projectId: 'demo-project',
      appId: '1:1234567890:web:demoapp',
    };

const app = getApps().length > 0 ? getApp() : initializeApp(activeConfig);

export const auth = getAuth(app);

// Explicitly ensure persistence uses browserLocalPersistence
if (isFirebaseConfigured) {
  setPersistence(auth, browserLocalPersistence).catch((err) => {
    console.warn('Auth persistence initialization:', err);
  });
}

export const googleProvider = new GoogleAuthProvider();

// Custom database ID support
const dbId = activeConfig.firestoreDatabaseId && activeConfig.firestoreDatabaseId !== '(default)'
  ? activeConfig.firestoreDatabaseId 
  : undefined;

// Use memoryLocalCache to prevent IndexedDB connection close/hidden errors when popups or visibility change during sign in
export const db = initializeFirestore(app, {
  localCache: memoryLocalCache(),
}, dbId);

export interface UserStatsDoc {
  uid: string;
  email?: string | null;
  displayName?: string | null;
  secondsLeft: number;
  workSeconds: number;
  streak: number;
  todayFocusSeconds: number;
  todayCredited: boolean;
  manualLogged: boolean;
  claimedQuests: string[];
  lastDate: string;
  updatedAt: string;
}

export { 
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
  type User 
};
