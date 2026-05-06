// script.js
let player;

// Initialisation de l'API YouTube
function onYouTubeIframeAPIReady() {
    player = new YT.Player('player', {
        height: '0',
        width: '0',
        videoId: '',
        events: { 'onStateChange': onPlayerStateChange }
    });
}

async function searchMusic() {
    const query = document.getElementById('search-input').value;
    if (!query) return;

    // Note: Pour un vrai projet, utilisez votre clé API YouTube
    // Ici, on simule ou on utilise un fetch vers un outil de recherche
    const resultsContainer = document.getElementById('results');
    resultsContainer.innerHTML = "Recherche en cours...";

    // Simulation de résultats (À remplacer par l'appel API Google)
    const mockResults = [
        { id: 'dQw4w9WgXcQ', title: 'Never Gonna Give You Up', artist: 'Rick Astley', img: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/mqdefault.jpg' },
        // Ajoutez d'autres objets ici
    ];

    renderResults(mockResults);
}

function renderResults(tracks) {
    const container = document.getElementById('results');
    container.innerHTML = '';
    tracks.forEach(track => {
        const card = document.createElement('div');
        card.className = 'track-card';
        card.innerHTML = `
            <img src="${track.img}">
            <h4>${track.title}</h4>
            <p>${track.artist}</p>
        `;
        card.onclick = () => playTrack(track.id, track.title);
        container.appendChild(card);
    });
}

function playTrack(id, title) {
    player.loadVideoById(id);
    document.getElementById('current-track').innerText = "Lecture : " + title;
}

function togglePlay() {
    const state = player.getPlayerState();
    if (state === 1) player.pauseVideo();
    else player.playVideo();
}

function onPlayerStateChange(event) {
    // Gérer la fin du morceau, etc.
}
