const API_KEY = 'AIzaSyBX9_dZTK6PHaCI9_kOnT4jguY0u64o-54';
let player;
let progressInterval;

// STRUCTURE : { "Nom": [{id, title, artist, img}, ...], ... }
let playlists = JSON.parse(localStorage.getItem('spotube_data')) || { "Favoris": [] };
let activePlaylist = "Favoris";

/** YOUTUBE API **/
function onYouTubeIframeAPIReady() {
    player = new YT.Player('player', {
        height: '0', width: '0', videoId: '',
        events: {
            'onReady': () => { player.setVolume(100); },
            'onStateChange': onPlayerStateChange
        }
    });
}

/** NAVIGATION **/
function showSection(id) {
    document.getElementById('search-section').style.display = id === 'search-section' ? 'block' : 'none';
    document.getElementById('playlist-section').style.display = id === 'playlist-section' ? 'block' : 'none';
    if(id === 'playlist-section') renderPlaylistView();
}

/** RECHERCHE **/
async function searchMusic() {
    const query = document.getElementById('search-input').value;
    if (!query) return;
    const container = document.getElementById('results');
    container.innerHTML = "Recherche...";

    const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(query)}&type=video&videoCategoryId=10&maxResults=15&key=${API_KEY}`;
    
    try {
        const res = await fetch(url);
        const data = await res.json();
        renderResults(data.items);
    } catch (e) { container.innerHTML = "Erreur de connexion."; }
}

function renderResults(items) {
    const container = document.getElementById('results');
    container.innerHTML = '';
    items.forEach(item => {
        const t = { id: item.id.videoId, title: item.snippet.title, artist: item.snippet.channelTitle, img: item.snippet.thumbnails.medium.url };
        const card = document.createElement('div');
        card.className = 'track-card';
        card.innerHTML = `
            <button class="btn-add-playlist" title="Ajouter à ${activePlaylist}">+</button>
            <img src="${t.img}">
            <h4>${t.title}</h4>
            <p>${t.artist}</p>
        `;
        card.onclick = () => playTrack(t.id, t.title, t.artist);
        card.querySelector('.btn-add-playlist').onclick = (e) => {
            e.stopPropagation();
            addToActivePlaylist(t);
        };
        container.appendChild(card);
    });
}

/** LECTURE **/
function playTrack(id, title, artist) {
    if(!player) return;
    player.loadVideoById(id);
    document.getElementById('current-track-title').innerText = title;
    document.getElementById('current-track-artist').innerText = artist;
    document.getElementById('btn-play').innerText = '⏸';
    
    clearInterval(progressInterval);
    progressInterval = setInterval(updateProgress, 1000);
}

function togglePlay() {
    const state = player.getPlayerState();
    if (state === 1) { player.pauseVideo(); document.getElementById('btn-play').innerText = '▶'; }
    else { player.playVideo(); document.getElementById('btn-play').innerText = '⏸'; }
}

function updateProgress() {
    if (player && player.getCurrentTime) {
        const current = player.getCurrentTime();
        const duration = player.getDuration();
        if (duration > 0) {
            const pct = (current / duration) * 100;
            document.getElementById('progress-bar').value = pct;
            document.getElementById('time-current').innerText = formatTime(current);
            document.getElementById('time-total').innerText = formatTime(duration);
        }
    }
}

function formatTime(s) {
    const m = Math.floor(s / 60);
    const rs = Math.floor(s % 60);
    return `${m}:${rs < 10 ? '0' : ''}${rs}`;
}

/** GESTION PLAYLISTS **/
function createNewPlaylist() {
    const name = prompt("Nom de la playlist :");
    if (name && !playlists[name]) {
        playlists[name] = [];
        activePlaylist = name;
        saveAndRefresh();
    }
}

function addToActivePlaylist(track) {
    playlists[activePlaylist].push(track);
    saveAndRefresh();
    alert(`Ajouté à ${activePlaylist}`);
}

function renderPlaylistView() {
    const container = document.getElementById('playlist-list');
    document.getElementById('active-playlist-name').innerText = activePlaylist;
    container.innerHTML = '';
    
    const list = playlists[activePlaylist];
    document.getElementById('playlist-count').innerText = `${list.length} titres`;

    list.forEach((t, i) => {
        const item = document.createElement('div');
        item.className = 'track-item';
        item.innerHTML = `
            <img src="${t.img}">
            <div class="item-info"><h5>${t.title}</h5><p>${t.artist}</p></div>
            <button onclick="event.stopPropagation(); removeFromPlaylist(${i})" style="background:none;border:none;color:grey;cursor:pointer;">✕</button>
        `;
        item.onclick = () => playTrack(t.id, t.title, t.artist);
        container.appendChild(item);
    });
}

function updateSidebar() {
    const nav = document.getElementById('playlists-nav-list');
    nav.innerHTML = '';
    Object.keys(playlists).forEach(name => {
        const li = document.createElement('div');
        li.className = `nav-item ${name === activePlaylist ? 'active-nav' : ''}`;
        li.innerText = `📁 ${name}`;
        li.onclick = () => { activePlaylist = name; showSection('playlist-section'); updateSidebar(); };
        nav.appendChild(li);
    });
}

function removeFromPlaylist(index) {
    playlists[activePlaylist].splice(index, 1);
    saveAndRefresh();
}

function deleteCurrentPlaylist() {
    if (activePlaylist === "Favoris") return alert("Impossible de supprimer la playlist par défaut.");
    if (confirm(`Supprimer ${activePlaylist} ?`)) {
        delete playlists[activePlaylist];
        activePlaylist = "Favoris";
        saveAndRefresh();
        showSection('search-section');
    }
}

function saveAndRefresh() {
    localStorage.setItem('spotube_data', JSON.stringify(playlists));
    updateSidebar();
    if (document.getElementById('playlist-section').style.display === 'block') renderPlaylistView();
}

/** EVENTS **/
function onPlayerStateChange(event) {
    if (event.data === YT.PlayerState.ENDED) {
        // Optionnel : Enchaînement automatique dans la playlist active
    }
}

document.getElementById('progress-bar').oninput = function() {
    const newTime = (this.value / 100) * player.getDuration();
    player.seekTo(newTime);
};

document.getElementById('volume-bar').oninput = function() {
    player.setVolume(this.value);
};

document.getElementById('search-btn').onclick = searchMusic;
document.getElementById('search-input').onkeypress = (e) => { if(e.key === 'Enter') searchMusic(); };

// Initialisation
window.onload = () => {
    updateSidebar();
};
