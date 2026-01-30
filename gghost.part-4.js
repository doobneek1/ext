// GGHOST_PART_MARKER: gghost.part-4.js
window.__GGHOST_PARTS_LOADED__ = window.__GGHOST_PARTS_LOADED__ || [];
window.__GGHOST_PARTS_LOADED__.push('gghost.part-4.js');
console.log('[gghost] loaded gghost.part-4.js');
/* ===========================
   Taxonomy heart overlay
   =========================== */
const TAXONOMY_HEART_ID = 'gghost-taxonomy-heart';
function removeTaxonomyHeartOverlay() {
  document.getElementById(TAXONOMY_HEART_ID)?.remove();
}
function renderTaxonomyHeartOverlay(services, locationId) {
  removeTaxonomyHeartOverlay();
  if (!Array.isArray(services) || services.length === 0 || !locationId) return;
  const container = document.createElement('div');
  container.id = TAXONOMY_HEART_ID;
  Object.assign(container.style, {
    position: 'fixed',
    top: '88px',
    right: '20px',
    width: '32px',
    height: '32px',
    zIndex: '9999',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: 'Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
  });
  const heartBtn = document.createElement('button');
  heartBtn.type = 'button';
  heartBtn.innerHTML = '&#9829;';
  heartBtn.title = 'Services';
  Object.assign(heartBtn.style, {
    width: '32px',
    height: '32px',
    borderRadius: '50%',
    border: '1px solid #d4c79a',
    background: '#fffef5',
    color: '#b04a4a',
    fontSize: '16px',
    cursor: 'pointer',
    boxShadow: '0 4px 10px rgba(0,0,0,0.12)'
  });
  const hoverPanel = createServiceHoverPanel(services, locationId, null);
  hoverPanel.style.position = 'fixed';
  hoverPanel.style.left = '0';
  hoverPanel.style.top = '0';
  hoverPanel.style.right = 'auto';
  let hoverTimeout = null;
  const positionHoverPanel = () => {
    const padding = 8;
    const availableWidth = Math.max(0, window.innerWidth - padding * 2);
    const maxWidth = Math.min(320, availableWidth);
    const minWidth = Math.min(260, maxWidth);
    const width = Math.min(280, maxWidth);
    if (maxWidth > 0) {
      hoverPanel.style.maxWidth = `${maxWidth}px`;
      hoverPanel.style.minWidth = `${minWidth}px`;
      hoverPanel.style.width = `${width}px`;
    }
    const availableHeight = Math.max(0, window.innerHeight - padding * 2);
    const maxHeight = Math.min(240, availableHeight);
    if (maxHeight > 0) {
      hoverPanel.style.maxHeight = `${maxHeight}px`;
    }
    const anchorRect = container.getBoundingClientRect();
    const panelRect = hoverPanel.getBoundingClientRect();
    let left = anchorRect.right - panelRect.width;
    let top = anchorRect.bottom + 6;
    if (left < padding) left = padding;
    if (left + panelRect.width > window.innerWidth - padding) {
      left = window.innerWidth - padding - panelRect.width;
    }
    if (top + panelRect.height > window.innerHeight - padding) {
      const aboveTop = anchorRect.top - 6 - panelRect.height;
      if (aboveTop >= padding) {
        top = aboveTop;
      } else {
        top = Math.max(padding, window.innerHeight - padding - panelRect.height);
      }
    }
    hoverPanel.style.left = `${Math.round(left)}px`;
    hoverPanel.style.top = `${Math.round(top)}px`;
  };
  const showPanel = () => {
    clearTimeout(hoverTimeout);
    positionHoverPanel();
    hoverPanel.style.opacity = '1';
    hoverPanel.style.pointerEvents = 'auto';
    hoverPanel.style.transform = 'translateY(0)';
  };
  const hidePanel = () => {
    if (hoverPanel && typeof hoverPanel.__gghostCommitActiveEdit === 'function') {
      hoverPanel.__gghostCommitActiveEdit();
    }
    hoverTimeout = setTimeout(() => {
      hoverPanel.style.opacity = '0';
      hoverPanel.style.pointerEvents = 'none';
      hoverPanel.style.transform = 'translateY(6px)';
    }, 120);
  };
  container.addEventListener('mouseenter', showPanel);
  container.addEventListener('mouseleave', hidePanel);
  hoverPanel.addEventListener('mouseenter', showPanel);
  hoverPanel.addEventListener('mouseleave', hidePanel);
  container.appendChild(heartBtn);
  container.appendChild(hoverPanel);
  document.body.appendChild(container);
}
async function showTaxonomyHeartOverlay(locationId) {
  if (!locationId) {
    removeTaxonomyHeartOverlay();
    return;
  }
  const { data: locationData, fromCache, source } = await fetchFullLocationRecord(locationId, { refresh: false });
  if (!locationData) {
    removeTaxonomyHeartOverlay();
    return;
  }
  const services = normalizeServices(locationData.Services || locationData.services);
  renderTaxonomyHeartOverlay(services, locationId);
  if (fromCache && source !== 'page-cache' && source !== 'page-cache-wait') {
    fetchFullLocationRecord(locationId, { refresh: true })
      .then(({ data: freshData }) => {
        if (!freshData) return;
        const freshServices = normalizeServices(freshData.Services || freshData.services);
        renderTaxonomyHeartOverlay(freshServices, locationId);
      })
      .catch(err => {
        console.error('[Taxonomy Heart] Background refresh failed', err);
      });
  }
}
/* ===========================
   Location contact overlay
   =========================== */
