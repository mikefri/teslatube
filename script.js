const API_KEY = 'AIzaSyBX9_dZTK6PHaCI9_kOnT4jguY0u64o-54';
let player;
let progressInterval;
let playlists = JSON.parse(localStorage.getItem('spotube_data')) || { "Favoris": [] };
let activePlaylist = "Favoris";

// INITIALISATION API
function onYouTubeIframeAPIReady() {
    player = new YT.Player('player', {
        height: '0', width: '0', videoId: '',
        playerVars: { 'autoplay': 0, 'controls': 0 },
        events: {
            'onReady': () => { 
                console.log("YouTube Ready"); 
                updateSidebar(); 
            },
            'onStateChange': (e) => { if(e.data === 0) playNext(); }
        }
    });
}

// NAVIGATION
function showSection(id) {
    document.getElementById('search-section').style.display = id === 'search-section' ? 'block' : 'none';
    document.getElementById('playlist-section').style.display = id === 'playlist-section' ? 'block' : 'none';
    if(id === 'playlist-section') renderPlaylistView();
}

// RECHERCHE
async function searchMusic() {
    const query = document.getElementById('search-input').value;
    if(!query) return;
    const res = await fetch(`https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(query)}&type=video&videoCategoryId=10&maxResults=12&key=${API_KEY}`);
    const data = await res.json();
    
    const container = document.getElementById('results');
    container.innerHTML = '';
    
    if(data.items) {
        data.items.forEach(item => {
            const t = { id: item.id.videoId, title: item.snippet.title, artist: item.snippet.channelTitle, img: item.snippet.thumbnails.medium.url };
            const card = document.createElement('div');
            card.className = 'track-card';
            card.innerHTML = `<button class="btn-add-playlist">+</button><img src="${t.img}"><h4>${t.title}</h4><p>${t.artist}</p>`;
            card.onclick = () => playTrack(t.id, t.title, t.artist);
            card.querySelector('.btn-add-playlist').onclick = (e) => { e.stopPropagation(); addToPlaylist(t); };
            container.appendChild(card);
        });
    }
}

// LECTURE
function playTrack(id, title, artist) {
    if(!player || !player.loadVideoById) return;
    player.loadVideoById(id);
    document.getElementById('current-track-title').innerText = title;
    document.getElementById('current-track-artist').innerText = artist;
    document.getElementById('btn-play').innerText = '⏸';
    clearInterval(progressInterval);
    progressInterval = setInterval(updateProgress, 1000);
}

function togglePlay() {
    const state = player.getPlayerState();
    if(state === 1) { player.pauseVideo(); document.getElementById('btn-play').innerText = '▶'; }
    else { player.playVideo(); document.getElementById('btn-play').innerText = '⏸'; }
}

function updateProgress() {
    if(player && player.getCurrentTime) {
        const cur = player.getCurrentTime();
        const dur = player.getDuration();
        if(dur > 0) {
            document.getElementById('progress-bar').value = (cur/dur)*100;
            document.getElementById('time-current').innerText = formatTime(cur);
            document.getElementById('time-total').innerText = formatTime(dur);
        }
    }
}

function formatTime(s) {
    let m = Math.floor(s/60);
    let rs = Math.floor(s%60);
    return m + ":" + (rs < 10 ? '0' : '') + rs;
}

// PLAYLISTS
function createNewPlaylist() {
    const name = prompt("Nom :");
    if(name && !playlists[name]) {
        playlists[name] = [];
        save();
        updateSidebar();
    }
}

function addToPlaylist(track) {
    playlists[activePlaylist].push(track);
    save();
    alert("Ajouté à " + activePlaylist);
}

function updateSidebar() {
    const nav = document.getElementById('playlists-nav-list');
    nav.innerHTML = '';
    Object.keys(playlists).forEach(name => {
        const div = document.createElement('div');
        div.className = "nav-item";
        div.innerText = "📁 " + name;
        div.onclick = () => { activePlaylist = name; showSection('playlist-section'); };
        nav.appendChild(div);
    });
}

function renderPlaylistView() {
    const list = playlists[activePlaylist];
    document.getElementById('active-playlist-name').innerText = activePlaylist;
    document.getElementById('playlist-count').innerText = list.length + " titres";
    const cont = document.getElementById('playlist-list');
    cont.innerHTML = '';
    list.forEach((t, i) => {
        const item = document.createElement('div');
        item.className = 'track-item';
        item.innerHTML = `<img src="${t.img}"><div class="item-info"><h5>${t.title}</h5><p>${t.artist}</p></div><button onclick="event.stopPropagation(); remove(${i})">✕</button>`;
        item.onclick = () => playTrack(t.id, t.title, t.artist);
        cont.appendChild(item);
    });
}

function remove(i) { playlists[activePlaylist].splice(i,1); save(); renderPlaylistView(); }

function save() { localStorage.setItem('spotube_data', JSON.stringify(playlists)); }

// INITIALISATION EVENTS
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('search-btn').onclick = searchMusic;
    document.getElementById('progress-bar').oninput = function() {
        player.seekTo((this.value/100)*player.getDuration());
    };
    document.getElementById('volume-bar').oninput = function() {
        player.setVolume(this.value);
    };
});
