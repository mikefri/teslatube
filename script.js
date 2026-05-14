/* ═══════════════════════════════════════════════════
   TESLATUB — script.js  v3.6
   Fixes :
     1. Player YouTube pas encore prêt → pendingTrack
     2. togglePlaylistPlay défini en double → une seule version
     3. openPlaylistView avant chargement Firestore → guard + retry
     4. Nettoyage titres / artistes YouTube (entités HTML, suffixes parasites, VEVO…)
   ════════════════════════════════════════════════════ */

// ── Firebase Config ──
const firebaseConfig = {
    apiKey:            "AIzaSyANf8hNGIRryPmZytIxIQ4uDhY6fR6uDKM",
    authDomain:        "teslatube-560c0.firebaseapp.com",
    projectId:         "teslatube-560c0",
    storageBucket:     "teslatube-560c0.firebasestorage.app",
    messagingSenderId: "1019331471126",
    appId:             "1:1019331471126:web:29beb2914436836bd41237",
    measurementId:     "G-K05WJMWGGH"
};

const YOUTUBE_API_KEY = "AIzaSyBX9_dZTK6PHaCI9_kOnT4jguY0u64o-54";

// ── Init Firebase ──
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db   = firebase.firestore();

// ── State ──
let player;
let playerReady              = false;
let pendingTrack             = null;
let queue                    = JSON.parse(localStorage.getItem('teslatubeQueue')) || [];
let playlists                = [];
let playlistsLoaded          = false;
let pendingPlaylistOpen      = null;
let historyStack             = [];
let progressInterval;
let isPlaying                = false;
let isMuted                  = false;
let lastVolume               = 100;
let queueVisible             = true;
let currentTrack             = null;
let currentSection           = 'home';
let modalMode                = null;
let openDropdownTrack        = null;
let currentUserId            = null;
let unsubscribePlaylists     = null;
let shuffleMode              = false;
let repeatMode               = false;
const searchCache            = new Map();
let searchTimeout            = null;
let nextPageToken = null;
let lastQuery     = '';

// ── Palette ──
const COLORS = ['#e91429','#503750','#0d73ec','#148a08','#e8115b','#27856a','#8d67ab','#1e3264','#f59b23','#0e6251'];

let recentlyPlayed = JSON.parse(localStorage.getItem('ttRecent') || '[]');
let activeQueueTab = 'queue';
let dragSrcIndex   = null;
let touchSrcIndex  = null;
let touchClone     = null;
let touchOffsetY   = 0;
const MAX_RECENT   = 30;
const MAX_HISTORY  = 8;
const LIKES_NAME   = '❤️ Titres likés';

// ── Sleep timer ──
let sleepTimerTimeout  = null;
let sleepTimerInterval = null;
let sleepEndTime       = null;
let sleepMinutes       = null;

// ── Playlist drag ──
let plDragSrcIndex   = null;
let plDragPlaylistId = null;
let plTouchSrcIndex  = null;
let plTouchClone     = null;
let plTouchOffsetY   = 0;

// ── Video overlay ──
let videoOverlayOpen = false;

/* ═══════════════════════════════════════
   UTILS
════════════════════════════════════════ */
function fmtTime(sec) {
    const m = Math.floor(sec / 60), s = Math.floor(sec % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
}

function calcTotalDuration(tracks) {
    let total = 0;
    tracks.forEach(t => {
        if (!t.duration || t.duration === '--:--') return;
        const parts = t.duration.split(':').map(Number);
        if (parts.length === 3) total += parts[0] * 3600 + parts[1] * 60 + parts[2];
        else if (parts.length === 2) total += parts[0] * 60 + parts[1];
    });
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = Math.floor(total % 60);
    if (h > 0) return `${h} h ${m > 0 ? m + ' min' : ''}`.trim();
    if (m > 0) return `${m} min ${s > 0 ? s + ' sec' : ''}`.trim();
    return `${s} sec`;
}

function esc(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function parseISO8601Duration(iso) {
    const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    if (!m) return '--:--';
    const h   = parseInt(m[1] || 0);
    const min = parseInt(m[2] || 0);
    const sec = parseInt(m[3] || 0);
    return fmtTime(h * 3600 + min * 60 + sec);
}

function formatViews(n) {
    n = parseInt(n) || 0;
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M vues';
    if (n >= 1_000)     return (n / 1_000).toFixed(0) + 'K vues';
    return n + ' vues';
}

/* ═══════════════════════════════════════
   NETTOYAGE TITRE / ARTISTE  (FIX 4)
════════════════════════════════════════ */

/**
 * Décode les entités HTML puis supprime les suffixes
 * parasites courants des titres YouTube.
 */
function cleanTitle(raw) {
    // 1. Décoder les entités HTML (&amp; → &, &#39; → ', &quot; → ", etc.)
    const txt = document.createElement('textarea');
    txt.innerHTML = raw;
    let s = txt.value;

    // 2. Supprimer les blocs entre parenthèses / crochets contenant des mots-clés parasites
    //    On répète 2× pour gérer les cas imbriqués ou consécutifs
    const parasite = /\s*[\[(][^\]\[()]*?(?:official|audio|video|lyric|lyrics|clip\s*officiel|clip|mv|hd|4k|vevo|remaster(?:ed)?|radio\s*edit|extended|visualizer|explicit|clean|version|full\s*album|cover|karaoke|instrumental|slowed|reverb|sped\s*up|nightcore|bass\s*boosted|feat\.|ft\.)[^\]\[()]*[\])]/gi;
    s = s.replace(parasite, '');
    s = s.replace(parasite, '');

    // 3. Supprimer les parenthèses / crochets vides restants
    s = s.replace(/\s*[\[(]\s*[\])]/g, '');

    // 4. Nettoyer espaces multiples et tirets / tirets longs en fin de chaîne
    s = s.replace(/\s{2,}/g, ' ').replace(/[\s–—-]+$/, '').trim();

    return s;
}

/**
 * Décode les entités HTML puis nettoie les suffixes
 * courants des noms de chaînes YouTube.
 */
function cleanArtist(raw) {
    // 1. Décoder les entités HTML
    const txt = document.createElement('textarea');
    txt.innerHTML = raw;
    let s = txt.value;

    // 2. Supprimer les suffixes courants (ordre du plus spécifique au plus général)
    s = s.replace(/VEVO$/i, '');
    s = s.replace(/\s*-\s*Topic$/i, '');
    s = s.replace(/\s*Official\s*(?:Channel|Music|Artist)?$/i, '');
    s = s.replace(/\s*Music$/i, '');
    s = s.replace(/\s*Records?$/i, '');
    s = s.replace(/\s*Entertainment$/i, '');
    s = s.replace(/\s*TV$/i, '');

    // 3. Insérer un espace entre les mots collés en CamelCase (LadyGaga → Lady Gaga)
    //    Ne touche pas les sigles tout-caps (BBC, VEVO…)
    s = s.replace(/([a-zà-ÿ])([A-ZÀ-Ÿ])/g, '$1 $2');

    return s.trim();
}

/* ─────────────────────────────────────
   POCHETTE MOSAÏQUE 2×2
───────────────────────────────────── */
function buildCoverHTML(tracks, color, size = '100%') {
    const imgs = [...new Set(tracks.map(t => t.img).filter(Boolean))].slice(0, 4);
    if (imgs.length === 0) return `<span style="font-size:1.4rem">🎵</span>`;
    if (imgs.length < 4) {
        return `<img src="${imgs[0]}" alt="" style="width:${size};height:${size};object-fit:cover;display:block;">`;
    }
    return `<div style="display:grid;grid-template-columns:1fr 1fr;grid-template-rows:1fr 1fr;width:${size};height:${size};gap:0;overflow:hidden;">
        ${imgs.map(src => `<img src="${src}" alt="" style="width:100%;height:100%;object-fit:cover;display:block;">`).join('')}
    </div>`;
}

/* ═══════════════════════════════════════
   ICÔNES SVG
════════════════════════════════════════ */
function iconPause(size = 22) {
    return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="#000">
        <path d="M5.7 3a.7.7 0 00-.7.7v16.6a.7.7 0 00.7.7h2.6a.7.7 0 00.7-.7V3.7a.7.7 0 00-.7-.7H5.7zm10 0a.7.7 0 00-.7.7v16.6a.7.7 0 00.7.7h2.6a.7.7 0 00.7-.7V3.7a.7.7 0 00-.7-.7h-2.6z"/>
    </svg>`;
}

function iconPlay(size = 22) {
    return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="#000">
        <path d="M7.05 3.606l13.49 7.788a.7.7 0 010 1.212L7.05 20.394A.7.7 0 016 19.788V4.212a.7.7 0 011.05-.606z"/>
    </svg>`;
}

/* ═══════════════════════════════════════
   FIREBASE AUTH — Email/Password
════════════════════════════════════════ */
auth.onAuthStateChanged(user => {
    if (user) {
        currentUserId = user.uid;
        startPlaylistListener();
        showSyncIndicator();
        document.getElementById('auth-modal').style.display = 'none';
    } else {
        showAuthModal();
    }
});

function showAuthModal() {
    document.getElementById('auth-modal').style.display = 'flex';
}

async function login() {
    const email = document.getElementById('auth-email').value.trim();
    const pass  = document.getElementById('auth-pass').value;
    const err   = document.getElementById('auth-error');
    err.textContent = '';
    try {
        await auth.signInWithEmailAndPassword(email, pass);
    } catch (e) {
        err.textContent = 'Email ou mot de passe incorrect.';
    }
}

async function register() {
    const email = document.getElementById('auth-email').value.trim();
    const pass  = document.getElementById('auth-pass').value;
    const err   = document.getElementById('auth-error');
    err.textContent = '';
    if (pass.length < 6) { err.textContent = 'Mot de passe trop court (6 caractères min).'; return; }
    try {
        await auth.createUserWithEmailAndPassword(email, pass);
    } catch (e) {
        err.textContent = e.code === 'auth/email-already-in-use'
            ? 'Email déjà utilisé.'
            : 'Erreur lors de la création du compte.';
    }
}

function logout() {
    auth.signOut();
}

/* ═══════════════════════════════════════
   FIRESTORE
════════════════════════════════════════ */
function startPlaylistListener() {
    if (unsubscribePlaylists) unsubscribePlaylists();

    const ref = db.collection('users').doc(currentUserId)
                  .collection('playlists')
                  .orderBy('createdAt', 'asc');

    unsubscribePlaylists = ref.onSnapshot(snapshot => {
        playlists       = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        playlistsLoaded = true;

        renderLibrary();

        if (currentSection === 'home') {
            renderHome();
        } else if (currentSection.startsWith('playlist:')) {
            const id = currentSection.split(':')[1];
            if (playlists.find(p => p.id === id)) renderPlaylistView(id);
            else showHome();
        }

        if (pendingPlaylistOpen) {
            const id = pendingPlaylistOpen;
            pendingPlaylistOpen = null;
            openPlaylistView(id);
        }
    }, err => {
        console.error('Firestore listener error:', err);
        showToast('Erreur de synchronisation');
    });
}

async function savePlaylistToFirestore(pl) {
    if (!currentUserId) return;
    try {
        await db.collection('users').doc(currentUserId)
                .collection('playlists').doc(pl.id)
                .set({ name: pl.name, color: pl.color, tracks: pl.tracks, createdAt: pl.createdAt });
    } catch (err) {
        console.error('Firestore write error:', err);
        showToast('Erreur de sauvegarde');
    }
}

async function deletePlaylistFromFirestore(id) {
    if (!currentUserId) return;
    try {
        await db.collection('users').doc(currentUserId)
                .collection('playlists').doc(id).delete();
    } catch (err) {
        console.error('Firestore delete error:', err);
        showToast('Erreur de suppression');
    }
}

function showSyncIndicator() {
    const el = document.getElementById('sync-indicator');
    if (el) {
        el.style.display = 'flex';
        setTimeout(() => { el.style.display = 'none'; }, 3000);
    }
}

/* ═══════════════════════════════════════
   YOUTUBE PLAYER
════════════════════════════════════════ */
function onYouTubeIframeAPIReady() {
    player = new YT.Player('player', {
        height: '1',
        width:  '1',
        videoId: '',
        playerVars: {
            playsinline:    1,
            origin:         window.location.origin,
            enablejsapi:    1,
            iv_load_policy: 3,
            rel:            0
        },
        events: {
            onReady: () => {
                setVolume(100);
                playerReady = true;

                if (pendingTrack) {
                    const t      = pendingTrack;
                    pendingTrack = null;
                    playTrack(t);
                }
            },
            onStateChange: onPlayerStateChange,
            onError:       onPlayerError
        }
    });
}

function onPlayerError(event) {
    console.warn('[Player] Erreur YouTube :', event.data);
    setPlayState(false);
    showToast('Erreur de lecture, passage au suivant…');
    setTimeout(() => nextTrack(), 1500);
}

function onPlayerStateChange(event) {
    const S = YT.PlayerState;
    if (event.data === S.ENDED)   handleTrackEnd();
    if (event.data === S.PAUSED)  setPlayState(false);
    if (event.data === S.PLAYING) setPlayState(true);
}

function handleTrackEnd() {
    if (repeatMode && currentTrack) {
        player.seekTo(0, true);
        player.playVideo();
    } else {
        nextTrack();
    }
}

/* ═══════════════════════════════════════
   VIDEO OVERLAY PLEIN ÉCRAN
════════════════════════════════════════ */
function openVideoOverlay() {
    if (!currentTrack) return;

    const overlay  = document.getElementById('video-overlay');
    const screen   = document.getElementById('video-overlay-screen');
    const playerEl = document.getElementById('player');

    screen.appendChild(playerEl);
    playerEl.style.cssText = 'width:100%;height:100%;position:static;display:block;';

    document.getElementById('video-overlay-title').textContent  = currentTrack.title;
    document.getElementById('video-overlay-artist').textContent = currentTrack.artist;

    overlay.style.display = 'flex';
    requestAnimationFrame(() => overlay.classList.add('open'));
    videoOverlayOpen = true;

    document.addEventListener('keydown', onOverlayKey);
}

function closeVideoOverlay() {
    if (!videoOverlayOpen) return;

    const overlay  = document.getElementById('video-overlay');
    const playerEl = document.getElementById('player');
    const wrap     = document.getElementById('player-wrap');

    wrap.appendChild(playerEl);
    playerEl.style.cssText = '';

    overlay.classList.remove('open');
    setTimeout(() => { overlay.style.display = 'none'; }, 300);
    videoOverlayOpen = false;

    document.removeEventListener('keydown', onOverlayKey);
}

function onOverlayKey(e) {
    if (e.key === 'Escape') closeVideoOverlay();
}

/* ═══════════════════════════════════════
   SEARCH
════════════════════════════════════════ */
async function searchMusic(append = false) {
    const q = document.getElementById('search-input').value.trim();
    if (!q) return;

    if (!append || q !== lastQuery) {
        nextPageToken = null;
        lastQuery     = q;
        document.getElementById('results').innerHTML = '';
        document.getElementById('results-placeholder').style.display = 'none';
    }

    if (!append && searchCache.has(q)) {
        const [items, durMap] = searchCache.get(q);
        renderResults(items, durMap, false);
        return;
    }

    showSkeletons(append ? 6 : 18);

    let url = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(q)}&type=video&videoCategoryId=10&maxResults=18&key=${YOUTUBE_API_KEY}`;
    if (append && nextPageToken) url += `&pageToken=${nextPageToken}`;

    try {
        const res  = await fetch(url);
        const data = await res.json();
        if (data.error) {
            document.getElementById('results').innerHTML =
                `<div style="color:#b3b3b3;padding:24px 0;">Erreur : ${data.error.message}</div>`;
            return;
        }

        nextPageToken = data.nextPageToken || null;

        const items      = data.items || [];
        const ids        = items.map(i => i.id.videoId).join(',');
        const detailsUrl = `https://www.googleapis.com/youtube/v3/videos?part=contentDetails,statistics&id=${ids}&key=${YOUTUBE_API_KEY}`;
        const details    = await (await fetch(detailsUrl)).json();
        const durMap     = {};
        (details.items || []).forEach(v => {
            durMap[v.id] = {
                duration: parseISO8601Duration(v.contentDetails.duration),
                views:    formatViews(v.statistics?.viewCount)
            };
        });

        if (!append) {
            searchCache.set(q, [items, durMap]);
            addToSearchHistory(q);
        }

        renderResults(items, durMap, append);
    } catch (e) {
        document.getElementById('results').innerHTML =
            '<div style="color:#b3b3b3;padding:24px 0;">Erreur réseau.</div>';
    }
}

