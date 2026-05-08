/* ═══════════════════════════════════════════════════
   TESLATUBE — script.js
   Playlist management + Queue + Player + Firebase
════════════════════════════════════════════════════ */

// ── Firebase Config ──
const firebaseConfig = {
    apiKey: "AIzaSyANf8hNGIRryPmZytIxIQ4uDhY6fR6uDKM",
    authDomain: "teslatube-560c0.firebaseapp.com",
    projectId: "teslatube-560c0",
    storageBucket: "teslatube-560c0.firebasestorage.app",
    messagingSenderId: "1019331471126",
    appId: "1:1019331471126:web:29beb2914436836bd41237",
    measurementId: "G-K05WJMWGGH"
};

const YOUTUBE_API_KEY = "AIzaSyBX9_dZTK6PHaCI9_kOnT4jguY0u64o-54";

// ── Init Firebase ──
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db   = firebase.firestore();

// ── State ──
let player;
let queue                = JSON.parse(localStorage.getItem('teslatubeQueue')) || [];
let playlists            = [];
let historyStack         = [];
let progressInterval;
let isPlaying            = false;
let isMuted              = false;
let lastVolume           = 100;
let queueVisible         = true;
let currentTrack         = null;
let currentSection       = 'search';
let modalMode            = null;
let openDropdownTrack    = null;
let currentUserId        = null;
let unsubscribePlaylists = null;

// ── Palette ──
const COLORS = ['#e91429','#503750','#0d73ec','#148a08','#e8115b','#27856a','#8d67ab','#1e3264','#f59b23','#0e6251'];

/* ═══════════════════════════════════════
   UTILS
════════════════════════════════════════ */
function fmtTime(sec) {
    const m = Math.floor(sec / 60), s = Math.floor(sec % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
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
   FIRESTORE — Real-time playlist listener
════════════════════════════════════════ */
function startPlaylistListener() {
    if (unsubscribePlaylists) unsubscribePlaylists();

    const ref = db.collection('users').doc(currentUserId)
                  .collection('playlists')
                  .orderBy('createdAt', 'asc');

    unsubscribePlaylists = ref.onSnapshot(snapshot => {
        playlists = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderLibrary();
        if (currentSection.startsWith('playlist:')) {
            const id = currentSection.split(':')[1];
            if (playlists.find(p => p.id === id)) renderPlaylistView(id);
            else showSearch();
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
                .set({
                    name:      pl.name,
                    color:     pl.color,
                    tracks:    pl.tracks,
                    createdAt: pl.createdAt
                });
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
            onReady:       () => setVolume(100),
            onStateChange: onPlayerStateChange,
            onError:       onPlayerError
        }
    });
}

function onPlayerError(event) {
    console.warn('[Player] Erreur YouTube :', event.data);
    setPlayState(false);
}

function onPlayerStateChange(event) {
    const S = YT.PlayerState;
    if (event.data === S.ENDED)   nextTrack();
    if (event.data === S.PAUSED)  setPlayState(false);
    if (event.data === S.PLAYING) setPlayState(true);
}

/* ═══════════════════════════════════════
   SEARCH
════════════════════════════════════════ */
async function searchMusic() {
    const q = document.getElementById('search-input').value.trim();
    if (!q) return;

    document.getElementById('results-placeholder').style.display = 'none';
    const container = document.getElementById('results');
    container.innerHTML = '<div style="color:#b3b3b3;padding:24px 0;font-size:.9rem;">Recherche en cours…</div>';

    const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(q)}&type=video&videoCategoryId=10&maxResults=18&key=${YOUTUBE_API_KEY}`;
    try {
        const res  = await fetch(searchUrl);
        const data = await res.json();
        if (data.error) {
            container.innerHTML = `<div style="color:#b3b3b3;padding:24px 0;">Erreur : ${data.error.message}</div>`;
            return;
        }

        const items = data.items || [];

        // Récupérer durées + stats en une seule requête
        const ids        = items.map(i => i.id.videoId).join(',');
        const detailsUrl = `https://www.googleapis.com/youtube/v3/videos?part=contentDetails,statistics&id=${ids}&key=${YOUTUBE_API_KEY}`;
        const detailsRes = await fetch(detailsUrl);
        const details    = await detailsRes.json();

        const durMap = {};
        (details.items || []).forEach(v => {
            durMap[v.id] = {
                duration: parseISO8601Duration(v.contentDetails.duration),
                views:    formatViews(v.statistics?.viewCount)
            };
        });

        renderResults(items, durMap);
    } catch (e) {
        console.error('Search error:', e);
        container.innerHTML = '<div style="color:#b3b3b3;padding:24px 0;">Erreur réseau.</div>';
    }
}

