const API_KEY = 'AIzaSyBX9_dZTK6PHaCI9_kOnT4jguY0u64o-54';
let player;
let playlist = JSON.parse(localStorage.getItem('mySpotubePlaylist')) || [];
let progressInterval;

function onYouTubeIframeAPIReady() {
    player = new YT.Player('player', {
        height: '0', width: '0', videoId: '',
        events: {
            'onReady': () => { console.log("Lecteur prêt"); updateVolume(); },
            'onStateChange': onPlayerStateChange
        }
    });
}

// Recherche & Affichage
async function searchMusic() {
    const query = document.getElementById('search-input').value;
    if (!query) return;
    const container = document.getElementById('results');
    container.innerHTML = "Chargement...";

    const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(query)}&type=video&videoCategoryId=10&maxResults=15&key=${API_KEY}`;
    
    try {
        const res = await fetch(url);
        const data = await res.json();
        renderResults(data.items);
    } catch (e) { container.innerHTML = "Erreur."; }
}

function renderResults(items) {
    const container = document.getElementById('results');
    container.innerHTML = '';
    items.forEach(item => {
        const t = { id: item.id.videoId, title: item.snippet.title, artist: item.snippet.channelTitle, img: item.snippet.thumbnails.medium.url };
        const div = document.createElement('div');
        div.className = 'track-card';
        div.innerHTML = `<button class="btn-add-playlist">+</button><img src="${t.img}"><h4>${t.title}</h4><p>${t.artist}</p>`;
        div.onclick = () => playTrack(t.id, t.title, t.artist);
        div.querySelector('.btn-add-playlist').onclick = (e) => { e.stopPropagation(); addToPlaylist(t.id, t.title, t.artist, t.img); };
        container.appendChild(div);
    });
}

// Audio & Barre de progression
function playTrack(id, title, artist) {
    player.loadVideoById(id);
    document.getElementById('current-track-title').textContent = title;
    document.getElementById('current-track-artist').textContent = artist;
    document.getElementById('btn-play').textContent = '⏸';
    
    // Timer pour la progression
    clearInterval(progressInterval);
    progressInterval = setInterval(updateProgress, 1000);
}

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

// Interaction Barre de progression & Volume
document.getElementById('progress-bar').oninput = function() {
    const duration = player.getDuration();
    const newTime = (this.value / 100) * duration;
    player.seekTo(newTime);
};

document.getElementById('volume-bar').oninput = updateVolume;

function updateVolume() {
    const vol = document.getElementById('volume-bar').value;
    if(player && player.setVolume) player.setVolume(vol);
}

function togglePlay() {
    const state = player.getPlayerState();
    if (state === 1) { player.pauseVideo(); document.getElementById('btn-play').textContent = '▶'; }
    else { player.playVideo(); document.getElementById('btn-play').textContent = '⏸'; }
}

// Enchaînement Automatique
function onPlayerStateChange(event) {
    if (event.data === YT.PlayerState.ENDED) {
        if (playlist.length > 0) {
            const next = playlist.shift();
            savePlaylist();
            playTrack(next.id, next.title, next.artist);
            renderPlaylist();
        }
    }
}

// Gestion Playlist
function addToPlaylist(id, title, artist, img) {
    playlist.push({id, title, artist, img});
    savePlaylist();
}

function savePlaylist() { localStorage.setItem('mySpotubePlaylist', JSON.stringify(playlist)); }

function renderPlaylist() {
    const container = document.getElementById('playlist-list');
    container.innerHTML = '';
    playlist.forEach((t, i) => {
        const div = document.createElement('div');
        div.className = 'track-item';
        div.innerHTML = `<img src="${t.img}"><div><h5>${t.title}</h5><p>${t.artist}</p></div>`;
        div.onclick = () => { playlist.splice(i, 1); savePlaylist(); playTrack(t.id, t.title, t.artist); renderPlaylist(); };
        container.appendChild(div);
    });
    document.getElementById('playlist-count').textContent = `${playlist.length} pistes`;
}

function clearPlaylist() { playlist = []; savePlaylist(); renderPlaylist(); }

function showSection(id) {
    document.getElementById('search-section').style.display = id === 'search-section' ? 'block' : 'none';
    document.getElementById('playlist-section').style.display = id === 'playlist-section' ? 'block' : 'none';
    if(id === 'playlist-section') renderPlaylist();
}

document.getElementById('search-btn').onclick = searchMusic;
document.getElementById('search-input').onkeypress = (e) => { if(e.key === 'Enter') searchMusic(); };
