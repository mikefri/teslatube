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
let pendingTrack = null; 

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
                    <button class="btn-add-playlist" onclick="addToPlaylistMenu('${item.id.videoId}', '${escHtml(t.title)}', '${escHtml(t.channelTitle)}', '${t.thumbnails.default.url}', event)">
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

// --- NAVIGATION ---
function showSection(section) {
    const grid = document.getElementById('music-grid');
    if(section === 'home' || section === 'search') {
        grid.innerHTML = `
            <div class="results-placeholder">
                <div class="placeholder-icon"><i class="fas fa-music"></i></div>
                <h2>Recherchez vos titres favoris</h2>
                <p>Trouvez de la musique parmi des millions de titres YouTube.</p>
            </div>`;
    }
}

// --- PLAYLISTS (AFFICHAGE & GESTION) ---
async function viewPlaylist(playlistId) {
    const doc = await db.collection('users').doc(currentUser.uid).collection('playlists').doc(playlistId).get();
    if (!doc.exists) return;

    const playlist = doc.data();
    const tracks = playlist.tracks || [];
    const grid = document.getElementById('music-grid');

    grid.innerHTML = `
        <div style="grid-column: 1 / -1; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: center;">
            <div>
                <h2 style="font-size: 2rem; margin: 0;">${escHtml(playlist.name)}</h2>
                <p style="color: var(--text-sub);">${tracks.length} titres</p>
            </div>
            <button class="sidebar-pl-btn danger" onclick="deletePlaylist('${doc.id}')">
                <i class="fas fa-trash"></i> Supprimer la playlist
            </button>
        </div>
    `;

    if (tracks.length === 0) {
        grid.innerHTML += `<p style="grid-column: 1 / -1; color: var(--text-sub);">Cette playlist est vide.</p>`;
        return;
    }

    tracks.forEach((track, index) => {
        grid.innerHTML += `
            <div class="track-card">
                <div class="card-img-wrap">
                    <img src="${track.thumb}">
                    <button class="card-play-btn" onclick="playNow('${track.id}', '${escHtml(track.title)}', '${escHtml(track.artist)}', '${track.thumb}')">
                        <i class="fas fa-play"></i>
                    </button>
                    <button class="btn-add-playlist" onclick="removeFromPlaylist('${playlistId}', ${index}, event)" style="background: rgba(255,0,0,0.6);">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <h4>${escHtml(track.title)}</h4>
                <p>${escHtml(track.artist)}</p>
            </div>`;
    });
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

async function createPlaylist() {
    const name = prompt("Nom de la playlist :");
    if (!name) return;
    await db.collection('users').doc(currentUser.uid).collection('playlists').add({
        name, tracks: [], createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    loadPlaylists();
}

async function deletePlaylist(id) {
    if(!confirm("Supprimer définitivement cette playlist ?")) return;
    await db.collection('users').doc(currentUser.uid).collection('playlists').doc(id).delete();
    showSection('home');
    loadPlaylists();
}

async function removeFromPlaylist(playlistId, trackIndex, event) {
    event.stopPropagation();
    const plRef = db.collection('users').doc(currentUser.uid).collection('playlists').doc(playlistId);
    const doc = await plRef.get();
    let tracks = doc.data().tracks || [];
    tracks.splice(trackIndex, 1);
    await plRef.update({ tracks: tracks });
    showToast("Titre retiré");
    viewPlaylist(playlistId);
    loadPlaylists();
}

// --- AJOUTER À UNE PLAYLIST (MODAL) ---
async function addToPlaylistMenu(id, title, artist, thumb, event) {
    if(event) event.stopPropagation();
    pendingTrack = { id, title, artist, thumb };
    const snap = await db.collection('users').doc(currentUser.uid).collection('playlists').get();
    const modal = document.getElementById('playlist-modal');
    const container = document.getElementById('playlist-options');
    container.innerHTML = '';

    if(snap.empty) {
        showToast("Créez une playlist d'abord !");
        return;
    }

    snap.forEach(doc => {
        const p = doc.data();
        const btn = document.createElement('button');
        btn.className = 'playlist-option-item';
        btn.innerHTML = `<i class="fas fa-list-ul"></i> ${escHtml(p.name)}`;
        btn.onclick = () => saveToSpecificPlaylist(doc.id, p.name);
        container.appendChild(btn);
    });

    modal.style.display = 'block';
    modal.style.left = (event.clientX - 230) + "px"; 
    modal.style.top = (event.clientY) + "px";
}

async function saveToSpecificPlaylist(playlistId, playlistName) {
    if (!pendingTrack) return;
    const plRef = db.collection('users').doc(currentUser.uid).collection('playlists').doc(playlistId);
    try {
        const doc = await plRef.get();
        const tracks = doc.data().tracks || [];
        tracks.push(pendingTrack);
        await plRef.update({ tracks: tracks });
        showToast(`Ajouté à ${playlistName}`);
        closePlaylistModal();
        loadPlaylists(); 
    } catch (error) {
        showToast("Erreur d'ajout");
    }
}

function closePlaylistModal() {
    document.getElementById('playlist-modal').style.display = 'none';
    pendingTrack = null;
}

// --- UTILS & UI ---
function escHtml(s) { 
    let t = document.createElement('div'); 
    t.textContent = s; 
    return t.innerHTML; 
}

function showToast(message) {
    const toast = document.getElementById('toast');
    toast.innerText = message;
    toast.classList.add('show');
    setTimeout(() => { toast.classList.remove('show'); }, 3000);
}

function toggleUserMenu() {
    document.getElementById('user-menu').classList.toggle('show');
}

function logout() { auth.signOut(); location.reload(); }

window.onclick = function(event) {
    if (!event.target.matches('.user-btn') && !event.target.matches('.user-avatar')) {
        const menu = document.getElementById('user-menu');
        if (menu.classList.contains('show')) menu.classList.remove('show');
    }
}
