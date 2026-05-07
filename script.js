// --- CONFIGURATION FIREBASE ---
// (Garde tes propres clés ici)
const firebaseConfig = { ... }; 
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// --- VARIABLES GLOBALES ---
let currentUser = null;
let currentPlaylistId = null;
let queue = [];

// --- FONCTION DE RÉPARATION : ESCAPE HTML ---
function escHtml(str) {
    const p = document.createElement('p');
    p.textContent = str;
    return p.innerHTML;
}

// --- GESTION DE L'AUTH ---
auth.onAuthStateChanged(user => {
    if (user) {
        currentUser = user;
        document.getElementById('auth-overlay').style.display = 'none';
        loadPlaylists(); // Charger les playlists dès la connexion
    } else {
        document.getElementById('auth-overlay').style.display = 'flex';
    }
});

// --- GESTION DES PLAYLISTS (CRUD) ---
async function createPlaylist() {
    const name = prompt("Nom de la playlist :");
    if (!name) return;

    await db.collection('users').doc(currentUser.uid).collection('playlists').add({
        name: name,
        tracks: [],
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    loadPlaylists();
}

async function loadPlaylists() {
    const snapshot = await db.collection('users').doc(currentUser.uid).collection('playlists').get();
    const container = document.getElementById('library-content'); // Correspond au CSS
    container.innerHTML = '';

    snapshot.forEach(doc => {
        const pl = doc.data();
        container.innerHTML += `
            <div class="sidebar-playlist-item" onclick="viewPlaylist('${doc.id}')">
                <div class="sidebar-pl-thumb"><i class="fas fa-music"></i></div>
                <div class="sidebar-pl-info">
                    <span class="sidebar-pl-name">${escHtml(pl.name)}</span>
                    <span class="sidebar-pl-count">${pl.tracks.length} titres</span>
                </div>
                <button class="sidebar-pl-btn danger" onclick="deletePlaylist(event, '${doc.id}')">
                    <i class="fas fa-trash"></i>
                </button>
            </div>`;
    });
}

async function deletePlaylist(e, id) {
    e.stopPropagation();
    if(confirm("Supprimer cette playlist ?")) {
        await db.collection('users').doc(currentUser.uid).collection('playlists').doc(id).delete();
        loadPlaylists();
    }
}

// --- AJOUTER UNE MUSIQUE À UNE PLAYLIST ---
window.addToPlaylist = async function(trackId, title, artist, thumb) {
    // 1. Demander à l'utilisateur vers quelle playlist
    const snapshot = await db.collection('users').doc(currentUser.uid).collection('playlists').get();
    if (snapshot.empty) {
        alert("Créez d'abord une playlist !");
        return;
    }

    // Pour simplifier, on prend la première ou on pourrait ouvrir un menu
    const firstPl = snapshot.docs[0];
    const tracks = firstPl.data().tracks || [];
    
    tracks.push({ id: trackId, title, artist, thumb });
    
    await db.collection('users').doc(currentUser.uid).collection('playlists').doc(firstPl.id).update({
        tracks: tracks
    });
    alert("Ajouté à " + firstPl.data().name);
    loadPlaylists();
};

// --- RECHERCHE ---
async function searchMusic() {
    const query = document.getElementById('search-input').value;
    if(!query) return;
    
    const API_KEY = 'VOTRE_CLE_YOUTUBE';
    const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${query}&type=video&maxResults=10&key=${API_KEY}`;
    
    const res = await fetch(url);
    const data = await res.json();
    
    const grid = document.getElementById('music-grid');
    grid.innerHTML = '';
    
    data.items.forEach(item => {
        const t = item.snippet;
        grid.innerHTML += `
            <div class="track-card">
                <div class="card-img-wrap">
                    <img src="${t.thumbnails.medium.url}">
                    <button class="card-play-btn" onclick="playTrack('${item.id.videoId}', '${escHtml(t.title)}')">
                        <i class="fas fa-play"></i>
                    </button>
                    <button class="btn-add-playlist" onclick="addToPlaylist('${item.id.videoId}', '${escHtml(t.title)}', '${escHtml(t.channelTitle)}', '${t.thumbnails.default.url}')">
                        <i class="fas fa-plus"></i>
                    </button>
                </div>
                <h4>${escHtml(t.title)}</h4>
                <p>${escHtml(t.channelTitle)}</p>
            </div>`;
    });
}
