import { initializeApp, getAuth, getFirestore } from "../assets/vendor/firebase.bundle.js";
import appletConfig from "../firebase-applet-config.json";

const firebaseConfig = {
  apiKey: "AIzaSyAVTnEFDldwK0do500CF_1T_SEglfl8tIc",
  authDomain: "jpcs-5a780.firebaseapp.com",
  projectId: "jpcs-5a780",
  storageBucket: "jpcs-5a780.firebasestorage.app",
  messagingSenderId: "699529107929",
  appId: "1:699529107929:web:2a5364ec8116419a73a1c8",
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);

// Secondary Firebase app utilizing platform-provisioned credentials.
// The AI Studio environments (development and shared previews) are automatically
// authorized on this project (emerald-sensor-grtgb), resolving the "auth/unauthorized-domain" error.
let sheetsAuthInstance = auth;
try {
  const isAiStudio = window.location.hostname.includes("run.app") || 
                     window.location.hostname.includes("webcontainer") || 
                     window.location.hostname.includes("localhost");
  if (isAiStudio && appletConfig && appletConfig.apiKey) {
    const appletApp = initializeApp(appletConfig, "applet-oauth-app");
    sheetsAuthInstance = getAuth(appletApp);
  }
} catch (err) {
  console.warn("Secondary applet OAuth app initialization bypassed, using default auth:", err);
}

export { sheetsAuthInstance };
