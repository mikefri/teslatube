// --- CONFIGURATION ---
const firebaseConfig = {
  apiKey: "AIzaSyANf8hNGIRryPmZytIxIQ4uDhY6fR6uDKM",
  authDomain: "teslatube-560c0.firebaseapp.com",
  projectId: "teslatube-560c0",
  storageBucket: "teslatube-560c0.firebasestorage.app",
  messagingSenderId: "1019331471126",
  appId: "1:1019331471126:web:29beb2914436836bd41237",
  measurementId: "G-K05WJMWGGH"
};
const YOUTUBE_API_KEY = "AIzaSyBX9_dZTK6PHaCI9_kOnT4jguY0u64o-54";

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

let currentUser = null;
let ytPlayer = null;
let currentQueue = [];
let queueIndex = -1;

// --- AUTHENTICATION ---
auth.onAuthStateChanged(user => {
    if (user) {
        currentUser = user;
        document.getElementById('auth-overlay').style.display = 'none';
        document.getElementById('user-avatar').textContent = user.email[0].toUpperCase();
        document.getElementById('user-email-display').textContent = user.email;
        loadPlaylists();
    } else {
        document.getElementById('auth-overlay').style.display = 'flex';
    }
});

// Login / Signup Logic
document.getElementById('auth-btn').onclick = async () => {
    const email = document.getElementById('auth-email').value;
    const pass = document.getElementById('auth-password').value;
    const isLogin = document.getElementById('tab-login').classList.contains('auth-tab-active');

    try {
        if (isLogin) await auth.signInWithEmailAndPassword(email, pass);
        else await auth.createUserWithEmailAndPassword(email, pass);
    } catch (err) {
        document.getElementById('auth-error').textContent = err.message;
    }
};

// --- YOUTUBE PLAYER ---
function onYouTubeIframeAPIReady() {
    ytPlayer = new YT.Player('youtube-player', {
        height: '0', width: '0',
        events: {
            'onStateChange': onPlayerStateChange,
            'onReady': () => { console.log("Player Ready"); }
        }
    });
}

function onPlayerStateChange(event) {
    if (event.data === YT.PlayerState.ENDED) nextTrack();
    const icon = document.getElementById('play-icon');
    if (event.data === YT.PlayerState.PLAYING) icon.className = "fas fa-pause";
    else icon.className = "fas fa-play";
}

// --- CORE FUNCTIONS ---
async function searchMusic() {
    const q = document.getElementById('search-input').value;
    if (!q) return;
    
    const res = await fetch(`https://www.googleapis.com/youtube/v3/search?part=snippet&q=${q}&type=video&maxResults=15&key=${YOUTUBE_API_KEY}`);
    const data = await res.json();
    
    const grid = document.getElementById('music-grid');
    grid.innerHTML = '';
    
    data.items.forEach(item => {
        const t = item.snippet;
        grid.innerHTML += `
            <div class="track-card">
                <div class="card-img-wrap">
                    <img src="${t.thumbnails.medium.url}">
                    <button class="card-play-btn" onclick="playNow('${item.id.videoId}', '${escHtml(t.title)}', '${escHtml(t.channelTitle)}', '${t.thumbnails.default.url}')">
                        <i class="fas fa-play"></i>
                    </button>
                    <button class="btn-add-playlist" onclick="addToPlaylistMenu('${item.id.videoId}', '${escHtml(t.title)}', '${escHtml(t.channelTitle)}', '${t.thumbnails.default.url}')">
                        <i class="fas fa-plus"></i>
                    </button>
                </div>
                <h4>${escHtml(t.title)}</h4>
                <p>${escHtml(t.channelTitle)}</p>
            </div>`;
    });
}

function playNow(id, title, artist, thumb) {
    const track = { id, title, artist, thumb };
    currentQueue = [track];
    queueIndex = 0;
    updatePlayerUI(track);
    ytPlayer.loadVideoById(id);
}

function updatePlayerUI(track) {
    document.getElementById('current-track-title').textContent = track.title;
    document.getElementById('current-track-artist').textContent = track.artist;
    document.getElementById('current-track-img').src = track.thumb;
}

function togglePlay() {
    if (ytPlayer.getPlayerState() === 1) ytPlayer.pauseVideo();
    else ytPlayer.playVideo();
}

// --- PLAYLISTS ---
async function createPlaylist() {
    const name = prompt("Nom de la playlist :");
    if (!name) return;
    await db.collection('users').doc(currentUser.uid).collection('playlists').add({
        name, tracks: [], createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    loadPlaylists();
}

async function loadPlaylists() {
    const snap = await db.collection('users').doc(currentUser.uid).collection('playlists').get();
    const cont = document.getElementById('library-content');
    cont.innerHTML = '';
    snap.forEach(doc => {
        const p = doc.data();
        cont.innerHTML += `
            <div class="sidebar-playlist-item" onclick="viewPlaylist('${doc.id}')">
                <div class="sidebar-pl-thumb"><i class="fas fa-music"></i></div>
                <div class="sidebar-pl-info">
                    <span class="sidebar-pl-name">${escHtml(p.name)}</span>
                    <span class="sidebar-pl-count">${p.tracks.length} titres</span>
                </div>
            </div>`;
    });
}

async function addToPlaylistMenu(id, title, artist, thumb) {
    const snap = await db.collection('users').doc(currentUser.uid).collection('playlists').get();
    if(snap.empty) return createPlaylist();
    
    // Pour simplifier : ajoute à la première playlist trouvée
    const plDoc = snap.docs[0];
    const tracks = plDoc.data().tracks || [];
    tracks.push({id, title, artist, thumb});
    await plDoc.ref.update({ tracks });
    alert("Ajouté à " + plDoc.data().name);
    loadPlaylists();
}

// Utils
function escHtml(s) { 
    let t = document.createElement('div'); 
    t.textContent = s; 
    return t.innerHTML; 
}
function logout() { auth.signOut(); location.reload(); }

function toggleUserMenu() {
    const menu = document.getElementById('user-menu');
    menu.classList.toggle('show');
}

// Fermer le menu si on clique ailleurs sur l'écran
window.onclick = function(event) {
    if (!event.target.matches('.user-btn') && !event.target.matches('.user-avatar')) {
        const dropdowns = document.getElementsByClassName("user-dropdown");
        for (let i = 0; i < dropdowns.length; i++) {
            let openDropdown = dropdowns[i];
            if (openDropdown.classList.contains('show')) {
                openDropdown.classList.remove('show');
            }
        }
    }
}
