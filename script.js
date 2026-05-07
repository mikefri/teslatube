import {
    auth, db,
    loginUser, registerUser, logoutUser,
    savePlaylistRemote, loadPlaylistRemote,
    onAuthStateChanged
} from "./firebase.js";

/* ═══════════════════════════════════════
   STATE
═══════════════════════════════════════ */
let player;
let playlist      = [];
let historyStack  = [];
let progressInterval;
let isPlaying     = false;
let isMuted       = false;
let lastVolume    = 100;
let queueVisible  = true;
let currentTrack  = null;
let currentUser   = null;

/* ─── YouTube IFrame API ─── */
window.onYouTubeIframeAPIReady = function () {
    player = new YT.Player('player', {
        height: '0', width: '0', videoId: '',
        playerVars: { 'playsinline': 1 },
        events: {
            'onReady':       () => setVolume(100),
            'onStateChange': onPlayerStateChange
        }
    });
};

/* ═══════════════════════════════════════
   AUTH — state listener
═══════════════════════════════════════ */
onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentUser = user;
        showApp();
        updateUserAvatar(user.email);
        try {
            playlist = await loadPlaylistRemote(user.uid);
        } catch {
            playlist = JSON.parse(localStorage.getItem('mySpotubePlaylist')) || [];
        }
        renderPlaylist();
    } else {
        currentUser = null;
        showAuthModal();
    }
});

/* ═══════════════════════════════════════
   AUTH — UI helpers
═══════════════════════════════════════ */
function showApp() {
    document.getElementById('auth-overlay').style.display = 'none';
    document.getElementById('app').style.display = 'grid';
}

function showAuthModal() {
    document.getElementById('auth-overlay').style.display = 'flex';
    document.getElementById('app').style.display = 'none';
}

function updateUserAvatar(email) {
    const initial = (email || 'U')[0].toUpperCase();
    document.getElementById('user-initial').textContent = initial;
}

/* ═══════════════════════════════════════
   AUTH — tab toggle (login ↔ register)
═══════════════════════════════════════ */
document.getElementById('tab-login').addEventListener('click', () => switchTab('login'));
document.getElementById('tab-register').addEventListener('click', () => switchTab('register'));

function switchTab(tab) {
    const isLogin = tab === 'login';
    document.getElementById('tab-login').classList.toggle('auth-tab-active', isLogin);
    document.getElementById('tab-register').classList.toggle('auth-tab-active', !isLogin);
    document.getElementById('form-login').style.display    = isLogin ? 'flex' : 'none';
    document.getElementById('form-register').style.display = isLogin ? 'none' : 'flex';
    document.getElementById('auth-error').textContent = '';
}

/* ═══════════════════════════════════════
   AUTH — login form
═══════════════════════════════════════ */
document.getElementById('form-login').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email    = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;
    const btn      = document.getElementById('btn-login');
    const errEl    = document.getElementById('auth-error');
    errEl.textContent = '';
    btn.disabled = true;
    btn.textContent  = 'Connexion…';
    try {
        await loginUser(email, password);
    } catch (err) {
        errEl.textContent = friendlyAuthError(err.code);
        btn.disabled = false;
        btn.textContent  = 'Se connecter';
    }
});

/* ═══════════════════════════════════════
   AUTH — register form
═══════════════════════════════════════ */
document.getElementById('form-register').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email    = document.getElementById('register-email').value.trim();
    const password = document.getElementById('register-password').value;
    const confirm  = document.getElementById('register-confirm').value;
    const btn      = document.getElementById('btn-register');
    const errEl    = document.getElementById('auth-error');
    errEl.textContent = '';

    if (password !== confirm) {
        errEl.textContent = 'Les mots de passe ne correspondent pas.';
        return;
    }
    if (password.length < 6) {
        errEl.textContent = 'Le mot de passe doit comporter au moins 6 caractères.';
        return;
    }

    btn.disabled = true;
    btn.textContent  = 'Création…';
    try {
        await registerUser(email, password);
    } catch (err) {
        errEl.textContent = friendlyAuthError(err.code);
        btn.disabled = false;
        btn.textContent  = 'Créer un compte';
    }
});

