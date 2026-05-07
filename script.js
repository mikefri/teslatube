import {
    auth, db,
    loginUser, registerUser, logoutUser,
    savePlaylistRemote, loadPlaylistRemote,
    saveUserPlaylists, loadUserPlaylists,
    onAuthStateChanged
} from "./firebase.js";

/* ═══════════════════════════════════════
   STATE
═══════════════════════════════════════ */
let player;
let queue         = [];   // lecture en cours (file d'attente)
let namedPlaylists = [];  // [{id, name, tracks:[]}]
let historyStack  = [];
let progressInterval;
let isPlaying     = false;
let isMuted       = false;
let lastVolume    = 100;
let queueVisible  = true;
let currentTrack  = null;
let currentUser   = null;
let currentView   = 'search'; // 'search' | 'playlist'
let currentPlaylistViewId = null;
let pendingMenuTrack = null;  // track en attente pour le menu contextuel

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
            queue = await loadPlaylistRemote(user.uid);
        } catch {
            queue = JSON.parse(localStorage.getItem('mySpotubePlaylist')) || [];
        }
        try {
            namedPlaylists = await loadUserPlaylists(user.uid);
        } catch {
            namedPlaylists = JSON.parse(localStorage.getItem('namedPlaylists')) || [];
        }
        renderQueue();
        renderSidebarPlaylists();
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
   AUTH — tab toggle
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
    queue = [];
    namedPlaylists = [];
    renderQueue();
    renderSidebarPlaylists();
});

