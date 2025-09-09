(() => {
  let bannerShown = false;
  let callClicked = false;
  let callButtonMutationObserver = null;
  let bannerRemovalPromise = Promise.resolve(); // Default to resolved

  const TARGET_PAGE_IDENTIFIER = 'https://voice.google.com/u/0/calls?a=nc,%2B1';
  const BUTTON_SELECTOR = 'button[gv-test-id="dialog-confirm-button"]';

  function showLoadingBanner() {
    if (bannerShown) {
      return bannerRemovalPromise; // Return existing promise if banner process already initiated
    }
    bannerShown = true; // Set flag: banner process is starting

    bannerRemovalPromise = new Promise((resolve) => {
      const bannerDisplayTime = 2000; // ms
      const bannerFadeTime = 500;   // ms

      const banner = document.createElement('div');
      banner.id = 'doobneek-loading-banner';
      banner.textContent = 'doobneek is loading';
      Object.assign(banner.style, {
        position: 'fixed',
        top: '0',
        left: '0',
        width: '100%',
        height: '100%',
        backgroundColor: '#4CAF50',
        color: '#fff',
        fontSize: '2rem',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: '9999', // Ensure zIndex is a string if assigning via Object.assign to style
        opacity: '1',
        transition: `opacity ${bannerFadeTime / 1000}s ease-in-out`,
      });
      document.body.appendChild(banner);
      console.log('[ℹ️] Banner shown.');

      setTimeout(() => {
        banner.style.opacity = '0';
        setTimeout(() => {
          if (banner.parentElement) {
            banner.remove();
          }
          console.log('[ℹ️] Banner removed.');
          resolve(); // Resolve the promise when banner is gone.
        }, bannerFadeTime);
      }, bannerDisplayTime);
    });
    return bannerRemovalPromise;
  }

  function disconnectCallButtonObserver() {
    if (callButtonMutationObserver) {
      callButtonMutationObserver.disconnect();
      callButtonMutationObserver = null;
      console.log('[ℹ️] Disconnected call button observer.');
    }
  }

  function observeForCallButton() {
    if (callClicked) { // If call already processed or being processed
        console.log('[ℹ️] Call button action already initiated or completed. Observer not started.');
        return;
    }
    
    disconnectCallButtonObserver(); // Ensure any old observer is gone

    console.log(`[ℹ️] Starting observer for button: ${BUTTON_SELECTOR}`);
    callButtonMutationObserver = new MutationObserver((mutations, observer) => {
      if (!location.href.includes(TARGET_PAGE_IDENTIFIER)) {
        console.log('[ℹ️] No longer on voice call page (checked in observer). Disconnecting call button observer.');
        disconnectCallButtonObserver(); // Self-disconnect if page context changes
        return;
      }

      if (callClicked) { // Double check flag, in case of rapid mutations
        // console.log('[ℹ️] Call already clicked (checked in observer). Disconnecting.'); // Can be noisy
        disconnectCallButtonObserver(); 
        return;
      }

      const button = document.querySelector(BUTTON_SELECTOR);
      if (button) {
        callClicked = true; // Set flag: we found it and will attempt to click.
        console.log('[✅] Found Call button. Waiting for banner removal if necessary, then clicking.');
        
        // Ensure observer doesn't fire again for this found button
        disconnectCallButtonObserver(); 

        bannerRemovalPromise.then(() => {
          console.log('[ℹ️] Banner removal promise resolved. Proceeding to click.');
          setTimeout(() => { // Grace period after banner removal
            if (document.body.contains(button) && !button.disabled) {
              console.log(`[Attempting click on button: ${BUTTON_SELECTOR}]`);
              button.click();
              console.log('[✅] Clicked the Call button.');
            } else {
              console.log(`[❌] Button (${BUTTON_SELECTOR}) no longer valid or available for click.`);
              // Optionally reset callClicked = false; here if a retry is desired, but can lead to loops.
              // For now, assume failure means this attempt is over.
            }
            // No need to disconnect observer here, already done after finding button.
          }, 100); // 100ms grace period
        }).catch(err => {
            console.error("[❌] Error waiting for banner removal promise:", err);
            // callClicked might need to be reset if we want to allow retries on error.
            // For now, the observer is already disconnected.
        });
      }
    });

    callButtonMutationObserver.observe(document.body, { childList: true, subtree: true });
    console.log('[ℹ️] Call button observer watching document.body.');
  }

  function runOnVoiceCallPage() {
    const isVoiceCallPage = location.href.includes(TARGET_PAGE_IDENTIFIER);
    
    if (!isVoiceCallPage) {
      if (bannerShown || callClicked || callButtonMutationObserver) {
          // Only log reset if there was something to reset
          console.log(`[ℹ️] Not on target page (${TARGET_PAGE_IDENTIFIER}). Resetting state.`);
      }
      bannerShown = false; 
      callClicked = false; 
      disconnectCallButtonObserver();
      bannerRemovalPromise = Promise.resolve(); 
      return;
    }

    console.log(`[ℹ️] On target page (${TARGET_PAGE_IDENTIFIER}). Initializing script logic.`);
    showLoadingBanner(); 
    observeForCallButton();
  }

  // Handle initial page load
  console.log('[ℹ️] Script starting. Initial check for voice call page.');
  runOnVoiceCallPage();

  // Also handle SPA navigation
  let lastUrl = location.href;
  new MutationObserver(() => {
    const currentUrl = location.href;
    if (currentUrl !== lastUrl) {
      console.log(`[ℹ️] URL changed detected. From: ${lastUrl} To: ${currentUrl}`);
      lastUrl = currentUrl;
      runOnVoiceCallPage(); // Re-evaluate state based on new URL
    }
  }).observe(document.body, { childList: true, subtree: true }); // Broad observer for URL change detection

  console.log('[ℹ️] Script initialized. Waiting for page changes or button.');
})();
