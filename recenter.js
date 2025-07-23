(function () {
  const BUTTON_ID = 'yp-recenter-btn';
  if (document.getElementById(BUTTON_ID)) return;

  const lat = 40.7128;
  const lng = -74.0060;

  const button = document.createElement('button');
  button.id = BUTTON_ID;
  button.textContent = 'Recenter to NYC';
  Object.assign(button.style, {
    position: 'fixed',
    bottom: '20px',
    right: '20px',
    zIndex: 9999,
    padding: '10px 14px',
    backgroundColor: '#0066cc',
    color: '#fff',
    border: 'none',
    borderRadius: '5px',
    cursor: 'pointer',
    boxShadow: '0 2px 6px rgba(0,0,0,0.3)'
  });

  button.addEventListener('click', () => {
    console.log('[YP] 🧭 Recenter override triggered');

    try {
      // Replace this with the actual override function if different
      if (typeof sensors !== 'undefined' && typeof sensors.override === 'function') {
        sensors.override({ latitude: lat, longitude: lng });
        console.log('[YP] ✅ sensors.override called');
      } else {
        console.warn('[YP] ⚠️ sensors.override not available');
      }

      // Force a refresh after override (slight delay to allow override to register)
      setTimeout(() => {
        location.reload();
      }, 300);
    } catch (err) {
      console.error('[YP] ❌ Error recentering:', err);
    }
  });

  document.body.appendChild(button);
})();