function renderResults(items, durMap = {}, append = false) {
    const container = document.getElementById('results');

    document.getElementById('load-more-wrap')?.remove();

    if (append) {
        container.querySelectorAll('.skeleton-card').forEach(el => el.remove());
    } else {
        container.innerHTML = '';
    }

    items.forEach(item => {
        const info = durMap[item.id.videoId] || {};

        // FIX 4 : nettoyage titre et artiste
        const t = {
            id:       item.id.videoId,
            title:    cleanTitle(item.snippet.title),
            artist:   cleanArtist(item.snippet.channelTitle),
            img:      item.snippet.thumbnails.high?.url || item.snippet.thumbnails.medium.url,
            duration: info.duration || '--:--',
            views:    info.views    || ''
        };

        const div = document.createElement('div');
        div.className = 'track-card';
        div.innerHTML = `
            <div class="card-img-wrap">
                <img src="${t.img}" alt="" loading="lazy">
                <button class="card-play-btn">
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="#000"><path d="M7.05 3.606l13.49 7.788a.7.7 0 010 1.212L7.05 20.394A.7.7 0 016 19.788V4.212a.7.7 0 011.05-.606z"/></svg>
                </button>
                <button class="card-options-btn" title="Plus d'options">•••</button>
            </div>
            <h4 title="${esc(t.title)}">${esc(t.title)}</h4>
            <p class="card-artist-link" title="Voir plus de ${esc(t.artist)}">${esc(t.artist)}</p>`;

        div.addEventListener('click', () => playTrack(t));
        div.querySelector('.card-play-btn').addEventListener('click', e => {
            e.stopPropagation(); playTrack(t);
        });
        div.querySelector('.card-options-btn').addEventListener('click', e => {
            e.stopPropagation(); openTrackDropdown(e, t);
        });

        div.querySelector('.card-artist-link').addEventListener('click', e => {
            e.stopPropagation(); searchByArtist(t.artist);
        });

        container.appendChild(div);
    });

    if (nextPageToken) {
        const wrap = document.createElement('div');
        wrap.id = 'load-more-wrap';
        wrap.style.cssText = 'grid-column:1/-1;display:flex;justify-content:center;padding:16px 0 8px;';
        wrap.innerHTML = `<button onclick="searchMusic(true)" style="
            background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.13);
            color:#fff;border-radius:500px;padding:10px 32px;
            font-size:.84rem;font-weight:700;font-family:inherit;cursor:pointer;
            transition:background .15s;
        " onmouseover="this.style.background='rgba(255,255,255,.13)'"
           onmouseout="this.style.background='rgba(255,255,255,.07)'">
            Charger plus
        </button>`;
        container.appendChild(wrap);
    }
}

function searchByArtist(artistName) {
    showSearch();
    document.getElementById('search-input').value = artistName;
    document.getElementById('search-clear').style.display = 'inline-flex';
    document.getElementById('results-placeholder').style.display = 'none';
    searchMusic();
    showToast(`🎤 Résultats pour « ${artistName} »`);
}

/* ═══════════════════════════════════════
   PLAYBACK
════════════════════════════════════════ */
function playTrack(t) {
    if (!playerReady || !player || !player.loadVideoById) {
        pendingTrack = t;
        showToast('Chargement du lecteur…');
        return;
    }

    if (currentTrack) historyStack.push(currentTrack);
    currentTrack = t;
    player.loadVideoById(t.id);
    updatePlayerBar(t);
    setPlayState(true);
    clearInterval(progressInterval);
    progressInterval = setInterval(updateProgress, 500);
    document.title = `${t.title} — Teslatube`;
    addToRecentlyPlayed(t);
    updateHeartState(t);
    if (activeQueueTab === 'recent') renderRecentlyPlayed();
    renderCurrentPlaylistHighlight();
    updateMediaSession(t);
}

function updatePlayerBar(t) {
    document.getElementById('current-track-title').textContent  = t.title;
    document.getElementById('current-track-artist').textContent = t.artist;

    const imgEl   = document.getElementById('current-track-img');
    const pholder = document.getElementById('thumb-placeholder');
    if (t.img) {
        imgEl.src = t.img;
        imgEl.style.display   = 'block';
        pholder.style.display = 'none';
    } else {
        imgEl.style.display   = 'none';
        pholder.style.display = 'flex';
    }

    const thumb = document.querySelector('.player-thumb');
    thumb.style.cursor = 'pointer';
    thumb.title = 'Voir la vidéo';
    thumb.onclick = () => { if (currentTrack) openVideoOverlay(); };

    if (videoOverlayOpen) {
        document.getElementById('video-overlay-title').textContent  = t.title;
        document.getElementById('video-overlay-artist').textContent = t.artist;
    }
}

/* ═══════════════════════════════════════
   SET PLAY STATE
════════════════════════════════════════ */
function setPlayState(playing) {
    isPlaying = playing;
    document.getElementById('icon-play').style.display  = playing ? 'none'  : 'block';
    document.getElementById('icon-pause').style.display = playing ? 'block' : 'none';
    updatePlaylistPlayBtn();
}

function togglePlay() {
    if (!player || !player.getPlayerState) return;
    player.getPlayerState() === 1 ? player.pauseVideo() : player.playVideo();
}

function nextTrack() {
    if (queue.length === 0) {
        showToast('File d\'attente vide');
        return;
    }
    let next;
    if (shuffleMode) {
        const idx = Math.floor(Math.random() * queue.length);
        next = queue.splice(idx, 1)[0];
    } else {
        next = queue.shift();
    }
    saveQueue();
    playTrack(next);
    renderQueue();
}

function prevTrack() {
    if (historyStack.length > 0) {
        if (currentTrack) queue.unshift(currentTrack);
        currentTrack = null;
        saveQueue();
        renderQueue();
        playTrack(historyStack.pop());
    } else if (player && player.seekTo) {
        player.seekTo(0, true);
    }
}