/* ═══════════════════════════════════════
   AUTH — error messages FR
═══════════════════════════════════════ */
function friendlyAuthError(code) {
    const map = {
        'auth/user-not-found':         'Aucun compte trouvé pour cet e-mail.',
        'auth/wrong-password':         'Mot de passe incorrect.',
        'auth/email-already-in-use':   'Cet e-mail est déjà utilisé.',
        'auth/invalid-email':          'Adresse e-mail invalide.',
        'auth/too-many-requests':      'Trop de tentatives. Réessaie plus tard.',
        'auth/weak-password':          'Mot de passe trop faible (6 caractères min).',
        'auth/network-request-failed': 'Erreur réseau. Vérifie ta connexion.',
        'auth/invalid-credential':     'E-mail ou mot de passe incorrect.',
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

    showSearchView();

    const placeholder = document.getElementById('results-placeholder');
    const container   = document.getElementById('results');
    placeholder.style.display = 'none';
    container.innerHTML = '<div style="color:#b3b3b3;padding:30px 0;font-size:.9rem;">Recherche en cours…</div>';

    const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(query)}&type=video&videoCategoryId=10&maxResults=18&key=${API_KEY}`;
    try {
        const res  = await fetch(url);
        const data = await res.json();
        if (data.error) {
            container.innerHTML = '<div style="color:#b3b3b3;padding:30px 0;">Clé API expirée ou quota dépassé.</div>';
            return;
        }
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
            <button class="btn-add-playlist" title="Ajouter à…">+</button>
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
        div.querySelector('.card-play-btn').addEventListener('click', e => {
            e.stopPropagation();
            playTrack(t);
        });
        div.querySelector('.btn-add-playlist').addEventListener('click', e => {
            e.stopPropagation();
            showAddToPlaylistMenu(t, e.currentTarget);
        });

        container.appendChild(div);
    });
}

/* ═══════════════════════════════════════
   NAMED PLAYLISTS — CRUD
═══════════════════════════════════════ */
function createPlaylist(name) {
    const pl = {
        id:     `pl_${Date.now()}`,
        name:   name.trim(),
        tracks: []
    };
    namedPlaylists.push(pl);
    saveNamedPlaylists();
    renderSidebarPlaylists();
    return pl;
}

window.deletePlaylist = function(id) {
    if (!confirm('Supprimer cette playlist ?')) return;
    namedPlaylists = namedPlaylists.filter(p => p.id !== id);
    saveNamedPlaylists();
    renderSidebarPlaylists();
    if (currentPlaylistViewId === id) {
        currentPlaylistViewId = null;
        showSearchView();
    }
};

function addTrackToNamedPlaylist(playlistId, track) {
    const pl = namedPlaylists.find(p => p.id === playlistId);
    if (!pl) return false;
    if (pl.tracks.find(t => t.id === track.id)) return false; // déjà présent
    pl.tracks.push(track);
    saveNamedPlaylists();
    renderSidebarPlaylists();
    if (currentPlaylistViewId === playlistId) renderPlaylistView(playlistId);
    return true;
}

window.removeTrackFromPlaylist = function(e, playlistId, index) {
    e.stopPropagation();
    const pl = namedPlaylists.find(p => p.id === playlistId);
    if (!pl) return;
    pl.tracks.splice(index, 1);
    saveNamedPlaylists();
    renderSidebarPlaylists();
    renderPlaylistView(playlistId);
};

async function saveNamedPlaylists() {
    localStorage.setItem('namedPlaylists', JSON.stringify(namedPlaylists));
    if (currentUser) {
        try { await saveUserPlaylists(currentUser.uid, namedPlaylists); }
        catch (e) { console.warn('Named playlists save failed:', e); }
    }
}

/* ═══════════════════════════════════════
   SIDEBAR — playlists
═══════════════════════════════════════ */
function renderSidebarPlaylists() {
    const container = document.querySelector('.library-empty');
    if (!container) return;

    if (namedPlaylists.length === 0) {
        container.innerHTML = `
            <div class="library-empty-card">
                <p class="lib-empty-title">Créez votre première playlist</p>
                <p class="lib-empty-sub">C'est facile, nous allons vous aider.</p>
                <button class="btn-pill-white" onclick="showCreatePlaylistModal()">Créer une playlist</button>
            </div>
            <div class="library-empty-card">
                <p class="lib-empty-title">Parcourez les podcasts</p>
                <p class="lib-empty-sub">Nous vous montrerons les podcasts auxquels vous êtes abonné.</p>
                <button class="btn-pill-white" onclick="focusSearch()">Explorer les podcasts</button>
            </div>`;
    } else {
        container.innerHTML = namedPlaylists.map(pl => {
            const firstImg = pl.tracks[0]?.img;
            return `
            <div class="sidebar-playlist-item ${currentPlaylistViewId === pl.id ? 'active' : ''}"
                 onclick="openPlaylistView('${pl.id}')">
                <div class="sidebar-pl-thumb">
                    ${firstImg
                        ? `<img src="${firstImg}" alt="">`
                        : `<svg viewBox="0 0 24 24" width="20" height="20" fill="#535353">
                             <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/>
                           </svg>`}
                </div>
                <div class="sidebar-pl-info">
                    <span class="sidebar-pl-name">${escHtml(pl.name)}</span>
                    <span class="sidebar-pl-count">Playlist · ${pl.tracks.length} titre${pl.tracks.length !== 1 ? 's' : ''}</span>
                </div>
            </div>`;
        }).join('');
    }
}

/* ═══════════════════════════════════════
   PLAYLIST VIEW (zone principale)
═══════════════════════════════════════ */
function openPlaylistView(id) {
    currentPlaylistViewId = id;
    currentView = 'playlist';
    document.getElementById('results-placeholder').style.display = 'none';
    document.getElementById('results').style.display = 'none';
    renderPlaylistView(id);
    renderSidebarPlaylists(); // met à jour l'item actif dans la sidebar
}

function renderPlaylistView(id) {
    const pl = namedPlaylists.find(p => p.id === id);
    if (!pl) return;

    let viewEl = document.getElementById('playlist-view');
    if (!viewEl) {
        viewEl = document.createElement('div');
        viewEl.id = 'playlist-view';
        document.getElementById('results').parentNode.appendChild(viewEl);
    }
    viewEl.style.display = 'block';

    const firstImg = pl.tracks[0]?.img;

    viewEl.innerHTML = `
        <div class="pl-view-header">
            <div class="pl-view-art">
                ${firstImg
                    ? `<img src="${firstImg}" alt="">`
                    : `<div class="pl-art-placeholder">
                         <svg viewBox="0 0 24 24" width="56" height="56" fill="#535353">
                           <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/>
                         </svg>
                       </div>`}
            </div>
            <div class="pl-view-meta">
                <span class="pl-view-type">Playlist</span>
                <h1 class="pl-view-name">${escHtml(pl.name)}</h1>
                <span class="pl-view-count">${pl.tracks.length} titre${pl.tracks.length !== 1 ? 's' : ''}</span>
            </div>
        </div>
        <div class="pl-view-controls">
            ${pl.tracks.length > 0 ? `
            <button class="btn-play-circle pl-play-all" onclick="playPlaylistAll('${id}')" title="Tout lire">
                <svg viewBox="0 0 24 24" width="22" height="22" fill="#000">
                    <path d="M7.05 3.606l13.49 7.788a.7.7 0 010 1.212L7.05 20.394A.7.7 0 016 19.788V4.212a.7.7 0 011.05-.606z"/>
                </svg>
            </button>` : ''}
            <button class="ctrl-icon pl-delete-btn" onclick="deletePlaylist('${id}')" title="Supprimer la playlist">
                <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                    <path d="M2 6a1 1 0 011-1h1.5l1.707-1.707A1 1 0 017.914 3h8.172a1 1 0 01.707.293L18.5 5H20a1 1 0 110 2H4a1 1 0 01-2-2zm2.9 3.1A1 1 0 016.837 8.9L7 9.067V19a2 2 0 002 2h6a2 2 0 002-2V9.067l.163-.167a1 1 0 011.374 1.453L18 10.934V19a4 4 0 01-4 4H10a4 4 0 01-4-4v-8.066L5.1 10.1A1 1 0 014.9 9.1z"/>
                </svg>
            </button>
        </div>
        <div class="pl-track-list">
            ${pl.tracks.length === 0
                ? `<p class="pl-empty-msg">
                       Cette playlist est vide.<br>
                       Recherchez des titres et cliquez sur <strong>+</strong> pour les ajouter.
                   </p>`
                : pl.tracks.map((t, i) => `
                    <div class="pl-track-item" onclick="playPlaylistTrack('${id}', ${i})">
                        <span class="pl-track-num">${i + 1}</span>
                        <img class="pl-track-thumb" src="${t.img}" alt="" onerror="this.style.display='none'">
                        <div class="pl-track-info">
                            <span class="pl-track-title" title="${escHtml(t.title)}">${escHtml(t.title)}</span>
                            <span class="pl-track-artist">${escHtml(t.artist)}</span>
                        </div>
                        <button class="queue-more-btn pl-track-del"
                                onclick="removeTrackFromPlaylist(event, '${id}', ${i})"
                                title="Retirer de la playlist">
                            <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor">
                                <path d="M2 6a1 1 0 011-1h1.5l1.707-1.707A1 1 0 017.914 3h8.172a1 1 0 01.707.293L18.5 5H20a1 1 0 110 2H4a1 1 0 01-2-2zm2.9 3.1A1 1 0 016.837 8.9L7 9.067V19a2 2 0 002 2h6a2 2 0 002-2V9.067l.163-.167a1 1 0 011.374 1.453L18 10.934V19a4 4 0 01-4 4H10a4 4 0 01-4-4v-8.066L5.1 10.1A1 1 0 014.9 9.1z"/>
                            </svg>
                        </button>
                    </div>`
                ).join('')}
        </div>`;
}

function showSearchView() {
    currentView = 'search';
    currentPlaylistViewId = null;
    const viewEl = document.getElementById('playlist-view');
    if (viewEl) viewEl.style.display = 'none';
    document.getElementById('results').style.display = '';
    renderSidebarPlaylists();
}

window.playPlaylistAll = function(id) {
    const pl = namedPlaylists.find(p => p.id === id);
    if (!pl || pl.tracks.length === 0) return;
    const [first, ...rest] = pl.tracks;
    queue = [...rest];
    saveQueue();
    renderQueue();
    playTrack(first);
};

window.playPlaylistTrack = function(id, index) {
    const pl = namedPlaylists.find(p => p.id === id);
    if (!pl) return;
    const rest = pl.tracks.filter((_, i) => i !== index);
    queue = [...rest];
    saveQueue();
    renderQueue();
    playTrack(pl.tracks[index]);
};

/* ═══════════════════════════════════════
   MODAL — créer une playlist
═══════════════════════════════════════ */
window.showCreatePlaylistModal = function(prefillTrack = null) {
    document.getElementById('create-pl-modal')?.remove();

    const modal = document.createElement('div');
    modal.id = 'create-pl-modal';
    modal.className = 'modal-overlay';
    modal.innerHTML = `
        <div class="modal-card">
            <h3 class="modal-title">Nouvelle playlist</h3>
            <input type="text" id="new-pl-name" class="auth-input" placeholder="Nom de la playlist" maxlength="60" autocomplete="off">
            <p id="modal-error" style="color:#f15e6c;font-size:.8rem;min-height:18px;margin-top:4px;"></p>
            <div class="modal-actions">
                <button class="btn-pill-white" id="btn-confirm-pl">Créer</button>
                <button class="topbar-pill-btn-ghost" onclick="document.getElementById('create-pl-modal').remove()">Annuler</button>
            </div>
        </div>`;

    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
    document.body.appendChild(modal);

    const input = document.getElementById('new-pl-name');
    setTimeout(() => input.focus(), 50);

    const confirm = () => {
        const name = input.value.trim();
        if (!name) {
            document.getElementById('modal-error').textContent = 'Donne un nom à ta playlist.';
            return;
        }
        const pl = createPlaylist(name);
        if (prefillTrack) addTrackToNamedPlaylist(pl.id, prefillTrack);
        modal.remove();
        openPlaylistView(pl.id);
    };

    document.getElementById('btn-confirm-pl').addEventListener('click', confirm);
    input.addEventListener('keypress', e => { if (e.key === 'Enter') confirm(); });
};

/* ═══════════════════════════════════════
   MENU CONTEXTUEL — ajouter à…
═══════════════════════════════════════ */
function showAddToPlaylistMenu(track, btnEl) {
    // Ferme tous les menus existants
    document.querySelectorAll('.add-to-pl-menu').forEach(el => el.remove());
    pendingMenuTrack = track;

    const menu = document.createElement('div');
    menu.className = 'add-to-pl-menu';

    const queueItem = `
        <button class="apl-item" data-action="queue">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
                <path d="M15 4a1 1 0 100 2h6a1 1 0 100-2h-6zm0 5a1 1 0 100 2h6a1 1 0 100-2h-6zm0 5a1 1 0 100 2h6a1 1 0 100-2h-6zM6 4a1 1 0 00-1 1v8.5a2.5 2.5 0 101 0V5a1 1 0 00-1-1zm0 13a1.5 1.5 0 110-3 1.5 1.5 0 010 3z"/>
            </svg>
            Ajouter à la file d'attente
        </button>`;

    const separator = '<div class="apl-separator"></div>';

    const plItems = namedPlaylists.map(pl => `
        <button class="apl-item" data-action="playlist" data-id="${pl.id}">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
                <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/>
            </svg>
            ${escHtml(pl.name)}
        </button>`).join('');

    const newPlItem = `
        ${namedPlaylists.length > 0 ? separator : ''}
        <button class="apl-item apl-new" data-action="new">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
                <path d="M11 11V3h2v8h8v2h-8v8h-2v-8H3v-2z"/>
            </svg>
            Nouvelle playlist
        </button>`;

    menu.innerHTML = queueItem + separator + plItems + newPlItem;

    // Gestion des clics dans le menu
    menu.addEventListener('click', e => {
        const btn = e.target.closest('.apl-item');
        if (!btn) return;
        const action = btn.dataset.action;
        const t = pendingMenuTrack;

        if (action === 'queue') {
            addToQueue(t);
            showMenuFeedback(btn, '✓ Ajouté à la file');
        } else if (action === 'playlist') {
            const added = addTrackToNamedPlaylist(btn.dataset.id, t);
            showMenuFeedback(btn, added ? '✓ Ajouté' : '✓ Déjà présent');
        } else if (action === 'new') {
            menu.remove();
            showCreatePlaylistModal(t);
            return;
        }
        setTimeout(() => menu.remove(), 700);
    });

    document.body.appendChild(menu);

    // Positionnement intelligent
    const rect = btnEl.getBoundingClientRect();
    const menuW = 220;
    let left = rect.left;
    if (left + menuW > window.innerWidth - 8) left = window.innerWidth - menuW - 8;
    menu.style.left = `${left}px`;
    menu.style.top  = `${rect.bottom + 6}px`;

    // Fermeture au clic extérieur
    setTimeout(() => {
        document.addEventListener('click', function closeMenu(e) {
            if (!menu.contains(e.target) && e.target !== btnEl) {
                menu.remove();
                document.removeEventListener('click', closeMenu);
            }
        });
    }, 0);
}

function showMenuFeedback(btn, msg) {
    btn.textContent = msg;
    btn.style.color = 'var(--green)';
}

function addToQueue(t) {
    queue.push(t);
    saveQueue();
    renderQueue();
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
    if (queue.length > 0) {
        const next = queue.shift();
        saveQueue();
        playTrack(next);
        renderQueue();
    }
};

window.prevTrack = function () {
    if (historyStack.length > 0) {
        const prev = historyStack.pop();
        if (currentTrack) queue.unshift(currentTrack);
        currentTrack = null;
        saveQueue();
        renderQueue();
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
   QUEUE (file d'attente)
═══════════════════════════════════════ */
async function saveQueue() {
    localStorage.setItem('mySpotubePlaylist', JSON.stringify(queue));
    if (currentUser) {
        try { await savePlaylistRemote(currentUser.uid, queue); }
        catch (e) { console.warn('Queue save failed:', e); }
    }
}

function renderQueue() {
    const container = document.getElementById('playlist-list');
    const countEl   = document.getElementById('playlist-count');
    const n = queue.length;
    countEl.textContent = n === 0 ? "File d'attente vide"
        : `${n} piste${n > 1 ? 's' : ''} dans la file d'attente`;

    container.innerHTML = '';
    queue.forEach((t, i) => {
        const div = document.createElement('div');
        div.className = 'queue-item';
        div.innerHTML = `
            <span class="queue-drag">⠿⠿</span>
            <div class="queue-thumb-wrap">
                <img class="queue-thumb" src="${t.img}" alt="" onerror="this.style.display='none'">
                <div class="queue-play-overlay">
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="#fff">
                        <path d="M7.05 3.606l13.49 7.788a.7.7 0 010 1.212L7.05 20.394A.7.7 0 016 19.788V4.212a.7.7 0 011.05-.606z"/>
                    </svg>
                </div>
            </div>
            <div class="queue-info">
                <span class="queue-title" title="${escHtml(t.title)}">${escHtml(t.title)}</span>
                <span class="queue-artist">${escHtml(t.artist)}</span>
            </div>
            <span class="queue-duration">--:--</span>
            <button class="queue-more-btn" title="Supprimer">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                    <path d="M4.5 13.5a1.5 1.5 0 110-3 1.5 1.5 0 010 3zm15 0a1.5 1.5 0 110-3 1.5 1.5 0 010 3zm-7.5 0a1.5 1.5 0 110-3 1.5 1.5 0 010 3z"/>
                </svg>
            </button>`;
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

window.clearPlaylist = function () {
    queue = [];
    saveQueue();
    renderQueue();
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
    showSearchView();
    document.getElementById('search-input').focus();
};

/* ═══════════════════════════════════════
   SEARCH EVENTS
═══════════════════════════════════════ */
document.getElementById('search-btn').addEventListener('click', searchMusic);
document.getElementById('search-input').addEventListener('keypress', e => {
    if (e.key === 'Enter') searchMusic();
});

/* Bouton "+" de la sidebar (créer playlist) */
document.querySelector('.btn-circle-sm').addEventListener('click', () => showCreatePlaylistModal());

/* ═══════════════════════════════════════
   INIT
═══════════════════════════════════════ */
setRangeValue('volume-bar', 100, '#535353');
