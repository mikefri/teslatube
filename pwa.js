/* ═══════════════════════════════════════════════════
   TESLATUBE — pwa.js
   Enregistrement SW + bouton d'installation
════════════════════════════════════════════════════ */

/* ── Enregistrement du Service Worker ── */
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/service-worker.js')
            .then(reg => {
                console.log('[PWA] Service Worker enregistré :', reg.scope);

                // Détecte une mise à jour disponible
                reg.addEventListener('updatefound', () => {
                    const newWorker = reg.installing;
                    newWorker.addEventListener('statechange', () => {
                        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                            showUpdateToast();
                        }
                    });
                });
            })
            .catch(err => console.error('[PWA] Erreur SW :', err));
    });
}

/* ── Bouton d'installation (prompt natif) ── */
let deferredPrompt = null;

window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    deferredPrompt = e;
    showInstallBanner();
});

window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    hideInstallBanner();
    console.log('[PWA] Application installée !');
});

function showInstallBanner() {
    // Crée la bannière si elle n'existe pas encore
    if (document.getElementById('pwa-install-banner')) return;

    const banner = document.createElement('div');
    banner.id = 'pwa-install-banner';
    banner.innerHTML = `
        <div style="
            position: fixed; bottom: 90px; left: 50%; transform: translateX(-50%);
            background: #282828; border: 1px solid #404040; border-radius: 12px;
            padding: 14px 20px; display: flex; align-items: center; gap: 14px;
            box-shadow: 0 8px 32px rgba(0,0,0,.6); z-index: 4000;
            max-width: 380px; width: calc(100% - 32px);
            animation: slideUp .3s ease;
        ">
            <img src="icons/icon-72.png" width="40" height="40" style="border-radius:8px;flex-shrink:0;" onerror="this.style.display='none'">
            <div style="flex:1;min-width:0;">
                <div style="font-size:.875rem;font-weight:700;color:#fff;margin-bottom:3px;">Installer TeslaTube</div>
                <div style="font-size:.75rem;color:#b3b3b3;">Accès rapide depuis votre écran d'accueil</div>
            </div>
            <button id="pwa-install-btn" style="
                background:#1db954;color:#000;border:none;border-radius:500px;
                padding:8px 16px;font-size:.8rem;font-weight:700;cursor:pointer;
                flex-shrink:0;white-space:nowrap;
            ">Installer</button>
            <button id="pwa-dismiss-btn" style="
                background:none;border:none;color:#b3b3b3;font-size:1.2rem;
                cursor:pointer;padding:4px;line-height:1;flex-shrink:0;
            ">✕</button>
        </div>
        <style>
            @keyframes slideUp { from { transform: translateX(-50%) translateY(20px); opacity:0; } to { transform: translateX(-50%) translateY(0); opacity:1; } }
        </style>
    `;

    document.body.appendChild(banner);

    document.getElementById('pwa-install-btn').addEventListener('click', async () => {
        if (!deferredPrompt) return;
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        console.log('[PWA] Choix utilisateur :', outcome);
        deferredPrompt = null;
        hideInstallBanner();
    });

    document.getElementById('pwa-dismiss-btn').addEventListener('click', () => {
        hideInstallBanner();
        // Ne plus afficher pendant 7 jours
        localStorage.setItem('pwa-dismissed', Date.now());
    });
}

function hideInstallBanner() {
    const banner = document.getElementById('pwa-install-banner');
    if (banner) banner.remove();
}

/* ── Toast de mise à jour disponible ── */
function showUpdateToast() {
    const toast = document.createElement('div');
    toast.innerHTML = `
        <div style="
            position:fixed; bottom:90px; left:50%; transform:translateX(-50%);
            background:#282828; border:1px solid #404040; border-radius:12px;
            padding:14px 20px; display:flex; align-items:center; gap:14px;
            box-shadow:0 8px 32px rgba(0,0,0,.6); z-index:4000;
            max-width:380px; width:calc(100% - 32px);
        ">
            <div style="flex:1;color:#fff;font-size:.875rem;">
                🔄 Une mise à jour est disponible !
            </div>
            <button onclick="window.location.reload()" style="
                background:#1db954;color:#000;border:none;border-radius:500px;
                padding:8px 16px;font-size:.8rem;font-weight:700;cursor:pointer;
            ">Mettre à jour</button>
        </div>
    `;
    document.body.appendChild(toast);
}

/* ── Media Session API (contrôles dans la notification / lock screen) ── */
function updateMediaSession(track) {
    if (!('mediaSession' in navigator)) return;

    navigator.mediaSession.metadata = new MediaMetadata({
        title:  track.title,
        artist: track.artist,
        album:  'TeslaTube',
        artwork: [
            { src: track.img, sizes: '320x180', type: 'image/jpeg' }
        ]
    });

    navigator.mediaSession.setActionHandler('play',          () => { if (player) player.playVideo(); });
    navigator.mediaSession.setActionHandler('pause',         () => { if (player) player.pauseVideo(); });
    navigator.mediaSession.setActionHandler('nexttrack',     () => nextTrack());
    navigator.mediaSession.setActionHandler('previoustrack', () => prevTrack());
}