/* ═══════════════════════════════════════
   PLAYLIST PLAY BUTTON
════════════════════════════════════════ */
function isPlaylistPlaying(id) {
    if (!currentTrack) return false;
    const pl = playlists.find(p => p.id === id);
    if (!pl) return false;
    return isPlaying && pl.tracks.some(t => t.id === currentTrack.id);
}

function updatePlaylistPlayBtn() {
    if (!currentSection.startsWith('playlist:')) return;
    const id  = currentSection.split(':')[1];
    const btn = document.getElementById(`btn-play-playlist-${id}`);
    if (!btn) return;
    btn.innerHTML = isPlaylistPlaying(id) ? iconPause() : iconPlay();
}

function togglePlaylistPlay(id) {
    const pl = playlists.find(p => p.id === id);
    if (!pl || pl.tracks.length === 0) return;

    const plHasCurrent = currentTrack && pl.tracks.some(t => t.id === currentTrack.id);

    if (plHasCurrent && isPlaying) {
        if (player && player.pauseVideo) player.pauseVideo();
    } else if (plHasCurrent && !isPlaying) {
        if (player && player.playVideo) player.playVideo();
    } else {
        playPlaylist(id);
    }
}

/* ═══════════════════════════════════════
   MEDIA SESSION API
════════════════════════════════════════ */
function updateMediaSession(t) {
    if (!('mediaSession' in navigator)) return;
    navigator.mediaSession.metadata = new MediaMetadata({
        title:   t.title,
        artist:  t.artist,
        album:   'TeslaTube',
        artwork: [{ src: t.img, sizes: '320x180', type: 'image/jpeg' }]
    });
    navigator.mediaSession.setActionHandler('play',          () => { if (player) player.playVideo(); });
    navigator.mediaSession.setActionHandler('pause',         () => { if (player) player.pauseVideo(); });
    navigator.mediaSession.setActionHandler('nexttrack',     () => nextTrack());
    navigator.mediaSession.setActionHandler('previoustrack', () => prevTrack());
}

/* ═══════════════════════════════════════
   PROGRESS
════════════════════════════════════════ */
function updateProgress() {
    if (!player || !player.getCurrentTime) return;
    const cur = player.getCurrentTime();
    const dur = player.getDuration();
    if (dur > 0) {
        const pct = (cur / dur) * 100;
        setBarFill('progress-bar', pct);
        document.getElementById('time-current').textContent = fmtTime(cur);
        document.getElementById('time-total').textContent   = fmtTime(dur);
    }
}

document.getElementById('progress-bar').addEventListener('input', function () {
    if (!player || !player.getDuration) return;
    player.seekTo((this.value / 100) * player.getDuration(), true);
    setBarFill('progress-bar', +this.value);
});

/* ═══════════════════════════════════════
   VOLUME
════════════════════════════════════════ */
document.getElementById('volume-bar').addEventListener('input', function () {
    setVolume(+this.value);
    isMuted = +this.value === 0;
    syncVolIcon();
});

function setVolume(vol) {
    document.getElementById('volume-bar').value = vol;
    setBarFill('volume-bar', vol);
    if (player && player.setVolume) player.setVolume(vol);
}

function toggleMute() {
    if (isMuted) {
        isMuted = false;
        setVolume(lastVolume || 100);
    } else {
        lastVolume = +document.getElementById('volume-bar').value || 100;
        isMuted    = true;
        setVolume(0);
    }
    syncVolIcon();
}

function syncVolIcon() {
    document.getElementById('icon-vol-on').style.display  = isMuted ? 'none'  : 'block';
    document.getElementById('icon-vol-off').style.display = isMuted ? 'block' : 'none';
}

/* ═══════════════════════════════════════
   BAR FILL HELPER
════════════════════════════════════════ */
function setBarFill(id, pct) {
    const el = document.getElementById(id);
    if (!el) return;
    const color = el.matches(':hover') ? '#1db954' : '#ffffff';
    el.style.background = `linear-gradient(to right,${color} ${pct}%,#535353 ${pct}%)`;
    el.dataset.pct = pct;
}

['progress-bar', 'volume-bar'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('mouseenter', () => {
        const p = el.dataset.pct || el.value;
        el.style.background = `linear-gradient(to right,#1db954 ${p}%,#535353 ${p}%)`;
    });
    el.addEventListener('mouseleave', () => {
        const p = el.dataset.pct || el.value;
        el.style.background = `linear-gradient(to right,#ffffff ${p}%,#535353 ${p}%)`;
    });
});

/* ═══════════════════════════════════════
   QUEUE
════════════════════════════════════════ */
function addToQueue(t) {
    queue.push(t);
    saveQueue();
    renderQueue();
    showToast(`« ${t.title.substring(0, 30)}… » ajouté à la file`);
}

function saveQueue() {
    localStorage.setItem('teslatubeQueue', JSON.stringify(queue));
}

function clearQueue() {
    queue = [];
    saveQueue();
    renderQueue();
}

function renderQueue() {
    const container = document.getElementById('queue-list');
    const countEl   = document.getElementById('playlist-count');
    const n = queue.length;
    countEl.textContent = n === 0
        ? "File d'attente vide"
        : `${n} piste${n > 1 ? 's' : ''} dans la file`;
    container.innerHTML = '';

    queue.forEach((t, i) => {
        const div = document.createElement('div');
        div.className = 'queue-item';
        div.dataset.index = i;
        div.draggable = true;
        div.innerHTML = `
            <span class="queue-drag" title="Déplacer">⠿⠿</span>
            <div class="queue-thumb-wrap">
                <img class="queue-thumb" src="${t.img}" alt="" onerror="this.style.display='none'">
                <div class="queue-play-overlay">
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="#fff"><path d="M7.05 3.606l13.49 7.788a.7.7 0 010 1.212L7.05 20.394A.7.7 0 016 19.788V4.212a.7.7 0 011.05-.606z"/></svg>
                </div>
            </div>
            <div class="queue-info">
                <span class="queue-title">${esc(t.title)}</span>
                <span class="queue-artist">${esc(t.artist)}</span>
            </div>
            <span class="queue-duration">${t.duration || '--:--'}</span>
            <button class="queue-more-btn" title="Supprimer">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M5.25 5.25a.75.75 0 000 1.5h.75v11.25A2.25 2.25 0 008.25 20.25h7.5A2.25 2.25 0 0018 18V6.75h.75a.75.75 0 000-1.5H5.25zm2.25 1.5h9V18a.75.75 0 01-.75.75h-7.5a.75.75 0 01-.75-.75V6.75zm2.25-3a.75.75 0 000 1.5h3a.75.75 0 000-1.5h-3z"/></svg>
            </button>`;

        div.addEventListener('dragstart', onDragStart);
        div.addEventListener('dragover',  onDragOver);
        div.addEventListener('drop',      onDrop);
        div.addEventListener('dragend',   onDragEnd);
        div.querySelector('.queue-drag').addEventListener('touchstart', e => onTouchDragStart(e, i), { passive: true });
        div.addEventListener('touchmove',  onTouchDragMove, { passive: false });
        div.addEventListener('touchend',   onTouchDragEnd);
        div.addEventListener('click', () => {
            queue.splice(i, 1); saveQueue(); playTrack(t); renderQueue();
        });
        div.querySelector('.queue-more-btn').addEventListener('click', e => {
            e.stopPropagation(); queue.splice(i, 1); saveQueue(); renderQueue();
        });
        container.appendChild(div);
    });
}

function toggleQueue() {
    queueVisible = !queueVisible;
    document.getElementById('app').classList.toggle('queue-hidden', !queueVisible);
    document.getElementById('btn-queue-toggle').classList.toggle('active', queueVisible);
}

/* ═══════════════════════════════════════
   PLAYLIST CRUD
════════════════════════════════════════ */
async function createPlaylist(name) {
    const id    = 'pl_' + Date.now();
    const color = COLORS[playlists.length % COLORS.length];
    const pl    = { id, name, color, tracks: [], createdAt: Date.now() };
    playlists.push(pl);
    renderLibrary();
    await savePlaylistToFirestore(pl);
    showToast(`Playlist « ${name} » créée`);
    return id;
}

async function renamePlaylist(id, newName) {
    const pl = playlists.find(p => p.id === id);
    if (!pl) return;
    pl.name = newName;
    renderLibrary();
    if (currentSection === `playlist:${id}`) renderPlaylistView(id);
    await savePlaylistToFirestore(pl);
    showToast('Playlist renommée');
}

async function deletePlaylist(id) {
    const pl = playlists.find(p => p.id === id);
    if (!pl) return;
    if (!confirm(`Supprimer la playlist « ${pl.name} » ? Cette action est irréversible.`)) return;
    playlists = playlists.filter(p => p.id !== id);
    renderLibrary();
    if (currentSection === `playlist:${id}`) showHome();
    await deletePlaylistFromFirestore(id);
    showToast('Playlist supprimée');
}

async function addTrackToPlaylist(playlistId, track) {
    const pl = playlists.find(p => p.id === playlistId);
    if (!pl) return;
    if (pl.tracks.find(t => t.id === track.id)) { showToast('Déjà dans cette playlist'); return; }
    pl.tracks.push(track);
    if (currentSection === `playlist:${playlistId}`) renderPlaylistView(playlistId);
    renderLibrary();
    await savePlaylistToFirestore(pl);
    showToast(`Ajouté à « ${pl.name} »`);
}

async function removeTrackFromPlaylist(playlistId, trackIndex) {
    const pl = playlists.find(p => p.id === playlistId);
    if (!pl) return;
    pl.tracks.splice(trackIndex, 1);
    renderPlaylistView(playlistId);
    renderLibrary();
    await savePlaylistToFirestore(pl);
}

/* ═══════════════════════════════════════
   LIBRARY SIDEBAR
════════════════════════════════════════ */
function renderLibrary() {
    const list  = document.getElementById('lib-list');
    const empty = document.getElementById('lib-empty');
    list.innerHTML = '';

    if (playlists.length === 0) {
        empty.style.display = 'block';
        return;
    }
    empty.style.display = 'none';

    playlists.forEach(pl => {
        const div = document.createElement('div');
        div.className = 'lib-item' + (currentSection === `playlist:${pl.id}` ? ' active' : '');

        const coverHTML = buildCoverHTML(pl.tracks, pl.color, '100%');
        div.innerHTML = `
            <div class="lib-item-thumb" style="background:${pl.color};overflow:hidden;">${coverHTML}</div>
            <div class="lib-item-info">
                <span class="lib-item-name">${esc(pl.name)}</span>
                <span class="lib-item-meta">Playlist · ${pl.tracks.length} piste${pl.tracks.length !== 1 ? 's' : ''}</span>
            </div>
            <button class="lib-item-more" title="Options">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M4.5 13.5a1.5 1.5 0 110-3 1.5 1.5 0 010 3zm15 0a1.5 1.5 0 110-3 1.5 1.5 0 010 3zm-7.5 0a1.5 1.5 0 110-3 1.5 1.5 0 010 3z"/></svg>
            </button>`;
        div.addEventListener('click', () => openPlaylistView(pl.id));
        div.querySelector('.lib-item-more').addEventListener('click', e => {
            e.stopPropagation();
            openPlaylistOptionsDropdown(e, pl.id);
        });
        list.appendChild(div);
    });
}

