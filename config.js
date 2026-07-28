/**
 * JARVIS desktop configuration.
 *
 * The Firebase web config is public by design (matches ASCEND's
 * firebase-config.json) — access is enforced by Firestore security rules.
 * API_BASE points at the deployed Ascend backend, which holds the Gemini key
 * server-side; no AI keys ever live in this app.
 */
window.JARVIS_CONFIG = {
  API_BASE: 'https://ascend-delta-sage.vercel.app',
  firebase: {
    projectId: 'ascend-57d4e',
    appId: '1:632580482199:web:3f071f1be50afcfb1db5d2',
    apiKey: 'AIzaSyCD72xKQAPXBJl3uO783CL-sbRCScK77fE',
    authDomain: 'ascend-57d4e.firebaseapp.com',
    storageBucket: 'ascend-57d4e.firebasestorage.app',
    messagingSenderId: '632580482199',
  },
};
