# fcus — minimalist focus & relaxation timer

<p align="center">
  <img src="https://res.cloudinary.com/dvskffcq3/image/upload/v1789998285/Screenshot_2026-09-21_at_20.44.37_esv40y.png" alt="fcus preview" width="620" style="border-radius: 12px; border: 1px solid rgba(0,0,0,0.08); box-shadow: 0 8px 30px rgba(0,0,0,0.04); max-width: 100%; height: auto;" />
</p>

a quiet, minimalist focus timer built around positive reinforcement: **working earns you relaxation time**. as you work, you gently build streaks and multipliers that reward you with guilt-free downtime.

live demo @ [fcusapp.ai.studio](https://fcusapp.ai.studio)

---

## ✨ features

- ⏳ **focus & relax modes**:
  - **work mode**: focus on your tasks while banking earned free time (5 minutes of work earns 1 minute of relaxation).
  - **relax mode**: enjoy earned downtime with a calm countdown timer.
- 🔥 **multipliers & streaks**:
  - earn consecutive session bonuses up to 2.5x.
  - track your daily 30-minute focus streak with gentle progress indicators.
- 🎯 **daily quests**:
  - light daily objectives to keep you motivated and earn bonus relaxation minutes.
- 🧠 **ai recall + work logger**:
  - practice questions generated on-demand by gemini ai from topics or uploaded study notes.
  - log offline work activities to have ai evaluate and bank earned free time.
- ☁️ **cloud sync & guest mode**:
  - cloud persistence with firebase auth (google sign-in & email) and firestore.
  - works completely offline in guest mode right out of the box.
- 🎨 **cozy minimalist design & sound**:
  - minimalist ui/ux designed with love.
  - soft chimes when sessions finish or milestones are reached.

---

## 🛠️ tech stack

- **frontend**: [react 19](https://react.dev/), [typescript](https://www.typescriptlang.org/), [vite](https://vite.dev/)
- **styling**: [tailwind css v4](https://tailwindcss.com/)
- **animations**: [motion](https://motion.dev/)
- **backend proxy**: [express](https://expressjs.com/) with typescript via `tsx`
- **ai**: [@google/genai](https://www.npmjs.com/package/@google/genai) (gemini 3.1 flash lite)
- **database & auth**: [firebase](https://firebase.google.com/) (auth, cloud firestore)

---

## 🚀 quick start

### 1. clone and install

```bash
git clone https://github.com/your-username/fcus.git
cd fcus
npm install
```

### 2. run locally (guest mode)

you can run the app immediately without configuring any services. it starts right away in local guest mode:

```bash
npm run dev
```

open `http://localhost:3000` in your browser.

---

## 🔐 setting up firebase (optional)

if you want cloud sync and user accounts across devices:

1. create a project at [firebase console](https://console.firebase.google.com/).
2. under **build > authentication**, enable google and email/password.
3. under **build > firestore database**, create a database in production mode.
4. copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```
5. paste your web app credentials into `.env`:
   ```env
   VITE_FIREBASE_API_KEY=your_api_key
   VITE_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
   VITE_FIREBASE_PROJECT_ID=your_project_id
   VITE_FIREBASE_STORAGE_BUCKET=your_project.firebasestorage.app
   VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
   VITE_FIREBASE_APP_ID=your_app_id
   ```
6. deploy firestore security rules:
   ```bash
   npx firebase login
   npx firebase use --add your-project-id
   npx firebase deploy --only firestore:rules
   ```

---

## 🤖 setting up gemini ai (optional)

for active recall questions and the work evaluator:

1. grab a free api key from [google ai studio](https://aistudio.google.com/app/apikey).
2. add it to `.env`:
   ```env
   GEMINI_API_KEY=your_gemini_api_key_here
   ```

---

## 📜 scripts

| script | command | description |
| :--- | :--- | :--- |
| **development** | `npm run dev` | start dev server on port 3000 |
| **typecheck** | `npm run lint` | check typescript types |
| **build** | `npm run build` | bundle app and server for production |
| **start** | `npm start` | start production server |

---

## 🔒 security & rules

client-side firebase keys identify your project publicly. data protection is enforced directly in `firestore.rules`:

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

authenticated users can only read and write their own data (`/users/{userId}`).

---

## 📄 license

mit license. made with care — feel free to use and adapt!
