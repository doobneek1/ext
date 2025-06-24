(() => {
  function showLoadingBanner() {
    const banner = document.createElement('div');
    banner.textContent = 'doobneek is loading';
    Object.assign(banner.style, {
      position: 'fixed',
      top: 0,
      left: 0,
      width: '100%',
      height: '100%',
      backgroundColor: '#000',
      color: '#fff',
      fontSize: '2rem',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 9999,
      opacity: 0,
      transition: 'opacity 0.5s ease-in-out',
    });
    document.body.appendChild(banner);
    requestAnimationFrame(() => {
      banner.style.opacity = 1;
    });

    setTimeout(() => {
      banner.style.opacity = 0;
      setTimeout(() => banner.remove(), 1000);
    }, 2000);
  }

  function clickCallButton() {
    const button = document.querySelector('button[gv-test-id="dialog-confirm-button"]');
    if (button) {
      button.click();
      console.log('[✅] Clicked the Call button.');
    } else {
      console.warn('[❌] Call button not found, retrying...');
      setTimeout(clickCallButton, 500); // Retry if not ready yet
    }
  }

  function runIfVoiceCallPage() {
    const isVoiceCallPage = location.href.includes('https://voice.google.com/u/0/calls?a=nc,%2B1');
    if (!isVoiceCallPage) return;

    showLoadingBanner();

    // Wait until banner fades, then try to click the button
    setTimeout(() => {
      clickCallButton();
    }, 2200);
  }

  window.addEventListener('load', () => {
    setTimeout(runIfVoiceCallPage, 100);
  });
})();