function focusLibrary() {
    const sidebar = document.querySelector('.sidebar');
    const isOpen  = sidebar.classList.contains('mobile-open');
    if (isOpen) { sidebar.classList.remove('mobile-open'); return; }
    sidebar.classList.add('mobile-open');
    renderLibrary();
    setTimeout(() => {
        sidebar.querySelectorAll('.lib-item').forEach(item => {
            item.addEventListener('click', () => sidebar.classList.remove('mobile-open'), { once: true });
        });
    }, 50);
    const closeOnOutside = (e) => {
        if (!sidebar.contains(e.target) && !e.target.closest('.bottom-nav')) {
            sidebar.classList.remove('mobile-open');
            document.removeEventListener('click', closeOnOutside);
        }
    };
    setTimeout(() => document.addEventListener('click', closeOnOutside), 100);
}

function filterLib(type, btn) {
    document.querySelectorAll('.lib-chip').forEach(c => c.classList.remove('active'));
    btn.classList.add('active');
}

/* ═══════════════════════════════════════
   PAGE D'ACCUEIL
════════════════════════════════════════ */
function showHome() {
    currentSection = 'home';
    document.querySelector('.sidebar')?.classList.remove('mobile-open');
    document.getElementById('home-section').style.display          = 'block';
    document.getElementById('search-section').style.display        = 'none';
    document.getElementById('playlist-view-section').style.display = 'none';
    document.querySelector('.main-content').style.background =
        'linear-gradient(180deg, #0f2a1a 0%, var(--bg-surface) 420px)';
    renderHome();
    renderLibrary();
    document.querySelector('.main-content').scrollTop = 0;
}

function renderHome() {
    const container = document.getElementById('home-content');
    if (!container) return;

    const user    = auth.currentUser;
    const prenom  = user?.email?.split('@')[0] || 'vous';
    const recent  = recentlyPlayed.slice(0, 12);
    const history = JSON.parse(localStorage.getItem('ttHistory') || '[]');
    const isEmpty = playlists.length === 0 && recent.length === 0;

    const h     = new Date().getHours();
    const salut = h < 12 ? 'Bonjour' : h < 18 ? 'Bon après-midi' : 'Bonsoir';

    let html = `<div class="home-hero">
        <h1 class="home-greeting">${salut}, <span>${esc(prenom)}</span> 👋</h1>
    </div>`;

    if (isEmpty) {
        html += `<div class="home-onboarding">
            <div class="home-onboarding-icon">🎵</div>
            <h2>Bienvenue sur TeslaTube</h2>
            <p>Recherchez vos artistes préférés, créez des playlists et retrouvez tout ici.</p>
            <button class="btn-pill-white" onclick="focusSearch()">Commencer à écouter</button>
        </div>`;
    } else {
        if (playlists.length > 0) {
            html += `<div class="home-section">
                <div class="home-section-header">
                    <h2 class="home-section-title">Vos playlists</h2>
                    <button class="home-see-all" onclick="focusLibrary()">Tout voir</button>
                </div>
                <div class="home-grid">`;
            playlists.slice(0, 6).forEach(pl => {
                const cover = buildCoverHTML(pl.tracks, pl.color, '100%');
                html += `<div class="home-pl-card" onclick="openPlaylistView('${pl.id}')">
                    <div class="home-pl-art" style="background:${pl.color};overflow:hidden;">${cover}</div>
                    <span class="home-pl-name">${esc(pl.name)}</span>
                    <span class="home-pl-meta">${pl.tracks.length} piste${pl.tracks.length !== 1 ? 's' : ''}</span>
                </div>`;
            });
            html += `</div></div>`;
        }

        if (recent.length > 0) {
            html += `<div class="home-section">
                <h2 class="home-section-title">Récemment joués</h2>
                <div class="home-scroll-row">`;
            recent.forEach(t => {
                html += `<div class="home-track-card" onclick='playTrack(${JSON.stringify(t)})'>
                    <div class="home-track-img-wrap">
                        <img src="${esc(t.img)}" alt="" loading="lazy">
                        <div class="home-track-play">
                            <svg viewBox="0 0 24 24" width="18" height="18" fill="#000"><path d="M7.05 3.606l13.49 7.788a.7.7 0 010 1.212L7.05 20.394A.7.7 0 016 19.788V4.212a.7.7 0 011.05-.606z"/></svg>
                        </div>
                    </div>
                    <span class="home-track-title">${esc(t.title)}</span>
                    <span class="home-track-artist">${esc(t.artist)}</span>
                </div>`;
            });
            html += `</div></div>`;
        }

        if (history.length > 0) {
            html += `<div class="home-section">
                <h2 class="home-section-title">Recherches récentes</h2>
                <div class="home-chips">`;
            history.forEach(q => {
                html += `<button class="home-chip" onclick="replaySearchFromHome(${JSON.stringify(esc(q))})">
                    <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor"><path d="M10.533 1.279c-5.18 0-9.407 4.226-9.407 9.407 0 5.18 4.226 9.407 9.407 9.407 2.19 0 4.2-.755 5.8-2.02l4.996 4.997a1 1 0 001.414-1.414l-4.994-4.994a9.368 9.368 0 002.191-6.976 9.407 9.407 0 00-9.407-9.407zm-7.407 9.407a7.407 7.407 0 1114.814 0 7.407 7.407 0 01-14.814 0z"/></svg>
                    ${esc(q)}
                </button>`;
            });
            html += `</div></div>`;
        }
    }

    container.innerHTML = html;
}

function replaySearchFromHome(q) {
    showSearch();
    document.getElementById('search-input').value = q;
    document.getElementById('search-clear').style.display = 'inline-flex';
    document.getElementById('results-placeholder').style.display = 'none';
    searchMusic();
}

/* ═══════════════════════════════════════
   PLAYLIST VIEW
════════════════════════════════════════ */
function openPlaylistView(id) {
    if (!playlistsLoaded) {
        pendingPlaylistOpen = id;
        showToast('Chargement de la bibliothèque…');
        return;
    }

    const pl = playlists.find(p => p.id === id);
    if (!pl) {
        showToast('Playlist introuvable');
        return;
    }

    currentSection = `playlist:${id}`;
    document.getElementById('home-section').style.display          = 'none';
    document.getElementById('search-section').style.display        = 'none';
    document.getElementById('playlist-view-section').style.display = 'block';
    document.querySelector('.main-content').style.background =
        `linear-gradient(180deg, ${pl.color}88 0%, var(--bg-surface) 38%)`;
    renderPlaylistView(id);
    renderLibrary();
    document.querySelector('.main-content').scrollTop = 0;
}

function renderPlaylistView(id) {
    const pl = playlists.find(p => p.id === id);
    if (!pl) return;

    const coverHTML  = buildCoverHTML(pl.tracks, pl.color, '100%');
    const nowPlaying = isPlaylistPlaying(id);

    document.getElementById('pl-hero').innerHTML = `
        <div class="pl-hero-art" style="background:${pl.color};overflow:hidden;">${coverHTML}</div>
        <div class="pl-hero-info">
            <p class="pl-hero-type">Playlist</p>
            <h1 class="pl-hero-name" id="pl-editable-name" contenteditable="true" spellcheck="false">${esc(pl.name)}</h1>
            <p class="pl-hero-meta"><strong>${pl.tracks.length}</strong> piste${pl.tracks.length !== 1 ? 's' : ''} · ${calcTotalDuration(pl.tracks)}</p>
        </div>`;

    const nameEl = document.getElementById('pl-editable-name');
    nameEl.addEventListener('blur', () => {
        const newName = nameEl.textContent.trim();
        if (newName && newName !== pl.name) renamePlaylist(id, newName);
    });
    nameEl.addEventListener('keydown', e => {
        if (e.key === 'Enter') { e.preventDefault(); nameEl.blur(); }
    });

    document.getElementById('pl-controls').innerHTML = `
        <button class="btn-play-big" id="btn-play-playlist-${id}" onclick="togglePlaylistPlay('${id}')">
            ${nowPlaying ? iconPause() : iconPlay()}
        </button>
        <button class="btn-shuffle-big" onclick="shufflePlaylist('${id}')" title="Lecture aléatoire">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M16.464 3.162A1 1 0 0117 4v1.5l1.293-1.293a1 1 0 011.414 1.414L17.414 7.5 19 7.5a1 1 0 110 2l-3 .001a1 1 0 01-.707-.294L13.586 7.5h-1.672A6.972 6.972 0 0110 9.207V7.586l.293-.293A4.972 4.972 0 0113.914 6H16V4a1 1 0 01.464-.838zM10 14.793a6.972 6.972 0 01-1.914 1.621L7.793 16.707 8 16.914V19a1 1 0 01-2 0v-1.5l-1.293 1.293a1 1 0 01-1.414-1.414L4.586 16.5 3 16.5a1 1 0 110-2l3-.001a1 1 0 01.707.294l1.707 1.707h1.672A6.972 6.972 0 0112 14.793v2.035l-.293.293A4.972 4.972 0 018.086 18H6v2a1 1 0 01-1.464.836zM17 16v1.5l1.707-1.707a1 1 0 011.414 0l.586.586a1 1 0 010 1.414L19 19.5l-1.293 1.293A1 1 0 0116 20v-2.086a4.972 4.972 0 01-3.414-2.121l-.293-.293V13.5a6.972 6.972 0 011.914 1.621L15.5 16.414l.207-.207A1 1 0 0117 16zM7 8v-2a1 1 0 00-2 0v1.5L3.707 6.207a1 1 0 00-1.414 1.414L3.586 8.914 3 8.914a1 1 0 000 2l3 .001a1 1 0 00.707-.294L8.414 9.914H10.086A6.972 6.972 0 0110 8.293v-.707A4.972 4.972 0 017.086 10H5V8z"/></svg>
        </button>
        <button class="btn-ctrl-big" title="Options" onclick="openPlaylistOptionsDropdown(event,'${id}')">
            <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M4.5 13.5a1.5 1.5 0 110-3 1.5 1.5 0 010 3zm15 0a1.5 1.5 0 110-3 1.5 1.5 0 010 3zm-7.5 0a1.5 1.5 0 110-3 1.5 1.5 0 010 3z"/></svg>
        </button>`;

    const listEl = document.getElementById('pl-track-list');
    listEl.innerHTML = '';

    if (pl.tracks.length === 0) {
        listEl.innerHTML = `<p style="color:var(--text-sub);padding:24px 16px;font-size:.9rem;">Playlist vide. Recherchez des musiques et ajoutez-les !</p>`;
        return;
    }

    pl.tracks.forEach((t, i) => {
        const isTrackPlaying = currentTrack && currentTrack.id === t.id;
        const div = document.createElement('div');
        div.className = 'pl-track-row' + (isTrackPlaying ? ' playing' : '');
        div.dataset.index = i;
        div.draggable = true;
        div.innerHTML = `
            <span class="pl-drag-handle" title="Réorganiser">⠿⠿</span>
            <div class="pl-tr-num">
                <span>${i + 1}</span>
                <div class="pl-tr-bars" style="${isTrackPlaying ? 'display:flex' : ''}">
                    <span style="height:8px"></span><span style="height:14px"></span><span style="height:6px"></span>
                </div>
            </div>
            <div class="pl-tr-info">
                <img class="pl-tr-thumb" src="${t.img}" alt="" onerror="this.style.display='none'">
                <div class="pl-tr-text">
                    <span class="pl-tr-title">${esc(t.title)}</span>
                    <span class="pl-tr-artist">${esc(t.artist)}</span>
                </div>
            </div>
            <span class="pl-tr-artist-col">${esc(t.artist)}</span>
            <div class="pl-tr-dur-wrap">
                <button class="pl-tr-remove" title="Retirer">
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M5.25 5.25a.75.75 0 000 1.5h.75v11.25A2.25 2.25 0 008.25 20.25h7.5A2.25 2.25 0 0018 18V6.75h.75a.75.75 0 000-1.5H5.25zm2.25 1.5h9V18a.75.75 0 01-.75.75h-7.5a.75.75 0 01-.75-.75V6.75zm2.25-3a.75.75 0 000 1.5h3a.75.75 0 000-1.5h-3z"/></svg>
                </button>
                <span class="pl-tr-dur">${t.duration || '--:--'}</span>
            </div>`;

        div.addEventListener('dragstart', e => onPlDragStart(e, id, i));
        div.addEventListener('dragover',  onPlDragOver);
        div.addEventListener('drop',      e => onPlDrop(e, id, i));
        div.addEventListener('dragend',   onPlDragEnd);
        div.querySelector('.pl-drag-handle').addEventListener('touchstart', e => onPlTouchStart(e, id, i), { passive: true });
        div.addEventListener('touchmove', onPlTouchMove, { passive: false });
        div.addEventListener('touchend',  onPlTouchEnd);
        div.addEventListener('click', () => {
            playTrack(t);
            queue = [...pl.tracks.slice(i + 1)];
            saveQueue();
            renderQueue();
        });
        div.querySelector('.pl-tr-remove').addEventListener('click', e => {
            e.stopPropagation();
            removeTrackFromPlaylist(id, i);
        });
        listEl.appendChild(div);
    });
}

