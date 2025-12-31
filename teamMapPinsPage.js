(() => {
  if (window.__gghostTeamMapPinsBootstrap) return;
  window.__gghostTeamMapPinsBootstrap = true;

  const API_BASE = 'https://w6pkliozjh.execute-api.us-east-1.amazonaws.com/prod/locations';
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

  const debugState = {
    active: false,
    mapReady: false,
    lastFetchAt: null,
    lastFetchCount: 0,
    lastError: null,
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
    mapPoll: null,
    infoWindow: null,
    isDragging: false,
    activeInfoToken: null
  };

  window.__gghostTeamMapPinsStatus = debugState;
  window.__gghostTeamMapPinsBlockFullStory = BLOCK_FULLSTORY;

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
    ensureMapsReady().then((ready) => {
      if (!ready || !state.active) return;
      hookMapConstructor();
      hookMapPrototype();
      hookMapsEventSystem();
      if (BLOCK_FULLSTORY) {
        patchFullStory();
      }
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
    detachMap();
    clearMarkers();
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
    if (HIDE_DEFAULT_MARKERS) {
      applyDefaultMarkerHiding(map);
    }
    state.listeners.push(map.addListener('idle', scheduleFetch));
    state.listeners.push(map.addListener('dragstart', () => {
      state.isDragging = true;
    }));
    state.listeners.push(map.addListener('dragend', () => {
      state.isDragging = false;
    }));
    state.listeners.push(map.addListener('click', () => {
      if (state.isDragging) return;
      state.infoWindow?.close();
    }));
    scheduleFetch();
  }

  function detachMap() {
    state.listeners.forEach(listener => listener.remove());
    state.listeners = [];
    state.map = null;
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
      state.lastLocations = data;
      state.lastLocationsAt = Date.now();
      state.lastLocationsKey = requestKey;
      debugState.lastFetchAt = new Date().toISOString();
      debugState.lastFetchCount = data.length;
      debugState.lastError = null;
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
      const icon = buildMarkerIcon(loc);
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
    });
    for (const [id, marker] of state.markers.entries()) {
      if (!seen.has(id)) {
        marker.setMap(null);
        state.markers.delete(id);
      }
    }
  }

  function showInfo(marker) {
    if (!state.infoWindow || !state.map) return;
    const loc = marker.__gghostLoc;
    if (!loc) return;
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
    });
  }

  function buildInfoContent(loc) {
    const wrapper = document.createElement('div');
    wrapper.style.maxWidth = '260px';
    wrapper.style.fontSize = '12px';
    const title = document.createElement('div');
    title.style.fontWeight = '600';
    title.style.marginBottom = '4px';
    title.textContent = getLocationTitle(loc) || 'Location';
    wrapper.appendChild(title);
    const locationId = getLocationId(loc, null);
    const address = getLocationAddress(loc);
    const locationName = loc?.name || '';
    const orgName = loc?.Organization?.name || '';
    const website = loc?.url || loc?.Organization?.url || '';
    const streetviewUrl = loc?.streetview_url || '';

    const fields = [
      buildFieldChip('Organization', orgName, locationId ? buildLocationQuestionUrl(locationId, 'organization-name') : null, getOrgUpdatedAt(loc), { allowEmpty: true }),
      buildFieldChip('Location name', locationName, locationId ? buildLocationQuestionUrl(locationId, 'location-name') : null, getLocationNameUpdatedAt(loc), { allowEmpty: true }),
      buildFieldChip('Address', address, locationId ? buildLocationQuestionUrl(locationId, 'location-address') : null, getAddressUpdatedAt(loc), { allowEmpty: true })
    ].filter(Boolean);

    fields.forEach(chip => wrapper.appendChild(chip));

    if (website) {
      const row = buildFieldChip('Website', website, locationId ? buildLocationQuestionUrl(locationId, 'website') : null, getWebsiteUpdatedAt(loc));
      const link = document.createElement('a');
      link.href = normalizeWebsiteUrl(website);
      link.textContent = 'Open link';
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.style.cssText = 'display:block;font-size:11px;color:#0d6efd;margin-top:4px;';
      row.appendChild(link);
      wrapper.appendChild(row);
    }

    const preview = buildStreetViewPreview(streetviewUrl, getLocationLatLng(loc));
    if (preview && locationId) {
      const row = buildStreetViewFrame('Street View', buildLocationQuestionUrl(locationId, 'street-view'), getStreetViewUpdatedAt(loc));
      row.appendChild(preview);
      wrapper.appendChild(row);
    }

    return wrapper;
  }

  function getLocationTitle(loc) {
    return loc?.name || loc?.Organization?.name || loc?.slug || '';
  }

  function getLocationAddress(loc) {
    const address = loc?.PhysicalAddresses?.[0];
    if (!address) return '';
    return [
      address.address_1,
      address.city,
      address.state_province,
      address.postal_code
    ].filter(Boolean).join(', ');
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

  function buildMarkerIcon(loc) {
    const bucket = getRecencyBucket(getLocationRecencyDate(loc));
    const color = getRecencyMarkerColor(bucket);
    const size = getMarkerSizePx(loc);
    const theme = getThemeCategory(loc);
    return buildSvgMarkerIcon(theme, color, size);
  }

  function buildMarkerZIndex(loc) {
    const count = getServiceCount(loc);
    return 1000000 + count;
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

  function buildFieldChip(label, value, editUrl, updatedAt, options = {}) {
    const trimmed = String(value || '').trim();
    if (!trimmed && !options.allowEmpty) return null;
    const displayValue = trimmed || options.emptyLabel || 'Missing';
    const palette = getRecencyStyles(updatedAt);
    const row = document.createElement('div');
    row.style.marginBottom = '6px';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = `${label}: ${displayValue}`;
    Object.assign(btn.style, {
      border: `1px solid ${palette.border}`,
      background: palette.background,
      color: palette.color,
      borderRadius: '6px',
      padding: '4px 6px',
      fontSize: '12px',
      cursor: editUrl ? 'pointer' : 'default',
      textAlign: 'left',
      lineHeight: '1.3',
      width: '100%'
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
    row.style.marginBottom = '6px';
    row.style.cursor = editUrl ? 'pointer' : 'default';
    row.style.border = `1px solid ${palette.border}`;
    row.style.background = palette.background;
    row.style.borderRadius = '6px';
    row.style.padding = '4px 6px';
    row.style.color = palette.color;
    row.style.fontSize = '12px';
    row.style.lineHeight = '1.3';
    const labelEl = document.createElement('div');
    labelEl.textContent = label;
    labelEl.style.fontWeight = '600';
    labelEl.style.marginBottom = '4px';
    row.appendChild(labelEl);
    if (editUrl) {
      row.addEventListener('click', (evt) => {
        evt.stopPropagation();
        window.location.href = editUrl;
      });
    }
    return row;
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

  function buildSvgMarkerIcon(theme, color, sizePx) {
    const shell = getThemeSvgShell(theme, color);
    const symbol = getThemeSvgSymbol(theme);
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="${sizePx}" height="${sizePx}" viewBox="0 0 32 32">
        ${shell}
        ${symbol}
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
    return address?.updatedAt || address?.createdAt || loc?.updatedAt || null;
  }

  function getWebsiteUpdatedAt(loc) {
    return loc?.updatedAt || loc?.Organization?.updatedAt || null;
  }

  function getStreetViewUpdatedAt(loc) {
    return loc?.updatedAt || null;
  }

  function buildStreetViewPreview(url, position) {
    const isImageUrl = url
      && (/\/maps\/api\/streetview/i.test(url) || /\.(png|jpe?g|webp|gif)(\?|$)/i.test(url));
    if (isImageUrl) {
      const img = document.createElement('img');
      img.src = url;
      img.alt = 'Street View preview';
      img.style.cssText = 'width: 100%; max-width: 220px; border-radius: 6px; margin-top: 6px;';
      img.loading = 'lazy';
      return img;
    }
    if (!position || !window.google?.maps?.StreetViewPanorama) return null;
    const container = document.createElement('div');
    container.style.cssText = 'width: 100%; max-width: 220px; height: 140px; border-radius: 6px; overflow: hidden; margin-top: 6px;';
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
