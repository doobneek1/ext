// function formatAddress(fullAddress) {
//   // Shorten common street types
//   const replacements = {
//     'Street': 'St',
//     'Avenue': 'Ave',
//     'Boulevard': 'Blvd',
//     'Road': 'Rd',
//     'Drive': 'Dr',
//     'Place': 'Pl',
//     'Lane': 'Ln',
//     'Court': 'Ct'
//   };

//   // Only keep the first part before the first comma
//   let [firstPart] = fullAddress.split(',');

//   // Replace full words with abbreviations
//   for (const [long, short] of Object.entries(replacements)) {
//     const regex = new RegExp(`\\b${long}\\b`, 'gi');
//     firstPart = firstPart.replace(regex, short);
//   }

//   return firstPart.trim();
// }

// (async function () {
//   const isAddressPage = /\/questions\/location-address$/.test(location.pathname);
//   if (!isAddressPage) return;

//   const AUTOCOMPLETE_URL = 'https://maps.googleapis.com/maps/api/place/autocomplete/json';

//   function waitForInput(selector, timeout = 5000) {
//     return new Promise((resolve, reject) => {
//       const interval = 100;
//       let waited = 0;
//       const timer = setInterval(() => {
//         const input = document.querySelector(selector);
//         if (input) {
//           clearInterval(timer);
//           resolve(input);
//         } else if ((waited += interval) >= timeout) {
//           clearInterval(timer);
//           reject(new Error('Input not found'));
//         }
//       }, interval);
//     });
//   }

// function fetchAddressSuggestions(input) {
//   return new Promise((resolve) => {
//     chrome.runtime.sendMessage(
//       { type: 'getAddressSuggestions', input },
//       (response) => {
//         if (chrome.runtime.lastError) {
// console.warn('[YP] Message error:', chrome.runtime.lastError?.message);
//           return resolve([]);
//         }
//         resolve(response.predictions);
//       }
//     );
//   });
// }


//   function createSuggestionBox(inputEl, suggestions) {
//     const existing = document.querySelector('.autocomplete-box');
//     if (existing) existing.remove();

//     const box = document.createElement('div');
//     box.className = 'autocomplete-box';
//     Object.assign(box.style, {
//       position: 'absolute',
//       zIndex: 9999,
//       background: '#fff',
//       border: '1px solid #ccc',
//       borderRadius: '4px',
//       maxHeight: '200px',
//       overflowY: 'auto',
//       fontSize: '14px',
//       boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
//       width: inputEl.offsetWidth + 'px'
//     });

//  suggestions.forEach(prediction => {
//   const item = document.createElement('div');
//   item.textContent = prediction.description; // ✅ Fixes the issue
//   Object.assign(item.style, {
//     padding: '6px 8px',
//     cursor: 'pointer'
//   });
// item.addEventListener('click', () => {
//   const formatted = formatAddress(prediction.description);
//   inputEl.value = formatted;
//   inputEl.dispatchEvent(new Event('input', { bubbles: true }));
//   box.remove();
// });

//   box.appendChild(item);
// });


//     const rect = inputEl.getBoundingClientRect();
//     box.style.left = rect.left + window.scrollX + 'px';
//     box.style.top = rect.bottom + window.scrollY + 'px';
//     document.body.appendChild(box);
//   }

//   try {
//     const input = await waitForInput('input[placeholder="Enter the address of the location"]');

//     input.addEventListener('input', async () => {
//       const value = input.value.trim();
//       document.querySelectorAll('.autocomplete-box').forEach(el => el.remove());
//       if (value.length < 3) return;

//       const suggestions = await fetchAddressSuggestions(value);
//       if (suggestions.length) {
//         createSuggestionBox(input, suggestions);
//       }
//     });

//     input.addEventListener('blur', () => {
//       setTimeout(() => {
//         document.querySelectorAll('.autocomplete-box').forEach(el => el.remove());
//       }, 200);
//     });
//   } catch (err) {
//     console.warn('[YourPeer] Address autocomplete error:', err);
//   }
// })();
(async function () {
  function formatAddress(fullAddress) {
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
    let [firstPart] = fullAddress.split(',');
    for (const [long, short] of Object.entries(replacements)) {
      const regex = new RegExp(`\\b${long}\\b`, 'gi');
      firstPart = firstPart.replace(regex, short);
    }
    return firstPart.trim();
  }

  function waitForInput(selector, timeout = 5000) {
    return new Promise((resolve, reject) => {
      const interval = 100;
      let waited = 0;
      const timer = setInterval(() => {
        const input = document.querySelector(selector);
        if (input) {
          clearInterval(timer);
          resolve(input);
        } else if ((waited += interval) >= timeout) {
          clearInterval(timer);
          reject(new Error('Input not found'));
        }
      }, interval);
    });
  }

  function fetchAddressSuggestions(input) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(
        { type: 'getAddressSuggestions', input },
        (response) => {
          if (chrome.runtime.lastError) {
            console.warn('[YP] Message error:', chrome.runtime.lastError?.message);
            return resolve([]);
          }
          resolve(response.predictions);
        }
      );
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

    suggestions.forEach(prediction => {
      const item = document.createElement('div');
      item.textContent = prediction.description;
      Object.assign(item.style, {
        padding: '6px 8px',
        cursor: 'pointer'
      });
      item.addEventListener('click', () => {
        const formatted = formatAddress(prediction.description);
        inputEl.value = formatted;
        inputEl.dispatchEvent(new Event('input', { bubbles: true }));
        box.remove();
      });
      box.appendChild(item);
    });

    const rect = inputEl.getBoundingClientRect();
    box.style.left = rect.left + window.scrollX + 'px';
    box.style.top = rect.bottom + window.scrollY + 'px';
    document.body.appendChild(box);
  }

  async function setupAutocomplete() {
    try {
      const input = await waitForInput('input[placeholder="Enter the address of the location"]');

      input.addEventListener('input', async () => {
        const value = input.value.trim();
        document.querySelectorAll('.autocomplete-box').forEach(el => el.remove());
        if (value.length < 3) return;
        const suggestions = await fetchAddressSuggestions(value);
        if (suggestions.length) {
          createSuggestionBox(input, suggestions);
        }
      });

      input.addEventListener('blur', () => {
        setTimeout(() => {
          document.querySelectorAll('.autocomplete-box').forEach(el => el.remove());
        }, 200);
      });
    } catch (err) {
      console.warn('[YourPeer] Address autocomplete error:', err);
    }
  }

  // 🔁 Monitor SPA navigation changes
  let lastPathname = location.pathname;

  function monitorRouteChanges() {
    const observer = new MutationObserver(() => {
      const newPath = location.pathname;
      if (newPath !== lastPathname) {
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