function renderCurrentPlaylistHighlight() {
    if (!currentSection.startsWith('playlist:')) return;
    const id = currentSection.split(':')[1];
    const pl = playlists.find(p => p.id === id);
    if (!pl) return;
    document.querySelectorAll('.pl-track-row').forEach((row, i) => {
        const t = pl.tracks[i];
        const playing = !!(t && currentTrack && t.id === currentTrack.id);
        row.classList.toggle('playing', playing);
    });
    const metaEl = document.querySelector('.pl-hero-meta');
    if (metaEl) {
        metaEl.innerHTML = `<strong>${pl.tracks.length}</strong> piste${pl.tracks.length !== 1 ? 's' : ''} · ${calcTotalDuration(pl.tracks)}`;
    }
    updatePlaylistPlayBtn();
}

function playPlaylist(id) {
    const pl = playlists.find(p => p.id === id);
    if (!pl || pl.tracks.length === 0) return;
    queue = [...pl.tracks.slice(1)];
    saveQueue();
    renderQueue();
    playTrack(pl.tracks[0]);
}

function shufflePlaylist(id) {
    const pl = playlists.find(p => p.id === id);
    if (!pl || pl.tracks.length === 0) return;
    const shuffled = [...pl.tracks].sort(() => Math.random() - .5);
    queue = shuffled.slice(1);
    saveQueue();
    renderQueue();
    playTrack(shuffled[0]);
}

/* ═══════════════════════════════════════
   DROPDOWN CONTEXT MENU
════════════════════════════════════════ */
function openTrackDropdown(e, track) {
    e.preventDefault();
    openDropdownTrack = track;
    const menu  = document.getElementById('dropdown-menu');
    const inner = document.getElementById('dropdown-inner');

    let html = `
        <button class="dd-item" onclick="addToQueue(openDropdownTrack); closeDropdown()">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M15 4a1 1 0 100 2h6a1 1 0 100-2h-6zm0 5a1 1 0 100 2h6a1 1 0 100-2h-6zm0 5a1 1 0 100 2h6a1 1 0 100-2h-6z"/></svg>
            Ajouter à la file d'attente
        </button>
        <button class="dd-item" onclick="playTrack(openDropdownTrack); closeDropdown()">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M7.05 3.606l13.49 7.788a.7.7 0 010 1.212L7.05 20.394A.7.7 0 016 19.788V4.212a.7.7 0 011.05-.606z"/></svg>
            Lire maintenant
        </button>
        <div class="dd-separator"></div>
        <div class="dd-sub-label">Ajouter à une playlist</div>`;

    if (playlists.length === 0) {
        html += `<p style="padding:8px 16px;font-size:.8rem;color:var(--text-sub);">Aucune playlist</p>`;
    } else {
        playlists.forEach(pl => {
            const miniCover = buildCoverHTML(pl.tracks, pl.color, '20px');
            html += `<button class="dd-item" onclick="addTrackToPlaylist('${pl.id}', openDropdownTrack); closeDropdown()">
                <div style="width:20px;height:20px;border-radius:3px;background:${pl.color};flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:.6rem;overflow:hidden;">${miniCover}</div>
                ${esc(pl.name)}
            </button>`;
        });
    }

    html += `
        <div class="dd-separator"></div>
        <button class="dd-item" onclick="openCreateModalAndAdd(openDropdownTrack); closeDropdown()">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M11 11V3h2v8h8v2h-8v8h-2v-8H3v-2z"/></svg>
            Nouvelle playlist
        </button>`;

    inner.innerHTML = html;
    positionDropdown(menu, e);
    menu.classList.add('open');
}

function openPlaylistOptionsDropdown(e, playlistId) {
    e.stopPropagation();
    const menu  = document.getElementById('dropdown-menu');
    const inner = document.getElementById('dropdown-inner');
    const pl    = playlists.find(p => p.id === playlistId);
    if (!pl) return;

    inner.innerHTML = `
        <button class="dd-item" onclick="openPlaylistView('${pl.id}'); closeDropdown()">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M15 4a1 1 0 100 2h6a1 1 0 100-2h-6zm0 5a1 1 0 100 2h6a1 1 0 100-2h-6zm0 5a1 1 0 100 2h6a1 1 0 100-2h-6zM6 4a1 1 0 00-1 1v8.5a2.5 2.5 0 101 0V5a1 1 0 00-1-1z"/></svg>
            Ouvrir la playlist
        </button>
        <button class="dd-item" onclick="playPlaylist('${pl.id}'); closeDropdown()">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M7.05 3.606l13.49 7.788a.7.7 0 010 1.212L7.05 20.394A.7.7 0 016 19.788V4.212a.7.7 0 011.05-.606z"/></svg>
            Lire
        </button>
        <button class="dd-item" onclick="shufflePlaylist('${pl.id}'); closeDropdown()">Lecture aléatoire</button>
        <div class="dd-separator"></div>
        <button class="dd-item" onclick="openRenameModal('${pl.id}'); closeDropdown()">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M16.707 3.293a1 1 0 00-1.414 0L3 15.586V19a1 1 0 001 1h3.414l12.293-12.293a1 1 0 000-1.414l-2-2zM4 17.414L14.293 7.121l1.586 1.586L5.586 19H4v-1.586z"/></svg>
            Renommer
        </button>
        <button class="dd-item dd-danger" onclick="deletePlaylist('${pl.id}'); closeDropdown()">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M5.25 5.25a.75.75 0 000 1.5h.75v11.25A2.25 2.25 0 008.25 20.25h7.5A2.25 2.25 0 0018 18V6.75h.75a.75.75 0 000-1.5H5.25zm2.25 1.5h9V18a.75.75 0 01-.75.75h-7.5a.75.75 0 01-.75-.75V6.75zm2.25-3a.75.75 0 000 1.5h3a.75.75 0 000-1.5h-3z"/></svg>
            Supprimer la playlist
        </button>`;
    positionDropdown(menu, e);
    menu.classList.add('open');
}

function positionDropdown(menu, e) {
    menu.style.top  = '0px';
    menu.style.left = '0px';
    document.body.appendChild(menu);
    const x  = e.clientX, y = e.clientY;
    const mw = 220, mh = menu.scrollHeight || 300;
    menu.style.left = `${Math.min(x, window.innerWidth  - mw - 8)}px`;
    menu.style.top  = `${Math.min(y, window.innerHeight - mh - 8)}px`;
}

function closeDropdown() {
    document.getElementById('dropdown-menu').classList.remove('open');
}

document.addEventListener('click', () => closeDropdown());
document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { closeDropdown(); closeModal(); closeVideoOverlay(); }
});

/* ═══════════════════════════════════════
   MODAL
════════════════════════════════════════ */
let pendingTrackForNewPlaylist = null;

function openCreateModal() {
    pendingTrackForNewPlaylist = null;
    modalMode = { action: 'create' };
    document.getElementById('modal-title').textContent = 'Créer une playlist';
    document.getElementById('modal-sub').textContent   = 'Donnez un nom à votre nouvelle playlist.';
    const input = document.getElementById('modal-input');
    input.value = `Ma playlist #${playlists.length + 1}`;
    document.getElementById('modal-confirm-btn').textContent = 'Créer';
    document.getElementById('modal-confirm-btn').onclick = confirmModal;
    document.getElementById('modal-overlay').classList.add('open');
    setTimeout(() => { input.focus(); input.select(); }, 50);
}

function openCreateModalAndAdd(track) {
    pendingTrackForNewPlaylist = track;
    openCreateModal();
}

function openRenameModal(playlistId) {
    const pl = playlists.find(p => p.id === playlistId);
    if (!pl) return;
    modalMode = { action: 'rename', playlistId };
    document.getElementById('modal-title').textContent = 'Renommer la playlist';
    document.getElementById('modal-sub').textContent   = '';
    const input = document.getElementById('modal-input');
    input.value = pl.name;
    document.getElementById('modal-confirm-btn').textContent = 'Enregistrer';
    document.getElementById('modal-confirm-btn').onclick = confirmModal;
    document.getElementById('modal-overlay').classList.add('open');
    setTimeout(() => { input.focus(); input.select(); }, 50);
}

async function confirmModal() {
    const name = document.getElementById('modal-input').value.trim();
    if (!name) return;
    if (modalMode.action === 'create') {
        const id = await createPlaylist(name);
        if (pendingTrackForNewPlaylist) {
            await addTrackToPlaylist(id, pendingTrackForNewPlaylist);
            pendingTrackForNewPlaylist = null;
        }
    } else if (modalMode.action === 'rename') {
        await renamePlaylist(modalMode.playlistId, name);
    }
    closeModal();
}

function closeModal(e) {
    if (e && e.target !== document.getElementById('modal-overlay')) return;
    document.getElementById('modal-overlay').classList.remove('open');
}

document.getElementById('modal-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') confirmModal();
});

/* ═══════════════════════════════════════
   NAVIGATION
════════════════════════════════════════ */
function showSearch() {
    currentSection = 'search';
    document.querySelector('.sidebar')?.classList.remove('mobile-open');
    document.getElementById('home-section').style.display          = 'none';
    document.getElementById('search-section').style.display        = 'block';
    document.getElementById('playlist-view-section').style.display = 'none';
    document.querySelector('.main-content').style.background =
        'linear-gradient(180deg, #1a3a28 0%, var(--bg-surface) 38%)';
    renderLibrary();
}

