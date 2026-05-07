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

function nextTrack() {
    if (queueIndex < currentQueue.length - 1) {
        queueIndex++;
        const track = currentQueue[queueIndex];
        updatePlayerUI(track);
        ytPlayer.loadVideoById(track.id);
    }
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

// --- PLAYLISTS (VUE LISTE ÉVOLUÉE) ---
async function viewPlaylist(playlistId) {
    const doc = await db.collection('users').doc(currentUser.uid).collection('playlists').doc(playlistId).get();
    if (!doc.exists) return;

    const playlist = doc.data();
    const tracks = playlist.tracks || [];
    const grid = document.getElementById('music-grid');

    // On utilise la structure de type "Tableau" avec Bannière
    grid.innerHTML = `
        <div class="playlist-container">
            <div class="playlist-header">
                <div class="playlist-cover-large">
                    ${tracks.length > 0 ? `<img src="${tracks[0].thumb}">` : '<i class="fas fa-music"></i>'}
                </div>
                <div class="playlist-header-info">
                    <span class="playlist-type">PLAYLIST</span>
                    <h1 class="playlist-title">${escHtml(playlist.name)}</h1>
                    <div class="playlist-metadata">
                        <strong>${currentUser.email.split('@')[0]}</strong> • ${tracks.length} titre${tracks.length > 1 ? 's' : ''}
                    </div>
                </div>
            </div>

            <div class="playlist-actions">
                <button class="play-btn-main" onclick="playPlaylist('${playlistId}')">
                    <i class="fas fa-play"></i>
                </button>
                <button class="btn-delete-pl" onclick="deletePlaylist('${doc.id}')" style="background:none; border:none; color:#b3b3b3; font-size:1.5rem; cursor:pointer;">
                    <i class="fas fa-ellipsis-h"></i>
                </button>
            </div>

            <div class="tracks-table">
                <div class="table-header">
                    <div class="col-num">#</div>
                    <div class="col-title">TITRE</div>
                    <div class="col-artist">ARTISTE</div>
                    <div class="col-action"></div>
                </div>
                <div class="table-body">
                    ${tracks.map((track, index) => `
                        <div class="track-row" onclick="playNow('${track.id}', '${escHtml(track.title)}', '${escHtml(track.artist)}', '${track.thumb}')">
                            <div class="col-num">${index + 1}</div>
                            <div class="col-title">
                                <img src="${track.thumb}" class="row-thumb" style="width:40px; height:40px; margin-right:15px; border-radius:4px;">
                                <div class="row-info">
                                    <span class="row-name" style="display:block; color:white;">${escHtml(track.title)}</span>
                                </div>
                            </div>
                            <div class="col-artist">${escHtml(track.artist)}</div>
                            <div class="col-action">
                                <button class="row-delete-btn" onclick="removeFromPlaylist('${playlistId}', ${index}, event)" style="background:none; border:none; color:#b3b3b3; cursor:pointer;">
                                    <i class="fas fa-times"></i>
                                </button>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        </div>
    `;
}

// Fonction pour lire toute la playlist d'un coup
window.playPlaylist = async function(playlistId) {
    const doc = await db.collection('users').doc(currentUser.uid).collection('playlists').doc(playlistId).get();
    const tracks = doc.data().tracks || [];
    if (tracks.length > 0) {
        currentQueue = tracks;
        queueIndex = 0;
        playNow(tracks[0].id, tracks[0].title, tracks[0].artist, tracks[0].thumb);
    } else {
        showToast("La playlist est vide");
    }
};

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
    if(toast) {
        toast.innerText = message;
        toast.classList.add('show');
        setTimeout(() => { toast.classList.remove('show'); }, 3000);
    } else {
        console.log(message);
    }
}

function toggleUserMenu() {
    document.getElementById('user-menu').classList.toggle('show');
}

function logout() { auth.signOut(); location.reload(); }

window.onclick = function(event) {
    if (!event.target.matches('.user-btn') && !event.target.matches('.user-avatar')) {
        const menu = document.getElementById('user-menu');
        if (menu && menu.classList.contains('show')) menu.classList.remove('show');
    }
}