function renderResults(items, durMap = {}) {
    const container = document.getElementById('results');
    container.innerHTML = '';

    items.forEach(item => {
        const info = durMap[item.id.videoId] || {};
        const t = {
            id:       item.id.videoId,
            title:    item.snippet.title,
            artist:   item.snippet.channelTitle,
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
            <p>${esc(t.artist)}</p>
        `;
        div.addEventListener('click', () => playTrack(t));
        div.querySelector('.card-play-btn').addEventListener('click', e => { e.stopPropagation(); playTrack(t); });
        div.querySelector('.card-options-btn').addEventListener('click', e => { e.stopPropagation(); openTrackDropdown(e, t); });
        container.appendChild(div);
    });
}

/* ═══════════════════════════════════════
   PLAYBACK
════════════════════════════════════════ */
function playTrack(t) {
    if (!player || !player.loadVideoById) return;
    if (currentTrack) historyStack.push(currentTrack);
    currentTrack = t;
    player.loadVideoById(t.id);
    updatePlayerBar(t);
    setPlayState(true);
    clearInterval(progressInterval);
    progressInterval = setInterval(updateProgress, 500);
    document.title = `${t.title} — Teslatube`;
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
}

function setPlayState(playing) {
    isPlaying = playing;
    document.getElementById('icon-play').style.display  = playing ? 'none'  : 'block';
    document.getElementById('icon-pause').style.display = playing ? 'block' : 'none';
}

function togglePlay() {
    if (!player || !player.getPlayerState) return;
    player.getPlayerState() === 1 ? player.pauseVideo() : player.playVideo();
}

function nextTrack() {
    if (queue.length > 0) {
        const next = queue.shift();
        saveQueue();
        playTrack(next);
        renderQueue();
    }
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
   MEDIA SESSION API (lock screen / notifications)
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
        div.innerHTML = `
            <span class="queue-drag">⠿⠿</span>
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
            </button>
        `;
        div.addEventListener('click', () => {
            queue.splice(i, 1);
            saveQueue();
            playTrack(t);
            renderQueue();
        });
        div.querySelector('.queue-more-btn').addEventListener('click', e => {
            e.stopPropagation();
            queue.splice(i, 1);
            saveQueue();
            renderQueue();
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
    playlists = playlists.filter(p => p.id !== id);
    renderLibrary();
    if (currentSection === `playlist:${id}`) showSearch();
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
        const coverHTML = pl.tracks.length > 0 && pl.tracks[0].img
            ? `<img src="${pl.tracks[0].img}" alt="">`
            : `<span style="font-size:1.4rem">🎵</span>`;

        div.innerHTML = `
            <div class="lib-item-thumb" style="background:${pl.color}">${coverHTML}</div>
            <div class="lib-item-info">
                <span class="lib-item-name">${esc(pl.name)}</span>
                <span class="lib-item-meta">Playlist · ${pl.tracks.length} piste${pl.tracks.length !== 1 ? 's' : ''}</span>
            </div>
            <button class="lib-item-more" title="Options">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M4.5 13.5a1.5 1.5 0 110-3 1.5 1.5 0 010 3zm15 0a1.5 1.5 0 110-3 1.5 1.5 0 010 3zm-7.5 0a1.5 1.5 0 110-3 1.5 1.5 0 010 3z"/></svg>
            </button>
        `;
        div.addEventListener('click', () => openPlaylistView(pl.id));
        div.querySelector('.lib-item-more').addEventListener('click', e => {
            e.stopPropagation();
            openPlaylistOptionsDropdown(e, pl.id);
        });
        list.appendChild(div);
    });
}


/* ── Bibliothèque mobile ── */
function focusLibrary() {
    const sidebar = document.querySelector('.sidebar');
    const isOpen  = sidebar.classList.toggle('mobile-open');
    // Fermer automatiquement quand on clique sur une playlist
    if (isOpen) {
        sidebar.querySelectorAll('.lib-item').forEach(item => {
            item.addEventListener('click', () => {
                sidebar.classList.remove('mobile-open');
            }, { once: true });
        });
    }
}

function filterLib(type, btn) {
    document.querySelectorAll('.lib-chip').forEach(c => c.classList.remove('active'));
    btn.classList.add('active');
}

/* ═══════════════════════════════════════
   PLAYLIST VIEW
════════════════════════════════════════ */
function openPlaylistView(id) {
    currentSection = `playlist:${id}`;
    document.getElementById('search-section').style.display         = 'none';
    document.getElementById('playlist-view-section').style.display  = 'block';
    const pl = playlists.find(p => p.id === id);
    if (pl) {
        document.querySelector('.main-content').style.background =
            `linear-gradient(180deg, ${pl.color}88 0%, var(--bg-surface) 38%)`;
    }
    renderPlaylistView(id);
    renderLibrary();
    document.querySelector('.main-content').scrollTop = 0;
}

function renderPlaylistView(id) {
    const pl = playlists.find(p => p.id === id);
    if (!pl) return;

    const coverHTML = pl.tracks.length > 0 && pl.tracks[0].img
        ? `<img src="${pl.tracks[0].img}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:6px;">`
        : `<span style="font-size:3.5rem">🎵</span>`;

    document.getElementById('pl-hero').innerHTML = `
        <div class="pl-hero-art" style="background:${pl.color}">${coverHTML}</div>
        <div class="pl-hero-info">
            <p class="pl-hero-type">Playlist</p>
            <h1 class="pl-hero-name" id="pl-editable-name" contenteditable="true" spellcheck="false">${esc(pl.name)}</h1>
            <p class="pl-hero-meta"><strong>${pl.tracks.length}</strong> piste${pl.tracks.length !== 1 ? 's' : ''}</p>
        </div>
    `;

    const nameEl = document.getElementById('pl-editable-name');
    nameEl.addEventListener('blur', () => {
        const newName = nameEl.textContent.trim();
        if (newName && newName !== pl.name) renamePlaylist(id, newName);
    });
    nameEl.addEventListener('keydown', e => {
        if (e.key === 'Enter') { e.preventDefault(); nameEl.blur(); }
    });

    document.getElementById('pl-controls').innerHTML = `
        <button class="btn-play-big" onclick="playPlaylist('${id}')">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="#000"><path d="M7.05 3.606l13.49 7.788a.7.7 0 010 1.212L7.05 20.394A.7.7 0 016 19.788V4.212a.7.7 0 011.05-.606z"/></svg>
        </button>
        <button class="btn-shuffle-big" onclick="shufflePlaylist('${id}')" title="Lecture aléatoire">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M16.464 3.162A1 1 0 0117 4v1.5l1.293-1.293a1 1 0 011.414 1.414L17.414 7.5 19 7.5a1 1 0 110 2l-3 .001a1 1 0 01-.707-.294L13.586 7.5h-1.672A6.972 6.972 0 0110 9.207V7.586l.293-.293A4.972 4.972 0 0113.914 6H16V4a1 1 0 01.464-.838z"/></svg>
        </button>
        <button class="btn-ctrl-big" title="Options de la playlist" onclick="openPlaylistOptionsDropdown(event,'${id}')">
            <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M4.5 13.5a1.5 1.5 0 110-3 1.5 1.5 0 010 3zm15 0a1.5 1.5 0 110-3 1.5 1.5 0 010 3zm-7.5 0a1.5 1.5 0 110-3 1.5 1.5 0 010 3z"/></svg>
        </button>
    `;

    const listEl = document.getElementById('pl-track-list');
    listEl.innerHTML = '';

    if (pl.tracks.length === 0) {
        listEl.innerHTML = `<p style="color:var(--text-sub);padding:24px 16px;font-size:.9rem;">Cette playlist est vide. Recherchez des musiques et ajoutez-les !</p>`;
        return;
    }

    pl.tracks.forEach((t, i) => {
        const playing = currentTrack && currentTrack.id === t.id;
        const div = document.createElement('div');
        div.className = 'pl-track-row' + (playing ? ' playing' : '');
        div.innerHTML = `
            <div class="pl-tr-num">
                <span>${i + 1}</span>
                <div class="pl-tr-bars" style="${playing ? 'display:flex' : ''}">
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
                <button class="pl-tr-remove" title="Retirer de la playlist">
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M5.25 5.25a.75.75 0 000 1.5h.75v11.25A2.25 2.25 0 008.25 20.25h7.5A2.25 2.25 0 0018 18V6.75h.75a.75.75 0 000-1.5H5.25zm2.25 1.5h9V18a.75.75 0 01-.75.75h-7.5a.75.75 0 01-.75-.75V6.75zm2.25-3a.75.75 0 000 1.5h3a.75.75 0 000-1.5h-3z"/></svg>
                </button>
                <span class="pl-tr-dur">${t.duration || '--:--'}</span>
            </div>
        `;
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
        row.classList.toggle('playing', !!(t && currentTrack && t.id === currentTrack.id));
    });
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
        <div class="dd-sub-label">Ajouter à une playlist</div>
    `;

    if (playlists.length === 0) {
        html += `<p style="padding:8px 16px;font-size:.8rem;color:var(--text-sub);">Aucune playlist</p>`;
    } else {
        playlists.forEach(pl => {
            html += `<button class="dd-item" onclick="addTrackToPlaylist('${pl.id}', openDropdownTrack); closeDropdown()">
                <div style="width:20px;height:20px;border-radius:3px;background:${pl.color};flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:.6rem;">${pl.tracks[0]?.img ? `<img src="${pl.tracks[0].img}" style="width:100%;height:100%;object-fit:cover;border-radius:3px;">` : '🎵'}</div>
                ${esc(pl.name)}
            </button>`;
        });
    }

    html += `
        <div class="dd-separator"></div>
        <button class="dd-item" onclick="openCreateModalAndAdd(openDropdownTrack); closeDropdown()">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M11 11V3h2v8h8v2h-8v8h-2v-8H3v-2z"/></svg>
            Nouvelle playlist
        </button>
    `;

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
        </button>
    `;
    positionDropdown(menu, e);
    menu.classList.add('open');
}

function positionDropdown(menu, e) {
    menu.style.top  = '0px';
    menu.style.left = '0px';
    document.body.appendChild(menu);
    const x  = e.clientX, y = e.clientY;
    const mw = 220, mh = menu.scrollHeight || 300;
    const left = Math.min(x, window.innerWidth  - mw - 8);
    const top  = Math.min(y, window.innerHeight - mh - 8);
    menu.style.left = `${left}px`;
    menu.style.top  = `${top}px`;
}

function closeDropdown() {
    document.getElementById('dropdown-menu').classList.remove('open');
}

document.addEventListener('click', () => closeDropdown());
document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { closeDropdown(); closeModal(); }
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
   document.querySelector('.sidebar').classList.remove('mobile-open'); // ← ajouter
    currentSection = 'search';
    document.getElementById('search-section').style.display         = 'block';
    document.getElementById('playlist-view-section').style.display  = 'none';
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
document.getElementById('btn-shuffle').addEventListener('click', function () { this.classList.toggle('active'); });
document.getElementById('btn-repeat').addEventListener('click',  function () { this.classList.toggle('active'); });
document.getElementById('btn-heart').addEventListener('click',   function () { this.classList.toggle('active'); });

/* ═══════════════════════════════════════
   SEARCH CLEAR
════════════════════════════════════════ */
document.getElementById('search-btn').addEventListener('click', searchMusic);
document.getElementById('search-input').addEventListener('keypress', e => {
    if (e.key === 'Enter') searchMusic();
});
document.getElementById('search-input').addEventListener('input', function () {
    document.getElementById('search-clear').style.display = this.value ? 'inline-flex' : 'none';
});

function clearSearch() {
    const input = document.getElementById('search-input');
    input.value = '';
    input.focus();
    document.getElementById('search-clear').style.display = 'none';
    document.getElementById('results').innerHTML = '';
    document.getElementById('results-placeholder').style.display = 'block';
}

/* ═══════════════════════════════════════
   INIT
════════════════════════════════════════ */
setBarFill('volume-bar', 100);
renderQueue();
// renderLibrary() appelé automatiquement par le listener Firestore
