
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
let focusAckTimer = null;
let visibilityHandler = null;
let visibilityRaf = null;

const orgSearchInputSelector =
  '.input-group input.form-control[placeholder*="Type the organization name"]';
const orgSearchResultSelector = 'li.Dropdown-item.list-group-item[role="menuitem"]';
const orgSearchResultsContainerSelector = '[data-gghost-search-ui="true"][role="menu"]';

function isOrgSearchActive() {
  const input = document.querySelector(orgSearchInputSelector);
  if (!input) return false;
  if (document.activeElement === input) return true;
  const group = input.closest('.input-group');
  return !!group && group.classList.contains('active');
}

function isElementVisible(element) {
  if (!element || !element.isConnected) return false;
  const style = window.getComputedStyle(element);
  if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
    return false;
  }
  return element.getClientRects().length > 0;
}

function hasVisibleOrgSearchResults() {
  const customContainer = document.querySelector(orgSearchResultsContainerSelector);
  if (customContainer && isElementVisible(customContainer)) return true;
  const items = document.querySelectorAll(orgSearchResultSelector);
  for (const item of items) {
    if (isElementVisible(item)) return true;
  }
  return false;
}

function updateMinimapVisibility() {
  if (!container) return;
  const shouldHide = isOrgSearchActive() || hasVisibleOrgSearchResults();
  container.style.display = shouldHide ? 'none' : '';
}

function scheduleMinimapVisibilityUpdate() {
  if (visibilityRaf) return;
  visibilityRaf = requestAnimationFrame(() => {
    visibilityRaf = null;
    updateMinimapVisibility();
  });
}

function attachOrgSearchVisibilityHandlers() {
  if (visibilityHandler) return;
  visibilityHandler = () => scheduleMinimapVisibilityUpdate();
  document.addEventListener('focusin', visibilityHandler, true);
  document.addEventListener('focusout', visibilityHandler, true);
  document.addEventListener('click', visibilityHandler, true);
  document.addEventListener('input', visibilityHandler, true);
  observer = new MutationObserver(() => scheduleMinimapVisibilityUpdate());
  if (document.body) {
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'style']
    });
  }
  scheduleMinimapVisibilityUpdate();
}

function detachOrgSearchVisibilityHandlers() {
  if (!visibilityHandler) return;
  document.removeEventListener('focusin', visibilityHandler, true);
  document.removeEventListener('focusout', visibilityHandler, true);
  document.removeEventListener('click', visibilityHandler, true);
  document.removeEventListener('input', visibilityHandler, true);
  visibilityHandler = null;
  if (visibilityRaf) {
    cancelAnimationFrame(visibilityRaf);
    visibilityRaf = null;
  }
  if (observer) {
    observer.disconnect();
    observer = null;
  }
}

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
  clearBtn.textContent = 'X';
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
  attachOrgSearchVisibilityHandlers();

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
    window.dispatchEvent(new CustomEvent('gghost-minimap-clear'));
  });

  function requestMapFocus(lat, lng, zoom = 16) {
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return Promise.resolve(false);
    }
    const requestId = `minimap-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    return new Promise((resolve) => {
      let settled = false;
      const handleAck = (event) => {
        const detail = event?.detail;
        if (!detail || detail.requestId !== requestId) return;
        settled = true;
        window.removeEventListener('gghost-minimap-focus-ack', handleAck);
        clearTimeout(focusAckTimer);
        resolve(!!detail.success);
      };
      window.addEventListener('gghost-minimap-focus-ack', handleAck);
      window.dispatchEvent(new CustomEvent('gghost-minimap-focus', {
        detail: { lat, lng, zoom, requestId, triggerClick: true, dropPin: false }
      }));
      focusAckTimer = setTimeout(() => {
        if (settled) return;
        window.removeEventListener('gghost-minimap-focus-ack', handleAck);
        resolve(false);
      }, 700);
    });
  }

  function showPlaceById(placeId) {
    chrome.runtime.sendMessage(
      { type: 'getPlaceDetails', placeId },
      (res) => {
        const loc = res?.location;
        if (loc?.lat && loc?.lng) {
          const lat = Number(loc.lat);
          const lng = Number(loc.lng);
          requestMapFocus(lat, lng).then(() => {
            iframe.src = `https://www.google.com/maps?q=${lat},${lng}&z=16&output=embed`;
            iframe.style.display = 'block';
          });
        } else {
          alert('Location not found');
        }
      }
    );
  }
}

function removeMapUI() {
  detachOrgSearchVisibilityHandlers();
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
