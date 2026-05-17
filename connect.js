/* ═══════════════════════════════════════════════════
   TESLATUBE — connect.js
   Diffusion type Spotify Connect via Firebase
   ════════════════════════════════════════════════════

   FONCTIONNEMENT :
   - Chaque appareil ouvert s'enregistre dans Firestore
   - Un écouteur surveille les commandes entrantes
   - "Diffuser sur" → on choisit un appareil → il joue
   ══════════════════════════════════════════════════ */

const DEVICE_ID   = 'dev_' + Math.random().toString(36).slice(2, 9);
const DEVICE_NAME = getDeviceName();
let   connectUnsubscribe = null;

/* ── Nom lisible de l'appareil ── */
function getDeviceName() {
    const ua = navigator.userAgent;
    if (/iPhone/i.test(ua))  return '📱 iPhone';
    if (/iPad/i.test(ua))    return '📱 iPad';
    if (/Android/i.test(ua)) return '📱 Android';
    if (/Mac/i.test(ua))     return '💻 Mac';
    if (/Win/i.test(ua))     return '💻 Windows';
    return '🖥️ Appareil';
}

/* ═══════════════════════════════════════
   ENREGISTREMENT DE L'APPAREIL
════════════════════════════════════════ */
function registerDevice() {
    if (!currentUserId) return;

    const ref = db.collection('users').doc(currentUserId)
                  .collection('devices').doc(DEVICE_ID);

    // Enregistre cet appareil comme actif
    ref.set({
        name:     DEVICE_NAME,
        lastSeen: Date.now(),
        deviceId: DEVICE_ID
    });

    // Ping toutes les 30s pour rester "en ligne"
    setInterval(() => ref.update({ lastSeen: Date.now() }), 30_000);

    // Supprime l'appareil quand on ferme l'onglet
    window.addEventListener('beforeunload', () => ref.delete());

    // Écoute les commandes entrantes pour CET appareil
    connectUnsubscribe = ref.onSnapshot(doc => {
        const data = doc.data();
        if (!data?.command) return;

        if (data.command === 'play' && data.track) {
            playTrack(data.track);
            showToast(`📡 Lecture reçue depuis un autre appareil`);
        }
        if (data.command === 'pause' && player?.pauseVideo) player.pauseVideo();
        if (data.command === 'resume' && player?.playVideo)  player.playVideo();

        // Efface la commande après exécution
        ref.update({ command: null, track: null });
    });
}

/* ═══════════════════════════════════════
   POPUP "DIFFUSER SUR"
════════════════════════════════════════ */
async function openConnectPopup(btnEl) {
    // Ferme si déjà ouvert
    const existing = document.getElementById('connect-popup');
    if (existing) { existing.remove(); return; }

    const popup = document.createElement('div');
    popup.id = 'connect-popup';
    popup.innerHTML = `
        <div class="connect-popup-title">Diffuser sur</div>
        <div id="connect-device-list">
            <div class="connect-loading">Recherche des appareils…</div>
        </div>`;
    document.body.appendChild(popup);

    // Positionne la popup au-dessus du bouton
    const r = btnEl.getBoundingClientRect();
    popup.style.bottom = (window.innerHeight - r.top + 8) + 'px';
    popup.style.left   = Math.max(8, r.left - 80) + 'px';

    // Ferme si clic dehors
    setTimeout(() => {
        document.addEventListener('click', e => {
            if (!popup.contains(e.target) && e.target !== btnEl)
                popup.remove();
        }, { once: true });
    }, 50);

    // Charge les appareils actifs (vus dans les 60 dernières secondes)
    const snap = await db.collection('users').doc(currentUserId)
                         .collection('devices').get();

    const now      = Date.now();
    const devices  = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(d => now - d.lastSeen < 60_000); // actif dans la dernière minute

    const list = document.getElementById('connect-device-list');

    if (devices.length === 0) {
        list.innerHTML = `<div class="connect-empty">
            Aucun autre appareil connecté.<br>
            <small>Ouvrez TeslaTube sur un autre appareil.</small>
        </div>`;
        return;
    }

    list.innerHTML = '';
    devices.forEach(device => {
        const isThis = device.id === DEVICE_ID;
        const btn    = document.createElement('button');
        btn.className = 'connect-device-btn' + (isThis ? ' connect-device-active' : '');
        btn.innerHTML = `
            <span class="connect-device-icon">
                ${isThis
                    ? `<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M3 18v-2a7 7 0 0114 0v2"/><circle cx="10" cy="8" r="4"/></svg>`
                    : `<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M1 18v3h3a3 3 0 00-3-3zm0-4v2a7 7 0 017 7h2a9 9 0 00-9-9zm0-4v2a11 11 0 0111 11h2C14 13 8 7 1 10z"/></svg>`}
            </span>
            <div class="connect-device-meta">
                <span class="connect-device-name">${esc(device.name)}</span>
                <span class="connect-device-sub">${isThis ? 'Cet appareil' : 'Disponible'}</span>
            </div>
            ${isThis ? `<svg viewBox="0 0 24 24" width="16" height="16" fill="var(--green)"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>` : ''}`;

        if (!isThis) {
            btn.addEventListener('click', () => {
                castToDevice(device.id);
                popup.remove();
            });
        }

        list.appendChild(btn);
    });
}

/* ═══════════════════════════════════════
   ENVOI DE LA PISTE À UN APPAREIL
════════════════════════════════════════ */
async function castToDevice(targetDeviceId) {
    if (!currentTrack) { showToast('Aucun titre en cours'); return; }

    await db.collection('users').doc(currentUserId)
            .collection('devices').doc(targetDeviceId)
            .update({ command: 'play', track: currentTrack });

    showToast(`📡 Diffusion envoyée vers l'autre appareil`);
}

/* ═══════════════════════════════════════
   DÉMARRAGE (appelé après auth Firebase)
════════════════════════════════════════ */
function initConnect() {
    registerDevice();
}