/* ═══════════════════════════════════════
   AUTH — logout
═══════════════════════════════════════ */
document.getElementById('btn-logout').addEventListener('click', async () => {
    await logoutUser();
    playlist = [];
    renderPlaylist();
});

/* ═══════════════════════════════════════
   AUTH — error messages FR
═══════════════════════════════════════ */
function friendlyAuthError(code) {
    const map = {
        'auth/user-not-found':       'Aucun compte trouvé pour cet e-mail.',
        'auth/wrong-password':       'Mot de passe incorrect.',
        'auth/email-already-in-use': 'Cet e-mail est déjà utilisé.',
        'auth/invalid-email':        'Adresse e-mail invalide.',
        'auth/too-many-requests':    'Trop de tentatives. Réessaie plus tard.',
        'auth/weak-password':        'Mot de passe trop faible (6 caractères min).',
        'auth/network-request-failed': 'Erreur réseau. Vérifie ta connexion.',
        'auth/invalid-credential':   'E-mail ou mot de passe incorrect.',
    };
    return map[code] || 'Une erreur est survenue. Réessaie.';
}

/* ═══════════════════════════════════════
   SEARCH
═══════════════════════════════════════ */
const API_KEY = 'AIzaSyBX9_dZTK6PHaCI9_kOnT4jguY0u64o-54';

