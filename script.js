// Ta clé API (Pense à restreindre son usage sur Google Cloud pour ton domaine .github.io)
const API_KEY = 'AIzaSyBX9_dZTK6PHaCI9_kOnT4jguY0u64o-54';
let player;

// 1. Initialisation de l'API YouTube IFrame
function onYouTubeIframeAPIReady() {
    player = new YT.Player('player', {
        height: '0',
        width: '0',
        videoId: '',
        playerVars: {
            'autoplay': 0,
            'controls': 0,
            'disablekb': 1
        },
        events: {
            'onStateChange': onPlayerStateChange
        }
    });
}

// 2. Fonction de recherche réelle via l'API YouTube
async function searchMusic() {
    const query = document.getElementById('search-input').value;
    if (!query) return;

    const resultsContainer = document.getElementById('results');
    resultsContainer.innerHTML = "<p style='padding:20px;'>Recherche de mélodies en cours...</p>";

    // URL pour chercher uniquement des vidéos de catégorie Musique (10)
    const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(query)}&type=video&videoCategoryId=10&maxResults=15&key=${API_KEY}`;

    try {
        const response = await fetch(url);
        const data = await response.json();

        if (data.items) {
            const tracks = data.items.map(item => ({
                id: item.id.videoId,
                title: item.snippet.title,
                artist: item.snippet.channelTitle,
                img: item.snippet.thumbnails.medium.url
            }));
            renderResults(tracks);
        } else {
            resultsContainer.innerHTML = "<p>Aucun résultat trouvé.</p>";
        }
    } catch (error) {
        console.error("Erreur API YouTube:", error);
        resultsContainer.innerHTML = "<p>Erreur de connexion à YouTube.</p>";
    }
}

// 3. Affichage des morceaux dans l'interface
function renderResults(tracks) {
    const container = document.getElementById('results');
    container.innerHTML = '';

    tracks.forEach(track => {
        const card = document.createElement('div');
        card.className = 'track-card';
        // Nettoyage du titre pour éviter les caractères spéciaux bizarres
        const cleanTitle = track.title.replace(/"/g, '&quot;');
        
        card.innerHTML = `
            <img src="${track.img}" alt="${cleanTitle}">
            <h4>${track.title.substring(0, 40)}${track.title.length > 40 ? '...' : ''}</h4>
            <p>${track.artist}</p>
        `;
        card.onclick = () => playTrack(track.id, track.title);
        container.appendChild(card);
    });
}

// 4. Contrôle de la lecture
function playTrack(id, title) {
    player.loadVideoById(id);
    document.getElementById('current-track').innerText = "Lecture : " + title;
}

function togglePlay() {
    const state = player.getPlayerState();
    if (state === YT.PlayerState.PLAYING) {
        player.pauseVideo();
    } else {
        player.playVideo();
    }
}

function onPlayerStateChange(event) {
    // Si la vidéo est finie (0), on pourrait lancer une autre musique ici
    if (event.data === YT.PlayerState.ENDED) {
        console.log("Morceau terminé");
    }
}

// 5. Gestion de la touche Entrée pour la recherche
document.addEventListener('DOMContentLoaded', () => {
    const input = document.getElementById('search-input');
    input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            searchMusic();
        }
    });
});
