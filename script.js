// --- CONFIGURATION FIREBASE ---
const firebaseConfig = { 
    // Colle tes clés ici
}; 
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
const auth = firebase.auth();
const db = firebase.firestore();

// --- VARIABLES GLOBALES ---
let currentUser = null;
let pendingTrack = null; // Pour stocker la musique en attente d'ajout
let toastTimer;

// --- FONCTION DE RÉPARATION : ESCAPE HTML ---
function escHtml(str) {
    const p = document.createElement('p');
    p.textContent = str;
    return p.innerHTML;
}

// --- GESTION DE L'AUTH ---
auth.onAuthStateChanged(user => {
    const authOverlay = document.getElementById('auth-overlay');
    if (user) {
        currentUser = user;
        if(authOverlay) authOverlay.style.display = 'none';
        document.getElementById('user-avatar').innerText = user.email[0].toUpperCase();
        document.getElementById('user-email-display').innerText = user.email;
        loadPlaylists();
    } else {
        if(authOverlay) authOverlay.style.display = 'flex';
    }
});

// --- GESTION DES NOTIFICATIONS (TOAST) ---
function showToast(message) {
    const toast = document.getElementById('toast');
    clearTimeout(toastTimer);
    toast.innerText = message;
    toast.classList.add('show');
    
    toastTimer = setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

// --- GESTION DES PLAYLISTS ---
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
    const container = document.getElementById('library-content');
    container.innerHTML = '';

    snapshot.forEach(doc => {
        const pl = doc.data();
        container.innerHTML += `
            <div class="sidebar-playlist-item" onclick="viewPlaylist('${doc.id}')">
                <div class="sidebar-pl-thumb"><i class="fas fa-music"></i></div>
                <div class="sidebar-pl-info">
                    <span class="sidebar-pl-name">${escHtml(pl.name)}</span>
                    <span class="sidebar-pl-count">${pl.tracks ? pl.tracks.length : 0} titres</span>
                </div>
            </div>`;
    });
}

// --- LOGIQUE D'AJOUT AVEC MENU FLOTTANT ---
window.addToPlaylistMenu = async function(trackId, title, artist, thumb, event) {
    if(event) event.stopPropagation();
    pendingTrack = { id: trackId, title, artist, thumb };

    const snapshot = await db.collection('users').doc(currentUser.uid).collection('playlists').get();
    const modal = document.getElementById('playlist-modal');
    const container = document.getElementById('playlist-options');
    
    container.innerHTML = '';

    if (snapshot.empty) {
        showToast("Créez une playlist d'abord !");
        return;
    }

    snapshot.forEach(doc => {
        const p = doc.data();
        const btn = document.createElement('button');
        btn.className = 'playlist-option-item';
        btn.innerHTML = `<i class="fas fa-plus"></i> ${escHtml(p.name)}`;
        btn.onclick = () => saveToSpecificPlaylist(doc.id, p.name);
        container.appendChild(btn);
    });

    // Positionnement du menu près du clic
    modal.style.display = 'block';
    modal.style.left = (event.clientX - 230) + "px";
    modal.style.top = (event.clientY) + "px";
};

async function saveToSpecificPlaylist(playlistId, playlistName) {
    if (!pendingTrack) return;
    const plRef = db.collection('users').doc(currentUser.uid).collection('playlists').doc(playlistId);
    
    try {
        const doc = await plRef.get();
        const tracks = doc.data().tracks || [];
        tracks.push(pendingTrack);
        await plRef.update({ tracks: tracks });
        
        closePlaylistModal();
        showToast(`Ajouté à ${playlistName}`);
        loadPlaylists();
    } catch (e) {
        showToast("Erreur d'ajout");
    }
}

window.closePlaylistModal = function() {
    document.getElementById('playlist-modal').style.display = 'none';
    pendingTrack = null;
};

// --- RECHERCHE ---
window.searchMusic = async function() {
    const query = document.getElementById('search-input').value;
    if(!query) return;
    
    const API_KEY = 'VOTRE_CLE_YOUTUBE';
    const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${query}&type=video&maxResults=12&key=${API_KEY}`;
    
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
                    <button class="btn-add-playlist" onclick="addToPlaylistMenu('${item.id.videoId}', '${escHtml(t.title)}', '${escHtml(t.channelTitle)}', '${t.thumbnails.default.url}', event)">
                        <i class="fas fa-plus"></i>
                    </button>
                </div>
                <h4>${escHtml(t.title)}</h4>
                <p>${escHtml(t.channelTitle)}</p>
            </div>`;
    });
};

// Fermer le menu si on clique ailleurs
window.onclick = function(event) {
    if (!event.target.closest('.playlist-popup') && !event.target.closest('.btn-add-playlist')) {
        closePlaylistModal();
    }
};