async function searchMusic() {
    const query = document.getElementById('search-input').value.trim();
    if (!query) return;

    const placeholder = document.getElementById('results-placeholder');
    const container   = document.getElementById('results');
    placeholder.style.display = 'none';
    container.innerHTML = '<div style="color:#b3b3b3;padding:30px 0;font-size:.9rem;">Recherche en cours…</div>';

    const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(query)}&type=video&videoCategoryId=10&maxResults=18&key=${API_KEY}`;
    try {
        const res  = await fetch(url);
        const data = await res.json();
        if (data.error) { container.innerHTML = '<div style="color:#b3b3b3;padding:30px 0;">Clé API expirée ou quota dépassé.</div>'; return; }
        renderResults(data.items || []);
    } catch {
        container.innerHTML = '<div style="color:#b3b3b3;padding:30px 0;">Erreur réseau.</div>';
    }
}

function renderResults(items) {
    const container = document.getElementById('results');
    container.innerHTML = '';

    items.forEach(item => {
        const t = {
            id:     item.id.videoId,
            title:  item.snippet.title,
            artist: item.snippet.channelTitle,
            img:    item.snippet.thumbnails.medium.url
        };

        const div = document.createElement('div');
        div.className = 'track-card';
        div.innerHTML = `
            <button class="btn-add-playlist" title="Ajouter à la file d'attente">+</button>
            <div class="card-img-wrap">
                <img src="${t.img}" alt="" loading="lazy">
                <button class="card-play-btn" title="Lire">
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="#000"><path d="M7.05 3.606l13.49 7.788a.7.7 0 010 1.212L7.05 20.394A.7.7 0 016 19.788V4.212a.7.7 0 011.05-.606z"/></svg>
                </button>
            </div>
            <h4 title="${escHtml(t.title)}">${escHtml(t.title)}</h4>
            <p>${escHtml(t.artist)}</p>
        `;

        div.addEventListener('click', () => playTrack(t));
        div.querySelector('.card-play-btn').addEventListener('click', e => { e.stopPropagation(); playTrack(t); });
        div.querySelector('.btn-add-playlist').addEventListener('click', e => {
            e.stopPropagation();
            addToPlaylist(t);
            const btn = e.currentTarget;
            btn.textContent = '✓';
            btn.style.cssText = 'background:var(--green);color:#000;display:flex;';
            setTimeout(() => { btn.textContent = '+'; btn.style.cssText = ''; }, 1500);
        });

        container.appendChild(div);
    });
}

/* ═══════════════════════════════════════
   PLAYBACK
═══════════════════════════════════════ */
function playTrack(t) {
    if (!player || !player.loadVideoById) return;
    if (currentTrack) historyStack.push(currentTrack);
    currentTrack = t;
    player.loadVideoById(t.id);
    updatePlayerUI(t);
    setPlayState(true);
    clearInterval(progressInterval);
    progressInterval = setInterval(updateProgress, 500);
    document.title = `${t.title} — Teslatube`;
}

function updatePlayerUI(t) {
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

window.togglePlay = function () {
    if (!player || !player.getPlayerState) return;
    const state = player.getPlayerState();
    if (state === 1) { player.pauseVideo(); setPlayState(false); }
    else             { player.playVideo();  setPlayState(true);  }
};

window.nextTrack = function () {
    if (playlist.length > 0) {
        const next = playlist.shift();
        savePlaylist();
        playTrack(next);
        renderPlaylist();
    }
};

window.prevTrack = function () {
    if (historyStack.length > 0) {
        const prev = historyStack.pop();
        if (currentTrack) playlist.unshift(currentTrack);
        currentTrack = null;
        savePlaylist();
        renderPlaylist();
        playTrack(prev);
    } else if (player && player.seekTo) {
        player.seekTo(0, true);
    }
};

function onPlayerStateChange(event) {
    const S = YT.PlayerState;
    if (event.data === S.ENDED)   { window.nextTrack(); }
    if (event.data === S.PAUSED)  { setPlayState(false); }
    if (event.data === S.PLAYING) { setPlayState(true);  }
}

/* ═══════════════════════════════════════
   PROGRESS BAR
═══════════════════════════════════════ */
function updateProgress() {
    if (!player || !player.getCurrentTime) return;
    const current  = player.getCurrentTime();
    const duration = player.getDuration();
    if (duration > 0) {
        const pct = (current / duration) * 100;
        setRangeValue('progress-bar', pct, '#535353');
        document.getElementById('time-current').textContent = formatTime(current);
        document.getElementById('time-total').textContent   = formatTime(duration);
    }
}

document.getElementById('progress-bar').addEventListener('input', function () {
    if (!player || !player.getDuration) return;
    const newTime = (this.value / 100) * player.getDuration();
    player.seekTo(newTime, true);
    setRangeValue('progress-bar', +this.value, '#535353');
});

/* ═══════════════════════════════════════
   VOLUME
═══════════════════════════════════════ */
document.getElementById('volume-bar').addEventListener('input', function () {
    setVolume(+this.value);
    isMuted = (+this.value === 0);
    updateVolIcon();
});

function setVolume(vol) {
    document.getElementById('volume-bar').value = vol;
    setRangeValue('volume-bar', vol, '#535353');
    if (player && player.setVolume) player.setVolume(vol);
}

window.toggleMute = function () {
    if (isMuted) {
        isMuted = false;
        setVolume(lastVolume || 100);
    } else {
        lastVolume = +document.getElementById('volume-bar').value || 100;
        isMuted = true;
        setVolume(0);
    }
    updateVolIcon();
};

function updateVolIcon() {
    document.getElementById('icon-vol-on').style.display  = isMuted ? 'none'  : 'block';
    document.getElementById('icon-vol-off').style.display = isMuted ? 'block' : 'none';
}

/* ═══════════════════════════════════════
   RANGE FILL HELPER
═══════════════════════════════════════ */
function setRangeValue(id, pct, trackColor) {
    const el = document.getElementById(id);
    if (!el) return;
    el.style.background = `linear-gradient(to right, #ffffff ${pct}%, ${trackColor} ${pct}%)`;
    el.dataset.pct = pct;
}

['progress-bar', 'volume-bar'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('mouseenter', () => {
        const pct = el.dataset.pct || el.value;
        el.style.background = `linear-gradient(to right, #1db954 ${pct}%, #535353 ${pct}%)`;
    });
    el.addEventListener('mouseleave', () => {
        const pct = el.dataset.pct || el.value;
        el.style.background = `linear-gradient(to right, #ffffff ${pct}%, #535353 ${pct}%)`;
    });
    el.addEventListener('input', () => {
        const pct = el.value;
        el.dataset.pct = pct;
        const color = el.matches(':hover') ? '#1db954' : '#ffffff';
        el.style.background = `linear-gradient(to right, ${color} ${pct}%, #535353 ${pct}%)`;
    });
});