function focusSearch() { showSearch(); document.getElementById('search-input').focus(); }
function goBack()      { history.back(); }
function goForward()   { history.forward(); }

function setActiveNav(btn) {
    document.querySelectorAll('.bottom-nav-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
}

/* ═══════════════════════════════════════
   TOAST
════════════════════════════════════════ */
let toastTimer;
function showToast(msg) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2800);
}

/* ═══════════════════════════════════════
   KEYBOARD SHORTCUTS
════════════════════════════════════════ */
document.addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT' || e.target.contentEditable === 'true') return;
    if (e.code === 'Space')      { e.preventDefault(); togglePlay(); }
    if (e.code === 'ArrowRight') { e.preventDefault(); nextTrack(); }
    if (e.code === 'ArrowLeft')  { e.preventDefault(); prevTrack(); }
});

/* ═══════════════════════════════════════
   VISIBILITY / RESIZE
════════════════════════════════════════ */
document.addEventListener('visibilitychange', () => {
    if (document.hidden) return;
    if (player && player.getPlayerState) {
        const state = player.getPlayerState();
        if (state === YT.PlayerState.PLAYING) setPlayState(true);
    }
});

window.addEventListener('resize', () => {
    if (player && player.getPlayerState && isPlaying) {
        const state = player.getPlayerState();
        if (state !== YT.PlayerState.PLAYING && state !== YT.PlayerState.BUFFERING) {
            player.playVideo();
        }
    }
});

/* ═══════════════════════════════════════
   TOGGLE BUTTONS
════════════════════════════════════════ */
document.getElementById('btn-shuffle').addEventListener('click', function () {
    shuffleMode = !shuffleMode;
    this.classList.toggle('active', shuffleMode);
    showToast(shuffleMode ? 'Lecture aléatoire activée' : 'Lecture aléatoire désactivée');
});

document.getElementById('btn-repeat').addEventListener('click', function () {
    repeatMode = !repeatMode;
    this.classList.toggle('active', repeatMode);
    showToast(repeatMode ? 'Répétition activée' : 'Répétition désactivée');
});

document.getElementById('btn-heart').addEventListener('click', toggleLike);

/* ═══════════════════════════════════════
   SEARCH — Événements
════════════════════════════════════════ */
document.getElementById('search-btn').addEventListener('click', searchMusic);

document.getElementById('search-input').addEventListener('keypress', e => {
    if (e.key === 'Enter') { clearTimeout(searchTimeout); searchMusic(); }
});

document.getElementById('search-input').addEventListener('input', function () {
    document.getElementById('search-clear').style.display = this.value ? 'inline-flex' : 'none';
    clearTimeout(searchTimeout);
    if (this.value.trim().length > 2) {
        searchTimeout = setTimeout(searchMusic, 600);
    }
});

function clearSearch() {
    const input = document.getElementById('search-input');
    input.value = '';
    input.focus();
    clearTimeout(searchTimeout);
    document.getElementById('search-clear').style.display = 'none';
    document.getElementById('results').innerHTML = '';
    document.getElementById('results-placeholder').style.display = 'flex';
    renderSearchPlaceholder();
}

/* ═══════════════════════════════════════
   SQUELETTES DE CHARGEMENT
════════════════════════════════════════ */
function showSkeletons(count = 18) {
    const card = `
        <div class="track-card skeleton-card">
            <div class="skeleton-img"></div>
            <div class="skeleton-line" style="width:78%"></div>
            <div class="skeleton-line" style="width:52%"></div>
        </div>`;
    document.getElementById('results').innerHTML = card.repeat(count);
}

/* ═══════════════════════════════════════
   HISTORIQUE DE RECHERCHE
════════════════════════════════════════ */
function addToSearchHistory(q) {
    let h = JSON.parse(localStorage.getItem('ttHistory') || '[]');
    h = [q, ...h.filter(x => x !== q)].slice(0, MAX_HISTORY);
    localStorage.setItem('ttHistory', JSON.stringify(h));
}

function renderSearchPlaceholder() {
    const ph = document.getElementById('results-placeholder');
    const h  = JSON.parse(localStorage.getItem('ttHistory') || '[]');
    if (h.length === 0) {
        ph.innerHTML = `
            <svg viewBox="0 0 24 24" width="56" height="56" fill="#535353"><path d="M10.533 1.279c-5.18 0-9.407 4.226-9.407 9.407 0 5.18 4.226 9.407 9.407 9.407 2.19 0 4.2-.755 5.8-2.02l4.996 4.997a1 1 0 001.414-1.414l-4.994-4.994a9.368 9.368 0 002.191-6.976 9.407 9.407 0 00-9.407-9.407zm-7.407 9.407a7.407 7.407 0 1114.814 0 7.407 7.407 0 01-14.814 0z"/></svg>
            <h2>Recherchez votre musique</h2>
            <p>Trouvez vos artistes et titres préférés.</p>`;
        return;
    }
    const chips = h.map(q => `
        <button class="history-chip" onclick="replaySearch(${JSON.stringify(q)})">
            <svg viewBox="0 0 24 24" width="12" height="12" fill="#888"><path d="M10.533 1.279c-5.18 0-9.407 4.226-9.407 9.407 0 5.18 4.226 9.407 9.407 9.407 2.19 0 4.2-.755 5.8-2.02l4.996 4.997a1 1 0 001.414-1.414l-4.994-4.994a9.368 9.368 0 002.191-6.976 9.407 9.407 0 00-9.407-9.407zm-7.407 9.407a7.407 7.407 0 1114.814 0 7.407 7.407 0 01-14.814 0z"/></svg>
            ${esc(q)}
            <button class="history-remove" onclick="removeFromHistory(event,${JSON.stringify(q)})">×</button>
        </button>`).join('');
    ph.innerHTML = `
        <h2 style="margin-bottom:8px">Recherches récentes</h2>
        <div class="search-history">${chips}</div>
        <button class="history-clear-btn" onclick="clearSearchHistory()">Effacer l'historique</button>`;
}

function removeFromHistory(e, q) {
    e.stopPropagation();
    let h = JSON.parse(localStorage.getItem('ttHistory') || '[]');
    localStorage.setItem('ttHistory', JSON.stringify(h.filter(x => x !== q)));
    renderSearchPlaceholder();
}

function clearSearchHistory() {
    localStorage.removeItem('ttHistory');
    renderSearchPlaceholder();
}

function replaySearch(q) {
    document.getElementById('search-input').value = q;
    document.getElementById('search-clear').style.display = 'inline-flex';
    document.getElementById('results-placeholder').style.display = 'none';
    searchMusic();
}

/* ═══════════════════════════════════════
   RÉCEMMENT JOUÉS
════════════════════════════════════════ */
function addToRecentlyPlayed(t) {
    recentlyPlayed = [t, ...recentlyPlayed.filter(x => x.id !== t.id)].slice(0, MAX_RECENT);
    localStorage.setItem('ttRecent', JSON.stringify(recentlyPlayed));
}

function renderRecentlyPlayed() {
    const container = document.getElementById('queue-list');
    const countEl   = document.getElementById('playlist-count');
    const n = recentlyPlayed.length;
    countEl.textContent = n === 0 ? 'Aucun titre récent' : `${n} titre${n > 1 ? 's' : ''} récent${n > 1 ? 's' : ''}`;
    container.innerHTML = '';
    if (n === 0) {
        container.innerHTML = `<p style="padding:20px 16px;font-size:.83rem;color:var(--text-sub);">Les titres lus apparaîtront ici.</p>`;
        return;
    }
    recentlyPlayed.forEach(t => {
        const isActive = currentTrack && currentTrack.id === t.id;
        const div = document.createElement('div');
        div.className = 'queue-item';
        div.innerHTML = `
            <div class="queue-thumb-wrap">
                <img class="queue-thumb" src="${t.img}" alt="" onerror="this.style.display='none'">
                <div class="queue-play-overlay">
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="#fff"><path d="M7.05 3.606l13.49 7.788a.7.7 0 010 1.212L7.05 20.394A.7.7 0 016 19.788V4.212a.7.7 0 011.05-.606z"/></svg>
                </div>
            </div>
            <div class="queue-info">
                <span class="queue-title" style="${isActive ? 'color:var(--green)' : ''}">${esc(t.title)}</span>
                <span class="queue-artist">${esc(t.artist)}</span>
            </div>
            <span class="queue-duration">${t.duration || '--:--'}</span>`;
        div.addEventListener('click', () => playTrack(t));
        container.appendChild(div);
    });
}

function switchQueueTab(tab, btn) {
    activeQueueTab = tab;
    document.querySelectorAll('.queue-tab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    tab === 'queue' ? renderQueue() : renderRecentlyPlayed();
}

/* ═══════════════════════════════════════
   LIKES
════════════════════════════════════════ */
function getLikesPlaylist() {
    return playlists.find(p => p.name === LIKES_NAME);
}

function isTrackLiked(track) {
    if (!track) return false;
    const pl = getLikesPlaylist();
    return pl ? pl.tracks.some(t => t.id === track.id) : false;
}

function updateHeartState(track) {
    document.getElementById('btn-heart').classList.toggle('active', isTrackLiked(track));
}

async function toggleLike() {
    if (!currentTrack) { showToast('Aucun titre en cours'); return; }
    let pl = getLikesPlaylist();
    if (!pl) {
        const id    = 'pl_likes_' + Date.now();
        const newPl = { id, name: LIKES_NAME, color: '#e91429', tracks: [], createdAt: Date.now() };
        playlists.push(newPl);
        renderLibrary();
        await savePlaylistToFirestore(newPl);
        pl = newPl;
    }
    const idx = pl.tracks.findIndex(t => t.id === currentTrack.id);
    if (idx >= 0) {
        pl.tracks.splice(idx, 1);
        showToast('Retiré des titres likés');
    } else {
        pl.tracks.push(currentTrack);
        showToast('❤️ Ajouté aux titres likés');
    }
    updateHeartState(currentTrack);
    renderLibrary();
    await savePlaylistToFirestore(pl);
}

/* ═══════════════════════════════════════
   DRAG & DROP — Queue souris
════════════════════════════════════════ */
function onDragStart(e) {
    dragSrcIndex = +e.currentTarget.dataset.index;
    e.currentTarget.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
}
function onDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    document.querySelectorAll('.queue-item').forEach(el => el.classList.remove('drag-over'));
    e.currentTarget.classList.add('drag-over');
}
function onDrop(e) {
    e.preventDefault();
    const targetIndex = +e.currentTarget.dataset.index;
    if (dragSrcIndex === null || dragSrcIndex === targetIndex) return;
    const [moved] = queue.splice(dragSrcIndex, 1);
    queue.splice(targetIndex, 0, moved);
    saveQueue();
    renderQueue();
}
function onDragEnd() {
    document.querySelectorAll('.queue-item').forEach(el => el.classList.remove('dragging', 'drag-over'));
    dragSrcIndex = null;
}

