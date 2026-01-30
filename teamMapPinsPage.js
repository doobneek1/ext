(() => {
  if (window.__gghostTeamMapPinsBootstrap) return;
  window.__gghostTeamMapPinsBootstrap = true;
  const API_BASE = 'https://w6pkliozjh.execute-api.us-east-1.amazonaws.com/prod/locations';
  const SERVICE_API_BASE = 'https://w6pkliozjh.execute-api.us-east-1.amazonaws.com/prod/services';
  const CLOSE_LOCATION_EVENT = 'COVID19';
  const SERVICE_TAXONOMY_EVENT = 'gghost-open-service-taxonomy';
  const HOST_RE = /(^|\.)gogetta\.nyc$/i;
  const PATH_RE = /^\/team\/?$/;
  const hidePref = localStorage.getItem('gghostTeamMapPinsHideDefault');
  const HIDE_DEFAULT_MARKERS = window.__gghostTeamMapPinsHideDefault === true
    || (window.__gghostTeamMapPinsHideDefault !== false && hidePref !== 'false');
  const BLOCK_FULLSTORY = window.__gghostTeamMapPinsBlockFullStory !== false
    && localStorage.getItem('gghostTeamMapPinsBlockFullStory') !== 'false';
  const RECENCY_THRESHOLDS = {
    greenMonths: 6,
    orangeMonths: 12
  };
  const STALE_CACHE_TTL_MS = 6000;
  const PAGE_LOCATION_CACHE_KEY = 'gghost-page-location-cache';
  const SEARCH_INPUT_SELECTOR = 'input.form-control[placeholder*="organization name"]';
  const SEARCH_RESULT_SELECTOR = 'li.Dropdown-item.list-group-item[role="menuitem"]';
  const SEARCH_MATCH_MIN_SCORE = 70;
  const SEARCH_FILTERS_STORAGE_KEY = 'gghost-search-filters';
  const SEARCH_QUERY_STORAGE_KEY = 'gghost-search-query';
  const CUSTOM_MATCH_MIN_SCORE = 55;
  const CUSTOM_RESULTS_LIMIT = 25;
  const SEARCH_OVERLAY_HIDE_DELAY_MS = 160;
  const FIREBASE_BASE_URL = 'https://streetli-default-rtdb.firebaseio.com/';
  const FIREBASE_AUTH_TOKEN_STORAGE_KEY = 'gghostFirebaseAuthToken';
  const NOTES_CACHE_TTL_MS = 2 * 60 * 1000;
  const SITE_VISIT_CACHE_TTL_MS = 2 * 60 * 1000;
  const SITE_VISIT_RING_COLOR = '#f97316';
  const UPDATES_OVERLAY_ID = 'gghost-team-updates-overlay';
  const UPDATES_TOGGLE_ID = 'gghost-team-updates-toggle';
  const UPDATES_PANEL_ID = 'gghost-team-updates-panel';
  const STATS_WRITE_MAX_CONCURRENCY = 6;
  const NYC_BOUNDS = {
    north: 40.9176,
    south: 40.4774,
    west: -74.2591,
    east: -73.7004
  };
  const MIDTOWN_CENTER = { lat: 40.7549, lng: -73.9840 };
  const PREFERRED_CENTER_STORAGE_KEY = 'gghostPreferredCenter';
  const PREFERRED_CENTER_OVERRIDE_KEY = 'gghostPreferredCenterOverride';
  const RECENTER_BUTTON_ID = 'gghost-recenter-button';
  const RECENTER_OVERLAY_ID = 'gghost-recenter-overlay';
  const RECENTER_OVERLAY_INPUT_ID = 'gghost-recenter-address';
  const RECENTER_OVERLAY_MESSAGE_ID = 'gghost-recenter-message';
  const RECENTER_OVERLAY_SUBMIT_ID = 'gghost-recenter-submit';
  const RECENTER_OVERLAY_CANCEL_ID = 'gghost-recenter-cancel';
  const RECENTER_OVERLAY_CLEAR_ID = 'gghost-recenter-clear';
  const PREFERRED_MARKER_LABEL = 'U r here';
  const RECENTER_CAPTURE_TTL_MS = 2 * 60 * 1000;
  const RECENTER_INITIAL_GRACE_MS = 10000;
  const RECENTER_INITIAL_MAX_ATTEMPTS = 6;
  const UUID_RE = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
  const DEFAULT_SEARCH_FILTERS = {
    field: 'org',
    taxonomy: '',
    service: '',
    age: 'any'
  };
  const SEARCH_FIELD_OPTIONS = [
    { value: 'org', label: 'Organization name' },
    { value: 'location', label: 'Location name' },
    { value: 'service', label: 'Service' },
    { value: 'taxonomy', label: 'Taxonomy' },
    { value: 'address', label: 'Address' },
    { value: 'any', label: 'Any field' }
  ];
  const AGE_GROUP_OPTIONS = [
    { value: 'any', label: 'Any age' },
    { value: 'child', label: 'Children' },
    { value: 'youth', label: 'Youth' },
    { value: 'adult', label: 'Adults' },
    { value: 'senior', label: 'Seniors' }
  ];
  const AGE_GROUP_KEYWORDS = {
    child: ['child', 'children', 'kid', 'kids', 'toddler', 'infant', 'pediatric', 'family'],
    youth: ['youth', 'teen', 'teens', 'teenager', 'adolescent', 'young adult'],
    adult: ['adult', 'adults', 'working age'],
    senior: ['senior', 'seniors', 'elder', 'elderly', 'older adult', 'aging']
  };
  const debugState = {
    active: false,
    mapReady: false,
    lastFetchAt: null,
    lastFetchCount: 0,
    lastError: null,
    lastMinimapFetchAt: null,
    lastMinimapFetchCount: 0,
    lastMinimapFetchCenter: null,
    lastAttachAttempt: null,
    lastAttachSource: null,
    lastMapCapture: null,
    lastMapCaptureSource: null
  };
  const state = {
    active: false,
    map: null,
    markers: new Map(),
    listeners: [],
    pendingTimer: null,
    fetchAbort: null,
    lastRequestKey: null,
    lastLocations: null,
    lastLocationsAt: 0,
    lastLocationsKey: null,
    searchEntries: [],
    mapPoll: null,
    infoWindow: null,
    isDragging: false,
    activeInfoToken: null,
    searchMarker: null,
    pendingFocus: null,
    pendingMinimapLocations: null,
    clickOverlay: null,
    clickOverlayReady: false,
    pendingMinimapGeocode: [],
    preferredMarker: null,
    preferredMarkerListener: null,
    pendingPreferredCenter: null
  };
  const searchState = {
    observer: null,
    input: null,
    inputGroup: null,
    decoratePending: false,
    overlay: null,
    overlayHideTimer: null,
    overlayToken: null,
    resultsContainer: null,
    filterButton: null,
    filterButtonWrap: null,
    filterPanel: null,
    filterControls: null,
    filters: { ...DEFAULT_SEARCH_FILTERS },
    closeFilterHandler: null,
    viewportHandler: null,
    clearButton: null,
    clearButtonWrap: null,
    savedQuery: '',
    savedQueryApplied: false,
    loadedSettings: false
  };
  const notesState = {
    overlay: null,
    header: null,
    body: null,
    activeUuid: null,
    cache: new Map(),
    pending: new Map()
  };
  const siteVisitState = {
    cache: new Map(),
    pending: new Map()
  };
  const updatesState = {
    container: null,
    panel: null,
    summary: null,
    chart: null,
    open: false,
    lastSignature: null
  };
  const recenterState = {
    outsideNyc: false,
    initialCenterChecked: false,
    initialCenterAttempts: 0,
    initialCenterStart: 0,
    captureNextLocation: false,
    captureExpiresAt: 0,
    button: null
  };
  const geoOverrideState = {
    installed: false,
    original: null,
    watchers: new Map(),
    watchId: 0
  };
  const statsWriteInFlight = new Map();
  const statsWriteOk = new Set();
  const statsQueue = [];
  let statsActiveCount = 0;
  let firebaseWriteDisabled = false;
  let firebaseWriteDisableLogged = false;
  let firebaseWriteMissingTokenLogged = false;
  window.__gghostTeamMapPinsStatus = debugState;
  window.__gghostTeamMapPinsBlockFullStory = BLOCK_FULLSTORY;
  initMinimapBridge();
  installPageLocationCacheBridge();
  installGeolocationOverride();
  function isTeamMapPage() {
    return HOST_RE.test(location.hostname) && PATH_RE.test(location.pathname);
  }
  function hookHistory() {
    if (window.__gghostTeamMapPinsHistoryWrapped) return;
    window.__gghostTeamMapPinsHistoryWrapped = true;
    const onChange = () => handleLocationChange();
    const pushState = history.pushState;
    history.pushState = function () {
      pushState.apply(this, arguments);
      onChange();
    };
    const replaceState = history.replaceState;
    history.replaceState = function () {
      replaceState.apply(this, arguments);
      onChange();
    };
    window.addEventListener('popstate', onChange);
  }
  function handleLocationChange() {
    if (isTeamMapPage()) {
      start();
    } else {
      stop();
    }
  }
  function start() {
    if (state.active) return;
    state.active = true;
    debugState.active = true;
    applyPreferredOverride();
    ensureMapsReady().then((ready) => {
      if (!ready || !state.active) return;
      hookMapConstructor();
      hookMapPrototype();
      hookMapsEventSystem();
      if (BLOCK_FULLSTORY) {
        patchFullStory();
      }
      initSearchBridge();
      tryAttachExisting().then((attached) => {
        if (attached) return;
        state.mapPoll = setInterval(() => {
          void tryAttachExisting();
        }, 500);
      });
    });
  }
  function stop() {
    state.active = false;
    debugState.active = false;
    state.lastRequestKey = null;
    if (state.mapPoll) {
      clearInterval(state.mapPoll);
      state.mapPoll = null;
    }
    if (state.pendingTimer) {
      clearTimeout(state.pendingTimer);
      state.pendingTimer = null;
    }
    if (state.fetchAbort) {
      state.fetchAbort.abort();
      state.fetchAbort = null;
    }
    clearPreferredGeolocationWatches();
    closeNotesOverlay(true);
    detachSearchBridge();
    state.searchEntries = [];
    resetRecenterState();
    detachMap();
    clearMarkers();
    removeUpdatesOverlay();
  }
  function initMinimapBridge() {
    if (window.__gghostMinimapBridge) return;
    window.__gghostMinimapBridge = true;
    window.addEventListener('gghost-minimap-focus', handleMinimapFocus);
    window.addEventListener('gghost-minimap-clear', handleMinimapClear);
    window.addEventListener('gghost-minimap-locations', handleMinimapLocations);
    window.addEventListener('gghost-minimap-geocode', handleMinimapGeocode);
    const pending = window.__gghostMinimapPendingFocus;
    if (pending && Number.isFinite(Number(pending.lat)) && Number.isFinite(Number(pending.lng))) {
      try {
        handleMinimapFocus({ detail: pending });
      } finally {
        window.__gghostMinimapPendingFocus = null;
      }
    }
    const pendingAddress = window.__gghostMinimapPendingAddress;
    if (pendingAddress && String(pendingAddress.address || '').trim()) {
      try {
        handleMinimapGeocode({ detail: pendingAddress });
      } finally {
        window.__gghostMinimapPendingAddress = null;
      }
    }
  }
  function installPageLocationCacheBridge() {
    if (window.__gghostPageLocationCacheBridge) return;
    window.__gghostPageLocationCacheBridge = true;
    const apiRe = /https:\/\/w6pkliozjh\.execute-api\.us-east-1\.amazonaws\.com\/prod\/locations\/([a-f0-9-]+)/i;
    const getCurrentLocationUuid = () => {
      const match = location.pathname.match(/\/(?:team|find)\/location\/([a-f0-9-]{12,36})/i);
      return match ? match[1] : null;
    };
    const shouldCache = (uuid) => {
      const pageUuid = getCurrentLocationUuid();
      return pageUuid && uuid && pageUuid.toLowerCase() === uuid.toLowerCase();
    };
    const writeCache = (uuid, data) => {
      if (!uuid || !data || typeof data !== 'object') return;
      try {
        localStorage.setItem(PAGE_LOCATION_CACHE_KEY, JSON.stringify({
          uuid,
          timestamp: Date.now(),
          data
        }));
      } catch (err) {
        // ignore storage failures
      }
    };
    const handlePayload = (uuid, data) => {
      if (!shouldCache(uuid)) return;
      const dataId = String(data?.id || '').toLowerCase();
      if (dataId && dataId !== uuid.toLowerCase()) return;
      writeCache(uuid, data);
    };
    if (!window.__gghostLocationCacheFetchWrapped) {
      window.__gghostLocationCacheFetchWrapped = true;
      const originalFetch = window.fetch;
      if (typeof originalFetch === 'function') {
        window.fetch = function () {
          const url = typeof arguments[0] === 'string' ? arguments[0] : arguments[0]?.url;
          const match = url && url.match(apiRe);
          const uuid = match ? match[1] : null;
          const result = originalFetch.apply(this, arguments);
          if (uuid) {
            result.then((res) => {
              if (!res || !res.ok) return;
              res.clone().json().then((data) => {
                if (data) handlePayload(uuid, data);
              }).catch(() => {});
            }).catch(() => {});
          }
          return result;
        };
      }
    }
    if (!window.__gghostLocationCacheXhrWrapped && window.XMLHttpRequest) {
      window.__gghostLocationCacheXhrWrapped = true;
      const proto = window.XMLHttpRequest.prototype;
      const originalOpen = proto.open;
      const originalSend = proto.send;
      proto.open = function () {
        this.__gghostLocationCacheUrl = arguments[1];
        return originalOpen.apply(this, arguments);
      };
      proto.send = function () {
        const url = this.__gghostLocationCacheUrl;
        const match = url && url.match(apiRe);
        const uuid = match ? match[1] : null;
        if (uuid) {
          this.addEventListener('load', () => {
            if (this.status < 200 || this.status >= 300) return;
            let payload = null;
            try {
              if (this.responseType === 'json') {
                payload = this.response;
              } else if (typeof this.responseText === 'string' && this.responseText) {
                payload = JSON.parse(this.responseText);
              }
            } catch (err) {
              payload = null;
            }
            if (payload) handlePayload(uuid, payload);
          }, { once: true });
        }
        return originalSend.apply(this, arguments);
      };
    }
  }
  function handleMinimapFocus(event) {
    const detail = event?.detail || {};
    const lat = Number(detail.lat);
    const lng = Number(detail.lng);
    const zoom = Number.isFinite(detail.zoom) ? detail.zoom : null;
    const triggerClick = detail.triggerClick !== false;
    const dropPin = detail.dropPin !== false;
    const requestId = detail.requestId || null;
    let success = false;
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      maybeCapturePreferredLocation(lat, lng, detail);
      const focus = { lat, lng, zoom, triggerClick, dropPin };
      if (state.map && window.google?.maps?.Marker) {
        success = focusMapAndDropPin(focus);
      } else {
        state.pendingFocus = focus;
        success = true;
      }
    }
    if (requestId) {
      window.dispatchEvent(new CustomEvent('gghost-minimap-focus-ack', {
        detail: { requestId, success }
      }));
    }
  }
  function handleMinimapClear() {
    state.pendingFocus = null;
    if (state.searchMarker) {
      state.searchMarker.setMap(null);
      state.searchMarker = null;
    }
  }
  function handleMinimapGeocode(event) {
    const detail = event?.detail || {};
    const address = String(detail.address || '').trim();
    if (!address) return;
    const request = {
      address,
      zoom: Number.isFinite(detail.zoom) ? detail.zoom : null,
      requestId: detail.requestId || null,
      triggerClick: detail.triggerClick !== false,
      dropPin: detail.dropPin !== false
    };
    if (!window.google?.maps?.Geocoder) {
      state.pendingMinimapGeocode.push(request);
      return;
    }
    geocodeAndFocusMinimap(request);
  }
  function applyPendingMinimapGeocode() {
    if (!state.pendingMinimapGeocode.length) return;
    if (!window.google?.maps?.Geocoder) return;
    const pending = state.pendingMinimapGeocode.slice();
    state.pendingMinimapGeocode = [];
    pending.forEach(geocodeAndFocusMinimap);
  }
  function geocodeAndFocusMinimap(request) {
    if (!request || !window.google?.maps?.Geocoder) return;
    const geocoder = new google.maps.Geocoder();
    geocoder.geocode({ address: request.address }, (results, status) => {
      if (status !== 'OK' || !results || !results.length) {
        if (request.requestId) {
          window.dispatchEvent(new CustomEvent('gghost-minimap-geocode-ack', {
            detail: { requestId: request.requestId, success: false }
          }));
        }
        return;
      }
      const location = results[0]?.geometry?.location;
      const lat = typeof location?.lat === 'function' ? location.lat() : location?.lat;
      const lng = typeof location?.lng === 'function' ? location.lng() : location?.lng;
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        if (request.requestId) {
          window.dispatchEvent(new CustomEvent('gghost-minimap-geocode-ack', {
            detail: { requestId: request.requestId, success: false }
          }));
        }
        return;
      }
      const focus = {
        lat,
        lng,
        zoom: Number.isFinite(request.zoom) ? request.zoom : null,
        triggerClick: request.triggerClick !== false,
        dropPin: request.dropPin !== false
      };
      if (state.map) {
        focusMapAndDropPin(focus);
      } else {
        state.pendingFocus = focus;
      }
      if (request.requestId) {
        window.dispatchEvent(new CustomEvent('gghost-minimap-geocode-ack', {
          detail: { requestId: request.requestId, success: true, lat, lng }
        }));
      }
    });
  }
  function handleMinimapLocations(event) {
    const detail = event?.detail || {};
    const locations = Array.isArray(detail.locations) ? detail.locations : null;
    if (!locations) return;
    const payload = {
      locations,
      receivedAt: Date.now(),
      center: coerceLatLng(detail)
    };
    if (!state.map || !window.google?.maps?.Marker) {
      state.pendingMinimapLocations = payload;
      return;
    }
    applyMinimapLocations(payload);
  }
  function applyMinimapLocations(payload) {
    if (!payload || !Array.isArray(payload.locations)) return;
    payload.locations.forEach(normalizeLocationCity);
    state.lastLocations = payload.locations;
    state.lastLocationsAt = Date.now();
    state.lastLocationsKey = 'minimap';
    debugState.lastMinimapFetchAt = new Date().toISOString();
    debugState.lastMinimapFetchCount = payload.locations.length;
    debugState.lastMinimapFetchCenter = payload.center || null;
    updateMarkers(payload.locations);
  }
  function coerceLatLng(value) {
    if (!value || typeof value !== 'object') return null;
    const lat = Number(value.lat ?? value.latitude);
    const lng = Number(value.lng ?? value.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
    return { lat, lng };
  }
  function readPreferredCenter() {
    try {
      const raw = localStorage.getItem(PREFERRED_CENTER_STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return coerceLatLng(parsed);
    } catch (err) {
      return null;
    }
  }
  function readPreferredCenterAddress() {
    try {
      const raw = localStorage.getItem(PREFERRED_CENTER_STORAGE_KEY);
      if (!raw) return '';
      const parsed = JSON.parse(raw);
      return typeof parsed?.address === 'string' ? parsed.address : '';
    } catch (err) {
      return '';
    }
  }
  function savePreferredCenter(lat, lng, address = null) {
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
    try {
      localStorage.setItem(PREFERRED_CENTER_STORAGE_KEY, JSON.stringify({
        lat,
        lng,
        address: address || null,
        updatedAt: Date.now()
      }));
      return true;
    } catch (err) {
      return false;
    }
  }
  function isPreferredOverrideEnabled() {
    try {
      return localStorage.getItem(PREFERRED_CENTER_OVERRIDE_KEY) === 'true';
    } catch (err) {
      return false;
    }
  }
  function setPreferredOverrideEnabled(enabled) {
    try {
      if (enabled) {
        localStorage.setItem(PREFERRED_CENTER_OVERRIDE_KEY, 'true');
      } else {
        localStorage.removeItem(PREFERRED_CENTER_OVERRIDE_KEY);
      }
    } catch (err) {
      // ignore storage errors
    }
    if (!enabled) {
      clearPreferredGeolocationWatches();
    } else {
      applyPreferredOverride();
    }
  }
  function getPreferredCenter() {
    const stored = readPreferredCenter();
    if (stored && isWithinNycBounds(stored.lat, stored.lng)) return stored;
    return MIDTOWN_CENTER;
  }
  function getPreferredOverrideCenter() {
    if (!isPreferredOverrideEnabled()) return null;
    const stored = readPreferredCenter();
    if (stored && isWithinNycBounds(stored.lat, stored.lng)) return stored;
    return null;
  }
  function clearPreferredGeolocationWatches() {
    geoOverrideState.watchers.forEach((timerId) => clearInterval(timerId));
    geoOverrideState.watchers.clear();
  }
  function getPreferredOverrideCoords() {
    if (!isTeamMapPage()) return null;
    return getPreferredOverrideCenter();
  }
  function buildGeoPosition(lat, lng) {
    return {
      coords: {
        latitude: lat,
        longitude: lng,
        accuracy: 10,
        altitude: null,
        altitudeAccuracy: null,
        heading: null,
        speed: null
      },
      timestamp: Date.now()
    };
  }
  function installGeolocationOverride() {
    if (geoOverrideState.installed) return;
    const geo = navigator.geolocation;
    if (!geo) return;
    const original = {
      getCurrentPosition: typeof geo.getCurrentPosition === 'function' ? geo.getCurrentPosition.bind(geo) : null,
      watchPosition: typeof geo.watchPosition === 'function' ? geo.watchPosition.bind(geo) : null,
      clearWatch: typeof geo.clearWatch === 'function' ? geo.clearWatch.bind(geo) : null
    };
    if (!original.getCurrentPosition && !original.watchPosition) return;
    geoOverrideState.original = original;
    geoOverrideState.installed = true;
    if (original.getCurrentPosition) {
      try {
        geo.getCurrentPosition = function (success, error, options) {
          const override = getPreferredOverrideCoords();
          if (override && typeof success === 'function') {
            setTimeout(() => success(buildGeoPosition(override.lat, override.lng)), 0);
            return;
          }
          return original.getCurrentPosition(success, error, options);
        };
      } catch (err) {
        // ignore if geolocation is read-only
      }
    }
    if (original.watchPosition) {
      try {
        geo.watchPosition = function (success, error, options) {
          const override = getPreferredOverrideCoords();
          if (override && typeof success === 'function') {
            const id = ++geoOverrideState.watchId;
            const tick = () => {
              const latest = getPreferredOverrideCoords();
              if (!latest) return;
              success(buildGeoPosition(latest.lat, latest.lng));
            };
            tick();
            const intervalId = setInterval(tick, 10000);
            geoOverrideState.watchers.set(id, intervalId);
            return id;
          }
          return original.watchPosition(success, error, options);
        };
      } catch (err) {
        // ignore if geolocation is read-only
      }
    }
    if (original.clearWatch) {
      try {
        geo.clearWatch = function (id) {
          if (geoOverrideState.watchers.has(id)) {
            clearInterval(geoOverrideState.watchers.get(id));
            geoOverrideState.watchers.delete(id);
            return;
          }
          return original.clearWatch(id);
        };
      } catch (err) {
        // ignore if geolocation is read-only
      }
    }
  }
  function isWithinNycBounds(lat, lng) {
    return lat >= NYC_BOUNDS.south
      && lat <= NYC_BOUNDS.north
      && lng >= NYC_BOUNDS.west
      && lng <= NYC_BOUNDS.east;
  }
  function getMapCenterLatLng(map) {
    if (!map?.getCenter) return null;
    const center = map.getCenter();
    if (!center) return null;
    const lat = typeof center.lat === 'function' ? center.lat() : center.lat;
    const lng = typeof center.lng === 'function' ? center.lng() : center.lng;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return { lat, lng };
  }
  function startInitialCenterGuard() {
    if (isPreferredOverrideEnabled()) {
      recenterState.initialCenterChecked = true;
      recenterState.outsideNyc = false;
      updateRecenterButtonVisibility();
      return;
    }
    recenterState.initialCenterChecked = false;
    recenterState.initialCenterAttempts = 0;
    recenterState.initialCenterStart = Date.now();
    recenterState.outsideNyc = false;
    updateRecenterButtonVisibility();
  }
  function maybeGuardInitialCenter() {
    if (isPreferredOverrideEnabled()) {
      recenterState.initialCenterChecked = true;
      recenterState.outsideNyc = false;
      updateRecenterButtonVisibility();
      return;
    }
    if (recenterState.initialCenterChecked || !state.map) return;
    const center = getMapCenterLatLng(state.map);
    if (!center) return;
    recenterState.initialCenterAttempts += 1;
    const outside = !isWithinNycBounds(center.lat, center.lng);
    const elapsed = recenterState.initialCenterStart
      ? Date.now() - recenterState.initialCenterStart
      : 0;
    const timedOut = elapsed > RECENTER_INITIAL_GRACE_MS;
    const attemptsExceeded = recenterState.initialCenterAttempts >= RECENTER_INITIAL_MAX_ATTEMPTS;
    if (!outside && !timedOut && !attemptsExceeded) return;
    recenterState.initialCenterChecked = true;
    recenterState.outsideNyc = outside;
    updateRecenterButtonVisibility();
    if (outside) {
      recenterToPreferred({ dropPin: false, triggerClick: false });
    }
  }
  function recenterToPreferred(options = {}) {
    const target = getPreferredCenter();
    recenterToLocation(target.lat, target.lng, {
      zoom: options.zoom,
      dropPin: options.dropPin === true,
      triggerClick: options.triggerClick === true
    });
  }
  function queuePreferredLocationCapture() {
    recenterState.captureNextLocation = true;
    recenterState.captureExpiresAt = Date.now() + RECENTER_CAPTURE_TTL_MS;
  }
  function shouldCapturePreferredLocation(detail) {
    if (detail?.savePreference === true) return true;
    if (!recenterState.captureNextLocation) return false;
    if (recenterState.captureExpiresAt && Date.now() > recenterState.captureExpiresAt) {
      recenterState.captureNextLocation = false;
      recenterState.captureExpiresAt = 0;
      return false;
    }
    return true;
  }
  function maybeCapturePreferredLocation(lat, lng, detail) {
    if (!shouldCapturePreferredLocation(detail)) return;
    if (!isWithinNycBounds(lat, lng)) {
      recenterState.captureNextLocation = false;
      recenterState.captureExpiresAt = 0;
      return;
    }
    savePreferredCenter(lat, lng);
    recenterState.captureNextLocation = false;
    recenterState.captureExpiresAt = 0;
  }
  function focusMinimapSearchInput() {
    const input = document.querySelector('input[placeholder="Search place or address..."]');
    if (!input) return;
    input.focus();
    if (typeof input.select === 'function') {
      input.select();
    }
  }
  function setPreferredMarker(position) {
    if (!state.map || !window.google?.maps?.Marker) return false;
    const icon = buildSearchMarkerIcon();
    const label = {
      text: PREFERRED_MARKER_LABEL,
      color: '#0f172a',
      fontSize: '12px',
      fontWeight: '600'
    };
    if (!state.preferredMarker) {
      state.preferredMarker = new google.maps.Marker({
        map: state.map,
        position,
        icon,
        label,
        title: PREFERRED_MARKER_LABEL,
        zIndex: 2000001,
        optimized: false
      });
      state.preferredMarkerListener = state.preferredMarker.addListener('click', () => {
        showRecenterOverlay({ allowClear: true, prefill: readPreferredCenterAddress() });
      });
    } else {
      state.preferredMarker.setPosition(position);
      state.preferredMarker.setIcon(icon);
      state.preferredMarker.setLabel(label);
      state.preferredMarker.setTitle(PREFERRED_MARKER_LABEL);
      state.preferredMarker.setZIndex(2000001);
      state.preferredMarker.setMap(state.map);
    }
    return true;
  }
  function removePreferredMarker() {
    if (state.preferredMarkerListener) {
      state.preferredMarkerListener.remove();
      state.preferredMarkerListener = null;
    }
    if (state.preferredMarker) {
      state.preferredMarker.setMap(null);
      state.preferredMarker = null;
    }
  }
  function applyPreferredOverride({ recenter = true } = {}) {
    const overrideCenter = getPreferredOverrideCenter();
    if (!overrideCenter) {
      if (isPreferredOverrideEnabled()) {
        setPreferredOverrideEnabled(false);
      }
      state.pendingPreferredCenter = null;
      removePreferredMarker();
      return false;
    }
    recenterState.outsideNyc = false;
    updateRecenterButtonVisibility();
    if (state.map && window.google?.maps?.Marker) {
      setPreferredMarker(overrideCenter);
      if (recenter) {
        recenterToLocation(overrideCenter.lat, overrideCenter.lng, {
          dropPin: false,
          triggerClick: false
        });
      }
      return true;
    }
    state.pendingPreferredCenter = overrideCenter;
    return true;
  }
  function applyPendingPreferredCenter() {
    const pending = state.pendingPreferredCenter;
    if (!pending) return;
    state.pendingPreferredCenter = null;
    setPreferredMarker(pending);
    recenterToLocation(pending.lat, pending.lng, { dropPin: false, triggerClick: false });
  }
  function clearPreferredCenterData() {
    try {
      localStorage.removeItem(PREFERRED_CENTER_STORAGE_KEY);
    } catch (err) {
      // ignore storage errors
    }
    setPreferredOverrideEnabled(false);
    state.pendingPreferredCenter = null;
    removePreferredMarker();
    const center = getMapCenterLatLng(state.map);
    recenterState.outsideNyc = center ? !isWithinNycBounds(center.lat, center.lng) : false;
    updateRecenterButtonVisibility();
  }
  function setRecenterOverlayMessage(text, isError) {
    const message = document.getElementById(RECENTER_OVERLAY_MESSAGE_ID);
    if (!message) return;
    message.textContent = text || '';
    message.style.color = isError ? '#b91c1c' : '#0f172a';
  }
  function setRecenterOverlayClearVisibility(visible) {
    const clear = document.getElementById(RECENTER_OVERLAY_CLEAR_ID);
    if (!clear) return;
    clear.style.display = visible ? '' : 'none';
  }
  function setRecenterOverlayBusy(isBusy) {
    const submit = document.getElementById(RECENTER_OVERLAY_SUBMIT_ID);
    const cancel = document.getElementById(RECENTER_OVERLAY_CANCEL_ID);
    const clear = document.getElementById(RECENTER_OVERLAY_CLEAR_ID);
    const input = document.getElementById(RECENTER_OVERLAY_INPUT_ID);
    if (submit) submit.disabled = !!isBusy;
    if (cancel) cancel.disabled = !!isBusy;
    if (clear) clear.disabled = !!isBusy;
    if (input) input.disabled = !!isBusy;
  }
  function ensureRecenterOverlay() {
    let overlay = document.getElementById(RECENTER_OVERLAY_ID);
    if (overlay) return overlay;
    overlay = document.createElement('div');
    overlay.id = RECENTER_OVERLAY_ID;
    Object.assign(overlay.style, {
      position: 'fixed',
      inset: '0',
      background: 'rgba(0, 0, 0, 0.45)',
      display: 'none',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 10000
    });
    const panel = document.createElement('div');
    Object.assign(panel.style, {
      background: '#ffffff',
      borderRadius: '10px',
      padding: '16px',
      width: 'min(420px, 92vw)',
      boxShadow: '0 12px 30px rgba(0, 0, 0, 0.25)',
      fontFamily: 'sans-serif'
    });
    const title = document.createElement('div');
    title.textContent = 'Re-center to NYC address';
    Object.assign(title.style, {
      fontSize: '16px',
      fontWeight: '600',
      marginBottom: '10px'
    });
    const input = document.createElement('input');
    input.id = RECENTER_OVERLAY_INPUT_ID;
    input.type = 'text';
    input.placeholder = 'Enter an NYC address';
    input.autocomplete = 'off';
    Object.assign(input.style, {
      width: '100%',
      padding: '8px 10px',
      fontSize: '14px',
      boxSizing: 'border-box',
      border: '1px solid #cbd5f5',
      borderRadius: '6px'
    });
    const message = document.createElement('div');
    message.id = RECENTER_OVERLAY_MESSAGE_ID;
    Object.assign(message.style, {
      marginTop: '8px',
      minHeight: '18px',
      fontSize: '12px',
      color: '#0f172a'
    });
    const buttonRow = document.createElement('div');
    Object.assign(buttonRow.style, {
      display: 'flex',
      justifyContent: 'flex-end',
      gap: '8px',
      marginTop: '12px'
    });
    const cancel = document.createElement('button');
    cancel.id = RECENTER_OVERLAY_CANCEL_ID;
    cancel.type = 'button';
    cancel.textContent = 'Cancel';
    Object.assign(cancel.style, {
      padding: '6px 12px',
      borderRadius: '6px',
      border: '1px solid #cbd5f5',
      background: '#f8fafc',
      cursor: 'pointer'
    });
    cancel.addEventListener('click', hideRecenterOverlay);
    const clear = document.createElement('button');
    clear.id = RECENTER_OVERLAY_CLEAR_ID;
    clear.type = 'button';
    clear.textContent = 'Clear';
    Object.assign(clear.style, {
      padding: '6px 12px',
      borderRadius: '6px',
      border: '1px solid #f1c0c0',
      background: '#fff5f5',
      color: '#b42318',
      cursor: 'pointer',
      display: 'none'
    });
    clear.addEventListener('click', (event) => {
      event.preventDefault();
      handleRecenterOverlayClear();
    });
    const submit = document.createElement('button');
    submit.id = RECENTER_OVERLAY_SUBMIT_ID;
    submit.type = 'button';
    submit.textContent = 'Re-center';
    Object.assign(submit.style, {
      padding: '6px 12px',
      borderRadius: '6px',
      border: 'none',
      background: '#2563eb',
      color: '#fff',
      cursor: 'pointer'
    });
    submit.addEventListener('click', handleRecenterOverlaySubmit);
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        handleRecenterOverlaySubmit();
      }
    });
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) hideRecenterOverlay();
    });
    buttonRow.appendChild(cancel);
    buttonRow.appendChild(clear);
    buttonRow.appendChild(submit);
    panel.appendChild(title);
    panel.appendChild(input);
    panel.appendChild(message);
    panel.appendChild(buttonRow);
    overlay.appendChild(panel);
    document.body.appendChild(overlay);
    return overlay;
  }
  function showRecenterOverlay(options = {}) {
    const overlay = ensureRecenterOverlay();
    overlay.style.display = 'flex';
    setRecenterOverlayBusy(false);
    setRecenterOverlayMessage('', false);
    setRecenterOverlayClearVisibility(!!options.allowClear);
    const input = document.getElementById(RECENTER_OVERLAY_INPUT_ID);
    if (input) {
      input.value = options.prefill || '';
      input.focus();
    }
  }
  function hideRecenterOverlay() {
    const overlay = document.getElementById(RECENTER_OVERLAY_ID);
    if (!overlay) return;
    overlay.style.display = 'none';
    setRecenterOverlayBusy(false);
    setRecenterOverlayMessage('', false);
    setRecenterOverlayClearVisibility(false);
  }
  function handleRecenterOverlayClear() {
    clearPreferredCenterData();
    hideRecenterOverlay();
  }
  function geocodeAddress(address) {
    return new Promise((resolve, reject) => {
      if (!window.google?.maps?.Geocoder) {
        reject(new Error('Google Maps geocoder is not available.'));
        return;
      }
      const geocoder = new google.maps.Geocoder();
      geocoder.geocode({ address }, (results, status) => {
        if (status !== 'OK' || !results || !results.length) {
          reject(new Error('Address not found.'));
          return;
        }
        resolve(results[0]);
      });
    });
  }
  function recenterToLocation(lat, lng, options = {}) {
    const focus = {
      lat,
      lng,
      zoom: Number.isFinite(options.zoom) ? options.zoom : null,
      dropPin: options.dropPin !== false,
      triggerClick: options.triggerClick === true
    };
    if (state.map && window.google?.maps?.Marker) {
      focusMapAndDropPin(focus);
    } else {
      state.pendingFocus = focus;
    }
  }
  function handleRecenterOverlaySubmit() {
    const input = document.getElementById(RECENTER_OVERLAY_INPUT_ID);
    const address = input ? input.value.trim() : '';
    if (!address) {
      setRecenterOverlayMessage('Enter an NYC address.', true);
      return;
    }
    setRecenterOverlayBusy(true);
    setRecenterOverlayMessage('Looking up address...', false);
    geocodeAddress(address)
      .then((result) => {
        const location = result?.geometry?.location;
        const lat = typeof location?.lat === 'function' ? location.lat() : location?.lat;
        const lng = typeof location?.lng === 'function' ? location.lng() : location?.lng;
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
          throw new Error('Address location not available.');
        }
        if (!isWithinNycBounds(lat, lng)) {
          throw new Error('Address must be within NYC.');
        }
        const formatted = result?.formatted_address || address;
        savePreferredCenter(lat, lng, formatted);
        setPreferredOverrideEnabled(true);
        recenterState.outsideNyc = false;
        updateRecenterButtonVisibility();
        hideRecenterOverlay();
      })
      .catch((err) => {
        setRecenterOverlayMessage(err?.message || 'Failed to find address.', true);
      })
      .finally(() => {
        setRecenterOverlayBusy(false);
      });
  }
  function ensureRecenterButton() {
    if (recenterState.button) return recenterState.button;
    const button = document.createElement('button');
    button.id = RECENTER_BUTTON_ID;
    button.textContent = 'Re-center';
    button.title = 'Re-center map and set a preferred location with the address search.';
    Object.assign(button.style, {
      position: 'fixed',
      bottom: '20px',
      right: '20px',
      zIndex: 9999,
      padding: '10px 14px',
      backgroundColor: '#0066cc',
      color: '#fff',
      border: 'none',
      borderRadius: '5px',
      cursor: 'pointer',
      boxShadow: '0 2px 6px rgba(0,0,0,0.3)'
    });
    button.addEventListener('click', handleRecenterClick);
    document.body.appendChild(button);
    recenterState.button = button;
    return button;
  }
  function updateRecenterButtonVisibility() {
    if (isPreferredOverrideEnabled()) {
      if (recenterState.button) {
        recenterState.button.style.display = 'none';
      }
      return;
    }
    if (!recenterState.outsideNyc) {
      if (recenterState.button) {
        recenterState.button.style.display = 'none';
      }
      return;
    }
    const button = ensureRecenterButton();
    button.style.display = '';
  }
  function removeRecenterButton() {
    if (!recenterState.button) return;
    recenterState.button.remove();
    recenterState.button = null;
  }
  function resetRecenterState() {
    recenterState.outsideNyc = false;
    recenterState.initialCenterChecked = false;
    recenterState.initialCenterAttempts = 0;
    recenterState.initialCenterStart = 0;
    recenterState.captureNextLocation = false;
    recenterState.captureExpiresAt = 0;
    state.pendingPreferredCenter = null;
    removePreferredMarker();
    removeRecenterButton();
    hideRecenterOverlay();
  }
  function handleRecenterClick() {
    showRecenterOverlay({ allowClear: isPreferredOverrideEnabled() });
  }
  function applyPendingMinimapFocus() {
    if (!state.pendingFocus) return;
    const focus = state.pendingFocus;
    state.pendingFocus = null;
    focusMapAndDropPin(focus);
  }
  function applyPendingMinimapLocations() {
    if (!state.pendingMinimapLocations) return;
    const payload = state.pendingMinimapLocations;
    state.pendingMinimapLocations = null;
    applyMinimapLocations(payload);
  }
  function focusMapAndDropPin(focus) {
    if (!state.map) return false;
    const position = { lat: focus.lat, lng: focus.lng };
    if (Number.isFinite(focus.zoom) && typeof state.map.setZoom === 'function') {
      state.map.setZoom(focus.zoom);
    }
    if (typeof state.map.panTo === 'function') {
      state.map.panTo(position);
    } else if (typeof state.map.setCenter === 'function') {
      state.map.setCenter(position);
    }
    if (focus.dropPin !== false && window.google?.maps?.Marker) {
      const icon = buildSearchMarkerIcon();
      if (!state.searchMarker) {
        state.searchMarker = new google.maps.Marker({
          map: state.map,
          position,
          icon,
          title: '',
          zIndex: 2000000,
          optimized: false
        });
      } else {
        state.searchMarker.setPosition(position);
        state.searchMarker.setIcon(icon);
        state.searchMarker.setZIndex(2000000);
        state.searchMarker.setMap(state.map);
      }
    } else if (state.searchMarker) {
      state.searchMarker.setMap(null);
      state.searchMarker = null;
    }
    if (focus.triggerClick !== false) {
      triggerMapClickAt(position);
    }
    return true;
  }
  function triggerMapClickAt(position) {
    if (!state.map) return false;
    let triggered = false;
    if (window.google?.maps?.event && window.google?.maps?.LatLng) {
      const latLng = position instanceof google.maps.LatLng
        ? position
        : new google.maps.LatLng(position.lat, position.lng);
      window.google.maps.event.trigger(state.map, 'click', { latLng });
      triggered = true;
    }
    if (!triggered) {
      return triggerMapDomClick(position);
    }
    // Also dispatch a DOM click to satisfy handlers that rely on DOM events.
    triggerMapDomClick(position);
    return true;
  }
  function ensureClickOverlay() {
    if (!state.map || state.clickOverlay || !window.google?.maps?.OverlayView) return;
    const overlay = new google.maps.OverlayView();
    overlay.onAdd = () => {
      state.clickOverlayReady = true;
      const panes = overlay.getPanes?.();
      overlay.__mouseTarget = panes?.overlayMouseTarget || null;
    };
    overlay.draw = () => {
      state.clickOverlayReady = true;
    };
    overlay.onRemove = () => {};
    overlay.setMap(state.map);
    state.clickOverlay = overlay;
  }
  function getMapDiv() {
    if (state.map?.getDiv) return state.map.getDiv();
    return document.querySelector('.gm-style');
  }
  function dispatchMapEvent(target, type, coords, options = {}) {
    const base = {
      bubbles: true,
      cancelable: true,
      view: window,
      clientX: coords.x,
      clientY: coords.y,
      screenX: coords.x,
      screenY: coords.y,
      button: options.button ?? 0,
      buttons: options.buttons ?? 0,
      detail: options.detail ?? 1
    };
    try {
      if (type.startsWith('pointer') && window.PointerEvent) {
        target.dispatchEvent(new PointerEvent(type, base));
      } else {
        target.dispatchEvent(new MouseEvent(type, base));
      }
    } catch (err) {
      // ignore dispatch errors
    }
  }
  function triggerMapDomClick(position, attempt = 0) {
    if (!state.map || !state.clickOverlay || !window.google?.maps?.LatLng) return false;
    const projection = state.clickOverlay.getProjection?.();
    if (!projection) {
      if (attempt < 4) {
        setTimeout(() => triggerMapDomClick(position, attempt + 1), 200);
      }
      return false;
    }
    const latLng = position instanceof google.maps.LatLng
      ? position
      : new google.maps.LatLng(position.lat, position.lng);
    const point = projection.fromLatLngToDivPixel(latLng);
    const mapDiv = getMapDiv();
    if (!mapDiv || !point) return false;
    const rect = mapDiv ? mapDiv.getBoundingClientRect() : target.getBoundingClientRect();
    const clientX = rect.left + point.x;
    const clientY = rect.top + point.y;
    const coords = { x: clientX, y: clientY };
    const elementAtPoint = document.elementFromPoint(clientX, clientY);
    const overlayTarget = state.clickOverlay.__mouseTarget
      || mapDiv.querySelector?.('[role="region"]')
      || mapDiv;
    const target = elementAtPoint && mapDiv.contains(elementAtPoint)
      ? elementAtPoint
      : overlayTarget;
    if (!target) return false;
    dispatchMapEvent(target, 'pointerdown', coords, { button: 0, buttons: 1, detail: 1 });
    dispatchMapEvent(target, 'mousedown', coords, { button: 0, buttons: 1, detail: 1 });
    dispatchMapEvent(target, 'pointerup', coords, { button: 0, buttons: 0, detail: 1 });
    dispatchMapEvent(target, 'mouseup', coords, { button: 0, buttons: 0, detail: 1 });
    dispatchMapEvent(target, 'click', coords, { button: 0, buttons: 0, detail: 1 });
    return true;
  }
  function ensureMapsReady() {
    if (window.google && window.google.maps && window.google.maps.Map) {
      return Promise.resolve(true);
    }
    return new Promise((resolve) => {
      const start = Date.now();
      const timer = setInterval(() => {
        if (window.google && window.google.maps && window.google.maps.Map) {
          clearInterval(timer);
          resolve(true);
          return;
        }
        if (Date.now() - start > 30000) {
          clearInterval(timer);
          resolve(false);
        }
      }, 250);
    });
  }
  function hookMapPrototype() {
    const MapCtor = window.google?.maps?.Map;
    const proto = MapCtor?.prototype;
    if (!proto || proto.__gghostPatched) return;
    const wrap = (name) => {
      const original = proto[name];
      if (typeof original !== 'function') return;
      proto[name] = function () {
        tryCaptureMap(this, `proto:${name}`);
        return original.apply(this, arguments);
      };
    };
    ['setCenter', 'setZoom', 'setOptions', 'fitBounds', 'panTo', 'setMapTypeId'].forEach(wrap);
    proto.__gghostPatched = true;
  }
  function hookMapsEventSystem() {
    const eventApi = window.google?.maps?.event;
    if (!eventApi || eventApi.__gghostPatched) return;
    const originalAdd = eventApi.addListener;
    if (typeof originalAdd === 'function') {
      eventApi.addListener = function (instance) {
        tryCaptureMap(instance, 'event:addListener');
        return originalAdd.apply(this, arguments);
      };
    }
    const originalOnce = eventApi.addListenerOnce;
    if (typeof originalOnce === 'function') {
      eventApi.addListenerOnce = function (instance) {
        tryCaptureMap(instance, 'event:addListenerOnce');
        return originalOnce.apply(this, arguments);
      };
    }
    eventApi.__gghostPatched = true;
  }
  function hookMapConstructor() {
    if (!window.google || !window.google.maps || !window.google.maps.Map) return;
    const MapCtor = window.google.maps.Map;
    if (MapCtor.__gghostWrapped) return;
    function WrappedMap() {
      const map = new MapCtor(...arguments);
      tryCaptureMap(map);
      return map;
    }
    WrappedMap.prototype = MapCtor.prototype;
    Object.keys(MapCtor).forEach((key) => {
      try {
        WrappedMap[key] = MapCtor[key];
      } catch (err) {
        // ignore readonly props
      }
    });
    WrappedMap.__gghostWrapped = true;
    window.google.maps.Map = WrappedMap;
  }
  function tryCaptureMap(map, source) {
    if (!map) return;
    if (window.__gghostTeamMapInstance !== map) {
      window.__gghostTeamMapInstance = map;
      debugState.lastMapCapture = new Date().toISOString();
      debugState.lastMapCaptureSource = source || null;
    }
  }
  function findExistingMap() {
    if (!window.google || !window.google.maps || !window.google.maps.Map) return null;
    const MapCtor = window.google.maps.Map;
    if (window.__gghostTeamMapInstance instanceof MapCtor) {
      return window.__gghostTeamMapInstance;
    }
    try {
      for (const key of Object.keys(window)) {
        const value = window[key];
        if (value && value instanceof MapCtor) {
          return value;
        }
      }
    } catch (err) {
      // ignore scan errors
    }
    return null;
  }
  async function findMapFromGmpElement() {
    const gmpMap = document.querySelector('gmp-map');
    if (!gmpMap) return null;
    if (typeof gmpMap.getMap === 'function') {
      try {
        const map = await gmpMap.getMap();
        if (map) return map;
      } catch (err) {
        // ignore getMap failures
      }
    }
    const candidate = gmpMap.innerMap || gmpMap.map || gmpMap.__gm?.map;
    if (candidate && window.google?.maps?.Map && candidate instanceof window.google.maps.Map) {
      return candidate;
    }
    return null;
  }
  async function tryAttachExisting() {
    debugState.lastAttachAttempt = new Date().toISOString();
    const existing = findExistingMap();
    if (existing) {
      attachMap(existing, 'window');
      return true;
    }
    const gmpMap = await findMapFromGmpElement();
    if (gmpMap) {
      attachMap(gmpMap, 'gmp-map');
      return true;
    }
    return false;
  }
  function attachMap(map, source) {
    if (!map || state.map === map) return;
    detachMap();
    state.map = map;
    debugState.mapReady = true;
    debugState.lastAttachSource = source || null;
    state.infoWindow = state.infoWindow || new google.maps.InfoWindow();
    state.infoWindow.setOptions({ disableAutoPan: true });
    attachInfoWindowCloseListener();
    if (HIDE_DEFAULT_MARKERS) {
      applyDefaultMarkerHiding(map);
    }
    startInitialCenterGuard();
    applyPreferredOverride();
    applyPendingPreferredCenter();
    state.listeners.push(map.addListener('idle', scheduleFetch));
    state.listeners.push(map.addListener('idle', maybeGuardInitialCenter));
    state.listeners.push(map.addListener('dragstart', () => {
      state.isDragging = true;
    }));
    state.listeners.push(map.addListener('dragend', () => {
      state.isDragging = false;
    }));
    state.listeners.push(map.addListener('click', () => {
      if (state.isDragging) return;
      closeNotesOverlay();
      state.infoWindow?.close();
    }));
    ensureClickOverlay();
    scheduleFetch();
    applyPendingMinimapFocus();
    applyPendingMinimapLocations();
    applyPendingMinimapGeocode();
  }
  function detachMap() {
    state.listeners.forEach(listener => listener.remove());
    state.listeners = [];
    if (state.searchMarker) {
      state.searchMarker.setMap(null);
      state.searchMarker = null;
    }
    if (state.clickOverlay) {
      try {
        state.clickOverlay.setMap(null);
      } catch (err) {
        // ignore detach errors
      }
      state.clickOverlay = null;
      state.clickOverlayReady = false;
    }
    removePreferredMarker();
    state.map = null;
  }
  function attachInfoWindowCloseListener() {
    if (!state.infoWindow || state.infoWindow.__gghostCloseListener) return;
    state.infoWindow.__gghostCloseListener = state.infoWindow.addListener('closeclick', () => {
      closeNotesOverlay();
    });
  }
  function scheduleFetch() {
    if (!state.active || !state.map) return;
    if (state.pendingTimer) clearTimeout(state.pendingTimer);
    state.pendingTimer = setTimeout(() => {
      state.pendingTimer = null;
      fetchLocations();
    }, 300);
  }
  async function fetchLocations() {
    const map = state.map;
    if (!map) return;
    const center = map.getCenter();
    const bounds = map.getBounds();
    if (!center || !bounds) return;
    const radius = computeRadiusMeters(center, bounds);
    if (!radius) return;
    const requestKey = `${center.lat().toFixed(4)}:${center.lng().toFixed(4)}:${Math.round(radius / 50)}`;
    const now = Date.now();
    if (state.lastLocations && state.lastLocationsKey === requestKey && now - state.lastLocationsAt < STALE_CACHE_TTL_MS) {
      updateMarkers(state.lastLocations);
    }
    if (requestKey === state.lastRequestKey && now - state.lastLocationsAt < 1000) return;
    state.lastRequestKey = requestKey;
    if (state.fetchAbort) state.fetchAbort.abort();
    const controller = new AbortController();
    state.fetchAbort = controller;
    const url = `${API_BASE}?latitude=${center.lat()}&longitude=${center.lng()}&radius=${Math.round(radius)}`;
    try {
      const res = await fetch(url, {
        signal: controller.signal,
        headers: { accept: 'application/json' },
        cache: 'no-store'
      });
      if (!res.ok) return;
      const data = await res.json();
      if (!Array.isArray(data)) return;
      data.forEach(normalizeLocationCity);
      state.lastLocations = data;
      state.lastLocationsAt = Date.now();
      state.lastLocationsKey = requestKey;
      debugState.lastFetchAt = new Date().toISOString();
      debugState.lastFetchCount = data.length;
      debugState.lastError = null;
      recordLocationStatsFromLocations(data);
      updateMarkers(data);
    } catch (err) {
      if (err && err.name === 'AbortError') return;
      debugState.lastError = err?.message || String(err);
      console.warn('[gghost-team-map] Failed to fetch locations', err);
    }
  }
  function computeRadiusMeters(center, bounds) {
    const ne = bounds.getNorthEast && bounds.getNorthEast();
    if (!ne) return null;
    return haversineMeters(center.lat(), center.lng(), ne.lat(), ne.lng());
  }
  function haversineMeters(lat1, lon1, lat2, lon2) {
    const rad = Math.PI / 180;
    const dLat = (lat2 - lat1) * rad;
    const dLon = (lon2 - lon1) * rad;
    const a = Math.sin(dLat / 2) ** 2
      + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
    return 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }
  function updateMarkers(locations) {
    const forceDomMarkers = window.__gghostTeamMapPinsDom === true
      || localStorage.getItem('gghostTeamMapPinsDom') === 'true';
    const seen = new Set();
    locations.forEach((loc) => {
      const position = getLocationLatLng(loc);
      if (!position) return;
      const id = getLocationId(loc, position);
      if (!id) return;
      seen.add(id);
      let marker = state.markers.get(id);
      const uuid = getLocationUuid(loc);
      const cachedDone = uuid ? getCachedSiteVisitDone(uuid) : null;
      const cachedPending = cachedDone === false ? true : cachedDone === true ? false : null;
      const markerPending = marker?.__gghostSiteVisitPending;
      const pendingVisit = cachedPending !== null ? cachedPending : markerPending;
      const icon = buildMarkerIcon(loc, { siteVisitPending: pendingVisit === true });
      const title = getLocationTitle(loc);
      const zIndex = buildMarkerZIndex(loc);
      if (!marker) {
        marker = new google.maps.Marker({
          map: state.map,
          position,
          icon,
          title: '',
          zIndex,
          optimized: forceDomMarkers ? false : true
        });
        marker.__gghostLoc = loc;
        marker.addListener('mouseover', () => showInfo(marker));
        marker.addListener('click', (evt) => {
          evt?.domEvent?.preventDefault?.();
          evt?.domEvent?.stopPropagation?.();
          evt?.domEvent?.stopImmediatePropagation?.();
          const locId = getLocationId(loc, position);
          if (locId) {
            window.location.href = `https://gogetta.nyc/team/location/${locId}`;
          }
        });
        state.markers.set(id, marker);
      } else {
        marker.__gghostLoc = loc;
        marker.setPosition(position);
        marker.setIcon(icon);
        marker.setTitle('');
        marker.setZIndex(zIndex);
      }
      if (typeof pendingVisit === 'boolean') {
        marker.__gghostSiteVisitPending = pendingVisit;
      }
      applySiteVisitIndicator(marker, loc);
    });
    for (const [id, marker] of state.markers.entries()) {
      if (!seen.has(id)) {
        marker.setMap(null);
        state.markers.delete(id);
      }
    }
    refreshSearchEntries(locations);
    scheduleSearchDecorate();
    updateUpdatesOverlay(locations);
  }
  function ensureUpdatesOverlay() {
    if (updatesState.container || !isTeamMapPage()) return;
    if (!document.body) return;
    const container = document.createElement('div');
    container.id = UPDATES_OVERLAY_ID;
    container.dataset.open = updatesState.open ? 'true' : 'false';
    Object.assign(container.style, {
      position: 'fixed',
      top: '88px',
      left: '20px',
      zIndex: '10000',
      fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif',
      color: '#1f1f1f'
    });
    const toggle = document.createElement('button');
    toggle.id = UPDATES_TOGGLE_ID;
    toggle.type = 'button';
    toggle.textContent = updatesState.open ? 'x' : 'PIN';
    Object.assign(toggle.style, {
      width: '32px',
      height: '32px',
      borderRadius: '50%',
      border: '1px solid #c9c9c9',
      background: '#fff',
      fontSize: '10px',
      fontWeight: '700',
      lineHeight: '1',
      cursor: 'pointer',
      boxShadow: '0 2px 6px rgba(0,0,0,0.15)'
    });
    const panel = document.createElement('div');
    panel.id = UPDATES_PANEL_ID;
    Object.assign(panel.style, {
      marginTop: '8px',
      padding: '12px',
      background: '#ffffff',
      border: '1px solid #dedede',
      borderRadius: '8px',
      boxShadow: '0 6px 18px rgba(0, 0, 0, 0.12)',
      maxWidth: '360px',
      maxHeight: '70vh',
      overflowY: 'auto',
      display: updatesState.open ? 'block' : 'none'
    });
    const header = document.createElement('div');
    header.textContent = 'Update activity';
    header.style.cssText = 'font-weight: 600; font-size: 13px; margin-bottom: 6px;';
    const summary = document.createElement('div');
    summary.textContent = 'Waiting for map data...';
    summary.style.cssText = 'font-size: 12px; color: #555; margin-bottom: 8px;';
    const chart = document.createElement('div');
    chart.style.minHeight = '120px';
    panel.appendChild(header);
    panel.appendChild(summary);
    panel.appendChild(chart);
    const setOpenState = (open) => {
      updatesState.open = open;
      container.dataset.open = open ? 'true' : 'false';
      toggle.textContent = open ? 'x' : 'PIN';
      panel.style.display = open ? 'block' : 'none';
    };
    toggle.addEventListener('click', () => {
      setOpenState(container.dataset.open !== 'true');
    });
    container.appendChild(toggle);
    container.appendChild(panel);
    document.body.appendChild(container);
    updatesState.container = container;
    updatesState.panel = panel;
    updatesState.summary = summary;
    updatesState.chart = chart;
  }
  function updateUpdatesOverlay(locations) {
    if (!Array.isArray(locations)) return;
    ensureUpdatesOverlay();
    if (!updatesState.container || !updatesState.summary || !updatesState.chart) return;
    const dates = [];
    locations.forEach((loc) => {
      const updatedAt = getLocationUpdateDate(loc);
      if (!updatedAt) return;
      const d = new Date(updatedAt);
      if (!Number.isNaN(d.getTime())) dates.push(d);
    });
    const buckets = buildAdaptiveMonthBuckets(dates, 12);
    const signature = buckets.map(b => `${b.key}:${b.count}`).join('|');
    if (signature && signature === updatesState.lastSignature) return;
    updatesState.lastSignature = signature || null;
    updatesState.summary.textContent = `${dates.length} of ${locations.length} locations have update dates.`;
    updatesState.chart.textContent = '';
    if (buckets.length < 2) {
      const empty = document.createElement('div');
      empty.textContent = 'Not enough update data yet.';
      empty.style.cssText = 'font-size: 12px; color: #666;';
      updatesState.chart.appendChild(empty);
      return;
    }
    updatesState.chart.appendChild(renderUpdateChartSVG(buckets, {
      width: 320,
      height: 140,
      pad: 28
    }));
  }
  function removeUpdatesOverlay() {
    if (updatesState.container) {
      updatesState.container.remove();
    }
    updatesState.container = null;
    updatesState.panel = null;
    updatesState.summary = null;
    updatesState.chart = null;
    updatesState.lastSignature = null;
  }
  function showInfo(marker) {
    if (!state.infoWindow || !state.map) return;
    const loc = marker.__gghostLoc;
    if (!loc) return;
    const uuid = getLocationUuid(loc);
    if (notesState.activeUuid && (!uuid || notesState.activeUuid !== uuid)) {
      closeNotesOverlay();
    }
    const content = buildInfoContent(loc);
    state.infoWindow.setContent(content);
    state.infoWindow.open({ map: state.map, anchor: marker, shouldFocus: false });
    const locId = getLocationId(loc, null);
    if (!locId) return;
    const infoToken = `${locId}:${Date.now()}`;
    state.activeInfoToken = infoToken;
    resolveLocationDetails(locId, loc).then((fresh) => {
      if (!fresh || state.activeInfoToken !== infoToken) return;
      marker.__gghostLoc = fresh;
      const updated = buildInfoContent(fresh);
      state.infoWindow.setContent(updated);
      marker.setIcon(buildMarkerIcon(fresh, { siteVisitPending: marker.__gghostSiteVisitPending === true }));
    });
  }
  function buildInfoContent(loc) {
    const wrapper = document.createElement('div');
    wrapper.style.maxWidth = '260px';
    wrapper.style.fontSize = '12px';
    const locationId = getLocationUuid(loc) || getLocationId(loc, null);
    const address = getLocationAddress(loc);
    const locationName = loc?.name || '';
    const orgName = loc?.Organization?.name || '';
    const website = loc?.url || loc?.Organization?.url || '';
    const phone = getLocationPhone(loc);
    const streetviewUrl = loc?.streetview_url || '';
    const fields = [
      buildFieldChip('Organization', orgName, locationId ? buildLocationQuestionUrl(locationId, 'organization-name') : null, getOrgUpdatedAt(loc), { allowEmpty: true, emptyLabel: 'Add organization' }),
      buildFieldChip('Location name', locationName, locationId ? buildLocationQuestionUrl(locationId, 'location-name') : null, getLocationNameUpdatedAt(loc), { allowEmpty: true, emptyLabel: 'Add location name' }),
      buildFieldChip('Address', address, locationId ? buildLocationQuestionUrl(locationId, 'location-address') : null, getAddressUpdatedAt(loc), { allowEmpty: true, emptyLabel: 'Add address' })
    ].filter(Boolean);
    fields.forEach(chip => wrapper.appendChild(chip));
    if (phone) {
      const row = buildFieldChip('Phone', phone, locationId ? buildLocationQuestionUrl(locationId, 'phone-number') : null, null);
      if (row) wrapper.appendChild(row);
    }
    if (website) {
      const row = buildFieldChip('Website', website, locationId ? buildLocationQuestionUrl(locationId, 'website') : null, getWebsiteUpdatedAt(loc));
      const link = document.createElement('a');
      link.href = normalizeWebsiteUrl(website);
      link.textContent = 'Open link';
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.style.cssText = 'display:block;font-size:11px;color:#0d6efd;margin-top:3px;word-break:break-word;overflow-wrap:anywhere;';
      row.appendChild(link);
      wrapper.appendChild(row);
    }
    const services = Array.isArray(loc?.Services)
      ? loc.Services
      : (Array.isArray(loc?.services) ? loc.services : []);
    const servicesSection = buildServicesSection(services, locationId);
    if (servicesSection) wrapper.appendChild(servicesSection);
    const preview = buildStreetViewPreview(streetviewUrl, getLocationLatLng(loc));
    if (preview && locationId) {
      const row = buildStreetViewFrame('Street View', buildLocationQuestionUrl(locationId, 'street-view'), getStreetViewUpdatedAt(loc));
      row.appendChild(preview);
      wrapper.appendChild(row);
    }
    const notesButton = buildNotesButton(loc);
    if (notesButton) wrapper.appendChild(notesButton);
    const closureSection = buildClosureSection(loc, locationId);
    if (closureSection) wrapper.appendChild(closureSection);
    const showMoreButton = buildShowMoreButton(locationId);
    if (showMoreButton) wrapper.appendChild(showMoreButton);
    return wrapper;
  }
  function buildShowMoreButton(locationId) {
    if (!locationId) return null;
    const row = document.createElement('div');
    row.style.marginTop = '6px';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = 'Show more';
    Object.assign(btn.style, {
      border: '1px solid #888',
      background: '#fff',
      borderRadius: '6px',
      padding: '4px 6px',
      fontSize: '11px',
      cursor: 'pointer',
      textAlign: 'left',
      width: '100%'
    });
    btn.addEventListener('click', (evt) => {
      evt.stopPropagation();
      window.location.href = `https://gogetta.nyc/team/location/${locationId}`;
    });
    row.appendChild(btn);
    return row;
  }
  function updateInfoWindowContent(loc) {
    if (!state.infoWindow || !state.map) return;
    state.infoWindow.setContent(buildInfoContent(loc));
  }
  function buildClosureSection(loc, locationId) {
    const closureInfo = getLocationClosureInfo(loc);
    if (!closureInfo.isClosed) return null;
    const section = document.createElement('div');
    section.style.marginTop = '6px';
    section.style.border = '1px solid #f1b4b4';
    section.style.background = '#fff5f5';
    section.style.borderRadius = '6px';
    section.style.padding = '6px';
    section.style.fontSize = '11px';
    const header = document.createElement('div');
    header.textContent = 'Closed (COVID19)';
    header.style.fontWeight = '600';
    header.style.marginBottom = '4px';
    header.style.color = '#7a1f1f';
    const summary = document.createElement('div');
    summary.textContent = closureInfo.userName
      ? `Closed by ${closureInfo.userName}.`
      : 'This location is marked closed.';
    summary.style.marginBottom = '4px';
    const closedAt = closureInfo.closedAt;
    const closedAtRow = document.createElement('div');
    closedAtRow.textContent = closedAt ? `Closed at ${new Date(closedAt).toLocaleString()}.` : '';
    closedAtRow.style.marginBottom = closedAt ? '4px' : '0';
    const message = document.createElement('div');
    message.textContent = closureInfo.message || '(No message provided)';
    message.style.marginBottom = '6px';
    const buttonRow = document.createElement('div');
    buttonRow.style.display = 'flex';
    buttonRow.style.gap = '6px';
    buttonRow.style.justifyContent = 'flex-end';
    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.textContent = 'Edit message';
    editBtn.style.border = '1px solid #1d4ed8';
    editBtn.style.background = '#2563eb';
    editBtn.style.color = '#fff';
    editBtn.style.borderRadius = '4px';
    editBtn.style.padding = '3px 6px';
    editBtn.style.cursor = 'pointer';
    editBtn.style.fontSize = '11px';
    const reopenBtn = document.createElement('button');
    reopenBtn.type = 'button';
    reopenBtn.textContent = 'Reopen location';
    reopenBtn.style.border = '1px solid #15803d';
    reopenBtn.style.background = '#16a34a';
    reopenBtn.style.color = '#fff';
    reopenBtn.style.borderRadius = '4px';
    reopenBtn.style.padding = '3px 6px';
    reopenBtn.style.cursor = 'pointer';
    reopenBtn.style.fontSize = '11px';
    const setBusy = (busy) => {
      editBtn.disabled = busy;
      reopenBtn.disabled = busy;
      const opacity = busy ? '0.7' : '1';
      editBtn.style.opacity = opacity;
      reopenBtn.style.opacity = opacity;
    };
    editBtn.addEventListener('click', async (evt) => {
      evt.stopPropagation();
      const nextMessage = window.prompt('Update closure message', closureInfo.message || '');
      if (nextMessage === null) return;
      const trimmed = nextMessage.trim();
      if (!trimmed) {
        window.alert('Please enter a closure message.');
        return;
      }
      if (trimmed === closureInfo.message) return;
      setBusy(true);
      try {
        await patchLocationClosure(locationId, trimmed);
        applyLocationClosureUpdate(loc, trimmed);
        const cacheEntry = detailsCache.get(locationId);
        detailsCache.set(locationId, { data: loc, timestamp: Date.now(), pending: cacheEntry?.pending });
        refreshMarkerForLocation(loc);
        updateInfoWindowContent(loc);
      } catch (err) {
        console.error('[gghost-team-map] Failed to update closure message', err);
        window.alert('Failed to update closure message.');
      } finally {
        setBusy(false);
      }
    });
    reopenBtn.addEventListener('click', async (evt) => {
      evt.stopPropagation();
      setBusy(true);
      try {
        await patchLocationClosure(locationId, null);
        applyLocationClosureUpdate(loc, null);
        const cacheEntry = detailsCache.get(locationId);
        detailsCache.set(locationId, { data: loc, timestamp: Date.now(), pending: cacheEntry?.pending });
        refreshMarkerForLocation(loc);
        updateInfoWindowContent(loc);
      } catch (err) {
        console.error('[gghost-team-map] Failed to reopen location', err);
        window.alert('Failed to reopen location.');
      } finally {
        setBusy(false);
      }
    });
    buttonRow.appendChild(editBtn);
    buttonRow.appendChild(reopenBtn);
    section.appendChild(header);
    section.appendChild(summary);
    if (closedAt) section.appendChild(closedAtRow);
    section.appendChild(message);
    section.appendChild(buttonRow);
    return section;
  }
  function getNotesTitle(loc) {
    const orgName = String(loc?.Organization?.name || '').trim();
    const locationName = String(loc?.name || '').trim();
    if (orgName && locationName && orgName !== locationName) {
      return `${orgName} - ${locationName}`;
    }
    return orgName || locationName || 'Location notes';
  }
  function buildNotesButton(loc) {
    const uuid = getLocationUuid(loc);
    if (!uuid) return null;
    const row = document.createElement('div');
    row.style.marginTop = '6px';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = 'Show notes';
    Object.assign(btn.style, {
      border: '1px solid #888',
      background: '#fff',
      borderRadius: '6px',
      padding: '4px 6px',
      fontSize: '11px',
      cursor: 'pointer',
      textAlign: 'left',
      width: '100%'
    });
    btn.addEventListener('click', (evt) => {
      evt.stopPropagation();
      openNotesOverlay(uuid, getNotesTitle(loc));
    });
    row.appendChild(btn);
    return row;
  }
  function openNotesOverlay(uuid, title) {
    if (!uuid) return;
    const overlay = ensureNotesOverlay();
    notesState.activeUuid = uuid;
    if (notesState.header) {
      notesState.header.textContent = title || 'Location notes';
    }
    if (notesState.body) {
      notesState.body.textContent = 'Loading notes...';
      notesState.body.style.fontStyle = 'italic';
    }
    overlay.style.display = 'block';
    loadNotesForUuid(uuid).then((notes) => {
      if (notesState.activeUuid !== uuid) return;
      renderNotesOverlay(notes);
    });
  }
  function closeNotesOverlay(remove = false) {
    if (!notesState.overlay) return;
    notesState.activeUuid = null;
    notesState.overlay.style.display = 'none';
    if (remove) {
      notesState.overlay.remove();
      notesState.overlay = null;
      notesState.header = null;
      notesState.body = null;
    }
  }
  function ensureNotesOverlay() {
    if (notesState.overlay && document.contains(notesState.overlay)) return notesState.overlay;
    const overlay = document.createElement('div');
    overlay.id = 'gghost-pin-notes-overlay';
    overlay.dataset.gghostNotesUi = 'true';
    Object.assign(overlay.style, {
      position: 'fixed',
      top: '120px',
      right: '20px',
      width: '320px',
      maxHeight: '420px',
      background: '#fff',
      border: '2px solid #000',
      borderRadius: '8px',
      boxShadow: '0 2px 6px rgba(0,0,0,0.2)',
      zIndex: 100006,
      display: 'none',
      overflow: 'hidden',
      fontSize: '13px'
    });
    const header = document.createElement('div');
    Object.assign(header.style, {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '6px 8px',
      background: '#eee',
      borderBottom: '1px solid #ccc',
      fontWeight: '600'
    });
    const title = document.createElement('span');
    title.textContent = 'Location notes';
    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.textContent = 'Close';
    closeBtn.style.border = '1px solid #000';
    closeBtn.style.borderRadius = '4px';
    closeBtn.style.padding = '2px 6px';
    closeBtn.style.cursor = 'pointer';
    closeBtn.addEventListener('click', () => closeNotesOverlay());
    header.appendChild(title);
    header.appendChild(closeBtn);
    const body = document.createElement('div');
    Object.assign(body.style, {
      padding: '8px',
      overflowY: 'auto',
      maxHeight: '360px',
      whiteSpace: 'pre-wrap'
    });
    overlay.appendChild(header);
    overlay.appendChild(body);
    document.body.appendChild(overlay);
    notesState.overlay = overlay;
    notesState.header = title;
    notesState.body = body;
    return overlay;
  }
  function renderNotesOverlay(notes) {
    if (!notesState.body) return;
    notesState.body.replaceChildren();
    if (notes === null) {
      notesState.body.textContent = 'Unable to load notes.';
      notesState.body.style.fontStyle = 'italic';
      return;
    }
    if (!Array.isArray(notes) || notes.length === 0) {
      notesState.body.textContent = '(No notes available for this location)';
      notesState.body.style.fontStyle = 'italic';
      return;
    }
    notesState.body.style.fontStyle = 'normal';
    notes.forEach((note) => {
      const row = document.createElement('div');
      row.style.marginBottom = '8px';
      const header = document.createElement('div');
      header.textContent = `${note.user} (${note.date})`;
      header.style.fontWeight = '600';
      header.style.marginBottom = '2px';
      const text = document.createElement('div');
      text.textContent = note.note;
      text.style.whiteSpace = 'pre-wrap';
      row.appendChild(header);
      row.appendChild(text);
      notesState.body.appendChild(row);
    });
  }
  function loadNotesForUuid(uuid) {
    if (!uuid) return Promise.resolve(null);
    const cached = getCachedNotes(uuid);
    if (cached !== null) return Promise.resolve(cached);
    const pending = notesState.pending.get(uuid);
    if (pending) return pending;
    const url = `${getFirebaseBaseUrl()}locationNotes/${uuid}.json`;
    const fetchPromise = fetch(url, { cache: 'no-store' })
      .then(res => (res.ok ? res.json() : null))
      .then(data => {
        const notes = parseNotesPayload(data);
        notesState.cache.set(uuid, { notes, timestamp: Date.now() });
        return notes;
      })
      .catch((err) => {
        console.warn('[gghost-team-map] Failed to load notes', err);
        return null;
      })
      .finally(() => {
        notesState.pending.delete(uuid);
      });
    notesState.pending.set(uuid, fetchPromise);
    return fetchPromise;
  }
  function getCachedNotes(uuid) {
    const cached = notesState.cache.get(uuid);
    if (!cached) return null;
    if (Date.now() - cached.timestamp > NOTES_CACHE_TTL_MS) {
      notesState.cache.delete(uuid);
      return null;
    }
    return cached.notes;
  }
  function parseNotesPayload(data) {
    if (!data || typeof data !== 'object') return [];
    const notes = [];
    Object.keys(data).forEach((user) => {
      const entries = data[user];
      if (!entries || typeof entries !== 'object') return;
      Object.keys(entries).forEach((date) => {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
        const noteValue = normalizeNoteValue(entries[date]);
        if (!noteValue) return;
        notes.push({ user, date, note: noteValue });
      });
    });
    notes.sort((a, b) => new Date(a.date) - new Date(b.date));
    return notes;
  }
  function normalizeNoteValue(value) {
    if (typeof value === 'string') return value.trim();
    if (value && typeof value === 'object') {
      if (typeof value.note === 'string') return value.note.trim();
      if (typeof value.text === 'string') return value.text.trim();
    }
    return '';
  }
  function getLocationTitle(loc) {
    return loc?.name || loc?.Organization?.name || loc?.slug || '';
  }
  function normalizeCityName(value) {
    const text = String(value || '').trim();
    if (!text) return '';
    const lower = text.toLowerCase();
    return lower.replace(/(^|[\s-])([a-z])/g, (match, sep, letter) => `${sep}${letter.toUpperCase()}`);
  }
  function normalizeLocationCity(loc) {
    if (!loc || typeof loc !== 'object') return;
    if (loc.address && typeof loc.address === 'object' && loc.address.city) {
      loc.address.city = normalizeCityName(loc.address.city);
    }
    if (loc.Address && typeof loc.Address === 'object' && loc.Address.city) {
      loc.Address.city = normalizeCityName(loc.Address.city);
    }
    const physical = loc.PhysicalAddresses?.[0];
    if (physical && physical.city) {
      physical.city = normalizeCityName(physical.city);
    }
  }
  function getLocationAddress(loc) {
    const address = loc?.PhysicalAddresses?.[0];
    if (address) {
      return [
        address.address_1,
        normalizeCityName(address.city),
        address.state_province,
        address.postal_code
      ].filter(Boolean).join(', ');
    }
    const raw = loc?.address || loc?.Address;
    if (!raw) return '';
    if (typeof raw === 'string') return raw.trim();
    return [
      raw.street || raw.address_1 || raw.address1,
      normalizeCityName(raw.city),
      raw.region,
      raw.state || raw.state_province,
      raw.postalCode || raw.postal_code
    ].filter(Boolean).join(', ');
  }
  function normalizeEventRelatedInfos(source) {
    if (!source) return [];
    if (Array.isArray(source)) return source;
    if (Array.isArray(source.EventRelatedInfos)) return source.EventRelatedInfos;
    if (Array.isArray(source.eventRelatedInfos)) return source.eventRelatedInfos;
    if (source.EventRelatedInfo) return [source.EventRelatedInfo];
    if (source.eventRelatedInfo) return [source.eventRelatedInfo];
    if (source.EventRelatedInfos && typeof source.EventRelatedInfos === 'object') {
      return [source.EventRelatedInfos];
    }
    if (source.eventRelatedInfos && typeof source.eventRelatedInfos === 'object') {
      return [source.eventRelatedInfos];
    }
    return [];
  }
  function pickUserNameFromValue(value) {
    if (!value) return '';
    if (typeof value === 'string') return value.trim();
    if (typeof value === 'object') {
      const candidates = [
        value.userName,
        value.username,
        value.name,
        value.displayName,
        value.email
      ];
      for (const candidate of candidates) {
        if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
      }
    }
    return '';
  }
  function coerceTimestamp(value) {
    if (value == null) return null;
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value < 1e12 ? value * 1000 : value;
    }
    const parsed = Date.parse(String(value));
    if (!Number.isNaN(parsed)) return parsed;
    return null;
  }
  function getLocationClosureInfo(loc) {
    const infos = normalizeEventRelatedInfos(loc);
    const entry = infos.find((info) => {
      const event = String(info?.event || '').toUpperCase();
      return event === CLOSE_LOCATION_EVENT;
    }) || null;
    const messageRaw = entry?.information ?? entry?.message ?? null;
    const message = typeof messageRaw === 'string' ? messageRaw.trim() : (messageRaw == null ? '' : String(messageRaw));
    const userName = pickUserNameFromValue(entry?.userName)
      || pickUserNameFromValue(entry?.createdBy)
      || pickUserNameFromValue(entry?.updatedBy)
      || pickUserNameFromValue(entry?.author);
    const closedAt = (() => {
      if (!entry || typeof entry !== 'object') return null;
      const candidates = [
        entry.createdAt,
        entry.created_at,
        entry.updatedAt,
        entry.updated_at,
        entry.timestamp,
        entry.ts,
        entry.date
      ];
      for (const candidate of candidates) {
        const ts = coerceTimestamp(candidate);
        if (ts) return ts;
      }
      return null;
    })();
    const isClosed = !!entry && message !== '';
    return { isClosed, message, userName, closedAt, entry };
  }
  function getLocationPhone(loc) {
    const direct = [
      loc?.phone,
      loc?.phone_number,
      loc?.phoneNumber,
      loc?.phoneRaw,
      loc?.phone_raw
    ].find((value) => typeof value === 'string' && value.trim());
    if (direct) return String(direct).trim();
    const candidates = Array.isArray(loc?.Phones) ? loc.Phones : Array.isArray(loc?.phones) ? loc.phones : [];
    for (const entry of candidates) {
      const value = entry?.number || entry?.phoneNumber || entry?.phone || entry?.number_full || entry?.phone_raw;
      if (value && String(value).trim()) return String(value).trim();
    }
    return '';
  }
  function applyLocationClosureUpdate(loc, information) {
    if (!loc || typeof loc !== 'object') return;
    const existing = normalizeEventRelatedInfos(loc);
    const filtered = existing.filter((info) => {
      const event = String(info?.event || '').toUpperCase();
      return event !== CLOSE_LOCATION_EVENT;
    });
    if (information !== null && information !== undefined) {
      const message = String(information || '').trim();
      if (message) {
        filtered.push({
          event: CLOSE_LOCATION_EVENT,
          information: message,
          updatedAt: new Date().toISOString()
        });
      }
    }
    loc.EventRelatedInfos = filtered;
  }
  function refreshMarkerForLocation(loc) {
    if (!loc) return;
    const locId = getLocationId(loc, null);
    if (!locId) return;
    const marker = state.markers.get(locId);
    if (!marker) return;
    marker.__gghostLoc = loc;
    marker.setIcon(buildMarkerIcon(loc, { siteVisitPending: marker.__gghostSiteVisitPending === true }));
  }
  async function patchLocationClosure(locationId, information) {
    if (!locationId) throw new Error('Missing location id.');
    const url = `${API_BASE}/${locationId}`;
    const payload = {
      eventRelatedInfo: {
        information,
        event: CLOSE_LOCATION_EVENT
      }
    };
    const tokens = getServiceAuthTokens();
    let lastError = '';
    for (const token of tokens) {
      const headers = {
        accept: 'application/json, text/plain, */*',
        'Content-Type': 'application/json'
      };
      if (token) headers.authorization = token;
      const res = await fetch(url, {
        method: 'PATCH',
        headers,
        body: JSON.stringify(payload),
        mode: 'cors',
        credentials: 'include'
      });
      if (res.ok) return res.json().catch(() => null);
      lastError = await res.text().catch(() => '');
      if (res.status !== 401 && res.status !== 403) break;
    }
    throw new Error(lastError || 'Failed to update location closure.');
  }
  function getLocationPostalCode(loc) {
    const address = loc?.PhysicalAddresses?.[0];
    if (address?.postal_code) {
      const raw = String(address.postal_code).trim();
      const match = raw.match(/\d{5}/);
      return match ? match[0] : raw;
    }
    const raw = loc?.address || loc?.Address;
    if (!raw || typeof raw === 'string') return '';
    const value = String(raw.postalCode || raw.postal_code || '').trim();
    const match = value.match(/\d{5}/);
    return match ? match[0] : value;
  }
  function getLocationLatLng(loc) {
    const coords = loc?.position?.coordinates;
    if (Array.isArray(coords) && coords.length >= 2) {
      const lng = Number(coords[0]);
      const lat = Number(coords[1]);
      if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
    }
    const lat = Number(loc?.latitude ?? loc?.lat);
    const lng = Number(loc?.longitude ?? loc?.lng);
    if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
    return null;
  }
  function getLocationId(loc, position) {
    return loc?.id || loc?.location_id || loc?.slug || (position ? `${position.lat},${position.lng}` : null);
  }
  function getFirebaseBaseUrl() {
    return window.gghost?.baseURL || FIREBASE_BASE_URL;
  }
  function getFirebaseAuthToken() {
    const gghost = window.gghost;
    if (gghost && typeof gghost.getFirebaseAuthToken === 'function') {
      const token = gghost.getFirebaseAuthToken();
      if (typeof token === 'string' && token.trim()) return token.trim();
    }
    const directToken = gghost?.firebaseAuthToken;
    if (typeof directToken === 'string' && directToken.trim()) return directToken.trim();
    try {
      const storedToken = localStorage.getItem(FIREBASE_AUTH_TOKEN_STORAGE_KEY)
        || sessionStorage.getItem(FIREBASE_AUTH_TOKEN_STORAGE_KEY);
      if (storedToken && storedToken.trim()) return storedToken.trim();
    } catch (err) {
      // ignore storage access errors
    }
    return null;
  }
  function withFirebaseAuth(url) {
    const gghost = window.gghost;
    if (gghost && typeof gghost.withFirebaseAuth === 'function') return gghost.withFirebaseAuth(url);
    const token = getFirebaseAuthToken();
    if (!token) return url;
    const joiner = url.includes('?') ? '&' : '?';
    return `${url}${joiner}auth=${encodeURIComponent(token)}`;
  }
  function disableFirebaseWrites(reason) {
    firebaseWriteDisabled = true;
    if (!firebaseWriteDisableLogged) {
      console.warn('[gghost-team-map] Disabling RTDB writes:', reason);
      firebaseWriteDisableLogged = true;
    }
  }
  function getLocationUuid(loc) {
    const candidates = [loc?.id, loc?.location_id, loc?.uuid, loc?.slug];
    for (const candidate of candidates) {
      if (typeof candidate !== 'string') continue;
      const trimmed = candidate.trim();
      if (UUID_RE.test(trimmed)) return trimmed;
    }
    return null;
  }
  function coerceStatTimestamp(value) {
    if (value == null) return null;
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value < 1e12 ? value * 1000 : value;
    }
    const parsed = Date.parse(String(value));
    if (!Number.isNaN(parsed)) return parsed;
    return null;
  }
  function buildStatKey(prefix, value) {
    const ts = coerceStatTimestamp(value);
    if (Number.isFinite(ts)) return `${prefix}${ts}`;
    const safe = String(value || '')
      .trim()
      .toLowerCase()
      .replace(/[.#$/\[\]]/g, '_');
    if (!safe) return null;
    return `${prefix}${safe}`;
  }
  function enqueueStatsWrite(task) {
    if (typeof task !== 'function') return;
    statsQueue.push(task);
    pumpStatsQueue();
  }
  function pumpStatsQueue() {
    while (statsActiveCount < STATS_WRITE_MAX_CONCURRENCY && statsQueue.length) {
      const task = statsQueue.shift();
      statsActiveCount += 1;
      Promise.resolve()
        .then(task)
        .catch(() => {})
        .finally(() => {
          statsActiveCount -= 1;
          pumpStatsQueue();
        });
    }
  }
  async function writeLocationStatEntry(uuid, key, payload) {
    if (!uuid || !key || !payload) return;
    if (firebaseWriteDisabled) return;
    const firebaseToken = getFirebaseAuthToken();
    if (!firebaseToken) {
      if (!firebaseWriteMissingTokenLogged) {
        console.warn('[gghost-team-map] Skipping RTDB stat write: missing auth token');
        firebaseWriteMissingTokenLogged = true;
      }
      return;
    }
    firebaseWriteMissingTokenLogged = false;
    const cacheKey = `${uuid}::${key}`;
    if (statsWriteOk.has(cacheKey)) return;
    if (statsWriteInFlight.has(cacheKey)) return statsWriteInFlight.get(cacheKey);
    const url = withFirebaseAuth(`${getFirebaseBaseUrl()}locationNotes/${uuid}/stats/${key}.json`);
    const req = fetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).then((res) => {
      if (!res.ok) {
        if (res.status === 401 || res.status === 403) disableFirebaseWrites(`HTTP ${res.status}`);
        throw new Error(`HTTP ${res.status}`);
      }
      statsWriteOk.add(cacheKey);
    }).catch((err) => {
      console.warn('[gghost-team-map] Failed to write stat', err);
    }).finally(() => {
      statsWriteInFlight.delete(cacheKey);
    });
    statsWriteInFlight.set(cacheKey, req);
    return req;
  }
  function getLocationUpdateDate(data) {
    if (!data || typeof data !== 'object') return null;
    const dates = [
      data.updatedAt,
      data.updated_at,
      data.createdAt,
      data.created_at,
      data.Organization?.updatedAt,
      data.Organization?.updated_at,
      data.Organization?.createdAt,
      data.Organization?.created_at
    ];
    const address = data.PhysicalAddresses?.[0];
    if (address?.updatedAt) dates.push(address.updatedAt);
    if (address?.updated_at) dates.push(address.updated_at);
    if (address?.createdAt) dates.push(address.createdAt);
    if (address?.created_at) dates.push(address.created_at);
    const rawAddress = data.address || data.Address;
    if (rawAddress?.updatedAt) dates.push(rawAddress.updatedAt);
    if (rawAddress?.updated_at) dates.push(rawAddress.updated_at);
    if (rawAddress?.createdAt) dates.push(rawAddress.createdAt);
    if (rawAddress?.created_at) dates.push(rawAddress.created_at);
    const services = Array.isArray(data.Services)
      ? data.Services
      : (Array.isArray(data.services) ? data.services : []);
    services.forEach(service => {
      if (service?.updatedAt) dates.push(service.updatedAt);
      if (service?.updated_at) dates.push(service.updated_at);
      if (service?.createdAt) dates.push(service.createdAt);
      if (service?.created_at) dates.push(service.created_at);
    });
    return pickLatestDate(dates);
  }
  function recordLocationStatsFromPayload(uuid, data, meta = {}) {
    if (!uuid || !data || typeof data !== 'object') return;
    const lastValidated = data.last_validated_at || data.lastValidated || null;
    const updatedAt = getLocationUpdateDate(data);
    if (lastValidated) {
      const key = buildStatKey('v_', lastValidated);
      if (key) {
        enqueueStatsWrite(() => writeLocationStatEntry(uuid, key, {
          lastValidated,
          kind: 'validation',
          ...meta
        }));
      }
    }
    if (updatedAt) {
      const key = buildStatKey('u_', updatedAt);
      if (key) {
        enqueueStatsWrite(() => writeLocationStatEntry(uuid, key, {
          updatedAt,
          kind: 'update',
          ...meta
        }));
      }
    }
  }
  function recordLocationStatsFromLocations(locations) {
    if (!Array.isArray(locations) || !locations.length) return;
    locations.forEach((loc) => {
      const uuid = getLocationUuid(loc);
      if (!uuid) return;
      recordLocationStatsFromPayload(uuid, loc, { source: 'team-map' });
    });
  }
  function monthKey(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }
  function monthKeyFromParts(y, m) {
    const mm = String(m + 1).padStart(2, '0');
    return `${y}-${mm}`;
  }
  function parseMonthKey(k) {
    const [y, m] = k.split('-').map(Number);
    return { y, m: m - 1 };
  }
  function incMonth(y, m, n = 1) {
    const d = new Date(y, m + n, 1);
    return { y: d.getFullYear(), m: d.getMonth() };
  }
  function monthsBetween(aKey, bKey) {
    const a = parseMonthKey(aKey);
    const b = parseMonthKey(bKey);
    return (b.y - a.y) * 12 + (b.m - a.m);
  }
  function formatMonthShort(k) {
    const { y, m } = parseMonthKey(k);
    return new Date(y, m, 1).toLocaleDateString('en-US', {
      month: 'short',
      year: '2-digit'
    });
  }
  function buildAdaptiveMonthBuckets(dates, limit = 12) {
    if (!Array.isArray(dates) || dates.length === 0) return [];
    const counts = new Map();
    for (const d of dates) {
      const k = monthKey(d);
      counts.set(k, (counts.get(k) || 0) + 1);
    }
    const keys = Array.from(counts.keys()).sort();
    const firstKey = keys[0];
    const lastKey = keys[keys.length - 1];
    const span = monthsBetween(firstKey, lastKey) + 1;
    let startKey;
    let endKey;
    if (span <= limit) {
      startKey = firstKey;
      endKey = lastKey;
    } else {
      const { y, m } = parseMonthKey(lastKey);
      const start = incMonth(y, m, -(limit - 1));
      startKey = monthKeyFromParts(start.y, start.m);
      endKey = lastKey;
    }
    const ks = [];
    let cur = parseMonthKey(startKey);
    const end = parseMonthKey(endKey);
    while (true) {
      ks.push(monthKeyFromParts(cur.y, cur.m));
      if (cur.y === end.y && cur.m === end.m) break;
      cur = incMonth(cur.y, cur.m, 1);
    }
    return ks.map(k => ({ key: k, count: counts.get(k) || 0 }));
  }
  function renderUpdateChartSVG(buckets, opts = {}) {
    const w = opts.width || 320;
    const h = opts.height || 120;
    const pad = opts.pad || 24;
    const max = Math.max(1, ...buckets.map(b => b.count));
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('width', w);
    svg.setAttribute('height', h);
    svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    const axis = document.createElementNS(ns, 'line');
    axis.setAttribute('x1', pad);
    axis.setAttribute('y1', h - pad);
    axis.setAttribute('x2', w - pad);
    axis.setAttribute('y2', h - pad);
    axis.setAttribute('stroke', '#ddd');
    axis.setAttribute('stroke-width', '1');
    svg.appendChild(axis);
    const bw = (w - pad * 2) / buckets.length;
    const points = buckets.map((b, i) => {
      const x = pad + i * bw + bw / 2;
      const y = h - pad - Math.round(((h - pad * 2) * b.count) / max);
      return [x, y];
    });
    const path = document.createElementNS(ns, 'path');
    const d = points
      .map((p, i) => (i === 0 ? `M ${p[0]} ${p[1]}` : `L ${p[0]} ${p[1]}`))
      .join(' ');
    path.setAttribute('d', d);
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', '#2563eb');
    path.setAttribute('stroke-width', '2');
    svg.appendChild(path);
    for (let i = 0; i < points.length; i++) {
      const [x, y] = points[i];
      const bucket = buckets[i];
      const c = document.createElementNS(ns, 'circle');
      c.setAttribute('cx', x);
      c.setAttribute('cy', y);
      c.setAttribute('r', '2.5');
      c.setAttribute('fill', '#2563eb');
      const title = document.createElementNS(ns, 'title');
      title.textContent = `${formatMonthShort(bucket.key)}: ${bucket.count}`;
      c.appendChild(title);
      svg.appendChild(c);
    }
    const first = buckets[0]?.key || '';
    const last = buckets[buckets.length - 1]?.key || '';
    const total = buckets.reduce((sum, b) => sum + b.count, 0);
    const label = document.createElementNS(ns, 'text');
    label.setAttribute('x', pad);
    label.setAttribute('y', pad - 8);
    label.setAttribute('font-size', '11');
    label.setAttribute('fill', '#333');
    label.textContent = `Updates by month (loaded) - total ${total}`;
    svg.appendChild(label);
    const leftLabel = document.createElementNS(ns, 'text');
    leftLabel.setAttribute('x', pad);
    leftLabel.setAttribute('y', h - 6);
    leftLabel.setAttribute('font-size', '10');
    leftLabel.setAttribute('fill', '#666');
    leftLabel.textContent = formatMonthShort(first);
    svg.appendChild(leftLabel);
    const rightLabel = document.createElementNS(ns, 'text');
    rightLabel.setAttribute('x', w - pad);
    rightLabel.setAttribute('y', h - 6);
    rightLabel.setAttribute('text-anchor', 'end');
    rightLabel.setAttribute('font-size', '10');
    rightLabel.setAttribute('fill', '#666');
    rightLabel.textContent = formatMonthShort(last);
    svg.appendChild(rightLabel);
    return svg;
  }
  function buildMarkerIcon(loc, options = {}) {
    const bucket = getRecencyBucket(getLocationRecencyDate(loc));
    const color = getRecencyMarkerColor(bucket);
    const size = getMarkerSizePx(loc);
    const theme = getThemeCategory(loc);
    const closureInfo = getLocationClosureInfo(loc);
    return buildSvgMarkerIcon(theme, color, size, { ...options, closed: closureInfo.isClosed });
  }
  function buildSearchMarkerIcon() {
    const sizePx = 24;
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="${sizePx}" height="${sizePx}" viewBox="0 0 24 24">
        <path d="M12 2c-3.31 0-6 2.69-6 6 0 4.34 6 12 6 12s6-7.66 6-12c0-3.31-2.69-6-6-6z" fill="#2563eb" stroke="#ffffff" stroke-width="1.5"/>
        <circle cx="12" cy="8" r="2.5" fill="#ffffff"/>
      </svg>
    `;
    return {
      url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
      scaledSize: new google.maps.Size(sizePx, sizePx),
      anchor: new google.maps.Point(sizePx / 2, sizePx)
    };
  }
  function buildMarkerZIndex(loc) {
    const count = getServiceCount(loc);
    return 1000000 + count;
  }
  function getCachedSiteVisitDone(uuid) {
    if (!uuid) return null;
    const cached = siteVisitState.cache.get(uuid);
    if (!cached) return null;
    if (Date.now() - cached.timestamp > SITE_VISIT_CACHE_TTL_MS) {
      siteVisitState.cache.delete(uuid);
      return null;
    }
    return cached.done;
  }
  function setCachedSiteVisitDone(uuid, done) {
    if (!uuid || typeof done !== 'boolean') return;
    siteVisitState.cache.set(uuid, { done, timestamp: Date.now() });
  }
  function parseBooleanValue(value) {
    if (value === true || value === false) return value;
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      if (normalized === 'true') return true;
      if (normalized === 'false') return false;
    }
    return null;
  }
  async function fetchSiteVisitDone(uuid) {
    const url = `${getFirebaseBaseUrl()}siteVisits/${uuid}/meta/done.json`;
    try {
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) return null;
      const data = await res.json();
      const done = parseBooleanValue(data);
      if (done === null) return null;
      setCachedSiteVisitDone(uuid, done);
      return done;
    } catch (err) {
      console.warn('[gghost-team-map] Failed to load site visit status', err);
      return null;
    }
  }
  function resolveSiteVisitDone(uuid) {
    const cached = getCachedSiteVisitDone(uuid);
    if (cached !== null) return Promise.resolve(cached);
    const pending = siteVisitState.pending.get(uuid);
    if (pending) return pending;
    const fetchPromise = fetchSiteVisitDone(uuid)
      .finally(() => siteVisitState.pending.delete(uuid));
    siteVisitState.pending.set(uuid, fetchPromise);
    return fetchPromise;
  }
  function applySiteVisitIndicator(marker, loc) {
    if (!marker || !loc) return;
    const uuid = getLocationUuid(loc);
    if (!uuid) return;
    const cached = getCachedSiteVisitDone(uuid);
    if (cached !== null) {
      updateMarkerSiteVisit(marker, loc, cached === false);
      return;
    }
    resolveSiteVisitDone(uuid).then((done) => {
      if (done === null) return;
      if (!marker.getMap || !marker.getMap()) return;
      const currentUuid = getLocationUuid(marker.__gghostLoc || loc);
      if (currentUuid !== uuid) return;
      updateMarkerSiteVisit(marker, marker.__gghostLoc || loc, done === false);
    });
  }
  function updateMarkerSiteVisit(marker, loc, pending) {
    if (!marker || !loc) return;
    if (marker.__gghostSiteVisitPending === pending) return;
    marker.__gghostSiteVisitPending = pending;
    const icon = buildMarkerIcon(loc, { siteVisitPending: pending });
    marker.setIcon(icon);
  }
  function clearMarkers() {
    state.markers.forEach(marker => marker.setMap(null));
    state.markers.clear();
  }
  function applyDefaultMarkerHiding(map) {
    if (!map || map.__gghostHideApplied) return;
    map.__gghostHideApplied = true;
    const existing = Array.isArray(map.get('styles')) ? map.get('styles') : [];
    const hidePoi = [
      { featureType: 'poi', elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
      { featureType: 'poi', elementType: 'labels.text', stylers: [{ visibility: 'off' }] }
    ];
    map.setOptions({ styles: existing.concat(hidePoi), clickableIcons: false });
    injectHideMarkerStyles();
  }
  function injectHideMarkerStyles() {
    const styleId = 'gghost-hide-default-markers';
    if (document.getElementById(styleId)) return;
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      gmp-advanced-marker {
        opacity: 0 !important;
        pointer-events: none !important;
      }
      .gm-style img[src*="marker"],
      .gm-style img[src*="spotlight"],
      .gm-style img[src*="pin"] {
        opacity: 0 !important;
        pointer-events: none !important;
      }
    `;
    document.head.appendChild(style);
  }
  function patchFullStory() {
    if (window.__gghostTeamMapPinsFullStoryPatched) return;
    window.__gghostTeamMapPinsFullStoryPatched = true;
    const shouldBlock = (input) => {
      const url = typeof input === 'string' ? input : input?.url;
      return url && url.includes('rs.fullstory.com/rec/');
    };
    const originalFetch = window.fetch;
    if (typeof originalFetch === 'function') {
      window.fetch = function () {
        if (shouldBlock(arguments[0])) {
          return Promise.resolve(new Response('', { status: 204 }));
        }
        return originalFetch.apply(this, arguments);
      };
    }
    const originalBeacon = navigator.sendBeacon;
    if (typeof originalBeacon === 'function') {
      navigator.sendBeacon = function (url) {
        if (shouldBlock(url)) return true;
        return originalBeacon.apply(this, arguments);
      };
    }
  }
  function initSearchBridge() {
    if (searchState.observer) return;
    loadSearchSettings();
    searchState.observer = new MutationObserver((mutations) => {
      if (!state.active) return;
      if (shouldIgnoreSearchUiMutations(mutations)) return;
      attachSearchInput();
      scheduleSearchDecorate();
    });
    searchState.observer.observe(document.documentElement, { childList: true, subtree: true });
    attachSearchInput();
    attachSearchUiListeners();
    scheduleSearchDecorate();
  }
  function detachSearchBridge() {
    if (searchState.observer) {
      searchState.observer.disconnect();
      searchState.observer = null;
    }
    if (searchState.closeFilterHandler) {
      document.removeEventListener('mousedown', searchState.closeFilterHandler);
      searchState.closeFilterHandler = null;
    }
    if (searchState.viewportHandler) {
      window.removeEventListener('scroll', searchState.viewportHandler, true);
      window.removeEventListener('resize', searchState.viewportHandler);
      searchState.viewportHandler = null;
    }
    cleanupSearchUi();
    searchState.input = null;
    searchState.inputGroup = null;
    searchState.decoratePending = false;
    searchState.savedQueryApplied = false;
  }
  function attachSearchInput() {
    const input = document.querySelector(SEARCH_INPUT_SELECTOR);
    if (!input) return;
    if (searchState.input && searchState.input !== input) {
      searchState.savedQueryApplied = false;
    }
    searchState.input = input;
    if (!input.__gghostSearchHooked) {
      input.__gghostSearchHooked = true;
      const handleInput = () => {
        saveSearchQuery(input.value || '');
        updateClearButtonState();
        scheduleSearchDecorate();
      };
      input.addEventListener('input', handleInput);
      input.addEventListener('focus', handleInput);
    }
    ensureSearchUi();
    applySavedSearchQuery(input);
    updateClearButtonState();
  }
  function scheduleSearchDecorate() {
    if (searchState.decoratePending) return;
    searchState.decoratePending = true;
    requestAnimationFrame(() => {
      searchState.decoratePending = false;
      decorateSearchResults();
    });
  }
  function decorateSearchResults() {
    const input = searchState.input || document.querySelector(SEARCH_INPUT_SELECTOR);
    if (!input) return;
    ensureSearchUi();
    const rawQuery = String(input.value || '');
    const query = normalizeSearchText(rawQuery);
    const useCustom = shouldUseCustomResults(query);
    if (useCustom) {
      renderCustomResults(query, rawQuery);
      toggleNativeSearchResults(false);
      return;
    }
    hideCustomResults();
    toggleNativeSearchResults(true);
    if (!query) {
      hideSearchOverlay();
      return;
    }
    const items = document.querySelectorAll(SEARCH_RESULT_SELECTOR);
    items.forEach(item => decorateSearchItem(item, query));
  }
  function decorateSearchItem(item, query) {
    if (!item) return;
    const text = normalizeSearchText(item.textContent || '');
    if (!text) return;
    const match = findBestLocationMatch(text, query);
    if (!match) {
      item.removeAttribute('data-gghost-location-id');
      item.removeAttribute('data-gghost-location-score');
      return;
    }
    item.dataset.gghostLocationId = match.entry.id;
    item.dataset.gghostLocationScore = String(Math.round(match.score));
    attachSearchResultInteractions(item);
  }
  function refreshSearchEntries(locations) {
    if (!Array.isArray(locations)) {
      state.searchEntries = [];
      return;
    }
    const entries = [];
    locations.forEach((loc) => {
      const position = getLocationLatLng(loc);
      const id = getLocationId(loc, position);
      if (!id) return;
      const services = Array.isArray(loc?.Services)
        ? loc.Services
        : (Array.isArray(loc?.services) ? loc.services : []);
      const serviceNames = [];
      const serviceDescriptions = [];
      const eventTexts = [];
      const taxonomyNames = [];
      services.forEach((service) => {
        const serviceName = normalizeSearchText(service?.name);
        if (serviceName) serviceNames.push(serviceName);
        const descriptionParts = [
          service?.description,
          service?.additional_info,
          service?.fees,
          service?.interpretation_services
        ];
        descriptionParts.forEach((part) => {
          const serviceDescription = normalizeSearchText(stripHtml(part));
          if (serviceDescription) serviceDescriptions.push(serviceDescription);
        });
        if (Array.isArray(service?.EventRelatedInfos)) {
          service.EventRelatedInfos.forEach((info) => {
            collectStringValues(info).forEach((value) => {
              const eventText = normalizeSearchText(stripHtml(value));
              if (eventText) eventTexts.push(eventText);
            });
          });
        }
        if (Array.isArray(service?.Taxonomies)) {
          service.Taxonomies.forEach((taxonomy) => {
            const taxonomyName = normalizeSearchText(taxonomy?.name);
            if (taxonomyName) taxonomyNames.push(taxonomyName);
          });
        }
      });
      if (Array.isArray(loc?.EventRelatedInfos)) {
        loc.EventRelatedInfos.forEach((info) => {
          collectStringValues(info).forEach((value) => {
            const eventText = normalizeSearchText(stripHtml(value));
            if (eventText) eventTexts.push(eventText);
          });
        });
      }
      const orgValue = String(loc?.Organization?.name || '').trim();
      const nameValue = String(loc?.name || '').trim();
      const slugValue = String(loc?.slug || '').trim();
      const addressValue = String(getLocationAddress(loc) || '').trim();
      const postalCodeValue = String(getLocationPostalCode(loc) || '').trim();
      const orgNormalized = normalizeSearchText(orgValue);
      const nameNormalized = normalizeSearchText(nameValue);
      const slugNormalized = normalizeSearchText(slugValue);
      const addressNormalized = normalizeSearchText(addressValue);
      const locationDescription = normalizeSearchText(stripHtml(loc?.description || loc?.additional_info));
      const orgDescription = normalizeSearchText(stripHtml(loc?.Organization?.description));
      const description = [locationDescription, orgDescription, ...serviceDescriptions, ...eventTexts]
        .filter(Boolean)
        .join(' ')
        .trim();
      const searchBlob = [
        orgNormalized,
        nameNormalized,
        slugNormalized,
        addressNormalized,
        postalCodeValue,
        ...serviceNames,
        ...taxonomyNames,
        ...eventTexts,
        description
      ].filter(Boolean).join(' ').trim();
      entries.push({
        id: String(id),
        loc,
        position,
        name: nameNormalized,
        org: orgNormalized,
        slug: slugNormalized,
        address: addressNormalized,
        postalCode: postalCodeValue,
        serviceNames,
        taxonomyNames,
        serviceDescriptions,
        eventTexts,
        description,
        searchBlob,
        orgValue,
        nameValue,
        addressValue,
        slugValue
      });
    });
    state.searchEntries = entries;
  }
  function findBestLocationMatch(itemText, query) {
    if (!state.searchEntries.length || !itemText) return null;
    const normalizedItem = normalizeSearchText(itemText);
    const normalizedQuery = normalizeSearchText(query || '');
    const center = state.map?.getCenter?.();
    const centerPoint = center ? { lat: center.lat(), lng: center.lng() } : null;
    let best = null;
    state.searchEntries.forEach((entry) => {
      const score = scoreLocationQuery(normalizedItem, normalizedQuery, entry, centerPoint);
      if (!best || score > best.score) {
        best = { entry, score };
      }
    });
    if (!best || best.score < SEARCH_MATCH_MIN_SCORE) return null;
    return best;
  }
  function scoreLocationQuery(itemText, query, entry, centerPoint) {
    const fields = [entry.org, entry.name, entry.slug, entry.address].filter(Boolean);
    let score = 0;
    fields.forEach((field) => {
      if (itemText === field) {
        score = Math.max(score, 100);
        return;
      }
      if (field.startsWith(itemText)) {
        score = Math.max(score, 92);
        return;
      }
      if (field.includes(itemText)) {
        score = Math.max(score, 80);
        return;
      }
      const tokenScore = scoreTokenOverlap(itemText, field);
      score = Math.max(score, tokenScore);
    });
    if (query) {
      fields.forEach((field) => {
        if (!field) return;
        if (field.startsWith(query)) score = Math.max(score, 70);
        if (field.includes(query)) score = Math.max(score, 60);
      });
    }
    if (centerPoint && entry.position) {
      const dist = haversineMeters(centerPoint.lat, centerPoint.lng, entry.position.lat, entry.position.lng);
      if (Number.isFinite(dist)) {
        score -= Math.min(12, dist / 1500);
      }
    }
    return score;
  }
  function scoreTokenOverlap(source, target) {
    const tokens = normalizeSearchText(source).split(' ').filter(Boolean);
    if (!tokens.length || !target) return 0;
    let matches = 0;
    tokens.forEach((token) => {
      if (target.includes(token)) matches += 1;
    });
    if (!matches) return 0;
    return 60 + Math.round((matches / tokens.length) * 15);
  }
  function normalizeSearchText(value) {
    return String(value || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }
  function stripHtml(value) {
    return String(value || '')
      .replace(/<[^>]*>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
  function collectStringValues(obj) {
    if (!obj || typeof obj !== 'object') return [];
    const values = [];
    Object.keys(obj).forEach((key) => {
      const value = obj[key];
      if (typeof value === 'string') values.push(value);
    });
    return values;
  }
  function loadSearchSettings() {
    if (searchState.loadedSettings) return;
    searchState.loadedSettings = true;
    try {
      const stored = localStorage.getItem(SEARCH_FILTERS_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed && typeof parsed === 'object') {
          searchState.filters = { ...DEFAULT_SEARCH_FILTERS, ...parsed };
        }
      }
    } catch (err) {
      // ignore storage parsing errors
    }
    try {
      const storedQuery = localStorage.getItem(SEARCH_QUERY_STORAGE_KEY);
      if (storedQuery && typeof storedQuery === 'string') {
        searchState.savedQuery = storedQuery;
      }
    } catch (err) {
      // ignore storage errors
    }
  }
  function saveSearchFilters() {
    try {
      localStorage.setItem(SEARCH_FILTERS_STORAGE_KEY, JSON.stringify(searchState.filters || DEFAULT_SEARCH_FILTERS));
    } catch (err) {
      // ignore storage failures
    }
  }
  function saveSearchQuery(value) {
    try {
      if (!value) {
        localStorage.removeItem(SEARCH_QUERY_STORAGE_KEY);
        searchState.savedQuery = '';
      } else {
        localStorage.setItem(SEARCH_QUERY_STORAGE_KEY, value);
        searchState.savedQuery = value;
      }
    } catch (err) {
      // ignore storage failures
    }
  }
  function applySavedSearchQuery(input) {
    if (!input || searchState.savedQueryApplied) return;
    if (!searchState.savedQuery) return;
    if (input.value && String(input.value).trim()) return;
    searchState.savedQueryApplied = true;
    input.value = searchState.savedQuery;
    scheduleSearchDecorate();
  }
  function shouldIgnoreSearchUiMutations(mutations) {
    if (!mutations || !mutations.length) return false;
    return mutations.every((mutation) => isSearchUiMutation(mutation));
  }
  function isSearchUiMutation(mutation) {
    if (!mutation) return true;
    if (isSearchUiNode(mutation.target)) return true;
    for (const node of mutation.addedNodes || []) {
      if (!isSearchUiNode(node)) return false;
    }
    for (const node of mutation.removedNodes || []) {
      if (!isSearchUiNode(node)) return false;
    }
    return true;
  }
  function isSearchUiNode(node) {
    if (!node) return false;
    const element = node.nodeType === 1 ? node : node.parentElement;
    if (!element) return false;
    if (element.closest('[data-gghost-search-ui="true"]')) return true;
    if (element.closest('[data-gghost-notes-ui="true"]')) return true;
    if (searchState.resultsContainer && searchState.resultsContainer.contains(element)) return true;
    if (searchState.overlay && searchState.overlay.contains(element)) return true;
    if (searchState.filterPanel && searchState.filterPanel.contains(element)) return true;
    if (searchState.filterButtonWrap && searchState.filterButtonWrap.contains(element)) return true;
    if (searchState.clearButtonWrap && searchState.clearButtonWrap.contains(element)) return true;
    if (notesState.overlay && notesState.overlay.contains(element)) return true;
    return false;
  }
  function attachSearchUiListeners() {
    if (searchState.closeFilterHandler) return;
    searchState.closeFilterHandler = (event) => {
      const panel = searchState.filterPanel;
      if (!panel || panel.style.display !== 'block') return;
      const target = event.target;
      if (panel.contains(target) || searchState.filterButton?.contains(target)) return;
      panel.style.display = 'none';
    };
    document.addEventListener('mousedown', searchState.closeFilterHandler);
    searchState.viewportHandler = () => {
      if (searchState.filterPanel?.style.display === 'block') {
        positionFilterPanel();
      }
      if (searchState.resultsContainer?.style.display === 'block') {
        positionSearchResultsContainer();
      }
      if (searchState.overlay?.style.display === 'block') {
        hideSearchOverlay();
      }
    };
    window.addEventListener('scroll', searchState.viewportHandler, true);
    window.addEventListener('resize', searchState.viewportHandler);
  }
  function cleanupSearchUi() {
    hideSearchOverlay(true);
    hideCustomResults();
    if (searchState.resultsContainer) {
      searchState.resultsContainer.remove();
      searchState.resultsContainer = null;
    }
    if (searchState.filterPanel) {
      searchState.filterPanel.remove();
      searchState.filterPanel = null;
    }
    if (searchState.filterButtonWrap) {
      searchState.filterButtonWrap.remove();
      searchState.filterButtonWrap = null;
    }
    if (searchState.clearButtonWrap) {
      searchState.clearButtonWrap.remove();
      searchState.clearButtonWrap = null;
    }
    searchState.filterButton = null;
    searchState.filterControls = null;
    searchState.clearButton = null;
  }
  function ensureSearchUi() {
    const input = searchState.input || document.querySelector(SEARCH_INPUT_SELECTOR);
    if (!input) return;
    const group = input.closest('.input-group') || input.parentElement;
    if (!group) return;
    searchState.inputGroup = group;
    ensureClearButton(group);
    ensureFilterButton(group);
    ensureCustomResultsContainer();
  }
  function ensureFilterButton(group) {
    if (!group) return;
    if (searchState.filterButton && document.contains(searchState.filterButton)) {
      if (group.contains(searchState.filterButton)) return;
      if (searchState.filterButtonWrap) searchState.filterButtonWrap.remove();
      searchState.filterButtonWrap = null;
      searchState.filterButton = null;
    }
    const existingWrap = group.querySelector('[data-gghost-search-filter]');
    if (existingWrap) {
      searchState.filterButtonWrap = existingWrap;
      searchState.filterButton = existingWrap.querySelector('button');
      updateFilterButtonState();
      return;
    }
    const wrap = document.createElement('div');
    wrap.className = 'input-group-append';
    wrap.dataset.gghostSearchFilter = 'true';
    wrap.dataset.gghostSearchUi = 'true';
    Object.assign(wrap.style, {
      display: 'flex',
      alignItems: 'center',
      borderLeft: '1px solid #e0e0e0'
    });
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = 'Filter';
    Object.assign(btn.style, {
      background: '#fff',
      border: 'none',
      borderRadius: '0',
      color: '#333',
      fontSize: '12px',
      padding: '0 12px',
      height: '100%',
      cursor: 'pointer'
    });
    btn.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      toggleFilterPanel();
    });
    wrap.appendChild(btn);
    group.appendChild(wrap);
    searchState.filterButton = btn;
    searchState.filterButtonWrap = wrap;
    updateFilterButtonState();
  }
  function ensureClearButton(group) {
    if (!group) return;
    if (searchState.clearButton && document.contains(searchState.clearButton)) {
      if (group.contains(searchState.clearButton)) {
        updateClearButtonState();
        return;
      }
      if (searchState.clearButtonWrap) searchState.clearButtonWrap.remove();
      searchState.clearButtonWrap = null;
      searchState.clearButton = null;
    }
    const existingWrap = group.querySelector('[data-gghost-search-clear]');
    if (existingWrap) {
      searchState.clearButtonWrap = existingWrap;
      searchState.clearButton = existingWrap.querySelector('button');
      updateClearButtonState();
      return;
    }
    const wrap = document.createElement('div');
    wrap.className = 'input-group-append';
    wrap.dataset.gghostSearchClear = 'true';
    wrap.dataset.gghostSearchUi = 'true';
    Object.assign(wrap.style, {
      display: 'flex',
      alignItems: 'center',
      borderLeft: '1px solid #e0e0e0'
    });
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = '×';
    btn.title = 'Clear search';
    Object.assign(btn.style, {
      background: '#fff',
      border: 'none',
      borderRadius: '0',
      color: '#666',
      fontSize: '16px',
      padding: '0 10px',
      height: '100%',
      cursor: 'pointer',
      lineHeight: '1'
    });
    btn.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (searchState.input) {
        searchState.input.value = '';
        saveSearchQuery('');
        updateClearButtonState();
        hideCustomResults();
        hideSearchOverlay();
        searchState.input.focus();
        scheduleSearchDecorate();
      }
    });
    wrap.appendChild(btn);
    if (searchState.filterButtonWrap && group.contains(searchState.filterButtonWrap)) {
      group.insertBefore(wrap, searchState.filterButtonWrap);
    } else {
      group.appendChild(wrap);
    }
    searchState.clearButton = btn;
    searchState.clearButtonWrap = wrap;
    updateClearButtonState();
  }
  function toggleFilterPanel() {
    const panel = ensureFilterPanel();
    if (!panel) return;
    const isOpen = panel.style.display === 'block';
    panel.style.display = isOpen ? 'none' : 'block';
    if (!isOpen) positionFilterPanel();
  }
  function ensureFilterPanel() {
    if (searchState.filterPanel && document.contains(searchState.filterPanel)) {
      return searchState.filterPanel;
    }
    const panel = buildFilterPanel();
    if (!panel) return null;
    document.body.appendChild(panel);
    searchState.filterPanel = panel;
    return panel;
  }
  function buildFilterPanel() {
    const panel = document.createElement('div');
    panel.dataset.gghostSearchUi = 'true';
    panel.style.display = 'none';
    panel.style.position = 'fixed';
    panel.style.zIndex = '100001';
    panel.style.background = '#fff';
    panel.style.border = '1px solid #d0d0d0';
    panel.style.borderRadius = '8px';
    panel.style.boxShadow = '0 8px 18px rgba(0, 0, 0, 0.18)';
    panel.style.padding = '10px';
    panel.style.width = '260px';
    panel.style.fontSize = '12px';
    panel.style.color = '#1f1f1f';
    const buildRow = (labelText, control) => {
      const row = document.createElement('div');
      row.style.marginBottom = '8px';
      const label = document.createElement('div');
      label.textContent = labelText;
      label.style.fontWeight = '600';
      label.style.fontSize = '11px';
      label.style.marginBottom = '4px';
      row.appendChild(label);
      row.appendChild(control);
      panel.appendChild(row);
    };
    const fieldSelect = document.createElement('select');
    fieldSelect.style.width = '100%';
    fieldSelect.style.padding = '4px 6px';
    fieldSelect.style.fontSize = '12px';
    SEARCH_FIELD_OPTIONS.forEach((option) => {
      const opt = document.createElement('option');
      opt.value = option.value;
      opt.textContent = option.label;
      if (searchState.filters.field === option.value) opt.selected = true;
      fieldSelect.appendChild(opt);
    });
    fieldSelect.addEventListener('change', () => {
      updateSearchFilters({ field: fieldSelect.value });
    });
    buildRow('Search field', fieldSelect);
    const taxonomyInput = document.createElement('input');
    taxonomyInput.type = 'text';
    taxonomyInput.placeholder = 'e.g. employment';
    taxonomyInput.value = searchState.filters.taxonomy || '';
    taxonomyInput.style.width = '100%';
    taxonomyInput.style.padding = '4px 6px';
    taxonomyInput.style.fontSize = '12px';
    taxonomyInput.addEventListener('input', () => {
      updateSearchFilters({ taxonomy: taxonomyInput.value });
    });
    buildRow('Taxonomy contains', taxonomyInput);
    const serviceInput = document.createElement('input');
    serviceInput.type = 'text';
    serviceInput.placeholder = 'e.g. resume';
    serviceInput.value = searchState.filters.service || '';
    serviceInput.style.width = '100%';
    serviceInput.style.padding = '4px 6px';
    serviceInput.style.fontSize = '12px';
    serviceInput.addEventListener('input', () => {
      updateSearchFilters({ service: serviceInput.value });
    });
    buildRow('Service contains', serviceInput);
    const ageSelect = document.createElement('select');
    ageSelect.style.width = '100%';
    ageSelect.style.padding = '4px 6px';
    ageSelect.style.fontSize = '12px';
    AGE_GROUP_OPTIONS.forEach((option) => {
      const opt = document.createElement('option');
      opt.value = option.value;
      opt.textContent = option.label;
      if (searchState.filters.age === option.value) opt.selected = true;
      ageSelect.appendChild(opt);
    });
    ageSelect.addEventListener('change', () => {
      updateSearchFilters({ age: ageSelect.value });
    });
    buildRow('Age focus', ageSelect);
    const actions = document.createElement('div');
    actions.style.display = 'flex';
    actions.style.gap = '6px';
    const resetBtn = document.createElement('button');
    resetBtn.type = 'button';
    resetBtn.textContent = 'Reset';
    Object.assign(resetBtn.style, {
      border: '1px solid #d0d0d0',
      background: '#f7f7f7',
      color: '#333',
      borderRadius: '6px',
      padding: '4px 8px',
      fontSize: '12px',
      cursor: 'pointer'
    });
    resetBtn.addEventListener('click', () => {
      resetSearchFilters();
    });
    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.textContent = 'Close';
    Object.assign(closeBtn.style, {
      border: '1px solid #d0d0d0',
      background: '#fff',
      color: '#333',
      borderRadius: '6px',
      padding: '4px 8px',
      fontSize: '12px',
      cursor: 'pointer'
    });
    closeBtn.addEventListener('click', () => {
      panel.style.display = 'none';
    });
    actions.appendChild(resetBtn);
    actions.appendChild(closeBtn);
    panel.appendChild(actions);
    searchState.filterControls = {
      fieldSelect,
      taxonomyInput,
      serviceInput,
      ageSelect
    };
    return panel;
  }
  function positionFilterPanel() {
    const panel = searchState.filterPanel;
    const group = searchState.inputGroup;
    if (!panel || !group) return;
    const rect = group.getBoundingClientRect();
    panel.style.top = '0px';
    panel.style.left = '0px';
    const panelRect = panel.getBoundingClientRect();
    let left = rect.right - panelRect.width;
    let top = rect.bottom + 6;
    if (left < 8) left = 8;
    if (top + panelRect.height > window.innerHeight - 8) {
      const above = rect.top - panelRect.height - 6;
      if (above > 8) top = above;
    }
    if (top < 8) top = 8;
    panel.style.left = `${Math.round(left)}px`;
    panel.style.top = `${Math.round(top)}px`;
  }
  function ensureCustomResultsContainer() {
    if (searchState.resultsContainer && document.contains(searchState.resultsContainer)) {
      return searchState.resultsContainer;
    }
    const container = document.createElement('div');
    container.dataset.gghostSearchUi = 'true';
    container.style.display = 'none';
    container.style.position = 'fixed';
    container.style.zIndex = '100000';
    container.style.background = '#fff';
    container.style.border = '1px solid #d0d0d0';
    container.style.borderRadius = '6px';
    container.style.boxShadow = '0 8px 18px rgba(0, 0, 0, 0.18)';
    container.style.padding = '4px 0';
    container.style.maxHeight = '320px';
    container.style.overflowY = 'auto';
    container.style.fontSize = '13px';
    container.style.color = '#222';
    container.setAttribute('role', 'menu');
    document.body.appendChild(container);
    searchState.resultsContainer = container;
    return container;
  }
  function positionSearchResultsContainer() {
    const container = searchState.resultsContainer;
    const group = searchState.inputGroup;
    if (!container || !group) return;
    const rect = group.getBoundingClientRect();
    container.style.minWidth = `${Math.round(rect.width)}px`;
    let left = Math.round(rect.left);
    let top = Math.round(rect.bottom + 4);
    container.style.left = `${left}px`;
    container.style.top = `${top}px`;
    const containerRect = container.getBoundingClientRect();
    if (containerRect.right > window.innerWidth - 8) {
      left = Math.max(8, window.innerWidth - containerRect.width - 8);
    }
    if (containerRect.bottom > window.innerHeight - 8) {
      const above = rect.top - containerRect.height - 4;
      if (above > 8) top = above;
    }
    container.style.left = `${Math.round(left)}px`;
    container.style.top = `${Math.round(top)}px`;
  }
  function updateSearchFilters(next) {
    Object.assign(searchState.filters, next || {});
    updateFilterButtonState();
    saveSearchFilters();
    scheduleSearchDecorate();
  }
  function resetSearchFilters() {
    Object.assign(searchState.filters, DEFAULT_SEARCH_FILTERS);
    if (searchState.filterControls) {
      searchState.filterControls.fieldSelect.value = searchState.filters.field;
      searchState.filterControls.taxonomyInput.value = searchState.filters.taxonomy;
      searchState.filterControls.serviceInput.value = searchState.filters.service;
      searchState.filterControls.ageSelect.value = searchState.filters.age;
    }
    updateFilterButtonState();
    saveSearchFilters();
    scheduleSearchDecorate();
  }
  function updateFilterButtonState() {
    const btn = searchState.filterButton;
    if (!btn) return;
    const active = areFiltersActive();
    btn.style.fontWeight = active ? '600' : '500';
    btn.style.color = active ? '#0d6efd' : '#333';
  }
  function updateClearButtonState() {
    const btn = searchState.clearButton;
    if (!btn) return;
    const hasValue = Boolean(searchState.input?.value && String(searchState.input.value).trim());
    btn.style.display = hasValue ? 'inline-flex' : 'none';
    if (searchState.clearButtonWrap) {
      searchState.clearButtonWrap.style.display = hasValue ? 'flex' : 'none';
    }
  }
  function areFiltersActive() {
    const filters = searchState.filters || DEFAULT_SEARCH_FILTERS;
    if (filters.field !== 'org') return true;
    if (filters.taxonomy) return true;
    if (filters.service) return true;
    if (filters.age && filters.age !== 'any') return true;
    return false;
  }
  function shouldUseCustomResults() {
    const filters = searchState.filters || DEFAULT_SEARCH_FILTERS;
    if (filters.field !== 'org') return true;
    return hasCustomFilters(filters);
  }
  function hasCustomFilters(filters) {
    if (!filters) return false;
    if (filters.taxonomy) return true;
    if (filters.service) return true;
    if (filters.age && filters.age !== 'any') return true;
    return false;
  }
  function toggleNativeSearchResults(visible) {
    const items = document.querySelectorAll(SEARCH_RESULT_SELECTOR);
    items.forEach((item) => {
      if (searchState.resultsContainer && searchState.resultsContainer.contains(item)) return;
      setElementVisibility(item, visible);
    });
  }
  function setElementVisibility(element, visible) {
    if (!element) return;
    if (element.__gghostOriginalDisplay === undefined) {
      element.__gghostOriginalDisplay = element.style.display || '';
    }
    element.style.display = visible ? element.__gghostOriginalDisplay : 'none';
  }
  function renderCustomResults(query, rawQuery) {
    hideSearchOverlay();
    const container = ensureCustomResultsContainer();
    const normalizedQuery = normalizeSearchText(query);
    const filters = searchState.filters || DEFAULT_SEARCH_FILTERS;
    const extraFilters = hasCustomFilters(filters);
    if (!normalizedQuery && !extraFilters) {
      hideCustomResults();
      return;
    }
    const results = buildCustomResults(normalizedQuery, filters, rawQuery);
    container.replaceChildren();
    if (!results.length) {
      container.style.display = 'none';
      hideSearchOverlay();
      return;
    }
    results.forEach((result, index) => {
      const item = document.createElement('li');
      item.className = 'Dropdown-item list-group-item';
      item.setAttribute('role', 'menuitem');
      item.dataset.gghostLocationId = result.entry.id;
      item.dataset.gghostLocationScore = String(Math.round(result.score));
      item.textContent = buildCustomResultLabel(result.entry);
      Object.assign(item.style, {
        cursor: 'pointer',
        padding: '6px 12px',
        border: 'none',
        borderBottom: index === results.length - 1 ? 'none' : '1px solid #eee'
      });
      attachSearchResultInteractions(item);
      container.appendChild(item);
    });
    container.style.display = 'block';
    positionSearchResultsContainer();
  }
  function hideCustomResults() {
    const container = searchState.resultsContainer;
    if (!container) return;
    container.style.display = 'none';
    container.replaceChildren();
  }
  function buildCustomResults(query, filters, rawQuery) {
    const center = state.map?.getCenter?.();
    const centerPoint = center ? { lat: center.lat(), lng: center.lng() } : null;
    const zipQuery = extractZipQuery(rawQuery);
    const numericTokens = extractNumericTokens(query);
    const addressField = (filters?.field || 'org') === 'address';
    const zipOnly = Boolean(zipQuery && normalizeSearchText(rawQuery) === zipQuery);
    const buildResults = (enforceNumbers, enforceZip) => {
      const results = [];
      state.searchEntries.forEach((entry) => {
        if (!matchesCustomFilters(entry, filters)) return;
        if (addressField && enforceZip && zipQuery) {
          if (!entry.postalCode || entry.postalCode !== zipQuery) return;
        }
        if (addressField && enforceNumbers && numericTokens.length && !(zipOnly && zipQuery)) {
          const addressValue = entry.address || '';
          const hasAllNumbers = numericTokens.every(token => addressValue.includes(token));
          if (!hasAllNumbers) return;
        }
        const score = scoreCustomEntry(entry, query, filters, centerPoint, { zipQuery, zipOnly });
        if (query && score < CUSTOM_MATCH_MIN_SCORE) return;
        results.push({ entry, score });
      });
      results.sort((a, b) => b.score - a.score);
      return results.slice(0, CUSTOM_RESULTS_LIMIT);
    };
    let results = buildResults(true, true);
    if (addressField && zipQuery && !results.length) {
      results = buildResults(true, false);
    }
    if (addressField && numericTokens.length && !results.length) {
      results = buildResults(false, Boolean(zipQuery));
    }
    return results;
  }
  function attachSearchResultInteractions(item) {
    if (!item || item.__gghostSearchDecorated) return;
    item.__gghostSearchDecorated = true;
    item.style.cursor = 'pointer';
    item.style.userSelect = 'none';
    item.addEventListener('mouseenter', () => {
      showSearchOverlayForItem(item);
    });
    item.addEventListener('mouseleave', () => {
      scheduleHideSearchOverlay();
    });
    item.addEventListener('click', (event) => {
      const locId = item.dataset.gghostLocationId;
      if (!locId) return;
      const url = `https://gogetta.nyc/team/location/${locId}`;
      if (event.metaKey || event.ctrlKey) {
        window.open(url, '_blank', 'noopener');
      } else {
        window.location.href = url;
      }
      event.preventDefault();
      event.stopPropagation();
    });
  }
  function showSearchOverlayForItem(item) {
    const locId = item?.dataset?.gghostLocationId;
    if (!locId) return;
    const overlay = ensureSearchOverlay();
    clearSearchOverlayTimer();
    const entry = getSearchEntryById(locId);
    const marker = state.markers.get(locId);
    const loc = entry?.loc || marker?.__gghostLoc || null;
    if (loc) {
      overlay.replaceChildren(buildInfoContent(loc));
    } else {
      overlay.replaceChildren(buildSearchOverlayLoading());
    }
    overlay.style.display = 'block';
    positionSearchOverlay(overlay, item);
    const token = `${locId}:${Date.now()}`;
    searchState.overlayToken = token;
    resolveLocationDetails(locId, loc).then((fresh) => {
      if (!fresh || searchState.overlayToken !== token) return;
      if (entry) entry.loc = fresh;
      overlay.replaceChildren(buildInfoContent(fresh));
      positionSearchOverlay(overlay, item);
    });
  }
  function ensureSearchOverlay() {
    if (searchState.overlay && document.contains(searchState.overlay)) return searchState.overlay;
    const overlay = document.createElement('div');
    overlay.dataset.gghostSearchUi = 'true';
    overlay.style.display = 'none';
    overlay.style.position = 'fixed';
    overlay.style.zIndex = '100002';
    overlay.style.background = '#fff';
    overlay.style.border = '1px solid #d0d0d0';
    overlay.style.borderRadius = '8px';
    overlay.style.boxShadow = '0 10px 18px rgba(0, 0, 0, 0.2)';
    overlay.style.padding = '8px';
    overlay.style.maxWidth = '320px';
    overlay.style.maxHeight = '360px';
    overlay.style.overflowY = 'auto';
    overlay.style.fontSize = '12px';
    overlay.addEventListener('mouseenter', () => {
      clearSearchOverlayTimer();
    });
    overlay.addEventListener('mouseleave', () => {
      scheduleHideSearchOverlay();
    });
    document.body.appendChild(overlay);
    searchState.overlay = overlay;
    return overlay;
  }
  function buildSearchOverlayLoading() {
    const wrapper = document.createElement('div');
    wrapper.style.padding = '6px';
    wrapper.style.fontSize = '12px';
    wrapper.style.color = '#555';
    wrapper.textContent = 'Loading details...';
    return wrapper;
  }
  function positionSearchOverlay(overlay, anchor) {
    if (!overlay || !anchor) return;
    const rect = anchor.getBoundingClientRect();
    const overlayRect = overlay.getBoundingClientRect();
    let left = rect.right + 8;
    let top = rect.top;
    if (left + overlayRect.width > window.innerWidth - 8) {
      left = rect.left - overlayRect.width - 8;
    }
    if (left < 8) left = 8;
    if (top + overlayRect.height > window.innerHeight - 8) {
      top = window.innerHeight - overlayRect.height - 8;
    }
    if (top < 8) top = 8;
    overlay.style.left = `${Math.round(left)}px`;
    overlay.style.top = `${Math.round(top)}px`;
  }
  function scheduleHideSearchOverlay() {
    clearSearchOverlayTimer();
    searchState.overlayHideTimer = setTimeout(() => {
      hideSearchOverlay();
    }, SEARCH_OVERLAY_HIDE_DELAY_MS);
  }
  function clearSearchOverlayTimer() {
    if (searchState.overlayHideTimer) {
      clearTimeout(searchState.overlayHideTimer);
      searchState.overlayHideTimer = null;
    }
  }
  function hideSearchOverlay(force) {
    clearSearchOverlayTimer();
    if (!searchState.overlay) return;
    searchState.overlay.style.display = 'none';
    searchState.overlayToken = null;
    if (force) {
      searchState.overlay.remove();
      searchState.overlay = null;
    }
  }
  function getSearchEntryById(locationId) {
    if (!locationId) return null;
    return state.searchEntries.find(entry => entry.id === locationId) || null;
  }
  function buildCustomResultLabel(entry) {
    if (!entry) return 'Unknown';
    const primary = entry.orgValue || entry.nameValue || entry.slugValue || 'Unknown';
    const secondary = entry.nameValue && entry.nameValue !== primary ? entry.nameValue : '';
    const address = entry.addressValue ? ` | ${entry.addressValue}` : '';
    return `${primary}${secondary ? ` - ${secondary}` : ''}${address}`;
  }
  function matchesCustomFilters(entry, filters) {
    if (!entry) return false;
    const taxonomyFilter = normalizeSearchText(filters?.taxonomy || '');
    if (taxonomyFilter) {
      if (!entry.taxonomyNames.some(name => name.includes(taxonomyFilter))) return false;
    }
    const serviceFilter = normalizeSearchText(filters?.service || '');
    if (serviceFilter) {
      const serviceMatch = entry.serviceNames.some(name => name.includes(serviceFilter))
        || entry.serviceDescriptions.some(desc => desc.includes(serviceFilter))
        || entry.eventTexts.some(text => text.includes(serviceFilter));
      if (!serviceMatch) return false;
    }
    const ageFilter = filters?.age || 'any';
    if (ageFilter !== 'any' && !matchesAgeFilter(entry, ageFilter)) {
      return false;
    }
    return true;
  }
  function matchesAgeFilter(entry, ageFilter) {
    const keywords = AGE_GROUP_KEYWORDS[ageFilter] || [];
    if (!keywords.length) return true;
    const haystack = entry.searchBlob || '';
    if (!haystack) return false;
    return keywords.some(keyword => haystack.includes(keyword));
  }
  function scoreCustomEntry(entry, query, filters, centerPoint, options = {}) {
    let score = 0;
    if (options.zipOnly && options.zipQuery) {
      score = 92;
    } else if (query) {
      const fields = getSearchFieldsForEntry(entry, filters?.field || 'org');
      fields.forEach((field) => {
        score = Math.max(score, scoreFieldMatch(query, field));
      });
    } else {
      score = 60;
    }
    const recencyBucket = getRecencyBucket(getLocationRecencyDate(entry.loc));
    if (recencyBucket === 'green') score += 6;
    if (recencyBucket === 'orange') score += 2;
    if (recencyBucket === 'red') score -= 4;
    if (centerPoint && entry.position) {
      const dist = haversineMeters(centerPoint.lat, centerPoint.lng, entry.position.lat, entry.position.lng);
      if (Number.isFinite(dist)) {
        score -= Math.min(12, dist / 1500);
      }
    }
    return score;
  }
  function getSearchFieldsForEntry(entry, field) {
    if (!entry) return [];
    if (field === 'org') {
      return [entry.org, entry.slug].filter(Boolean);
    }
    if (field === 'location') {
      return [entry.name].filter(Boolean);
    }
    if (field === 'service') {
      return [...entry.serviceNames, ...entry.serviceDescriptions, ...entry.eventTexts].filter(Boolean);
    }
    if (field === 'taxonomy') {
      return [...entry.taxonomyNames].filter(Boolean);
    }
    if (field === 'address') {
      return [entry.address].filter(Boolean);
    }
    return [
      entry.org,
      entry.name,
      entry.slug,
      entry.address,
      entry.description,
      ...entry.serviceNames,
      ...entry.taxonomyNames,
      ...entry.serviceDescriptions,
      ...entry.eventTexts
    ].filter(Boolean);
  }
  function scoreFieldMatch(query, field) {
    if (!query || !field) return 0;
    if (field === query) return 100;
    if (field.startsWith(query)) return 90;
    if (field.includes(query)) return 75;
    return scoreTokenOverlap(query, field);
  }
  function extractNumericTokens(value) {
    if (!value) return [];
    const tokens = String(value).match(/\d+/g);
    if (!tokens) return [];
    return tokens.map(token => token.trim()).filter(Boolean);
  }
  function extractZipQuery(value) {
    if (!value) return '';
    const match = String(value).match(/\b(\d{5})\b/);
    return match ? match[1] : '';
  }
  function buildFieldChip(label, value, editUrl, updatedAt, options = {}) {
    const trimmed = String(value || '').trim();
    if (!trimmed && !options.allowEmpty) return null;
    const displayValue = trimmed || options.emptyLabel || 'Missing';
    const palette = getRecencyStyles(updatedAt);
    const row = document.createElement('div');
    row.style.marginBottom = '4px';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = `${label}: ${displayValue}`;
    Object.assign(btn.style, {
      border: `1px solid ${palette.border}`,
      background: palette.background,
      color: palette.color,
      borderRadius: '6px',
      padding: '3px 6px',
      fontSize: '11px',
      cursor: editUrl ? 'pointer' : 'default',
      textAlign: 'left',
      lineHeight: '1.2',
      width: '100%',
      whiteSpace: 'normal',
      wordBreak: 'break-word',
      overflowWrap: 'anywhere'
    });
    if (editUrl) {
      btn.addEventListener('click', (evt) => {
        evt.stopPropagation();
        window.location.href = editUrl;
      });
    }
    row.appendChild(btn);
    return row;
  }
  function buildStreetViewFrame(label, editUrl, updatedAt) {
    const palette = getRecencyStyles(updatedAt);
    const row = document.createElement('div');
    row.style.marginBottom = '4px';
    row.style.cursor = editUrl ? 'pointer' : 'default';
    row.style.border = `1px solid ${palette.border}`;
    row.style.background = palette.background;
    row.style.borderRadius = '6px';
    row.style.padding = '3px 6px';
    row.style.color = palette.color;
    row.style.fontSize = '11px';
    row.style.lineHeight = '1.2';
    const labelEl = document.createElement('div');
    labelEl.textContent = label;
    labelEl.style.fontWeight = '600';
    labelEl.style.marginBottom = '3px';
    row.appendChild(labelEl);
    if (editUrl) {
      row.addEventListener('click', (evt) => {
        evt.stopPropagation();
        window.location.href = editUrl;
      });
    }
    return row;
  }
  function getServiceAuthTokens() {
    const tokens = [];
    const gghost = window.gghost;
    if (gghost && typeof gghost.getCognitoTokens === 'function') {
      const { idToken, accessToken } = gghost.getCognitoTokens() || {};
      if (idToken) tokens.push(idToken);
      if (accessToken && accessToken !== idToken) tokens.push(accessToken);
    }
    if (!tokens.length) tokens.push(null);
    return tokens;
  }
  async function deleteServiceById(serviceId) {
    if (!serviceId) throw new Error('Missing service id.');
    const url = `${SERVICE_API_BASE}/${serviceId}`;
    const tokens = getServiceAuthTokens();
    let lastError = '';
    for (const token of tokens) {
      const headers = { accept: 'application/json, text/plain, */*' };
      if (token) headers.authorization = token;
      const res = await fetch(url, {
        method: 'DELETE',
        headers,
        mode: 'cors',
        credentials: 'include'
      });
      if (res.ok) return true;
      lastError = await res.text().catch(() => '');
      if (res.status !== 401 && res.status !== 403) break;
    }
    throw new Error(lastError || 'Failed to delete service.');
  }
  function buildServicesSection(services, locationId) {
    if (!Array.isArray(services) || services.length === 0) return null;
    const section = document.createElement('div');
    section.style.marginBottom = '4px';
    const header = document.createElement('div');
    header.textContent = 'Services';
    header.style.fontWeight = '600';
    header.style.marginBottom = '3px';
    header.style.fontSize = '11px';
    section.appendChild(header);
    const list = document.createElement('div');
    list.style.display = 'flex';
    list.style.flexDirection = 'column';
    list.style.gap = '4px';
    services.forEach((service) => {
      const name = String(service?.name || '').trim();
      if (!name) return;
      const palette = getRecencyStyles(getServiceUpdatedAt(service));
      const serviceUrl = locationId && service?.id
        ? buildServiceUrl(locationId, service.id)
        : '';
      const row = document.createElement('div');
      Object.assign(row.style, {
        display: 'flex',
        alignItems: 'center',
        gap: '4px'
      });
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = name;
      Object.assign(btn.style, {
        border: `1px solid ${palette.border}`,
        background: palette.background,
        color: palette.color,
        borderRadius: '6px',
        padding: '3px 6px',
        fontSize: '11px',
        cursor: locationId && service?.id ? 'pointer' : 'default',
        textAlign: 'left',
        lineHeight: '1.2',
        whiteSpace: 'normal',
        flex: '1 1 auto'
      });
      if (serviceUrl) {
        btn.addEventListener('click', (evt) => {
          evt.stopPropagation();
          if (evt.metaKey || evt.ctrlKey || evt.shiftKey || evt.altKey) {
            window.open(serviceUrl, '_blank', 'noopener');
            return;
          }
          requestServiceTaxonomyOverlay(locationId, service.id);
        });
      }
      const copyBtn = document.createElement('button');
      copyBtn.type = 'button';
      copyBtn.textContent = 'copy';
      copyBtn.title = 'Copy service link';
      Object.assign(copyBtn.style, {
        border: '1px solid #d0d0d0',
        background: '#fff',
        color: '#475569',
        borderRadius: '6px',
        padding: '2px 6px',
        fontSize: '10px',
        lineHeight: '14px',
        cursor: serviceUrl ? 'pointer' : 'not-allowed',
        flex: '0 0 auto'
      });
      if (!serviceUrl) {
        copyBtn.disabled = true;
      } else {
        copyBtn.addEventListener('click', async (evt) => {
          evt.stopPropagation();
          evt.preventDefault();
          const ok = await copyToClipboard(serviceUrl);
          copyBtn.textContent = ok ? 'copied' : 'failed';
          setTimeout(() => {
            copyBtn.textContent = 'copy';
          }, 1200);
        });
      }
      const deleteBtn = document.createElement('button');
      deleteBtn.type = 'button';
      deleteBtn.textContent = 'x';
      deleteBtn.title = 'Delete service';
      Object.assign(deleteBtn.style, {
        border: '1px solid #d0d0d0',
        background: '#fff',
        color: '#b42318',
        borderRadius: '999px',
        width: '20px',
        height: '20px',
        fontSize: '12px',
        lineHeight: '18px',
        padding: '0',
        cursor: service?.id ? 'pointer' : 'not-allowed',
        flex: '0 0 auto'
      });
      if (!service?.id) {
        deleteBtn.disabled = true;
      } else {
        deleteBtn.addEventListener('click', async (evt) => {
          evt.stopPropagation();
          evt.preventDefault();
          if (!window.confirm(`Delete service "${name}"?`)) return;
          deleteBtn.disabled = true;
          btn.disabled = true;
          row.style.opacity = '0.6';
          deleteBtn.textContent = '...';
          try {
            await deleteServiceById(service.id);
            const idx = services.findIndex(item => item?.id === service.id);
            if (idx >= 0) services.splice(idx, 1);
            row.remove();
            if (!list.children.length) section.remove();
          } catch (err) {
            console.warn('[TeamMapPins] Failed to delete service', err);
            deleteBtn.disabled = false;
            btn.disabled = false;
            row.style.opacity = '1';
            deleteBtn.textContent = 'x';
            window.alert('Failed to delete service. Please try again.');
          }
        });
      }
      row.appendChild(btn);
      row.appendChild(copyBtn);
      row.appendChild(deleteBtn);
      list.appendChild(row);
    });
    if (!list.children.length) return null;
    section.appendChild(list);
    return section;
  }
  function getRecencyStyles(dateStr) {
    const bucket = getRecencyBucket(dateStr);
    if (bucket === 'green') return { background: '#d4edda', color: '#1c512c', border: '#b9dfc3' };
    if (bucket === 'orange') return { background: '#fff3cd', color: '#7c5a00', border: '#f2d17d' };
    return { background: '#f8d7da', color: '#842029', border: '#f0aab4' };
  }
  function getRecencyBucket(dateStr) {
    if (!dateStr) return 'red';
    const then = new Date(dateStr);
    if (Number.isNaN(then.getTime())) return 'red';
    const diffMonths = (Date.now() - then.getTime()) / (1000 * 60 * 60 * 24 * 30.44);
    if (diffMonths <= RECENCY_THRESHOLDS.greenMonths) return 'green';
    if (diffMonths <= RECENCY_THRESHOLDS.orangeMonths) return 'orange';
    return 'red';
  }
  function getRecencyMarkerColor(bucket) {
    if (bucket === 'green') return '#2ecc71';
    if (bucket === 'orange') return '#f39c12';
    return '#e74c3c';
  }
  function getLocationRecencyDate(loc) {
    const dates = [
      loc?.updatedAt,
      loc?.last_validated_at,
      loc?.createdAt,
      loc?.Organization?.updatedAt,
      loc?.Organization?.createdAt
    ];
    const address = loc?.PhysicalAddresses?.[0];
    if (address?.updatedAt) dates.push(address.updatedAt);
    if (address?.createdAt) dates.push(address.createdAt);
    const rawAddress = loc?.address || loc?.Address;
    if (rawAddress?.updatedAt) dates.push(rawAddress.updatedAt);
    if (rawAddress?.createdAt) dates.push(rawAddress.createdAt);
    const services = Array.isArray(loc?.Services) ? loc.Services : [];
    services.forEach(service => {
      if (service?.updatedAt) dates.push(service.updatedAt);
      if (service?.createdAt) dates.push(service.createdAt);
    });
    return pickLatestDate(dates);
  }
  function pickLatestDate(dates) {
    let latest = null;
    let latestTs = -Infinity;
    dates.forEach(value => {
      if (!value) return;
      const ts = new Date(value).getTime();
      if (Number.isNaN(ts)) return;
      if (ts > latestTs) {
        latestTs = ts;
        latest = value;
      }
    });
    return latest;
  }
  function getServiceCount(loc) {
    const services = Array.isArray(loc?.Services) ? loc.Services : (Array.isArray(loc?.services) ? loc.services : []);
    return Math.max(services.length, 1);
  }
  function getMarkerSizePx(loc) {
    const count = getServiceCount(loc);
    return 14 + Math.min(18, Math.round(Math.sqrt(count) * 4));
  }
  function getThemeCategory(loc) {
    const raw = [
      loc?.name,
      loc?.Organization?.name,
      ...(Array.isArray(loc?.Services) ? loc.Services.map(s => s?.name) : []),
      ...(Array.isArray(loc?.Services) ? loc.Services.flatMap(s => (s?.Taxonomies || []).map(t => t?.name)) : [])
    ].filter(Boolean).join(' ').toLowerCase();
    const counts = {
      church: countKeywords(raw, ['church', 'chapel', 'temple', 'mosque', 'synagogue', 'cathedral', 'ministry', 'parish']),
      hospital: countKeywords(raw, ['hospital', 'clinic', 'medical', 'health center', 'healthcare', 'urgent care', 'er', 'emergency']),
      food: countKeywords(raw, ['food', 'pantry', 'soup kitchen', 'meal', 'dining', 'restaurant', 'cafe', 'grocery', 'kitchen'])
    };
    const best = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
    return best && best[1] > 0 ? best[0] : 'default';
  }
  function countKeywords(text, keywords) {
    let count = 0;
    keywords.forEach(word => {
      if (text.includes(word)) count += 1;
    });
    return count;
  }
  function buildSvgMarkerIcon(theme, color, sizePx, options = {}) {
    const shell = getThemeSvgShell(theme, color);
    const symbol = getThemeSvgSymbol(theme);
    const ring = options.siteVisitPending
      ? `<circle cx="16" cy="16" r="15" fill="none" stroke="${SITE_VISIT_RING_COLOR}" stroke-width="2"/>`
      : '';
    const closedBadge = options.closed
      ? '<circle cx="24" cy="8" r="6" fill="#ffffff" stroke="#dc2626" stroke-width="2"/>'
        + '<path d="M21 5 L27 11 M27 5 L21 11" stroke="#dc2626" stroke-width="2" stroke-linecap="round"/>'
      : '';
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="${sizePx}" height="${sizePx}" viewBox="0 0 32 32">
        ${ring}
        ${shell}
        ${symbol}
        ${closedBadge}
      </svg>
    `;
    return {
      url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
      scaledSize: new google.maps.Size(sizePx, sizePx),
      anchor: new google.maps.Point(sizePx / 2, sizePx / 2)
    };
  }
  function getThemeSvgShell(theme, color) {
    if (theme === 'hospital') {
      return `<rect x="4" y="4" width="24" height="24" rx="6" fill="${color}" stroke="#ffffff" stroke-width="2"/>`;
    }
    if (theme === 'food') {
      return `<path d="M16 2 L30 16 L16 30 L2 16 Z" fill="${color}" stroke="#ffffff" stroke-width="2"/>`;
    }
    return `<circle cx="16" cy="16" r="14" fill="${color}" stroke="#ffffff" stroke-width="2"/>`;
  }
  function getThemeSvgSymbol(theme) {
    if (theme === 'church') {
      return '<path fill="#ffffff" d="M15 7h2v6h4v2h-4v6h-2v-6h-4v-2h4z"/>';
    }
    if (theme === 'hospital') {
      return '<path fill="#ffffff" d="M14 9h4v4h4v4h-4v4h-4v-4h-4v-4h4z"/>';
    }
    if (theme === 'food') {
      return '<path fill="#ffffff" d="M12 8h2v10h-2zm6 0h2v10h-2zm-3 0h2v14h-2z"/>';
    }
    return '';
  }
  function buildLocationQuestionUrl(locationId, question) {
    if (!locationId || !question) return '';
    return `https://gogetta.nyc/team/location/${locationId}/questions/${question}`;
  }
  function buildServiceUrl(locationId, serviceId) {
    if (!locationId || !serviceId) return '';
    return `https://gogetta.nyc/team/location/${locationId}/services/${serviceId}`;
  }
  function requestServiceTaxonomyOverlay(locationId, serviceId) {
    if (!locationId || !serviceId) return false;
    window.dispatchEvent(new CustomEvent(SERVICE_TAXONOMY_EVENT, {
      detail: { locationId, serviceId }
    }));
    return true;
  }
  async function copyToClipboard(value) {
    const text = String(value || '').trim();
    if (!text) return false;
    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch (err) {
        // fall through to execCommand
      }
    }
    try {
      const helper = document.createElement('textarea');
      helper.value = text;
      helper.style.position = 'fixed';
      helper.style.top = '0';
      helper.style.left = '-9999px';
      helper.style.opacity = '0';
      document.body.appendChild(helper);
      helper.focus();
      helper.select();
      const ok = document.execCommand('copy');
      helper.remove();
      return ok;
    } catch (err) {
      return false;
    }
  }
  function normalizeWebsiteUrl(url) {
    if (!url) return '';
    if (/^https?:\/\//i.test(url)) return url;
    return `https://${url}`;
  }
  function getLocationNameUpdatedAt(loc) {
    return loc?.updatedAt || loc?.createdAt || null;
  }
  function getOrgUpdatedAt(loc) {
    return loc?.Organization?.updatedAt || loc?.Organization?.createdAt || loc?.updatedAt || null;
  }
  function getAddressUpdatedAt(loc) {
    const address = loc?.PhysicalAddresses?.[0];
    if (address?.updatedAt || address?.createdAt) {
      return address?.updatedAt || address?.createdAt;
    }
    const rawAddress = loc?.address || loc?.Address;
    if (rawAddress?.updatedAt || rawAddress?.createdAt) {
      return rawAddress?.updatedAt || rawAddress?.createdAt;
    }
    return loc?.updatedAt || null;
  }
  function getWebsiteUpdatedAt(loc) {
    return loc?.updatedAt || loc?.Organization?.updatedAt || null;
  }
  function getStreetViewUpdatedAt(loc) {
    return loc?.updatedAt || null;
  }
  function getServiceUpdatedAt(service) {
    if (!service) return null;
    const dates = [
      service?.updatedAt,
      service?.createdAt,
      service?.ServiceAtLocation?.updatedAt,
      service?.ServiceAtLocation?.createdAt,
      ...(Array.isArray(service?.EventRelatedInfos) ? service.EventRelatedInfos.map(info => info?.updatedAt || info?.createdAt) : []),
      ...(Array.isArray(service?.HolidaySchedules) ? service.HolidaySchedules.map(entry => entry?.updatedAt || entry?.createdAt) : []),
      ...(Array.isArray(service?.RequiredDocuments) ? service.RequiredDocuments.map(doc => doc?.updatedAt || doc?.createdAt) : []),
      ...(Array.isArray(service?.Taxonomies) ? service.Taxonomies.map(tax => tax?.updatedAt || tax?.createdAt) : [])
    ];
    return pickLatestDate(dates);
  }
  function buildStreetViewPreview(url, position) {
    const isImageUrl = url
      && (/\/maps\/api\/streetview/i.test(url) || /\.(png|jpe?g|webp|gif)(\?|$)/i.test(url));
    if (isImageUrl) {
      const img = document.createElement('img');
      img.src = url;
      img.alt = 'Street View preview';
      img.style.cssText = 'width: 100%; max-width: 220px; border-radius: 6px; margin-top: 4px;';
      img.loading = 'lazy';
      return img;
    }
    if (!position || !window.google?.maps?.StreetViewPanorama) return null;
    const container = document.createElement('div');
    container.style.cssText = 'width: 100%; max-width: 220px; height: 140px; border-radius: 6px; overflow: hidden; margin-top: 4px;';
    const pano = new google.maps.StreetViewPanorama(container, {
      position,
      pov: { heading: 0, pitch: 0 },
      zoom: 0,
      disableDefaultUI: true,
      clickToGo: false,
      linksControl: false,
      addressControl: false,
      fullscreenControl: false,
      motionTracking: false,
      scrollwheel: false
    });
    pano.setVisible(true);
    return container;
  }
  const detailsCache = new Map();
  const DETAILS_TTL_MS = 5 * 60 * 1000;
  async function resolveLocationDetails(locationId, fallback) {
    if (!locationId) return fallback;
    const now = Date.now();
    const cached = detailsCache.get(locationId);
    if (cached?.data && now - cached.timestamp < DETAILS_TTL_MS) {
      return cached.data;
    }
    if (cached?.pending) return cached.pending;
    const fetchPromise = fetch(`${API_BASE}/${locationId}`, { headers: { accept: 'application/json' } })
      .then(res => (res.ok ? res.json() : null))
      .then(data => {
        if (!data) return fallback;
        normalizeLocationCity(data);
        detailsCache.set(locationId, { data, timestamp: Date.now() });
        return data;
      })
      .catch(() => fallback)
      .finally(() => {
        const entry = detailsCache.get(locationId);
        if (entry && entry.pending) {
          detailsCache.set(locationId, { data: entry.data || fallback, timestamp: Date.now() });
        }
      });
    detailsCache.set(locationId, { pending: fetchPromise, data: cached?.data || null, timestamp: cached?.timestamp || 0 });
    return fetchPromise;
  }
  hookHistory();
  handleLocationChange();
})();
