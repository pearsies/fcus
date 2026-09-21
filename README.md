# fcus — Minimalist Focus & Relaxation Timer

A minimalist, high-contrast focus timer designed around positive reinforcement: **working earns you relaxation time**. As you work, you build continuous focus streaks and multipliers that reward you with free time to spend guilt-free.

Live demo @ fcusapp.ai.studio
---

## ✨ Features

- ⏳ **Focus/Relax Modes**:
  - **Work Mode**: Focus on your tasks while banking earned free time (default rate: 5 minutes of work earns 1 minute of relaxation).
  - **Relax Mode**: Enjoy earned downtime with a clean countdown timer.
- 🔥 **Multipliers & Streaks**:
  - Earn consecutive session bonuses up to 2.5x.
  - Track your daily 30-minute focus streak with automatic progress tracking.
- 🎯 **Daily Quests**:
  - Complete daily focus objectives (e.g. 30m focus, reaching 1.25x multiplier, logging activities) to earn bonus relaxation minutes.
- 🧠 **AI Recall + Work Logger**:
  - Practice questions generated on-demand by Gemini AI from topics or uploaded study notes.
  - Describe offline work activities to have AI evaluate and award earned free time.
- ☁️ **Cloud Sync & Guest Mode**:
  - Full cloud persistence powered by **Firebase Authentication** (Google Sign-In & Email) and **Cloud Firestore**.
  - Runs completely offline using local state and memory cache if Firebase credentials are not provided.
- 🎨 **Minimalist Design & Audio**:
  - UI/UX minimalist design BY MEEEEEEEEEEE 
  - Built-in sound chimes when sessions finish or milestones are achieved.

---

## 🛠️ Tech Stack

- **Frontend**: [React 19](https://react.dev/), [TypeScript](https://www.typescriptlang.org/), [Vite](https://vite.dev/)
- **Styling**: [Tailwind CSS v4](https://tailwindcss.com/)
- **Animations**: [Motion](https://motion.dev/)
- **Backend Proxy**: [Express](https://expressjs.com/) with TypeScript execution via `tsx`
- **AI**: [@google/genai](https://www.npmjs.com/package/@google/genai) (Gemini 3.1 Flash Lite)
- **Database & Auth**: [Firebase](https://firebase.google.com/) (Auth, Cloud Firestore)

---

## 🚀 Quick Start

### 1. Prerequisites

- [Node.js](https://nodejs.org/) (version 18 or higher)
- `npm` or `bun`

### 2. Clone and Install

```bash
git clone https://github.com/your-username/fcus.git
cd fcus
npm install
```

### 3. Run Locally (Guest Mode)

You can launch the app immediately without configuring any external services. It will run in local guest mode:

```bash
npm run dev
```

Open your browser at `http://localhost:3000`.

---

## 🔐 Setting Up Firebase (Optional — for Cloud Sync & Auth)

To enable user accounts (Google Sign-In, Email/Password) and cross-device stats synchronization, connect a free Firebase project:

### Step 1: Create a Firebase Project
1. Navigate to the [Firebase Console](https://console.firebase.google.com/).
2. Click **Add project** and name it (e.g. `fcus-timer`).

### Step 2: Enable Authentication Providers
1. In your Firebase project sidebar, go to **Build > Authentication**.
2. Click **Get Started**.
3. Under the **Sign-in method** tab, enable:
   - **Google** (configure project support email).
   - **Email/Password**.

### Step 3: Enable Cloud Firestore
1. In the sidebar, go to **Build > Firestore Database**.
2. Click **Create database**, select a location close to your users, and choose **Start in production mode**.

### Step 4: Configure Environment Variables
Copy `.env.example` to create your local `.env` file:

```bash
cp .env.example .env
```

Go to your Firebase project's **Project settings** (gear icon) > **General** > **Your apps** > click the web icon (`</>`) to register a web app. Copy the configuration values into `.env`:

```env
VITE_FIREBASE_API_KEY=AIzaSy...
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project
VITE_FIREBASE_STORAGE_BUCKET=your-project.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=1234567890
VITE_FIREBASE_APP_ID=1:1234567890:web:abcdef123456
```

### Step 5: Deploy Security Rules
This repository includes a tested [`firestore.rules`](./firestore.rules) file restricting user documents strictly to the authenticated user. Deploy them using the Firebase CLI:

```bash
# Login to Firebase
npx firebase login

# Select your project
npx firebase use --add your-project-id

# Deploy only the Firestore rules
npx firebase deploy --only firestore:rules
```

---

## 🤖 Setting Up Gemini AI (Optional — for AI Questions & Work Evaluator)

To use the AI practice questions and smart work evaluator:

1. Get a free API key from [Google AI Studio](https://aistudio.google.com/app/apikey).
2. Add it to your `.env` file:
   ```env
   GEMINI_API_KEY=your_gemini_api_key_here
   ```

---

## 📜 Available Scripts

| Script | Command | Description |
| :--- | :--- | :--- |
| **Development** | `npm run dev` | Boots the Express server with Vite middleware on port 3000 |
| **Typecheck** | `npm run lint` | Runs `tsc --noEmit` to validate all TypeScript types |
| **Build** | `npm run build` | Builds the Vite client SPA and compiles `server.ts` with esbuild |
| **Production Start** | `npm start` | Launches the bundled production server from `dist/server.cjs` |

---

## 🔒 Security & Firestore Rules

Client-side Firebase configuration values (API keys, project ID) are public identifiers and safe to commit in open source. Security is strictly enforced on the database layer via **Firestore Security Rules**:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId} {
      allow read, write, delete: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

This guarantees that:
- Unauthenticated requests cannot read or write user data.
- Authenticated users can only read, write, and delete their own statistics document (`/users/{userId}`).

---

## 📄 License

This project is licensed under the [MIT License](./LICENSE). Feel free to fork, adapt, and build upon it!
