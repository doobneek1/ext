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
      
      setTimeout(() => {
        banner.style.opacity = '0';
        setTimeout(() => {
          if (banner.parentElement) {
            banner.remove();
          }
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
          }
  }

  function observeForCallButton() {
    if (callClicked) { // If call already processed or being processed
                return;
    }
    
    disconnectCallButtonObserver(); // Ensure any old observer is gone

        callButtonMutationObserver = new MutationObserver((mutations, observer) => {
      if (!location.href.includes(TARGET_PAGE_IDENTIFIER)) {
                disconnectCallButtonObserver(); // Self-disconnect if page context changes
        return;
      }

      if (callClicked) { // Double check flag, in case of rapid mutations
        disconnectCallButtonObserver(); 
        return;
      }

      const button = document.querySelector(BUTTON_SELECTOR);
      if (button) {
        callClicked = true; // Set flag: we found it and will attempt to click.
                
        // Ensure observer doesn't fire again for this found button
        disconnectCallButtonObserver(); 

        bannerRemovalPromise.then(() => {
                    setTimeout(() => { // Grace period after banner removal
            if (document.body.contains(button) && !button.disabled) {
                            button.click();
                          } else {
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
      }

  function runOnVoiceCallPage() {
    const isVoiceCallPage = location.href.includes(TARGET_PAGE_IDENTIFIER);
    
    if (!isVoiceCallPage) {
      if (bannerShown || callClicked || callButtonMutationObserver) {
          // Only log reset if there was something to reset
                }
      bannerShown = false; 
      callClicked = false; 
      disconnectCallButtonObserver();
      bannerRemovalPromise = Promise.resolve(); 
      return;
    }

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
      runOnVoiceCallPage(); // Re-evaluate state based on new URL
    }
  }).observe(document.body, { childList: true, subtree: true }); // Broad observer for URL change detection

  })();
