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
    apiKey:            "TA_API_KEY",
    authDomain:        "TON_PROJET.firebaseapp.com",
    projectId:         "TON_PROJET",
    storageBucket:     "TON_PROJET.appspot.com",
    messagingSenderId: "TON_SENDER_ID",
    appId:             "TON_APP_ID"
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
