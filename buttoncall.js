(() => {
  let bannerShown = false;
  let callClicked = false;
  let callButtonMutationObserver = null;
  let bannerRemovalPromise = Promise.resolve(); // Default to resolved
  let callTargetUrl = '';
  let callSessionStartedAt = 0;
  let retryTimerId = null;

  const CALL_PARAM_PREFIX = 'nc,';
  const CALL_SESSION_TTL_MS = 20000;
  const RETRY_DELAY_MS = 900;
  const MAX_RETRY_ATTEMPTS = 2;
  const STORAGE_KEY_CALL_URL = 'doobneek:gvCallUrl';
  const STORAGE_KEY_CALL_TS = 'doobneek:gvCallTs';
  const STORAGE_KEY_CALL_RETRY = 'doobneek:gvCallRetry';
  const STORAGE_KEY_CALL_CLICKED = 'doobneek:gvCallClicked';
  const DIALOG_BUTTON_SELECTOR = 'button[gv-test-id="dialog-confirm-button"]';
  const NEW_CALL_ROW_SELECTOR = 'div.input-row';
  const NEW_CALL_INPUT_SELECTOR = 'div.input-row input[placeholder="Enter a name or number"], div.input-row input.input';
  const NEW_CALL_BUTTON_SELECTOR = 'button[gv-test-id="new-call-button"]';
  const NEW_CALL_TOUCH_TARGET_CLASS = '.mat-mdc-button-touch-target';
  const NEW_CALL_CLICK_RETRY_MS = 150;
  const NEW_CALL_CLICK_MAX_ATTEMPTS = 8;

  function getCallParam(url) {
    try {
      const parsed = new URL(url);
      const raw = parsed.searchParams.get('a');
      if (!raw) return null;
      const decoded = decodeURIComponent(raw);
      if (!decoded.toLowerCase().startsWith(CALL_PARAM_PREFIX)) return null;
      return decoded;
    } catch (err) {
      return null;
    }
  }

  function getNavigationStartUrl() {
    try {
      const entries = performance.getEntriesByType('navigation');
      return entries && entries[0] ? entries[0].name : '';
    } catch (err) {
      return '';
    }
  }

  function isCallTargetUrl(url) {
    return Boolean(getCallParam(url));
  }

  function getDialTargetFromUrl(url) {
    const callParam = getCallParam(url);
    if (!callParam) return null;
    const rawTarget = callParam.slice(CALL_PARAM_PREFIX.length).trim();
    return rawTarget || null;
  }

  function storeCallSession(url) {
    const previousUrl = sessionStorage.getItem(STORAGE_KEY_CALL_URL);
    const isNewCall = previousUrl !== url;

    callTargetUrl = url;
    callSessionStartedAt = Date.now();
    sessionStorage.setItem(STORAGE_KEY_CALL_URL, url);
    sessionStorage.setItem(STORAGE_KEY_CALL_TS, String(callSessionStartedAt));

    if (isNewCall) {
      sessionStorage.setItem(STORAGE_KEY_CALL_RETRY, '0');
      sessionStorage.setItem(STORAGE_KEY_CALL_CLICKED, '0');
      callClicked = false;
    } else {
      callClicked = sessionStorage.getItem(STORAGE_KEY_CALL_CLICKED) === '1';
    }
  }

  function restoreCallSession() {
    const storedUrl = sessionStorage.getItem(STORAGE_KEY_CALL_URL);
    const storedTs = Number(sessionStorage.getItem(STORAGE_KEY_CALL_TS) || 0);
    if (!storedUrl || !storedTs) {
      const navUrl = getNavigationStartUrl();
      if (isCallTargetUrl(navUrl)) {
        storeCallSession(navUrl);
        return true;
      }
      return false;
    }
    if (Date.now() - storedTs > CALL_SESSION_TTL_MS) {
      clearCallSession();
      const navUrl = getNavigationStartUrl();
      if (isCallTargetUrl(navUrl)) {
        storeCallSession(navUrl);
        return true;
      }
      return false;
    }
    callTargetUrl = storedUrl;
    callSessionStartedAt = storedTs;
    callClicked = sessionStorage.getItem(STORAGE_KEY_CALL_CLICKED) === '1';
    return true;
  }

  function clearCallSession() {
    callTargetUrl = '';
    callSessionStartedAt = 0;
    sessionStorage.removeItem(STORAGE_KEY_CALL_URL);
    sessionStorage.removeItem(STORAGE_KEY_CALL_TS);
    sessionStorage.removeItem(STORAGE_KEY_CALL_RETRY);
    sessionStorage.removeItem(STORAGE_KEY_CALL_CLICKED);
    if (retryTimerId) {
      clearTimeout(retryTimerId);
      retryTimerId = null;
    }
  }

  function isCallSessionActive() {
    return Boolean(
      callTargetUrl &&
      callSessionStartedAt &&
      Date.now() - callSessionStartedAt <= CALL_SESSION_TTL_MS
    );
  }

  function markCallClicked() {
    callClicked = true;
    sessionStorage.setItem(STORAGE_KEY_CALL_CLICKED, '1');
  }

  function scheduleRetryIfNeeded(reason) {
    if (!isCallSessionActive() || callClicked || !callTargetUrl) {
      return;
    }
    if (location.href === callTargetUrl) {
      return;
    }
    const retryCount = Number(sessionStorage.getItem(STORAGE_KEY_CALL_RETRY) || 0);
    if (retryCount >= MAX_RETRY_ATTEMPTS) {
      return;
    }
    if (retryTimerId) {
      return;
    }
    retryTimerId = setTimeout(() => {
      retryTimerId = null;
      const currentRetryCount = Number(sessionStorage.getItem(STORAGE_KEY_CALL_RETRY) || 0);
      if (currentRetryCount >= MAX_RETRY_ATTEMPTS) {
        return;
      }
      sessionStorage.setItem(STORAGE_KEY_CALL_RETRY, String(currentRetryCount + 1));
      console.log(`[voice-call] Retrying call deep-link (${currentRetryCount + 1}/${MAX_RETRY_ATTEMPTS})${reason ? `: ${reason}` : ''}.`);
      location.href = callTargetUrl;
    }, RETRY_DELAY_MS);
  }

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

  function setInputValue(input, value) {
    const descriptor = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), 'value');
    if (descriptor && descriptor.set) {
      descriptor.set.call(input, value);
    } else {
      input.value = value;
    }
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function isButtonDisabled(button) {
    return button.disabled || button.getAttribute('aria-disabled') === 'true';
  }

  function clickNewCallButtonWhenReady(button, attempt) {
    if (!document.body.contains(button)) {
      console.log('[voice-call] New call button removed before click.');
      return;
    }

    if (!isButtonDisabled(button)) {
      const touchTarget = button.querySelector(NEW_CALL_TOUCH_TARGET_CLASS) || button;
      touchTarget.click();
      console.log('[voice-call] Clicked the new call button.');
      return;
    }

    if (attempt >= NEW_CALL_CLICK_MAX_ATTEMPTS) {
      console.log('[voice-call] New call button remained disabled. Giving up.');
      return;
    }

    setTimeout(() => {
      clickNewCallButtonWhenReady(button, attempt + 1);
    }, NEW_CALL_CLICK_RETRY_MS);
  }

  function disconnectCallButtonObserver() {
    if (callButtonMutationObserver) {
      callButtonMutationObserver.disconnect();
      callButtonMutationObserver = null;
      console.log('[ℹ️] Disconnected call button observer.');
    }
  }

  function attemptNewCallFlow() {
    const inputRow = document.querySelector(NEW_CALL_ROW_SELECTOR);
    if (!inputRow) return false;

    const input = inputRow.querySelector('input') || document.querySelector(NEW_CALL_INPUT_SELECTOR);
    const button = inputRow.querySelector(NEW_CALL_BUTTON_SELECTOR) || document.querySelector(NEW_CALL_BUTTON_SELECTOR);

    if (!input || !button) return false;

    const dialTarget = getDialTargetFromUrl(callTargetUrl || location.href);
    if (!dialTarget) {
      console.log('[voice-call] No dial target found in deep-link.');
      return false;
    }

    markCallClicked();
    disconnectCallButtonObserver();

    console.log('[voice-call] Found new call input. Injecting number and clicking.');
    bannerRemovalPromise.then(() => {
      input.focus();
      setInputValue(input, dialTarget);
      clickNewCallButtonWhenReady(button, 0);
    }).catch(err => {
      console.error('[voice-call] Error while preparing new call click:', err);
    });

    return true;
  }

  function observeForCallButton() {
    if (callClicked) { // If call already processed or being processed
        console.log('[voice-call] Call button action already initiated or completed. Observer not started.');
        return;
    }

    disconnectCallButtonObserver(); // Ensure any old observer is gone

    if (attemptNewCallFlow()) {
      return;
    }

    console.log(`[voice-call] Starting observer for buttons: ${NEW_CALL_BUTTON_SELECTOR} or ${DIALOG_BUTTON_SELECTOR}`);
    callButtonMutationObserver = new MutationObserver((mutations, observer) => {
      if (!isCallSessionActive()) {
        console.log('[voice-call] Call session expired or missing. Disconnecting call button observer.');
        disconnectCallButtonObserver(); // Self-disconnect if call session expired
        return;
      }

      if (callClicked) { // Double check flag, in case of rapid mutations
        // console.log('[voice-call] Call already clicked (checked in observer). Disconnecting.'); // Can be noisy
        disconnectCallButtonObserver();
        return;
      }

      if (attemptNewCallFlow()) {
        return;
      }

      const button = document.querySelector(DIALOG_BUTTON_SELECTOR);
      if (button) {
        markCallClicked(); // Set flag: we found it and will attempt to click.
        console.log('[voice-call] Found Call button. Waiting for banner removal if necessary, then clicking.');

        // Ensure observer doesn't fire again for this found button
        disconnectCallButtonObserver();

        bannerRemovalPromise.then(() => {
          console.log('[voice-call] Banner removal promise resolved. Proceeding to click.');
          setTimeout(() => { // Grace period after banner removal
            if (document.body.contains(button) && !button.disabled) {
              console.log(`[voice-call] Attempting click on button: ${DIALOG_BUTTON_SELECTOR}`);
              button.click();
              console.log('[voice-call] Clicked the Call button.');
            } else {
              console.log(`[voice-call] Button (${DIALOG_BUTTON_SELECTOR}) no longer valid or available for click.`);
              // Optionally reset callClicked = false; here if a retry is desired, but can lead to loops.
              // For now, assume failure means this attempt is over.
            }
            // No need to disconnect observer here, already done after finding button.
          }, 100); // 100ms grace period
        }).catch(err => {
            console.error('[voice-call] Error waiting for banner removal promise:', err);
            // callClicked might need to be reset if we want to allow retries on error.
            // For now, the observer is already disconnected.
        });
      }
    });

    callButtonMutationObserver.observe(document.body, { childList: true, subtree: true });
    console.log('[voice-call] Call button observer watching document.body.');
  }

  function runOnVoiceCallPage() {
    const isVoiceCallPage = isCallTargetUrl(location.href);

    if (isVoiceCallPage) {
      storeCallSession(location.href);
      console.log('[voice-call] On call deep-link. Initializing script logic.');
      if (!callClicked) {
        showLoadingBanner();
        observeForCallButton();
      }
      return;
    }

    const hasActiveSession = isCallSessionActive() || restoreCallSession();
    if (hasActiveSession) {
      console.log('[voice-call] Call deep-link was recently seen. Continuing call attempt.');
      if (!callClicked) {
        showLoadingBanner();
        observeForCallButton();
        scheduleRetryIfNeeded('url-bounce');
      }
      return;
    }

    if (bannerShown || callClicked || callButtonMutationObserver) {
      // Only log reset if there was something to reset
      console.log('[voice-call] Not on call deep-link. Resetting state.');
    }
    bannerShown = false;
    callClicked = false;
    disconnectCallButtonObserver();
    bannerRemovalPromise = Promise.resolve();
    clearCallSession();
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
