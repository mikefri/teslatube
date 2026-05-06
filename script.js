const API_KEY = 'AIzaSyBX9_dZTK6PHaCI9_kOnT4jguY0u64o-54';
let player;
let playlist = JSON.parse(localStorage.getItem('mySpotubePlaylist')) || [];

// 1. Initialisation API Player
function onYouTubeIframeAPIReady() {
    player = new YT.Player('player', {
        height: '0',
        width: '0',
        videoId: '',
        events: {
            'onStateChange': onPlayerStateChange
        }
    });
}

// 2. Navigation
function showSection(id) {
    document.getElementById('search-section').style.display = id === 'search-section' ? 'block' : 'none';
    document.getElementById('playlist-section').style.display = id === 'playlist-section' ? 'block' : 'none';
    if (id === 'playlist-section') renderPlaylist();
}

// 3. Recherche (Corrigée)
async function searchMusic() {
    const input = document.getElementById('search-input');
    const query = input.value.trim();
    if (!query) return;

    const container = document.getElementById('results');
    container.innerHTML = '<p style="padding:20px; color:#b3b3b3;">Recherche en cours...</p>';

    const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(query)}&type=video&videoCategoryId=10&maxResults=12&key=${API_KEY}`;

    try {
        const res = await fetch(url);
        const data = await res.json();
        
        if (data.error) {
            container.innerHTML = `<p style="color:red; padding:20px;">Erreur API: ${data.error.message}</p>`;
            return;
        }

        renderResults(data.items);
    } catch (e) {
        console.error("Erreur de recherche:", e);
        container.innerHTML = '<p style="color:red; padding:20px;">Impossible de contacter YouTube.</p>';
    }
}

// 4. Affichage des résultats (Sécurisé)
function renderResults(items) {
    const container = document.getElementById('results');
    container.innerHTML = '';

    if (!items || items.length === 0) {
        container.innerHTML = '<p style="padding:20px;">Aucun résultat trouvé.</p>';
        return;
    }

    items.forEach(item => {
        const id = item.id.videoId;
        const title = item.snippet.title;
        const artist = item.snippet.channelTitle;
        const img = item.snippet.thumbnails.medium.url;

        const div = document.createElement('div');
        div.className = 'track-card';
        
        // On utilise createElement pour éviter les erreurs de guillemets dans le HTML
        div.innerHTML = `
            <button class="btn-add-playlist" title="Ajouter à la playlist">+</button>
            <img src="${img}">
            <h4>${title}</h4>
            <p>${artist}</p>
        `;

        // Gestion des clics proprement
        div.querySelector('.btn-add-playlist').onclick = (e) => {
            e.stopPropagation();
            addToPlaylist(id, title, artist, img);
        };

        div.onclick = () => playTrack(id, title, artist);
        
        container.appendChild(div);
    });
}

// 5. Gestion Playlist
function addToPlaylist(id, title, artist, img) {
    playlist.push({ id, title, artist, img });
    localStorage.setItem('mySpotubePlaylist', JSON.stringify(playlist));
    
    // Notification visuelle simple au lieu d'un alert qui bloque tout
    const btn = event.target;
    const originalText = btn.innerText;
    btn.innerText = '✅';
    setTimeout(() => btn.innerText = originalText, 2000);
}

function renderPlaylist() {
    const container = document.getElementById('playlist-list');
    container.innerHTML = '';

    playlist.forEach((track, index) => {
        const div = document.createElement('div');
        div.className = 'track-item';
        div.innerHTML = `
            <img src="${track.img}">
            <div class="track-item-info">
                <h5>${track.title}</h5>
                <p>${track.artist}</p>
            </div>
            <button class="btn-remove" style="background:none; border:none; color:#b3b3b3; cursor:pointer;">✕</button>
        `;
        
        div.querySelector('.btn-remove').onclick = (e) => {
            e.stopPropagation();
            removeItem(index);
        };

        div.onclick = () => playTrack(track.id, track.title, track.artist);
        container.appendChild(div);
    });

    document.getElementById('playlist-count').innerText = `${playlist.length} pistes dans la file d'attente`;
}

// 6. Audio
function playTrack(id, title, artist) {
    if (!player) return;
    player.loadVideoById(id);
    document.getElementById('current-track-title').innerText = title;
    document.getElementById('current-track-artist').innerText = artist;
    document.getElementById('btn-play').innerText = '⏸';
}

function togglePlay() {
    const state = player.getPlayerState();
    if (state === 1) {
        player.pauseVideo();
        document.getElementById('btn-play').innerText = '▶';
    } else {
        player.playVideo();
        document.getElementById('btn-play').innerText = '⏸';
    }
}

function removeItem(index) {
    playlist.splice(index, 1);
    localStorage.setItem('mySpotubePlaylist', JSON.stringify(playlist));
    renderPlaylist();
}

function clearPlaylist() {
    if(confirm("Voulez-vous vraiment vider la file d'attente ?")) {
        playlist = [];
        localStorage.removeItem('mySpotubePlaylist');
        renderPlaylist();
    }
}

function onPlayerStateChange(event) {
    if (event.data === YT.PlayerState.ENDED) {
        // Optionnel : Passer au suivant ici
    }
}

// 7. Event Listeners
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('search-input').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') searchMusic();
    });
});
