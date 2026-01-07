// GGHOST_PART_MARKER: gghost.part-6.js
window.__GGHOST_PARTS_LOADED__ = window.__GGHOST_PARTS_LOADED__ || [];
window.__GGHOST_PARTS_LOADED__.push('gghost.part-6.js');
console.log('[gghost] loaded gghost.part-6.js');
(async function () {
  await waitForGghostIdle();
  // Function to check if current URL is a street-view page and trigger modal
  const checkAndShowStreetView = (url) => {
    // Strict URL matching - must end exactly with /questions/street-view or /questions/street-view/
    const streetViewPattern = /\/team\/location\/([a-f0-9-]+)\/questions\/street-view\/?$/;
    const match = url.match(streetViewPattern);
    if (match && match[1]) {
      const uuid = match[1];
      console.log('[gghost] Triggering Street View for UUID:', uuid, 'from URL:', url);
      try {
        if (chrome && chrome.runtime && chrome.runtime.sendMessage) {
          chrome.runtime.sendMessage({ type: 'showStreetView', uuid }, () => {
            let lastError = null;
            try {
              lastError = chrome?.runtime?.lastError;
            } catch (err) {
              console.warn('[gghost] Street View message error:', err);
              return;
            }
            if (lastError) {
              console.warn('[gghost] Street View message error:', lastError.message);
              // Retry once after a short delay
              setTimeout(() => {
                try {
                  if (chrome?.runtime?.sendMessage) {
                    chrome.runtime.sendMessage({ type: 'showStreetView', uuid });
                  }
                } catch (retryError) {
                  console.error('[gghost] Street View retry failed:', retryError);
                }
              }, 1000);
            } else {
              console.log('[gghost] Street View message sent successfully');
            }
          });
        } else {
          console.warn('Extension context invalidated, cannot send message');
        }
      } catch (error) {
        console.warn('Extension context error:', error.message);
      }
    } else {
      // Only log if the URL contains street-view but doesn't match (for debugging)
      if (url.includes('street-view')) {
        console.log('[gghost] URL contains street-view but doesn\'t match pattern:', url);
      }
    }
  };
  // Check current URL immediately on load
  try {
    checkAndShowStreetView(location.href);
  } catch (error) {
    if (error.message && error.message.includes('Extension context invalidated')) {
      console.warn('[gghost] Extension context invalidated on initial load');
      return;
    }
    console.error('[gghost] Initial street view check error:', error);
  }
  // Also check on URL changes
  onUrlChange((newUrl) => {
    checkAndShowStreetView(newUrl);
  });
  // --- GoGetta custom back/redirect logic ---
  function getGoGettaLocationUuid() {
    const path = location.pathname;
    const match = path.match(/\/team\/location\/([a-f0-9\-]{12,36})/);
    return match ? match[1] : null;
  }
  function isGoGettaLocationPage() {
    return /^\/team\/location\/[a-f0-9\-]{12,36}$/.test(location.pathname);
  }
  function isGoGettaClosureInfoPage() {
    return /^\/team\/location\/[a-f0-9\-]{12,36}\/closureinfo$/.test(location.pathname);
  }
  function isGoGettaIsClosedPage() {
    return /^\/team\/location\/[a-f0-9\-]{12,36}\/isClosed$/.test(location.pathname);
  }
  function getClosureInfoUrl(uuid) {
    return `https://gogetta.nyc/team/location/${uuid}/closureinfo`;
  }
  function getLocationUrl(uuid) {
    return `https://gogetta.nyc/team/location/${uuid}`;
  }
  await initializeGoGettaEnhancements();
  setTimeout(() => {
    if (!hasGghostNotesUi()) {
      injectGoGettaButtons();
    }
  }, 4000);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    if (!document.body || document.body.dataset.gghostRendered !== 'true' || !hasGghostNotesUi()) {
      injectGoGettaButtons();
    }
  }
});
  chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
    if (request.type === "userNameUpdated") {
      console.log("[gghost.js] Received userNameUpdated message:", request.userName);
      const existingOverlay = document.getElementById("gg-note-overlay");
      if (existingOverlay) {
        existingOverlay.remove();
      }
      window.gghostUserName = request.userName; 
      injectGoGettaButtons(); 
      sendResponse({ status: "Username received by content script" });
    }
    if (request.type === "GET_COGNITO_TOKENS") {
      console.log("[gghost.js] Popup requested Cognito tokens");
      const tokens = getCognitoTokens();
      console.log("[gghost.js] Sending tokens to popup:", { 
        hasAccessToken: !!tokens.accessToken, 
        hasIdToken: !!tokens.idToken, 
        hasRefreshToken: !!tokens.refreshToken,
        username: tokens.username 
      });
      sendResponse(tokens);
    }
    if (request.type === "passwordUpdated") {
      const existingOverlay = document.getElementById("gg-note-overlay");
      if (existingOverlay) {
        existingOverlay.remove();
      }
      window.gghostPassword = request.userPassword; 
      injectGoGettaButtons(); 
      sendResponse({ status: "Pass received by content script" });
    }
    return true;
  });
  // Title case formatting for Input-fluid fields
  // Track manual lowercase positions per input
  const manualLowercasePositions = new WeakMap();
  const previousValues = new WeakMap();
  const inputListeners = new WeakMap(); // Track listeners for cleanup
  // Check if current URL should have capitalization enabled
  function shouldEnableCapitalization() {
    const path = window.location.pathname;
    // Specific paths where capitalization should be enabled
    const capitalizePatterns = [
      /\/questions\/organization-name$/,
      /\/questions\/location-name$/,
      /\/questions\/location-address$/,
      /\/services\/[a-f0-9-]+\/name$/
    ];
    return capitalizePatterns.some(pattern => pattern.test(path));
  }
  function toTitleCase(str, respectManualLowercase = false, input = null) {
    if (!str) return str;
    // Words that should not be capitalized (articles, short prepositions)
    const minorWords = new Set([
      'a', 'an', 'and', 'as', 'at', 'but', 'by', 'for', 'in', 'nor',
      'of', 'on', 'or', 'so', 'the', 'to', 'up', 'yet', 'via'
    ]);
    // Split on spaces and other delimiters while preserving them
    const parts = str.split(/(\s+|\(|\)|\/|-)/);
    const manualPositions = respectManualLowercase && input ? (manualLowercasePositions.get(input) || new Set()) : new Set();
    let currentPos = 0;
    return parts.map((word, index) => {
      const wordStartPos = currentPos;
      currentPos += word.length;
      // Don't modify delimiters
      if (/^(\s+|\(|\)|\/|-)$/.test(word)) return word;
      // Don't modify words that are all uppercase (like acronyms - 2+ consecutive caps)
      if (word.length > 1 && word === word.toUpperCase() && /[A-Z]{2,}/.test(word)) {
        return word;
      }
      // Check if first character was manually lowercased
      if (respectManualLowercase && manualPositions.has(wordStartPos)) {
        return word;
      }
      const lowerWord = word.toLowerCase();
      // Always capitalize first and last word
      if (index === 0 || index === parts.length - 1) {
        return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
      }
      // Check if it's a minor word
      if (minorWords.has(lowerWord)) {
        return lowerWord;
      }
      // Capitalize the word
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    }).join('');
  }
  // Apply title case formatting to Input-fluid fields
  function setupTitleCaseFormatting() {
    let observer = null;
    let okButtonListener = null;
    // Helper to attach listeners to an input
    function attachListeners(input) {
      if (input.dataset.titleCaseEnabled) return;
      // Only attach if we're on the right URL
      if (!shouldEnableCapitalization()) return;
      input.dataset.titleCaseEnabled = 'true';
      // Initialize tracking
      if (!manualLowercasePositions.has(input)) {
        manualLowercasePositions.set(input, new Set());
      }
      if (!previousValues.has(input)) {
        previousValues.set(input, input.value);
      }
      // Live formatting on input
      const inputHandler = function(e) {
        const currentValue = this.value;
        const prevValue = previousValues.get(this) || '';
        const cursorPos = this.selectionStart;
        // Check if user manually changed a capital letter to lowercase
        if (prevValue.length > 0 && currentValue.length === prevValue.length) {
          for (let i = 0; i < currentValue.length; i++) {
            if (prevValue[i] !== currentValue[i]) {
              // User changed a character
              if (prevValue[i] === prevValue[i].toUpperCase() &&
                  currentValue[i] === prevValue[i].toLowerCase() &&
                  /[a-zA-Z]/.test(currentValue[i])) {
                // User manually lowercased a capital letter - remember this position
                const manualPositions = manualLowercasePositions.get(this);
                manualPositions.add(i);
                manualLowercasePositions.set(this, manualPositions);
              }
            }
          }
        }
        // Live capitalize if word just completed (followed by space/delimiter)
        if (currentValue.length > prevValue.length) {
          const lastChar = currentValue[currentValue.length - 1];
          // Check if we just typed a delimiter (space, parenthesis, slash, dash)
          if (/[\s()\/-]/.test(lastChar)) {
            const formatted = toTitleCase(currentValue, true, this);
            if (currentValue !== formatted) {
              this.value = formatted;
              this.setSelectionRange(cursorPos, cursorPos);
            }
          }
        }
        // Update previous value
        previousValues.set(this, this.value);
      };
      // Format on blur (when user leaves the field)
      const blurHandler = function() {
        if (this.value) {
          const cursorPosition = this.selectionStart;
          const formatted = toTitleCase(this.value, false, null); // Full format on blur, ignore manual positions
          if (this.value !== formatted) {
            this.value = formatted;
            // Clear manual lowercase positions on blur since we're doing a full format
            manualLowercasePositions.set(this, new Set());
            // Trigger input event to notify any listeners
            this.dispatchEvent(new Event('input', { bubbles: true }));
            this.dispatchEvent(new Event('change', { bubbles: true }));
          }
        }
      };
      input.addEventListener('input', inputHandler);
      input.addEventListener('blur', blurHandler);
      // Store listeners for cleanup
      inputListeners.set(input, { inputHandler, blurHandler });
    }
    // Helper to detach listeners from an input
    function detachListeners(input) {
      if (!input.dataset.titleCaseEnabled) return;
      const listeners = inputListeners.get(input);
      if (listeners) {
        input.removeEventListener('input', listeners.inputHandler);
        input.removeEventListener('blur', listeners.blurHandler);
        inputListeners.delete(input);
      }
      delete input.dataset.titleCaseEnabled;
      manualLowercasePositions.delete(input);
      previousValues.delete(input);
    }
    // Process all inputs based on current URL
    function processInputs() {
      const inputs = document.querySelectorAll('input.Input-fluid');
      if (shouldEnableCapitalization()) {
        inputs.forEach(attachListeners);
      } else {
        inputs.forEach(detachListeners);
      }
    }
    // Start mutation observer
    function startObserver() {
      if (observer) return;
      observer = new MutationObserver(() => {
        if (shouldEnableCapitalization()) {
          const inputs = document.querySelectorAll('input.Input-fluid');
          inputs.forEach(attachListeners);
        }
      });
      observer.observe(document.body, {
        childList: true,
        subtree: true
      });
    }
    // Stop mutation observer
    function stopObserver() {
      if (observer) {
        observer.disconnect();
        observer = null;
      }
    }
    // Setup OK button listener
    function setupOkButtonListener() {
      if (okButtonListener) return;
      okButtonListener = function(e) {
        const target = e.target;
        // Check if it's an OK button and we're on the right URL
        if (shouldEnableCapitalization() &&
            target.tagName === 'BUTTON' &&
            target.classList.contains('Button-primary') &&
            target.textContent.trim() === 'OK') {
          // Format all Input-fluid fields before the click proceeds
          const allInputs = document.querySelectorAll('input.Input-fluid');
          allInputs.forEach(input => {
            if (input.value && input.dataset.titleCaseEnabled) {
              const formatted = toTitleCase(input.value, false, null);
              if (input.value !== formatted) {
                input.value = formatted;
                input.dispatchEvent(new Event('input', { bubbles: true }));
                input.dispatchEvent(new Event('change', { bubbles: true }));
              }
            }
          });
        }
      };
      document.addEventListener('click', okButtonListener, true);
    }
    // Initialize based on current URL
    processInputs();
    startObserver();
    setupOkButtonListener();
    // Listen for history changes (SPA navigation)
    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;
    history.pushState = function() {
      originalPushState.apply(this, arguments);
      setTimeout(processInputs, 0);
    };
    history.replaceState = function() {
      originalReplaceState.apply(this, arguments);
      setTimeout(processInputs, 0);
    };
    window.addEventListener('popstate', () => {
      setTimeout(processInputs, 0);
    });
  }
  // Initialize title case formatting
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupTitleCaseFormatting);
  } else {
    setupTitleCaseFormatting();
  }
})();
