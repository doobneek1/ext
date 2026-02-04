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
    const LOCATION_API_BASE = 'https://w6pkliozjh.execute-api.us-east-1.amazonaws.com/prod/locations';
    const LOCATION_ADDRESS_PATTERN = /\/questions\/location-address\/?$/;
    const US_STATES = [
      { name: 'Alabama', abbr: 'AL' },
      { name: 'Alaska', abbr: 'AK' },
      { name: 'Arizona', abbr: 'AZ' },
      { name: 'Arkansas', abbr: 'AR' },
      { name: 'California', abbr: 'CA' },
      { name: 'Colorado', abbr: 'CO' },
      { name: 'Connecticut', abbr: 'CT' },
      { name: 'Delaware', abbr: 'DE' },
      { name: 'Florida', abbr: 'FL' },
      { name: 'Georgia', abbr: 'GA' },
      { name: 'Hawaii', abbr: 'HI' },
      { name: 'Idaho', abbr: 'ID' },
      { name: 'Illinois', abbr: 'IL' },
      { name: 'Indiana', abbr: 'IN' },
      { name: 'Iowa', abbr: 'IA' },
      { name: 'Kansas', abbr: 'KS' },
      { name: 'Kentucky', abbr: 'KY' },
      { name: 'Louisiana', abbr: 'LA' },
      { name: 'Maine', abbr: 'ME' },
      { name: 'Maryland', abbr: 'MD' },
      { name: 'Massachusetts', abbr: 'MA' },
      { name: 'Michigan', abbr: 'MI' },
      { name: 'Minnesota', abbr: 'MN' },
      { name: 'Mississippi', abbr: 'MS' },
      { name: 'Missouri', abbr: 'MO' },
      { name: 'Montana', abbr: 'MT' },
      { name: 'Nebraska', abbr: 'NE' },
      { name: 'Nevada', abbr: 'NV' },
      { name: 'New Hampshire', abbr: 'NH' },
      { name: 'New Jersey', abbr: 'NJ' },
      { name: 'New Mexico', abbr: 'NM' },
      { name: 'New York', abbr: 'NY' },
      { name: 'North Carolina', abbr: 'NC' },
      { name: 'North Dakota', abbr: 'ND' },
      { name: 'Ohio', abbr: 'OH' },
      { name: 'Oklahoma', abbr: 'OK' },
      { name: 'Oregon', abbr: 'OR' },
      { name: 'Pennsylvania', abbr: 'PA' },
      { name: 'Rhode Island', abbr: 'RI' },
      { name: 'South Carolina', abbr: 'SC' },
      { name: 'South Dakota', abbr: 'SD' },
      { name: 'Tennessee', abbr: 'TN' },
      { name: 'Texas', abbr: 'TX' },
      { name: 'Utah', abbr: 'UT' },
      { name: 'Vermont', abbr: 'VT' },
      { name: 'Virginia', abbr: 'VA' },
      { name: 'Washington', abbr: 'WA' },
      { name: 'West Virginia', abbr: 'WV' },
      { name: 'Wisconsin', abbr: 'WI' },
      { name: 'Wyoming', abbr: 'WY' },
      { name: 'District of Columbia', abbr: 'DC' },
      { name: 'Puerto Rico', abbr: 'PR' },
      { name: 'Guam', abbr: 'GU' },
      { name: 'Virgin Islands', abbr: 'VI' }
    ];
    const isLocationAddressPage = () => LOCATION_ADDRESS_PATTERN.test(window.location.pathname || '');
    const normalizeCityName = (value) => {
      const text = String(value || '').trim();
      if (!text) return '';
      const lower = text.toLowerCase();
      return lower.replace(/(^|[\s-])([a-z])/g, (match, sep, letter) => `${sep}${letter.toUpperCase()}`);
    };
    const normalizeStateInput = (value) => {
      const trimmed = String(value || '').trim();
      if (!trimmed) return '';
      const upper = trimmed.toUpperCase();
      const match = US_STATES.find(state => state.abbr === upper || state.name.toUpperCase() === upper);
      if (match) return match.abbr;
      if (upper.length === 2) return upper;
      return upper;
    };
    const formatZipCode = (value) => {
      if (!value) return '';
      const digits = String(value).replace(/\D/g, '');
      if (digits.length <= 5) return digits;
      if (digits.length <= 9) return `${digits.slice(0, 5)}-${digits.slice(5)}`;
      return `${digits.slice(0, 5)}-${digits.slice(5, 9)}`;
    };
    const extractZipCode = (value) => {
      if (!value) return null;
      const match = String(value).match(/\b(\d{5})(?:-?(\d{4}))?\b/);
      if (!match) return null;
      return match[2] ? `${match[1]}-${match[2]}` : match[1];
    };
    const parseInlineAddress = (rawValue, fallback = {}) => {
      const raw = String(rawValue || '').trim();
      const fallbackZipRaw = String(fallback.postalCode || '').trim();
      const fallbackZipExtracted = extractZipCode(fallbackZipRaw);
      const result = {
        street: raw,
        city: normalizeCityName(String(fallback.city || '').trim()),
        state: normalizeStateInput(String(fallback.state || '').trim()),
        postalCode: formatZipCode(fallbackZipExtracted || fallbackZipRaw)
      };
      if (!raw) return result;
      let working = raw;
      const zip = extractZipCode(working);
      if (zip) {
        result.postalCode = formatZipCode(zip);
        working = working.replace(zip, '').replace(/[,\s]+$/g, '').trim();
      }
      const parts = working.split(',').map(part => part.trim()).filter(Boolean);
      if (parts.length >= 2) {
        result.street = parts[0];
        if (parts.length >= 3) {
          result.city = normalizeCityName(parts[1]);
          const statePart = parts.slice(2).join(' ');
          const normalizedState = normalizeStateInput(statePart);
          if (normalizedState) result.state = normalizedState;
        } else {
          const normalizedState = normalizeStateInput(parts[1]);
          if (normalizedState) {
            result.state = normalizedState;
          } else {
            result.city = normalizeCityName(parts[1]);
          }
        }
      } else {
        const stateMatch = working.match(/\b([A-Za-z]{2})$/);
        if (stateMatch) {
          const normalizedState = normalizeStateInput(stateMatch[1]);
          if (normalizedState) {
            result.state = normalizedState;
            const withoutState = working.slice(0, stateMatch.index).trim();
            if (withoutState) result.street = withoutState;
          }
        }
      }
      return result;
    };
    const setInputValue = (input, value) => {
      if (!input || value == null) return false;
      const nextValue = String(value);
      if (input.value === nextValue) return false;
      const descriptor = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), 'value');
      if (descriptor && typeof descriptor.set === 'function') {
        descriptor.set.call(input, nextValue);
      } else {
        input.value = nextValue;
      }
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    };
    const getAddressInputs = () => {
      const allInputs = Array.from(document.querySelectorAll('input.Input-fluid'));
      const byPlaceholder = (needle) =>
        allInputs.find((input) =>
          (input.placeholder || '').toLowerCase().includes(needle)
        ) || null;
      return {
        street: byPlaceholder('address of the location') || byPlaceholder('address'),
        city: byPlaceholder('city'),
        state: byPlaceholder('state'),
        zip: byPlaceholder('zip') || byPlaceholder('postal')
      };
    };
    const patchLocationAddress = async (locationId, address) => {
      if (!locationId) return;
      if (!address?.street) return;
      if (typeof getCognitoTokens !== 'function') return;
      const { accessToken, idToken } = getCognitoTokens() || {};
      const tokens = [idToken, accessToken].filter(Boolean);
      if (!tokens.length) tokens.push(null);
      const url = `${LOCATION_API_BASE}/${locationId}`;
      for (const token of tokens) {
        const headers = {
          accept: 'application/json, text/plain, */*',
          'content-type': 'application/json'
        };
        if (token) headers.Authorization = token;
        const res = await fetch(url, {
          method: 'PATCH',
          headers,
          body: JSON.stringify({ address })
        });
        if (res.ok) {
          return res.json().catch(() => null);
        }
        if (res.status !== 401 && res.status !== 403) {
          break;
        }
      }
      return null;
    };
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
          if (isLocationAddressPage()) {
            const { street, city, state, zip } = getAddressInputs();
            if (street) {
              const parsed = parseInlineAddress(street.value, {
                city: city?.value || '',
                state: state?.value || '',
                postalCode: zip?.value || ''
              });
              let changed = false;
              if (parsed.street) {
                changed = setInputValue(street, parsed.street) || changed;
              }
              if (city && parsed.city) {
                changed = setInputValue(city, parsed.city) || changed;
              }
              if (state && parsed.state) {
                changed = setInputValue(state, parsed.state) || changed;
              }
              if (zip && parsed.postalCode) {
                changed = setInputValue(zip, parsed.postalCode) || changed;
              }
              if (!city || !state || !zip) {
                const locationId = typeof getGoGettaLocationUuid === 'function'
                  ? getGoGettaLocationUuid()
                  : null;
                if (locationId) {
                  const addressPayload = {
                    street: parsed.street || street.value.trim(),
                    city: parsed.city || city?.value || '',
                    state: parsed.state || state?.value || '',
                    postalCode: parsed.postalCode || zip?.value || ''
                  };
                  if (addressPayload.street) {
                    patchLocationAddress(locationId, addressPayload).catch(err => {
                      console.warn('[gghost] Address patch failed:', err);
                    });
                  }
                }
              } else if (changed) {
                // ensure updated inputs propagate for React-controlled forms
                street.dispatchEvent(new Event('blur', { bubbles: true }));
              }
            }
          }
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
