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

// Use the primary JPCS project as requested instead of the emerald platform project
let sheetsAuthInstance = auth;

export { sheetsAuthInstance };
