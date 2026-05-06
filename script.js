const API_KEY = 'AIzaSyBX9_dZTK6PHaCI9_kOnT4jguY0u64o-54';
let player;
let playlist = JSON.parse(localStorage.getItem('mySpotubePlaylist')) || [];
let progressInterval;

/**
 * 1. INITIALISATION DU LECTEUR YOUTUBE
 */
function onYouTubeIframeAPIReady() {
    player = new YT.Player('player', {
        height: '0',
        width: '0',
        videoId: '',
        playerVars: {
            'autoplay': 0,
            'controls': 0,
            'origin': window.location.origin
        },
        events: {
            'onReady': onPlayerReady,
            'onStateChange': onPlayerStateChange
        }
    });
}

function onPlayerReady(event) {
    console.log("Spotube Ready");
    updateVolume();
}

/**
 * 2. NAVIGATION ET INTERFACE
 */
function showSection(id) {
    document.getElementById('search-section').style.display = id === 'search-section' ? 'block' : 'none';
    document.getElementById('playlist-section').style.display = id === 'playlist-section' ? 'block' : 'none';
    if (id === 'playlist-section') renderPlaylist();
}

/**
 * 3. RECHERCHE DE MUSIQUE
 */
async function searchMusic() {
    const input = document.getElementById('search-input');
    const query = input.value.trim();
    if (!query) return;

    const container = document.getElementById('results');
    container.innerHTML = "<p style='padding:20px;'>Recherche en cours...</p>";

    const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(query)}&type=video&videoCategoryId=10&maxResults=15&key=${API_KEY}`;

    try {
        const response = await fetch(url);
        const data = await response.json();
        if (data.items) {
            renderResults(data.items);
        } else {
            container.innerHTML = "<p>Aucun résultat trouvé.</p>";
        }
    } catch (error) {
        container.innerHTML = "<p>Erreur de connexion API.</p>";
    }
}

function renderResults(items) {
    const container = document.getElementById('results');
    container.innerHTML = '';

    items.forEach(item => {
        const t = {
            id: item.id.videoId,
            title: item.snippet.title,
            artist: item.snippet.channelTitle,
            img: item.snippet.thumbnails.medium.url
        };

        const card = document.createElement('div');
        card.className = 'track-card';
        card.innerHTML = `
            <button class="btn-add-playlist">+</button>
            <img src="${t.img}">
            <h4>${t.title}</h4>
            <p>${t.artist}</p>
        `;

        // Lecture immédiate au clic sur la carte
        card.onclick = () => playTrack(t.id, t.title, t.artist);

        // Ajout à la playlist via le bouton +
        card.querySelector('.btn-add-playlist').onclick = (e) => {
            e.stopPropagation();
            addToPlaylist(t.id, t.title, t.artist, t.img);
        };

        container.appendChild(card);
    });
}

/**
 * 4. LOGIQUE DE LECTURE AUDIO
 */
function playTrack(id, title, artist) {
    if (!player || !player.loadVideoById) return;

    player.loadVideoById(id);
    player.playVideo();

    document.getElementById('current-track-title').textContent = title;
    document.getElementById('current-track-artist').textContent = artist;
    document.getElementById('btn-play').textContent = '⏸';

    // Gestion de la barre de progression
    clearInterval(progressInterval);
    progressInterval = setInterval(updateProgress, 1000);
}

function togglePlay() {
    const state = player.getPlayerState();
    if (state === YT.PlayerState.PLAYING) {
        player.pauseVideo();
        document.getElementById('btn-play').textContent = '▶';
    } else {
        player.playVideo();
        document.getElementById('btn-play').textContent = '⏸';
    }
}

function onPlayerStateChange(event) {
    if (event.data === YT.PlayerState.ENDED) {
        playNext();
    }
}

function playNext() {
    if (playlist.length > 0) {
        const next = playlist.shift(); // On prend le premier
        savePlaylist();
        playTrack(next.id, next.title, next.artist);
        renderPlaylist(); // On met à jour la vue si l'utilisateur est dessus
    }
}

/**
 * 5. BARRE DE PROGRESSION ET VOLUME
 */
function updateProgress() {
    if (player && player.getCurrentTime) {
        const current = player.getCurrentTime();
        const duration = player.getDuration();
        if (duration > 0) {
            const pct = (current / duration) * 100;
            document.getElementById('progress-bar').value = pct;
            document.getElementById('time-current').textContent = formatTime(current);
            document.getElementById('time-total').textContent = formatTime(duration);
        }
    }
}

function formatTime(sec) {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
}

// Interaction avec les sliders
document.getElementById('progress-bar').oninput = function() {
    if (player && player.getDuration) {
        const newTime = (this.value / 100) * player.getDuration();
        player.seekTo(newTime);
    }
};

document.getElementById('volume-bar').oninput = updateVolume;

function updateVolume() {
    const vol = document.getElementById('volume-bar').value;
    if (player && player.setVolume) player.setVolume(vol);
}

/**
 * 6. GESTION DE LA PLAYLIST (FILE D'ATTENTE)
 */
function addToPlaylist(id, title, artist, img) {
    playlist.push({ id, title, artist, img });
    savePlaylist();
}

function renderPlaylist() {
    const container = document.getElementById('playlist-list');
    container.innerHTML = '';

    playlist.forEach((t, i) => {
        const div = document.createElement('div');
        div.className = 'track-item';
        div.innerHTML = `
            <img src="${t.img}">
            <div class="track-item-info">
                <h5>${t.title}</h5>
                <p>${t.artist}</p>
            </div>
            <button class="btn-remove-item" style="background:none; border:none; color:white; cursor:pointer;">✕</button>
        `;

        // Clic sur l'item = Lire et enlever de la liste
        div.onclick = () => {
            playTrack(t.id, t.title, t.artist);
            playlist.splice(i, 1);
            savePlaylist();
            renderPlaylist();
        };

        // Supprimer sans lire
        div.querySelector('.btn-remove-item').onclick = (e) => {
            e.stopPropagation();
            playlist.splice(i, 1);
            savePlaylist();
            renderPlaylist();
        };

        container.appendChild(div);
    });

    document.getElementById('playlist-count').textContent = `${playlist.length} pistes`;
}

function savePlaylist() {
    localStorage.setItem('mySpotubePlaylist', JSON.stringify(playlist));
}

function clearPlaylist() {
    playlist = [];
    savePlaylist();
    renderPlaylist();
}

/**
 * 7. LISTENERS AU CHARGEMENT
 */
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('search-btn').onclick = searchMusic;
    document.getElementById('search-input').onkeypress = (e) => {
        if (e.key === 'Enter') searchMusic();
    };
});