/* ═══════════════════════════════════════
   DRAG & DROP — Queue tactile
════════════════════════════════════════ */
function onTouchDragStart(e, index) {
    touchSrcIndex = index;
    const el = e.currentTarget.closest('.queue-item');
    const r  = el.getBoundingClientRect();
    touchOffsetY = e.touches[0].clientY - r.top;
    touchClone = el.cloneNode(true);
    touchClone.style.cssText = `position:fixed;pointer-events:none;z-index:9999;opacity:.85;width:${r.width}px;top:${r.top}px;left:${r.left}px;background:var(--bg-card-hover);border-radius:var(--r-sm);box-shadow:0 8px 32px rgba(0,0,0,.6);`;
    document.body.appendChild(touchClone);
    el.style.opacity = '.25';
}
function onTouchDragMove(e) {
    if (touchSrcIndex === null || !touchClone) return;
    e.preventDefault();
    const y = e.touches[0].clientY;
    touchClone.style.top = (y - touchOffsetY) + 'px';
    document.querySelectorAll('.queue-item').forEach(el => el.classList.remove('drag-over'));
    document.elementFromPoint(e.touches[0].clientX, y)?.closest('.queue-item')?.classList.add('drag-over');
}
function onTouchDragEnd(e) {
    if (touchSrcIndex === null) return;
    const y = e.changedTouches[0].clientY;
    const target = document.elementFromPoint(e.changedTouches[0].clientX, y)?.closest('.queue-item');
    const targetIndex = target ? +target.dataset.index : -1;
    if (targetIndex >= 0 && targetIndex !== touchSrcIndex) {
        const [moved] = queue.splice(touchSrcIndex, 1);
        queue.splice(targetIndex, 0, moved);
        saveQueue();
    }
    if (touchClone) { touchClone.remove(); touchClone = null; }
    document.querySelectorAll('.queue-item').forEach(el => { el.style.opacity = ''; el.classList.remove('drag-over'); });
    touchSrcIndex = null;
    renderQueue();
}

/* ═══════════════════════════════════════
   INIT
════════════════════════════════════════ */
setBarFill('volume-bar', 100);
renderQueue();
renderSearchPlaceholder();

/* ═══════════════════════════════════════
   SLEEP TIMER
════════════════════════════════════════ */
function toggleSleepDropdown() {
    document.getElementById('sleep-dropdown').classList.toggle('open');
}

function setSleepTimer(minutes) {
    cancelSleepTimer(true);
    sleepMinutes = minutes;
    sleepEndTime = Date.now() + minutes * 60 * 1000;
    sleepTimerTimeout = setTimeout(() => {
        if (player && player.pauseVideo) player.pauseVideo();
        showToast('😴 Bonne nuit — lecture en pause');
        cancelSleepTimer(true);
    }, minutes * 60 * 1000);
    sleepTimerInterval = setInterval(updateSleepCountdown, 1000);
    updateSleepCountdown();
    document.getElementById('btn-sleep').classList.add('active');
    document.getElementById('sleep-cancel-btn').style.display = 'flex';
    document.querySelectorAll('.sleep-dd-item').forEach(el => el.classList.remove('active'));
    document.getElementById(`sdi-${minutes}`)?.classList.add('active');
    const label = minutes < 60 ? `${minutes} min` : '1 h';
    showToast(`😴 Lecture s'arrête dans ${label}`);
    document.getElementById('sleep-dropdown').classList.remove('open');
}

function cancelSleepTimer(silent = false) {
    clearTimeout(sleepTimerTimeout);
    clearInterval(sleepTimerInterval);
    sleepTimerTimeout = sleepTimerInterval = sleepEndTime = sleepMinutes = null;
    document.getElementById('btn-sleep')?.classList.remove('active');
    const cancelBtn = document.getElementById('sleep-cancel-btn');
    if (cancelBtn) cancelBtn.style.display = 'none';
    ['sc-15','sc-30','sc-60'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.textContent = '';
    });
    document.querySelectorAll('.sleep-dd-item').forEach(el => el.classList.remove('active'));
    const badge = document.getElementById('sleep-badge');
    if (badge) badge.style.display = 'none';
    if (!silent) showToast('Timer de sommeil annulé');
}

function updateSleepCountdown() {
    if (!sleepEndTime) return;
    const remaining = Math.max(0, sleepEndTime - Date.now());
    const mins = Math.floor(remaining / 60000);
    const secs = Math.floor((remaining % 60000) / 1000);
    const str  = `${mins}:${String(secs).padStart(2, '0')}`;
    ['15','30','60'].forEach(m => {
        const el = document.getElementById(`sc-${m}`);
        if (el) el.textContent = +m === sleepMinutes ? str : '';
    });
    const badge     = document.getElementById('sleep-badge');
    const badgeTime = document.getElementById('sleep-badge-time');
    if (badge && badgeTime) {
        badge.style.display = 'inline-flex';
        badgeTime.textContent = str;
    }
}

document.addEventListener('click', e => {
    if (!e.target.closest('.sleep-timer-wrap')) {
        document.getElementById('sleep-dropdown')?.classList.remove('open');
    }
});

/* ═══════════════════════════════════════
   PLAYLIST — DRAG & DROP souris
════════════════════════════════════════ */
function onPlDragStart(e, playlistId, index) {
    plDragSrcIndex   = index;
    plDragPlaylistId = playlistId;
    e.currentTarget.classList.add('pl-dragging');
    e.dataTransfer.effectAllowed = 'move';
}
function onPlDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    document.querySelectorAll('.pl-track-row').forEach(el => el.classList.remove('pl-drag-over'));
    e.currentTarget.classList.add('pl-drag-over');
}
async function onPlDrop(e, playlistId, targetIndex) {
    e.preventDefault();
    if (plDragSrcIndex === null || plDragSrcIndex === targetIndex) return;
    const pl = playlists.find(p => p.id === playlistId);
    if (!pl) return;
    const [moved] = pl.tracks.splice(plDragSrcIndex, 1);
    pl.tracks.splice(targetIndex, 0, moved);
    renderPlaylistView(playlistId);
    renderLibrary();
    await savePlaylistToFirestore(pl);
}
function onPlDragEnd() {
    document.querySelectorAll('.pl-track-row').forEach(el => el.classList.remove('pl-dragging', 'pl-drag-over'));
    plDragSrcIndex = null;
}

/* ═══════════════════════════════════════
   PLAYLIST — DRAG & DROP tactile
════════════════════════════════════════ */
function onPlTouchStart(e, playlistId, index) {
    plTouchSrcIndex  = index;
    plDragPlaylistId = playlistId;
    const el = e.currentTarget.closest('.pl-track-row');
    const r  = el.getBoundingClientRect();
    plTouchOffsetY = e.touches[0].clientY - r.top;
    plTouchClone = el.cloneNode(true);
    plTouchClone.style.cssText = `position:fixed;pointer-events:none;z-index:9999;opacity:.85;width:${r.width}px;top:${r.top}px;left:${r.left}px;background:var(--bg-card-hover);border-radius:var(--r-sm);box-shadow:0 8px 32px rgba(0,0,0,.6);`;
    document.body.appendChild(plTouchClone);
    el.style.opacity = '.25';
}
function onPlTouchMove(e) {
    if (plTouchSrcIndex === null || !plTouchClone) return;
    e.preventDefault();
    const y = e.touches[0].clientY;
    plTouchClone.style.top = (y - plTouchOffsetY) + 'px';
    document.querySelectorAll('.pl-track-row').forEach(el => el.classList.remove('pl-drag-over'));
    document.elementFromPoint(e.touches[0].clientX, y)?.closest('.pl-track-row')?.classList.add('pl-drag-over');
}
async function onPlTouchEnd(e) {
    if (plTouchSrcIndex === null) return;
    const y = e.changedTouches[0].clientY;
    const target      = document.elementFromPoint(e.changedTouches[0].clientX, y)?.closest('.pl-track-row');
    const targetIndex = target ? +target.dataset.index : -1;
    if (targetIndex >= 0 && targetIndex !== plTouchSrcIndex && plDragPlaylistId) {
        const pl = playlists.find(p => p.id === plDragPlaylistId);
        if (pl) {
            const [moved] = pl.tracks.splice(plTouchSrcIndex, 1);
            pl.tracks.splice(targetIndex, 0, moved);
            renderLibrary();
            await savePlaylistToFirestore(pl);
        }
    }
    if (plTouchClone) { plTouchClone.remove(); plTouchClone = null; }
    document.querySelectorAll('.pl-track-row').forEach(el => { el.style.opacity = ''; el.classList.remove('pl-drag-over', 'pl-dragging'); });
    const id = plDragPlaylistId;
    plTouchSrcIndex = plDragPlaylistId = null;
    if (id) renderPlaylistView(id);
}

/* ═══════════════════════════════════════
   MODALE ANTI-PUBS
════════════════════════════════════════ */
function detectPlatform() {
    const ua = navigator.userAgent;
    if (/android/i.test(ua))          return 'android';
    if (/ipad|iphone|ipod/i.test(ua)) return 'ios';
    return 'desktop';
}

function openAdTipsModal() {
    const overlay = document.getElementById('adtips-overlay');
    overlay.classList.add('open');
    const platform = detectPlatform();
    const btn = document.querySelector(`.adtab[onclick*="${platform}"]`);
    if (btn) switchAdTab(platform, btn);
    overlay.addEventListener('click', e => {
        if (e.target === overlay) closeAdTipsModal();
    }, { once: true });
}

function closeAdTipsModal() {
    document.getElementById('adtips-overlay').classList.remove('open');
}

function switchAdTab(tab, btn) {
    document.querySelectorAll('.adtab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    ['android','ios','desktop'].forEach(t => {
        const el = document.getElementById(`tab-${t}`);
        if (el) el.style.display = t === tab ? 'block' : 'none';
    });
}
/* ═══════════════════════════════════════
   MODAL IMPORT SPOTIFY
════════════════════════════════════════ */
/* ═══════════════════════════════════════
   IMPORT SPOTIFY
════════════════════════════════════════ */
function openImportSpotifyModal() {
    const overlay = document.getElementById('spotify-import-overlay');
    overlay.style.display = 'flex';
    document.getElementById('spotify-url-input').value = '';
    document.getElementById('spotify-import-status').innerHTML = '';
    document.getElementById('spotify-import-btn').disabled = false;
    setTimeout(() => document.getElementById('spotify-url-input').focus(), 80);
}

function closeImportSpotifyModal() {
    document.getElementById('spotify-import-overlay').style.display = 'none';
}