/* ═══════════════════════════════════════
   QUEUE / PLAYLIST
═══════════════════════════════════════ */
function addToPlaylist(t) {
    playlist.push(t);
    savePlaylist();
    renderPlaylist();
}

async function savePlaylist() {
    // double sauvegarde : localStorage (fallback hors ligne) + Firestore
    localStorage.setItem('mySpotubePlaylist', JSON.stringify(playlist));
    if (currentUser) {
        try { await savePlaylistRemote(currentUser.uid, playlist); }
        catch (e) { console.warn('Firestore save failed:', e); }
    }
}

function renderPlaylist() {
    const container = document.getElementById('playlist-list');
    const countEl   = document.getElementById('playlist-count');
    const n = playlist.length;
    countEl.textContent = n === 0 ? "File d'attente vide"
        : `${n} piste${n > 1 ? 's' : ''} dans la file d'attente`;

    container.innerHTML = '';
    playlist.forEach((t, i) => {
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
                <span class="queue-title" title="${escHtml(t.title)}">${escHtml(t.title)}</span>
                <span class="queue-artist">${escHtml(t.artist)}</span>
            </div>
            <span class="queue-duration">--:--</span>
            <button class="queue-more-btn" title="Supprimer">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M4.5 13.5a1.5 1.5 0 110-3 1.5 1.5 0 010 3zm15 0a1.5 1.5 0 110-3 1.5 1.5 0 010 3zm-7.5 0a1.5 1.5 0 110-3 1.5 1.5 0 010 3z"/></svg>
            </button>
        `;
        div.addEventListener('click', () => {
            playlist.splice(i, 1);
            savePlaylist();
            playTrack(t);
            renderPlaylist();
        });
        div.querySelector('.queue-more-btn').addEventListener('click', e => {
            e.stopPropagation();
            playlist.splice(i, 1);
            savePlaylist();
            renderPlaylist();
        });
        container.appendChild(div);
    });
}

window.clearPlaylist = function () {
    playlist = [];
    savePlaylist();
    renderPlaylist();
};

window.toggleQueue = function () {
    queueVisible = !queueVisible;
    document.getElementById('app').classList.toggle('queue-hidden', !queueVisible);
    document.getElementById('btn-queue-toggle').classList.toggle('active', queueVisible);
};

/* ═══════════════════════════════════════
   SHUFFLE / REPEAT / HEART (visual)
═══════════════════════════════════════ */
document.getElementById('btn-shuffle').addEventListener('click', function () { this.classList.toggle('active'); });
document.getElementById('btn-repeat').addEventListener('click',  function () { this.classList.toggle('active'); });
document.getElementById('btn-heart').addEventListener('click',   function () { this.classList.toggle('active'); });

/* ═══════════════════════════════════════
   KEYBOARD SHORTCUTS
═══════════════════════════════════════ */
document.addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT') return;
    if (e.code === 'Space')      { e.preventDefault(); window.togglePlay(); }
    if (e.code === 'ArrowRight') { e.preventDefault(); window.nextTrack(); }
    if (e.code === 'ArrowLeft')  { e.preventDefault(); window.prevTrack(); }
});

/* ═══════════════════════════════════════
   UTILS
═══════════════════════════════════════ */
function formatTime(sec) {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
}

function escHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

window.focusSearch = function () {
    document.getElementById('search-input').focus();
};

/* ═══════════════════════════════════════
   SEARCH EVENTS
═══════════════════════════════════════ */
document.getElementById('search-btn').addEventListener('click', searchMusic);
document.getElementById('search-input').addEventListener('keypress', e => {
    if (e.key === 'Enter') searchMusic();
});

/* ═══════════════════════════════════════
   INIT
═══════════════════════════════════════ */
setRangeValue('volume-bar', 100, '#535353');
