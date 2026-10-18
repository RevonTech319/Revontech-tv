import { initializeApp, getApp, getApps } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getDatabase } from "firebase/database";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

// Simple check to prevent crash if keys are missing
const isConfigValid = firebaseConfig.apiKey && firebaseConfig.apiKey !== "";

let app;
if (isConfigValid) {
  app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
} else {
  console.error("❌ Firebase Error: Missing API Key in .env file. Please add your VITE_FIREBASE_API_KEY.");
}

export const auth = isConfigValid ? getAuth(app) : null as any;
export const db = isConfigValid ? getFirestore(app) : null as any;
export const storage = isConfigValid ? getStorage(app) : null as any;

// TweveStream Realtime Database — for shared CDN token
const tweveConfig = {
  apiKey: "AIzaSyBesKPIz9lw2Z8g8SYa4S7M-RxSCmYvbVs",
  authDomain: "tweve-stream.firebaseapp.com",
  databaseURL: "https://tweve-stream-default-rtdb.firebaseio.com",
  projectId: "tweve-stream",
};
let tweveApp: any;
try {
  const existingTweve = getApps().find(a => a.name === 'tweveStream');
  tweveApp = existingTweve || initializeApp(tweveConfig, 'tweveStream');
} catch {
  tweveApp = null;
}
export const tweveDb = tweveApp ? getDatabase(tweveApp) : null as any;