async function fetchSpotifyTracks(spotifyUrl) {
 
    /* ── Nettoyage URL ── */
    let cleanUrl = spotifyUrl.split('?')[0].trim();
    cleanUrl = cleanUrl.replace(/\/intl-[a-z]+\//i, '/');
 
    if (!/open\.spotify\.com\/(album|playlist)\/[A-Za-z0-9]+/.test(cleanUrl)) {
        throw new Error('URL non valide. Utilisez un lien Spotify album ou playlist publique.');
    }
 
    /* ── Proxies CORS en cascade ── */
    const proxies = [
        url => `https://corsproxy.io/?${encodeURIComponent(url)}`,
        url => `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`,
        url => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`,
    ];
 
    let html = null;
 
    for (const buildProxy of proxies) {
        try {
            const res = await fetch(buildProxy(cleanUrl));
            if (!res.ok) continue;
            const text = await res.text();
            // allorigins encapsule dans { contents: "..." }
            try {
                const json = JSON.parse(text);
                if (json.contents) { html = json.contents; }
                else               { html = text; }
            } catch {
                html = text;
            }
            if (html && html.length > 500) break;
        } catch { continue; }
    }
 
    if (!html) throw new Error('Tous les proxies ont échoué. Réessayez dans un instant.');
    console.log('[Spotify] HTML reçu :', html.length, 'caractères');
 
    /* ══════════════════════════════════════════════
       STRATÉGIE 1 — JSON-LD
       Spotify intègre un <script type="application/ld+json">
    ══════════════════════════════════════════════ */
    const tracks    = [];
    let   albumName = 'Import Spotify';
    let   albumArtist = '';
 
    const allJsonLd = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
    for (const match of allJsonLd) {
        try {
            const ld = JSON.parse(match[1]);
            console.log('[Spotify] JSON-LD type:', ld['@type'], '| tracks:', ld.track?.length);
 
            if (ld.name) albumName = ld.name;
            if (ld.byArtist?.name) albumArtist = ld.byArtist.name;
            if (ld.creator?.name)  albumArtist = ld.creator.name;
 
            if (Array.isArray(ld.track) && ld.track.length > 0) {
                for (const t of ld.track) {
                    if (t.name) {
                        tracks.push({
                            title:  t.name,
                            artist: t.byArtist?.name || albumArtist
                        });
                    }
                }
                if (tracks.length > 0) {
                    console.log('[Spotify] Stratégie 1 OK :', tracks.length, 'titres');
                    return { albumName, tracks };
                }
            }
        } catch (e) { console.warn('[Spotify] JSON-LD parse error:', e); }
    }
 
    /* ══════════════════════════════════════════════
       STRATÉGIE 2 — __NEXT_DATA__
       Next.js intègre toutes les données de la page
    ══════════════════════════════════════════════ */
    const nextMatch = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
    if (nextMatch) {
        try {
            const nextData = JSON.parse(nextMatch[1]);
            console.log('[Spotify] __NEXT_DATA__ trouvé');
 
            // Chercher récursivement un tableau de pistes dans l'objet Next.js
            function findTracks(obj, depth = 0) {
                if (!obj || typeof obj !== 'object' || depth > 12) return null;
                // Tableau d'items avec name + artists (format Spotify Web API)
                if (Array.isArray(obj)) {
                    if (obj.length > 0 && obj[0]?.name && (obj[0]?.artists || obj[0]?.byArtist)) {
                        return obj;
                    }
                    for (const item of obj.slice(0, 5)) {
                        const r = findTracks(item, depth + 1);
                        if (r) return r;
                    }
                } else {
                    for (const key of ['tracks', 'items', 'track', 'data', 'album', 'playlist']) {
                        if (obj[key]) {
                            const r = findTracks(obj[key], depth + 1);
                            if (r) return r;
                        }
                    }
                }
                return null;
            }
 
            const found = findTracks(nextData);
            if (found && found.length > 0) {
                const seen = new Set();
                for (const item of found) {
                    const trackObj = item.track || item;
                    const name     = trackObj.name;
                    if (!name || seen.has(name)) continue;
                    seen.add(name);
                    const artist = trackObj.artists?.[0]?.name
                               || trackObj.byArtist?.name
                               || albumArtist || '';
                    tracks.push({ title: name, artist });
                }
                if (tracks.length > 0) {
                    // Essayer de récupérer le nom de l'album depuis Next.js
                    const nameMatch = html.match(/"name"\s*:\s*"([^"]{2,80})"[\s\S]{0,200}"@type"\s*:\s*"Music/);
                    if (nameMatch) albumName = nameMatch[1];
                    console.log('[Spotify] Stratégie 2 OK :', tracks.length, 'titres');
                    return { albumName, tracks };
                }
            }
        } catch (e) { console.warn('[Spotify] __NEXT_DATA__ parse error:', e); }
    }
 
    /* ══════════════════════════════════════════════
       STRATÉGIE 3 — Meta music:song + noms dans <a>
    ══════════════════════════════════════════════ */
    console.log('[Spotify] Tentative stratégie 3 (meta tags)');

    // 1. Extraire les IDs de pistes depuis <meta name="music:song" content="…/track/ID">
    const metaTrackRe = /<meta[^>]+name="music:song"[^>]+content="[^"]*\/track\/([A-Za-z0-9]+)"[^>]*>/g;
    const trackIds = [];
    let metaM;
    while ((metaM = metaTrackRe.exec(html)) !== null) {
        if (!trackIds.includes(metaM[1])) trackIds.push(metaM[1]);
    }
    console.log('[Spotify] IDs trouvés dans meta:', trackIds.length, trackIds);

    // 2. Pour chaque ID, chercher le nom dans les balises <a href="…/track/ID">
    //    (avec ou sans intl-xx/, avec ou sans domaine complet)
    for (const id of trackIds) {
        // Regex large : capture tout texte/HTML après le href du track
        const linkRe = new RegExp(
            `href="[^"]*\\/track\\/${id}"[^>]*>([\\s\\S]{0,400}?)(?:<\\/a>|aria-)`,
            'i'
        );
        const linkMatch = html.match(linkRe);

        let name = null;

        if (linkMatch) {
            // Supprimer les balises HTML internes → texte brut
            name = linkMatch[1]
                .replace(/<[^>]+>/g, ' ')
                .replace(/&amp;/g, '&').replace(/&#39;/g, "'")
                .replace(/&quot;/g, '"').replace(/&nbsp;/g, ' ')
                .replace(/\s+/g, ' ').trim();
            // Garder seulement la première ligne significative
            name = name.split('\n')[0].trim();
            if (name.length < 2 || name.length > 120) name = null;
        }

        // Fallback : chercher aria-label="Play NomDuTitre by Artiste"
        if (!name) {
            const ariaRe = new RegExp(
                `aria-label="(?:Play|Lire|Jouer)\\s+([^"]{2,80}?)\\s+(?:by|par)\\s`,
                'i'
            );
            // Chercher dans les 1000 chars autour de l'ID
            const idPos = html.indexOf(id);
            if (idPos > 0) {
                const zone = html.slice(Math.max(0, idPos - 200), idPos + 800);
                const am   = zone.match(ariaRe);
                if (am) name = am[1].trim();
            }
        }

        if (name) {
            tracks.push({ title: name, artist: albumArtist });
            console.log(`[Spotify] Track trouvé: "${name}"`);
        } else {
            console.warn(`[Spotify] Nom introuvable pour ID: ${id}`);
        }
    }

    // Récupérer albumName depuis og:title
    const ogT = html.match(/(?:property|name)="og:title"\s+content="([^"]+)"|content="([^"]+)"\s+(?:property|name)="og:title"/);
    if (ogT) albumName = (ogT[1] || ogT[2]).replace(/\s*[|-].*$/, '').trim();

    if (tracks.length > 0) {
        console.log('[Spotify] Stratégie 3 OK :', tracks.length, 'titres');
        return { albumName, tracks };
    }

    // Debug : montrer ce qu'il y a autour du 1er ID trouvé
    if (trackIds.length > 0) {
        const pos = html.indexOf(trackIds[0]);
        console.log('[Spotify] Zone HTML autour du 1er ID:',
            html.slice(Math.max(0, pos - 50), pos + 600));
    }

    throw new Error(`IDs trouvés (${trackIds.length}) mais noms introuvables. Voir console.`);
 
    /* ── Aucune stratégie n'a fonctionné ── */
    throw new Error('Aucun titre trouvé. L\'album/playlist est peut-être privé(e), ou Spotify a changé son format de page.');
}

async function searchYouTubeForTrack(title, artist) {
    const q   = artist ? `${title} ${artist}` : title;
    const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(q)}&type=video&videoCategoryId=10&maxResults=1&key=${YOUTUBE_API_KEY}`;
    const res = await fetch(url);
    const data = await res.json();
    if (!data.items || !data.items.length) return null;
    const item = data.items[0];
    const vid  = item.id.videoId;
    let duration = '--:--';
    try {
        const d = await (await fetch(`https://www.googleapis.com/youtube/v3/videos?part=contentDetails&id=${vid}&key=${YOUTUBE_API_KEY}`)).json();
        if (d.items?.[0]) duration = parseISO8601Duration(d.items[0].contentDetails.duration);
    } catch {}
    return {
        id:       vid,
        title:    cleanTitle(item.snippet.title),
        artist:   cleanArtist(item.snippet.channelTitle),
        img:      item.snippet.thumbnails.high?.url || item.snippet.thumbnails.medium?.url || '',
        duration
    };
}

async function importFromSpotify() {
    const url    = document.getElementById('spotify-url-input').value.trim();
    const status = document.getElementById('spotify-import-status');
    const btn    = document.getElementById('spotify-import-btn');
    if (!url) { status.innerHTML = '<span style="color:#ff6b6b">Collez d\'abord un lien Spotify.</span>'; return; }

    btn.disabled = true;
    status.innerHTML = '<span style="color:#b3b3b3">🔍 Lecture de la page Spotify…</span>';

    let albumData;
    try {
        albumData = await fetchSpotifyTracks(url);
    } catch (err) {
        status.innerHTML = `<span style="color:#ff6b6b">❌ ${err.message}</span>`;
        btn.disabled = false;
        return;
    }

    const { albumName, tracks } = albumData;
    status.innerHTML = `
        <div style="color:#1db954">✅ ${tracks.length} titres trouvés dans « ${esc(albumName)} »</div>
        <div style="color:#fff;margin-top:4px">🎵 Recherche YouTube… <span id="spi-counter">0/${tracks.length}</span></div>
        <div style="background:rgba(255,255,255,.08);border-radius:500px;height:4px;margin:10px 0;">
            <div id="spi-bar" style="height:100%;background:#1db954;border-radius:500px;width:0%;transition:width .3s"></div>
        </div>`;

    const playlistId = await createPlaylist(albumName);
    let found = 0;

    for (let i = 0; i < tracks.length; i++) {
        const track = await searchYouTubeForTrack(tracks[i].title, tracks[i].artist);
        if (track) { await addTrackToPlaylist(playlistId, track); found++; }
        const pct = Math.round(((i + 1) / tracks.length) * 100);
        const counterEl = document.getElementById('spi-counter');
        const barEl     = document.getElementById('spi-bar');
        if (counterEl) counterEl.textContent = `${i + 1}/${tracks.length}`;
        if (barEl)     barEl.style.width     = pct + '%';
        if (i < tracks.length - 1) await new Promise(r => setTimeout(r, 300));
    }

    const skipped = tracks.length - found;
    status.innerHTML = `
        <div style="color:#1db954">✅ ${found} pistes importées sur ${tracks.length}${skipped ? ` (${skipped} introuvables)` : ''}</div>
        <div style="margin-top:14px;text-align:right;">
            <button onclick="closeImportSpotifyModal();openPlaylistView('${playlistId}')"
                    style="background:#1db954;color:#000;border:none;border-radius:500px;
                           padding:10px 22px;font-weight:700;font-family:inherit;
                           font-size:.85rem;cursor:pointer;">
                Ouvrir la playlist →
            </button>
        </div>`;
    btn.disabled = false;
}
