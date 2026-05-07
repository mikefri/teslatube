import { initializeApp }                          from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getFirestore, doc, getDoc, setDoc }      from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import {
    getAuth,
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    signOut,
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

// ─── REMPLACE PAR TA CONFIG FIREBASE ──────────────────────────────────────────
const firebaseConfig = {
  apiKey: "AIzaSyANf8hNGIRryPmZytIxIQ4uDhY6fR6uDKM",
  authDomain: "teslatube-560c0.firebaseapp.com",
  projectId: "teslatube-560c0",
  storageBucket: "teslatube-560c0.firebasestorage.app",
  messagingSenderId: "1019331471126",
  appId: "1:1019331471126:web:29beb2914436836bd41237",
  measurementId: "G-K05WJMWGGH"
};
// ──────────────────────────────────────────────────────────────────────────────

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db   = getFirestore(app);

/* ── Playlist Firestore ──────────────────────────────────────────────────── */
export async function savePlaylistRemote(uid, playlist) {
    await setDoc(doc(db, "playlists", uid), { tracks: playlist });
}

export async function loadPlaylistRemote(uid) {
    const snap = await getDoc(doc(db, "playlists", uid));
    return snap.exists() ? snap.data().tracks : [];
}

/* ── Auth helpers ────────────────────────────────────────────────────────── */
export async function loginUser(email, password) {
    return signInWithEmailAndPassword(auth, email, password);
}

export async function registerUser(email, password) {
    return createUserWithEmailAndPassword(auth, email, password);
}

export async function logoutUser() {
    return signOut(auth);
}

export { onAuthStateChanged };

/* ── Playlists nommées (Sidebar) ── */
export async function saveUserPlaylists(uid, namedPlaylists) {
    // Sauvegarde dans un champ séparé pour ne pas écraser la file d'attente
    await setDoc(doc(db, "users_config", uid), { namedPlaylists }, { merge: true });
}

export async function loadUserPlaylists(uid) {
    const snap = await getDoc(doc(db, "users_config", uid));
    return snap.exists() ? (snap.data().namedPlaylists || []) : [];
}
