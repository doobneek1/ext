(function () {
  // Aggressive script re-execution prevention
  if (window.doobneekStreetViewActive) {
    console.log('[streetview.js] Script already active, preventing re-execution');
    return;
  }
  const isBackForwardNavigation = performance.navigation && performance.navigation.type === 2;
  if (isBackForwardNavigation) {
    console.log('[streetview.js] Back/forward navigation detected, delaying initialization');
  }
  window.doobneekStreetViewActive = true;
  // Use EXACT same bubble paste method as text formatter in injector.js
  function dispatchInput(el) {
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }
  // Track URL changes and NO LET'S EDIT IT clicks
  let lastStreetViewUrl = '';
  let hasClickedNoLetsEdit = false;
  let bannerShown = false;
  let lastUrl = window.location.href;
  let urlCheckInterval = null;
  let observer = null;
  let globalClickHandler = null;
  let popstateHandler = null;
  let beforeunloadHandler = null;
  let visibilityHandler = null;
  let pagehideHandler = null;
  let activeModals = [];
  let mapsInstances = [];
  let injectedScripts = [];
  let lastStreetViewPayload = null;
  let lastStreetViewApiKey = null;
  let streetViewReopenButton = null;
  let originalPushState = null;
  let originalReplaceState = null;
  // Check if yourpeerredirect is enabled
  let cachedRedirectEnabled = localStorage.getItem('redirectEnabled') === 'true';
  // Try to load from chrome.storage if available (content script context)
  // Otherwise fall back to localStorage (MAIN world context)
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    chrome.storage.local.get("redirectEnabled", (data) => {
      cachedRedirectEnabled = !!data.redirectEnabled;
      // Sync to localStorage for MAIN world access
      localStorage.setItem('redirectEnabled', cachedRedirectEnabled ? 'true' : 'false');
      console.log('[streetview.js] Redirect enabled loaded from chrome.storage:', cachedRedirectEnabled);
    });
  }
  function isYourPeerRedirectEnabled() {
    // Double-check localStorage in case cache is stale
    const lsValue = localStorage.getItem('redirectEnabled') === 'true';
    return cachedRedirectEnabled || lsValue;
  }
  // Check if we're on street-view page with proper regex
  function isStreetViewPage(url) {
    return /\/questions\/street-view\/?$/.test(url);
  }
  const LOCATION_API_BASE = 'https://w6pkliozjh.execute-api.us-east-1.amazonaws.com/prod/locations';
  const MAPS_JS_API_PROXY = 'https://us-central1-streetli.cloudfunctions.net/mapsJsApi';
  const MAPS_JS_LIBRARIES = 'places,streetview,geometry';
  const MAPS_JS_VERSION = 'weekly';
  const RELOCATE_PROMPT_DISTANCE_METERS = 20;
  const MIDTOWN_CENTER = { lat: 40.754932, lng: -73.984016 };
  const MIDTOWN_RADIUS_METERS = 15 * 1609.34;
  const STREETVIEW_REOPEN_BUTTON_ID = 'gghost-streetview-reopen-button';
  const BACKGROUND_FETCH_MESSAGE = 'DOOBNEEK_BACKGROUND_FETCH';
  const BACKGROUND_FETCH_RESPONSE = 'DOOBNEEK_BACKGROUND_FETCH_RESPONSE';
  const BACKGROUND_FETCH_TIMEOUT_MS = 12000;
  const BACKGROUND_FETCH_BRIDGE_FLAG = '__doobneekBackgroundFetchBridgeActive';
  function resolveLocationId(locationData) {
    const candidate = locationData?.id || locationData?.location_id || locationData?.uuid || locationData?.slug;
    if (typeof candidate !== 'string') return null;
    const trimmed = candidate.trim();
    return trimmed ? trimmed : null;
  }
  function normalizeCityName(value) {
    const text = String(value || '').trim();
    if (!text) return '';
    const lower = text.toLowerCase();
    return lower.replace(/(^|[\s-])([a-z])/g, (match, sep, letter) => `${sep}${letter.toUpperCase()}`);
  }
  function normalizeLocationAddress(locationData) {
    const raw = locationData?.address || locationData?.Address || locationData?.PhysicalAddresses?.[0] || null;
    if (!raw) return {};
    if (typeof raw === 'string') {
      const street = raw.trim();
      return street ? { street } : {};
    }
    const address = {};
    const street = raw.street || raw.address_1 || raw.address1;
    const city = raw.city;
    const state = raw.state || raw.state_province || raw.region;
    const postalCode = raw.postalCode || raw.postal_code;
    const country = raw.country || raw.country_code;
    const region = raw.region;
    if (street) address.street = String(street).trim();
    if (city) address.city = normalizeCityName(city);
    if (state) address.state = String(state).trim();
    if (postalCode) address.postalCode = String(postalCode).trim();
    if (country) address.country = String(country).trim();
    if (region && !address.state) address.region = String(region).trim();
    return address;
  }
  function resolveLocationPosition(locationData) {
    const coords = locationData?.position?.coordinates;
    if (Array.isArray(coords) && coords.length >= 2) {
      const lng = Number(coords[0]);
      const lat = Number(coords[1]);
      if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
    }
    const lat = Number(locationData?.latitude ?? locationData?.lat);
    const lng = Number(locationData?.longitude ?? locationData?.lng);
    if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
    return null;
  }
  function decodeJwtPayload(token) {
    if (!token || typeof token !== 'string') return null;
    const parts = token.split('.');
    if (parts.length < 2) return null;
    const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = payload + '='.repeat((4 - (payload.length % 4)) % 4);
    try {
      return JSON.parse(atob(padded));
    } catch (err) {
      return null;
    }
  }
  function getTokenExp(token) {
    const payload = decodeJwtPayload(token);
    const exp = Number(payload?.exp);
    return Number.isFinite(exp) ? exp : null;
  }
  function collectStorageTokens(storage) {
    const tokens = [];
    if (!storage) return tokens;
    const keys = [];
    for (let i = 0; i < storage.length; i += 1) {
      const key = storage.key(i);
      if (!key || key.indexOf('CognitoIdentityServiceProvider.') === -1) continue;
      if (!/\.accessToken$|\.idToken$/i.test(key)) continue;
      keys.push(key);
    }
    keys.forEach((key) => {
      const value = storage.getItem(key);
      if (!value) return;
      tokens.push({ token: value, exp: getTokenExp(value) });
    });
    const nowSec = Date.now() / 1000;
    tokens.sort((a, b) => (b.exp || 0) - (a.exp || 0));
    const valid = tokens.filter(item => !item.exp || item.exp > nowSec + 60);
    return (valid.length ? valid : tokens).map(item => item.token);
  }
  function expandAuthTokens(tokens) {
    const expanded = [];
    const seen = new Set();
    tokens.forEach((token) => {
      if (!token) return;
      const trimmed = String(token).trim();
      if (!trimmed) return;
      const candidates = /^Bearer\s+/i.test(trimmed)
        ? [trimmed, trimmed.replace(/^Bearer\s+/i, '')]
        : [`Bearer ${trimmed}`, trimmed];
      candidates.forEach((candidate) => {
        if (!candidate || seen.has(candidate)) return;
        seen.add(candidate);
        expanded.push(candidate);
      });
    });
    return expanded;
  }
  function getLocationAuthTokens() {
    const tokens = [];
    const gghost = window.gghost;
    if (gghost && typeof gghost.getCognitoTokens === 'function') {
      const { idToken, accessToken } = gghost.getCognitoTokens() || {};
      if (idToken) tokens.push(idToken);
      if (accessToken && accessToken !== idToken) tokens.push(accessToken);
    }
    if (!tokens.length) {
      tokens.push(...collectStorageTokens(localStorage));
      tokens.push(...collectStorageTokens(sessionStorage));
    }
    const unique = [];
    const seen = new Set();
    tokens.forEach((token) => {
      if (!token || seen.has(token)) return;
      seen.add(token);
      unique.push(token);
    });
    const expanded = expandAuthTokens(unique);
    if (!expanded.length) expanded.push(null);
    return expanded;
  }
  function buildBackgroundResponse(payload, options) {
    const headers = new Headers(payload?.headers || {});
    const rawStatus = typeof payload?.status === 'number' ? payload.status : 0;
    const status = rawStatus >= 200 && rawStatus <= 599 ? rawStatus : 503;
    const statusText = payload?.statusText || (rawStatus ? '' : 'fetch failed');
    const method = String(options?.method || 'GET').toUpperCase();
    const isNullBodyStatus = status === 204 || status === 205 || status === 304 || method === 'HEAD';
    const body = isNullBodyStatus ? null : (payload?.body || '');
    return new Response(body, { status, statusText, headers });
  }
  function fetchViaBackgroundMessage(url, options = {}) {
    if (!chrome?.runtime?.sendMessage) {
      return Promise.reject(new Error('Background fetch unavailable'));
    }
    return new Promise((resolve, reject) => {
      try {
        chrome.runtime.sendMessage({ type: 'BACKGROUND_FETCH', url, options }, (response) => {
          let lastError = null;
          try {
            lastError = chrome?.runtime?.lastError;
          } catch (err) {
            reject(err);
            return;
          }
          if (lastError) {
            reject(new Error(lastError.message || 'Background fetch failed'));
            return;
          }
          if (!response) {
            reject(new Error('Background fetch returned no response'));
            return;
          }
          resolve(buildBackgroundResponse(response, options));
        });
      } catch (err) {
        reject(err);
      }
    });
  }
  function ensureBackgroundFetchBridge() {
    if (!chrome?.runtime?.sendMessage) return;
    if (window[BACKGROUND_FETCH_BRIDGE_FLAG]) return;
    window[BACKGROUND_FETCH_BRIDGE_FLAG] = true;
    window.addEventListener('message', (event) => {
      if (event.source !== window) return;
      const data = event.data || {};
      if (data.type !== BACKGROUND_FETCH_MESSAGE) return;
      const requestId = data.requestId;
      if (!requestId) return;
      const url = data.url;
      const options = data.options && typeof data.options === 'object' ? data.options : {};
      if (!url) {
        window.postMessage({
          type: BACKGROUND_FETCH_RESPONSE,
          requestId,
          ok: false,
          status: 0,
          statusText: 'Missing url',
          body: '',
          headers: {},
          error: 'Missing url'
        }, '*');
        return;
      }
      chrome.runtime.sendMessage({ type: 'BACKGROUND_FETCH', url, options }, (response) => {
        let lastError = null;
        try {
          lastError = chrome?.runtime?.lastError;
        } catch (err) {
          lastError = err;
        }
        if (lastError) {
          window.postMessage({
            type: BACKGROUND_FETCH_RESPONSE,
            requestId,
            ok: false,
            status: 0,
            statusText: lastError.message || 'Background fetch failed',
            body: '',
            headers: {},
            error: lastError.message || 'Background fetch failed'
          }, '*');
          return;
        }
        if (!response) {
          window.postMessage({
            type: BACKGROUND_FETCH_RESPONSE,
            requestId,
            ok: false,
            status: 0,
            statusText: 'Background fetch returned no response',
            body: '',
            headers: {},
            error: 'Background fetch returned no response'
          }, '*');
          return;
        }
        window.postMessage({
          type: BACKGROUND_FETCH_RESPONSE,
          requestId,
          ok: response.ok,
          status: response.status,
          statusText: response.statusText,
          body: response.body || '',
          headers: response.headers || {}
        }, '*');
      });
    });
  }
  function fetchViaBackgroundBridge(url, options = {}) {
    if (typeof window === 'undefined' || typeof window.postMessage !== 'function') {
      return Promise.reject(new Error('Background fetch bridge unavailable'));
    }
    return new Promise((resolve, reject) => {
      const requestId = `doobneek-bg-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      let timeoutId = null;
      const handleMessage = (event) => {
        if (event.source !== window) return;
        const data = event.data || {};
        if (data.type !== BACKGROUND_FETCH_RESPONSE || data.requestId !== requestId) return;
        cleanup();
        if (data.error) {
          reject(new Error(data.error));
          return;
        }
        resolve(buildBackgroundResponse(data, options));
      };
      const cleanup = () => {
        window.removeEventListener('message', handleMessage);
        if (timeoutId) clearTimeout(timeoutId);
      };
      window.addEventListener('message', handleMessage);
      timeoutId = setTimeout(() => {
        cleanup();
        reject(new Error('Background fetch timed out'));
      }, BACKGROUND_FETCH_TIMEOUT_MS);
      window.postMessage({ type: BACKGROUND_FETCH_MESSAGE, requestId, url, options }, '*');
    });
  }
  async function fetchWithBackgroundSupport(url, options = {}) {
    if (chrome?.runtime?.sendMessage) {
      try {
        return await fetchViaBackgroundMessage(url, options);
      } catch (err) {
        console.warn('[streetview.js] Background fetch failed, falling back to window.fetch:', err);
      }
    } else {
      try {
        return await fetchViaBackgroundBridge(url, options);
      } catch (err) {
        console.warn('[streetview.js] Background fetch bridge failed, falling back to window.fetch:', err);
      }
    }
    return fetch(url, options);
  }
  ensureBackgroundFetchBridge();
  async function patchLocationRecord(locationId, payload) {
    if (!locationId) throw new Error('Missing location id.');
    const url = `${LOCATION_API_BASE}/${locationId}`;
    const tokens = getLocationAuthTokens();
    let lastError = '';
    for (const token of tokens) {
      const headers = {
        accept: 'application/json, text/plain, */*',
        'content-type': 'application/json'
      };
      if (token) headers.Authorization = token;
      const res = await fetchWithBackgroundSupport(url, {
        method: 'PATCH',
        headers,
        body: JSON.stringify(payload),
        mode: 'cors'
      });
      if (res.ok) return res.json().catch(() => ({}));
      lastError = await res.text().catch(() => res.statusText);
      if (res.status !== 401 && res.status !== 403) break;
    }
    throw new Error(lastError || 'Failed to update location.');
  }
  function toLatLngLiteral(value) {
    if (!value) return null;
    if (typeof value.lat === 'function' && typeof value.lng === 'function') {
      return { lat: value.lat(), lng: value.lng() };
    }
    const lat = Number(value.lat ?? value.latitude);
    const lng = Number(value.lng ?? value.longitude);
    if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
    return null;
  }
  function computeDistanceMeters(a, b) {
    const pointA = toLatLngLiteral(a);
    const pointB = toLatLngLiteral(b);
    if (!pointA || !pointB) return null;
    const maps = window.google?.maps;
    if (maps?.geometry?.spherical?.computeDistanceBetween && maps?.LatLng) {
      return maps.geometry.spherical.computeDistanceBetween(
        new maps.LatLng(pointA.lat, pointA.lng),
        new maps.LatLng(pointB.lat, pointB.lng)
      );
    }
    const rad = Math.PI / 180;
    const dLat = (pointB.lat - pointA.lat) * rad;
    const dLon = (pointB.lng - pointA.lng) * rad;
    const lat1 = pointA.lat * rad;
    const lat2 = pointB.lat * rad;
    const aVal = Math.sin(dLat / 2) ** 2
      + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
    return 6371000 * 2 * Math.atan2(Math.sqrt(aVal), Math.sqrt(1 - aVal));
  }
  function ensureStreetViewReopenButton() {
    if (streetViewReopenButton && document.contains(streetViewReopenButton)) {
      return streetViewReopenButton;
    }
    streetViewReopenButton = null;
    if (!document.body) return null;
    const button = document.createElement('button');
    button.id = STREETVIEW_REOPEN_BUTTON_ID;
    button.type = 'button';
    button.textContent = 'PIN';
    button.setAttribute('data-doobneek-streetview-reopen', 'true');
    button.title = 'Reopen Street View overlay';
    Object.assign(button.style, {
      position: 'fixed',
      top: '88px',
      left: '20px',
      zIndex: 100002,
      width: '32px',
      height: '32px',
      borderRadius: '50%',
      border: '1px solid #c9c9c9',
      background: '#fff',
      fontSize: '11px',
      fontWeight: '700',
      cursor: 'pointer',
      boxShadow: '0 2px 6px rgba(0,0,0,0.15)'
    });
    button.addEventListener('click', () => {
      if (activeModals.length) return;
      if (!lastStreetViewPayload) return;
      createStreetViewPicker(lastStreetViewPayload, lastStreetViewApiKey);
    });
    document.body.appendChild(button);
    streetViewReopenButton = button;
    return button;
  }
  function setStreetViewReopenVisible(visible) {
    const button = ensureStreetViewReopenButton();
    if (!button) return;
    button.style.display = visible ? 'block' : 'none';
  }
  // URL change detection function
  function handleUrlChange() {
    const currentUrl = window.location.href;
    if (currentUrl !== lastUrl) {
      console.log('URL changed from:', lastUrl, 'to:', currentUrl);
      // Clean up observers when leaving street view pages
      const wasStreetView = isStreetViewPage(lastUrl);
      const isStreetView = isStreetViewPage(currentUrl);
      if (wasStreetView && !isStreetView) {
        console.log('[streetview.js] Leaving street view page, cleaning up resources');
        if (observer) {
          observer.disconnect();
          observer = null;
        }
        // Clean up any active modals and maps when leaving street view
        cleanupMapsAndModals();
      }
      // Also clean up modals if navigating to ANY non-street-view page
      if (!isStreetView && activeModals.length > 0) {
        console.log('[streetview.js] Not on street-view page, cleaning up any lingering modals');
        cleanupMapsAndModals();
      }
      lastUrl = currentUrl;
      // Reset flags when URL changes
      hasClickedNoLetsEdit = false;
      bannerShown = false;
      // Run street view logic if on street-view page
      if (isStreetView) {
        // Prevent back navigation when entering street view
        preventBackNavigation();
        clickNoLetsEditIfNeeded(); // Execute immediately without delay
        // Reinitialize observer if needed (with throttling to prevent excessive calls)
        if (!observer) {
          let lastCallTime = 0;
          const throttledCallback = () => {
            const now = Date.now();
            if (now - lastCallTime > 250) { // Throttle to max 4 calls per second
              lastCallTime = now;
              clickNoLetsEditIfNeeded();
            }
          };
          observer = new MutationObserver(throttledCallback);
          const targetContainer = document.querySelector('main') || document.body;
          observer.observe(targetContainer, {
            childList: true,
            subtree: true,
            // Reduce observer sensitivity to prevent excessive triggering
            attributes: false,
            attributeOldValue: false,
            characterData: false,
            characterDataOldValue: false
          });
        }
      }
    }
  }
  // Set up URL change monitoring using multiple methods
  function setupUrlChangeListener() {
    // Prevent conflicts with other scripts that might override history
    if (window.doobneekHistoryOverridden) {
      console.log('[streetview.js] History already overridden by another script, using fallback methods');
      // Method 2: Listen for popstate events only
      popstateHandler = handleUrlChange;
      window.addEventListener('popstate', popstateHandler);
      return;
    }
    window.doobneekHistoryOverridden = true;
    // Method 1: Override pushState and replaceState
    originalPushState = history.pushState;
    originalReplaceState = history.replaceState;
    history.pushState = function() {
      originalPushState.apply(history, arguments);
      setTimeout(handleUrlChange, 0);
    };
    history.replaceState = function() {
      originalReplaceState.apply(history, arguments);
      setTimeout(handleUrlChange, 0);
    };
    // Method 2: Listen for popstate events
    popstateHandler = handleUrlChange;
    window.addEventListener('popstate', popstateHandler);
    console.log('URL change listener setup complete');
  }
  // Click "NO, LET'S EDIT IT" button if not already clicked for this URL
  function clickNoLetsEditIfNeeded() {
    const currentUrl = window.location.href;
    // Reset flags if URL changed
    if (lastStreetViewUrl !== currentUrl) {
      hasClickedNoLetsEdit = false;
      bannerShown = false;
      lastStreetViewUrl = currentUrl;
    }
    // Check if OK was recently clicked and skip if so
    const lastOkClickTime = parseInt(localStorage.getItem('ypLastOkClickTime') || '0', 10);
    const now = Date.now();
    const elapsed = now - lastOkClickTime;
    if (isStreetViewPage(currentUrl) && elapsed < 10000) {
      console.log(`[streetview.js] ⏳ Skipping 'NO, LET'S EDIT IT' — recent OK click (${elapsed}ms ago)`);
      return;
    }
    // Always click on street-view pages if we haven't clicked for this URL yet
    // (regardless of redirect setting - redirect only controls YES button and navigation)
    if (!hasClickedNoLetsEdit && isStreetViewPage(currentUrl)) {
      // Look for button by text content since :contains() isn't valid CSS
      const buttons = document.querySelectorAll('button');
      let noLetsEditButton = null;
      for (const btn of buttons) {
        const text = btn.textContent.trim().toUpperCase();
        if (text.includes('NO') && (text.includes('EDIT') || text.includes('LET'))) {
          noLetsEditButton = btn;
          break;
        }
      }
      if (noLetsEditButton) {
        console.log('Clicking NO, LET\'S EDIT IT button');
        noLetsEditButton.click();
        hasClickedNoLetsEdit = true;
        createBubble('NO, LET\'S EDIT IT Clicked!');
      }
    }
  }
  // Prevent back navigation on street view pages
  function preventBackNavigation() {
    if (isStreetViewPage(window.location.href)) {
      // Add a dummy state to history to prevent going back
      if (!window.doobneekHistoryBlocked) {
        window.doobneekHistoryBlocked = true;
        history.pushState({ doobneekBlock: true }, '', window.location.href);
        // Override back button behavior
        const handlePopstate = (event) => {
          if (isStreetViewPage(window.location.href)) {
            // Push forward again to stay on the page
            history.pushState({ doobneekBlock: true }, '', window.location.href);
            console.log('[streetview.js] Back navigation prevented on street view page');
          }
        };
        window.addEventListener('popstate', handlePopstate);
        // Store the handler for cleanup
        window.doobneekPopstateHandler = handlePopstate;
      }
    }
  }
  function init() {
    console.log('[streetview.js] Initializing script');
    // Initialize URL change listener
    setupUrlChangeListener();
    // Loading banner removed
    // Prevent back navigation on street view pages
    preventBackNavigation();
    // Run the check when page loads and on mutations (only on street-view pages)
    if (isStreetViewPage(window.location.href)) {
      clickNoLetsEditIfNeeded(); // Execute immediately without delay
      // Only create observer if one doesn't already exist
      if (!observer) {
        let lastCallTime = 0;
        const throttledCallback = () => {
          const now = Date.now();
          if (now - lastCallTime > 250) { // Throttle to max 4 calls per second
            lastCallTime = now;
            clickNoLetsEditIfNeeded();
          }
        };
        observer = new MutationObserver(throttledCallback);
        // Observe only specific containers instead of entire body
        const targetContainer = document.querySelector('main') || document.body;
        observer.observe(targetContainer, {
          childList: true,
          subtree: true,
          // Reduce observer sensitivity to prevent excessive triggering
          attributes: false,
          attributeOldValue: false,
          characterData: false,
          characterDataOldValue: false
        });
      }
    }
  }
  // Bubble paste functionality - create visual feedback
  function createBubble(text) {
    const bubble = document.createElement('div');
    Object.assign(bubble.style, {
      position: 'fixed',
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
      background: 'rgba(66, 133, 244, 0.9)',
      color: 'white',
      padding: '12px 20px',
      borderRadius: '25px',
      fontSize: '14px',
      fontWeight: 'bold',
      zIndex: '100002',
      boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
      animation: 'bubbleFade 2s ease-out forwards'
    });
    bubble.textContent = text;
    // Add CSS animation
    const style = document.createElement('style');
    style.textContent = `
      @keyframes bubbleFade {
        0% { opacity: 0; transform: translate(-50%, -50%) scale(0.8); }
        20% { opacity: 1; transform: translate(-50%, -50%) scale(1); }
        80% { opacity: 1; transform: translate(-50%, -50%) scale(1); }
        100% { opacity: 0; transform: translate(-50%, -50%) scale(0.8); }
      }
    `;
    document.head.appendChild(style);
    document.body.appendChild(bubble);
    setTimeout(() => {
      if (bubble.parentNode) bubble.remove();
      if (style.parentNode) style.remove();
    }, 2000);
  }
  function getMapsProxyUrl() {
    if (typeof window !== 'undefined' && window.DOOBNEEK_MAPS_JS_API_PROXY) {
      return window.DOOBNEEK_MAPS_JS_API_PROXY;
    }
    return MAPS_JS_API_PROXY;
  }
  function buildMapsScriptSrc(apiKey) {
    if (apiKey) {
      return `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&libraries=${encodeURIComponent(MAPS_JS_LIBRARIES)}&v=${encodeURIComponent(MAPS_JS_VERSION)}`;
    }
    const proxyUrl = getMapsProxyUrl();
    if (!proxyUrl) return null;
    const params = new URLSearchParams();
    params.set('libraries', MAPS_JS_LIBRARIES);
    params.set('v', MAPS_JS_VERSION);
    const separator = proxyUrl.includes('?') ? '&' : '?';
    return `${proxyUrl}${separator}${params.toString()}`;
  }
  function loadGoogleMapsAPI(apiKey, callback) {
    if (window.google && window.google.maps && window.google.maps.StreetViewPanorama) {
      callback();
      return;
    }
    // Prevent multiple script injections using a global flag
    if (window.doobneekMapsLoading) {
      // Wait for existing load to complete
      const checkGoogle = () => {
        if (window.google && window.google.maps && window.google.maps.StreetViewPanorama) {
          callback();
        } else if (!window.doobneekMapsLoading) {
          // Loading failed, retry
          loadGoogleMapsAPI(apiKey, callback);
        } else {
          setTimeout(checkGoogle, 200);
        }
      };
      checkGoogle();
      return;
    }
    // Check if script is already loading
    const existingScript = document.querySelector('script[data-doobneek-maps-api]')
      || document.querySelector('script[src*="maps.googleapis.com/maps/api/js"]');
    if (existingScript) {
      window.doobneekMapsLoading = true;
      // Wait for existing script to load with timeout
      let attempts = 0;
      const maxAttempts = 50; // 10 seconds max
      const checkGoogle = () => {
        attempts++;
        if (window.google && window.google.maps && window.google.maps.StreetViewPanorama) {
          window.doobneekMapsLoading = false;
          callback();
        } else if (attempts >= maxAttempts) {
          window.doobneekMapsLoading = false;
          console.error('Google Maps API load timeout.');
        } else {
          setTimeout(checkGoogle, 200);
        }
      };
      checkGoogle();
      return;
    }
    window.doobneekMapsLoading = true;
    const script = document.createElement('script');
    const scriptSrc = buildMapsScriptSrc(apiKey);
    if (!scriptSrc) {
      window.doobneekMapsLoading = false;
      console.error('Google Maps API key or proxy URL missing.');
      alert('Could not load Google Maps API.');
      return;
    }
    script.src = scriptSrc;
    script.async = true;
    script.defer = true;
    script.setAttribute('data-doobneek-script', 'true'); // Mark for cleanup
    script.setAttribute('data-doobneek-maps-api', 'true');
    script.onload = () => {
      // Double check that Google Maps is fully loaded with timeout
      let attempts = 0;
      const maxAttempts = 25; // 5 seconds max
      const checkLoaded = () => {
        attempts++;
        if (window.google && window.google.maps && window.google.maps.StreetViewPanorama) {
          window.doobneekMapsLoading = false;
          callback();
        } else if (attempts >= maxAttempts) {
          window.doobneekMapsLoading = false;
          console.error('Google Maps API loaded but objects not available.');
        } else {
          setTimeout(checkLoaded, 200);
        }
      };
      checkLoaded();
    };
    script.onerror = () => {
      window.doobneekMapsLoading = false;
      console.error('Google Maps API failed to load.');
      alert('Could not load Google Maps API.');
    };
    document.head.appendChild(script);
    injectedScripts.push(script); // Track for cleanup
  }
  async function createStreetViewPicker(locationData, apiKey) {
    // Only show modal on street-view pages
    const currentUrl = window.location.href;
    if (!isStreetViewPage(currentUrl)) {
      console.log('[streetview.js] Skipping modal - not on street-view page');
      return;
    }
    lastStreetViewPayload = locationData || null;
    lastStreetViewApiKey = apiKey || null;
    // Use provided location details to get address and org/location names
    const locationId = resolveLocationId(locationData);
    let addressData = normalizeLocationAddress(locationData);
    let streetAddress = addressData.street || '';
    let headerTitle = 'Street View Picker';
    const redirectEnabled = isYourPeerRedirectEnabled();
    const canEditLocation = Boolean(locationId && redirectEnabled);
    const relocateState = {
      original: resolveLocationPosition(locationData),
      pending: null,
      dismissed: null,
      promptOpen: false,
      lastPromptAt: 0,
      suppressPromptUntil: 0
    };
    const suppressRelocatePrompt = (durationMs = 1200) => {
      relocateState.suppressPromptUntil = Date.now() + durationMs;
    };
    let updateStreetViewForLocation = null;
    if (locationData) {
      const orgName = locationData.Organization?.name || '';
      const locName = locationData.name || '';
      if (orgName && locName) {
        headerTitle = `${locName} / ${orgName}`;
      } else if (orgName) {
        headerTitle = orgName;
      } else if (locName) {
        headerTitle = locName;
      }
    } else {
      console.warn('[streetview.js] Missing location data for header details');
    }
    const modal = document.createElement('div');
    modal.setAttribute('data-doobneek-modal', 'true'); // Mark for cleanup
    Object.assign(modal.style, {
      position: 'fixed',
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
      width: '90vw',
      height: '90vh',
      maxWidth: '1000px',
      maxHeight: '700px',
      background: '#fff',
      zIndex: 100001,
      boxShadow: '0 4px 15px rgba(0,0,0,0.2)',
      borderRadius: '8px',
      display: 'flex',
      flexDirection: 'column'
    });
    activeModals.push(modal); // Track for cleanup
    const header = document.createElement('div');
    header.style.padding = '12px 16px';
    header.style.background = '#f1f1f1';
    header.style.borderBottom = '1px solid #ddd';
    header.style.display = 'flex';
    header.style.justifyContent = 'space-between';
    header.style.alignItems = 'center';
    header.innerHTML = `<span style="font-weight:bold; font-size:16px;">${headerTitle}</span>`;
    const closeButton = document.createElement('button');
    closeButton.setAttribute('data-doobneek-modal-close', 'true');
    closeButton.textContent = '✕';
    Object.assign(closeButton.style, {
      background: 'transparent',
      border: 'none',
      fontSize: '20px',
      cursor: 'pointer',
      padding: '4px'
    });
    // Add a style rule to ensure the autocomplete suggestions appear over the modal.
    const style = document.createElement('style');
    style.textContent = '.pac-container { z-index: 100002 !important; }';
    let dismissRelocateOverlay = () => {};
    const closeModal = () => {
      dismissRelocateOverlay();
      cleanupModalMaps(modal);
      modal.remove();
      const index = activeModals.indexOf(modal);
      if (index > -1) activeModals.splice(index, 1);
      if (style.parentNode) {
        style.parentNode.removeChild(style);
      }
      setStreetViewReopenVisible(true);
    };
    closeButton.onclick = closeModal;
    const headerActions = document.createElement('div');
    Object.assign(headerActions.style, {
      display: 'flex',
      alignItems: 'center',
      gap: '8px'
    });
    headerActions.appendChild(closeButton);
    header.appendChild(headerActions);
    modal.appendChild(header);
    document.head.appendChild(style);
    // Search bar
    const searchContainer = document.createElement('div');
    searchContainer.style.padding = '12px 16px';
    searchContainer.style.borderBottom = '1px solid #ddd';
    const searchLabel = document.createElement('div');
    searchLabel.textContent = 'Search for address';
    Object.assign(searchLabel.style, {
      fontSize: '12px',
      fontWeight: '600',
      color: '#555',
      marginBottom: '6px'
    });
    const searchInput = document.createElement('input');
    Object.assign(searchInput.style, {
      width: '100%',
      padding: '8px 12px',
      border: '1px solid #ccc',
      borderRadius: '4px',
      fontSize: '14px'
    });
    searchInput.type = 'text';
    searchInput.placeholder = 'Search for a location...';
    // Pre-fill with street address if available
    if (streetAddress) {
      searchInput.value = streetAddress;
    }
    searchContainer.appendChild(searchLabel);
    searchContainer.appendChild(searchInput);
    if (canEditLocation) {
      const addressRow = document.createElement('div');
      Object.assign(addressRow.style, {
        display: 'flex',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '8px',
        marginTop: '8px'
      });
      const addressLabel = document.createElement('div');
      addressLabel.textContent = 'Edit address';
      Object.assign(addressLabel.style, {
        fontSize: '11px',
        fontWeight: '600',
        color: '#555',
        whiteSpace: 'nowrap',
        flex: '0 0 auto'
      });
      const addressInput = document.createElement('input');
      addressInput.type = 'text';
      addressInput.placeholder = 'Street address (line 1)';
      addressInput.setAttribute('data-doobneek-address-input', 'true');
      Object.assign(addressInput.style, {
        padding: '6px 8px',
        border: '1px solid #ccc',
        borderRadius: '4px',
        fontSize: '12px',
        flex: '1 1 auto',
        minWidth: '0'
      });
      const addressSaveButton = document.createElement('button');
      addressSaveButton.type = 'button';
      addressSaveButton.textContent = 'Save';
      addressSaveButton.setAttribute('data-doobneek-address-save', 'true');
      Object.assign(addressSaveButton.style, {
        background: '#1f6feb',
        border: '1px solid #1f6feb',
        borderRadius: '4px',
        color: '#fff',
        cursor: 'pointer',
        flex: '0 0 auto',
        fontSize: '11px',
        padding: '6px 10px'
      });
      addressSaveButton.disabled = true;
      const addressAdornment = document.createElement('div');
      Object.assign(addressAdornment.style, {
        fontSize: '11px',
        color: '#666',
        maxWidth: '160px',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        textAlign: 'right'
      });
      addressRow.appendChild(addressLabel);
      addressRow.appendChild(addressInput);
      addressRow.appendChild(addressSaveButton);
      addressRow.appendChild(addressAdornment);
      const addressMessage = document.createElement('div');
      addressMessage.style.fontSize = '11px';
      addressMessage.style.color = '#666';
      addressMessage.style.minHeight = '14px';
      addressMessage.style.marginTop = '4px';
      searchContainer.appendChild(addressRow);
      searchContainer.appendChild(addressMessage);
      let addressSync = false;
      let addressSaving = false;
      let lastSavedStreet = addressData.street || '';
      let addressBlurFromOverlay = false;
      const buildAddressAdornment = (data) => {
        if (!data) return '';
        const city = normalizeCityName(data.city);
        const parts = [city, data.state, data.postalCode].filter(Boolean);
        const suffix = parts.join(', ');
        const country = String(data.country || '').trim();
        if (country && country.toUpperCase() !== 'US') {
          return suffix ? `${suffix} ${country}` : country;
        }
        return suffix;
      };
      const setAddressMessage = (text, tone) => {
        addressMessage.textContent = text || '';
        addressMessage.style.color = tone === 'error' ? '#b42318' : '#666';
      };
      const sanitizeStreetInput = (value) => {
        const raw = String(value || '');
        return raw.split(/\r?\n/)[0].trim();
      };
      const isStreetValid = (value) => {
        if (!value) return false;
        if (value.length < 3) return false;
        if (!/\d/.test(value)) return false;
        if (!/[A-Za-z]/.test(value)) return false;
        return true;
      };
      const updateSaveButton = () => {
        const sanitized = sanitizeStreetInput(addressInput.value);
        const isValid = isStreetValid(sanitized);
        const hasChanges = sanitized && sanitized !== lastSavedStreet;
        addressSaveButton.textContent = addressSaving ? 'Saving...' : 'Save';
        addressSaveButton.disabled = addressSaving || !isValid || !hasChanges;
        addressSaveButton.style.opacity = addressSaveButton.disabled ? '0.6' : '1';
        addressSaveButton.style.cursor = addressSaveButton.disabled ? 'not-allowed' : 'pointer';
      };
      const syncAddressInput = (value) => {
        addressSync = true;
        addressInput.value = value || '';
        addressAdornment.textContent = buildAddressAdornment(addressData);
        addressSync = false;
        updateSaveButton();
      };
      const applyAddressPatch = async (streetValue) => {
        if (addressSaving) return;
        if (!isStreetValid(streetValue)) {
          setAddressMessage('Enter a valid street address.', 'error');
          updateSaveButton();
          return;
        }
        if (streetValue === lastSavedStreet) {
          setAddressMessage('', 'info');
          updateSaveButton();
          return;
        }
        addressSaving = true;
        updateSaveButton();
        setAddressMessage('Saving address...', 'info');
        try {
          const nextAddress = { ...addressData, street: streetValue };
          if (addressData.region && !nextAddress.region && !nextAddress.state) {
            nextAddress.region = addressData.region;
          }
          const response = await patchLocationRecord(locationId, { address: nextAddress });
          const normalized = (response && (response.address || response.Address || response.PhysicalAddresses))
            ? normalizeLocationAddress(response)
            : nextAddress;
          addressData = { ...addressData, ...normalized };
          addressData.city = normalizeCityName(addressData.city);
          if (locationData) {
            locationData.address = { ...(locationData.address || {}), ...addressData };
          }
          const previousStreet = streetAddress;
          streetAddress = addressData.street || '';
          if (searchInput.value.trim() === previousStreet) {
            searchInput.value = streetAddress;
          }
          lastSavedStreet = streetAddress;
          syncAddressInput(streetAddress);
          setAddressMessage('Saved.', 'info');
          createBubble('Address updated!');
        } catch (err) {
          setAddressMessage(err?.message || 'Failed to update address.', 'error');
        } finally {
          addressSaving = false;
          updateSaveButton();
        }
      };
      const saveAddressFromInput = () => {
        const sanitized = sanitizeStreetInput(addressInput.value);
        if (sanitized !== addressInput.value) {
          addressSync = true;
          addressInput.value = sanitized;
          addressSync = false;
        }
        if (!sanitized) {
          setAddressMessage('Street address required.', 'error');
          updateSaveButton();
          return;
        }
        if (!isStreetValid(sanitized)) {
          setAddressMessage('Enter a valid street address.', 'error');
          updateSaveButton();
          return;
        }
        void applyAddressPatch(sanitized);
      };
      const shouldIgnoreOverlayBlur = (target) => {
        if (!target || typeof target.closest !== 'function') return false;
        return Boolean(
          target.closest('[data-doobneek-address-input]') ||
          target.closest('[data-doobneek-address-save]') ||
          target.closest('[data-doobneek-modal-close]')
        );
      };
      modal.addEventListener('mousedown', (event) => {
        if (shouldIgnoreOverlayBlur(event.target)) {
          addressBlurFromOverlay = false;
          return;
        }
        addressBlurFromOverlay = true;
      });
      addressSaveButton.addEventListener('click', () => {
        saveAddressFromInput();
      });
      addressInput.addEventListener('focus', () => {
        addressBlurFromOverlay = false;
      });
      addressInput.addEventListener('input', () => {
        if (addressSync) return;
        const sanitized = sanitizeStreetInput(addressInput.value);
        if (sanitized !== addressInput.value) {
          addressSync = true;
          addressInput.value = sanitized;
          addressSync = false;
        }
        if (!sanitized) {
          setAddressMessage('Street address required.', 'error');
          updateSaveButton();
          return;
        }
        if (!isStreetValid(sanitized)) {
          setAddressMessage('Enter a valid street address.', 'error');
          updateSaveButton();
          return;
        }
        setAddressMessage('', 'info');
        updateSaveButton();
      });
      addressInput.addEventListener('blur', (event) => {
        if (addressSync) {
          addressBlurFromOverlay = false;
          return;
        }
        const relatedTarget = event.relatedTarget;
        const hasRelatedClosest = relatedTarget && typeof relatedTarget.closest === 'function';
        const focusStayedInModal = relatedTarget && modal.contains(relatedTarget);
        const focusIsClose = hasRelatedClosest && relatedTarget.closest('[data-doobneek-modal-close]');
        const focusIsSave = hasRelatedClosest && relatedTarget.closest('[data-doobneek-address-save]');
        const shouldSave = addressBlurFromOverlay || (focusStayedInModal && !focusIsClose && !focusIsSave);
        addressBlurFromOverlay = false;
        if (!shouldSave) return;
        saveAddressFromInput();
      });
      addressInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          saveAddressFromInput();
          addressInput.blur();
        }
      });
      syncAddressInput(addressData.street || '');
    }
    modal.appendChild(searchContainer);
    // Map and Street View container
    const contentContainer = document.createElement('div');
    contentContainer.style.display = 'flex';
    contentContainer.style.flex = '1 1 auto';
    contentContainer.style.minHeight = '0';
    // Map div (left side)
    const mapDiv = document.createElement('div');
    mapDiv.style.width = '50%';
    mapDiv.style.height = '100%';
    mapDiv.style.borderRight = '1px solid #ddd';
    // Street View div (right side)  
    const streetViewDiv = document.createElement('div');
    streetViewDiv.style.width = '50%';
    streetViewDiv.style.height = '100%';
    contentContainer.appendChild(mapDiv);
    contentContainer.appendChild(streetViewDiv);
    modal.appendChild(contentContainer);
    // Bottom bar with set button
    const bottomBar = document.createElement('div');
    Object.assign(bottomBar.style, {
      padding: '12px 16px',
      borderTop: '1px solid #ddd',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      background: '#f9f9f9'
    });
    const urlDisplay = document.createElement('span');
    urlDisplay.style.fontSize = '12px';
    urlDisplay.style.color = '#666';
    urlDisplay.style.maxWidth = '60%';
    urlDisplay.style.overflow = 'hidden';
    urlDisplay.style.textOverflow = 'ellipsis';
    urlDisplay.style.whiteSpace = 'nowrap';
    urlDisplay.textContent = 'Click on the map to select a Street View location';
    const setButton = document.createElement('button');
    setButton.textContent = 'Set Street View';
    Object.assign(setButton.style, {
      background: '#4285f4',
      color: 'white',
      border: 'none',
      padding: '8px 16px',
      borderRadius: '4px',
      cursor: 'pointer',
      fontSize: '14px',
      fontWeight: 'bold',
      opacity: '0.5',
      position: 'sticky',
      bottom: '0'
    });
    setButton.disabled = true;
    bottomBar.appendChild(urlDisplay);
    bottomBar.appendChild(setButton);
    modal.appendChild(bottomBar);
    document.body.appendChild(modal);
    setStreetViewReopenVisible(false);
    let showRelocateOverlay = () => {};
    let updateRelocateOverlay = () => {};
    let hideRelocateOverlay = () => {};
    if (canEditLocation) {
      const relocateOverlay = document.createElement('div');
      relocateOverlay.setAttribute('data-doobneek-relocate-overlay', 'true');
      Object.assign(relocateOverlay.style, {
        position: 'absolute',
        inset: '0',
        background: 'rgba(0, 0, 0, 0.35)',
        display: 'none',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100003
      });
      const relocatePanel = document.createElement('div');
      Object.assign(relocatePanel.style, {
        background: '#fff',
        borderRadius: '8px',
        padding: '16px',
        width: '320px',
        maxWidth: '92%',
        boxShadow: '0 8px 20px rgba(0,0,0,0.25)',
        fontSize: '12px',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px'
      });
      const relocateTitle = document.createElement('div');
      relocateTitle.textContent = 'Relocate this location?';
      relocateTitle.style.fontWeight = '600';
      relocateTitle.style.fontSize = '14px';
      const relocateMessage = document.createElement('div');
      relocateMessage.style.color = '#333';
      relocateMessage.style.lineHeight = '1.4';
      const relocateInputs = document.createElement('div');
      relocateInputs.style.display = 'grid';
      relocateInputs.style.gridTemplateColumns = '1fr 1fr';
      relocateInputs.style.gap = '8px';
      const relocateLatInput = document.createElement('input');
      relocateLatInput.type = 'text';
      relocateLatInput.placeholder = 'Latitude';
      Object.assign(relocateLatInput.style, {
        padding: '6px 8px',
        border: '1px solid #ccc',
        borderRadius: '4px',
        fontSize: '12px'
      });
      const relocateLngInput = document.createElement('input');
      relocateLngInput.type = 'text';
      relocateLngInput.placeholder = 'Longitude';
      Object.assign(relocateLngInput.style, {
        padding: '6px 8px',
        border: '1px solid #ccc',
        borderRadius: '4px',
        fontSize: '12px'
      });
      relocateInputs.appendChild(relocateLatInput);
      relocateInputs.appendChild(relocateLngInput);
      const relocateStatus = document.createElement('div');
      relocateStatus.style.fontSize = '11px';
      relocateStatus.style.minHeight = '14px';
      relocateStatus.style.color = '#666';
      const relocateActions = document.createElement('div');
      Object.assign(relocateActions.style, {
        display: 'flex',
        justifyContent: 'flex-end',
        gap: '8px'
      });
      const relocateKeepButton = document.createElement('button');
      relocateKeepButton.type = 'button';
      relocateKeepButton.textContent = 'Keep current';
      Object.assign(relocateKeepButton.style, {
        border: '1px solid #d0d0d0',
        background: '#fff',
        color: '#333',
        borderRadius: '6px',
        padding: '6px 10px',
        fontSize: '12px',
        cursor: 'pointer'
      });
      const relocateConfirmButton = document.createElement('button');
      relocateConfirmButton.type = 'button';
      relocateConfirmButton.textContent = 'Relocate';
      Object.assign(relocateConfirmButton.style, {
        border: 'none',
        background: '#2563eb',
        color: '#fff',
        borderRadius: '6px',
        padding: '6px 12px',
        fontSize: '12px',
        cursor: 'pointer'
      });
      relocateActions.appendChild(relocateKeepButton);
      relocateActions.appendChild(relocateConfirmButton);
      relocatePanel.appendChild(relocateTitle);
      relocatePanel.appendChild(relocateMessage);
      relocatePanel.appendChild(relocateInputs);
      relocatePanel.appendChild(relocateStatus);
      relocatePanel.appendChild(relocateActions);
      relocateOverlay.appendChild(relocatePanel);
      modal.appendChild(relocateOverlay);
      let relocateInputSync = false;
      let relocateInputsDirty = false;
      let relocateSaving = false;
      const setRelocateStatus = (text, tone) => {
        relocateStatus.textContent = text || '';
        relocateStatus.style.color = tone === 'error'
          ? '#b42318'
          : tone === 'warning'
            ? '#b45309'
            : '#666';
      };
      const setRelocateInputs = (candidate) => {
        const literal = toLatLngLiteral(candidate);
        if (!literal) return;
        relocateInputSync = true;
        relocateLatInput.value = literal.lat.toFixed(6);
        relocateLngInput.value = literal.lng.toFixed(6);
        relocateInputSync = false;
      };
      const extractNumbers = (text) => {
        const matches = String(text || '').match(/-?\d+(?:\.\d+)?/g);
        if (!matches) return [];
        return matches.map(value => Number(value)).filter(value => Number.isFinite(value));
      };
      const pickLatLngFromNumbers = (numbers) => {
        if (!Array.isArray(numbers) || numbers.length < 2) return null;
        const n0 = numbers[0];
        const n1 = numbers[1];
        if (!Number.isFinite(n0) || !Number.isFinite(n1)) return null;
        if (Math.abs(n0) > 180 || Math.abs(n1) > 180) return null;
        const candidates = [];
        if (Math.abs(n0) <= 90 && Math.abs(n1) <= 180) {
          candidates.push({ lat: n0, lng: n1, swapped: false });
        }
        if (Math.abs(n1) <= 90 && Math.abs(n0) <= 180) {
          candidates.push({ lat: n1, lng: n0, swapped: true });
        }
        if (!candidates.length) return null;
        if (candidates.length === 1) return candidates[0];
        const distanceA = computeDistanceMeters(MIDTOWN_CENTER, candidates[0]);
        const distanceB = computeDistanceMeters(MIDTOWN_CENTER, candidates[1]);
        if (!Number.isFinite(distanceA) || !Number.isFinite(distanceB)) return candidates[0];
        return distanceB < distanceA ? candidates[1] : candidates[0];
      };
      const formatRelocateMessage = (candidate) => {
        const literal = toLatLngLiteral(candidate);
        const distance = relocateState.original
          ? computeDistanceMeters(relocateState.original, candidate)
          : null;
        const coordText = literal
          ? `${literal.lat.toFixed(6)}, ${literal.lng.toFixed(6)}`
          : 'the new spot';
        const distanceText = Number.isFinite(distance)
          ? ` (~${Math.round(distance)}m from saved)`
          : '';
        relocateMessage.textContent = `Pin moved to ${coordText}${distanceText}. Update the saved location position?`;
      };
      const updateRelocateConfirmState = (enabled) => {
        if (relocateSaving) return;
        relocateConfirmButton.disabled = !enabled;
        relocateConfirmButton.style.opacity = enabled ? '1' : '0.5';
      };
      const evaluateRelocateInputs = ({ allowSync = true } = {}) => {
        if (relocateInputSync) return;
        const latText = relocateLatInput.value.trim();
        const lngText = relocateLngInput.value.trim();
        const combined = `${latText} ${lngText}`.trim();
        if (combined && /\d+[a-zA-Z]+\d+/.test(combined)) {
          setRelocateStatus('Remove letters inside numbers.', 'error');
          updateRelocateConfirmState(false);
          return;
        }
        const latNums = extractNumbers(latText);
        const lngNums = extractNumbers(lngText);
        let candidate = null;
        let swapped = false;
        let inferenceNote = '';
        if (latNums.length >= 2 || lngNums.length >= 2) {
          const source = latNums.length >= 2 ? latNums : lngNums;
          const parsed = pickLatLngFromNumbers(source);
          if (!parsed) {
            setRelocateStatus('Coordinates look invalid.', 'error');
            updateRelocateConfirmState(false);
            return;
          }
          candidate = { lat: parsed.lat, lng: parsed.lng };
          swapped = parsed.swapped;
          if (allowSync) setRelocateInputs(candidate);
        } else if (latNums.length >= 1 && lngNums.length >= 1) {
          const parsed = pickLatLngFromNumbers([latNums[0], lngNums[0]]);
          if (!parsed) {
            setRelocateStatus('Coordinates look invalid.', 'error');
            updateRelocateConfirmState(false);
            return;
          }
          candidate = { lat: parsed.lat, lng: parsed.lng };
          swapped = parsed.swapped;
          if (allowSync && swapped) setRelocateInputs(candidate);
        } else if (latNums.length >= 1 || lngNums.length >= 1) {
          const base = toLatLngLiteral(relocateState.pending || relocateState.original);
          if (!base) {
            setRelocateStatus('Drag the pin or enter both coordinates.', 'error');
            updateRelocateConfirmState(false);
            return;
          }
          const value = latNums.length ? latNums[0] : lngNums[0];
          const candidates = [];
          if (Math.abs(value) <= 90 && Math.abs(base.lng) <= 180) {
            candidates.push({ candidate: { lat: value, lng: base.lng }, label: 'latitude' });
          }
          if (Math.abs(value) <= 180 && Math.abs(base.lat) <= 90) {
            candidates.push({ candidate: { lat: base.lat, lng: value }, label: 'longitude' });
          }
          if (!candidates.length) {
            setRelocateStatus('Coordinates look invalid.', 'error');
            updateRelocateConfirmState(false);
            return;
          }
          if (candidates.length === 1) {
            candidate = candidates[0].candidate;
            inferenceNote = `Interpreted as ${candidates[0].label}.`;
          } else {
            const distanceA = computeDistanceMeters(MIDTOWN_CENTER, candidates[0].candidate);
            const distanceB = computeDistanceMeters(MIDTOWN_CENTER, candidates[1].candidate);
            const pickFirst = !Number.isFinite(distanceA)
              || (Number.isFinite(distanceB) && distanceA <= distanceB);
            const chosen = pickFirst ? candidates[0] : candidates[1];
            candidate = chosen.candidate;
            inferenceNote = `Interpreted as ${chosen.label}.`;
          }
          if (allowSync) setRelocateInputs(candidate);
        } else {
          const fallback = toLatLngLiteral(relocateState.pending || relocateState.original);
          if (fallback) {
            relocateState.pending = fallback;
            if (allowSync) setRelocateInputs(fallback);
            formatRelocateMessage(fallback);
            setRelocateStatus('', 'info');
            updateRelocateConfirmState(true);
            return;
          }
          setRelocateStatus('Enter coordinates to relocate.', 'error');
          updateRelocateConfirmState(false);
          return;
        }
        if (Math.abs(candidate.lat) > 90 || Math.abs(candidate.lng) > 180) {
          setRelocateStatus('Coordinates are outside valid ranges.', 'error');
          updateRelocateConfirmState(false);
          return;
        }
        relocateState.pending = { ...candidate };
        formatRelocateMessage(candidate);
        const distance = computeDistanceMeters(MIDTOWN_CENTER, candidate);
        const warningText = Number.isFinite(distance) && distance > MIDTOWN_RADIUS_METERS
          ? `Outside NYC radius (~${(distance / 1609.34).toFixed(1)} mi from Midtown).`
          : '';
        const swapText = swapped ? 'Interpreted as [lng, lat].' : '';
        const combinedWarning = [swapText, inferenceNote, warningText].filter(Boolean).join(' ');
        setRelocateStatus(combinedWarning, combinedWarning ? 'warning' : 'info');
        updateRelocateConfirmState(true);
      };
      showRelocateOverlay = (candidate) => {
        relocateState.promptOpen = true;
        relocateState.pending = toLatLngLiteral(candidate) || candidate;
        relocateInputsDirty = false;
        setRelocateInputs(relocateState.pending);
        formatRelocateMessage(relocateState.pending);
        setRelocateStatus('', 'info');
        evaluateRelocateInputs({ allowSync: false });
        relocateOverlay.style.display = 'flex';
      };
      updateRelocateOverlay = (candidate) => {
        if (!relocateInputsDirty) {
          setRelocateInputs(relocateState.pending || candidate);
          evaluateRelocateInputs({ allowSync: false });
        } else {
          formatRelocateMessage(relocateState.pending || candidate);
        }
      };
      hideRelocateOverlay = () => {
        relocateOverlay.style.display = 'none';
        relocateState.promptOpen = false;
        relocateInputsDirty = false;
        setRelocateStatus('', 'info');
      };
      const resetPinToOriginal = () => {
        const original = toLatLngLiteral(relocateState.original);
        if (!original) return;
        suppressRelocatePrompt();
        if (typeof updateStreetViewForLocation === 'function') {
          updateStreetViewForLocation(original, {
            draggable: true,
            promptRelocate: false,
            recenter: true
          });
        }
      };
      dismissRelocateOverlay = () => {
        if (!relocateState.promptOpen && !relocateState.pending) return;
        relocateState.dismissed = relocateState.pending;
        relocateState.pending = null;
        resetPinToOriginal();
        hideRelocateOverlay();
      };
      relocateLatInput.addEventListener('input', () => {
        relocateInputsDirty = true;
        evaluateRelocateInputs();
      });
      relocateLngInput.addEventListener('input', () => {
        relocateInputsDirty = true;
        evaluateRelocateInputs();
      });
      relocateOverlay.addEventListener('click', (event) => {
        if (event.target === relocateOverlay) {
          relocateKeepButton.click();
        }
      });
      relocateKeepButton.addEventListener('click', () => {
        relocateState.dismissed = relocateState.pending;
        relocateState.pending = null;
        resetPinToOriginal();
        hideRelocateOverlay();
      });
      relocateConfirmButton.addEventListener('click', async () => {
        const literal = toLatLngLiteral(relocateState.pending);
        if (!literal) {
          hideRelocateOverlay();
          return;
        }
        relocateSaving = true;
        relocateConfirmButton.disabled = true;
        relocateKeepButton.disabled = true;
        setRelocateStatus('Saving location...', 'info');
        try {
          const payload = {
            latitude: literal.lat,
            longitude: literal.lng,
            position: { type: 'Point', coordinates: [literal.lng, literal.lat] }
          };
          await patchLocationRecord(locationId, payload);
          relocateState.original = { ...literal };
          relocateState.pending = null;
          relocateState.dismissed = null;
          if (locationData) {
            locationData.position = { type: 'Point', coordinates: [literal.lng, literal.lat] };
            locationData.latitude = literal.lat;
            locationData.longitude = literal.lng;
          }
          suppressRelocatePrompt();
          if (typeof updateStreetViewForLocation === 'function') {
            updateStreetViewForLocation(literal, {
              draggable: true,
              promptRelocate: false,
              recenter: true
            });
          }
          createBubble('Location relocated!');
          hideRelocateOverlay();
        } catch (err) {
          setRelocateStatus(err?.message || 'Failed to relocate location.', 'error');
        } finally {
          relocateSaving = false;
          relocateConfirmButton.disabled = false;
          relocateKeepButton.disabled = false;
          if (relocateOverlay.style.display !== 'none') {
            evaluateRelocateInputs({ allowSync: false });
          }
        }
      });
    }
    // Helper function to truncate URL for display
    const truncateUrl = (url) => {
      if (!url) return '';
      if (url.length <= 80) return url;
      // For Street View URLs, show domain + coordinates + ellipsis
      if (url.includes('google.com/maps/@')) {
        const coordPart = url.split('/@')[1]?.split('/')[0];
        if (coordPart) {
          const coords = coordPart.split(',').slice(0, 2).join(',');
          return `google.com/maps/@${coords}...`;
        }
      }
      // Generic truncation
      return url.substring(0, 80) + '...';
    };
    loadGoogleMapsAPI(apiKey, () => {
      let currentStreetViewUrl = '';
      let map, panorama, marker;
      let hasAppliedInitialSuggestion = false;
      // Initialize map center - use existing streetview_url if available, otherwise use position or default
      let defaultCenter = { lat: 40.7128, lng: -74.0060 }; // NYC default
      let initialPov = { heading: 270, pitch: 0 };
      let initialStreetViewUrl = null;
      if (locationData.streetview_url) {
        try {
          const url = locationData.streetview_url;
          initialStreetViewUrl = url; // Preserve the original URL
          // Robustly parse lat, lng, heading, and pitch from the URL
          const urlParams = url.split('@')[1]?.split('/')[0]?.split(',');
          if (urlParams && urlParams.length >= 2) {
            defaultCenter = { lat: parseFloat(urlParams[0]), lng: parseFloat(urlParams[1]) };
            urlParams.forEach(param => {
              if (param.endsWith('h')) {
                initialPov.heading = parseFloat(param.slice(0, -1));
              } else if (param.endsWith('t')) {
                initialPov.pitch = parseFloat(param.slice(0, -1));
              }
            });
            console.log('Robustly parsed initial POV:', initialPov);
          }
        } catch (e) {
          console.error('Error parsing existing streetview_url:', e);
          // Fallback to original URL if parsing fails, which is already set
        }
      } else if (locationData.position?.coordinates) {
        // Use position data if no street view URL is provided
        defaultCenter = { lat: locationData.position.coordinates[1], lng: locationData.position.coordinates[0] };
      }
      if (!relocateState.original && locationData?.streetview_url) {
        const fallbackOrigin = toLatLngLiteral(defaultCenter);
        if (fallbackOrigin) {
          relocateState.original = { ...fallbackOrigin };
        }
      }
      map = new google.maps.Map(mapDiv, {
        center: defaultCenter,
        zoom: 15,
        streetViewControl: true
      });
      // Initialize Street View with parsed or default values
      panorama = new google.maps.StreetViewPanorama(streetViewDiv, {
        position: defaultCenter,
        pov: initialPov
      });
      map.setStreetView(panorama);
      // Track maps instances for cleanup
      const mapsInstance = { map, panorama, modal };
      mapsInstances.push(mapsInstance);
      // Generate initial Street View URL and enable set button immediately
      const generateStreetViewURL = (position, pov) => {
        const lat = position.lat();
        const lng = position.lng();
        return `https://www.google.com/maps/@${lat},${lng},3a,75y,${pov.heading}h,${pov.pitch}t/data=!3m6!1e1!3m4!1s${panorama.getLocation()?.pano || 'unknown'}!2e0!7i16384!8i8192`;
      };
      // Enhanced URL generation - try multiple approaches to always enable the button
      const tryGenerateUrl = () => {
        if (initialStreetViewUrl) {
          currentStreetViewUrl = initialStreetViewUrl;
          urlDisplay.textContent = truncateUrl(currentStreetViewUrl);
          setButton.disabled = false;
          setButton.style.opacity = '1';
          console.log('Using initial Street View URL:', currentStreetViewUrl);
          return true;
        }
        if (panorama.getLocation()) {
          currentStreetViewUrl = generateStreetViewURL(panorama.getLocation().latLng, panorama.getPov());
          urlDisplay.textContent = truncateUrl(currentStreetViewUrl);
          setButton.disabled = false;
          setButton.style.opacity = '1';
          console.log('Generated URL from panorama location:', currentStreetViewUrl);
          return true;
        }
        // Fallback: generate URL from default center even without Street View data
        const lat = defaultCenter.lat;
        const lng = defaultCenter.lng;
        const heading = initialPov.heading;
        const pitch = initialPov.pitch;
        currentStreetViewUrl = `https://www.google.com/maps/@${lat},${lng},3a,75y,${heading}h,${pitch}t/data=!3m6!1e1!3m4!1s-fallback-pano!2e0!7i16384!8i8192`;
        urlDisplay.textContent = truncateUrl(currentStreetViewUrl);
        setButton.disabled = false;
        setButton.style.opacity = '1';
        console.log('Generated fallback URL from coordinates:', currentStreetViewUrl);
        return true;
      };
      // Try immediately with retry limit
      let retryCount = 0;
      const maxRetries = 3;
      const attemptGenerate = () => {
        if (tryGenerateUrl()) {
          return; // Success, stop trying
        }
        retryCount++;
        if (retryCount < maxRetries) {
          console.log(`[streetview.js] Retry ${retryCount}/${maxRetries} for URL generation`);
          setTimeout(attemptGenerate, 2000);
        } else {
          console.warn('[streetview.js] Max retries reached for URL generation');
        }
      };
      setTimeout(attemptGenerate, 500);
      // Also try when panorama loads
      panorama.addListener('position_changed', () => {
        if (!currentStreetViewUrl || currentStreetViewUrl.includes('fallback')) {
          tryGenerateUrl();
        }
      });
      const streetViewService = new google.maps.StreetViewService();
      const shouldPromptRelocate = () => {
        if (!locationId || !isYourPeerRedirectEnabled()) return false;
        if (!relocateState.original) return false;
        if (Date.now() < relocateState.suppressPromptUntil) return false;
        return true;
      };
      const isDismissedCandidate = (candidate) => {
        if (!relocateState.dismissed) return false;
        const distance = computeDistanceMeters(relocateState.dismissed, candidate);
        return Number.isFinite(distance) && distance < RELOCATE_PROMPT_DISTANCE_METERS;
      };
      const maybePromptRelocate = (candidate, { allowPrompt = true, forcePrompt = false } = {}) => {
        if (!allowPrompt) return;
        const literal = toLatLngLiteral(candidate);
        if (!literal) return;
        if (!shouldPromptRelocate()) return;
        if (!forcePrompt) {
          const distance = computeDistanceMeters(relocateState.original, literal);
          if (!Number.isFinite(distance) || distance < RELOCATE_PROMPT_DISTANCE_METERS) return;
          if (isDismissedCandidate(literal)) return;
          const now = Date.now();
          if (now - relocateState.lastPromptAt < 800) return;
          relocateState.lastPromptAt = now;
        } else {
          relocateState.lastPromptAt = Date.now();
        }
        if (relocateState.promptOpen) {
          relocateState.pending = literal;
          updateRelocateOverlay(literal);
          return;
        }
        relocateState.pending = literal;
        showRelocateOverlay(literal);
      };
      const requestPanorama = (targetLatLng, referenceLatLng = targetLatLng) => {
        if (!targetLatLng) return;
        streetViewService.getPanorama({
          location: targetLatLng,
          radius: 50,
          source: google.maps.StreetViewSource.OUTDOOR
        }, (data, status) => {
          if (status === 'OK') {
            panorama.setPosition(data.location.latLng);
            let heading = panorama.getPov().heading;
            if (google.maps.geometry?.spherical?.computeHeading) {
              heading = google.maps.geometry.spherical.computeHeading(data.location.latLng, referenceLatLng);
            }
            panorama.setPov({ heading, pitch: 0 });
            const lat = data.location.latLng.lat();
            const lng = data.location.latLng.lng();
            const pov = panorama.getPov();
            currentStreetViewUrl = `https://www.google.com/maps/@${lat},${lng},3a,75y,${pov.heading}h,${pov.pitch}t/data=!3m6!1e1!3m4!1s${data.location.pano}!2e0!7i16384!8i8192`;
            urlDisplay.textContent = truncateUrl(currentStreetViewUrl);
            setButton.disabled = false;
            setButton.style.opacity = '1';
          } else {
            panorama.setPosition(referenceLatLng);
            urlDisplay.textContent = 'Street View not available at this location';
            setButton.disabled = true;
            setButton.style.opacity = '0.5';
          }
        });
      };
      updateStreetViewForLocation = (referenceLatLng, { draggable = false, promptRelocate = true, recenter = false } = {}) => {
        if (!referenceLatLng) return;
        if (marker) {
          google.maps.event.clearInstanceListeners(marker);
          marker.setMap(null);
        }
        const markerDraggable = Boolean(draggable && canEditLocation);
        marker = new google.maps.Marker({
          position: referenceLatLng,
          map,
          draggable: markerDraggable
        });
        if (recenter && map) {
          if (typeof map.panTo === 'function') {
            map.panTo(referenceLatLng);
          } else if (typeof map.setCenter === 'function') {
            map.setCenter(referenceLatLng);
          }
        }
        requestPanorama(referenceLatLng);
        maybePromptRelocate(referenceLatLng, { allowPrompt: promptRelocate });
        if (markerDraggable) {
          marker.addListener('dragend', () => {
            const newPosition = marker.getPosition();
            requestPanorama(newPosition);
            maybePromptRelocate(newPosition, { forcePrompt: true });
          });
        }
      };
      const handlePlaceSelection = (place, options = {}) => {
        if (!place || !place.geometry) return;
        if (place.geometry.viewport) {
          map.fitBounds(place.geometry.viewport);
        } else if (place.geometry.location) {
          map.setCenter(place.geometry.location);
          map.setZoom(17);
        }
        if (place.geometry.location) {
          const promptRelocate = options.promptRelocate !== false;
          updateStreetViewForLocation(place.geometry.location, { draggable: true, promptRelocate });
        }
      };
      const isPlacesStatusOk = (status) => {
        const okStatus = google.maps.places?.PlacesServiceStatus?.OK;
        return status === okStatus || status === 'OK';
      };
      const placesService = new google.maps.places.PlacesService(map);
      const selectFirstSuggestion = (query) => {
        if (!query) return;
        const autocompleteService = new google.maps.places.AutocompleteService();
        autocompleteService.getPlacePredictions({ input: query }, (predictions, status) => {
          if (!isPlacesStatusOk(status) || !predictions || !predictions.length) {
            return;
          }
          const [firstPrediction] = predictions;
          placesService.getDetails({ placeId: firstPrediction.place_id }, (place, detailStatus) => {
            if (!isPlacesStatusOk(detailStatus) || !place) {
              return;
            }
            handlePlaceSelection(place, { promptRelocate: false });
          });
        });
      };
      // Search functionality
      const autocomplete = new google.maps.places.Autocomplete(searchInput);
      autocomplete.bindTo('bounds', map);
      autocomplete.addListener('place_changed', () => {
        const place = autocomplete.getPlace();
        handlePlaceSelection(place);
      });
      if (streetAddress && !hasAppliedInitialSuggestion) {
        hasAppliedInitialSuggestion = true;
        setTimeout(() => selectFirstSuggestion(streetAddress), 500);
      }
      // Click on map to set Street View
      map.addListener('click', (event) => {
        updateStreetViewForLocation(event.latLng, { draggable: true });
      });
      // Update URL when Street View changes
      panorama.addListener('pov_changed', () => {
        if (currentStreetViewUrl && panorama.getLocation()) {
          const position = panorama.getLocation().latLng;
          const pov = panorama.getPov();
          const lat = position.lat();
          const lng = position.lng();
          currentStreetViewUrl = `https://www.google.com/maps/@${lat},${lng},3a,75y,${pov.heading}h,${pov.pitch}t/data=!3m6!1e1!3m4!1s${panorama.getLocation().pano}!2e0!7i16384!8i8192`;
          urlDisplay.textContent = truncateUrl(currentStreetViewUrl);
        }
      });
      // Set button click handler
      setButton.onclick = () => {
        // Ensure we always have a URL before proceeding
        if (!currentStreetViewUrl) {
          tryGenerateUrl();
        }
        if (currentStreetViewUrl) {
          // Debug: List all input and textarea elements
          console.log('=== DEBUG: All input elements ===');
          document.querySelectorAll('input').forEach((input, i) => {
            console.log(`Input ${i}:`, {
              tagName: input.tagName,
              type: input.type,
              className: input.className,
              placeholder: input.placeholder,
              id: input.id,
              name: input.name,
              element: input
            });
          });
          console.log('=== DEBUG: All textarea elements ===');
          document.querySelectorAll('textarea').forEach((textarea, i) => {
            console.log(`Textarea ${i}:`, {
              tagName: textarea.tagName,
              className: textarea.className,
              placeholder: textarea.placeholder,
              id: textarea.id,
              name: textarea.name,
              element: textarea
            });
          });
          // Find and fill the input field using bubble paste method
          const streetViewInput = document.querySelector(
            'input[placeholder*="google map streetview url"], ' +
            'input[placeholder*="streetview"], ' +
            'textarea[placeholder*="google map streetview url"], ' +
            'textarea[placeholder*="streetview"], ' +
            'input.Input[placeholder*="Enter the google map streetview url"], ' +
            'input.Input-fluid[placeholder*="Enter the google map streetview url"], ' +
            'textarea.TextArea-fluid[placeholder*="Enter the google map streetview url"], ' +
            'textarea.TextArea-fluid'
          );
          console.log('=== DEBUG: Selected element ===');
          console.log('streetViewInput found:', !!streetViewInput);
          if (streetViewInput) {
            console.log('Element details:', {
              tagName: streetViewInput.tagName,
              className: streetViewInput.className,
              placeholder: streetViewInput.placeholder,
              id: streetViewInput.id,
              name: streetViewInput.name,
              value: streetViewInput.value,
              disabled: streetViewInput.disabled,
              readOnly: streetViewInput.readOnly,
              element: streetViewInput
            });
          }
          if (streetViewInput) {
            // Comprehensive approach for React-controlled or special input fields
            streetViewInput.focus();
            // Try React-style property setting if available
            const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
            // Clear the field first
            nativeInputValueSetter.call(streetViewInput, '');
            streetViewInput.dispatchEvent(new Event('input', { bubbles: true }));
            // Set the new value using native setter
            nativeInputValueSetter.call(streetViewInput, currentStreetViewUrl);
            // Simulate user editing by adding a character and removing it
            setTimeout(() => {
              // Add a space at the end (simulating user typing)
              const currentValue = streetViewInput.value;
              nativeInputValueSetter.call(streetViewInput, currentValue + ' ');
              streetViewInput.dispatchEvent(new Event('input', { bubbles: true }));
              streetViewInput.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: ' ' }));
              // Remove the space (simulating user deleting)
              setTimeout(() => {
                nativeInputValueSetter.call(streetViewInput, currentValue);
                streetViewInput.dispatchEvent(new Event('input', { bubbles: true }));
                streetViewInput.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Backspace' }));
                // Fire all events after the edit simulation
                const events = [
                  new Event('input', { bubbles: true }),
                  new Event('change', { bubbles: true }),
                  new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }),
                  new KeyboardEvent('keyup', { bubbles: true, key: 'Enter' }),
                  new Event('blur', { bubbles: true })
                ];
                events.forEach(event => streetViewInput.dispatchEvent(event));
              }, 100);
            }, 50);
            createBubble('Street View URL Pasted!');
            console.log('[streetview.js] Street View URL pasted with React-style setter and comprehensive events:', currentStreetViewUrl);
            // Auto-click OK button after a short delay to make it stick
            console.log('[streetview.js] Setting up OK button auto-click timeout');
            setTimeout(() => {
              console.log('[streetview.js] OK button timeout fired, searching for button...');
              const okButton = document.querySelector('button.Button-primary');
              console.log('[streetview.js] Looking for OK button:', okButton, okButton?.textContent);
              if (okButton && okButton.textContent.trim() === 'OK') {
                console.log('[streetview.js] Auto-clicking OK button to make URL stick');
                okButton.click();
                createBubble('OK Clicked!');
              } else {
                console.warn('[streetview.js] OK button not found or text mismatch');
              }
            }, 500);
            // Close the modal after successful paste
            setTimeout(() => {
              closeModal();
              console.log('Street View modal closed after successful paste');
            }, 1000);
          } else {
            // Fallback to clipboard if input not found
            navigator.clipboard.writeText(currentStreetViewUrl).then(() => {
              createBubble('Copied to clipboard!');
              console.log('Street View URL copied to clipboard:', currentStreetViewUrl);
            }).catch(err => {
              console.error('Failed to copy to clipboard:', err);
              createBubble('Street View URL Set!');
            });
            // Close the modal even in fallback case
            setTimeout(() => {
              closeModal();
              console.log('Street View modal closed after clipboard copy');
            }, 1500);
          }
          // Auto-click OK button when user clicks it - set up persistent listener
          if (!window.doobneekOkClickerActive) {
            window.doobneekOkClickerActive = true;
            globalClickHandler = function(e) {
              const okButton = e.target.closest('button.Button-primary');
              if (okButton && okButton.textContent.trim() === 'OK') {
                console.log('OK button clicked, setting up auto-clickers');
                // Click YES after delay - only if redirect is enabled
                setTimeout(() => {
                  if (!isYourPeerRedirectEnabled()) {
                    console.log('=== SKIPPING YES BUTTON — redirect not enabled ===');
                    return;
                  }
                  console.log('=== AUTO-CLICKING YES BUTTON ===');
                  const yesButton = document.querySelector('button.Button-primary.Button-fluid');
                  if (yesButton && yesButton.textContent.trim() === 'YES') {
                    console.log('Clicking YES button');
                    yesButton.click();
                    createBubble('YES Clicked!');
                  } else {
                    const anyYesButton = Array.from(document.querySelectorAll('button')).find(btn =>
                      btn.textContent.trim().toUpperCase() === 'YES'
                    );
                    if (anyYesButton) {
                      console.log('Clicking YES button (fallback)');
                      anyYesButton.click();
                      createBubble('YES Clicked!');
                    }
                  }
                  // Click "Go to Next Section" after YES - only if URL ends with /thanks
                  setTimeout(() => {
                    console.log('=== AUTO-CLICKING GO TO NEXT SECTION ===');
                    // Check if current URL ends with /thanks
                    const currentUrl = window.location.href;
                    if (!currentUrl.endsWith('/thanks')) {
                      console.log('Skipping Go to Next Section - URL does not end with /thanks. Current URL:', currentUrl);
                      return;
                    }
                    const nextButtonSelectors = [
                      'button.Button.mt-4.Button-primary.Button-fluid',
                      'button.Button-primary.Button-fluid'
                    ];
                    let nextButton = null;
                    for (const selector of nextButtonSelectors) {
                      const buttons = document.querySelectorAll(selector);
                      for (const btn of buttons) {
                        const text = btn.textContent.trim().toUpperCase();
                        if (text.includes('NEXT') || text.includes('GO TO') || text.includes('CONTINUE')) {
                          nextButton = btn;
                          break;
                        }
                      }
                      if (nextButton) break;
                    }
                    if (nextButton) {
                      console.log('Clicking Go to Next Section button - URL ends with /thanks');
                      nextButton.click();
                      createBubble('Go to Next Section Clicked!');
                    } else {
                      const allButtons = document.querySelectorAll('button, a');
                      for (const btn of allButtons) {
                        const text = btn.textContent.trim().toLowerCase();
                        if (text.includes('go to next') || text.includes('next section') || text.includes('continue')) {
                          console.log('Clicking next button (fallback) - URL ends with /thanks:', text);
                          btn.click();
                          createBubble('Next Button Found!');
                          break;
                        }
                      }
                    }
                  }, 1500); // Wait 1.5s after YES
                }, 1000); // Wait 1s after OK
              }
            };
            document.addEventListener('click', globalClickHandler);
          }
          closeModal();
        }
      };
    });
  }
  // Clean up maps instances for a specific modal
  function cleanupModalMaps(targetModal) {
    console.log('[streetview.js] Cleaning up maps for modal');
    const index = mapsInstances.findIndex(instance => instance.modal === targetModal);
    if (index > -1) {
      const instance = mapsInstances[index];
      try {
        // Properly dispose of Google Maps objects
        if (instance.panorama) {
          google.maps.event.clearInstanceListeners(instance.panorama);
          instance.panorama = null;
        }
        if (instance.map) {
          google.maps.event.clearInstanceListeners(instance.map);
          instance.map = null;
        }
      } catch (e) {
        console.warn('[streetview.js] Error cleaning up maps:', e);
      }
      mapsInstances.splice(index, 1);
    }
  }
  // Clean up all active modals and maps
  function cleanupMapsAndModals() {
    console.log('[streetview.js] Cleaning up all maps and modals');
    // Clean up all maps instances
    mapsInstances.forEach(instance => {
      try {
        if (instance.panorama) {
          google.maps.event.clearInstanceListeners(instance.panorama);
        }
        if (instance.map) {
          google.maps.event.clearInstanceListeners(instance.map);
        }
      } catch (e) {
        console.warn('[streetview.js] Error cleaning up maps instance:', e);
      }
    });
    mapsInstances.length = 0;
    // Clean up all active modals
    activeModals.forEach(modal => {
      try {
        if (modal.parentNode) {
          modal.remove();
        }
      } catch (e) {
        console.warn('[streetview.js] Error removing modal:', e);
      }
    });
    activeModals.length = 0;
    // Clean up injected scripts
    injectedScripts.forEach(script => {
      try {
        if (script.parentNode) {
          script.remove();
        }
      } catch (e) {
        console.warn('[streetview.js] Error removing script:', e);
      }
    });
    injectedScripts.length = 0;
    // Remove any remaining doobneek elements
    document.querySelectorAll('[data-doobneek-modal]').forEach(el => el.remove());
    document.querySelectorAll('[data-doobneek-script]').forEach(el => el.remove());
    document.querySelectorAll('#doobneek-loading-banner').forEach(el => el.remove());
    document.querySelectorAll('[data-doobneek-streetview-reopen]').forEach(el => el.remove());
    streetViewReopenButton = null;
  }
  // Cleanup function to prevent memory leaks
  function cleanup() {
    console.log('[streetview.js] Cleaning up all resources');
    if (observer) {
      observer.disconnect();
      observer = null;
    }
    if (urlCheckInterval) {
      clearInterval(urlCheckInterval);
      urlCheckInterval = null;
    }
    if (globalClickHandler) {
      document.removeEventListener('click', globalClickHandler);
      globalClickHandler = null;
    }
    if (popstateHandler) {
      window.removeEventListener('popstate', popstateHandler);
      popstateHandler = null;
    }
    if (beforeunloadHandler) {
      window.removeEventListener('beforeunload', beforeunloadHandler);
      beforeunloadHandler = null;
    }
    if (visibilityHandler) {
      document.removeEventListener('visibilitychange', visibilityHandler);
      visibilityHandler = null;
    }
    if (pagehideHandler) {
      window.removeEventListener('pagehide', pagehideHandler);
      pagehideHandler = null;
    }
    // Clean up all maps and modals
    cleanupMapsAndModals();
    // Restore history methods
    if (originalPushState) {
      history.pushState = originalPushState;
      originalPushState = null;
    }
    if (originalReplaceState) {
      history.replaceState = originalReplaceState;
      originalReplaceState = null;
    }
    // Reset global flags
    window.doobneekOkClickerActive = false;
    window.doobneekHistoryOverridden = false;
    window.doobneekHistoryBlocked = false;
    // Clean up back navigation prevention
    if (window.doobneekPopstateHandler) {
      window.removeEventListener('popstate', window.doobneekPopstateHandler);
      window.doobneekPopstateHandler = null;
    }
    // Clear global references
    if (window.createStreetViewPicker) {
      delete window.createStreetViewPicker;
    }
    window.doobneekStreetViewActive = false;
  }
  // Add cleanup on page unload
  beforeunloadHandler = cleanup;
  window.addEventListener('beforeunload', beforeunloadHandler);
  // Add cleanup on page visibility change (helps with back/forward navigation)
  visibilityHandler = () => {
    if (document.hidden) {
      console.log('[streetview.js] Page hidden, preserving Street View overlay');
    }
  };
  document.addEventListener('visibilitychange', visibilityHandler);
  // Add cleanup on page hide (iOS Safari and some mobile browsers)
  pagehideHandler = cleanup;
  window.addEventListener('pagehide', pagehideHandler);
  // Force cleanup on navigation start
  window.addEventListener('beforeunload', () => {
    console.log('[streetview.js] beforeunload triggered, forcing cleanup');
    cleanup();
  });
  // Add cleanup on extension unload (if content script is reinjected)
  if (window.doobneekStreetViewLoaded) {
    console.log('[streetview.js] Script already loaded, cleaning up previous instance');
    cleanup();
  }
  window.doobneekStreetViewLoaded = true;
  // Add pageshow handler for bfcache
  window.addEventListener('pageshow', function(event) {
    if (event.persisted) {
      console.log('[streetview.js] Page restored from bfcache, re-initializing.');
      // Clean up any previous state and re-initialize
      cleanup();
      init();
    }
  });
  // Initial execution
  if (isBackForwardNavigation) {
    setTimeout(init, 1000);
  } else {
    init();
  }
  window.createStreetViewPicker = createStreetViewPicker;
})();

