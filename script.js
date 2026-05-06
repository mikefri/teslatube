const API_KEY = 'AIzaSyBX9_dZTK6PHaCI9_kOnT4jguY0u64o-54';
let player;
let playlist = JSON.parse(localStorage.getItem('mySpotubePlaylist')) || [];

// Initialisation API YouTube
function onYouTubeIframeAPIReady() {
    player = new YT.Player('player', {
        height: '0', width: '0', videoId: '',
        playerVars: { 'autoplay': 0, 'controls': 0 },
        events: { 'onReady': () => console.log("Lecteur prêt") }
    });
}

// Navigation
function showSection(id) {
    document.getElementById('search-section').style.display = id === 'search-section' ? 'block' : 'none';
    document.getElementById('playlist-section').style.display = id === 'playlist-section' ? 'block' : 'none';
    if (id === 'playlist-section') renderPlaylist();
}

// Fonction de recherche
async function searchMusic() {
    const query = document.getElementById('search-input').value;
    const container = document.getElementById('results');
    
    if (!query) return;
    container.innerHTML = "<p>Recherche en cours...</p>";

    const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(query)}&type=video&videoCategoryId=10&maxResults=12&key=${API_KEY}`;

    try {
        const response = await fetch(url);
        const data = await response.json();

        if (data.items) {
            renderResults(data.items);
        } else {
            container.innerHTML = "<p>Erreur : " + (data.error ? data.error.message : "Aucun résultat") + "</p>";
        }
    } catch (error) {
        container.innerHTML = "<p>Erreur de connexion.</p>";
    }
}

function renderResults(items) {
    const container = document.getElementById('results');
    container.innerHTML = '';

    items.forEach(item => {
        const videoId = item.id.videoId;
        const title = item.snippet.title;
        const artist = item.snippet.channelTitle;
        const img = item.snippet.thumbnails.medium.url;

        const card = document.createElement('div');
        card.className = 'track-card';
        card.innerHTML = `
            <button class="btn-add-playlist">+</button>
            <img src="${img}">
            <h4>${title}</h4>
            <p>${artist}</p>
        `;

        // Action Lecture
        card.onclick = () => playTrack(videoId, title, artist);

        // Action Ajouter Playlist
        card.querySelector('.btn-add-playlist').onclick = (e) => {
            e.stopPropagation();
            addToPlaylist(videoId, title, artist, img);
        };

        container.appendChild(card);
    });
}

function playTrack(id, title, artist) {
    if (player && player.loadVideoById) {
        player.loadVideoById(id);
        document.getElementById('current-track-title').innerText = title;
        document.getElementById('current-track-artist').innerText = artist;
    }
}

function togglePlay() {
    const state = player.getPlayerState();
    state === 1 ? player.pauseVideo() : player.playVideo();
}

function addToPlaylist(id, title, artist, img) {
    playlist.push({id, title, artist, img});
    localStorage.setItem('mySpotubePlaylist', JSON.stringify(playlist));
    alert("Ajouté à la file d'attente !");
}

function renderPlaylist() {
    const container = document.getElementById('playlist-list');
    container.innerHTML = '';
    playlist.forEach((t, i) => {
        const div = document.createElement('div');
        div.className = 'track-item';
        div.innerHTML = `<img src="${t.img}"><div><h5>${t.title}</h5><p>${t.artist}</p></div>`;
        div.onclick = () => playTrack(t.id, t.title, t.artist);
        container.appendChild(div);
    });
    document.getElementById('playlist-count').innerText = playlist.length + " pistes";
}

function clearPlaylist() {
    playlist = [];
    localStorage.removeItem('mySpotubePlaylist');
    renderPlaylist();
}

// Lancement des écouteurs au démarrage
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('search-btn').onclick = searchMusic;
    document.getElementById('search-input').onkeypress = (e) => {
        if (e.key === 'Enter') searchMusic();
    };
});
