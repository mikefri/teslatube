/* ═══════════════════════════════════════════════════════
   TESLATUBE — mobile-patch.js
   À inclure APRÈS script.js et AVANT pwa.js dans index.html :
     <script src="mobile-patch.js"></script>
════════════════════════════════════════════════════════ */

/* ── 1. Neutralise les patches JS de layout (remplacés par CSS) ── */
function forceMobileGrid() {}
function fixPlaylistMobileLayout() {}

/* ── 2. Fix autofill email dans la barre de recherche ── */
(function fixSearchAutofill() {
  const input = document.getElementById('search-input');
  if (!input) return;

  /* Le navigateur ignore souvent autocomplete="off".
     La méthode la plus fiable : vider le champ au chargement
     s'il contient une valeur qui ressemble à un email,
     et utiliser un nom de champ unique pour briser l'autofill. */
  input.setAttribute('autocomplete', 'new-password'); // trompe Chrome
  input.setAttribute('name', 'tt-search-' + Date.now()); // nom unique → pas d'historique

  /* Vider immédiatement si le navigateur a déjà injecté un email */
  function clearIfEmail() {
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.value)) {
      input.value = '';
      document.getElementById('search-clear').style.display = 'none';
    }
  }

  clearIfEmail();                          // au chargement
  setTimeout(clearIfEmail, 100);           // après le délai d'autofill Chrome
  setTimeout(clearIfEmail, 500);           // sécurité supplémentaire

  /* Cacher aussi le placeholder email si l'autofill revient au focus */
  input.addEventListener('focus', clearIfEmail);
})();

/* ── 3. Swipe gauche/droite sur la player bar → changer de piste ── */
(function addSwipeToPlayer() {
  const bar = document.querySelector('.player-bar');
  if (!bar) return;

  let startX = 0, startY = 0;

  bar.addEventListener('touchstart', e => {
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
  }, { passive: true });

  bar.addEventListener('touchend', e => {
    const dx = e.changedTouches[0].clientX - startX;
    const dy = e.changedTouches[0].clientY - startY;
    if (Math.abs(dx) < 50 || Math.abs(dy) > Math.abs(dx) * 0.6) return;
    if (dx < 0 && typeof nextTrack === 'function') nextTrack();
    if (dx > 0 && typeof prevTrack === 'function') prevTrack();
  }, { passive: true });
})();