const LOCATION_CONTACT_CONTAINER_ID = 'gghost-location-contact-container';
const LOCATION_CONTACT_PANEL_ID = 'gghost-location-contact-panel';
const LOCATION_CONTACT_TOGGLE_ID = 'gghost-location-contact-toggle';
const LOCATION_CONTACT_STATUS_TTL = 5 * 60 * 1000;
const locationContactStatusCache = new Map();
let locationContactRequestId = 0;
let relatedLocationsRequestId = 0;
const LOCATION_LINK_RE = /https?:\/\/[^\s"'<>]+/gi;
const LOCATION_EMAIL_RE = /[\w.+-]+@[\w.-]+\.\w{2,}/g;
const LOCATION_PHONE_RE = /(?:(?:\+?1[\s.\-]*)?)\(?\d{3}\)?[\s.\-]*\d{3}[\s.\-]*\d{4}(?:\s*(?:x|ext\.?|extension|#)\s*\d+)?/gi;
const LOCATION_EMAIL_VALIDATION_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RELATED_LOCATIONS_CACHE_PREFIX = 'gghost-related-locations-cache-';
const RELATED_LOCATIONS_CACHE_TTL_MS = 15 * 60 * 1000;
const RELATED_LOCATIONS_CACHE_MAX = 4;
const RELATED_LOCATIONS_DEFAULT_CENTER = { lat: 40.697488, lng: -73.979681 };
const RELATED_LOCATIONS_RADIUS_METERS = 10000;
const RELATED_LOCATIONS_MAX_RADIUS_METERS = 10000;
const RELATED_LOCATIONS_MAX_RESULTS = 250;
const SHEETS_CACHE_QUERY = { latitude: 40.697488, longitude: -73.979681, radius: 34000 };
const RELATED_LOCATIONS_SCAN_LIMIT = 2500;
const RELATED_LOCATIONS_RESULTS_LIMIT = 40;
const RELATED_LOCATIONS_OVERLAY_ID = 'gghost-related-locations-overlay';
const RELATED_MATCHES_CACHE_PREFIX = 'gghost-related-matches-cache-';
const RELATED_MATCHES_CACHE_TTL_MS = 15 * 60 * 1000;
const RELATED_MATCHES_EMPTY_TTL_MS = 3 * 60 * 1000;
const relatedMatchesMemory = new Map();
function buildLocationQuestionUrl(uuid, question) {
  return `https://gogetta.nyc/team/location/${uuid}/questions/${question}`;
}
function buildLocationQuestionPath(uuid, question) {
  return `/team/location/${uuid}/questions/${question}`;
}
function buildLocationPhonePath(uuid, phoneId) {
  if (!uuid) return '';
  if (!phoneId) return buildLocationQuestionPath(uuid, 'phone-number');
  return `${buildLocationQuestionPath(uuid, 'phone-number')}/${phoneId}`;
}
function buildLocationPhoneEditUrl(uuid, phoneId) {
  if (!uuid || !phoneId) return buildLocationQuestionUrl(uuid, 'phone-number');
  return `https://gogetta.nyc/team/location/${uuid}/questions/phone-number/${phoneId}`;
}
function cleanContactMatch(value) {
  return String(value || '').trim().replace(/[),.;]+$/, '');
}
function normalizeContactUrl(raw) {
  const cleaned = cleanContactMatch(raw);
  if (!cleaned) return '';
  if (!/^https?:\/\//i.test(cleaned)) {
    return `http://${cleaned}`;
  }
  return cleaned;
}
function isFeasibleContactUrl(raw) {
  const normalized = normalizeContactUrl(raw);
  if (!normalized || /\s/.test(normalized)) return false;
  try {
    const url = new URL(normalized);
    return /^https?:$/i.test(url.protocol);
  } catch {
    return false;
  }
}
function collectContactStrings(value, collector, depth = 0, options = {}) {
  if (!value || collector.length > 5000 || depth > 10) return;
  const skipRootKeys = options.skipRootKeys instanceof Set
    ? options.skipRootKeys
    : new Set(options.skipRootKeys || []);
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed) collector.push(trimmed);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach(item => collectContactStrings(item, collector, depth + 1, options));
    return;
  }
  if (typeof value === 'object') {
    Object.entries(value).forEach(([key, item]) => {
      if (depth === 0 && skipRootKeys.has(key)) return;
      collectContactStrings(item, collector, depth + 1, options);
    });
  }
}
async function checkLocationUrlStatus(rawUrl) {
  const normalized = normalizeContactUrl(rawUrl);
  if (!normalized || !isFeasibleContactUrl(normalized)) {
    return { status: 'invalid', isHttps: false, workingUrl: normalized || rawUrl };
  }
  const cached = locationContactStatusCache.get(normalized);
  if (cached && Date.now() - cached.timestamp < LOCATION_CONTACT_STATUS_TTL) {
    return cached;
  }
  if (!chrome?.runtime?.sendMessage) {
    return { status: 'unknown', isHttps: false, workingUrl: normalized };
  }
  try {
    const result = await new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ type: 'CHECK_URL_STATUS', url: normalized }, response => {
        let lastError = null;
        try {
          lastError = chrome?.runtime?.lastError;
        } catch (err) {
          reject(err);
          return;
        }
        if (lastError) {
          reject(new Error(lastError.message || 'Extension error'));
          return;
        }
        resolve(response);
      });
    });
    const payload = {
      status: result?.status || 'unknown',
      isHttps: !!result?.isHttps,
      workingUrl: result?.workingUrl || normalized,
      httpStatus: result?.httpStatus,
      timestamp: Date.now()
    };
    locationContactStatusCache.set(normalized, payload);
    return payload;
  } catch (error) {
    console.warn('[Location Contact] URL status check failed:', error);
    return { status: 'unknown', isHttps: false, workingUrl: normalized };
  }
}
async function showLocationLinkPreview(url, isHttps = true) {
  const normalized = normalizeContactUrl(url);
  if (!normalized) return;
  const needsProxy = !isHttps && window.location.protocol === 'https:';
  let iframeUrl = normalized;
  if (needsProxy && chrome?.runtime?.sendMessage) {
    try {
      const result = await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({ type: 'PROXY_WEBSITE', url: normalized }, response => {
          let lastError = null;
          try {
            lastError = chrome?.runtime?.lastError;
          } catch (err) {
            reject(err);
            return;
          }
          if (lastError) {
            reject(new Error(lastError.message || 'Extension error'));
            return;
          }
          resolve(response);
        });
      });
      if (result?.success) {
        const blob = new Blob([result.html], { type: 'text/html' });
        iframeUrl = URL.createObjectURL(blob);
      }
    } catch (error) {
      console.error('[Location Contact] Preview proxy failed:', error);
    }
  }
  const overlay = document.createElement('div');
  overlay.className = 'link-validator-preview-overlay';
  overlay.style.cssText = `
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.7);
    z-index: 10000;
    display: flex;
    align-items: center;
    justify-content: center;
  `;
  const previewContainer = document.createElement('div');
  previewContainer.style.cssText = `
    background: #fff;
    border-radius: 8px;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
    max-width: 90vw;
    max-height: 90vh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  `;
  const header = document.createElement('div');
  header.style.cssText = `
    padding: 10px 12px;
    background: #f7f7f7;
    border-bottom: 1px solid #e0e0e0;
    display: flex;
    align-items: center;
    gap: 8px;
  `;
  const title = document.createElement('div');
  title.textContent = normalized;
  title.style.cssText = `
    font-weight: 600;
    font-size: 12px;
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  `;
  const openBtn = document.createElement('button');
  openBtn.type = 'button';
  openBtn.textContent = 'Open';
  openBtn.style.cssText = `
    background: #0d6efd;
    color: #fff;
    border: none;
    padding: 4px 10px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 12px;
  `;
  openBtn.addEventListener('click', () => window.open(normalized, '_blank'));
  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.textContent = 'x';
  closeBtn.style.cssText = `
    background: none;
    border: none;
    font-size: 16px;
    cursor: pointer;
    color: #555;
  `;
  closeBtn.addEventListener('click', () => {
    if (needsProxy && iframeUrl.startsWith('blob:')) {
      URL.revokeObjectURL(iframeUrl);
    }
    overlay.remove();
  });
  header.appendChild(title);
  header.appendChild(openBtn);
  header.appendChild(closeBtn);
  const iframe = document.createElement('iframe');
  iframe.src = iframeUrl;
  iframe.style.cssText = `
    width: 420px;
    height: 320px;
    border: none;
  `;
  iframe.onerror = () => {
    const errorMsg = document.createElement('div');
    errorMsg.style.cssText = `
      padding: 20px;
      text-align: center;
      color: #c62828;
      font-size: 13px;
    `;
    errorMsg.textContent = 'Unable to load preview.';
    iframe.replaceWith(errorMsg);
  };
  previewContainer.appendChild(header);
  previewContainer.appendChild(iframe);
  overlay.appendChild(previewContainer);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      if (needsProxy && iframeUrl.startsWith('blob:')) {
        URL.revokeObjectURL(iframeUrl);
      }
      overlay.remove();
    }
  });
  document.body.appendChild(overlay);
}
function yieldToMainThread() {
  return new Promise((resolve) => {
    if (typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function') {
      window.requestIdleCallback(() => resolve(), { timeout: 200 });
    } else {
      setTimeout(resolve, 0);
    }
  });
}
function roundCoordinate(value, precision = 3) {
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  const factor = 10 ** precision;
  return Math.round(num * factor) / factor;
}
function readPreferredCenterFromStorage() {
  try {
    const raw = localStorage.getItem('gghostPreferredCenter');
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const lat = Number(parsed?.lat ?? parsed?.latitude);
    const lng = Number(parsed?.lng ?? parsed?.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
    return { lat, lng };
  } catch (_error) {
    return null;
  }
}
function getLocationCenterFromData(locationData) {
  const coords = locationData?.position?.coordinates;
  if (Array.isArray(coords) && coords.length >= 2) {
    const lng = Number(coords[0]);
    const lat = Number(coords[1]);
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      return { lat, lng };
    }
  }
  const lat = Number(
    locationData?.position?.lat
    ?? locationData?.position?.latitude
    ?? locationData?.lat
    ?? locationData?.latitude
  );
  const lng = Number(
    locationData?.position?.lng
    ?? locationData?.position?.longitude
    ?? locationData?.lng
    ?? locationData?.longitude
  );
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}
function normalizeRelatedLocationsQuery(query) {
  if (!query) return null;
  const latitude = Number(query.latitude);
  const longitude = Number(query.longitude);
  const rawRadius = Number(query.radius) || 0;
  const radius = Math.min(Math.max(rawRadius, 0), RELATED_LOCATIONS_MAX_RADIUS_METERS);
  const rawMaxResults = Number(query.maxResults) || 0;
  const maxResults = rawMaxResults > 0
    ? Math.min(Math.trunc(rawMaxResults), RELATED_LOCATIONS_MAX_RESULTS)
    : null;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || !radius) return null;
  const normalized = { latitude, longitude, radius };
  if (maxResults) normalized.maxResults = maxResults;
  return normalized;
}
function haversineDistanceMeters(lat1, lng1, lat2, lng2) {
  const toRad = (value) => (value * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return 6371000 * c;
}
function buildSheetsCacheKey(query) {
  if (!query) return '';
  const lat = String(query.latitude).replace(/[^0-9-]/g, '_');
  const lng = String(query.longitude).replace(/[^0-9-]/g, '_');
  return `sheets_${lat}_${lng}_${query.radius}`;
}
function getRtdbBaseUrl() {
  const raw = window.gghost?.baseURL || 'https://streetli-default-rtdb.firebaseio.com/';
  return raw.endsWith('/') ? raw : `${raw}/`;
}
async function fetchSheetsCacheLocations() {
  const cacheKey = buildSheetsCacheKey(SHEETS_CACHE_QUERY);
  if (!cacheKey) return null;
  const url = `${getRtdbBaseUrl()}sheetsCache/global/${cacheKey}.json`;
  const authUrl = typeof window.gghost?.withFirebaseAuth === 'function'
    ? window.gghost.withFirebaseAuth(url)
    : url;
  const requestFetch = typeof fetchViaBackground === 'function' ? fetchViaBackground : fetch;
  const res = await requestFetch(authUrl, { cache: 'no-store' });
  if (!res.ok) return null;
  const payload = await res.json().catch(() => null);
  const locations = payload?.locations;
  return Array.isArray(locations) ? locations : null;
}
async function filterLocationsWithinRadius(locations, center, radius) {
  if (!Array.isArray(locations)) return [];
  if (!center || !Number.isFinite(center.lat) || !Number.isFinite(center.lng)) return locations;
  if (!Number.isFinite(radius) || radius <= 0) return locations;
  const filtered = [];
  for (let i = 0; i < locations.length; i += 1) {
    const coords = getLocationCenterFromData(locations[i]);
    if (!coords) continue;
    if (haversineDistanceMeters(center.lat, center.lng, coords.lat, coords.lng) <= radius) {
      filtered.push(locations[i]);
    }
    if (i > 0 && i % 300 === 0) {
      await yieldToMainThread();
    }
  }
  return filtered;
}
function buildRelatedLocationsQuery(locationData) {
  const center = getLocationCenterFromData(locationData)
    || readPreferredCenterFromStorage()
    || RELATED_LOCATIONS_DEFAULT_CENTER;
  return normalizeRelatedLocationsQuery({
    latitude: center.lat,
    longitude: center.lng,
    radius: RELATED_LOCATIONS_RADIUS_METERS,
    maxResults: RELATED_LOCATIONS_MAX_RESULTS
  });
}
function buildRelatedLocationsCacheKey(query) {
  if (!query) return null;
  const lat = roundCoordinate(query.latitude, 3);
  const lng = roundCoordinate(query.longitude, 3);
  const radius = Math.round(Number(query.radius) || 0);
  return `${RELATED_LOCATIONS_CACHE_PREFIX}${lat ?? 'na'}:${lng ?? 'na'}:${radius}`;
}
function listRelatedLocationsCacheEntries() {
  const entries = [];
  try {
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith(RELATED_LOCATIONS_CACHE_PREFIX)) continue;
      let timestamp = 0;
      try {
        const parsed = JSON.parse(localStorage.getItem(key));
        timestamp = Number(parsed?.fetchedAt) || 0;
      } catch {
        timestamp = 0;
      }
      entries.push({ key, timestamp });
    }
  } catch (_error) {
    return entries;
  }
  return entries;
}
function pruneRelatedLocationsCache() {
  const entries = listRelatedLocationsCacheEntries();
  if (entries.length <= RELATED_LOCATIONS_CACHE_MAX) return;
  entries.sort((a, b) => a.timestamp - b.timestamp);
  const removeCount = entries.length - RELATED_LOCATIONS_CACHE_MAX;
  for (let i = 0; i < removeCount; i += 1) {
    localStorage.removeItem(entries[i].key);
  }
}
function readRelatedLocationsCache(cacheKey) {
  if (!cacheKey) return null;
  try {
    const raw = localStorage.getItem(cacheKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    if (!Array.isArray(parsed.locations)) return null;
    const fetchedAt = Number(parsed.fetchedAt) || 0;
    const isStale = !fetchedAt || Date.now() - fetchedAt > RELATED_LOCATIONS_CACHE_TTL_MS;
    return {
      locations: parsed.locations,
      fetchedAt,
      isStale,
      scanLimited: parsed.scanLimited === true
    };
  } catch (_error) {
    return null;
  }
}
function writeRelatedLocationsCache(cacheKey, locations, scanLimited) {
  if (!cacheKey) return;
  const payload = {
    fetchedAt: Date.now(),
    locations: Array.isArray(locations) ? locations : [],
    scanLimited: scanLimited === true
  };
  try {
    localStorage.setItem(cacheKey, JSON.stringify(payload));
  } catch (error) {
    pruneRelatedLocationsCache();
    try {
      localStorage.setItem(cacheKey, JSON.stringify(payload));
    } catch (_retryError) {
      // Ignore cache write failure.
    }
  }
}
function normalizeEmailForMatch(raw) {
  const cleaned = cleanContactMatch(raw);
  if (!cleaned) return '';
  return cleaned.toLowerCase();
}
function normalizePhoneForMatch(raw) {
  const cleaned = cleanContactMatch(raw);
  if (!cleaned) return '';
  let digits = digitsOnly(cleaned);
  if (!digits) return '';
  if (digits.length > 10) digits = digits.slice(-10);
  if (digits.length < 7) return '';
  return digits;
}
function normalizeLinkForMatch(raw) {
  const normalized = normalizeContactUrl(raw);
  if (!normalized) return '';
  if (!isFeasibleContactUrl(normalized)) return '';
  try {
    const url = new URL(normalized);
    let host = url.hostname.toLowerCase();
    if (host.startsWith('www.')) host = host.slice(4);
    let path = url.pathname.replace(/\/+$/, '');
    if (!path) path = '/';
    const search = url.search || '';
    return `${host}${path}${search}`;
  } catch (_error) {
    return normalized.toLowerCase();
  }
}
function addContactMatchesFromText(text, addLink, addEmail, addPhone) {
  if (!text) return;
  const raw = String(text).trim();
  if (!raw) return;
  const snippet = raw.length > 6000 ? raw.slice(0, 6000) : raw;
  const links = snippet.match(LOCATION_LINK_RE) || [];
  links.forEach(link => addLink(link));
  const emails = snippet.match(LOCATION_EMAIL_RE) || [];
  emails.forEach(email => addEmail(email));
  const phones = snippet.match(LOCATION_PHONE_RE) || [];
  phones.forEach(phone => addPhone(phone));
}
function buildLocationContactKeys(locationData) {
  const emailKeys = new Set();
  const phoneKeys = new Set();
  const linkKeys = new Set();
  const addEmail = (value) => {
    const key = normalizeEmailForMatch(value);
    if (key) emailKeys.add(key);
  };
  const addPhone = (value) => {
    const key = normalizePhoneForMatch(value);
    if (key) phoneKeys.add(key);
  };
  const addLink = (value) => {
    const key = normalizeLinkForMatch(value);
    if (key) linkKeys.add(key);
  };
  addEmail(locationData?.email);
  addEmail(locationData?.Organization?.email);
  addLink(locationData?.url);
  addLink(locationData?.Organization?.url);
  const phones = Array.isArray(locationData?.Phones) ? locationData.Phones : [];
  phones.forEach((phone) => addPhone(phone?.number));
  addContactMatchesFromText(locationData?.description, addLink, addEmail, addPhone);
  addContactMatchesFromText(locationData?.additional_info, addLink, addEmail, addPhone);
  addContactMatchesFromText(locationData?.additionalInfo, addLink, addEmail, addPhone);
  const locationInfos = Array.isArray(locationData?.EventRelatedInfos) ? locationData.EventRelatedInfos : [];
  locationInfos.forEach(info => addContactMatchesFromText(info?.information, addLink, addEmail, addPhone));
  const services = coerceServicesArray(locationData?.Services || locationData?.services);
  services.forEach((service) => {
    addEmail(service?.email);
    addLink(service?.url);
    addContactMatchesFromText(service?.description, addLink, addEmail, addPhone);
    addContactMatchesFromText(service?.additional_info, addLink, addEmail, addPhone);
    addContactMatchesFromText(service?.additionalInfo, addLink, addEmail, addPhone);
    const eventInfos = Array.isArray(service?.EventRelatedInfos) ? service.EventRelatedInfos : [];
    eventInfos.forEach(info => addContactMatchesFromText(info?.information, addLink, addEmail, addPhone));
  });
  return {
    emails: Array.from(emailKeys),
    phones: Array.from(phoneKeys),
    links: Array.from(linkKeys)
  };
}
function buildRelatedLocationEntry(locationData) {
  const id = locationData?.id || locationData?.locationId;
  if (!id) return null;
  const contacts = buildLocationContactKeys(locationData || {});
  if (!contacts.emails.length && !contacts.phones.length && !contacts.links.length) return null;
  const name = String(locationData?.name || '').trim();
  const orgName = String(locationData?.Organization?.name || locationData?.organization?.name || '').trim();
  return { id, name, orgName, contacts };
}
async function buildRelatedLocationsPayload(locations) {
  if (!Array.isArray(locations)) return [];
  const entries = [];
  const seen = new Set();
  const limit = Math.min(locations.length, RELATED_LOCATIONS_SCAN_LIMIT);
  for (let i = 0; i < limit; i += 1) {
    const loc = locations[i];
    const id = loc?.id || loc?.locationId;
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const entry = buildRelatedLocationEntry(loc);
    if (entry) entries.push(entry);
    if (i > 0 && i % 120 === 0) {
      await yieldToMainThread();
    }
  }
  return entries;
}
async function fetchRelatedLocationsData(query) {
  const normalized = normalizeRelatedLocationsQuery(query);
  if (!normalized) return null;
  let lastError = null;
  const radiusFetcher = window.gghost?.fetchLocationsByRadius;
  if (typeof radiusFetcher === 'function') {
    try {
      const data = await radiusFetcher(normalized);
      if (Array.isArray(data)) return data;
      lastError = new Error('Locations payload invalid');
    } catch (_error) {
      // Fall through to direct fetch.
      lastError = _error;
    }
  }
  try {
    const url = new URL(LOCATION_API_BASE);
    url.searchParams.set('latitude', normalized.latitude);
    url.searchParams.set('longitude', normalized.longitude);
    url.searchParams.set('radius', normalized.radius);
    if (normalized.maxResults) {
      url.searchParams.set('maxResults', normalized.maxResults);
    }
    const requestFetch = typeof fetchViaBackground === 'function' ? fetchViaBackground : fetch;
    const res = await requestFetch(url.toString(), {
      method: 'GET',
      headers: { accept: 'application/json' },
      cache: 'no-store'
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Failed to fetch locations (${res.status}) ${text}`);
    }
    const payload = await res.json();
    if (Array.isArray(payload)) return payload;
    lastError = new Error('Locations payload invalid');
  } catch (err) {
    lastError = err;
  }
  const cachedLocations = await fetchSheetsCacheLocations();
  if (Array.isArray(cachedLocations)) {
    const center = { lat: normalized.latitude, lng: normalized.longitude };
    return filterLocationsWithinRadius(cachedLocations, center, normalized.radius);
  }
  if (lastError) throw lastError;
  return [];
}
async function loadRelatedLocationsPool(locationData) {
  const query = buildRelatedLocationsQuery(locationData);
  const cacheKey = buildRelatedLocationsCacheKey(query);
  const cached = readRelatedLocationsCache(cacheKey);
  const refresh = async () => {
    const raw = await fetchRelatedLocationsData(query);
    const scanLimited = Array.isArray(raw) && raw.length > RELATED_LOCATIONS_SCAN_LIMIT;
    const entries = await buildRelatedLocationsPayload(raw || []);
    writeRelatedLocationsCache(cacheKey, entries, scanLimited);
    return { entries, scanLimited };
  };
  if (cached && !cached.isStale) {
    return {
      entries: cached.locations,
      fromCache: true,
      stale: false,
      scanLimited: cached.scanLimited === true,
      refreshPromise: null
    };
  }
  if (cached) {
    const refreshPromise = refresh().catch((err) => {
      console.warn('[Location Contact] Related locations refresh failed:', err);
      return null;
    });
    return {
      entries: cached.locations,
      fromCache: true,
      stale: true,
      scanLimited: cached.scanLimited === true,
      refreshPromise
    };
  }
  const fresh = await refresh();
  return {
    entries: fresh.entries,
    fromCache: false,
    stale: false,
    scanLimited: fresh.scanLimited,
    refreshPromise: null
  };
}
function buildContactKeyIndexFromItems(contactData) {
  const emails = new Map();
  const phones = new Map();
  const links = new Map();
  const addKey = (map, key, display) => {
    if (!key || map.has(key)) return;
    map.set(key, display || key);
  };
  (contactData?.emailItems || []).forEach((item) => {
    const key = normalizeEmailForMatch(item.display);
    addKey(emails, key, item.display);
  });
  (contactData?.phoneItems || []).forEach((item) => {
    const key = normalizePhoneForMatch(item.display);
    addKey(phones, key, item.display);
  });
  (contactData?.linkItems || []).forEach((item) => {
    const key = normalizeLinkForMatch(item.normalizedUrl || item.display);
    addKey(links, key, item.display || item.normalizedUrl);
  });
  const hasAny = emails.size > 0 || phones.size > 0 || links.size > 0;
  return { emails, phones, links, hasAny };
}
function buildContactFingerprint(keyIndex) {
  const joinKeys = (map) => Array.from(map.keys()).sort().join('|');
  const emails = joinKeys(keyIndex.emails);
  const phones = joinKeys(keyIndex.phones);
  const links = joinKeys(keyIndex.links);
  return `${emails}::${phones}::${links}`;
}
function getRelatedMatchesCacheKey(locationId) {
  if (!locationId) return null;
  return `${RELATED_MATCHES_CACHE_PREFIX}${locationId}`;
}
function readRelatedMatchesCache(locationId, fingerprint) {
  const cacheKey = getRelatedMatchesCacheKey(locationId);
  if (!cacheKey || !fingerprint) return null;
  try {
    const raw = localStorage.getItem(cacheKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    if (parsed.fingerprint !== fingerprint) return null;
    if (!Array.isArray(parsed.matches) || !parsed.matches.length) return null;
    const computedAt = Number(parsed.computedAt) || 0;
    if (!computedAt || Date.now() - computedAt > RELATED_MATCHES_CACHE_TTL_MS) return null;
    return {
      matches: parsed.matches,
      meta: parsed.meta && typeof parsed.meta === 'object' ? parsed.meta : null,
      computedAt
    };
  } catch (_error) {
    return null;
  }
}
function writeRelatedMatchesCache(locationId, fingerprint, matches, meta) {
  if (!locationId || !fingerprint) return;
  if (!Array.isArray(matches) || !matches.length) return;
  const cacheKey = getRelatedMatchesCacheKey(locationId);
  if (!cacheKey) return;
  const payload = {
    fingerprint,
    matches,
    meta: meta && typeof meta === 'object' ? meta : null,
    computedAt: Date.now()
  };
  try {
    localStorage.setItem(cacheKey, JSON.stringify(payload));
  } catch (_error) {
    // Ignore cache write failures.
  }
}
function getRelatedMatchesKey(locationId, fingerprint) {
  if (!locationId || !fingerprint) return '';
  return `${locationId}::${fingerprint}`;
}
function getRelatedMatchesEntry(key) {
  if (!key) return null;
  const entry = relatedMatchesMemory.get(key);
  if (!entry) return null;
  if (entry.status === 'empty' && entry.emptyUntil && Date.now() > entry.emptyUntil) {
    relatedMatchesMemory.delete(key);
    return null;
  }
  return entry;
}
function scheduleRelatedMatchesCompute(entry, locationId, locationData, keyIndex, fingerprint, immediate) {
  if (!entry || entry.promise) return entry?.promise || Promise.resolve(entry);
  const compute = async () => {
    try {
      const pool = await loadRelatedLocationsPool(locationData);
      const result = await findRelatedLocationMatches(pool.entries || [], keyIndex, locationId);
      const meta = {
        scanned: result.scanned,
        total: result.total,
        limited: result.limited,
        truncated: result.truncated,
        scanLimited: pool.scanLimited === true,
        source: pool.fromCache ? (pool.stale ? 'cache-stale' : 'cache') : 'live'
      };
      entry.meta = meta;
      entry.matches = result.matches || [];
      entry.computedAt = Date.now();
      if (entry.matches.length) {
        entry.status = 'ready';
        writeRelatedMatchesCache(locationId, fingerprint, entry.matches, meta);
      } else {
        entry.status = 'empty';
        entry.emptyUntil = Date.now() + RELATED_MATCHES_EMPTY_TTL_MS;
      }
    } catch (err) {
      entry.status = 'error';
      entry.error = err?.message || String(err);
      entry.matches = [];
    }
    return entry;
  };
  if (immediate) {
    entry.promise = compute();
    return entry.promise;
  }
  entry.promise = new Promise((resolve) => {
    const run = () => compute().then(resolve).catch(() => resolve(entry));
    if (typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function') {
      window.requestIdleCallback(run, { timeout: 2000 });
    } else {
      setTimeout(run, 200);
    }
  });
  return entry.promise;
}
function ensureRelatedMatchesLoaded({
  locationId,
  locationData,
  contactData,
  keyIndex,
  immediate = false,
  force = false
}) {
  if (!locationId || !locationData) return null;
  const resolvedKeyIndex = keyIndex || buildContactKeyIndexFromItems(contactData);
  if (!resolvedKeyIndex || !resolvedKeyIndex.hasAny) return null;
  const fingerprint = buildContactFingerprint(resolvedKeyIndex);
  const key = getRelatedMatchesKey(locationId, fingerprint);
  let entry = getRelatedMatchesEntry(key);
  if (entry && !force) {
    if (immediate && entry.status === 'error') {
      entry.status = 'loading';
      entry.error = null;
      entry.promise = null;
      scheduleRelatedMatchesCompute(entry, locationId, locationData, resolvedKeyIndex, fingerprint, true);
    }
    return entry;
  }
  const cached = !force ? readRelatedMatchesCache(locationId, fingerprint) : null;
  if (cached) {
    entry = {
      status: 'ready',
      matches: cached.matches || [],
      meta: cached.meta,
      computedAt: cached.computedAt,
      promise: null
    };
    relatedMatchesMemory.set(key, entry);
    return entry;
  }
  entry = {
    status: 'loading',
    matches: [],
    meta: null,
    computedAt: 0,
    promise: null
  };
  relatedMatchesMemory.set(key, entry);
  scheduleRelatedMatchesCompute(entry, locationId, locationData, resolvedKeyIndex, fingerprint, immediate);
  return entry;
}
function collectMatchValues(keys, keyMap, limit = 3) {
  const values = [];
  let count = 0;
  const seen = new Set();
  if (!Array.isArray(keys) || !keyMap || keyMap.size === 0) {
    return { values, count };
  }
  keys.forEach((key) => {
    if (!keyMap.has(key)) return;
    const display = keyMap.get(key) || key;
    if (seen.has(display)) return;
    seen.add(display);
    count += 1;
    if (values.length < limit) {
      values.push(display);
    }
  });
  return { values, count };
}
function buildRelatedLocationMatch(entry, keyIndex) {
  if (!entry || !entry.contacts) return null;
  const emailMatches = collectMatchValues(entry.contacts.emails, keyIndex.emails);
  const phoneMatches = collectMatchValues(entry.contacts.phones, keyIndex.phones);
  const linkMatches = collectMatchValues(entry.contacts.links, keyIndex.links);
  if (!emailMatches.count && !phoneMatches.count && !linkMatches.count) return null;
  const reasons = [];
  if (emailMatches.count) reasons.push({ label: 'Email', ...emailMatches });
  if (phoneMatches.count) reasons.push({ label: 'Phone', ...phoneMatches });
  if (linkMatches.count) reasons.push({ label: 'Link', ...linkMatches });
  return {
    id: entry.id,
    name: entry.name,
    orgName: entry.orgName,
    reasons
  };
}
async function findRelatedLocationMatches(entries, keyIndex, locationId) {
  const matches = [];
  let scanned = 0;
  const limit = Math.min(entries.length, RELATED_LOCATIONS_SCAN_LIMIT);
  for (let i = 0; i < limit; i += 1) {
    const entry = entries[i];
    if (!entry || !entry.id || entry.id === locationId) continue;
    scanned += 1;
    const match = buildRelatedLocationMatch(entry, keyIndex);
    if (match) {
      matches.push(match);
      if (matches.length >= RELATED_LOCATIONS_RESULTS_LIMIT) {
        break;
      }
    }
    if (i > 0 && i % 140 === 0) {
      await yieldToMainThread();
    }
  }
  return {
    matches,
    scanned,
    total: entries.length,
    limited: matches.length >= RELATED_LOCATIONS_RESULTS_LIMIT,
    truncated: entries.length > limit
  };
}
function removeRelatedLocationsOverlay() {
  const existing = document.getElementById(RELATED_LOCATIONS_OVERLAY_ID);
  if (existing) existing.remove();
  relatedLocationsRequestId += 1;
}
function ensureRelatedSpinnerStyles() {
  if (document.getElementById('gghost-related-spinner-style')) return;
  const style = document.createElement('style');
  style.id = 'gghost-related-spinner-style';
  style.textContent = `
    @keyframes gghost-spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }
  `;
  document.head.appendChild(style);
}
function createRelatedSpinner() {
  ensureRelatedSpinnerStyles();
  const spinner = document.createElement('div');
  spinner.style.cssText = `
    width: 14px;
    height: 14px;
    border: 2px solid #c7c7c7;
    border-top-color: #0d6efd;
    border-radius: 50%;
    display: inline-block;
    animation: gghost-spin 0.8s linear infinite;
    margin-right: 6px;
  `;
  return spinner;
}
function openRelatedLocationsOverlay({ locationId, locationData, contactData, sourceSection }) {
  if (!locationId || !locationData) return;
  removeRelatedLocationsOverlay();
  const requestId = ++relatedLocationsRequestId;
  const keyIndex = buildContactKeyIndexFromItems(contactData);
  const overlay = document.createElement('div');
  overlay.id = RELATED_LOCATIONS_OVERLAY_ID;
  overlay.style.cssText = `
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.55);
    z-index: 11000;
    display: flex;
    align-items: center;
    justify-content: center;
  `;
  const panel = document.createElement('div');
  panel.style.cssText = `
    background: #fff;
    border-radius: 10px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.25);
    width: min(560px, 92vw);
    max-height: 80vh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    font-family: 'Inter', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  `;
  const header = document.createElement('div');
  header.style.cssText = `
    padding: 12px 14px;
    background: #f5f5f5;
    border-bottom: 1px solid #e0e0e0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  `;
  const title = document.createElement('div');
  title.textContent = 'Related locations';
  title.style.cssText = 'font-weight: 600; font-size: 14px;';
  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.textContent = 'x';
  closeBtn.style.cssText = `
    background: none;
    border: none;
    font-size: 16px;
    cursor: pointer;
    color: #555;
  `;
  header.appendChild(title);
  header.appendChild(closeBtn);
  const summary = document.createElement('div');
  summary.style.cssText = 'padding: 8px 14px; font-size: 12px; color: #555;';
  const list = document.createElement('div');
  list.style.cssText = 'padding: 10px 14px 14px; overflow-y: auto;';
  panel.appendChild(header);
  panel.appendChild(summary);
  panel.appendChild(list);
  overlay.appendChild(panel);
  const closeOverlay = () => {
    if (!overlay.isConnected) return;
    overlay.remove();
  };
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) {
      closeOverlay();
    }
  });
  closeBtn.addEventListener('click', closeOverlay);
  document.body.appendChild(overlay);
  const updateSummary = (text, color = '#555') => {
    summary.textContent = text;
    summary.style.color = color;
  };
  const showLoading = (text) => {
    list.innerHTML = '';
    const row = document.createElement('div');
    row.style.cssText = 'display: flex; align-items: center; font-size: 12px; color: #666;';
    row.appendChild(createRelatedSpinner());
    row.appendChild(document.createTextNode(text || 'Loading related locations...'));
    list.appendChild(row);
  };
  const renderMatches = (matches) => {
    list.innerHTML = '';
    if (!matches || !matches.length) {
      const empty = document.createElement('div');
      empty.textContent = 'No related locations found.';
      empty.style.cssText = 'font-size: 12px; color: #666;';
      list.appendChild(empty);
      return;
    }
    matches.forEach((match) => {
      const card = document.createElement('div');
      card.style.cssText = `
        border: 1px solid #e0e0e0;
        border-radius: 8px;
        padding: 8px 10px;
        margin-bottom: 8px;
        background: #fafafa;
      `;
      const titleRow = document.createElement('div');
      titleRow.style.cssText = 'display: flex; align-items: center; gap: 8px;';
      const nameBtn = document.createElement('button');
      const displayName = match.orgName
        ? `${match.orgName}${match.name ? ` - ${match.name}` : ''}`
        : (match.name || `Location ${String(match.id).slice(0, 8)}`);
      nameBtn.type = 'button';
      nameBtn.textContent = truncateText(displayName, 70);
      nameBtn.style.cssText = `
        background: none;
        border: none;
        padding: 0;
        color: #0d6efd;
        font-size: 13px;
        text-align: left;
        cursor: pointer;
        flex: 1;
      `;
      nameBtn.addEventListener('click', () => {
        window.location.href = `https://gogetta.nyc/team/location/${match.id}`;
      });
      titleRow.appendChild(nameBtn);
      card.appendChild(titleRow);
      (match.reasons || []).forEach((reason) => {
        const reasonLine = document.createElement('div');
        const values = (reason.values || []).map((value) => truncateText(String(value), 64));
        const extra = Math.max(0, (reason.count || 0) - values.length);
        const suffix = extra ? ` (+${extra} more)` : '';
        reasonLine.textContent = `Shared ${reason.label.toLowerCase()}: ${values.join(', ')}${suffix}`;
        reasonLine.style.cssText = 'font-size: 11px; color: #555; margin-top: 4px;';
        card.appendChild(reasonLine);
      });
      list.appendChild(card);
    });
  };
  const formatSummary = (entry) => {
    const count = entry?.matches?.length || 0;
    if (!entry?.meta) {
      return `Found ${count} related location${count === 1 ? '' : 's'}.`;
    }
    const sourceLabel = entry.meta.source === 'cache-stale'
      ? 'cache (stale)'
      : (entry.meta.source || 'cache');
    const limited = entry.meta.limited ? `, showing first ${RELATED_LOCATIONS_RESULTS_LIMIT}` : '';
    const scanLimit = entry.meta.scanLimited ? `, scan limited to ${RELATED_LOCATIONS_SCAN_LIMIT}` : '';
    const scanned = Number.isFinite(entry.meta.scanned) ? entry.meta.scanned : count;
    const total = Number.isFinite(entry.meta.total) ? entry.meta.total : scanned;
    return `Found ${count} related location${count === 1 ? '' : 's'} (scanned ${scanned} of ${total}${scanLimit}${limited}) - ${sourceLabel}`;
  };
  const hideSourceSection = (message) => {
    if (!sourceSection || !sourceSection.isConnected) return;
    sourceSection.dataset.relatedStatus = 'empty';
    if (message) {
      const meta = sourceSection.querySelector('[data-related-meta="true"]');
      if (meta) {
        meta.textContent = message;
      }
    }
    setTimeout(() => {
      if (!sourceSection.isConnected) return;
      if (sourceSection.dataset.relatedStatus === 'empty') {
        sourceSection.style.display = 'none';
      }
    }, 1400);
  };
  if (!keyIndex.hasAny) {
    updateSummary('No contact info available to match.', '#666');
    hideSourceSection('No contact info to match.');
    return;
  }
  const entry = ensureRelatedMatchesLoaded({
    locationId,
    locationData,
    contactData,
    keyIndex,
    immediate: true
  });
  if (!entry) {
    updateSummary('No contact info available to match.', '#666');
    hideSourceSection('No contact info to match.');
    return;
  }
  const applyEntry = (resolved) => {
    if (!resolved || requestId !== relatedLocationsRequestId) return;
    if (resolved.status === 'loading') {
      updateSummary('Searching for related locations...');
      showLoading('Searching for related locations...');
      return;
    }
    if (resolved.status === 'ready') {
      updateSummary(formatSummary(resolved));
      renderMatches(resolved.matches || []);
      return;
    }
    if (resolved.status === 'empty') {
      updateSummary('No related locations found.', '#666');
      renderMatches([]);
      hideSourceSection('No related locations found.');
      return;
    }
    if (resolved.status === 'error') {
      updateSummary(resolved.error || 'Failed to load related locations.', '#c62828');
      return;
    }
  };
  applyEntry(entry);
  if (entry.status === 'loading' && entry.promise) {
    entry.promise.then((resolved) => {
      applyEntry(resolved);
    });
  }
}
function buildLocationContactData(locationData, locationId) {
  const linkItems = [];
  const emailItems = [];
  const phoneItems = [];
  const seenLinkKeys = new Set();
  const seenLinkNormalized = new Set();
  const seenEmailKeys = new Set();
  const seenEmailNormalized = new Set();
  const emailIndexByNormalized = new Map();
  const seenPhoneKeys = new Set();
  const addLink = (rawUrl, targetUrl, sourceLabel, options = {}) => {
    const cleaned = cleanContactMatch(rawUrl);
    if (!cleaned) return;
    const normalized = normalizeContactUrl(cleaned);
    if (!normalized) return;
    const key = `${normalized}||${targetUrl || ''}`;
    if (seenLinkKeys.has(key)) return;
    if (options.skipIfSeenNormalized && seenLinkNormalized.has(normalized)) return;
    seenLinkKeys.add(key);
    seenLinkNormalized.add(normalized);
    linkItems.push({
      display: cleaned,
      normalizedUrl: normalized,
      targetUrl,
      sourceLabel
    });
  };
  const addEmail = (rawEmail, sourceLabel, targetUrl) => {
    const cleaned = cleanContactMatch(rawEmail);
    if (!cleaned) return;
    const normalized = cleaned.toLowerCase();
    const existingIndex = emailIndexByNormalized.get(normalized);
    if (existingIndex !== undefined) {
      const existing = emailItems[existingIndex];
      const existingUrl = existing?.targetUrl || '';
      const existingIsGoGetta = /\/team\/location\//i.test(existingUrl);
      const newIsGoGetta = targetUrl && /\/team\/location\//i.test(targetUrl);
      const existingIsGmail = /mail\.google\.com/i.test(existingUrl);
      if (targetUrl && (!existingUrl || existingIsGmail || (!existingIsGoGetta && newIsGoGetta))) {
        existing.targetUrl = targetUrl;
        if (sourceLabel) {
          existing.sourceLabel = sourceLabel;
        }
      }
      return;
    }
    const key = `${normalized}||${targetUrl || ''}`;
    if (seenEmailKeys.has(key)) return;
    if (!targetUrl && seenEmailNormalized.has(normalized)) return;
    seenEmailKeys.add(key);
    seenEmailNormalized.add(normalized);
    emailItems.push({
      display: cleaned,
      targetUrl: targetUrl || buildGmailUrl(cleaned),
      sourceLabel
    });
    emailIndexByNormalized.set(normalized, emailItems.length - 1);
  };
  const addPhone = (rawPhone, targetUrl, sourceLabel) => {
    const cleaned = cleanContactMatch(rawPhone);
    if (!cleaned) return;
    const digits = digitsOnly(cleaned);
    const key = `${digits || cleaned}||${targetUrl || ''}`;
    if (seenPhoneKeys.has(key)) return;
    seenPhoneKeys.add(key);
    phoneItems.push({
      display: cleaned,
      targetUrl,
      sourceLabel
    });
  };
  if (locationData?.Organization?.email) {
    addEmail(locationData.Organization.email, 'Organization email');
  }
  if (locationData?.email) {
    addEmail(locationData.email, 'Location email');
  }
  const services = coerceServicesArray(locationData?.Services || locationData?.services);
  services.forEach(service => {
    const serviceName = service?.name ? truncateText(service.name, 40) : 'Service';
    const serviceId = service?.id;
    if (!serviceId) return;
    const descTarget = buildServiceUrl(locationId, serviceId, 'description');
    const desc = String(service?.description || '').trim();
    if (desc) {
      const links = desc.match(LOCATION_LINK_RE) || [];
      links.forEach(link => addLink(link, descTarget, `Service: ${serviceName} (description)`));
      const emails = desc.match(LOCATION_EMAIL_RE) || [];
      emails.forEach(email => addEmail(email, `Service: ${serviceName} (description)`, descTarget));
      const phones = desc.match(LOCATION_PHONE_RE) || [];
      phones.forEach(phone => addPhone(phone, descTarget, `Service: ${serviceName} (description)`));
    }
    const eventInfos = Array.isArray(service?.EventRelatedInfos) ? service.EventRelatedInfos : [];
    eventInfos.forEach(info => {
      const infoText = String(info?.information || '').trim();
      if (!infoText) return;
      const eventTarget = buildServiceUrl(locationId, serviceId, 'other-info');
      const links = infoText.match(LOCATION_LINK_RE) || [];
      links.forEach(link => addLink(link, eventTarget, `Service: ${serviceName} (event info)`));
      const emails = infoText.match(LOCATION_EMAIL_RE) || [];
      emails.forEach(email => addEmail(email, `Service: ${serviceName} (event info)`, eventTarget));
      const phones = infoText.match(LOCATION_PHONE_RE) || [];
      phones.forEach(phone => addPhone(phone, eventTarget, `Service: ${serviceName} (event info)`));
    });
    const serviceStrings = [];
    collectContactStrings(service, serviceStrings, 0, {
      skipRootKeys: ['EventRelatedInfos', 'Taxonomies', 'RegularSchedules', 'HolidaySchedules', 'Eligibilities']
    });
    const serviceText = serviceStrings.join(' ');
    const serviceEmails = serviceText.match(LOCATION_EMAIL_RE) || [];
    serviceEmails.forEach(email => addEmail(email, `Service: ${serviceName} (details)`, descTarget));
  });
  const locationPhones = Array.isArray(locationData?.Phones) ? locationData.Phones : [];
  const visibleLocationPhoneIndex = locationPhones.length > 1 ? 0 : -1;
  const phoneQuestionUrl = buildLocationQuestionUrl(locationId, 'phone-number');
  locationPhones.forEach((phone, index) => {
    if (phone?.number) {
      const phoneTarget = phone?.id ? buildLocationPhoneEditUrl(locationId, phone.id) : phoneQuestionUrl;
      let label = 'Location phone';
      if (visibleLocationPhoneIndex !== -1) {
        label = index === visibleLocationPhoneIndex ? 'Location phone (visible)' : 'Location phone (invisible)';
      }
      addPhone(phone.number, phoneTarget, label);
    }
  });
  const websiteQuestionUrl = buildLocationQuestionUrl(locationId, 'website');
  const urlFields = [];
  if (locationData?.url) urlFields.push({ value: locationData.url, label: 'Location url' });
  if (locationData?.Organization?.url) urlFields.push({ value: locationData.Organization.url, label: 'Organization url' });
  services.forEach(service => {
    if (service?.url) {
      const serviceName = service?.name ? truncateText(service.name, 40) : 'Service';
      urlFields.push({ value: service.url, label: `Service url: ${serviceName}` });
    }
  });
  urlFields.forEach(entry => addLink(entry.value, websiteQuestionUrl, entry.label));
  const allStrings = [];
  collectContactStrings(locationData, allStrings, 0, { skipRootKeys: ['streetview_url'] });
  const allText = allStrings.join(' ');
  const generalLinks = allText.match(LOCATION_LINK_RE) || [];
  generalLinks.forEach(link => addLink(link, normalizeContactUrl(link), 'Detected link', { skipIfSeenNormalized: true }));
  const generalEmails = allText.match(LOCATION_EMAIL_RE) || [];
  generalEmails.forEach(email => addEmail(email, 'Detected email'));
  return { linkItems, emailItems, phoneItems };
}
async function patchLocationOrganizationEmail(locationId, orgId, email) {
  if (!locationId) throw new Error('Missing location id.');
  const url = `${LOCATION_API_BASE}/${locationId}`;
  const payload = { Organization: { email: email || null } };
  if (orgId) payload.Organization.id = orgId;
  const { accessToken, idToken } = getCognitoTokens();
  const tokens = [idToken, accessToken].filter(Boolean);
  if (!tokens.length) tokens.push(null);
  const fetcher = typeof fetchViaBackground === 'function' ? fetchViaBackground : fetch;
  const attempt = async (token, useBearer) => {
    const headers = {
      'Content-Type': 'application/json',
      accept: 'application/json, text/plain, */*'
    };
    if (token) headers.Authorization = useBearer ? `Bearer ${token}` : token;
    return fetcher(url, {
      method: 'PATCH',
      headers,
      body: JSON.stringify(payload),
      mode: 'cors',
      credentials: 'include'
    });
  };
  let res = null;
  for (const token of tokens) {
    if (token) {
      res = await attempt(token, false);
      if (res.ok) break;
      if (res.status !== 401 && res.status !== 403) break;
      res = await attempt(token, true);
      if (res.ok) break;
      if (res.status !== 401 && res.status !== 403) break;
    } else {
      res = await attempt(null, false);
      if (res.ok) break;
    }
  }
  if (!res) {
    throw new Error('Email update failed: no response');
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Email update failed (${res.status}): ${text || 'unknown error'}`);
  }
  return res.json().catch(() => null);
}
function updateCachedLocationOrganizationEmail(locationId, email) {
  if (!locationId) return false;
  const locationKey = String(locationId).toLowerCase();
  const applyUpdate = (data) => {
    if (!data || typeof data !== 'object') return false;
    if (!data.Organization || typeof data.Organization !== 'object') {
      data.Organization = {};
    }
    data.Organization.email = email || null;
    if (data.organization && typeof data.organization === 'object') {
      data.organization.email = email || null;
    }
    return true;
  };
  let updated = false;
  if (typeof locationRecordCache !== 'undefined') {
    const memEntry = locationRecordCache.get(locationId) || locationRecordCache.get(locationKey);
    if (memEntry?.data && applyUpdate(memEntry.data)) {
      locationRecordCache.set(locationId, { data: memEntry.data, timestamp: Date.now() });
      updated = true;
    }
  }
  if (typeof getCachedLocationData === 'function' && typeof setCachedLocationData === 'function') {
    try {
      const cachedData = getCachedLocationData(locationId);
      if (cachedData && applyUpdate(cachedData)) {
        setCachedLocationData(locationId, cachedData);
        updated = true;
      }
    } catch (_error) {
      // Ignore cache update failure.
    }
  }
  if (typeof PAGE_LOCATION_CACHE_KEY !== 'undefined') {
    try {
      const raw = localStorage.getItem(PAGE_LOCATION_CACHE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed?.uuid && String(parsed.uuid).toLowerCase() === locationKey && parsed?.data) {
          if (applyUpdate(parsed.data)) {
            parsed.timestamp = Date.now();
            localStorage.setItem(PAGE_LOCATION_CACHE_KEY, JSON.stringify(parsed));
            updated = true;
          }
        }
      }
    } catch (_error) {
      // Ignore page cache update failure.
    }
  }
  return updated;
}
function removeLocationContactOverlay() {
  removeRelatedLocationsOverlay();
  document.getElementById(LOCATION_CONTACT_CONTAINER_ID)?.remove();
}
function renderLocationContactOverlay(locationId, locationData) {
  const existing = document.getElementById(LOCATION_CONTACT_CONTAINER_ID);
  const wasOpen = existing?.dataset?.open === 'true';
  if (existing) existing.remove();
  const { linkItems, emailItems, phoneItems } = buildLocationContactData(locationData, locationId);
  const container = document.createElement('div');
  container.id = LOCATION_CONTACT_CONTAINER_ID;
  container.dataset.open = wasOpen ? 'true' : 'false';
  Object.assign(container.style, {
    position: 'fixed',
    top: '88px',
    left: '20px',
    zIndex: '10000',
    fontFamily: 'Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    color: '#1f1f1f'
  });
  const toggle = document.createElement('button');
  toggle.id = LOCATION_CONTACT_TOGGLE_ID;
  toggle.type = 'button';
  toggle.textContent = wasOpen ? 'x' : '?';
  Object.assign(toggle.style, {
    width: '28px',
    height: '28px',
    borderRadius: '50%',
    border: '1px solid #c9c9c9',
    background: '#fff',
    fontSize: '16px',
    fontWeight: '700',
    cursor: 'pointer',
    boxShadow: '0 2px 6px rgba(0,0,0,0.15)'
  });
  const panel = document.createElement('div');
  panel.id = LOCATION_CONTACT_PANEL_ID;
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
    display: wasOpen ? 'block' : 'none'
  });
  const setOpenState = (open) => {
    container.dataset.open = open ? 'true' : 'false';
    toggle.textContent = open ? 'x' : '?';
    panel.style.display = open ? 'block' : 'none';
  };
  toggle.addEventListener('click', () => {
    const isOpen = container.dataset.open === 'true';
    setOpenState(!isOpen);
  });
  const appendSection = (title, items, renderer) => {
    if (!items.length) return;
    const section = document.createElement('div');
    section.style.marginBottom = '12px';
    const header = document.createElement('div');
    header.textContent = title;
    header.style.cssText = 'font-weight: 600; font-size: 13px; margin-bottom: 6px;';
    section.appendChild(header);
    items.forEach(item => section.appendChild(renderer(item)));
    panel.appendChild(section);
  };
  const createMeta = (text) => {
    const meta = document.createElement('div');
    meta.textContent = text;
    meta.style.cssText = 'font-size: 11px; color: #666; margin-top: 2px;';
    return meta;
  };
  const copyToClipboard = async (text) => {
    const value = String(text || '');
    if (!value) return false;
    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(value);
        return true;
      } catch {
        // fall through to legacy path
      }
    }
    const textarea = document.createElement('textarea');
    textarea.value = value;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    const ok = document.execCommand('copy');
    textarea.remove();
    return ok;
  };
  const createActionButton = (label) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = label;
    Object.assign(btn.style, {
      background: 'none',
      border: 'none',
      padding: '0',
      color: '#0d6efd',
      fontSize: '12px',
      textAlign: 'left',
      cursor: 'pointer',
      flex: '1'
    });
    return btn;
  };
  const createCopyButton = (text) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = 'Copy';
    btn.style.cssText = `
      background: #f1f1f1;
      border: 1px solid #ccc;
      border-radius: 4px;
      padding: 2px 6px;
      font-size: 11px;
      cursor: pointer;
    `;
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const ok = await copyToClipboard(text);
      if (!btn.isConnected) return;
      const original = btn.textContent;
      btn.textContent = ok ? 'Copied' : 'Copy failed';
      setTimeout(() => {
        if (btn.isConnected) btn.textContent = original;
      }, 1200);
    });
    return btn;
  };
  const createLinkEntry = (item) => {
    const entry = document.createElement('div');
    entry.style.marginBottom = '8px';
    const row = document.createElement('div');
    row.style.cssText = 'display: flex; align-items: center; gap: 6px;';
    const actionBtn = createActionButton(truncateText(item.display, 60));
    actionBtn.title = item.display;
    actionBtn.addEventListener('click', () => {
      if (item.targetUrl) {
        window.location.href = item.targetUrl;
      }
    });
    const status = document.createElement('span');
    status.textContent = '...';
    status.style.cssText = 'font-size: 11px; color: #666; min-width: 36px; text-align: right;';
    const previewBtn = document.createElement('button');
    previewBtn.type = 'button';
    previewBtn.textContent = 'Preview';
    previewBtn.disabled = true;
    previewBtn.style.cssText = `
      background: #f1f1f1;
      border: 1px solid #ccc;
      border-radius: 4px;
      padding: 2px 6px;
      font-size: 11px;
      cursor: pointer;
    `;
    previewBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const workingUrl = previewBtn.dataset.workingUrl || item.normalizedUrl;
      const isHttps = previewBtn.dataset.isHttps === 'true';
      showLocationLinkPreview(workingUrl, isHttps);
    });
    row.appendChild(actionBtn);
    row.appendChild(status);
    row.appendChild(previewBtn);
    entry.appendChild(row);
    if (item.sourceLabel) {
      entry.appendChild(createMeta(item.sourceLabel));
    }
    checkLocationUrlStatus(item.normalizedUrl).then(result => {
      if (!status.isConnected) return;
      const statusValue = result?.status || 'unknown';
      if (statusValue === 'valid') {
        status.textContent = 'OK';
        status.style.color = '#2e7d32';
        previewBtn.disabled = false;
        previewBtn.style.background = '#fff';
      } else if (statusValue === 'broken') {
        status.textContent = 'BAD';
        status.style.color = '#c62828';
      } else if (statusValue === 'invalid') {
        status.textContent = 'INVALID';
        status.style.color = '#666';
      } else {
        status.textContent = '??';
        status.style.color = '#666';
      }
      previewBtn.dataset.workingUrl = result?.workingUrl || item.normalizedUrl;
      previewBtn.dataset.isHttps = result?.isHttps ? 'true' : 'false';
    });
    return entry;
  };
  const createEmailEntry = (item) => {
    const entry = document.createElement('div');
    entry.style.marginBottom = '8px';
    const row = document.createElement('div');
    row.style.cssText = 'display: flex; align-items: center; gap: 6px;';
    const actionBtn = createActionButton(truncateText(item.display, 60));
    actionBtn.title = item.display;
    actionBtn.addEventListener('click', () => {
      if (item.targetUrl) {
        if (/\/team\/location\//i.test(item.targetUrl)) {
          window.location.href = item.targetUrl;
        } else {
          window.open(item.targetUrl, '_blank');
        }
      }
    });
    row.appendChild(actionBtn);
    row.appendChild(createCopyButton(item.display));
    entry.appendChild(row);
    if (item.sourceLabel) {
      entry.appendChild(createMeta(item.sourceLabel));
    }
    return entry;
  };
  const createPhoneEntry = (item) => {
    const entry = document.createElement('div');
    entry.style.marginBottom = '8px';
    const row = document.createElement('div');
    row.style.cssText = 'display: flex; align-items: center; gap: 6px;';
    const actionBtn = createActionButton(truncateText(item.display, 60));
    actionBtn.title = item.display;
    actionBtn.addEventListener('click', () => {
      if (item.targetUrl) {
        window.location.href = item.targetUrl;
      }
    });
    row.appendChild(actionBtn);
    row.appendChild(createCopyButton(item.display));
    entry.appendChild(row);
    if (item.sourceLabel) {
      entry.appendChild(createMeta(item.sourceLabel));
    }
    return entry;
  };
  const createOrganizationEmailSection = () => {
    const section = document.createElement('div');
    section.style.marginBottom = '12px';
    const header = document.createElement('div');
    header.textContent = 'Organization email';
    header.style.cssText = 'font-weight: 600; font-size: 13px; margin-bottom: 6px;';
    const row = document.createElement('div');
    row.style.cssText = 'display: flex; align-items: center; gap: 6px;';
    const input = document.createElement('input');
    input.type = 'email';
    input.placeholder = 'Add organization email';
    input.value = String(locationData?.Organization?.email || '').trim();
    input.style.cssText = `
      flex: 1;
      min-width: 0;
      padding: 4px 6px;
      border: 1px solid #ccc;
      border-radius: 4px;
      font-size: 12px;
    `;
    const saveBtn = document.createElement('button');
    saveBtn.type = 'button';
    saveBtn.textContent = input.value ? 'Update' : 'Add';
    saveBtn.style.cssText = `
      background: #0d6efd;
      color: #fff;
      border: none;
      padding: 4px 8px;
      border-radius: 4px;
      font-size: 12px;
      cursor: pointer;
    `;
    const status = createMeta('');
    let saving = false;
    let currentEmail = input.value;
    const setSaveState = () => {
      const nextValue = input.value.trim();
      const dirty = nextValue !== currentEmail;
      saveBtn.disabled = saving || !dirty;
      saveBtn.style.opacity = saveBtn.disabled ? '0.6' : '1';
      saveBtn.style.cursor = saveBtn.disabled ? 'default' : 'pointer';
    };
    const setStatus = (text, color) => {
      status.textContent = text;
      status.style.color = color || '#666';
    };
    input.addEventListener('input', () => {
      setStatus('', '#666');
      setSaveState();
    });
    saveBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const nextValue = input.value.trim();
      if (nextValue && !LOCATION_EMAIL_VALIDATION_RE.test(nextValue)) {
        setStatus('Enter a valid email.', '#c62828');
        return;
      }
      saving = true;
      setSaveState();
      setStatus('Saving...', '#666');
      try {
        await patchLocationOrganizationEmail(locationId, locationData?.Organization?.id, nextValue || null);
        currentEmail = nextValue;
        if (!locationData.Organization || typeof locationData.Organization !== 'object') {
          locationData.Organization = {};
        }
        locationData.Organization.email = nextValue || null;
        updateCachedLocationOrganizationEmail(locationId, nextValue || null);
        setStatus('Saved.', '#2e7d32');
        setTimeout(() => {
          if (!document.getElementById(LOCATION_CONTACT_CONTAINER_ID)) return;
          renderLocationContactOverlay(locationId, locationData);
        }, 200);
      } catch (err) {
        setStatus(err?.message || 'Failed to update email.', '#c62828');
      } finally {
        saving = false;
        setSaveState();
      }
    });
    row.appendChild(input);
    row.appendChild(saveBtn);
    section.appendChild(header);
    section.appendChild(row);
    section.appendChild(status);
    setSaveState();
    return section;
  };
  const createRelatedLocationsSection = () => {
    const contactData = { linkItems, emailItems, phoneItems };
    const keyIndex = buildContactKeyIndexFromItems(contactData);
    if (!keyIndex.hasAny) return null;
    const entry = ensureRelatedMatchesLoaded({
      locationId,
      locationData,
      contactData,
      keyIndex,
      immediate: false
    });
    if (entry?.status === 'empty') return null;
    const section = document.createElement('div');
    section.style.marginBottom = '12px';
    const header = document.createElement('div');
    header.textContent = 'Related locations';
    header.style.cssText = 'font-weight: 600; font-size: 13px; margin-bottom: 6px;';
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = 'Find related locations';
    button.style.cssText = `
      background: #0d6efd;
      color: #fff;
      border: none;
      padding: 4px 8px;
      border-radius: 4px;
      font-size: 12px;
      cursor: pointer;
    `;
    const status = createMeta('Checking for matches...');
    status.dataset.relatedMeta = 'true';
    const applyEntryState = (resolved) => {
      if (!resolved || !section.isConnected) return;
      section.dataset.relatedStatus = resolved.status || '';
      if (resolved.status === 'ready') {
        const count = resolved.matches?.length || 0;
        button.textContent = count ? `Related (${count})` : 'Find related locations';
        status.textContent = count
          ? `${count} related location${count === 1 ? '' : 's'} found.`
          : 'Matches cached locations sharing a phone, email, or link.';
        return;
      }
      if (resolved.status === 'loading') {
        button.textContent = 'Find related locations';
        status.textContent = 'Checking for matches...';
        return;
      }
      if (resolved.status === 'empty') {
        status.textContent = 'No related locations found.';
        section.dataset.relatedStatus = 'empty';
        setTimeout(() => {
          if (!section.isConnected) return;
          if (section.dataset.relatedStatus === 'empty') {
            section.style.display = 'none';
          }
        }, 1400);
        return;
      }
      if (resolved.status === 'error') {
        button.textContent = 'Retry related locations';
        status.textContent = 'Failed to check. Click to retry.';
      }
    };
    applyEntryState(entry);
    if (entry?.status === 'loading' && entry.promise) {
      entry.promise.then((resolved) => {
        applyEntryState(resolved);
      });
    }
    button.addEventListener('click', () => {
      openRelatedLocationsOverlay({
        locationId,
        locationData,
        contactData,
        sourceSection: section
      });
    });
    section.appendChild(header);
    section.appendChild(button);
    section.appendChild(status);
    return section;
  };
  panel.appendChild(createOrganizationEmailSection());
  appendSection('Links', linkItems, createLinkEntry);
  appendSection('Emails', emailItems, createEmailEntry);
  appendSection('Phones', phoneItems, createPhoneEntry);
  const relatedSection = createRelatedLocationsSection();
  if (relatedSection) panel.appendChild(relatedSection);
  container.appendChild(toggle);
  container.appendChild(panel);
  document.body.appendChild(container);
}
async function updateLocationContactOverlay(locationId) {
  const isLocationPath = /^\/team\/location\/[a-f0-9-]{12,36}(?:\/|$)/i.test(location.pathname);
  if (!isLocationPath || !locationId) {
    removeLocationContactOverlay();
    return;
  }
  const requestId = ++locationContactRequestId;
  try {
    const { data: locationData, fromCache, source } = await fetchFullLocationRecord(locationId, { refresh: false });
    if (requestId !== locationContactRequestId) return;
    if (!locationData) {
      removeLocationContactOverlay();
      return;
    }
    renderLocationContactOverlay(locationId, locationData);
    if (fromCache && source !== 'page-cache' && source !== 'page-cache-wait') {
      fetchFullLocationRecord(locationId, { refresh: true })
        .then(({ data: freshData }) => {
          if (!freshData || requestId !== locationContactRequestId) return;
          renderLocationContactOverlay(locationId, freshData);
        })
        .catch(err => {
          console.error('[Location Contact] Background refresh failed', err);
        });
    }
  } catch (err) {
    console.error('[Location Contact] Failed to load overlay', err);
  }
}
/* ==========================================
   Helpers: Google Voice / Gmail link builders
   ========================================== */
function digitsOnly(s){ return (s||"").replace(/\D/g, ""); }
function buildGVUrl(raw){
  // Sanitize input - remove any tel: prefixes that might be present
  const sanitized = String(raw).replace(/^tel:/i, '');
  console.log('[buildGVUrl] Processing:', raw, '-> sanitized:', sanitized); // Debug log
  // More robust extension parsing
  const m = sanitized.match(/^\s*(.+?)(?:\s*(?:[,;]|x|ext\.?|extension|#)\s*(\d+))?\s*$/i);
  let main = m ? m[1] : sanitized;
  const ext = m && m[2] ? m[2] : "";
  console.log('[buildGVUrl] Main part before digits extraction:', main); // Debug log
  let digits = digitsOnly(main);
  console.log('[buildGVUrl] Digits extracted:', digits); // Debug log
  // Use last 10 digits for US numbers; adjust if you need intl routing
  if (digits.length > 10) digits = digits.slice(-10);
  if (digits.length !== 10) {
    console.log('[buildGVUrl] Invalid digit count:', digits.length); // Debug log
    return null;
  }
  const extSuffix = ext ? `,${ext}` : "";
  const result = `https://voice.google.com/u/0/calls?a=nc,%2B1${digits}${extSuffix}`;
  console.log('[buildGVUrl] Generated URL:', result); // Debug log
  return result;
}
function buildGmailUrl(email){
  return `https://mail.google.com/mail/?view=cm&to=${encodeURIComponent(email.trim())}`;
}
/* =======================================================
   Linkify plain text + rewrite existing tel:/mailto: links
   ======================================================= */
function linkifyPhonesAndEmails(rootDoc){
  const root = rootDoc || document;
  // 1) Rewrite existing <a href="tel:"> and <a href="mailto:">
  root.querySelectorAll('a[href^="tel:"], a[href^="mailto:"]').forEach(a => {
    if (a.closest(`#${LOCATION_CONTACT_CONTAINER_ID},#${RELATED_LOCATIONS_OVERLAY_ID}`)) return;
    const href = a.getAttribute('href') || "";
    if (href.startsWith("tel:")) {
      const url = buildGVUrl(href.slice(4));
      if (url) a.setAttribute('href', url);
    } else {
      const email = href.replace(/^mailto:/, "");
      a.setAttribute('href', buildGmailUrl(email));
    }
    a.setAttribute('target', '_blank');
    a.setAttribute('rel', 'noopener noreferrer');
  });
  // 2) Linkify plain text occurrences
  const walker = document.createTreeWalker(
    root.body || root,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode(node){
        if (!node.nodeValue || !/[A-Za-z0-9@]/.test(node.nodeValue)) return NodeFilter.FILTER_REJECT;
        // skip inside these
        if (node.parentElement?.closest(`a,script,style,textarea,select,code,pre,svg,#yp-embed-wrapper,#${LOCATION_CONTACT_CONTAINER_ID},#${RELATED_LOCATIONS_OVERLAY_ID}`)) {
          return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      }
    }
  );
  const emailRe = /[\w.+-]+@[\w.-]+\.\w{2,}/g;
  const phoneRe = /(?:(?:\+?1[\s.\-]*)?)\(?\d{3}\)?[\s.\-]*\d{3}[\s.\-]*\d{4}(?:\s*(?:x|ext\.?|extension|#)\s*\d+)?/gi;
  const combo = new RegExp(`${phoneRe.source}|${emailRe.source}`, 'gi');
  const textNodes = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) textNodes.push(n);
  textNodes.forEach(tn => {
    const text = tn.nodeValue;
    let match, last = 0, changed = false;
    const frag = document.createDocumentFragment();
    while ((match = combo.exec(text))) {
      changed = true;
      const part = text.slice(last, match.index);
      if (part) frag.appendChild(document.createTextNode(part));
      const found = match[0];
      const a = document.createElement('a');
      if (found.includes('@')) {
        a.href = buildGmailUrl(found);
      } else {
        const gv = buildGVUrl(found);
        if (!gv) {
          frag.appendChild(document.createTextNode(found));
          last = combo.lastIndex;
          continue;
        }
        a.href = gv;
      }
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.textContent = found.trim();
      frag.appendChild(a);
      last = combo.lastIndex;
    }
    if (!changed) return;
    const tail = text.slice(last);
    if (tail) frag.appendChild(document.createTextNode(tail));
    tn.parentNode.replaceChild(frag, tn);
  });
}
// Re-run linkification on DOM changes (SPA-friendly)
function installLinkObservers(){
  if (window.top !== window.self) return;
  linkifyPhonesAndEmails(document);
  const mo = new MutationObserver(() => linkifyPhonesAndEmails(document));
  mo.observe(document.body, { childList: true, subtree: true });
}
/* =====================================
   YourPeer embed create/remount function
   ===================================== */
function createYourPeerEmbedWindow(slug, services, onClose = () => {}, positionOverride = null) {
  if (!slug) return;
  const wrapperId = "yp-embed-wrapper";
  const existing = document.getElementById(wrapperId);
  let pos = positionOverride || getCurrentYPPos(existing) || getSavedYPPos();
  existing?.remove();
  const defaultTop = 120;
  const defaultLeft = 360;
  const top = Number.isFinite(pos?.top) ? pos.top : defaultTop;
  const left = Number.isFinite(pos?.left) ? pos.left : defaultLeft;
  // Prefer a service hash if current URL has /services/<id>..., else first service
  const serviceIdFromUrl = getServiceIdFromPath();
  const hash = pickServiceHash(services, serviceIdFromUrl);
  const wrapper = document.createElement("div");
  wrapper.id = wrapperId;
  wrapper.dataset.slug = slug;
  wrapper.dataset.hash = hash || ""; // used by remount
  Object.assign(wrapper.style, {
    position: "fixed",
    top: `${top}px`,
    left: `${left}px`,
    width: "400px",
    height: "500px",
    background: "#fff",
    border: "2px solid #000",
    borderRadius: "8px",
    boxShadow: "0 2px 6px rgba(0,0,0,0.3)",
    zIndex: 99999,
    overflow: "hidden",
    display: "flex",
    flexDirection: "column"
  });
  // Drag bar
  const dragBar = document.createElement("div");
  Object.assign(dragBar.style, {
    background: "#eee",
    padding: "6px 10px",
    cursor: "grab",
    fontWeight: "bold",
    borderBottom: "1px solid #ccc",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center"
  });
  // Copy link button
  const copyBtn = document.createElement("button");
  copyBtn.textContent = "Copy YP Link";
  Object.assign(copyBtn.style, {
    fontSize: "12px",
    padding: "4px 8px",
    cursor: "pointer",
    backgroundColor: "#f0f0f0",
    border: "1px solid #ccc",
    borderRadius: "4px"
  });
  copyBtn.onclick = () => {
    const url = `https://yourpeer.nyc/locations/${slug}${hash}`;
    navigator.clipboard.writeText(url)
      .then(() => { copyBtn.textContent = "Copied!"; setTimeout(() => { copyBtn.textContent = "Copy YP Link"; }, 1200); })
      .catch(() => { copyBtn.textContent = "Failed to copy"; setTimeout(() => { copyBtn.textContent = "Copy YP Link"; }, 1200); });
  };
  const closeBtn = document.createElement("span");
  closeBtn.innerHTML = "&times;";
  Object.assign(closeBtn.style, { cursor: "pointer", fontSize: "18px", padding: "0 6px" });
  closeBtn.onclick = () => {
    saveYPPos(getCurrentYPPos(wrapper));
    wrapper.remove();
    onClose();
  };
  dragBar.appendChild(copyBtn);
  dragBar.appendChild(closeBtn);
  wrapper.appendChild(dragBar);
  // Iframe
  const iframe = document.createElement("iframe");
  iframe.src = `https://yourpeer.nyc/locations/${slug}${hash}`;
  Object.assign(iframe.style, { border: "none", width: "100%", height: "100%" });
  wrapper.appendChild(iframe);
  document.body.appendChild(wrapper);
  // Drag handling (live save)
  let isDragging = false, offsetX = 0, offsetY = 0;
  dragBar.addEventListener("mousedown", (e) => {
    isDragging = true;
    const rect = wrapper.getBoundingClientRect();
    offsetX = e.clientX - rect.left;
    offsetY = e.clientY - rect.top;
    dragBar.style.cursor = "grabbing";
    e.preventDefault();
  });
  document.addEventListener("mousemove", (e) => {
    if (!isDragging) return;
    const maxX = window.innerWidth - wrapper.offsetWidth;
    const maxY = window.innerHeight - wrapper.offsetHeight;
    const newX = Math.min(Math.max(0, e.clientX - offsetX), maxX);
    const newY = Math.min(Math.max(0, e.clientY - offsetY), maxY);
    wrapper.style.left = `${newX}px`;
    wrapper.style.top = `${newY}px`;
    saveYPPos({ left: newX, top: newY });
  });
  document.addEventListener("mouseup", () => {
    isDragging = false;
    dragBar.style.cursor = "grab";
  });
  // Remount after OK / DONE EDITING (fix setTimeout)
  document.addEventListener("click", (e) => {
    const btn = e.target.closest("button.Button-primary");
    if (!btn) return;
    const txt = (btn.textContent || "").trim().toUpperCase();
    if (txt === "OK" || txt === "DONE EDITING") {
      setTimeout(() => remountYourPeerEmbed(), 1000);
    }
  });
}
// Use the stored slug/hash to refresh the iframe src
function remountYourPeerEmbed() {
  const wrapper = document.getElementById("yp-embed-wrapper");
  if (!wrapper) return;
  const slug = wrapper.dataset.slug || "";
  const hash = wrapper.dataset.hash || "";
  const iframe = wrapper.querySelector("iframe");
  if (!iframe || !slug) return;
  const url = `https://yourpeer.nyc/locations/${slug}${hash}`;
  // Force refresh even if same URL
  iframe.src = url;
}
/* Kick off linkifying for host page */
installLinkObservers();
// --- Recreate (preserving coords) ---
function recreateYourPeerEmbed(slug, services = []) {
  // Prefer current live coords if window exists; else saved; else defaults inside create
  const existing = document.getElementById("yp-embed-wrapper");
  const pos = getCurrentYPPos(existing) || getSavedYPPos() || null;
  createYourPeerEmbedWindow(slug, services, () => {}, pos);
}
// Example
document.addEventListener("DOMContentLoaded", function() {
  const signInHeader = document.querySelector('.sign-in-header');
  if (signInHeader) {
    const noteOverlay = document.getElementById('gg-note-overlay');
    const noteWrapper = document.getElementById('gg-note-wrapper');
    if (noteOverlay) {
      noteOverlay.style.display = 'none';  
    }
    if (noteWrapper) {
      noteWrapper.style.display = 'none';  
    }
  }
});
function addMicrophoneButton() {
  const reminderNote = document.getElementById("reminder-note");
  if (!reminderNote) {
    console.warn("🎤 reminder-note element not found.");
    return null;  
  }
  const micButton = document.createElement("button");
  micButton.id = "mic-button";
  micButton.style.marginLeft = "10px";
  micButton.style.padding = "10px";
  micButton.style.background = "#fff";
  micButton.style.border = "2px solid #000";
  micButton.style.borderRadius = "50%";
  micButton.style.cursor = "pointer";
  micButton.innerHTML = "🎤";
  reminderNote.parentElement.appendChild(micButton);
  return micButton;
}
let recognition;
let isRecognizing = false;
function initializeSpeechRecognition() {
  if (!('webkitSpeechRecognition' in window)) {
    alert("Speech recognition is not supported by this browser.");
    return;
  }
  recognition = new webkitSpeechRecognition(); 
  recognition.continuous = true; 
  recognition.interimResults = true; 
  recognition.lang = "en-US"; 
  recognition.maxAlternatives = 1; 
  recognition.onstart = () => {
    isRecognizing = true;
    console.log("Speech recognition started.");
  };
  recognition.onend = () => {
    isRecognizing = false;
    console.log("Speech recognition ended.");
  };
  recognition.onerror = (event) => {
    console.error("Speech recognition error:", event.error);
  };
  recognition.onresult = (event) => {
    let transcript = "";
    for (let i = event.resultIndex; i < event.results.length; i++) {
      transcript += event.results[i][0].transcript;
    }
    const reminderNote = document.getElementById("reminder-note");
    reminderNote.value = transcript; 
  };
}
function attachMicButtonHandler() {
  const micButton = addMicrophoneButton(); 
  if (!micButton) {
    console.warn("Mic button could not be added to the reminder modal.");
    return;
  }
  if (!recognition) {
    console.warn("Speech recognition not initialized. Mic button will not work.");
    return;
  }
  micButton.addEventListener('click', () => {
    const reminderNoteTextarea = document.getElementById("reminder-note");
    if (!reminderNoteTextarea) {
        console.error("reminder-note textarea not found on mic click!");
        return;
    }
    if (isRecognizing) {
      recognition.stop();
      micButton.innerHTML = "Mic"; 
    } else {
      recognition.onresult = (event) => {
        let transcript = "";
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            transcript += event.results[i][0].transcript;
          }
        }
        reminderNoteTextarea.value += (reminderNoteTextarea.value.length > 0 ? " " : "") + transcript;
      };
      recognition.onstart = () => {
        isRecognizing = true;
        micButton.innerHTML = "🛑"; 
        console.log("Reminder speech recognition started.");
      };
      recognition.onend = () => {
        isRecognizing = false;
        micButton.innerHTML = "🎤"; 
        console.log("Reminder speech recognition ended.");
      };
      recognition.onerror = (event) => {
        console.error("Reminder speech recognition error:", event.error);
        if(isRecognizing) {
            isRecognizing = false;
            micButton.innerHTML = "🎤";
        }
      };
      try {
        recognition.start();
      } catch (e) {
        console.error("Error starting recognition:", e);
        alert("Could not start microphone. Please check permissions and try again.");
      }
    }
  });
}
document.addEventListener("DOMContentLoaded", () => {
  initializeSpeechRecognition(); 
});
function isTaxonomyBannerActive(locationId, serviceId) {
  const key = buildTaxonomyBannerKey(locationId, serviceId);
  if (!key) return false;
  if (key !== activeTaxonomyBannerKey) return false;
  return !!document.querySelector('[data-gghost-service-taxonomy]');
}
