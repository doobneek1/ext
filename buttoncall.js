(() => {
  let bannerShown = false;
  let callClicked = false;

  function showLoadingBanner() {
    if (bannerShown) return;
    bannerShown = true;

    const banner = document.createElement('div');
    banner.textContent = 'doobneek is loading';
    Object.assign(banner.style, {
      position: 'fixed',
      top: 0,
      left: 0,
      width: '100%',
      height: '100%',
      backgroundColor: '#4CAF50',
      color: '#fff',
      fontSize: '2rem',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 9999,
      opacity: 1,
      transition: 'opacity 0.5s ease-in-out',
    });

    document.body.appendChild(banner);

    setTimeout(() => {
      banner.style.opacity = 0;
      setTimeout(() => banner.remove(), 1000);
    }, 2000);
  }

  function observeForCallButton() {
    const observer = new MutationObserver(() => {
      if (callClicked) return;

      const button = document.querySelector('button[gv-test-id="dialog-confirm-button"]');
      if (button) {
        callClicked = true;
        console.log('[✅] Found Call button, clicking after banner...');
        setTimeout(() => {
          button.click();
          console.log('[✅] Clicked the Call button.');
          observer.disconnect();
        }, 2200);
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });
  }

  function runOnVoiceCallPage() {
    const isVoiceCallPage = location.href.includes('https://voice.google.com/u/0/calls?a=nc,%2B1');
    if (!isVoiceCallPage) return;

    showLoadingBanner();
    observeForCallButton();
  }

  // Handle initial page load
  runOnVoiceCallPage();

  // Also handle SPA navigation
  let lastUrl = location.href;
  new MutationObserver(() => {
    const currentUrl = location.href;
    if (currentUrl !== lastUrl) {
      lastUrl = currentUrl;
      runOnVoiceCallPage();
    }
  }).observe(document.body, { childList: true, subtree: true });
})();
