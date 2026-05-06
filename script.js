const API_KEY = 'AIzaSyBX9_dZTK6PHaCI9_kOnT4jguY0u64o-54';
let player;
let playlist = JSON.parse(localStorage.getItem('mySpotubePlaylist')) || [];

function onYouTubeIframeAPIReady() {
    player = new YT.Player('player', {
        height: '0', width: '0', videoId: '',
        events: { 'onStateChange': onPlayerStateChange }
    });
}

// Alterner entre Recherche et Playlist
function showSection(id) {
    document.getElementById('search-section').style.display = id === 'search-section' ? 'block' : 'none';
    document.getElementById('playlist-section').style.display = id === 'playlist-section' ? 'block' : 'none';
    if(id === 'playlist-section') renderPlaylist();
}

async function searchMusic() {
    const query = document.getElementById('search-input').value;
    if (!query) return;
    const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(query)}&type=video&videoCategoryId=10&maxResults=10&key=${API_KEY}`;
    
    try {
        const res = await fetch(url);
        const data = await res.json();
        renderResults(data.items);
    } catch (e) { console.error(e); }
}

function renderResults(items) {
    const container = document.getElementById('results');
    container.innerHTML = '';
    items.forEach(item => {
        const track = {
            id: item.id.videoId,
            title: item.snippet.title.replace(/'/g, "&apos;"),
            artist: item.snippet.channelTitle.replace(/'/g, "&apos;"),
            img: item.snippet.thumbnails.medium.url
        };
        const div = document.createElement('div');
        div.className = 'track-card';
        div.innerHTML = `
            <button class="btn-add-playlist" onclick="event.stopPropagation(); addToPlaylist('${track.id}','${track.title}','${track.artist}','${track.img}')">+</button>
            <img src="${track.img}">
            <h4>${track.title.substring(0,30)}...</h4>
            <p>${track.artist}</p>
        `;
        div.onclick = () => playTrack(track.id, track.title, track.artist);
        container.appendChild(div);
    });
}

function addToPlaylist(id, title, artist, img) {
    playlist.push({id, title, artist, img});
    localStorage.setItem('mySpotubePlaylist', JSON.stringify(playlist));
    alert('Ajouté à la file d'attente !');
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
            <button onclick="event.stopPropagation(); removeItem(${index})">❌</button>
        `;
        div.onclick = () => playTrack(track.id, track.title, track.artist);
        container.appendChild(div);
    });
    document.getElementById('playlist-count').innerText = `${playlist.length} pistes dans la file d'attente`;
}

function playTrack(id, title, artist) {
    player.loadVideoById(id);
    document.getElementById('current-track-title').innerText = title;
    document.getElementById('current-track-artist').innerText = artist;
}

function togglePlay() {
    const state = player.getPlayerState();
    state === 1 ? player.pauseVideo() : player.playVideo();
}

function removeItem(index) {
    playlist.splice(index, 1);
    localStorage.setItem('mySpotubePlaylist', JSON.stringify(playlist));
    renderPlaylist();
}

function clearPlaylist() {
    playlist = [];
    localStorage.removeItem('mySpotubePlaylist');
    renderPlaylist();
}

function onPlayerStateChange(event) {
    // Si la vidéo finit, on pourrait coder ici la lecture auto du suivant
}
