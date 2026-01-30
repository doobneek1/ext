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
function sendRuntimeMessage(message, callback) {
  if (!chrome?.runtime?.sendMessage || !chrome?.runtime?.id) {
    callback?.(null);
    return;
  }
  try {
    chrome.runtime.sendMessage(message, (response) => {
      let lastError = null;
      try {
        lastError = chrome?.runtime?.lastError;
      } catch (err) {
        lastError = err;
      }
      if (lastError) {
        console.warn('[Minimap] runtime message failed:', lastError?.message || lastError);
        callback?.(null);
        return;
      }
      callback?.(response || null);
    });
  } catch (err) {
    console.warn('[Minimap] runtime message threw:', err?.message || err);
    callback?.(null);
  }
}
const MINIMAP_RADIUS_METERS = 5000;
function fetchLocationsByRadius(lat, lng, radius = MINIMAP_RADIUS_METERS) {
  const url = `https://w6pkliozjh.execute-api.us-east-1.amazonaws.com/prod/locations?latitude=${encodeURIComponent(lat)}&longitude=${encodeURIComponent(lng)}&radius=${encodeURIComponent(radius)}`;
  return fetch(url, {
    headers: { accept: 'application/json, text/plain, */*' },
    cache: 'no-store',
    mode: 'cors',
    credentials: 'omit'
  })
    .then(res => (res.ok ? res.json() : null))
    .catch(() => null);
}
function dispatchMinimapLocations(lat, lng, radius, locations) {
  if (!Array.isArray(locations)) return;
  window.dispatchEvent(new CustomEvent('gghost-minimap-locations', {
    detail: { lat, lng, radius, locations }
  }));
}
function requestMinimapLocations(lat, lng, radius = MINIMAP_RADIUS_METERS) {
  sendRuntimeMessage(
    { type: 'FETCH_LOCATIONS_BY_RADIUS', query: { latitude: lat, longitude: lng, radius } },
    (res) => {
      if (res?.ok && Array.isArray(res.data)) {
        dispatchMinimapLocations(lat, lng, radius, res.data);
        return;
      }
      fetchLocationsByRadius(lat, lng, radius).then((data) => {
        if (Array.isArray(data)) {
          dispatchMinimapLocations(lat, lng, radius, data);
        }
      });
    }
  );
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
      sendRuntimeMessage(
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
              const description = pred.description || pred.name || input.value || '';
              input.value = description;
              suggestions.innerHTML = '';
              suggestions.style.display = 'none';
              showPlaceById(pred.place_id, description);
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
      sendRuntimeMessage(
        { type: 'getAddressSuggestions', input: query },
        (res) => {
          const placeId = res?.predictions?.[0]?.place_id;
          if (placeId) {
            suggestions.innerHTML = '';
            suggestions.style.display = 'none';
            showPlaceById(placeId, query);
          } else {
            iframe.src = `https://www.google.com/maps?q=${encodeURIComponent(query)}&z=14&output=embed`;
            iframe.style.display = 'block';
            requestMapFocusByAddress(query);
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
    const focusDetail = { lat, lng, zoom, requestId, triggerClick: true, dropPin: true };
    try {
      window.__gghostMinimapPendingFocus = focusDetail;
      window.__gghostMinimapPendingFocusAt = Date.now();
    } catch (err) {
      // ignore if window is not writable
    }
    return new Promise((resolve) => {
      let settled = false;
      const handleAck = (event) => {
        const detail = event?.detail;
        if (!detail || detail.requestId !== requestId) return;
        settled = true;
        window.removeEventListener('gghost-minimap-focus-ack', handleAck);
        clearTimeout(focusAckTimer);
        try {
          window.__gghostMinimapPendingFocus = null;
        } catch (err) {
          // ignore cleanup failures
        }
        resolve(!!detail.success);
      };
      window.addEventListener('gghost-minimap-focus-ack', handleAck);
      window.dispatchEvent(new CustomEvent('gghost-minimap-focus', {
        detail: focusDetail
      }));
      focusAckTimer = setTimeout(() => {
        if (settled) return;
        window.removeEventListener('gghost-minimap-focus-ack', handleAck);
        resolve(false);
      }, 700);
    });
  }
  function coerceLatLng(value) {
    if (!value || typeof value !== 'object') return null;
    const latValue = typeof value.lat === 'function'
      ? value.lat()
      : (value.lat ?? value.latitude);
    const lngValue = typeof value.lng === 'function'
      ? value.lng()
      : (value.lng ?? value.longitude);
    const lat = Number(latValue);
    const lng = Number(lngValue);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return { lat, lng };
  }
  function requestMapFocusByAddress(address, zoom = 16) {
    const trimmed = String(address || '').trim();
    if (!trimmed) return Promise.resolve(false);
    const requestId = `minimap-geocode-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const detail = {
      address: trimmed,
      zoom,
      requestId,
      triggerClick: true,
      dropPin: true
    };
    try {
      window.__gghostMinimapPendingAddress = detail;
      window.__gghostMinimapPendingAddressAt = Date.now();
    } catch (err) {
      // ignore if window is not writable
    }
    return new Promise((resolve) => {
      let settled = false;
      const handleAck = (event) => {
        const ack = event?.detail;
        if (!ack || ack.requestId !== requestId) return;
        settled = true;
        window.removeEventListener('gghost-minimap-geocode-ack', handleAck);
        const coords = coerceLatLng(ack);
        if (coords) {
          const { lat, lng } = coords;
          iframe.src = `https://www.google.com/maps?q=${lat},${lng}&z=${Number.isFinite(zoom) ? zoom : 16}&output=embed`;
          iframe.style.display = 'block';
          requestMinimapLocations(lat, lng);
        }
        resolve(!!ack.success);
      };
      window.addEventListener('gghost-minimap-geocode-ack', handleAck);
      window.dispatchEvent(new CustomEvent('gghost-minimap-geocode', { detail }));
      setTimeout(() => {
        if (settled) return;
        window.removeEventListener('gghost-minimap-geocode-ack', handleAck);
        resolve(false);
      }, 1500);
    });
  }
  function showPlaceById(placeId, fallbackAddress = '') {
    sendRuntimeMessage(
      { type: 'getPlaceDetails', placeId },
      (res) => {
        const coords = coerceLatLng(res?.location);
        if (coords) {
          const { lat, lng } = coords;
          requestMapFocus(lat, lng).then(() => {
            iframe.src = `https://www.google.com/maps?q=${lat},${lng}&z=16&output=embed`;
            iframe.style.display = 'block';
          });
          requestMinimapLocations(lat, lng);
        } else {
          if (fallbackAddress) {
            requestMapFocusByAddress(fallbackAddress);
          } else {
            alert('Location not found');
          }
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
