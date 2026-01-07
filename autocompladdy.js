(async function () {
  function formatAddress(fullAddress) {
    if (typeof fullAddress !== 'string') {
      return '';
    }
    const normalized = fullAddress.trim();
    if (!normalized) {
      return '';
    }
    const replacements = {
      'Street': 'St',
      'Avenue': 'Ave',
      'Boulevard': 'Blvd',
      'Road': 'Rd',
      'Drive': 'Dr',
      'Place': 'Pl',
      'Lane': 'Ln',
      'Court': 'Ct'
    };
    let [firstPart] = normalized.split(',');
    firstPart = firstPart || normalized;
    for (const [long, short] of Object.entries(replacements)) {
      const regex = new RegExp(`\\b${long}\\b`, 'gi');
      firstPart = firstPart.replace(regex, short);
    }
    return firstPart.trim();
  }
  function resolvePredictionText(prediction) {
    if (!prediction) {
      return { display: '', address: '' };
    }
    if (typeof prediction === 'string') {
      return { display: prediction, address: prediction };
    }
    const structured = prediction.structured_formatting || prediction.structuredFormatting;
    const structuredDisplay = structured?.main_text
      ? structured?.secondary_text
        ? `${structured.main_text} - ${structured.secondary_text}`
        : structured.main_text
      : '';
    const formattedAddress =
      prediction.formatted_address ||
      prediction.short_formatted_address ||
      prediction.address ||
      prediction.shortFormattedAddress ||
      '';
    const nameAndAddress = prediction.name && formattedAddress
      ? `${prediction.name} - ${formattedAddress}`
      : '';
    const display =
      prediction.description ||
      structuredDisplay ||
      nameAndAddress ||
      prediction.name ||
      formattedAddress ||
      '';
    const address =
      formattedAddress ||
      prediction.description ||
      structured?.main_text ||
      prediction.name ||
      '';
    return { display, address };
  }
  function waitForInput(selector, timeout = 5000) {
    return new Promise((resolve) => {
      const interval = 100;
      let waited = 0;
      const timer = setInterval(() => {
        const input = document.querySelector(selector);
        if (input) {
          clearInterval(timer);
          resolve(input);
        } else if ((waited += interval) >= timeout) {
          clearInterval(timer);
          resolve(null);
        }
      }, interval);
    });
  }
  function fetchAddressSuggestions(input) {
    return new Promise((resolve) => {
      if (!chrome?.runtime?.sendMessage) {
        return resolve([]);
      }
      try {
        chrome.runtime.sendMessage(
          { type: 'getAddressSuggestions', input },
          (response) => {
            let lastError = null;
            try {
              lastError = chrome?.runtime?.lastError;
            } catch (err) {
              console.warn('[YP] Message error:', err);
              return resolve([]);
            }
            if (lastError) {
              console.warn('[YP] Message error:', lastError?.message);
              return resolve([]);
            }
            const predictions = Array.isArray(response?.predictions) ? response.predictions : [];
            resolve(predictions);
          }
        );
      } catch (err) {
        console.warn('[YP] Message error:', err);
        resolve([]);
      }
    });
  }
  function createSuggestionBox(inputEl, suggestions) {
    document.querySelectorAll('.autocomplete-box').forEach(el => el.remove());
    const box = document.createElement('div');
    box.className = 'autocomplete-box';
    Object.assign(box.style, {
      position: 'absolute',
      zIndex: 9999,
      background: '#fff',
      border: '1px solid #ccc',
      borderRadius: '4px',
      maxHeight: '200px',
      overflowY: 'auto',
      fontSize: '14px',
      boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
      width: inputEl.offsetWidth + 'px'
    });
    let hasItems = false;
    suggestions.forEach(prediction => {
      const { display, address } = resolvePredictionText(prediction);
      if (!display) {
        return;
      }
      const item = document.createElement('div');
      item.textContent = display;
      Object.assign(item.style, {
        padding: '6px 8px',
        cursor: 'pointer'
      });
      item.addEventListener('click', () => {
        const formatted = formatAddress(address || display);
        inputEl.value = formatted || address || display;
        inputEl.dispatchEvent(new Event('input', { bubbles: true }));
        box.remove();
      });
      box.appendChild(item);
      hasItems = true;
    });
    if (!hasItems) {
      return;
    }
    const rect = inputEl.getBoundingClientRect();
    box.style.left = rect.left + window.scrollX + 'px';
    box.style.top = rect.bottom + window.scrollY + 'px';
    document.body.appendChild(box);
  }
  async function setupAutocomplete() {
    try {
      const input = await waitForInput('input[placeholder="Enter the address of the location"]');
      if (!input) return;
      input.addEventListener('input', async () => {
        const value = input.value.trim();
        cleanupAutocomplete();
        if (value.length < 3) return;
        const suggestions = await fetchAddressSuggestions(value);
        if (suggestions.length) {
          createSuggestionBox(input, suggestions);
        }
      });
      input.addEventListener('blur', () => {
        setTimeout(() => {
          cleanupAutocomplete();
        }, 200);
      });
      // Also cleanup on window blur (when switching tabs/apps) and beforeunload
      window.addEventListener('blur', cleanupAutocomplete);
      window.addEventListener('beforeunload', cleanupAutocomplete);
    } catch (err) {
      console.warn('[YourPeer] Address autocomplete error:', err);
    }
  }
  // 🔁 Monitor SPA navigation changes
  let lastPathname = location.pathname;
  function cleanupAutocomplete() {
    document.querySelectorAll('.autocomplete-box').forEach(el => el.remove());
  }
  function monitorRouteChanges() {
    const observer = new MutationObserver(() => {
      const newPath = location.pathname;
      if (newPath !== lastPathname) {
        cleanupAutocomplete();
        lastPathname = newPath;
        if (/\/questions\/location-address$/.test(newPath)) {
          setupAutocomplete();
        }
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }
  // Run both on first load and on future route changes
  if (/\/questions\/location-address$/.test(location.pathname)) {
    setupAutocomplete();
  }
  monitorRouteChanges();
})();
