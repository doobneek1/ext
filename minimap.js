
function onUrlChange(callback) {
  let lastUrl = location.href;
  const check = () => {
    const currentUrl = location.href;
    if (currentUrl !== lastUrl) {
      lastUrl = currentUrl;
      callback(currentUrl);
    }
  };

  const pushState = history.pushState;
  history.pushState = function (...args) {
    pushState.apply(history, args);
    check();
  };

  const replaceState = history.replaceState;
  history.replaceState = function (...args) {
    replaceState.apply(history, args);
    check();
  };

  window.addEventListener('popstate', check);
  setInterval(check, 500); // fallback check
}

let container = null;
let observer = null;

function injectMapUI() {
    
  if (container) return; // prevent duplicate injection

  container = document.createElement('div');
  Object.assign(container.style, {
    position: 'fixed',
    top: '40px',
    left: '10px',
    zIndex: 9999,
    background: '#fff',
    padding: '10px',
    borderRadius: '8px',
    boxShadow: '0 2px 6px rgba(0,0,0,0.3)',
    width: '320px',
    fontFamily: 'sans-serif'
  });

  const inputWrapper = document.createElement('div');
  inputWrapper.style.display = 'flex';

  const input = document.createElement('input');
  input.type = 'text';
  input.placeholder = 'Search place or address...';
  Object.assign(input.style, {
    flex: 1,
    padding: '8px',
    fontSize: '14px',
    boxSizing: 'border-box',
    border: '1px solid #ccc',
    borderRadius: '4px 0 0 4px'
  });

  const clearBtn = document.createElement('button');
  clearBtn.textContent = '✕';
  Object.assign(clearBtn.style, {
    padding: '0 10px',
    fontSize: '16px',
    border: '1px solid #ccc',
    borderLeft: 'none',
    borderRadius: '0 4px 4px 0',
    background: '#eee',
    cursor: 'pointer'
  });

  inputWrapper.appendChild(input);
  inputWrapper.appendChild(clearBtn);

  const suggestions = document.createElement('div');
  Object.assign(suggestions.style, {
    maxHeight: '120px',
    overflowY: 'auto',
    marginTop: '4px',
    border: '1px solid #ccc',
    display: 'none',
    background: '#fff',
    fontSize: '13px'
  });

  const iframe = document.createElement('iframe');
  Object.assign(iframe.style, {
    width: '100%',
    height: '300px',
    marginTop: '10px',
    border: '1px solid #ccc',
    display: 'none'
  });

  container.appendChild(inputWrapper);
  container.appendChild(suggestions);
  container.appendChild(iframe);
  document.body.appendChild(container);
  // ⬇ Dynamically show/hide based on presence of Dropdown item
  const observer = new MutationObserver(() => {
    const dropdownExists = document.querySelector('li.Dropdown-item.list-group-item');
    if (dropdownExists) {
      container.style.display = 'none';
    } else {
      container.style.display = 'block';
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });

  let debounce;
  input.addEventListener('input', () => {
    clearTimeout(debounce);
    const query = input.value.trim();
    if (!query) {
      suggestions.innerHTML = '';
      suggestions.style.display = 'none';
      return;
    }

    debounce = setTimeout(() => {
      chrome.runtime.sendMessage(
        { type: 'getAddressSuggestions', input: query },
        (res) => {
          const preds = res?.predictions || [];
          suggestions.innerHTML = '';
          preds.forEach(pred => {
            const div = document.createElement('div');
            div.textContent = pred.description;
            Object.assign(div.style, {
              padding: '6px 8px',
              cursor: 'pointer',
              borderBottom: '1px solid #eee'
            });
            div.addEventListener('click', () => {
              input.value = pred.description;
              suggestions.innerHTML = '';
              suggestions.style.display = 'none';
              showPlaceById(pred.place_id);
            });
            suggestions.appendChild(div);
          });
          suggestions.style.display = preds.length ? 'block' : 'none';
        }
      );
    }, 300);
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const query = input.value.trim();
      if (!query) return;

      chrome.runtime.sendMessage(
        { type: 'getAddressSuggestions', input: query },
        (res) => {
          const placeId = res?.predictions?.[0]?.place_id;

          if (placeId) {
            suggestions.innerHTML = '';
            suggestions.style.display = 'none';
            showPlaceById(placeId);
          } else {
            iframe.src = `https://www.google.com/maps?q=${encodeURIComponent(query)}&z=14&output=embed`;
            iframe.style.display = 'block';
          }
        }
      );
    }
  });

  clearBtn.addEventListener('click', () => {
    input.value = '';
    suggestions.innerHTML = '';
    suggestions.style.display = 'none';
    iframe.style.display = 'none';
  });

  function showPlaceById(placeId) {
    chrome.runtime.sendMessage(
      { type: 'getPlaceDetails', placeId },
      (res) => {
        const loc = res?.location;
        if (loc?.lat && loc?.lng) {
          iframe.src = `https://www.google.com/maps?q=${loc.lat},${loc.lng}&z=16&output=embed`;
          iframe.style.display = 'block';
        } else {
          alert('Location not found');
        }
      }
    );
  }
}

function removeMapUI() {
  if (observer) {
    observer.disconnect();
    observer = null;
  }
  if (container) {
    container.remove();
    container = null;
  }
}


// === 🚀 Initial check + SPA listener ===
function isTeamRootPage(url) {
  return /^https:\/\/gogetta\.nyc\/team\/?$/.test(url);
}

if (isTeamRootPage(location.href)) {
  injectMapUI();
}

onUrlChange((url) => {
  if (isTeamRootPage(url)) {
    injectMapUI();
  } else {
    removeMapUI();
  }
});
