// GGHOST_PART_MARKER: gghost.part-5.js
window.__GGHOST_PARTS_LOADED__ = window.__GGHOST_PARTS_LOADED__ || [];
window.__GGHOST_PARTS_LOADED__.push('gghost.part-5.js');
console.log('[gghost] loaded gghost.part-5.js');
const NOTES_CACHE_PREFIX = "ggNotesCache:";
const NOTES_PREVIEW_PREFIX = "ggNotesPreview:";
const NOTES_CACHE_TTL_MS = 2 * 60 * 1000;
function getNotesCacheKey(uuid) {
  return `${NOTES_CACHE_PREFIX}${uuid}`;
}
function getNotesPreviewKey(uuid) {
  return `${NOTES_PREVIEW_PREFIX}${uuid}`;
}
function storageGet(keys) {
  if (!chrome?.storage?.local) return Promise.resolve({});
  return new Promise((resolve) => {
    try {
      chrome.storage.local.get(keys, (payload) => resolve(payload || {}));
    } catch {
      resolve({});
    }
  });
}
function storageSet(payload) {
  if (!chrome?.storage?.local) return Promise.resolve();
  return new Promise((resolve) => {
    try {
      chrome.storage.local.set(payload, () => resolve());
    } catch {
      resolve();
    }
  });
}
function buildNotesArray(data) {
  const notesArray = [];
  if (!data || typeof data !== "object") return notesArray;
  for (const user in data) {
    if (typeof data[user] !== "object") continue;
    for (const date in data[user]) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
      notesArray.push({
        user,
        date,
        note: data[user][date]
      });
    }
  }
  notesArray.sort((a, b) => new Date(a.date) - new Date(b.date));
  return notesArray;
}
function getLatestNoteEntry(notesArray) {
  if (!Array.isArray(notesArray) || notesArray.length === 0) return null;
  return notesArray[notesArray.length - 1];
}
async function readNotesCache(uuid) {
  if (!uuid) return null;
  const cacheKey = getNotesCacheKey(uuid);
  const payload = await storageGet(cacheKey);
  const cached = payload?.[cacheKey];
  if (!cached || typeof cached !== "object") return null;
  const data = cached.data;
  if (!data || typeof data !== "object") return null;
  const ts = Number(cached.ts) || 0;
  const stale = !ts || (Date.now() - ts > NOTES_CACHE_TTL_MS);
  return { data, ts, stale };
}
async function writeNotesCache(uuid, data, notesArray) {
  if (!uuid || !data || typeof data !== "object") return;
  const ts = Date.now();
  const cacheKey = getNotesCacheKey(uuid);
  const latest = getLatestNoteEntry(notesArray || buildNotesArray(data));
  const payload = {
    [cacheKey]: { ts, data }
  };
  if (latest) {
    payload[getNotesPreviewKey(uuid)] = { ts, latest };
  }
  await storageSet(payload);
}
async function writeNotesPreviewEntry(uuid, entry) {
  if (!uuid || !entry || typeof entry !== "object") return;
  const previewKey = getNotesPreviewKey(uuid);
  await storageSet({
    [previewKey]: { ts: Date.now(), latest: entry }
  });
}
function normalizeNotesBaseUrl(baseURL) {
  if (!baseURL) return "";
  return baseURL.endsWith("/") ? baseURL : `${baseURL}/`;
}
function resolveNoteText(raw) {
  if (raw == null) return "";
  if (typeof raw === "string") return raw;
  if (typeof raw === "object") {
    return raw.note || raw.summary || raw.text || JSON.stringify(raw);
  }
  return String(raw);
}
function startTodayNoteListener({ baseURL, uuid, userName, dateKey, onUpdate }) {
  if (!baseURL || !uuid || !userName || !dateKey || typeof EventSource === "undefined") {
    return null;
  }
  const safeBase = normalizeNotesBaseUrl(baseURL);
  const encodedUser = encodeURIComponent(userName);
  const url = `${safeBase}locationNotes/${uuid}/${encodedUser}/${dateKey}.json`;
  let closed = false;
  let source = null;
  try {
    source = new EventSource(url);
  } catch (err) {
    console.warn("[Notes] Failed to start realtime listener:", err);
    return null;
  }
  const handleEvent = (event) => {
    if (!event?.data) return;
    let payload = null;
    try {
      payload = JSON.parse(event.data);
    } catch (_err) {
      return;
    }
    if (!payload || typeof payload !== "object") return;
    onUpdate?.(payload.data);
  };
  source.addEventListener("put", handleEvent);
  source.addEventListener("patch", handleEvent);
  source.onerror = () => {
    if (closed) return;
    console.warn("[Notes] Realtime listener error; stream will retry.");
  };
  return () => {
    closed = true;
    try {
      source.close();
    } catch (_err) {
      // Ignore close failures.
    }
  };
}
async function injectGoGettaButtons() {
  const host = location.hostname;
  if (!host.includes('gogetta.nyc')) {
    removeServiceTaxonomyBanner();
    removeTaxonomyHeartOverlay();
    return;
  }
  if (!document.body) {
    setTimeout(() => injectGoGettaButtons(), 200);
    return;
  }
  const path = location.pathname;
  updateAreaZipOverlayForPath(path);
  const fullServiceMatch = path.match(/^\/team\/location\/([a-f0-9-]+)\/services\/([a-f0-9-]+)(?:\/|$)/i);
  const isQuestionsPath = /\/questions(?:\/|$)/i.test(path);
  const canShowServiceTaxonomy = fullServiceMatch && !isQuestionsPath;
  const teamMatch = path.match(/^\/team\/location\/([a-f0-9-]+)\/?/);
  const findMatch = path.match(/^\/find\/location\/([a-f0-9-]+)\/?/);
  const uuid = (fullServiceMatch || teamMatch || findMatch)?.[1];
  updateLocationContactOverlay((fullServiceMatch || teamMatch)?.[1] || null);
  if (canShowServiceTaxonomy) {
    const locationId = fullServiceMatch[1];
    const serviceId = fullServiceMatch[2];
    removeTaxonomyHeartOverlay();
    if (!isTaxonomyBannerActive(locationId, serviceId)) {
      removeServiceTaxonomyBanner();
      // Always show taxonomy on service pages
      // The overlay will prioritize cached data if navigating from another service
      showServiceTaxonomy(locationId, serviceId).catch(err => {
        console.error('[Service Taxonomy] Failed to render taxonomy banner', err);
      });
    }
  } else if (teamMatch) {
    const locationId = teamMatch[1];
    invalidateServiceTaxonomyRender();
    removeServiceTaxonomyBanner();
    showTaxonomyHeartOverlay(locationId).catch(err => {
      console.error('[Taxonomy Heart] Failed to render heart overlay', err);
    });
  } else {
    invalidateServiceTaxonomyRender();
    removeServiceTaxonomyBanner();
    removeTaxonomyHeartOverlay();
  }
  if (document.body.dataset.gghostRendered === 'true' && hasGghostNotesUi()) {
    return;
  }
  document.body.dataset.gghostRendered = 'true';
  document.querySelectorAll('[data-gghost-container]').forEach(container => container.remove());
  globalButtonDropdown = null;
  buttonActions.length = 0;
  const existingGoToYpBtn = document.querySelector('[data-go-to-yp]');
  if (existingGoToYpBtn) {
    existingGoToYpBtn.remove();
  }
  // Global dropdown system for all gghost buttons
  const createHoverDropdown = () => {
    if (globalButtonDropdown) return globalButtonDropdown;
    const container = document.createElement('div');
    container.setAttribute('data-gghost-container', 'true');
    Object.assign(container.style, {
      position: 'fixed',
      bottom: '0px',
      left: '0px',
      zIndex: '9999'
    });
    const hoverButton = document.createElement('button');
    hoverButton.textContent = 'Hover';
    hoverButton.setAttribute('data-gghost-button', 'true');
    Object.assign(hoverButton.style, {
      padding: '4px 8px',
      fontSize: '11px',
      background: '#fff',
      border: '1px solid black',
      borderLeft: 'none',
      borderBottom: 'none',
      borderRadius: '0 4px 0 0',
      boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
      cursor: 'pointer',
      transition: 'all 0.2s ease'
    });
    const dropdown = document.createElement('div');
    Object.assign(dropdown.style, {
      position: 'absolute',
      bottom: '100%',
      left: '0',
      marginBottom: '8px',
      background: '#fff',
      border: '2px solid black',
      borderRadius: '4px',
      boxShadow: '0 2px 6px rgba(0,0,0,0.15)',
      opacity: '0',
      transform: 'translateY(10px)',
      transition: 'all 0.2s ease',
      pointerEvents: 'none',
      minWidth: '200px'
    });
    let hoverTimeout;
    const showDropdown = () => {
      clearTimeout(hoverTimeout);
      dropdown.style.opacity = '1';
      dropdown.style.transform = 'translateY(0)';
      dropdown.style.pointerEvents = 'auto';
    };
    const hideDropdown = () => {
      hoverTimeout = setTimeout(() => {
        dropdown.style.opacity = '0';
        dropdown.style.transform = 'translateY(10px)';
        dropdown.style.pointerEvents = 'none';
      }, 100);
    };
    container.addEventListener('mouseenter', showDropdown);
    container.addEventListener('mouseleave', hideDropdown);
    container.appendChild(dropdown);
    container.appendChild(hoverButton);
    document.body.appendChild(container);
    globalButtonDropdown = { container, dropdown };
    return globalButtonDropdown;
  };
  const createButton = (text, onClick) => {
    const dropdown = createHoverDropdown();
    const option = document.createElement('div');
    option.textContent = text;
    Object.assign(option.style, {
      padding: '8px 12px',
      cursor: 'pointer',
      fontSize: '13px',
      borderBottom: buttonActions.length > 0 ? '1px solid #ccc' : 'none',
      transition: 'background 0.1s ease'
    });
    option.addEventListener('mouseenter', () => {
      option.style.background = '#f0f0f0';
    });
    option.addEventListener('mouseleave', () => {
      option.style.background = 'transparent';
    });
    option.addEventListener('click', onClick);
    // Add to top of dropdown
    if (dropdown.dropdown.firstChild) {
      dropdown.dropdown.insertBefore(option, dropdown.dropdown.firstChild);
      dropdown.dropdown.firstChild.nextSibling.style.borderBottom = '1px solid #ccc';
    } else {
      dropdown.dropdown.appendChild(option);
    }
    buttonActions.push({ text, onClick, element: option });
    return { remove: () => option.remove(), element: option };
  };
  if (isGoGettaAreaPath(path)) {
    createButton('Area ZIP helper', () => {
      updateAreaZipOverlayForPath(location.pathname);
      if (areaZipOverlayState?.overlay) {
        areaZipOverlayState.overlay.style.display = 'block';
        updateAreaZipAvailability(areaZipOverlayState);
        areaZipOverlayState.textarea?.focus?.();
      }
    });
  }
if (uuid === "connections") {
  console.warn("[Notes] Skipping rendering for reserved UUID: connections");
  return;
}
  if (uuid) {
    const currentMode = teamMatch ? 'edit' : 'view';
    const targetUrl = currentMode === 'edit'
      ? `https://gogetta.nyc/find/location/${uuid}`
      : `https://gogetta.nyc/team/location/${uuid}`;
    createButton(
      currentMode === 'edit' ? 'Switch to Frontend Mode' : 'Switch to Edit Mode',
      () => {
        if (currentMode === 'edit') {
          sessionStorage.setItem('arrivedViaFrontendRedirect', 'true');
        } else if (sessionStorage.getItem('arrivedViaFrontendRedirect') === 'true') {
          sessionStorage.removeItem('arrivedViaFrontendRedirect');
          history.back();
          return;
        }
        window.location.href = targetUrl;
      }, 
      0 
    );
  createButton('Show on YP', async () => {
  console.log(`[YPButton] 🔎 Attempting to fetch slug for UUID (Show on YP): ${uuid}`);
  const path = location.pathname;
  const fullServiceMatch = path.match(/^\/team\/location\/([a-f0-9-]+)\/services\/([a-f0-9-]+)(?:\/|$)/);
if (fullServiceMatch) {
  const locationId = fullServiceMatch[1];
  const serviceId = fullServiceMatch[2];
  try {
    const headers = getAuthHeaders();
    void recordLocationInvocation(locationId, "ypButtonServicePage");
    const res = await fetch(`https://w6pkliozjh.execute-api.us-east-1.amazonaws.com/prod/locations/${locationId}`, { headers });
    const data = await res.json();
    // 🟢 record validation timestamp
    await maybeRecordValidation(locationId, data);
    const slug = data.slug;
    const serviceName = findServiceName(data, serviceId);
    if (!slug || !serviceName) {
      console.warn("[YPButton] ❌ Missing slug or service name for service page. Will not redirect.");
      return;
    }
    const forbiddenChars = /[(){}\[\]"'“”‘’—–]/;
    if (forbiddenChars.test(serviceName)) {
      console.warn("[YPButton] 🚫 Forbidden characters in service name. Will not redirect.");
      return;
    }
    sessionStorage.setItem('ypScrollTarget', serviceName);
    const safeServiceName = serviceName
      .trim()
      .replace(/\s+/g, '-')
      .replace(/[^\w\-+]/g, '')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
    const serviceHash = `#${safeServiceName}`;
    const finalUrl = `https://yourpeer.nyc/locations/${slug}${serviceHash}`;
    console.log(`[YPButton] ✅ Redirecting to YP service (from service page): ${finalUrl}`);
    window.location.href = finalUrl;
  } catch (err) {
    console.error("[YPButton] 🛑 Error fetching location/service data for service page:", err);
    return;
  }
} else {
  try {
    const headers = getAuthHeaders();
    void recordLocationInvocation(uuid, "ypButtonLocationPage");
    const res = await fetch(`https://w6pkliozjh.execute-api.us-east-1.amazonaws.com/prod/locations/${uuid}`, { headers });
    const data = await res.json();
    // 🟢 record validation timestamp
    await maybeRecordValidation(uuid, data);
    const slug = data.slug;
    let storedData = JSON.parse(localStorage.getItem("ypLastViewedService")) || [];
    const newEntry = {
      name: data.Organization?.name,
      location: data.name,
      uuid: uuid,
      slug: slug
    };
    if (!Array.isArray(storedData)) {
      console.warn("Stored data is not an array. Initializing as an empty array.");
      storedData = [];
    }
    const existingEntryIndex = storedData.findIndex(entry => entry.uuid === uuid);
    if (existingEntryIndex === -1) {
      storedData.push(newEntry);
    } else {
      storedData[existingEntryIndex] = newEntry;
    }
    localStorage.setItem("ypLastViewedService", JSON.stringify(storedData));
    console.log(`[YPButton] ✅ Successfully stored: ${data.Organization?.name} - ${data.name} for UUID: ${uuid}`);
    if (slug) {
      const ypUrl = `https://yourpeer.nyc/locations/${slug}`;
      console.log(`[YPButton] ✅ Redirecting to YourPeer (location level): ${ypUrl}`);
      window.location.href = ypUrl;
    } else {
      console.warn('[YPButton] ❌ Slug not found for location-level redirect.');
    }
  } catch (err) {
    console.error('[YPButton] 🛑 Error fetching slug for location-level redirect:', err);
  }
}
}); 
const futureBtn = createButton(
  'Add future/online org',
  () => {
    openFutureOnlineModal(); // 2) Then open the modal
  }
);
// Close location overlay + back button replacement
const CLOSE_LOCATION_DEFAULT_MESSAGE = "This location is temporarily closed.";
const CLOSE_LOCATION_DEFAULT_EVENT = "COVID19";
const CLOSE_LOCATION_OVERLAY_ID = "gghost-close-location-overlay";
const CLOSE_LOCATION_CLOSE_MODE = "close";
const CLOSE_LOCATION_REOPEN_MODE = "reopen";
const CLOSE_LOCATION_EDIT_MODE = "edit";
const CLOSE_LOCATION_RETRY_DELAYS_MS = [500, 1500, 3500, 7000];
const closeLocationStateCache = new Map();
let closeLocationButtonObserver = null;
let closeLocationButtonRequestId = 0;
let closeLocationButtonUpdatePending = false;
let closeLocationButtonActiveId = null;
function getTeamLocationHomeUuid() {
  const match = location.pathname.match(/^\/team\/location\/([a-f0-9-]{12,36})\/?$/i);
  return match ? match[1] : null;
}
function extractPhoneIdFromApiUrl(url) {
  if (!url) return null;
  const match = String(url).match(/\/phones\/([0-9a-f-]{8,})/i);
  return match ? match[1] : null;
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
function extractUserNameFromEventInfo(info) {
  if (!info) return '';
  const candidates = [
    info.userName,
    info.username,
    info.user,
    info.author,
    info.createdBy,
    info.created_by,
    info.updatedBy,
    info.updated_by,
    info.createdByUser,
    info.updatedByUser
  ];
  for (const candidate of candidates) {
    const name = pickUserNameFromValue(candidate);
    if (name) return name;
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
function extractClosedAtFromEventInfo(info) {
  if (!info || typeof info !== 'object') return null;
  const candidates = [
    info.createdAt,
    info.created_at,
    info.updatedAt,
    info.updated_at,
    info.timestamp,
    info.ts,
    info.date
  ];
  for (const candidate of candidates) {
    const ts = coerceTimestamp(candidate);
    if (ts) return ts;
  }
  return null;
}
function extractLocationClosureInfo(locationData) {
  const infos = normalizeEventRelatedInfos(locationData);
  const entry = infos.find((info) => {
    const event = String(info?.event || '').toUpperCase();
    return event === CLOSE_LOCATION_DEFAULT_EVENT;
  }) || null;
  const messageRaw = entry?.information ?? entry?.message ?? null;
  const message = typeof messageRaw === 'string' ? messageRaw.trim() : (messageRaw == null ? '' : String(messageRaw));
  const userName = extractUserNameFromEventInfo(entry);
  const closedAt = extractClosedAtFromEventInfo(entry);
  const isClosed = !!entry && message !== '';
  return { isClosed, message, userName, closedAt, entry };
}
async function fetchLocationClosureState(locationId, { refresh = false } = {}) {
  if (!locationId) return { isClosed: false, message: '', userName: '', closedAt: null, entry: null };
  if (!refresh && closeLocationStateCache.has(locationId)) {
    return closeLocationStateCache.get(locationId);
  }
  try {
    const { data } = await fetchFullLocationRecord(locationId, { refresh });
    const closureInfo = extractLocationClosureInfo(data || {});
    closeLocationStateCache.set(locationId, closureInfo);
    return closureInfo;
  } catch (err) {
    console.warn('[Close Location] Failed to fetch closure state:', err);
    const fallback = { isClosed: false, message: '', userName: '', closedAt: null, entry: null };
    closeLocationStateCache.set(locationId, fallback);
    return fallback;
  }
}
const BACK_BUTTON_LABEL_RE = /\bback\b/i;
const BACK_BUTTON_ICON_RE = /(chevron-left|arrow-left|back|caret-left|angle-left)/i;
const BACK_BUTTON_HINT_RE = /(back|return|previous|chevron-left|arrow-left|caret-left|angle-left)/i;
const BACK_BUTTON_HIDDEN_ATTR = 'data-gghost-back-hidden';
const BACK_BUTTON_DISPLAY_ATTR = 'data-gghost-back-display';
function normalizeBackButtonLabel(value) {
  if (!value) return '';
  return String(value).replace(/\s+/g, ' ').trim();
}
function getBackButtonHintText(el) {
  if (!el) return '';
  const parts = [];
  const dataIcon = normalizeBackButtonLabel(el.getAttribute?.('data-icon'));
  if (dataIcon) parts.push(dataIcon);
  const testId = normalizeBackButtonLabel(
    el.getAttribute?.('data-testid') ||
    el.getAttribute?.('data-test') ||
    el.getAttribute?.('data-qa')
  );
  if (testId) parts.push(testId);
  const classNameValue = el.className;
  const className = normalizeBackButtonLabel(
    typeof classNameValue === 'string'
      ? classNameValue
      : classNameValue?.baseVal
  );
  if (className) parts.push(className);
  return parts.join(' ').trim();
}
function isLikelyHeaderControl(el) {
  if (!el || typeof el.getBoundingClientRect !== 'function') return false;
  const rect = el.getBoundingClientRect();
  if (!Number.isFinite(rect.top) || !Number.isFinite(rect.left)) return false;
  if (rect.width === 0 || rect.height === 0) return false;
  if (rect.top < 0 || rect.left < 0) return false;
  if (rect.top > 200 || rect.left > 200) return false;
  if (rect.width > 240 || rect.height > 120) return false;
  return true;
}
function hideBackButton(btn) {
  if (!btn) return;
  if (btn.dataset.gghostBackHidden === '1') return;
  btn.dataset.gghostBackDisplay = btn.style.display || '';
  btn.dataset.gghostBackHidden = '1';
  btn.style.display = 'none';
}
function restoreHiddenBackButtons() {
  const hidden = document.querySelectorAll(`[${BACK_BUTTON_HIDDEN_ATTR}="1"]`);
  hidden.forEach((btn) => {
    btn.style.display = btn.dataset.gghostBackDisplay || '';
    delete btn.dataset.gghostBackHidden;
    delete btn.dataset.gghostBackDisplay;
  });
}
function readLabelFromIdList(idList) {
  if (!idList) return '';
  const ids = idList.split(/\s+/).filter(Boolean);
  const parts = [];
  for (const id of ids) {
    const node = document.getElementById(id);
    if (node && node.textContent) {
      const text = normalizeBackButtonLabel(node.textContent);
      if (text) parts.push(text);
    }
  }
  return parts.join(' ').trim();
}
function getBackButtonLabel(el) {
  if (!el) return '';
  const parts = [];
  const text = normalizeBackButtonLabel(el.textContent);
  if (text) parts.push(text);
  const aria = normalizeBackButtonLabel(el.getAttribute('aria-label'));
  if (aria) parts.push(aria);
  const title = normalizeBackButtonLabel(el.getAttribute('title'));
  if (title) parts.push(title);
  const labelledBy = readLabelFromIdList(el.getAttribute('aria-labelledby'));
  if (labelledBy) parts.push(labelledBy);
  const testId = normalizeBackButtonLabel(
    el.getAttribute('data-testid') ||
    el.getAttribute('data-test') ||
    el.getAttribute('data-qa')
  );
  if (testId) parts.push(testId);
  const icon = el.querySelector('[aria-label], [title], svg, i');
  if (icon) {
    const iconLabel = normalizeBackButtonLabel(
      icon.getAttribute?.('aria-label') ||
      icon.getAttribute?.('title')
    );
    if (iconLabel) parts.push(iconLabel);
  }
  return parts.join(' ').trim();
}
function hasBackIcon(el) {
  if (!el) return false;
  const icon = el.querySelector('svg, i');
  if (!icon) return false;
  const iconClass = normalizeBackButtonLabel(icon.getAttribute?.('data-icon'));
  const classNameValue = icon.className;
  const className = normalizeBackButtonLabel(
    typeof classNameValue === 'string'
      ? classNameValue
      : classNameValue?.baseVal
  );
  const iconLabel = normalizeBackButtonLabel(
    icon.getAttribute?.('aria-label') ||
    icon.getAttribute?.('title')
  );
  const combined = [iconClass, className, iconLabel].join(' ');
  return BACK_BUTTON_ICON_RE.test(combined);
}
function isBackButtonCandidate(btn) {
  if (!btn || btn.dataset.gghostCloseLocation === '1') return false;
  if (btn.dataset.gghostBackHidden === '1') return false;
  if (btn.closest(`#${CLOSE_LOCATION_OVERLAY_ID}`)) return false;
  const label = getBackButtonLabel(btn);
  if (label && BACK_BUTTON_LABEL_RE.test(label)) return true;
  const hint = getBackButtonHintText(btn);
  if (!label && hint && BACK_BUTTON_HINT_RE.test(hint) && isLikelyHeaderControl(btn)) return true;
  const href = btn.getAttribute?.('href') || '';
  if (href && /\/team(\/|$)/i.test(href)) {
    if (hasBackIcon(btn)) return true;
    if (!label && isLikelyHeaderControl(btn)) return true;
  }
  if (hasBackIcon(btn) && isLikelyHeaderControl(btn)) return true;
  if (btn.classList?.contains('default') && btn.classList?.contains('font-weight-light')) {
    if (isLikelyHeaderControl(btn)) return true;
  }
  return false;
}
function findLocationBackButtons() {
  const buttons = Array.from(
    document.querySelectorAll('button.default.font-weight-light, button, a, [role="button"]')
  );
  return buttons.filter(isBackButtonCandidate);
}
function pickPreferredBackButton(buttons) {
  if (!buttons.length) return null;
  const visible = buttons.filter((btn) => btn.offsetParent !== null);
  const candidates = visible.length ? visible : buttons;
  const absolute = candidates.find((btn) => window.getComputedStyle(btn).position === 'absolute');
  if (absolute) return absolute;
  const positioned = candidates
    .map((btn) => ({ btn, rect: btn.getBoundingClientRect() }))
    .filter(({ rect }) => Number.isFinite(rect.top) && Number.isFinite(rect.left));
  if (positioned.length) {
    positioned.sort((a, b) => (a.rect.top - b.rect.top) || (a.rect.left - b.rect.left));
    return positioned[0].btn;
  }
  return candidates[0];
}
function getExistingCloseLocationButton(locationId) {
  const existing = document.querySelector('button[data-gghost-close-location="1"]');
  if (!existing) return null;
  if (!locationId || existing.dataset.locationId === locationId) return existing;
  existing.remove();
  return null;
}
function removeCloseLocationButtons() {
  document.querySelectorAll('button[data-gghost-close-location="1"]').forEach((btn) => {
    btn.remove();
  });
}
async function submitLocationClosure(locationId, information) {
  if (!locationId) throw new Error('Missing location id.');
  const url = `${LOCATION_API_BASE}/${locationId}`;
  const payload = {
    eventRelatedInfo: {
      information,
      event: CLOSE_LOCATION_DEFAULT_EVENT
    }
  };
  const tokens = (() => {
    const { accessToken, idToken } = getCognitoTokens();
    const list = [];
    if (idToken) list.push(idToken);
    if (accessToken && accessToken !== idToken) list.push(accessToken);
    if (!list.length) list.push(null);
    return list;
  })();
  const attemptRequest = async (token) => {
    const headers = {
      accept: 'application/json, text/plain, */*',
      'Content-Type': 'application/json'
    };
    if (token) headers.Authorization = token;
    const options = {
      method: 'PATCH',
      headers,
      body: JSON.stringify(payload),
      mode: 'cors',
      credentials: 'include'
    };
    const backgroundRes = await fetchViaBackground(url, options);
    if (backgroundRes) return backgroundRes;
    return fetch(url, options);
  };
  let res = null;
  for (const token of tokens) {
    res = await attemptRequest(token);
    if (res.ok) break;
    if (res.status !== 401 && res.status !== 403) break;
  }
  if (!res) throw new Error('Location closure failed: no response');
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Location closure failed: HTTP ${res.status} ${text}`);
  }
  return res.json().catch(() => null);
}
function createCloseLocationOverlayShell() {
  if (document.getElementById(CLOSE_LOCATION_OVERLAY_ID)) return null;
  const overlay = document.createElement('div');
  overlay.id = CLOSE_LOCATION_OVERLAY_ID;
  overlay.style.cssText = [
    'position: fixed',
    'top: 0',
    'left: 0',
    'width: 100%',
    'height: 100%',
    'background: rgba(0, 0, 0, 0.7)',
    'z-index: 100000',
    'display: flex',
    'align-items: center',
    'justify-content: center'
  ].join('; ');
  const dialog = document.createElement('div');
  dialog.style.cssText = [
    'background: white',
    'border-radius: 8px',
    'padding: 20px',
    'max-width: 440px',
    'width: calc(100% - 40px)',
    'box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3)',
    'text-align: left'
  ].join('; ');
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      overlay.remove();
    }
  });
  overlay.appendChild(dialog);
  document.body.appendChild(overlay);
  return { overlay, dialog };
}
function buildClosureSummaryText(userName) {
  if (userName) return `This location was closed by ${userName}.`;
  return 'This location is currently marked as closed.';
}
function showCloseLocationOverlay(locationId, initialMessage = CLOSE_LOCATION_DEFAULT_MESSAGE) {
  if (!locationId) return;
  const shell = createCloseLocationOverlayShell();
  if (!shell) return;
  const { overlay, dialog } = shell;
  const title = document.createElement('h3');
  title.textContent = 'Close this location?';
  title.style.cssText = 'margin: 0 0 12px 0; color: #333;';
  const message = document.createElement('p');
  message.textContent = 'Confirm the temporary closure message below.';
  message.style.cssText = 'margin: 0 0 12px 0; color: #666; line-height: 1.4;';
  const textarea = document.createElement('textarea');
  textarea.value = initialMessage;
  textarea.rows = 4;
  textarea.style.cssText = [
    'width: 100%',
    'padding: 8px',
    'border-radius: 4px',
    'border: 1px solid #ccc',
    'font-size: 14px',
    'box-sizing: border-box'
  ].join('; ');
  const buttonRow = document.createElement('div');
  buttonRow.style.cssText = 'margin-top: 16px; display: flex; gap: 10px; justify-content: flex-end;';
  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.textContent = 'Cancel';
  cancelBtn.style.cssText = [
    'background: #6c757d',
    'color: white',
    'border: none',
    'padding: 8px 16px',
    'border-radius: 4px',
    'cursor: pointer',
    'font-size: 12px'
  ].join('; ');
  const okBtn = document.createElement('button');
  okBtn.type = 'button';
  okBtn.textContent = 'OK';
  okBtn.style.cssText = [
    'background: #dc3545',
    'color: white',
    'border: none',
    'padding: 8px 16px',
    'border-radius: 4px',
    'cursor: pointer',
    'font-size: 12px',
    'font-weight: bold'
  ].join('; ');
  const setBusy = (busy) => {
    okBtn.disabled = busy;
    cancelBtn.disabled = busy;
    okBtn.style.opacity = busy ? '0.7' : '1';
  };
  cancelBtn.addEventListener('click', () => {
    overlay.remove();
  });
  okBtn.addEventListener('click', async () => {
    const info = textarea.value.trim();
    if (!info) {
      alert('Please enter a closure message.');
      return;
    }
    setBusy(true);
    try {
      await submitLocationClosure(locationId, info);
      closeLocationStateCache.set(locationId, {
        isClosed: true,
        message: info,
        userName: getCurrentUsername(),
        closedAt: Date.now(),
        entry: null
      });
      window.location.href = 'https://gogetta.nyc/team';
    } catch (err) {
      console.error('[Close Location] Failed to close location:', err);
      alert('Failed to close location. Please try again.');
      setBusy(false);
    }
  });
  dialog.appendChild(title);
  dialog.appendChild(message);
  dialog.appendChild(textarea);
  buttonRow.appendChild(cancelBtn);
  buttonRow.appendChild(okBtn);
  dialog.appendChild(buttonRow);
  textarea.focus();
}
function showEditMessageOverlay(locationId, closureInfo) {
  if (!locationId) return;
  const shell = createCloseLocationOverlayShell();
  if (!shell) return;
  const { overlay, dialog } = shell;
  const currentMessage = closureInfo?.message || '';
  const title = document.createElement('h3');
  title.textContent = 'Edit closure message';
  title.style.cssText = 'margin: 0 0 12px 0; color: #333;';
  const message = document.createElement('p');
  message.textContent = 'Update the message shown for this closed location.';
  message.style.cssText = 'margin: 0 0 12px 0; color: #666; line-height: 1.4;';
  const textarea = document.createElement('textarea');
  textarea.value = currentMessage || CLOSE_LOCATION_DEFAULT_MESSAGE;
  textarea.rows = 4;
  textarea.style.cssText = [
    'width: 100%',
    'padding: 8px',
    'border-radius: 4px',
    'border: 1px solid #ccc',
    'font-size: 14px',
    'box-sizing: border-box'
  ].join('; ');
  const buttonRow = document.createElement('div');
  buttonRow.style.cssText = 'margin-top: 16px; display: flex; gap: 10px; justify-content: flex-end;';
  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.textContent = 'Cancel';
  cancelBtn.style.cssText = [
    'background: #6c757d',
    'color: white',
    'border: none',
    'padding: 8px 16px',
    'border-radius: 4px',
    'cursor: pointer',
    'font-size: 12px'
  ].join('; ');
  const saveBtn = document.createElement('button');
  saveBtn.type = 'button';
  saveBtn.textContent = 'Save message';
  saveBtn.style.cssText = [
    'background: #007bff',
    'color: white',
    'border: none',
    'padding: 8px 16px',
    'border-radius: 4px',
    'cursor: pointer',
    'font-size: 12px',
    'font-weight: bold'
  ].join('; ');
  const setBusy = (busy) => {
    saveBtn.disabled = busy;
    cancelBtn.disabled = busy;
    saveBtn.style.opacity = busy ? '0.7' : '1';
  };
  cancelBtn.addEventListener('click', () => {
    overlay.remove();
    showReopenLocationOverlay(locationId, closureInfo);
  });
  saveBtn.addEventListener('click', async () => {
    const nextMessage = textarea.value.trim();
    if (!nextMessage) {
      alert('Please enter a closure message.');
      return;
    }
    if (nextMessage === currentMessage.trim()) {
      overlay.remove();
      showReopenLocationOverlay(locationId, closureInfo);
      return;
    }
    setBusy(true);
    try {
      await submitLocationClosure(locationId, nextMessage);
      const updatedInfo = {
        isClosed: true,
        message: nextMessage,
        userName: closureInfo?.userName || '',
        closedAt: closureInfo?.closedAt || Date.now(),
        entry: closureInfo?.entry || null
      };
      closeLocationStateCache.set(locationId, updatedInfo);
      overlay.remove();
      showReopenLocationOverlay(locationId, updatedInfo);
    } catch (err) {
      console.error('[Close Location] Failed to update message:', err);
      alert('Failed to update message. Please try again.');
      setBusy(false);
    }
  });
  dialog.appendChild(title);
  dialog.appendChild(message);
  dialog.appendChild(textarea);
  buttonRow.appendChild(cancelBtn);
  buttonRow.appendChild(saveBtn);
  dialog.appendChild(buttonRow);
  textarea.focus();
}
function showReopenLocationOverlay(locationId, closureInfo) {
  if (!locationId) return;
  const shell = createCloseLocationOverlayShell();
  if (!shell) return;
  const { overlay, dialog } = shell;
  const messageText = closureInfo?.message || '';
  const userName = closureInfo?.userName || '';
  const title = document.createElement('h3');
  title.textContent = 'Reopen the location?';
  title.style.cssText = 'margin: 0 0 12px 0; color: #333;';
  const summary = document.createElement('p');
  summary.textContent = buildClosureSummaryText(userName);
  summary.style.cssText = 'margin: 0 0 8px 0; color: #666; line-height: 1.4;';
  const closedAt = closureInfo?.closedAt;
  const closedAtText = closedAt ? formatTimestampForDisplay(closedAt) : '';
  const closedAtRow = document.createElement('p');
  closedAtRow.textContent = closedAtText ? `Closed at ${closedAtText}.` : '';
  closedAtRow.style.cssText = 'margin: 0 0 8px 0; color: #666; line-height: 1.4;';
  const messageLabel = document.createElement('div');
  messageLabel.textContent = 'Closure message:';
  messageLabel.style.cssText = 'font-size: 12px; font-weight: 600; margin: 6px 0;';
  const messageBox = document.createElement('div');
  messageBox.textContent = messageText || '(No message provided)';
  messageBox.style.cssText = [
    'border: 1px solid #ddd',
    'background: #f8f8f8',
    'border-radius: 6px',
    'padding: 8px',
    'font-size: 13px',
    'color: #333'
  ].join('; ');
  const buttonRow = document.createElement('div');
  buttonRow.style.cssText = 'margin-top: 16px; display: flex; gap: 10px; justify-content: flex-end;';
  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.textContent = 'Cancel';
  cancelBtn.style.cssText = [
    'background: #6c757d',
    'color: white',
    'border: none',
    'padding: 8px 16px',
    'border-radius: 4px',
    'cursor: pointer',
    'font-size: 12px'
  ].join('; ');
  const editBtn = document.createElement('button');
  editBtn.type = 'button';
  editBtn.textContent = 'Edit message';
  editBtn.style.cssText = [
    'background: #007bff',
    'color: white',
    'border: none',
    'padding: 8px 16px',
    'border-radius: 4px',
    'cursor: pointer',
    'font-size: 12px'
  ].join('; ');
  const reopenBtn = document.createElement('button');
  reopenBtn.type = 'button';
  reopenBtn.textContent = 'Reopen location';
  reopenBtn.style.cssText = [
    'background: #28a745',
    'color: white',
    'border: none',
    'padding: 8px 16px',
    'border-radius: 4px',
    'cursor: pointer',
    'font-size: 12px',
    'font-weight: bold'
  ].join('; ');
  const setBusy = (busy) => {
    reopenBtn.disabled = busy;
    editBtn.disabled = busy;
    cancelBtn.disabled = busy;
    reopenBtn.style.opacity = busy ? '0.7' : '1';
  };
  cancelBtn.addEventListener('click', () => {
    overlay.remove();
  });
  editBtn.addEventListener('click', () => {
    overlay.remove();
    showEditMessageOverlay(locationId, closureInfo);
  });
  reopenBtn.addEventListener('click', async () => {
    setBusy(true);
    try {
      await submitLocationClosure(locationId, null);
      closeLocationStateCache.delete(locationId);
      overlay.remove();
      initializeCloseLocationButton();
    } catch (err) {
      console.error('[Close Location] Failed to reopen location:', err);
      alert('Failed to reopen location. Please try again.');
      setBusy(false);
    }
  });
  dialog.appendChild(title);
  dialog.appendChild(summary);
  if (closedAtText) dialog.appendChild(closedAtRow);
  dialog.appendChild(messageLabel);
  dialog.appendChild(messageBox);
  buttonRow.appendChild(cancelBtn);
  buttonRow.appendChild(editBtn);
  buttonRow.appendChild(reopenBtn);
  dialog.appendChild(buttonRow);
}
function setCloseLocationButtonState(button, mode) {
  if (!button) return;
  const nextMode = mode === CLOSE_LOCATION_REOPEN_MODE ? CLOSE_LOCATION_REOPEN_MODE : CLOSE_LOCATION_CLOSE_MODE;
  button.dataset.gghostCloseMode = nextMode;
  button.textContent = nextMode === CLOSE_LOCATION_REOPEN_MODE
    ? 'Reopen location'
    : 'Close location';
}
function ensureCloseLocationButtonHandler(button) {
  if (!button || button.__gghostCloseHandlerAttached) return;
  button.__gghostCloseHandlerAttached = true;
  button.addEventListener('click', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    const locationId = button.dataset.locationId;
    if (!locationId) return;
    const mode = button.dataset.gghostCloseMode || CLOSE_LOCATION_CLOSE_MODE;
    if (mode === CLOSE_LOCATION_REOPEN_MODE) {
      const closureInfo = await fetchLocationClosureState(locationId, { refresh: true });
      showReopenLocationOverlay(locationId, closureInfo);
      return;
    }
    showCloseLocationOverlay(locationId);
  });
}
function replaceBackButtonWithClose(locationId) {
  const backButtons = findLocationBackButtons();
  const existingClose = getExistingCloseLocationButton(locationId);
  if (!backButtons.length) return existingClose || null;
  const target = pickPreferredBackButton(backButtons);
  if (!target) return existingClose || null;
  const closeButton = existingClose || document.createElement('button');
  if (!existingClose) {
    closeButton.type = 'button';
    closeButton.dataset.gghostCloseLocation = '1';
    ensureCloseLocationButtonHandler(closeButton);
  }
  closeButton.className = target.className || '';
  closeButton.style.cssText = target.style.cssText || '';
  closeButton.dataset.locationId = locationId;
  hideBackButton(target);
  if (target !== closeButton) {
    target.insertAdjacentElement('afterend', closeButton);
  }
  return closeButton;
}
async function updateCloseLocationButtonState(locationId, button) {
  if (!locationId || !button) return;
  const requestId = ++closeLocationButtonRequestId;
  setCloseLocationButtonState(button, CLOSE_LOCATION_CLOSE_MODE);
  const closureInfo = await fetchLocationClosureState(locationId);
  if (requestId !== closeLocationButtonRequestId) return;
  const mode = closureInfo.isClosed ? CLOSE_LOCATION_REOPEN_MODE : CLOSE_LOCATION_CLOSE_MODE;
  setCloseLocationButtonState(button, mode);
}
function queueCloseLocationButtonUpdate(locationId) {
  if (!locationId) return;
  const currentHomeId = getTeamLocationHomeUuid();
  if (!currentHomeId) {
    removeCloseLocationButtons();
    restoreHiddenBackButtons();
    return;
  }
  if (currentHomeId !== locationId) {
    initializeCloseLocationButton();
    return;
  }
  closeLocationButtonActiveId = locationId;
  if (closeLocationButtonUpdatePending) return;
  closeLocationButtonUpdatePending = true;
  const runUpdate = () => {
    closeLocationButtonUpdatePending = false;
    if (closeLocationButtonActiveId !== locationId) return;
    const updatedButton = replaceBackButtonWithClose(locationId);
    if (updatedButton) {
      void updateCloseLocationButtonState(locationId, updatedButton);
    }
  };
  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(runUpdate);
  } else {
    setTimeout(runUpdate, 16);
  }
}
function initializeCloseLocationButton() {
  if (closeLocationButtonObserver) {
    closeLocationButtonObserver.disconnect();
    closeLocationButtonObserver = null;
  }
  closeLocationButtonUpdatePending = false;
  const locationId = getTeamLocationHomeUuid();
  closeLocationButtonActiveId = locationId;
  if (!locationId) {
    removeCloseLocationButtons();
    restoreHiddenBackButtons();
    return;
  }
  const closeButton = replaceBackButtonWithClose(locationId);
  if (closeButton) {
    void updateCloseLocationButtonState(locationId, closeButton);
  }
  const observerRoot = document.body || document.documentElement;
  if (!observerRoot) return;
  closeLocationButtonObserver = new MutationObserver(() => {
    queueCloseLocationButtonUpdate(locationId);
  });
  closeLocationButtonObserver.observe(observerRoot, {
    childList: true,
    subtree: true,
    attributes: true,
    characterData: true
  });
  queueCloseLocationButtonUpdate(locationId);
  CLOSE_LOCATION_RETRY_DELAYS_MS.forEach((delay) => {
    setTimeout(() => queueCloseLocationButtonUpdate(locationId), delay);
  });
}
initializeCloseLocationButton();
window.addEventListener('locationchange', () => {
  initializeCloseLocationButton();
});
if (!window.__gghostCloseLocationUrlHooked && typeof onUrlChange === 'function') {
  window.__gghostCloseLocationUrlHooked = true;
  onUrlChange(() => {
    initializeCloseLocationButton();
  });
}
// Parse dateKey or value for a timestamp. Return { date: Date, dateOnly: boolean } or null
function parseWhen(dateKey, noteVal) {
  if (!dateKey) return null;
  // Prefer timestamps inside the value if present
  if (noteVal && typeof noteVal === "object") {
    const ts = noteVal.ts ?? noteVal.timestamp ?? noteVal.updatedAt;
    if (ts != null) {
      if (typeof ts === "number") {
        // Handle both seconds and milliseconds
        const ms = ts < 1e12 ? ts * 1000 : ts;
        const d = new Date(ms);
        if (!isNaN(d)) return { date: d, dateOnly: false };
      } else {
        const d = new Date(String(ts));
        if (!isNaN(d)) return { date: d, dateOnly: false };
      }
    }
  }
  // ISO with time
  if (/^\d{4}-\d{2}-\d{2}T/.test(dateKey)) {
    const d = new Date(dateKey);
    if (!isNaN(d)) return { date: d, dateOnly: false };
  }
  // Epoch seconds / ms in the KEY
  if (/^\d{10}$/.test(dateKey)) return { date: new Date(Number(dateKey) * 1000), dateOnly: false };
  if (/^\d{13}$/.test(dateKey)) return { date: new Date(Number(dateKey)), dateOnly: false };
  // YYYY-MM-DD (day only) — interpret at local midnight
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
    const [y, m, d] = dateKey.split("-").map(Number);
    const localMidnight = new Date(y, m - 1, d);
    if (!isNaN(localMidnight)) return { date: localMidnight, dateOnly: true };
  }
  // Fallback: try native parse
  const d = new Date(dateKey);
  if (!isNaN(d)) return { date: d, dateOnly: false };
  return null;
}
const EDIT_HISTORY_CACHE_TTL_MS = 5 * 60 * 1000;
const EDIT_HISTORY_CACHE_KEY = 'gghost-edit-history-cache';
let editHistoryCache = null;
let editHistoryCacheAt = 0;
let editHistoryCacheInFlight = null;
function readEditHistoryCache({ allowStale = false } = {}) {
  const now = Date.now();
  if (editHistoryCache) {
    if (allowStale || now - editHistoryCacheAt < EDIT_HISTORY_CACHE_TTL_MS) {
      return editHistoryCache;
    }
  }
  try {
    const raw = sessionStorage.getItem(EDIT_HISTORY_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    if (!parsed.data || typeof parsed.data !== 'object') return null;
    const age = now - (Number(parsed.ts) || 0);
    if (allowStale || age < EDIT_HISTORY_CACHE_TTL_MS) {
      editHistoryCache = parsed.data;
      editHistoryCacheAt = Number(parsed.ts) || now;
      return parsed.data;
    }
  } catch {}
  return null;
}
function writeEditHistoryCache(data) {
  if (!data || typeof data !== 'object') return;
  editHistoryCache = data;
  editHistoryCacheAt = Date.now();
  try {
    sessionStorage.setItem(EDIT_HISTORY_CACHE_KEY, JSON.stringify({
      ts: editHistoryCacheAt,
      data
    }));
  } catch {}
}
async function fetchLocationNotesWithCache(baseURL) {
  if (!baseURL) throw new Error('Base URL not available');
  const cached = readEditHistoryCache();
  if (cached) return { data: cached, fromCache: true };
  if (editHistoryCacheInFlight) return editHistoryCacheInFlight;
  editHistoryCacheInFlight = (async () => {
    const jsonUrl = `${baseURL}locationNotes.json`;
    const res = await fetch(jsonUrl, { cache: 'no-store' });
    if (!res.ok) {
      throw new Error(`Failed to fetch: ${res.status}`);
    }
    const allData = await res.json();
    if (!allData || typeof allData !== 'object') {
      throw new Error('Invalid data format');
    }
    writeEditHistoryCache(allData);
    return { data: allData, fromCache: false };
  })();
  try {
    return await editHistoryCacheInFlight;
  } catch (err) {
    const stale = readEditHistoryCache({ allowStale: true });
    if (stale) return { data: stale, fromCache: true, error: err };
    throw err;
  } finally {
    editHistoryCacheInFlight = null;
  }
}
const EDIT_TIMELINE_CACHE_PREFIX = 'gghost-edit-timeline-cache-';
const EDIT_TIMELINE_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const EDIT_TIMELINE_FAILURE_LIMIT = 3;
const EDIT_TIMELINE_DISABLE_MS = 20 * 60 * 1000;
const EDIT_TIMELINE_TIMEOUT_MS = 8000;
const EDIT_TIMELINE_STATE_KEY = 'gghost-edit-timeline-state';
const editTimelineCacheInflight = new Map();
let editTimelineApiDisabledLogged = false;
function readEditTimelineState() {
  try {
    const raw = sessionStorage.getItem(EDIT_TIMELINE_STATE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}
function writeEditTimelineState(state) {
  try {
    sessionStorage.setItem(EDIT_TIMELINE_STATE_KEY, JSON.stringify(state));
  } catch {}
}
function getEditTimelineState(apiBase) {
  const state = readEditTimelineState() || {};
  if (apiBase && state.api && state.api !== apiBase) {
    return { api: apiBase, failures: 0, disabledUntil: 0 };
  }
  return {
    api: apiBase || state.api || '',
    failures: Number(state.failures) || 0,
    disabledUntil: Number(state.disabledUntil) || 0
  };
}
function isEditTimelineEnabled() {
  if (window.gghost?.EDIT_TIMELINE_FORCE === true) return true;
  return window.gghost?.EDIT_TIMELINE_ENABLED === true;
}
function isEditTimelinePreloadEnabled() {
  const explicit = window.gghost?.EDIT_TIMELINE_PREFETCH;
  if (explicit === true) return true;
  if (explicit === false) return false;
  try {
    const flag = localStorage.getItem('gghostEditTimelinePrefetch');
    return flag === '1' || flag === 'true';
  } catch {}
  return false;
}
function isEditTimelineDisabled(apiBase) {
  if (!apiBase) return true;
  if (window.gghost?.EDIT_TIMELINE_FORCE === true) return false;
  const state = getEditTimelineState(apiBase);
  return state.disabledUntil && Date.now() < state.disabledUntil;
}
function registerEditTimelineFailure(apiBase, err, { hard = false } = {}) {
  if (!apiBase) return;
  const state = getEditTimelineState(apiBase);
  state.failures = (state.failures || 0) + 1;
  if (window.gghost?.EDIT_TIMELINE_FORCE === true) {
    state.disabledUntil = 0;
  } else if (hard || state.failures >= EDIT_TIMELINE_FAILURE_LIMIT) {
    state.disabledUntil = Date.now() + EDIT_TIMELINE_DISABLE_MS;
  }
  writeEditTimelineState(state);
  if (!editTimelineApiDisabledLogged && state.disabledUntil) {
    editTimelineApiDisabledLogged = true;
    console.warn('[Edit Timeline] Timeline API disabled temporarily.', {
      api: apiBase,
      error: err?.message || String(err || 'unknown')
    });
  }
}
function registerEditTimelineSuccess(apiBase) {
  if (!apiBase) return;
  writeEditTimelineState({ api: apiBase, failures: 0, disabledUntil: 0 });
}
function getEditTimelineApiBase() {
  if (!isEditTimelineEnabled()) return '';
  const override = window.gghost?.EDIT_TIMELINE_API;
  if (typeof override === 'string' && override.trim()) return override.trim();
  if (typeof EDIT_TIMELINE_API === 'string' && EDIT_TIMELINE_API.trim()) return EDIT_TIMELINE_API;
  return '';
}
function markEditTimelineApiDisabled(apiBase, status) {
  registerEditTimelineFailure(apiBase, new Error(`HTTP ${status}`), { hard: true });
  if (!editTimelineApiDisabledLogged) {
    editTimelineApiDisabledLogged = true;
    console.warn('[Edit Timeline] Timeline API unavailable; disabling preload.', {
      status,
      api: apiBase
    });
  }
}
function getEditTimelineCacheKey(locationId) {
  return `${EDIT_TIMELINE_CACHE_PREFIX}${locationId}`;
}
function readEditTimelineCache(locationId, { allowStale = false } = {}) {
  if (!locationId) return null;
  try {
    const raw = sessionStorage.getItem(getEditTimelineCacheKey(locationId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    if (!parsed.data || typeof parsed.data !== 'object') return null;
    if (parsed.data.ok === false) return null;
    const age = Date.now() - (Number(parsed.ts) || 0);
    if (allowStale || age < EDIT_TIMELINE_CACHE_TTL_MS) {
      return parsed.data;
    }
  } catch {}
  return null;
}
function writeEditTimelineCache(locationId, data) {
  if (!locationId || !data || typeof data !== 'object') return;
  try {
    sessionStorage.setItem(getEditTimelineCacheKey(locationId), JSON.stringify({
      ts: Date.now(),
      data
    }));
  } catch {}
}
function normalizeTimelinePagePath(value) {
  if (!value) return '';
  const raw = String(value).trim();
  if (!raw) return '';
  const stripTrailing = (text) => {
    if (!text || text.length <= 1) return text || '';
    return text.replace(/\/+$/, '');
  };
  if (raw.startsWith('%2F')) {
    try {
      return stripTrailing(decodeURIComponent(raw));
    } catch {
      return raw.replace(/(%2F)+$/i, '');
    }
  }
  if (raw.startsWith('/team/')) return stripTrailing(raw);
  if (raw.startsWith('http://') || raw.startsWith('https://')) {
    try {
      return stripTrailing(new URL(raw).pathname);
    } catch {}
  }
  return stripTrailing(raw);
}
function getTimelinePageEntry(data, pagePath) {
  if (!data || typeof data !== 'object') return null;
  const pages = data.pages;
  if (!pages || typeof pages !== 'object') return null;
  const encodedKey = encodeURIComponent(pagePath);
  return pages[encodedKey] || pages[pagePath] || null;
}
function fetchTimelineWithTimeout(url) {
  const fetcher = typeof fetchViaBackground === 'function'
    ? fetchViaBackground
    : (input, options) => fetch(input, options);
  const request = fetcher(url, { cache: 'no-store' });
  if (!EDIT_TIMELINE_TIMEOUT_MS) return request;
  return Promise.race([
    request,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Timeline fetch timeout')), EDIT_TIMELINE_TIMEOUT_MS);
    })
  ]);
}
async function fetchEditTimelineForLocation(locationId, { refresh = false } = {}) {
  if (!locationId) return null;
  const apiBase = getEditTimelineApiBase();
  if (!apiBase) return null;
  if (!refresh && isEditTimelineDisabled(apiBase)) return null;
  const cached = readEditTimelineCache(locationId);
  if (cached && !refresh) return { data: cached, fromCache: true };
  if (!refresh && editTimelineCacheInflight.has(locationId)) {
    return editTimelineCacheInflight.get(locationId);
  }
  const url = `${apiBase}?locationId=${encodeURIComponent(locationId)}&scope=location&includeSegments=true`;
  const request = (async () => {
    let res = null;
    try {
      res = await fetchTimelineWithTimeout(url);
    } catch (err) {
      registerEditTimelineFailure(apiBase, err);
      return null;
    }
    if (!res || !res.ok) {
      const status = res?.status || 0;
      if (status === 400 || status === 401 || status === 403 || status === 404 || status === 410) {
        markEditTimelineApiDisabled(apiBase, status);
        return null;
      }
      registerEditTimelineFailure(apiBase, new Error(`HTTP ${status}`));
      return null;
    }
    let data = null;
    try {
      data = await res.json();
    } catch (err) {
      registerEditTimelineFailure(apiBase, err);
      return null;
    }
    if (!data || typeof data !== 'object' || data.ok === false) {
      registerEditTimelineFailure(apiBase, new Error(data?.error || 'Timeline payload invalid'));
      return null;
    }
    writeEditTimelineCache(locationId, data);
    registerEditTimelineSuccess(apiBase);
    return { data, fromCache: false };
  })();
  editTimelineCacheInflight.set(locationId, request);
  try {
    return await request;
  } finally {
    editTimelineCacheInflight.delete(locationId);
  }
}
async function preloadEditTimelineForLocation(locationId, { refresh = false } = {}) {
  try {
    return await fetchEditTimelineForLocation(locationId, { refresh });
  } catch (err) {
    console.warn('[Edit Timeline] Failed to preload', err);
    return null;
  }
}
async function getEditTimelineForPage(pagePath, { refresh = false } = {}) {
  const normalized = normalizeTimelinePagePath(pagePath);
  if (!normalized) return null;
  const locationId = typeof extractLocationIdFromPath === 'function'
    ? extractLocationIdFromPath(normalized)
    : '';
  if (!locationId) return null;
  const cached = readEditTimelineCache(locationId);
  if (cached && !refresh) {
    const entry = getTimelinePageEntry(cached, normalized);
    if (entry) {
      return { page: entry, locationId, data: cached, fromCache: true };
    }
  }
  const result = await fetchEditTimelineForLocation(locationId, { refresh });
  if (!result || !result.data) return null;
  const entry = getTimelinePageEntry(result.data, normalized);
  return entry ? { ...result, page: entry, locationId } : result;
}
function preloadEditTimelineForCurrentLocation() {
  if (!isEditTimelinePreloadEnabled()) return;
  if (!isEditTimelineEnabled()) return;
  if (typeof extractLocationIdFromPath !== 'function') return;
  const apiBase = getEditTimelineApiBase();
  if (!apiBase || isEditTimelineDisabled(apiBase)) return;
  const locationId = extractLocationIdFromPath();
  if (!locationId) return;
  const run = () => {
    void preloadEditTimelineForLocation(locationId);
  };
  if (window.requestIdleCallback) {
    window.requestIdleCallback(run, { timeout: 4000 });
  } else {
    setTimeout(run, 500);
  }
}
window.gghost.preloadEditTimelineForLocation = preloadEditTimelineForLocation;
window.gghost.getEditTimelineForPage = getEditTimelineForPage;
preloadEditTimelineForCurrentLocation();
window.addEventListener('locationchange', preloadEditTimelineForCurrentLocation);
const SIMILARITY_INDEX_LIST_PATH = 'locationNotesCache/similarityIndex/v1/indexes';
const SIMILARITY_INDEX_API_DEFAULT = 'https://us-central1-streetli.cloudfunctions.net/locationNotesSimilarityIndex';
const SIMILARITY_INDEX_CACHE_TTL_MS = 15 * 60 * 1000;
const similarityIndexCache = {
  data: null,
  fetchedAt: 0,
  promise: null
};
const PLAYBACK_INDEX_PAGES_PATH = 'locationNotesCache/playback/v1/pages';
const PLAYBACK_INDEX_API_DEFAULT = 'https://us-central1-streetli.cloudfunctions.net/locationNotesPlayback';
const PLAYBACK_INDEX_CACHE_TTL_MS = 10 * 60 * 1000;
const playbackIndexCache = new Map();
function isPlaybackDebugEnabled() {
  if (window.gghost?.DEBUG_PLAYBACK === true) return true;
  if (window.gghost?.DEBUG_PLAYBACK === false) return false;
  try {
    const flag = localStorage.getItem('gghostDebugPlayback');
    return flag === '1' || flag === 'true';
  } catch {}
  const path = location?.pathname || '';
  return /^\/team\/location\/[0-9a-f-]+\/services\/[0-9a-f-]+\/(description|other-info)(?:\/|$)/i.test(path);
}
function scrubAuthParam(url) {
  if (!url) return '';
  try {
    const parsed = new URL(url);
    if (parsed.searchParams.has('auth')) {
      parsed.searchParams.set('auth', 'REDACTED');
    }
    return parsed.toString();
  } catch {
    return String(url).replace(/([?&])auth=[^&]+/i, '$1auth=REDACTED');
  }
}
function logPlaybackDebug(...args) {
  if (!isPlaybackDebugEnabled()) return;
  console.log(...args);
}
function getSimilarityIndexBaseUrl() {
  const base = window.gghost?.baseURL || 'https://streetli-default-rtdb.firebaseio.com/';
  return base.endsWith('/') ? base : `${base}/`;
}
function getSimilarityIndexApiBase() {
  const override = window.gghost?.SIMILARITY_INDEX_API;
  if (typeof override === 'string' && override.trim()) return override.trim();
  return SIMILARITY_INDEX_API_DEFAULT;
}
function getPlaybackIndexBaseUrl() {
  return getSimilarityIndexBaseUrl();
}
function getPlaybackIndexApiBase() {
  const override = window.gghost?.PLAYBACK_INDEX_API;
  if (typeof override === 'string' && override.trim()) return override.trim();
  return PLAYBACK_INDEX_API_DEFAULT;
}
function buildSimilarityIndexQueryUrl() {
  const base = getSimilarityIndexBaseUrl();
  const url = new URL(`${base}${SIMILARITY_INDEX_LIST_PATH}.json`);
  url.searchParams.set('orderBy', '"generatedAt"');
  url.searchParams.set('limitToLast', '1');
  return url.toString();
}
function buildSimilarityIndexListUrl() {
  const base = getSimilarityIndexBaseUrl();
  return `${base}${SIMILARITY_INDEX_LIST_PATH}.json`;
}
function parseSimilarityGeneratedAt(value) {
  if (value == null) return 0;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const asNumber = Number.parseInt(String(value), 10);
  if (Number.isFinite(asNumber)) return asNumber;
  const parsed = Date.parse(String(value));
  return Number.isNaN(parsed) ? 0 : parsed;
}
function pickLatestSimilarityIndexEntry(payload) {
  if (!payload || typeof payload !== 'object') return null;
  if (payload.fields && payload.schemaVersion) return payload;
  const entries = Object.values(payload).filter((entry) => entry && typeof entry === 'object');
  if (!entries.length) return null;
  let bestEntry = entries[0];
  let bestStamp = parseSimilarityGeneratedAt(bestEntry.generatedAt);
  for (let i = 1; i < entries.length; i += 1) {
    const candidate = entries[i];
    const stamp = parseSimilarityGeneratedAt(candidate.generatedAt);
    if (stamp >= bestStamp) {
      bestEntry = candidate;
      bestStamp = stamp;
    }
  }
  return bestEntry;
}
function buildPlaybackIndexPageUrl(encodedKey, pagePath) {
  const apiBase = getPlaybackIndexApiBase();
  if (apiBase) {
    try {
      const url = new URL(apiBase);
      if (pagePath) {
        url.searchParams.set('pagePath', pagePath);
      } else if (encodedKey) {
        url.searchParams.set('encodedKey', encodedKey);
      }
      return url.toString();
    } catch {
      // fallback to RTDB below
    }
  }
  const base = getPlaybackIndexBaseUrl();
  const safeKey = encodeURIComponent(encodedKey);
  return `${base}${PLAYBACK_INDEX_PAGES_PATH}/${safeKey}.json`;
}
function resolvePlaybackFieldKey(mode) {
  if (mode === 'description') return 'services.description';
  if (mode === 'other-info') return 'services.additional_info';
  return '';
}
function encodePlaybackFieldKey(fieldKey) {
  if (!fieldKey) return '';
  return encodeURIComponent(String(fieldKey)).replace(/\./g, '%2E');
}
function pickPlaybackFieldData(pageData, fieldKey) {
  if (!pageData || typeof pageData !== 'object') return null;
  const fallbackFieldKey = fieldKey === 'services.additional_info'
    ? 'event_related_info.information'
    : '';
  const fieldKeys = [fieldKey, fallbackFieldKey].filter(Boolean);
  if (pageData.fields && typeof pageData.fields === 'object') {
    if (Array.isArray(pageData.fields)) {
      if (fieldKeys.length) {
        for (const key of fieldKeys) {
          const match = pageData.fields.find((item) => item?.fieldKey === key);
          if (match) return match;
        }
      }
      const first = pageData.fields.find((item) => item && typeof item === 'object');
      return first || null;
    }
    if (fieldKeys.length) {
      for (const key of fieldKeys) {
        if (pageData.fields[key]) return pageData.fields[key];
        const encodedKey = encodePlaybackFieldKey(key);
        if (encodedKey && pageData.fields[encodedKey]) return pageData.fields[encodedKey];
      }
      const match = Object.values(pageData.fields).find((item) => item?.fieldKey && fieldKeys.includes(item.fieldKey));
      if (match) return match;
    }
    const first = Object.values(pageData.fields).find((item) => item && typeof item === 'object');
    return first || null;
  }
  if (pageData.events && Array.isArray(pageData.events)) {
    if (!fieldKey || pageData.fieldKey === fieldKey) return pageData;
  }
  return null;
}
async function fetchPlaybackIndexForPage(pagePath, { force = false } = {}) {
  const normalized = typeof normalizeTimelinePagePath === 'function'
    ? normalizeTimelinePagePath(pagePath)
    : pagePath;
  if (!normalized) return null;
  const encodedKey = encodeURIComponent(normalized);
  const debugEnabled = isPlaybackDebugEnabled();
  if (debugEnabled) {
    logPlaybackDebug('[Edit Playback] Fetch playback page', {
      pagePath: normalized,
      encodedKey
    });
  }
  const cached = playbackIndexCache.get(encodedKey);
  const now = Date.now();
  if (!force && cached?.data && now - cached.fetchedAt < PLAYBACK_INDEX_CACHE_TTL_MS) {
    return cached.data;
  }
  if (!force && cached?.promise) return cached.promise;
  const fetcher = typeof fetchViaBackground === 'function' ? fetchViaBackground : fetch;
  const auth = typeof window.gghost?.withFirebaseAuth === 'function'
    ? window.gghost.withFirebaseAuth
    : null;
  const run = (async () => {
    const url = buildPlaybackIndexPageUrl(encodedKey, normalized);
    const authUrl = auth && url.includes('firebaseio.com') ? auth(url) : url;
    const safeUrl = debugEnabled ? scrubAuthParam(authUrl) : '';
    let res;
    try {
      res = await fetcher(authUrl, { cache: 'no-store' });
    } catch (err) {
      if (debugEnabled) {
        logPlaybackDebug('[Edit Playback] Playback fetch failed', {
          url: safeUrl,
          error: err?.message || String(err)
        });
      }
      return null;
    }
    if (!res.ok) {
      if (debugEnabled) {
        logPlaybackDebug('[Edit Playback] Playback fetch not ok', {
          url: safeUrl,
          status: res.status
        });
      }
      return null;
    }
    const payload = await res.json().catch(() => null);
    if (!payload || typeof payload !== 'object') {
      if (debugEnabled) {
        logPlaybackDebug('[Edit Playback] Playback payload empty', { url: safeUrl });
      }
      return null;
    }
    if (debugEnabled) {
      const fields = payload.fields;
      const fieldCount = Array.isArray(fields)
        ? fields.length
        : fields && typeof fields === 'object'
          ? Object.keys(fields).length
          : 0;
      logPlaybackDebug('[Edit Playback] Playback payload loaded', {
        url: safeUrl,
        fieldCount
      });
    }
    return payload;
  })();
  playbackIndexCache.set(encodedKey, {
    data: cached?.data || null,
    fetchedAt: cached?.fetchedAt || 0,
    promise: run
  });
  try {
    const data = await run;
    playbackIndexCache.set(encodedKey, {
      data,
      fetchedAt: Date.now(),
      promise: null
    });
    return data;
  } finally {
    const latest = playbackIndexCache.get(encodedKey);
    if (latest && latest.promise) {
      playbackIndexCache.set(encodedKey, {
        data: latest.data || null,
        fetchedAt: latest.fetchedAt || 0,
        promise: null
      });
    }
  }
}
async function fetchSimilarityIndexLatest({ force = false } = {}) {
  const now = Date.now();
  if (!force && similarityIndexCache.data && now - similarityIndexCache.fetchedAt < SIMILARITY_INDEX_CACHE_TTL_MS) {
    return similarityIndexCache.data;
  }
  if (!force && similarityIndexCache.promise) return similarityIndexCache.promise;
  const run = (async () => {
    const fetcher = typeof fetchViaBackground === 'function' ? fetchViaBackground : fetch;
    const auth = typeof window.gghost?.withFirebaseAuth === 'function'
      ? window.gghost.withFirebaseAuth
      : null;
    const apiBase = getSimilarityIndexApiBase();
    if (apiBase) {
      try {
        const res = await fetcher(apiBase, { cache: 'no-store' });
        if (res.ok) {
          const apiPayload = await res.json().catch(() => null);
          if (apiPayload && typeof apiPayload === 'object') {
            similarityIndexCache.data = apiPayload;
            similarityIndexCache.fetchedAt = now;
            return apiPayload;
          }
        }
      } catch {}
    }
    const fetchPayload = async (url) => {
      const authUrl = auth ? auth(url) : url;
      const res = await fetcher(authUrl, { cache: 'no-store' });
      if (!res.ok) {
        return { payload: null, status: res.status };
      }
      const payload = await res.json().catch(() => null);
      if (!payload || typeof payload !== 'object') {
        return { payload: null, status: res.status };
      }
      return { payload, status: res.status };
    };
    const primary = await fetchPayload(buildSimilarityIndexQueryUrl());
    let payload = primary.payload;
    let status = primary.status;
    if (!payload || (typeof payload === 'object' && !Array.isArray(payload) && !Object.keys(payload).length)) {
      const fallback = await fetchPayload(buildSimilarityIndexListUrl());
      if (fallback.payload) {
        payload = fallback.payload;
        status = fallback.status || status;
      }
    }
    if (!payload || typeof payload !== 'object') {
      throw new Error(`Similarity index fetch failed (${status || 'unknown'})`);
    }
    const entry = pickLatestSimilarityIndexEntry(payload);
    if (!entry || typeof entry !== 'object') {
      throw new Error('Similarity index entry missing');
    }
    let data = null;
    if (entry.raw && typeof entry.raw === 'string') {
      try {
        data = JSON.parse(entry.raw);
      } catch (err) {
        throw new Error('Similarity index raw parse failed');
      }
    } else if (entry.data && typeof entry.data === 'object') {
      data = entry.data;
    } else {
      data = entry;
    }
    if (!data || typeof data !== 'object') {
      throw new Error('Similarity index data missing');
    }
    similarityIndexCache.data = data;
    similarityIndexCache.fetchedAt = now;
    return data;
  })();
  similarityIndexCache.promise = run;
  try {
    return await run;
  } finally {
    similarityIndexCache.promise = null;
  }
}
function getSimilarityMatch(index, event) {
  if (!index || !event) return null;
  const fieldKey = event.fieldKey || event.field || '';
  if (!fieldKey) return null;
  const matches = index?.fields?.[fieldKey]?.matches;
  if (!matches || typeof matches !== 'object') return null;
  const eventKey = event.eventId || '';
  if (eventKey && matches[eventKey]) return matches[eventKey];
  return null;
}
window.gghost.fetchSimilarityIndexLatest = fetchSimilarityIndexLatest;
window.gghost.getSimilarityMatch = getSimilarityMatch;
window.gghost.fetchPlaybackIndexForPage = fetchPlaybackIndexForPage;
window.gghost.isPlaybackDebugEnabled = isPlaybackDebugEnabled;
window.gghost.fetchLocationNotesRecordForPage = fetchLocationNotesRecordForPage;
window.gghost.fetchLocationNotesRecordForService = fetchLocationNotesRecordForService;
const SERVICE_EDIT_PLAYBACK_OVERLAY_ID = 'gghost-service-edit-playback';
const SERVICE_EDIT_PLAYBACK_STYLE_ID = 'gghost-edit-playback-style';
const SERVICE_EDIT_PLAYBACK_HIGHLIGHT_ATTR = 'data-gghost-edit-highlight';
const SERVICE_EDIT_PLAYBACK_ACTIVE_ATTR = 'data-gghost-edit-playback-active';
const SERVICE_EDIT_PLAYBACK_USER_COLORS = {
  kieshaj10: '#c62828',
  glongino: '#ef6c00',
  doobneek: '#2e7d32',
  adamabard: '#1565c0'
};
const EDIT_USER_ALIASES = {
  kiesha: 'kieshaj10',
  kieshaj10: 'kieshaj10',
  gavilan: 'gavilan',
  glongino: 'glongino'
};
function normalizeEditUserName(value) {
  if (!value) return '';
  const text = String(value).trim();
  if (!text) return '';
  const alias = EDIT_USER_ALIASES[text.toLowerCase()];
  return alias || text;
}
const SERVICE_EDIT_PLAYBACK_PALETTE = [
  '#6a1b9a',
  '#00838f',
  '#6d4c41',
  '#2f4f4f',
  '#7b1fa2',
  '#c2185b',
  '#455a64'
];
const PLAYBACK_MAX_SEGMENT_CHARS = 8000;
function ensureServiceEditPlaybackStyles() {
  if (document.getElementById(SERVICE_EDIT_PLAYBACK_STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = SERVICE_EDIT_PLAYBACK_STYLE_ID;
  style.textContent = `
    #${SERVICE_EDIT_PLAYBACK_OVERLAY_ID} {
      position: absolute;
      z-index: 2147483647;
      background: transparent;
    }
    #${SERVICE_EDIT_PLAYBACK_OVERLAY_ID} .gg-edit-playback-panel {
      position: relative;
      display: flex;
      flex-direction: column;
      gap: 10px;
      background: #fffdf5;
      border: 1px solid #e1d7b6;
      border-radius: 12px;
      padding: 12px;
      box-shadow: 0 10px 28px rgba(0,0,0,0.28);
    }
    #${SERVICE_EDIT_PLAYBACK_OVERLAY_ID} .gg-edit-playback-body {
      display: flex;
      gap: 12px;
      align-items: stretch;
    }
    #${SERVICE_EDIT_PLAYBACK_OVERLAY_ID} .gg-edit-playback-panel.gg-edit-playback-stacked .gg-edit-playback-body {
      flex-direction: column;
    }
    #${SERVICE_EDIT_PLAYBACK_OVERLAY_ID} .gg-edit-playback-text {
      flex: 1 1 auto;
      border: 1px solid #e0e0e0;
      border-radius: 8px;
      padding: 10px;
      background: #fff;
      font-size: 13px;
      line-height: 1.5;
      white-space: pre-wrap;
      overflow-y: auto;
      user-select: text;
    }
    #${SERVICE_EDIT_PLAYBACK_OVERLAY_ID} .gg-edit-playback-timeline {
      width: 260px;
      flex-shrink: 0;
      display: flex;
      flex-direction: column;
      gap: 8px;
      overflow: hidden;
    }
    #${SERVICE_EDIT_PLAYBACK_OVERLAY_ID} .gg-edit-playback-panel.gg-edit-playback-stacked .gg-edit-playback-timeline {
      width: 100%;
    }
    #${SERVICE_EDIT_PLAYBACK_OVERLAY_ID} .gg-edit-playback-timeline-list {
      overflow-y: auto;
      border: 1px solid #e7e1cf;
      border-radius: 8px;
      background: #fff;
      padding: 6px;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    #${SERVICE_EDIT_PLAYBACK_OVERLAY_ID} .gg-edit-playback-timeline-btn {
      border: 1px solid #e0e0e0;
      border-radius: 6px;
      background: #fafafa;
      text-align: left;
      padding: 6px 8px;
      font-size: 11px;
      cursor: pointer;
      line-height: 1.3;
    }
    #${SERVICE_EDIT_PLAYBACK_OVERLAY_ID} .gg-edit-playback-timeline-btn.active {
      border-color: #b0a06a;
      background: #fff6d8;
      box-shadow: inset 0 0 0 1px rgba(176, 160, 106, 0.45);
    }
    #${SERVICE_EDIT_PLAYBACK_OVERLAY_ID} .gg-edit-playback-highlight {
      border-radius: 3px;
      padding: 0 1px;
      cursor: pointer;
    }
    #${SERVICE_EDIT_PLAYBACK_OVERLAY_ID} .gg-edit-playback-meta {
      font-size: 11px;
      color: #6b6b6b;
      line-height: 1.3;
    }
    #${SERVICE_EDIT_PLAYBACK_OVERLAY_ID} .gg-edit-playback-controls button {
      border: 1px solid #d4c79a;
      background: #fff;
      border-radius: 6px;
      padding: 4px 8px;
      cursor: pointer;
      font-size: 12px;
    }
  `;
  document.head.appendChild(style);
}
function removeServiceEditPlaybackOverlay() {
  const overlay = document.getElementById(SERVICE_EDIT_PLAYBACK_OVERLAY_ID);
  if (overlay) overlay.remove();
  document.querySelectorAll(`[${SERVICE_EDIT_PLAYBACK_ACTIVE_ATTR}="true"]`).forEach((el) => {
    el.style.visibility = '';
    el.style.pointerEvents = '';
    el.removeAttribute(SERVICE_EDIT_PLAYBACK_ACTIVE_ATTR);
  });
}
function getServiceEditPlaybackTarget(pathname = location.pathname) {
  const match = String(pathname || '').match(/^\/team\/location\/([0-9a-f-]{12,36})\/services\/([0-9a-f-]{12,36})(?:\/|$)/i);
  if (!match) return null;
  const path = String(pathname || '');
  if (/\/description(?:\/|$)/i.test(path)) {
    return { locationId: match[1], serviceId: match[2], mode: 'description', path };
  }
  if (/\/other-info(?:\/|$)/i.test(path)) {
    return { locationId: match[1], serviceId: match[2], mode: 'other-info', path };
  }
  return null;
}
function hashString(value) {
  const str = String(value || '');
  let hash = 0;
  for (let i = 0; i < str.length; i += 1) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}
function hexToRgba(hex, alpha = 0.18) {
  const clean = String(hex || '').replace('#', '');
  if (clean.length !== 6) return `rgba(255, 235, 148, ${alpha})`;
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
function resolveUserColor(user, cache) {
  const normalized = normalizeEditUserName(user);
  const key = String(normalized || user || 'unknown').toLowerCase();
  if (SERVICE_EDIT_PLAYBACK_USER_COLORS[key]) return SERVICE_EDIT_PLAYBACK_USER_COLORS[key];
  const cacheKey = normalized || user || 'unknown';
  if (cache.has(cacheKey)) return cache.get(cacheKey);
  const idx = hashString(key) % SERVICE_EDIT_PLAYBACK_PALETTE.length;
  const color = SERVICE_EDIT_PLAYBACK_PALETTE[idx];
  cache.set(cacheKey, color);
  return color;
}
function findServiceEditTextarea(mode) {
  const textareas = Array.from(document.querySelectorAll('textarea.TextArea, textarea'));
  const visible = textareas.filter((el) => el.offsetParent !== null && !el.hasAttribute(SERVICE_EDIT_PLAYBACK_ACTIVE_ATTR));
  if (!visible.length) return null;
  if (mode === 'description') {
    const match = visible.find((el) => /open only to ages 65/i.test(el.placeholder || ''));
    if (match) return match;
  }
  const scored = visible.map((el) => {
    const rect = el.getBoundingClientRect();
    return { el, area: rect.width * rect.height };
  }).sort((a, b) => b.area - a.area);
  return scored[0]?.el || visible[0];
}
function parseEditText(value) {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}
function applyPlaybackTextDelta(prevText, delta) {
  if (!delta || delta.kind !== 'text-diff-v1' || !Array.isArray(delta.ops)) return null;
  let text = typeof prevText === 'string' ? prevText : '';
  try {
    const ops = [...delta.ops].sort((a, b) => (b?.[1] || 0) - (a?.[1] || 0));
    ops.forEach((op) => {
      if (!op) return;
      const action = op[0];
      if (action === 'delete' && op.length === 3) {
        const [, i1, i2] = op;
        text = text.slice(0, i1) + text.slice(i2);
      } else if (action === 'insert' && op.length === 3) {
        const [, pos, fragment] = op;
        text = text.slice(0, pos) + fragment + text.slice(pos);
      } else if (action === 'replace' && op.length === 4) {
        const [, i1, i2, fragment] = op;
        text = text.slice(0, i1) + fragment + text.slice(i2);
      }
    });
  } catch {
    return null;
  }
  return text;
}
function buildPlaybackSegments(prevText, nextText) {
  if (typeof prevText !== 'string' || typeof nextText !== 'string') return null;
  if (prevText.length > PLAYBACK_MAX_SEGMENT_CHARS || nextText.length > PLAYBACK_MAX_SEGMENT_CHARS) {
    return null;
  }
  const maxPrefix = Math.min(prevText.length, nextText.length);
  let prefix = 0;
  while (prefix < maxPrefix && prevText[prefix] === nextText[prefix]) {
    prefix += 1;
  }
  const maxSuffix = Math.min(prevText.length, nextText.length) - prefix;
  let suffix = 0;
  while (
    suffix < maxSuffix
    && prevText[prevText.length - 1 - suffix] === nextText[nextText.length - 1 - suffix]
  ) {
    suffix += 1;
  }
  const segments = [];
  if (prefix > 0) {
    segments.push({
      op: 'equal',
      text: nextText.slice(0, prefix),
      a_start: 0,
      a_end: prefix,
      b_start: 0,
      b_end: prefix
    });
  }
  const deleteText = prevText.slice(prefix, prevText.length - suffix);
  if (deleteText) {
    segments.push({
      op: 'delete',
      text: deleteText,
      a_start: prefix,
      a_end: prevText.length - suffix,
      b_start: null,
      b_end: null
    });
  }
  const insertText = nextText.slice(prefix, nextText.length - suffix);
  if (insertText) {
    segments.push({
      op: 'insert',
      text: insertText,
      a_start: null,
      a_end: null,
      b_start: prefix,
      b_end: nextText.length - suffix
    });
  }
  if (suffix > 0) {
    segments.push({
      op: 'equal',
      text: nextText.slice(nextText.length - suffix),
      a_start: prevText.length - suffix,
      a_end: prevText.length,
      b_start: nextText.length - suffix,
      b_end: nextText.length
    });
  }
  return segments;
}
function inflatePlaybackEvents(fieldData, fieldKey) {
  if (!fieldData || typeof fieldData !== 'object') return [];
  const events = [];
  const initial = fieldData.initial && typeof fieldData.initial === 'object' ? fieldData.initial : null;
  let currentText = '';
  if (initial && typeof initial.text === 'string') {
    currentText = initial.text;
  } else if (typeof fieldData.initialText === 'string') {
    currentText = fieldData.initialText;
  }
  const initialEvent = initial?.event || fieldData.initialEvent || null;
  if (initialEvent) {
    const seeded = {
      ...initialEvent,
      fieldKey: initialEvent.fieldKey || fieldKey,
      before: '',
      after: currentText
    };
    if (!Array.isArray(seeded.segments)) {
      const segments = buildPlaybackSegments('', currentText);
      if (segments) seeded.segments = segments;
    }
    events.push(seeded);
  }
  const list = Array.isArray(fieldData.events) ? fieldData.events : [];
  list.forEach((event) => {
    const beforeText = typeof currentText === 'string' ? currentText : '';
    let afterText = typeof event?.after === 'string' ? event.after : null;
    if (afterText == null && event?.delta) {
      const nextText = applyPlaybackTextDelta(beforeText, event.delta);
      if (typeof nextText === 'string') afterText = nextText;
    }
    if (afterText == null) afterText = beforeText;
    const inflated = {
      ...event,
      fieldKey: event.fieldKey || fieldKey,
      before: beforeText,
      after: afterText
    };
    if (!Array.isArray(inflated.segments)) {
      const segments = buildPlaybackSegments(beforeText, afterText);
      if (segments) inflated.segments = segments;
    }
    events.push(inflated);
    currentText = afterText;
  });
  return events;
}
function buildPlaybackFrames(events) {
  const frames = [];
  let lastText = '';
  events.forEach((event) => {
    const afterText = typeof event?.after === 'string' ? event.after : null;
    const beforeText = typeof event?.before === 'string' ? event.before : null;
    const text = afterText ?? beforeText ?? lastText ?? '';
    const textChanged = afterText != null && afterText !== lastText;
    if (text != null) lastText = text;
    frames.push({
      event,
      text: parseEditText(text),
      textChanged,
      segments: Array.isArray(event?.segments) ? event.segments : null
    });
  });
  return frames;
}
function formatEditTimestamp(ts) {
  if (!ts) return 'unknown time';
  const date = new Date(ts);
  if (Number.isNaN(date.getTime())) return 'unknown time';
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: '2-digit',
    hour: 'numeric',
    minute: '2-digit'
  });
}
function formatTimelineLabel(event) {
  if (!event) return 'Unknown update';
  const user = normalizeEditUserName(event.user || event.userName || 'unknown') || 'unknown';
  const time = formatEditTimestamp(event.timestampMs || event.timestamp || event.ts);
  const kind = String(event.kind || '').toLowerCase();
  if (kind === 'confirm' || kind === 'reconfirmed' || kind === 'reconfirmed_on' || kind === 'seconded') {
    return `${user} reconfirmed this information on ${time}`;
  }
  const label = event.label || event.field || 'update';
  return `${user} updated ${label} on ${time}`;
}
function renderPlaybackText(container, frame, color) {
  container.innerHTML = '';
  if (!frame || !frame.text) return;
  if (!frame.segments || !frame.textChanged) {
    container.textContent = frame.text;
    return;
  }
  frame.segments.forEach((seg) => {
    if (!seg || typeof seg.text !== 'string') return;
    if (seg.op === 'delete') {
      return;
    }
    const span = document.createElement('span');
    span.textContent = seg.text;
    if (seg.op === 'insert') {
      span.className = 'gg-edit-playback-highlight';
      span.setAttribute(SERVICE_EDIT_PLAYBACK_HIGHLIGHT_ATTR, 'true');
      span.style.background = hexToRgba(color, 0.25);
      span.style.borderBottom = `2px solid ${color}`;
    }
    container.appendChild(span);
  });
}
async function openServiceEditPlaybackOverlay({ refresh = false } = {}) {
  removeServiceEditPlaybackOverlay();
  const target = getServiceEditPlaybackTarget();
  if (!target) {
    alert('Edit playback is only available on service description or other-info pages.');
    return;
  }
  const textarea = findServiceEditTextarea(target.mode);
  if (!textarea) {
    alert('Unable to locate the service editor textarea.');
    return;
  }
  ensureServiceEditPlaybackStyles();
  const playbackFieldKey = resolvePlaybackFieldKey(target.mode);
  if (isPlaybackDebugEnabled()) {
    logPlaybackDebug('[Edit Playback] Opening overlay', {
      pagePath: target.path,
      fieldKey: playbackFieldKey
    });
  }
  let timelineResult = null;
  let playbackEvents = [];
  try {
    const playbackPage = await fetchPlaybackIndexForPage(target.path, { force: refresh });
    const fieldData = pickPlaybackFieldData(playbackPage, playbackFieldKey);
    if (fieldData) {
      playbackEvents = inflatePlaybackEvents(fieldData, playbackFieldKey);
    }
    if (isPlaybackDebugEnabled()) {
      const missingDeltaOps = playbackEvents.filter((event) => {
        if (!event || !event.delta) return false;
        if (Array.isArray(event.delta?.ops)) return false;
        return typeof event.after !== 'string';
      }).length;
      logPlaybackDebug('[Edit Playback] Playback events loaded', {
        count: playbackEvents.length,
        missingDeltaOps
      });
    }
  } catch (err) {
    console.warn('[Edit Playback] Playback index fetch failed', err);
  }
  let events = playbackEvents;
  let frames = events.length ? buildPlaybackFrames(events) : [];
  let editFrameCount = frames.filter((frame) => frame.textChanged).length;
  let frameCount = frames.length;
  if (frameCount < 2) {
    try {
      timelineResult = await window.gghost?.getEditTimelineForPage?.(target.path, { refresh });
    } catch (err) {
      if (!playbackEvents.length) {
        alert('Failed to load edit history for this field.');
        console.warn('[Edit Playback] Timeline fetch failed', err);
        return;
      }
    }
    if (timelineResult?.page?.events) {
      events = timelineResult.page.events;
      frames = buildPlaybackFrames(events);
      editFrameCount = frames.filter((frame) => frame.textChanged).length;
      frameCount = frames.length;
    }
  }
  if (frameCount < 2) {
    if (isPlaybackDebugEnabled()) {
      logPlaybackDebug('[Edit Playback] Not enough history to animate', {
        playbackEvents: playbackEvents.length,
        timelineEvents: timelineResult?.page?.events?.length || 0
      });
    }
    alert('Not enough edit history to animate yet.');
    return;
  }
  const hasTextChanges = editFrameCount >= 2;
  if (!hasTextChanges && isPlaybackDebugEnabled()) {
    logPlaybackDebug('[Edit Playback] Playback has no text diffs; showing timeline only', {
      frames: frameCount,
      playbackEvents: playbackEvents.length
    });
  }
  let similarityIndex = null;
  try {
    similarityIndex = await fetchSimilarityIndexLatest();
  } catch (err) {
    console.warn('[Edit Playback] Similarity index unavailable', err);
  }
  textarea.style.visibility = 'hidden';
  textarea.style.pointerEvents = 'none';
  textarea.setAttribute(SERVICE_EDIT_PLAYBACK_ACTIVE_ATTR, 'true');
  const overlay = document.createElement('div');
  overlay.id = SERVICE_EDIT_PLAYBACK_OVERLAY_ID;
  const panel = document.createElement('div');
  panel.className = 'gg-edit-playback-panel';
  const header = document.createElement('div');
  header.style.display = 'flex';
  header.style.alignItems = 'center';
  header.style.justifyContent = 'space-between';
  const title = document.createElement('div');
  title.textContent = target.mode === 'description' ? 'Description evolution' : 'Other info evolution';
  title.style.fontWeight = '600';
  title.style.fontSize = '13px';
  const controls = document.createElement('div');
  controls.className = 'gg-edit-playback-controls';
  controls.style.display = 'flex';
  controls.style.gap = '6px';
  const playBtn = document.createElement('button');
  playBtn.textContent = 'Pause';
  const prevBtn = document.createElement('button');
  prevBtn.textContent = 'Prev';
  const nextBtn = document.createElement('button');
  nextBtn.textContent = 'Next';
  const closeBtn = document.createElement('button');
  closeBtn.textContent = 'Exit';
  controls.appendChild(playBtn);
  controls.appendChild(prevBtn);
  controls.appendChild(nextBtn);
  controls.appendChild(closeBtn);
  header.appendChild(title);
  header.appendChild(controls);
  const body = document.createElement('div');
  body.className = 'gg-edit-playback-body';
  const textPanel = document.createElement('div');
  textPanel.className = 'gg-edit-playback-text';
  const timelinePanel = document.createElement('div');
  timelinePanel.className = 'gg-edit-playback-timeline';
  const timelineTitle = document.createElement('div');
  timelineTitle.textContent = 'Timeline';
  timelineTitle.style.fontSize = '12px';
  timelineTitle.style.fontWeight = '600';
  const timelineList = document.createElement('div');
  timelineList.className = 'gg-edit-playback-timeline-list';
  const meta = document.createElement('div');
  meta.className = 'gg-edit-playback-meta';
  timelinePanel.appendChild(timelineTitle);
  timelinePanel.appendChild(timelineList);
  timelinePanel.appendChild(meta);
  body.appendChild(textPanel);
  body.appendChild(timelinePanel);
  panel.appendChild(header);
  panel.appendChild(body);
  overlay.appendChild(panel);
  document.body.appendChild(overlay);
  const userColors = new Map();
  let currentIndex = 0;
  let isPlaying = true;
  let playTimer = null;
  const buttons = [];
  const updatePosition = () => {
    const rect = textarea.getBoundingClientRect();
    const maxWidth = window.innerWidth - 20;
    const textWidth = Math.min(rect.width, maxWidth);
    const timelineWidth = Math.min(280, Math.max(200, Math.floor(textWidth * 0.35)));
    const left = rect.left + window.scrollX;
    const top = rect.top + window.scrollY;
    const fitsSide = (left + textWidth + timelineWidth + 12) <= (window.scrollX + window.innerWidth - 10);
    panel.classList.toggle('gg-edit-playback-stacked', !fitsSide);
    overlay.style.left = `${left}px`;
    overlay.style.top = `${top}px`;
    panel.style.width = `${fitsSide ? (textWidth + timelineWidth + 12) : textWidth}px`;
    textPanel.style.width = `${textWidth}px`;
    textPanel.style.height = `${rect.height}px`;
    if (fitsSide) {
      timelinePanel.style.width = `${timelineWidth}px`;
      timelineList.style.height = `${Math.max(120, rect.height - 60)}px`;
    } else {
      timelinePanel.style.width = `${textWidth}px`;
      timelineList.style.height = `${Math.max(120, Math.min(220, rect.height))}px`;
    }
  };
  const pausePlayback = () => {
    isPlaying = false;
    playBtn.textContent = 'Play';
    if (playTimer) {
      clearTimeout(playTimer);
      playTimer = null;
    }
  };
  const startPlayback = () => {
    if (isPlaying) return;
    isPlaying = true;
    playBtn.textContent = 'Pause';
    scheduleNext();
  };
  const scheduleNext = () => {
    if (!isPlaying) return;
    playTimer = setTimeout(() => {
      if (!isPlaying) return;
      if (currentIndex < frames.length - 1) {
        setFrameIndex(currentIndex + 1);
        scheduleNext();
      } else {
        pausePlayback();
      }
    }, 2300);
  };
  const setFrameIndex = (index) => {
    currentIndex = Math.max(0, Math.min(index, frames.length - 1));
    const frame = frames[currentIndex];
    const user = frame?.event?.user || frame?.event?.userName || 'unknown';
    const color = resolveUserColor(user, userColors);
    renderPlaybackText(textPanel, frame, color);
    const match = similarityIndex ? getSimilarityMatch(similarityIndex, frame.event) : null;
    const baseLabel = match
      ? `Match: ${match.matchType || 'similar'} (${Math.round((match.confidence || 0) * 100)}%)`
      : formatTimelineLabel(frame.event);
    meta.textContent = !hasTextChanges && !frame?.textChanged
      ? `${baseLabel} (no text diff recorded)`
      : baseLabel;
    buttons.forEach((btn, idx) => {
      if (idx === currentIndex) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });
    const active = buttons[currentIndex];
    if (active) {
      active.scrollIntoView({ block: 'nearest' });
    }
  };
  frames.forEach((frame, idx) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'gg-edit-playback-timeline-btn';
    const user = frame?.event?.user || frame?.event?.userName || 'unknown';
    const color = resolveUserColor(user, userColors);
    btn.style.borderLeft = `4px solid ${color}`;
    btn.textContent = formatTimelineLabel(frame.event);
    if (similarityIndex) {
      const match = getSimilarityMatch(similarityIndex, frame.event);
      if (match) {
        const badge = document.createElement('div');
        badge.textContent = `Borrowed: ${Math.round((match.confidence || 0) * 100)}%`;
        badge.style.fontSize = '10px';
        badge.style.color = '#7a5b00';
        btn.appendChild(document.createElement('br'));
        btn.appendChild(badge);
      }
    }
    btn.addEventListener('click', () => {
      pausePlayback();
      setFrameIndex(idx);
    });
    timelineList.appendChild(btn);
    buttons.push(btn);
  });
  textPanel.addEventListener('click', (event) => {
    const target = event.target.closest(`[${SERVICE_EDIT_PLAYBACK_HIGHLIGHT_ATTR}="true"]`);
    if (target) {
      pausePlayback();
    }
  });
  playBtn.addEventListener('click', () => {
    if (isPlaying) {
      pausePlayback();
    } else {
      startPlayback();
    }
  });
  prevBtn.addEventListener('click', () => {
    pausePlayback();
    setFrameIndex(currentIndex - 1);
  });
  nextBtn.addEventListener('click', () => {
    pausePlayback();
    setFrameIndex(currentIndex + 1);
  });
  const cleanup = () => {
    pausePlayback();
    removeServiceEditPlaybackOverlay();
    window.removeEventListener('resize', updatePosition);
    window.removeEventListener('scroll', updatePosition, true);
    document.removeEventListener('keydown', onKeyDown);
  };
  const onKeyDown = (evt) => {
    if (evt.key === 'Escape') cleanup();
  };
  closeBtn.addEventListener('click', cleanup);
  window.addEventListener('resize', updatePosition);
  window.addEventListener('scroll', updatePosition, true);
  document.addEventListener('keydown', onKeyDown);
  updatePosition();
  setFrameIndex(0);
  scheduleNext();
}
window.gghost.openServiceEditPlaybackOverlay = openServiceEditPlaybackOverlay;
window.gghost.removeServiceEditPlaybackOverlay = removeServiceEditPlaybackOverlay;
// Edit History Overlay Function
async function showEditHistoryOverlay(currentLocationUuid, currentUser) {
  // Remove existing overlay if present
  const existingOverlay = document.getElementById('edit-history-overlay');
  if (existingOverlay) {
    existingOverlay.remove();
  }
  // Create overlay container
  const overlay = document.createElement('div');
  overlay.id = 'edit-history-overlay';
  Object.assign(overlay.style, {
    position: 'fixed', top: '0', left: '0', width: '100%', height: '100%',
    backgroundColor: 'rgba(0,0,0,0.8)', zIndex: '2147483647',
    display: 'flex', alignItems: 'center', justifyContent: 'center'
  });
  const modal = document.createElement('div');
  Object.assign(modal.style, {
    backgroundColor: '#fff', borderRadius: '8px', padding: '20px',
    maxWidth: '600px', maxHeight: '80vh', width: '90%',
    overflowY: 'auto', boxShadow: '0 4px 20px rgba(0,0,0,0.3)'
  });
  // Header
  const header = document.createElement('div');
  header.style.display = 'flex';
  header.style.justifyContent = 'space-between';
  header.style.alignItems = 'center';
  header.style.marginBottom = '20px';
  const title = document.createElement('h2');
  title.textContent = 'Your Edit History';
  title.style.margin = '0';
  title.style.fontSize = '20px';
  const closeBtn = document.createElement('button');
  closeBtn.textContent = '×';
  Object.assign(closeBtn.style, {
    background: 'none', border: 'none', fontSize: '24px',
    cursor: 'pointer', padding: '0', color: '#666'
  });
  closeBtn.addEventListener('click', () => overlay.remove());
  header.appendChild(title);
  header.appendChild(closeBtn);
  // Loading message
  const loading = document.createElement('div');
  loading.textContent = 'Loading your edit history...';
  loading.style.textAlign = 'center';
  loading.style.padding = '20px';
  loading.style.color = '#666';
  const progress = document.createElement('div');
  progress.style.textAlign = 'center';
  progress.style.padding = '10px';
  progress.style.color = '#999';
  progress.style.fontSize = '12px';
  modal.appendChild(header);
  modal.appendChild(loading);
  modal.appendChild(progress);
  overlay.appendChild(modal);
  document.body.appendChild(overlay);
  // Close on overlay click
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.remove();
  });
  // Helper function to get current page UUID
  function getCurrentPageUuid() {
    const fullServiceMatch = location.pathname.match(/^\/team\/location\/([a-f0-9-]+)\/services\/([a-f0-9-]+)(?:\/|$)/);
    const teamMatch = location.pathname.match(/^\/team\/location\/([a-f0-9-]+)\/?/);
    const findMatch = location.pathname.match(/^\/find\/location\/([a-f0-9-]+)\/?/);
    return (fullServiceMatch || teamMatch || findMatch)?.[1] || null;
  }
  const currentLocationId = currentLocationUuid || getCurrentPageUuid();
  function normalizeKeyPath(topKeyRaw) {
    let decoded = topKeyRaw;
    try { decoded = decodeURIComponent(topKeyRaw); } catch {}
    let value = String(decoded || '');
    if (/^https?:\/\//i.test(value)) {
      try {
        value = new URL(value).pathname;
      } catch {}
    }
    return value.replace(/\/+$/, '').replace(/^\/+/, '');
  }
  function keyMatchesLocation(topKeyRaw, locationUuid) {
    if (!locationUuid) return false;
    const keyPath = normalizeKeyPath(topKeyRaw).toLowerCase();
    const uuid = String(locationUuid).toLowerCase();
    if (!keyPath) return false;
    if (keyPath === uuid) return true;
    const locationPattern = new RegExp(`(^|/)team/location/${uuid}(/|$)`, 'i');
    if (locationPattern.test(keyPath)) return true;
    const findPattern = new RegExp(`(^|/)find/location/${uuid}(/|$)`, 'i');
    return findPattern.test(keyPath);
  }
  function extractLocationUuidFromKey(topKeyRaw) {
    const keyPath = normalizeKeyPath(topKeyRaw);
    if (!keyPath) return null;
    const direct = keyPath.match(/^[a-f0-9-]{12,36}$/i);
    if (direct) return direct[0];
    const match = keyPath.match(/(?:^|\/)(?:team|find)\/location\/([a-f0-9-]{12,36})/i);
    return match ? match[1] : null;
  }
  function parseNoteValue(noteVal) {
    if (!noteVal) return null;
    if (typeof noteVal === 'object') return noteVal;
    if (typeof noteVal === 'string') {
      try {
        const parsed = JSON.parse(noteVal);
        if (parsed && typeof parsed === 'object') return parsed;
      } catch {}
    }
    return null;
  }
  function isInvocationKey(value) {
    return String(value || '').toLowerCase() === 'invocations';
  }
  function formatEditValue(value) {
    if (value == null) return '(empty)';
    if (typeof value === 'string') {
      const trimmed = value.trim();
      return trimmed.length ? trimmed : '(empty)';
    }
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  }
  try {
    // Fetch all notes data
    const baseURL = window.gghost?.baseURL;
    console.log('[Edit History] Base URL:', baseURL);
    if (!baseURL) {
      throw new Error('Base URL not available');
    }
    const { data: allData, fromCache } = await fetchLocationNotesWithCache(baseURL);
    console.log('[Edit History] Data received:', allData);
    if (fromCache) {
      console.log('[Edit History] Using cached locationNotes data');
    }
    const locationEdits = [];
    const visitHistory = readVisitHistory();
    const visitUuids = new Set();
    visitHistory.forEach((visit) => {
      if (visit && visit.uuid) visitUuids.add(visit.uuid);
    });
    if (currentLocationId) {
      for (const [locationKey, userMap] of Object.entries(allData)) {
        if (!userMap || typeof userMap !== 'object') continue;
        if (!keyMatchesLocation(locationKey, currentLocationId)) continue;
        for (const [userKey, dateMap] of Object.entries(userMap)) {
          if (isInvocationKey(userKey)) continue;
          if (!dateMap || typeof dateMap !== 'object') continue;
          for (const [dateKey, noteVal] of Object.entries(dateMap)) {
            const info = parseWhen(dateKey, noteVal);
            if (!info) continue;
            const meta = parseNoteValue(noteVal);
            if (meta && meta.type && meta.type !== 'edit') continue;
            const copyedit = isCopyeditMeta(meta);
            const summary = withCopyeditPrefix(
              meta?.summary || meta?.note || (typeof noteVal === 'string' ? noteVal : (noteVal?.note || 'Edit')),
              copyedit
            );
            locationEdits.push({
              userName: userKey.replace(/-futurenote$/i, ''),
              date: info.date,
              dateOnly: info.dateOnly,
              summary,
              copyedit,
              field: meta?.label || meta?.field || '',
              before: meta?.before,
              after: meta?.after
            });
          }
        }
      }
    }
    locationEdits.sort((a, b) => b.date - a.date);
    // Filter user's edits and collect location UUIDs
    const userEdits = [];
    const locationUuids = new Set();
    const normalizedCurrentUser = normalizeEditUserName(currentUser || '');
    console.log('[Edit History] Current user:', normalizedCurrentUser || currentUser);
    console.log('[Edit History] All data keys:', Object.keys(allData));
    progress.textContent = 'Analyzing your edits...';
    for (const [locationKey, userMap] of Object.entries(allData)) {
      if (!userMap || typeof userMap !== 'object') continue;
      // Check if current user has edits for this location
      const userKey = `${normalizedCurrentUser || currentUser}-futurenote`;
      console.log('[Edit History] Checking location:', locationKey, 'for users:', Object.keys(userMap));
      if (userMap[userKey] || userMap[normalizedCurrentUser] || userMap[currentUser]) {
        const dateMap = userMap[userKey] || userMap[normalizedCurrentUser] || userMap[currentUser];
        if (dateMap && typeof dateMap === 'object') {
          // Extract UUID from location key (decode if needed)
          const normalizedPath = normalizeKeyPath(locationKey);
          const locationUuid = extractLocationUuidFromKey(locationKey);
          if (locationUuid && locationUuid.match(/^[a-f0-9-]+$/)) {
            locationUuids.add(locationUuid);
            // Determine the page type from the path
            let pageType = 'Location';
            if (normalizedPath.includes('/services/')) {
              pageType = 'Service';
            } else if (normalizedPath.includes('/other-info')) {
              pageType = 'Other Info';
            }
            const isBareUuid = /^[a-f0-9-]{12,36}$/i.test(normalizedPath);
            const fullPath = normalizedPath && !isBareUuid
              ? (normalizedPath.startsWith('/') ? normalizedPath : `/${normalizedPath}`)
              : `/team/location/${locationUuid}`;
            // Process each edit date
            for (const [dateKey, noteVal] of Object.entries(dateMap)) {
              const info = parseWhen(dateKey, noteVal);
              if (info) {
                const meta = parseNoteValue(noteVal);
                if (meta && meta.type && meta.type !== 'edit') continue;
                const copyedit = isCopyeditMeta(meta);
                const noteSummary = withCopyeditPrefix(
                  meta?.summary || meta?.note || (typeof noteVal === 'string' ? noteVal : (noteVal?.note || 'Edit')),
                  copyedit
                );
                userEdits.push({
                  locationUuid,
                  fullPath,
                  pageType,
                  date: info.date,
                  dateOnly: info.dateOnly,
                  note: noteSummary,
                  copyedit
                });
              }
            }
          }
        }
      }
    }
    visitUuids.forEach((uuid) => locationUuids.add(uuid));
    const visitsByDate = groupVisitsByDate(visitHistory);
    // Get current page UUID for highlighting
    const currentPageUuid = currentLocationId || getCurrentPageUuid();
    // Initialize location details - start empty, populate as fetched
    const locationDetails = {};
    const loadedUuids = new Set();
    Array.from(locationUuids).forEach(uuid => {
      locationDetails[uuid] = {
        orgName: null,
        locationName: null,
        isCurrentPage: uuid === currentPageUuid,
        isLoading: true
      };
    });
    // Show initial content immediately with placeholders
    progress.textContent = 'Loading location details...';
    console.log('[Edit History] Initial render with placeholders');
    // Clear loading and show initial content
    modal.removeChild(loading);
    modal.removeChild(progress);
    // Group edits first with placeholder data
    const editsByDate = groupEditsByDate(userEdits, locationDetails);
    // Render initial content
    renderEditHistory(editsByDate, locationDetails, modal, currentPageUuid, locationEdits, visitsByDate);
    // Now fetch details progressively and update UI
    Array.from(locationUuids).forEach(async (uuid) => {
      console.log(`[Edit History] 🔄 Fetching details for UUID: ${uuid}`);
      const data = await fetchLocationDetails(uuid);
      console.log(`[Edit History] 📦 Raw data for ${uuid}:`, data);
      console.log(`[Edit History] 🏢 Org: "${data.org}", Name: "${data.name}"`);
      const hasAnyData = !!(data.org || data.name);
      // Update the location details
      locationDetails[uuid] = {
        orgName: data.org || null,
        locationName: data.name || null,
        isCurrentPage: uuid === currentPageUuid,
        isLoading: false,
        hasData: hasAnyData
      };
      addLocationToUI(uuid, locationDetails[uuid]);
      if (hasAnyData) {
        console.log(`[Edit History] Got data for ${uuid}: "${data.org}" - "${data.name}"`);
        loadedUuids.add(uuid);
      } else {
        console.warn(`[Edit History] No valid data for ${uuid} - org:"${data.org}" name:"${data.name}"`);
        console.warn('[Edit History] This could be due to:');
        console.warn('[Edit History]   - API timeout (504)');
        console.warn('[Edit History]   - CORS errors');
        console.warn('[Edit History]   - Missing organization/name in database');
        console.warn('[Edit History]   - Invalid UUID');
      }
    });
    // Function to add a location to the UI when it's successfully loaded
    function addLocationToUI(uuid, details) {
      // Re-render the entire edit history with updated data
      const editsByDate = groupEditsByDate(userEdits, locationDetails);
      renderEditHistory(editsByDate, locationDetails, modal, currentPageUuid, locationEdits, visitsByDate);
    }
    // Helper function to group edits by date
    function groupEditsByDate(userEdits, locationDetails) {
      const editsByDate = {};
      userEdits.forEach(edit => {
        const dateStr = formatNycDate(edit.date);
        if (!editsByDate[dateStr]) {
          editsByDate[dateStr] = {};
        }
        // Group by location UUID, but track different page types
        const key = edit.locationUuid;
        if (!editsByDate[dateStr][key]) {
          editsByDate[dateStr][key] = {
            locationUuid: edit.locationUuid,
            totalCount: 0,
            latestDate: edit.date,
            pageTypes: {}
          };
        }
        // Track edits by page type within this location
        if (!editsByDate[dateStr][key].pageTypes[edit.pageType]) {
          editsByDate[dateStr][key].pageTypes[edit.pageType] = {
            count: 0,
            notes: [],
            fullPath: edit.fullPath
          };
        }
        editsByDate[dateStr][key].totalCount++;
        editsByDate[dateStr][key].pageTypes[edit.pageType].count++;
        editsByDate[dateStr][key].pageTypes[edit.pageType].notes.push(edit.note);
        if (edit.date > editsByDate[dateStr][key].latestDate) {
          editsByDate[dateStr][key].latestDate = edit.date;
        }
      });
      return editsByDate;
    }
    function groupVisitsByDate(visitHistory) {
      const visitsByDate = {};
      visitHistory.forEach((visit) => {
        if (!visit || !visit.uuid || !visit.visitedAt) return;
        const date = new Date(visit.visitedAt);
        if (Number.isNaN(date.getTime())) return;
        const dateStr = formatNycDate(date);
        if (!visitsByDate[dateStr]) {
          visitsByDate[dateStr] = {};
        }
        const key = visit.uuid;
        if (!visitsByDate[dateStr][key]) {
          visitsByDate[dateStr][key] = {
            locationUuid: visit.uuid,
            totalCount: 0,
            latestDate: date,
            pageTypes: {}
          };
        }
        const pageType = visit.pageType || getLocationPageType(visit.fullPath);
        if (!visitsByDate[dateStr][key].pageTypes[pageType]) {
          visitsByDate[dateStr][key].pageTypes[pageType] = {
            count: 0,
            fullPath: visit.fullPath || `/team/location/${visit.uuid}`
          };
        }
        visitsByDate[dateStr][key].totalCount++;
        visitsByDate[dateStr][key].pageTypes[pageType].count++;
        if (date > visitsByDate[dateStr][key].latestDate) {
          visitsByDate[dateStr][key].latestDate = date;
        }
      });
      return visitsByDate;
    }
    // Helper function to render the complete edit history
    function renderEditHistory(editsByDate, locationDetails, modal, currentPageUuid, locationEdits = [], visitsByDate = {}) {
      // Clear any existing content (except header)
      while (modal.children.length > 1) {
        modal.removeChild(modal.lastChild);
      }
      if (locationEdits && locationEdits.length) {
        const sectionTitle = document.createElement('h2');
        sectionTitle.textContent = 'Edit Details for This Location';
        sectionTitle.style.fontSize = '18px';
        sectionTitle.style.margin = '20px 0 10px 0';
        sectionTitle.style.color = '#333';
        sectionTitle.style.borderBottom = '2px solid #eee';
        sectionTitle.style.paddingBottom = '5px';
        modal.appendChild(sectionTitle);
        const USER_PAGE_SIZE = 25;
        const colorPalette = ['#1b9e77', '#d95f02', '#7570b3', '#e7298a', '#66a61e', '#e6ab02'];
        const userColors = new Map();
        const pickColor = (user) => {
          const key = normalizeEditUserName(user || 'Unknown') || 'Unknown';
          if (userColors.has(key)) return userColors.get(key);
          const color = colorPalette[userColors.size % colorPalette.length];
          userColors.set(key, color);
          return color;
        };
        const legend = document.createElement('div');
        Object.assign(legend.style, { display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '12px' });
        locationEdits.forEach((edit) => {
          const user = normalizeEditUserName(edit.userName || 'Unknown') || 'Unknown';
          if (userColors.has(user)) return;
          const color = pickColor(user);
          const item = document.createElement('div');
          Object.assign(item.style, { display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px' });
          const dot = document.createElement('span');
          Object.assign(dot.style, {
            width: '10px',
            height: '10px',
            borderRadius: '50%',
            background: color,
            display: 'inline-block'
          });
          const label = document.createElement('span');
          label.textContent = user;
          item.appendChild(dot);
          item.appendChild(label);
          legend.appendChild(item);
        });
        modal.appendChild(legend);
        const buildEditRow = (edit) => {
          const row = document.createElement('div');
          Object.assign(row.style, {
            border: '1px solid #e0e0e0',
            borderRadius: '6px',
            padding: '8px',
            background: '#fafafa'
          });
          const headerRow = document.createElement('div');
          Object.assign(headerRow.style, { display: 'flex', alignItems: 'center', gap: '8px' });
          const normalizedUser = normalizeEditUserName(edit.userName || 'Unknown') || 'Unknown';
          const dot = document.createElement('span');
          Object.assign(dot.style, {
            width: '10px',
            height: '10px',
            borderRadius: '50%',
            background: pickColor(normalizedUser),
            display: 'inline-block'
          });
          const who = document.createElement('div');
          who.textContent = normalizedUser;
          who.style.fontWeight = '600';
          who.style.fontSize = '13px';
          const when = document.createElement('div');
          when.textContent = formatNycDateTime(edit.date);
          when.style.fontSize = '12px';
          when.style.color = '#666';
          const summary = document.createElement('div');
          summary.textContent = edit.summary || 'Edit';
          summary.style.fontSize = '13px';
          summary.style.flex = '1';
          headerRow.appendChild(dot);
          headerRow.appendChild(who);
          headerRow.appendChild(when);
          headerRow.appendChild(summary);
          row.appendChild(headerRow);
          const hasBeforeAfter = typeof edit.before !== 'undefined' || typeof edit.after !== 'undefined';
          if (hasBeforeAfter) {
            const details = document.createElement('details');
            details.style.marginTop = '6px';
            const summaryEl = document.createElement('summary');
            summaryEl.textContent = 'Show changes';
            summaryEl.style.cursor = 'pointer';
            summaryEl.style.fontSize = '12px';
            details.appendChild(summaryEl);
            const beforeBlock = document.createElement('pre');
            beforeBlock.textContent = `Before:\n${formatEditValue(edit.before)}`;
            Object.assign(beforeBlock.style, { fontSize: '12px', whiteSpace: 'pre-wrap', margin: '6px 0 0 0' });
            const afterBlock = document.createElement('pre');
            afterBlock.textContent = `After:\n${formatEditValue(edit.after)}`;
            Object.assign(afterBlock.style, { fontSize: '12px', whiteSpace: 'pre-wrap', margin: '6px 0 0 0' });
            details.appendChild(beforeBlock);
            details.appendChild(afterBlock);
            row.appendChild(details);
          }
          return row;
        };
        const detailsList = document.createElement('div');
        Object.assign(detailsList.style, { display: 'flex', flexDirection: 'column', gap: '12px' });
        const editsByUser = new Map();
        locationEdits.forEach((edit) => {
          const user = normalizeEditUserName(edit.userName || 'Unknown') || 'Unknown';
          if (!editsByUser.has(user)) editsByUser.set(user, []);
          editsByUser.get(user).push(edit);
        });
        const userGroups = Array.from(editsByUser.entries()).map(([user, edits]) => ({
          user,
          edits,
          latestDate: edits[0]?.date || new Date(0)
        })).sort((a, b) => b.latestDate - a.latestDate);
        userGroups.forEach(({ user, edits }) => {
          const total = edits.length;
          const totalPages = Math.max(1, Math.ceil(total / USER_PAGE_SIZE));
          const section = document.createElement('div');
          Object.assign(section.style, { border: '1px solid #eee', borderRadius: '8px', padding: '10px' });
          const headerRow = document.createElement('div');
          Object.assign(headerRow.style, {
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            marginBottom: '8px'
          });
          const dot = document.createElement('span');
          Object.assign(dot.style, {
            width: '10px',
            height: '10px',
            borderRadius: '50%',
            background: pickColor(user),
            display: 'inline-block'
          });
          const userLabel = document.createElement('div');
          userLabel.textContent = `${user} (${total})`;
          userLabel.style.fontWeight = '600';
          userLabel.style.fontSize = '13px';
          const pager = document.createElement('div');
          Object.assign(pager.style, { marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '6px' });
          const prevBtn = document.createElement('button');
          prevBtn.type = 'button';
          prevBtn.textContent = 'Prev';
          const nextBtn = document.createElement('button');
          nextBtn.type = 'button';
          nextBtn.textContent = 'Next';
          [prevBtn, nextBtn].forEach((btn) => {
            Object.assign(btn.style, {
              border: '1px solid #d0d0d0',
              background: '#fff',
              borderRadius: '4px',
              padding: '2px 6px',
              fontSize: '11px',
              cursor: 'pointer'
            });
          });
          const pageInfo = document.createElement('span');
          pageInfo.style.fontSize = '11px';
          pageInfo.style.color = '#666';
          pager.appendChild(prevBtn);
          pager.appendChild(pageInfo);
          pager.appendChild(nextBtn);
          headerRow.appendChild(dot);
          headerRow.appendChild(userLabel);
          headerRow.appendChild(pager);
          section.appendChild(headerRow);
          const rowsWrap = document.createElement('div');
          Object.assign(rowsWrap.style, { display: 'flex', flexDirection: 'column', gap: '10px' });
          section.appendChild(rowsWrap);
          const state = { page: 0 };
          const renderPage = () => {
            rowsWrap.innerHTML = '';
            const start = state.page * USER_PAGE_SIZE;
            const pageEdits = edits.slice(start, start + USER_PAGE_SIZE);
            pageEdits.forEach((edit) => rowsWrap.appendChild(buildEditRow(edit)));
            pageInfo.textContent = `Page ${state.page + 1} of ${totalPages}`;
            prevBtn.disabled = state.page <= 0;
            nextBtn.disabled = state.page >= totalPages - 1;
            prevBtn.style.opacity = prevBtn.disabled ? '0.5' : '1';
            nextBtn.style.opacity = nextBtn.disabled ? '0.5' : '1';
            prevBtn.style.cursor = prevBtn.disabled ? 'default' : 'pointer';
            nextBtn.style.cursor = nextBtn.disabled ? 'default' : 'pointer';
          };
          prevBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (state.page <= 0) return;
            state.page -= 1;
            renderPage();
          });
          nextBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (state.page >= totalPages - 1) return;
            state.page += 1;
            renderPage();
          });
          renderPage();
          detailsList.appendChild(section);
        });
        modal.appendChild(detailsList);
      }
      const hasEdits = Object.keys(editsByDate).length > 0 || (locationEdits && locationEdits.length > 0);
      const hasVisits = Object.keys(visitsByDate).length > 0;
      if (!hasEdits && !hasVisits) {
        const noEdits = document.createElement('div');
        noEdits.textContent = 'No edit history found for your account.';
        noEdits.style.textAlign = 'center';
        noEdits.style.padding = '20px';
        noEdits.style.color = '#666';
        modal.appendChild(noEdits);
        return;
      }
      if (!hasEdits) {
        const noEdits = document.createElement('div');
        noEdits.textContent = 'No edit history found for your account.';
        noEdits.style.textAlign = 'center';
        noEdits.style.padding = '10px 0 0 0';
        noEdits.style.color = '#666';
        modal.appendChild(noEdits);
      }
    // Separate current page edits from others - only include loaded locations
    const currentPageEdits = {};
    const otherEdits = {};
    Object.entries(editsByDate).forEach(([dateStr, locations]) => {
      Object.entries(locations).forEach(([uuid, data]) => {
        const details = locationDetails[uuid] || {
          orgName: null,
          locationName: null,
          isCurrentPage: false,
          isLoading: false
        };
        if (details.isCurrentPage) {
          if (!currentPageEdits[dateStr]) currentPageEdits[dateStr] = {};
          currentPageEdits[dateStr][uuid] = data;
        } else {
          if (!otherEdits[dateStr]) otherEdits[dateStr] = {};
          otherEdits[dateStr][uuid] = data;
        }
      });
    });
    // Function to render edits section
    function renderEditsSection(editsData, title, isHighlighted = false, activityLabel = 'edit', showDeepLinks = true) {
      if (Object.keys(editsData).length === 0) return;
      if (title) {
        const sectionTitle = document.createElement('h2');
        sectionTitle.textContent = title;
        sectionTitle.style.fontSize = '18px';
        sectionTitle.style.margin = '20px 0 15px 0';
        sectionTitle.style.color = isHighlighted ? '#0066cc' : '#333';
        sectionTitle.style.borderBottom = '2px solid ' + (isHighlighted ? '#0066cc' : '#eee');
        sectionTitle.style.paddingBottom = '5px';
        modal.appendChild(sectionTitle);
      }
      const sortedDates = Object.keys(editsData).sort((a, b) => new Date(b) - new Date(a));
      sortedDates.forEach(dateStr => {
        const dateGroup = document.createElement('div');
        dateGroup.style.marginBottom = '20px';
        const dateHeader = document.createElement('h3');
        dateHeader.textContent = dateStr;
        dateHeader.style.fontSize = '16px';
        dateHeader.style.margin = '0 0 10px 0';
        dateHeader.style.color = '#333';
        dateHeader.style.borderBottom = '1px solid #eee';
        dateHeader.style.paddingBottom = '5px';
        dateGroup.appendChild(dateHeader);
        const locations = editsData[dateStr];
        Object.entries(locations).forEach(([uuid, data]) => {
          const locationContainer = document.createElement('div');
          locationContainer.style.marginBottom = '8px';
          locationContainer.style.border = '1px solid #e0e0e0';
          locationContainer.style.borderRadius = '4px';
          locationContainer.style.backgroundColor = isHighlighted ? '#f0f8ff' : '#f9f9f9';
          // Main location row
          const locationDiv = document.createElement('div');
          locationDiv.style.display = 'flex';
          locationDiv.style.alignItems = 'center';
          locationDiv.style.padding = '8px';
          // Hyperlinked Org-Location name (no UUID shown) - only loaded items shown
          const details = locationDetails[uuid] || {};
          const nameLink = document.createElement('a');
          nameLink.href = `https://gogetta.nyc/team/location/${uuid}`;
          nameLink.target = '_blank';
          const displayName = details.orgName && details.locationName
            ? `${details.orgName} - ${details.locationName}`
            : details.orgName || details.locationName || (details.isLoading ? `Loading ${uuid}` : `Location ${uuid}`);
          nameLink.textContent = displayName;
          nameLink.setAttribute('data-uuid', uuid);
          nameLink.style.flex = '1';
          nameLink.style.fontSize = '14px';
          nameLink.style.color = '#0066cc';
          nameLink.style.textDecoration = 'none';
          nameLink.style.marginRight = '10px';
          nameLink.addEventListener('mouseenter', () => {
            nameLink.style.textDecoration = 'underline';
          });
          nameLink.addEventListener('mouseleave', () => {
            nameLink.style.textDecoration = 'none';
          });
          // Total edit count and latest date
          const statsDiv = document.createElement('div');
          statsDiv.textContent = `${data.totalCount} ${activityLabel}${data.totalCount > 1 ? 's' : ''} • ${data.latestDate.toLocaleTimeString()}`;
          statsDiv.style.fontSize = '12px';
          statsDiv.style.color = '#666';
          statsDiv.style.textAlign = 'right';
          statsDiv.style.minWidth = '120px';
          locationDiv.appendChild(nameLink);
          locationDiv.appendChild(statsDiv);
          locationContainer.appendChild(locationDiv);
        // Page type breakdown
        if (Object.keys(data.pageTypes).length > 1 || Object.keys(data.pageTypes)[0] !== 'Location') {
          Object.entries(data.pageTypes).forEach(([pageType, pageData]) => {
            const pageDiv = document.createElement('div');
            pageDiv.style.display = 'flex';
            pageDiv.style.alignItems = 'center';
            pageDiv.style.padding = '4px 8px 4px 220px'; // Indent to align with location name
            pageDiv.style.fontSize = '12px';
            pageDiv.style.color = '#666';
            pageDiv.style.backgroundColor = '#fff';
            pageDiv.style.borderTop = '1px solid #eee';
            const pageTypeSpan = document.createElement('span');
            pageTypeSpan.textContent = `${pageType}: ${pageData.count} ${activityLabel}${pageData.count > 1 ? 's' : ''}`;
            pageTypeSpan.style.flex = '1';
            // If it's a service page, show link to that specific page
            if (showDeepLinks && pageData.fullPath && pageData.fullPath.includes('/services/')) {
              const serviceLink = document.createElement('a');
              serviceLink.href = `https://gogetta.nyc${pageData.fullPath}`;
              serviceLink.target = '_blank';
              serviceLink.textContent = '→';
              serviceLink.style.color = '#0066cc';
              serviceLink.style.textDecoration = 'none';
              serviceLink.style.marginLeft = '8px';
              pageDiv.appendChild(serviceLink);
            }
            pageDiv.appendChild(pageTypeSpan);
            locationContainer.appendChild(pageDiv);
          });
        }
          dateGroup.appendChild(locationContainer);
        });
        modal.appendChild(dateGroup);
      });
    }
      if (hasVisits) {
        renderEditsSection(visitsByDate, 'Recent Visits', false, 'visit', false);
      }
      // Render current page edits first (highlighted)
      renderEditsSection(currentPageEdits, 'Your Edits on This Location (All Pages)', true);
      // Render other edits in chronological order
      renderEditsSection(otherEdits, 'Your Other Location Edits', false);
    }
  } catch (err) {
    console.error('[Edit History] Error loading data:', err);
    // Clear modal content except header
    while (modal.children.length > 1) {
      modal.removeChild(modal.lastChild);
    }
    const errorDiv = document.createElement('div');
    errorDiv.textContent = `Error loading edit history: ${err.message}`;
    errorDiv.style.textAlign = 'center';
    errorDiv.style.padding = '20px';
    errorDiv.style.color = '#d32f2f';
    modal.appendChild(errorDiv);
  }
}
const EDIT_HIGHLIGHT_STYLE_ID = 'gghost-edit-highlight-style';
const EDIT_HIGHLIGHT_LEGEND_ID = 'gghost-edit-highlight-legend';
let editHighlightTimer = null;
let editHighlightCleanup = null;
let editHighlightRequestId = 0;
function ensureEditHighlightStyles() {
  if (document.getElementById(EDIT_HIGHLIGHT_STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = EDIT_HIGHLIGHT_STYLE_ID;
  style.textContent = `
    @keyframes gghostEditPulse {
      0% { box-shadow: 0 0 0 0 var(--gghost-edit-color, rgba(0,0,0,0.15)); }
      70% { box-shadow: 0 0 0 8px var(--gghost-edit-color, rgba(0,0,0,0.08)); }
      100% { box-shadow: 0 0 0 0 var(--gghost-edit-color, rgba(0,0,0,0)); }
    }
    .gghost-edit-highlight {
      animation: gghostEditPulse 1.8s ease-out;
    }
  `;
  document.head.appendChild(style);
}
function parseEditNoteValue(noteVal) {
  if (!noteVal) return null;
  if (typeof noteVal === 'object') return noteVal;
  if (typeof noteVal === 'string') {
    try {
      const parsed = JSON.parse(noteVal);
      if (parsed && typeof parsed === 'object') return parsed;
    } catch {}
  }
  return null;
}
function isCopyeditMeta(meta) {
  if (!meta || typeof meta !== 'object') return false;
  const flag = meta.copyedit ?? meta.copyeditFlag ?? meta.copyedit_flag ?? meta.copyEdit;
  if (typeof flag === 'boolean') return flag;
  if (flag == null) return false;
  const text = String(flag).trim().toLowerCase();
  return text === 'true' || text === '1' || text === 'yes' || text === 'y';
}
function withCopyeditPrefix(summary, copyedit) {
  if (!copyedit) return summary || '';
  const text = summary || 'Edit';
  if (/^copyedit\b/i.test(text)) return text;
  return `Copyedit: ${text}`;
}
const EDIT_TIMEZONE = 'America/New_York';
function formatNycDate(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-US', { timeZone: EDIT_TIMEZONE });
}
function formatNycDateTime(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('en-US', {
    timeZone: EDIT_TIMEZONE,
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}
function clearEditHighlights() {
  if (editHighlightTimer) {
    clearInterval(editHighlightTimer);
    editHighlightTimer = null;
  }
  if (editHighlightCleanup) {
    editHighlightCleanup();
    editHighlightCleanup = null;
  }
  const legend = document.getElementById(EDIT_HIGHLIGHT_LEGEND_ID);
  if (legend) legend.remove();
}
function hexToRgba(hex, alpha = 0.35) {
  if (!hex) return `rgba(0,0,0,${alpha})`;
  const cleaned = hex.replace('#', '');
  if (cleaned.length !== 6) return `rgba(0,0,0,${alpha})`;
  const r = parseInt(cleaned.slice(0, 2), 16);
  const g = parseInt(cleaned.slice(2, 4), 16);
  const b = parseInt(cleaned.slice(4, 6), 16);
  if ([r, g, b].some(Number.isNaN)) return `rgba(0,0,0,${alpha})`;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
async function fetchPageEditNotes(pagePath) {
  if (!baseURL || !pagePath) return [];
  const encodedKey = encodeURIComponent(pagePath);
  const primaryUrl = `${baseURL}locationNotes/${encodedKey}.json`;
  const fallbackUrl = `${baseURL}locationNotes/${pagePath.replace(/^\/+/, '')}.json`;
  const fetchData = async (url) => {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) return null;
    return res.json();
  };
  let data = null;
  try {
    data = await fetchData(primaryUrl);
    if (!data) {
      data = await fetchData(fallbackUrl);
    }
  } catch (err) {
    console.warn('[Edit Highlight] Failed to fetch edit notes', err);
    return [];
  }
  if (!data || typeof data !== 'object') return [];
  const edits = [];
  for (const [userKey, dateMap] of Object.entries(data)) {
    if (!dateMap || typeof dateMap !== 'object') continue;
    for (const [dateKey, noteVal] of Object.entries(dateMap)) {
      const info = parseWhen(dateKey, noteVal);
      if (!info) continue;
      const meta = parseEditNoteValue(noteVal);
      if (!meta || meta.type !== 'edit') continue;
      edits.push({
        userName: userKey.replace(/-futurenote$/i, ''),
        date: info.date,
        summary: withCopyeditPrefix(meta.summary || meta.note || 'Edit', isCopyeditMeta(meta)),
        copyedit: isCopyeditMeta(meta),
        before: meta.before,
        after: meta.after
      });
    }
  }
  edits.sort((a, b) => b.date - a.date);
  return edits;
}
function buildServiceNotesPagePath(locationId, serviceId, mode) {
  const loc = String(locationId || '').trim();
  const svc = String(serviceId || '').trim();
  if (!loc || !svc) return '';
  const suffix = mode === 'description' ? 'description'
    : mode === 'other-info' ? 'other-info'
      : '';
  if (!suffix) return '';
  return `/team/location/${loc}/services/${svc}/${suffix}`;
}
async function fetchLocationNotesRecordForPage(pagePath) {
  const base = window.gghost?.baseURL || baseURL;
  if (!base || !pagePath) return null;
  const encodedKey = encodeURIComponent(pagePath);
  const primaryUrl = `${base}locationNotes/${encodedKey}.json`;
  const fallbackUrl = `${base}locationNotes/${pagePath.replace(/^\/+/, '')}.json`;
  const fetcher = typeof fetchViaBackground === 'function' ? fetchViaBackground : fetch;
  const auth = typeof window.gghost?.withFirebaseAuth === 'function'
    ? window.gghost.withFirebaseAuth
    : null;
  const fetchData = async (url) => {
    const authUrl = auth && url.includes('firebaseio.com') ? auth(url) : url;
    const res = await fetcher(authUrl, { cache: 'no-store' });
    if (!res.ok) return null;
    return res.json();
  };
  let data = null;
  try {
    data = await fetchData(primaryUrl);
    if (!data) {
      data = await fetchData(fallbackUrl);
    }
  } catch (err) {
    console.warn('[LocationNotes] Failed to fetch record', err);
    return null;
  }
  return data && typeof data === 'object' ? data : null;
}
async function fetchLocationNotesRecordForService({ locationId, serviceId, mode } = {}) {
  const pagePath = buildServiceNotesPagePath(locationId, serviceId, mode);
  if (!pagePath) return null;
  return fetchLocationNotesRecordForPage(pagePath);
}
function findEditHighlightTarget(field) {
  const key = String(field || '').toLowerCase();
  if (key === 'description' || key === 'other-info') {
    return document.querySelector('.TextArea') || document.querySelector('textarea');
  }
  if (key === 'who-does-it-serve') {
    return document.querySelector('.WhoDoesItServe') || document.querySelector('form');
  }
  if (key === 'opening-hours') {
    return document.querySelector('.ServiceOpeningHours') || document.querySelector('form');
  }
  if (key === 'documents') {
    return document.querySelector('form') || document.querySelector('input');
  }
  return document.querySelector('textarea') || document.querySelector('form') || document.querySelector('input');
}
function applyEditHighlights(target, edits) {
  if (!target || !edits.length) return;
  ensureEditHighlightStyles();
  clearEditHighlights();
  const palette = ['#1b9e77', '#d95f02', '#7570b3', '#e7298a', '#66a61e', '#e6ab02'];
  const userColors = new Map();
  const getColor = (user) => {
    const key = normalizeEditUserName(user || 'Unknown') || 'Unknown';
    if (userColors.has(key)) return userColors.get(key);
    const color = palette[userColors.size % palette.length];
    userColors.set(key, color);
    return color;
  };
  const originalBoxShadow = target.style.boxShadow;
  const originalOutline = target.style.outline;
  editHighlightCleanup = () => {
    target.classList.remove('gghost-edit-highlight');
    target.style.boxShadow = originalBoxShadow;
    target.style.outline = originalOutline;
  };
  const legend = document.createElement('div');
  legend.id = EDIT_HIGHLIGHT_LEGEND_ID;
  Object.assign(legend.style, {
    position: 'fixed',
    right: '18px',
    bottom: '80px',
    maxWidth: '280px',
    maxHeight: '220px',
    overflowY: 'auto',
    background: '#fff',
    border: '1px solid #ddd',
    borderRadius: '6px',
    padding: '8px',
    boxShadow: '0 6px 16px rgba(0,0,0,0.18)',
    fontSize: '12px',
    zIndex: '10001'
  });
  const legendTitle = document.createElement('div');
  legendTitle.textContent = 'Edit highlights';
  legendTitle.style.fontWeight = '600';
  legendTitle.style.marginBottom = '6px';
  legend.appendChild(legendTitle);
  edits.slice(0, 8).forEach((edit) => {
    const row = document.createElement('div');
    Object.assign(row.style, {
      display: 'flex',
      gap: '6px',
      alignItems: 'center',
      marginBottom: '4px'
    });
    const dot = document.createElement('span');
    const userLabel = normalizeEditUserName(edit.userName || 'Unknown') || 'Unknown';
    const color = getColor(userLabel);
    Object.assign(dot.style, {
      width: '8px',
      height: '8px',
      borderRadius: '50%',
      background: color,
      display: 'inline-block'
    });
    const text = document.createElement('span');
    text.textContent = `${userLabel} - ${formatNycDateTime(edit.date)}`;
    row.appendChild(dot);
    row.appendChild(text);
    legend.appendChild(row);
  });
  document.body.appendChild(legend);
  let idx = 0;
  const cycle = () => {
    if (!document.body.contains(target)) {
      clearEditHighlights();
      return;
    }
    const edit = edits[idx % edits.length];
    idx += 1;
    const color = getColor(normalizeEditUserName(edit.userName || 'Unknown') || 'Unknown');
    target.style.outline = `2px solid ${color}`;
    target.style.setProperty('--gghost-edit-color', hexToRgba(color, 0.25));
    target.classList.remove('gghost-edit-highlight');
    void target.offsetWidth;
    target.classList.add('gghost-edit-highlight');
  };
  cycle();
  editHighlightTimer = setInterval(cycle, 2200);
}
async function updateEditHighlightsForCurrentPage() {
  const requestId = ++editHighlightRequestId;
  clearEditHighlights();
  const match = location.pathname.match(/^\/team\/location\/[a-f0-9-]{12,36}\/services\/[a-f0-9-]{12,36}\/([^/]+)/i);
  if (!match) return;
  const field = match[1];
  const pagePath = location.pathname.replace(/\/+$/, '');
  const edits = await fetchPageEditNotes(pagePath);
  if (requestId !== editHighlightRequestId) return;
  if (!edits.length) return;
  const target = findEditHighlightTarget(field);
  if (!target) return;
  applyEditHighlights(target, edits);
}
const EDIT_ANIMATION_BUTTON_ID = 'gghost-edit-animation-button';
const EDIT_ANIMATION_OVERLAY_ID = 'gghost-edit-animation-overlay';
function isEditAnimationPath(pathname) {
  return /^\/team\/location\/[a-f0-9-]{12,36}\/services\/[a-f0-9-]{12,36}\/(description|other-info)\/?$/i.test(pathname || '');
}
function findEditAnimationTextarea() {
  return (
    document.querySelector('textarea.TextArea.TextArea-fluid')
    || document.querySelector('textarea.TextArea')
    || document.querySelector('textarea')
  );
}
function coerceEditText(value) {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  try { return JSON.stringify(value, null, 2); } catch { return String(value); }
}
function normalizeEditText(value) {
  return coerceEditText(value).replace(/\s+/g, ' ').trim();
}
function buildEditAnimationStates(edits, currentText) {
  if (!Array.isArray(edits) || !edits.length) return [];
  const sorted = [...edits].sort((a, b) => a.date - b.date);
  const states = [];
  let lastNormalized = null;
  const pushState = (text, meta, phase) => {
    const normalized = normalizeEditText(text);
    if (lastNormalized !== null && normalized === lastNormalized) return;
    states.push({
      text,
      userName: meta?.userName || '',
      date: meta?.date || null,
      summary: meta?.summary || '',
      copyedit: !!meta?.copyedit,
      phase
    });
    lastNormalized = normalized;
  };
  const first = sorted[0];
  if (typeof first.before !== 'undefined') {
    pushState(coerceEditText(first.before), first, 'before');
  }
  sorted.forEach((edit) => {
    if (typeof edit.after === 'undefined' && typeof edit.before === 'undefined') return;
    pushState(coerceEditText(edit.after), edit, 'after');
  });
  const currentValue = coerceEditText(currentText);
  if (lastNormalized === null || normalizeEditText(currentValue) !== lastNormalized) {
    if (currentValue || lastNormalized !== null) {
      states.push({
        text: currentValue,
        userName: '',
        date: null,
        summary: 'Current text',
        copyedit: false,
        phase: 'current'
      });
    }
  }
  return states;
}
function removeEditAnimationOverlay() {
  const existing = document.getElementById(EDIT_ANIMATION_OVERLAY_ID);
  if (existing) existing.remove();
}
function mountEditAnimationOverlay(textarea, states) {
  removeEditAnimationOverlay();
  if (!states.length) return;
  const overlay = document.createElement('div');
  overlay.id = EDIT_ANIMATION_OVERLAY_ID;
  overlay.tabIndex = 0;
  Object.assign(overlay.style, {
    position: 'fixed',
    zIndex: '2147483647',
    display: 'flex',
    flexDirection: 'column',
    boxSizing: 'border-box',
    background: '#ffffff'
  });
  const header = document.createElement('div');
  Object.assign(header.style, {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '12px',
    padding: '6px 8px',
    background: '#111827',
    color: '#f8fafc',
    fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif',
    fontSize: '12px'
  });
  const headerText = document.createElement('div');
  Object.assign(headerText.style, { display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0 });
  const title = document.createElement('div');
  title.style.fontWeight = '600';
  const summary = document.createElement('div');
  summary.style.opacity = '0.9';
  summary.style.whiteSpace = 'nowrap';
  summary.style.textOverflow = 'ellipsis';
  summary.style.overflow = 'hidden';
  const meta = document.createElement('div');
  meta.style.opacity = '0.7';
  meta.style.fontSize = '11px';
  headerText.appendChild(title);
  headerText.appendChild(summary);
  headerText.appendChild(meta);
  const controls = document.createElement('div');
  Object.assign(controls.style, { display: 'flex', alignItems: 'center', gap: '6px' });
  const status = document.createElement('span');
  Object.assign(status.style, { fontSize: '11px', color: '#e2e8f0', minWidth: '52px', textAlign: 'right' });
  const makeButton = (label) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = label;
    Object.assign(btn.style, {
      padding: '4px 8px',
      borderRadius: '6px',
      border: '1px solid rgba(255,255,255,0.2)',
      background: 'transparent',
      color: '#f8fafc',
      cursor: 'pointer',
      fontSize: '11px',
      fontWeight: '600'
    });
    return btn;
  };
  const prevBtn = makeButton('Prev');
  const nextBtn = makeButton('Next');
  const copyBtn = makeButton('Copy');
  const exitBtn = makeButton('Exit');
  controls.appendChild(prevBtn);
  controls.appendChild(nextBtn);
  controls.appendChild(copyBtn);
  controls.appendChild(exitBtn);
  controls.appendChild(status);
  header.appendChild(headerText);
  header.appendChild(controls);
  const display = document.createElement('textarea');
  display.readOnly = true;
  display.spellcheck = false;
  const computed = window.getComputedStyle(textarea);
  Object.assign(display.style, {
    flex: '1',
    width: '100%',
    border: 'none',
    outline: 'none',
    resize: 'none',
    padding: computed.padding,
    fontFamily: computed.fontFamily,
    fontSize: computed.fontSize,
    lineHeight: computed.lineHeight,
    color: computed.color || '#0f172a',
    background: '#ffffff',
    boxSizing: 'border-box',
    overflow: 'auto'
  });
  overlay.appendChild(header);
  overlay.appendChild(display);
  document.body.appendChild(overlay);
  let index = 0;
  let statusTimer = null;
  const setStatus = (text) => {
    status.textContent = text;
    if (statusTimer) clearTimeout(statusTimer);
    if (text) {
      statusTimer = setTimeout(() => {
        status.textContent = '';
      }, 1500);
    }
  };
  const renderState = () => {
    const state = states[index];
    display.value = state.text || '';
    title.textContent = `Edit ${index + 1} of ${states.length}`;
    const summaryText = withCopyeditPrefix(state.summary || 'Edit', state.copyedit);
    summary.textContent = summaryText;
    const phaseLabel = state.phase === 'before'
      ? 'Before edit'
      : state.phase === 'after'
        ? 'After edit'
        : 'Current text';
    const who = state.userName || '';
    const when = state.date ? formatNycDateTime(state.date) : '';
    meta.textContent = [phaseLabel, who, when].filter(Boolean).join(' ? ');
    prevBtn.disabled = index <= 0;
    nextBtn.disabled = index >= states.length - 1;
  };
  const updatePosition = () => {
    if (!document.body.contains(textarea)) {
      cleanup();
      return;
    }
    const rect = textarea.getBoundingClientRect();
    overlay.style.top = `${rect.top}px`;
    overlay.style.left = `${rect.left}px`;
    overlay.style.width = `${rect.width}px`;
    overlay.style.height = `${rect.height}px`;
    overlay.style.border = computed.border;
    overlay.style.borderRadius = computed.borderRadius;
  };
  const cleanup = () => {
    if (statusTimer) clearTimeout(statusTimer);
    window.removeEventListener('scroll', updatePosition, true);
    window.removeEventListener('resize', updatePosition);
    overlay.remove();
    textarea.focus();
  };
  prevBtn.addEventListener('click', () => {
    if (index > 0) {
      index -= 1;
      renderState();
    }
  });
  nextBtn.addEventListener('click', () => {
    if (index < states.length - 1) {
      index += 1;
      renderState();
    }
  });
  copyBtn.addEventListener('click', async () => {
    const text = states[index]?.text || '';
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        display.select();
        document.execCommand('copy');
        display.setSelectionRange(0, 0);
      }
      setStatus('Copied');
    } catch {
      setStatus('Copy failed');
    }
  });
  exitBtn.addEventListener('click', cleanup);
  overlay.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      cleanup();
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      if (index > 0) {
        index -= 1;
        renderState();
      }
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      if (index < states.length - 1) {
        index += 1;
        renderState();
      }
    }
  });
  window.addEventListener('scroll', updatePosition, true);
  window.addEventListener('resize', updatePosition);
  updatePosition();
  renderState();
  overlay.focus();
}
async function startEditAnimation(textarea, pagePath, triggerButton) {
  if (!textarea || !pagePath) return;
  if (triggerButton) {
    triggerButton.disabled = true;
    triggerButton.textContent = 'Loading edits...';
  }
  try {
    const edits = await fetchPageEditNotes(pagePath);
    const states = buildEditAnimationStates(edits, textarea.value);
    if (!states.length) {
      alert('No edit history found for this field yet.');
      return;
    }
    mountEditAnimationOverlay(textarea, states);
  } finally {
    if (triggerButton) {
      triggerButton.disabled = false;
      triggerButton.textContent = 'View edit animation';
    }
  }
}
function ensureEditAnimationButton() {
  const path = location.pathname.replace(/\/+$/, '');
  const buttonWrap = document.getElementById(EDIT_ANIMATION_BUTTON_ID);
  if (!isEditAnimationPath(path)) {
    if (buttonWrap) buttonWrap.remove();
    removeEditAnimationOverlay();
    return;
  }
  const textarea = findEditAnimationTextarea();
  if (!textarea) return;
  if (buttonWrap && buttonWrap.dataset.pagePath === path) return;
  if (buttonWrap) buttonWrap.remove();
  const wrap = document.createElement('div');
  wrap.id = EDIT_ANIMATION_BUTTON_ID;
  wrap.dataset.pagePath = path;
  Object.assign(wrap.style, { display: 'flex', justifyContent: 'flex-end', marginBottom: '6px' });
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.textContent = 'View edit animation';
  Object.assign(btn.style, {
    padding: '6px 10px',
    borderRadius: '8px',
    border: '1px solid #cbd5f5',
    background: '#f8fafc',
    color: '#0f172a',
    fontSize: '12px',
    fontWeight: '600',
    cursor: 'pointer'
  });
  btn.addEventListener('click', () => {
    void startEditAnimation(textarea, path, btn);
  });
  wrap.appendChild(btn);
  textarea.parentElement?.insertBefore(wrap, textarea);
}
function initializeEditAnimation() {
  if (typeof onUrlChange !== 'function') return;
  ensureEditAnimationButton();
  onUrlChange(() => {
    ensureEditAnimationButton();
  });
}
if (window.gghost) {
  window.gghost.initializeEditAnimation = initializeEditAnimation;
}
// Add Edit History button
createButton('Edit History', async () => {
  console.log('[Edit History] 🖱️ Button clicked for UUID:', uuid);
  try {
    let currentUser = null;
    // Try multiple methods to get the username
    try {
      const { accessToken, username: cognitoUsername } = getCognitoTokens();
      currentUser = accessToken ? cognitoUsername : null;
      console.log('[Edit History] Got user from getCognitoTokens:', currentUser);
    } catch (err) {
      console.warn('[Edit History] getCognitoTokens failed:', err);
    }
    // Fallback: try the snackbar method
    if (!currentUser) {
      try {
        if (window.gghostUserName) {
          currentUser = window.gghostUserName;
          console.log('[Edit History] Got user from window.gghostUserName:', currentUser);
        } else if (typeof window.getUserNameSafely === "function") {
          currentUser = await window.getUserNameSafely();
          console.log('[Edit History] Got user from getUserNameSafely:', currentUser);
        }
      } catch (err) {
        console.warn('[Edit History] Fallback username methods failed:', err);
      }
    }
    if (!currentUser) {
      alert('Edit History: Unable to determine your username. Please make sure you are logged in.');
      return;
    }
    await showEditHistoryOverlay(uuid, currentUser);
  } catch (err) {
    console.error('[Edit History] 🛑 Error:', err);
    alert(`Edit History error: ${err.message}`);
  }
});
console.log('[YP Mini] 🔧 Creating YP Mini button for UUID:', uuid);
const ypMiniBtn = createButton('YP Mini', async () => {
console.log('[YP Mini] 🖱️ Button clicked!');
try {
  if (!uuid) {
    console.error('[YP Mini] ❌ UUID is undefined or empty');
    alert('YP Mini: Location UUID not found. Make sure you are on a valid location page.');
    return;
  }
  console.log('[YP Mini] 🔄 Fetching data for UUID:', uuid);
  const apiUrl = `https://w6pkliozjh.execute-api.us-east-1.amazonaws.com/prod/locations/${uuid}`;
  const headers = getAuthHeaders();
  console.log('[YP Mini] 🔑 Using auth headers:', headers);
  void recordLocationInvocation(uuid, "ypMini");
  const res = await fetch(apiUrl, { headers });
  if (!res.ok) {
    console.error('[YP Mini] ❌ API request failed:', res.status, res.statusText);
    const errorText = await res.text();
    console.error('[YP Mini] ❌ Error response:', errorText);
    alert(`YP Mini fetch failed: ${res.status} ${res.statusText}`);
    return;
  }
  const data = await res.json();
  console.log('[YP Mini] ✅ API response:', data);
  // 🟢 record validation timestamp
  await maybeRecordValidation(uuid, data);
  const slug = data.slug;
  const services = data.Services || [];
  if (slug) {
    console.log('[YP Mini] ✅ Found slug:', slug);
    ypMiniBtn.element.style.display = "none"; 
    createYourPeerEmbedWindow(slug, services, () => {
      ypMiniBtn.element.style.display = "block"; 
    });
  } else {
    console.warn('[YP Mini] ❌ Slug not found in response.');
    console.warn('[YP Mini] ❌ Available data keys:', Object.keys(data));
    alert('YP Mini: No slug found for this location. This location may not be available on YourPeer.');
  }
} catch (err) {
  console.error('[YP Mini] 🛑 Error fetching slug:', err);
  console.error('[YP Mini] 🛑 Error details:', err.message, err.stack);
  alert(`YP Mini error: ${err.message}`);
}
});
if (!document.getElementById("gg-note-overlay")) {
  try {
document.getElementById("gg-note-preload")?.remove();
const { accessToken, username: cognitoUsername } = getCognitoTokens();
const userName = accessToken ? cognitoUsername : null;
if (!userName && !location.pathname.startsWith('/find/')) {
  console.warn("[📝 Notes] Username not set. Prompting user to click the extension icon.");
  const banner = document.createElement("div");
  banner.id = "gg-note-username-banner";
  banner.textContent = "Click the extension icon and type your name to enable notes";
  Object.assign(banner.style, {
    position: "fixed",
    top: "80px",
    right: "20px",
    background: "#ffe0e0",
    color: "#800",
    padding: "10px 14px",
    border: "2px solid #f00",
    borderRadius: "6px",
    fontSize: "13px",
    zIndex: 99999,
    boxShadow: "0 2px 6px rgba(0,0,0,0.2)"
  });
  document.body.appendChild(banner);
  setTimeout(() => banner.remove(), 10000);
  return;
}
let data = {};
const cacheEntry = await readNotesCache(uuid);
if (cacheEntry?.data) {
  data = cacheEntry.data;
}
let fetched = false;
if (!cacheEntry || cacheEntry.stale) {
  try {
    const res = await fetch(`${baseURL}locationNotes/${uuid}.json`);
    if (res.ok) {
      data = (await res.json()) || {};
      fetched = true;
    } else if (!cacheEntry?.data) {
      data = {};
    }
  } catch (err) {
    if (!cacheEntry?.data) {
      data = {};
    }
    console.warn("[Notes] Failed to fetch notes data:", err);
  }
}
const notesArray = buildNotesArray(data);
const isFindMode = location.pathname.startsWith('/find/');
const needsAllNotesContent = isFindMode || !userName;
let allNotesContent = "";
if (needsAllNotesContent && notesArray.length > 0) {
  allNotesContent = notesArray.map(n => `${n.user} (${n.date}): ${n.note}`).join("\n\n");
}
if (fetched) {
  void writeNotesCache(uuid, data, notesArray);
}
document.getElementById("gg-note-overlay")?.remove();
document.getElementById("gg-note-wrapper")?.remove();
    const noteBox = document.createElement("div");
    noteBox.id = "gg-note-overlay";
    const isEditable = !isFindMode && !!userName;
noteBox.contentEditable = isEditable ? "true" : "false";
noteBox.dataset.userName = userName || "";
    noteBox.style.pointerEvents = 'auto';
    noteBox.addEventListener("click", () => {
        if (isEditable) {
            noteBox.focus();
        }
    });
    noteBox.style.position = 'fixed';
    noteBox.style.zIndex = 999999; 
    console.log('🧩 Note box added to DOM:', document.getElementById('gg-note-overlay'));
noteBox.style.scrollPaddingBottom = '40px';
    Object.assign(noteBox.style, {
        position: "fixed",
        top: "100px",
        right: "20px",
        width: "300px",
        minHeight: "150px", 
        maxHeight: "400px", 
        background: "#fff",
        border: "2px solid #000",
        borderRadius: "8px",
        padding: "10px",
        fontSize: "14px",
        overflowY: "auto",
        boxShadow: "0 2px 6px rgba(0,0,0,0.2)",
        zIndex: 9999,
        whiteSpace: "pre-wrap",
        cursor: isEditable ? "text" : "default" 
    });
    if (isFindMode || !userName) { 
        noteBox.style.background = "#f9f9f9"; 
        noteBox.style.cursor = "default";
        noteBox.setAttribute("aria-label", "Location notes (Read-only)");
        noteBox.innerText = allNotesContent || "(No notes available for this location)";
        if (!isFindMode && !userName) {
             noteBox.innerText = "(Set a username in the extension popup to add notes)\n\n" + (allNotesContent || "(No notes available for this location)");
        }
    } else { 
        noteBox.style.background = "#e6ffe6"; 
        noteBox.setAttribute("aria-label", "Editable location notes. Previous notes are read-only.");
        const todayKey = typeof today === "string" ? today : new Date().toISOString().slice(0, 10);
        let currentUserNoteForToday = "";
        if (data && data[userName] && data[userName][todayKey]) {
            currentUserNoteForToday = data[userName][todayKey];
        }
const noteWrapper = document.createElement("div");
noteWrapper.id = "gg-note-wrapper";
const savedPos = JSON.parse(localStorage.getItem("ggNotePosition") || "{}");
const defaultTop = 100;
const defaultLeft = 20;
noteWrapper.style.top = `${Math.max(40, savedPos.top || defaultTop)}px`;  
noteWrapper.style.left = `${Math.max(0, savedPos.left || defaultLeft)}px`;
Object.assign(noteWrapper.style, {
  position: "fixed",
  right: "20px",
  width: "320px",
  maxHeight: "500px",
  background: "#fff",
  border: "2px solid #000",
  borderRadius: "8px",
  boxShadow: "0 2px 6px rgba(0,0,0,0.2)",
  fontSize: "14px",
  zIndex: 9999,
  overflow: "hidden",
  display: "flex",
  flexDirection: "column"
});
const dragBar = document.createElement("div");
let orgName = "";
let locationName = "";
const currentUuid = (fullServiceMatch || teamMatch || findMatch)?.[1];
if (currentUuid) {
  try {
    console.log(`[Notes Header] Attempting to fetch details for UUID: ${currentUuid}`);
    const { data } = await fetchFullLocationRecord(currentUuid, { refresh: false });
    if (!data) {
      throw new Error("Location data not available");
    }
    orgName = data.Organization?.name || "";
    locationName = data.name || "";
    if (orgName || locationName) {
      localStorage.setItem("ypLastViewedService", JSON.stringify({
        org: orgName,
        location: locationName,
        uuid: currentUuid
      }));
      console.log(`[Notes Header] Successfully fetched and stored: Org='${orgName}', Location='${locationName}' for UUID='${currentUuid}'`);
    } else {
      console.warn(`[Notes Header] API returned data but orgName or locationName is missing for UUID: ${currentUuid}. Data:`, data);
    }
  } catch (err) {
    console.error(`[Notes Header] 🛑 Failed to fetch details from API for UUID ${currentUuid}:`, err);
    const stored = JSON.parse(localStorage.getItem("ypLastViewedService") || '{}');
    if (stored.uuid === currentUuid) { 
      orgName = stored.org || "";
      locationName = stored.location || "";
      console.log(`[Notes Header] Used fallback localStorage data: Org='${orgName}', Location='${locationName}' for UUID='${currentUuid}'`);
    } else {
      console.warn(`[Notes Header] localStorage data is for a different UUID (stored: ${stored.uuid}, current: ${currentUuid}) or missing.`);
    }
  }
} else {
  console.warn("[Notes Header] UUID is not available. Cannot fetch details.");
  const stored = JSON.parse(localStorage.getItem("ypLastViewedService") || '{}');
}let headerSpan = document.createElement("span");
if (orgName || locationName) {
  headerSpan.textContent = `⋮ ${orgName}${locationName ? ' - ' + locationName : ''}`;
} else {
  headerSpan.textContent = `⋮ notes`;
}
headerSpan.style.userSelect = "none";
headerSpan.style.webkitUserSelect = "none";
dragBar.textContent = ""; // clear before appending
dragBar.style.cursor = "grab";
dragBar.appendChild(headerSpan);
// double-click copy only the header text (not buttons)
headerSpan.addEventListener("dblclick", async (e) => {
  e.stopPropagation();
  e.preventDefault();
  const text = headerSpan.textContent.replace(/^⋮\s*/, "");
  try {
    await navigator.clipboard.writeText(text);
    console.log(`[Notes Header] Copied to clipboard: "${text}"`);
    // Optional feedback
    headerSpan.style.backgroundColor = "#e0ffe0";
    setTimeout(() => headerSpan.style.backgroundColor = "", 300);
  } catch (err) {
    console.error("Clipboard copy failed:", err);
  }
});
// Now append your button separately
const toggleButton = document.createElement("button");
toggleButton.id = "notes-toggle-button";
// Set initial button text based on whether there are linked locations
(async () => {
  const hasLinks = await hasLinkedLocations();
  toggleButton.innerText = hasLinks ? "Show Other Branches" : "Link to other branches";
})();
toggleButton.style.marginLeft = "10px";
toggleButton.style.fontSize = "14px";
toggleButton.style.padding = "5px 10px";
toggleButton.style.border = "2px solid #000";
toggleButton.style.borderRadius = "4px";
toggleButton.style.cursor = "pointer";
toggleButton.addEventListener("click", toggleConnectionMode);
dragBar.appendChild(toggleButton);
Object.assign(dragBar.style, {
  background: "#eee",
  padding: "6px 10px",
  cursor: "grab",
  fontWeight: "bold",
  borderBottom: "1px solid #ccc"
});
noteWrapper.appendChild(dragBar);
const readOnlyDiv = document.createElement("div");
readOnlyDiv.id = "readonly-notes";
Object.assign(readOnlyDiv.style, {
  background: "#f9f9f9",
  padding: "10px",
  overflowY: "auto",
  maxHeight: "200px",
  borderBottom: "1px solid #ccc",
  fontSize: "13px",
  fontStyle: "italic"
});
const renderReadOnlyNotes = (notesToRender) => {
  readOnlyDiv.innerHTML = "";
  if (!Array.isArray(notesToRender) || notesToRender.length === 0) {
    readOnlyDiv.innerHTML = "<i>(No past notes available)</i>";
    return;
  }
  const fragment = document.createDocumentFragment();
  const todayStr = new Date().toISOString().slice(0, 10);
  for (const n of notesToRender) {
    if (n.user === userName && n.date === todayStr && n.note.trim().toLowerCase() !== "revalidated123435355342") {
      continue;
    }
    const container = document.createElement("div");
    container.style.marginBottom = "10px";
    const safeUser = n.user === 'doobneek'
      ? `<a href="http://localhost:3210" target="_blank" rel="noopener noreferrer"><strong>doobneek</strong></a>`
      : `<strong>${escapeHtml(n.user)}</strong>`;
    const displayNote = n.note.trim().toLowerCase() === "revalidated123435355342"
      ? "Revalidated"
      : escapeHtml(n.note).replace(/\n/g, '<br>');  // Escape once and preserve line breaks
    container.innerHTML = `${safeUser} (${n.date}):<br>${displayNote}`;
    const isReminder = n.user === "reminder";
    const isDue = n.date <= todayStr;
    const isDone = /\n?\s*Done by .+$/i.test(n.note.trim());
    if (isReminder && isDue && !isDone) {
      const btn = document.createElement("button");
      btn.textContent = "Done?";
      btn.style.marginTop = "5px";
      btn.addEventListener("click", async () => {
        const updatedNote = `${n.note.trim()}\n\nDone by ${userName}`;
        try {
          const response = await postToNoteAPI({
            uuid,
            date: n.date,
            note: updatedNote,
            userName: "reminder"
          });
          await checkResponse(response, "Marking reminder done");
          btn.textContent = "Thanks!";
          btn.disabled = true;
          btn.style.backgroundColor = "#ccc";
          await refreshReadOnlyNotes();
        } catch (err) {
          console.error("❌ Failed to mark done", err);
          alert("Failed to update reminder.");
        }
      });
      container.appendChild(document.createElement("br"));
      container.appendChild(btn);
    }
    fragment.appendChild(container);
  }
  readOnlyDiv.appendChild(fragment);
};
renderReadOnlyNotes(notesArray);
noteWrapper.appendChild(readOnlyDiv);
const scheduleNotesExtras = () => {
  Promise.resolve()
    .then(() => addValidationHistoryBadge(readOnlyDiv, uuid))
    .catch((err) => console.warn("[Notes] Validation badge failed:", err));
  Promise.resolve()
    .then(() => injectSiteVisitUI({
      parentEl: readOnlyDiv,
      uuid,                       // same uuid you already computed above
      userName,                   // current user (already resolved earlier)
      NOTE_API,                   // "https://us-central1-streetli.cloudfunctions.net/locationNote1"
      today,                       // you already have const today = new Date().toISOString().slice(0, 10);
      done: false
    }))
    .catch((err) => console.warn("[Notes] Site visit UI failed:", err));
};
if (window.requestIdleCallback) {
  window.requestIdleCallback(scheduleNotesExtras, { timeout: 4000 });
} else {
  setTimeout(scheduleNotesExtras, 500);
}
const reminderToggleWrapper = document.createElement("div");
Object.assign(reminderToggleWrapper.style, {
  padding: "10px",
  background: "#f0f0f0",
  borderTop: "1px solid #ccc"
});
const reminderCheckbox = document.createElement("input");
reminderCheckbox.type = "checkbox";
reminderCheckbox.id = "reminder-toggle";
const reminderLabel = document.createElement("label");
reminderLabel.setAttribute("for", "reminder-toggle");
reminderLabel.textContent = " Revisit this location";
reminderLabel.style.marginLeft = "5px";
reminderToggleWrapper.appendChild(reminderCheckbox);
reminderToggleWrapper.appendChild(reminderLabel);
noteWrapper.appendChild(reminderToggleWrapper);
editableDiv.id = "editable-note";
editableDiv.contentEditable = isEditable ? "true" : "false";
editableDiv.innerText =
  currentUserNoteForToday?.trim().toLowerCase() === "revalidated123435355342"
    ? ""
    : currentUserNoteForToday || "";
Object.assign(editableDiv.style, {
  background: isEditable ? "#e6ffe6" : "#f0f0f0",
  padding: "10px",
  flexGrow: 1,
  overflowY: "auto",
  cursor: isEditable ? "text" : "default",
  whiteSpace: "pre-wrap"
});
if (isEditable) {
  editableDiv.setAttribute("role", "textbox");
  editableDiv.setAttribute("tabindex", "0");
  editableDiv.addEventListener("paste", (e) => {
  e.preventDefault();
  const text = e.clipboardData.getData('text/plain');
  const selection = window.getSelection();
  if (!selection.rangeCount) return;
  selection.deleteFromDocument();
  const range = selection.getRangeAt(0);
  const textNode = document.createTextNode(text);
  range.insertNode(textNode);
  range.setStartAfter(textNode);
  range.setEndAfter(textNode);
  selection.removeAllRanges();
  selection.addRange(range);
  editableDiv.dispatchEvent(new Event("input", { bubbles: true }));
});
  let saveTimeout = null;
editableDiv.addEventListener("input", () => {
  clearTimeout(saveTimeout);
  saveTimeout = setTimeout(async () => {
    const note = editableDiv.innerText.trim();
    const currentUserName = getCurrentUsername();
    const payload = {
      uuid,
      date: today,
      note: note || null,
      userName: currentUserName
    };
    try {
      const response = await postToNoteAPI(payload);
      await checkResponse(response, note ? "Saving note" : "Deleting note");
      if (note) {
        void writeNotesPreviewEntry(uuid, { user: currentUserName, date: today, note });
      }
      console.log(note ? `[📝 Saved ${userName}'s note for ${today}]` : `[🗑️ Deleted ${userName}'s note for ${today}]`);
    } catch (err) {
      console.error("[❌ Failed to save/delete note]", err);
      alert(err.message);
    }
  }, 1000);
});
}
noteWrapper.appendChild(editableDiv);
const noteActionWrapper = document.createElement("div");
noteActionWrapper.style.padding = "10px";
noteActionWrapper.style.borderTop = "1px dashed #ccc";
noteActionWrapper.style.display = "flex";
noteActionWrapper.style.justifyContent = "space-between";
const revalidationCode = "revalidated123435355342";
let userNoteForToday = data?.[userName]?.[todayKey] || null;
let isRevalidatedToday = resolveNoteText(userNoteForToday).trim().toLowerCase() === revalidationCode;
const baseForNotes =
  window.gghost?.baseURL ||
  (typeof baseURL !== "undefined" ? baseURL : "https://streetli-default-rtdb.firebaseio.com/");
const applyLiveNoteUpdate = (value) => {
  if (!data || typeof data !== "object") {
    data = {};
  }
  const noteText = resolveNoteText(value);
  if (!data[userName] || typeof data[userName] !== "object") {
    data[userName] = {};
  }
  if (!noteText) {
    delete data[userName][todayKey];
    if (!Object.keys(data[userName]).length) {
      delete data[userName];
    }
  } else {
    data[userName][todayKey] = noteText;
  }
  userNoteForToday = noteText || null;
  isRevalidatedToday = resolveNoteText(userNoteForToday).trim().toLowerCase() === revalidationCode;
  const isFocused = document.activeElement === editableDiv;
  const normalizedForEdit =
    resolveNoteText(userNoteForToday).trim().toLowerCase() === revalidationCode
      ? ""
      : resolveNoteText(userNoteForToday);
  if (!isFocused) {
    const currentText = editableDiv.innerText.trim();
    if (currentText !== normalizedForEdit.trim()) {
      editableDiv.innerText = normalizedForEdit;
    }
  }
  const updatedNotesArray = buildNotesArray(data);
  renderReadOnlyNotes(updatedNotesArray);
  void writeNotesCache(uuid, data, updatedNotesArray);
  toggleRevalidateCheckbox();
  toggleLeftMessageButton();
};
if (userName && uuid) {
  const streamKey = `${uuid}:${userName}:${todayKey}`;
  const existingStream = window.__GG_TODAY_NOTE_STREAM__;
  if (!existingStream || existingStream.key !== streamKey) {
    if (existingStream?.stop) {
      existingStream.stop();
    }
    const stop = startTodayNoteListener({
      baseURL: baseForNotes,
      uuid,
      userName,
      dateKey: todayKey,
      onUpdate: applyLiveNoteUpdate
    });
    if (stop) {
      window.__GG_TODAY_NOTE_STREAM__ = { key: streamKey, stop };
    }
  }
}
// Create the wrapper + checkbox (initially hidden)
const checkboxWrapper = document.createElement("div");
checkboxWrapper.style.padding = "10px";
checkboxWrapper.style.borderTop = "1px dashed #ccc";
checkboxWrapper.style.display = "none"; // start hidden
checkboxWrapper.style.alignItems = "center";
const revalidateCheckbox = document.createElement("input");
revalidateCheckbox.type = "checkbox";
revalidateCheckbox.id = "revalidate-checkbox";
const revalidateLabel = document.createElement("label");
revalidateLabel.setAttribute("for", "revalidate-checkbox");
revalidateLabel.textContent = " Revalidated";
revalidateLabel.style.marginLeft = "8px";
checkboxWrapper.appendChild(revalidateCheckbox);
checkboxWrapper.appendChild(revalidateLabel);
noteWrapper.appendChild(checkboxWrapper);
// Function to refresh readonly notes
async function refreshReadOnlyNotes() {
  try {
    const res = await fetch(`${baseURL}locationNotes/${uuid}.json`);
    const data = (await res.json()) || {};
    const notesArray = buildNotesArray(data);
    renderReadOnlyNotes(notesArray);
    void writeNotesCache(uuid, data, notesArray);
    console.log("[Notes] Refreshed readonly notes");
  } catch (err) {
    console.error("[Notes] Failed to refresh:", err);
  }
}
// Separate wrapper for the utility buttons (always visible)
const utilityButtonsWrapper = document.createElement("div");
utilityButtonsWrapper.style.padding = "10px";
utilityButtonsWrapper.style.borderTop = "1px dashed #ccc";
utilityButtonsWrapper.style.display = "flex";
utilityButtonsWrapper.style.gap = "8px";
utilityButtonsWrapper.style.alignItems = "center";
// "Left a message" button
const leftMessageBtn = document.createElement("button");
leftMessageBtn.textContent = "left a message";
leftMessageBtn.style.padding = "2px 6px";
leftMessageBtn.style.fontSize = "11px";
leftMessageBtn.addEventListener("click", async () => {
  try {
    const currentText = editableDiv.innerText.trim();
    const newText = currentText ? `${currentText} left a message` : "left a message";
    editableDiv.innerText = newText;
    // Save to database
    const today = new Date().toISOString().slice(0, 10);
    const currentUserName = getCurrentUsername();
    await postToNoteAPI({
      uuid,
      date: today,
      note: newText,
      userName: currentUserName
    });
    console.log("[Left Message] Added and saved 'left a message' to note");
    toggleLeftMessageButton(); // Update visibility after adding
    // Refresh notes display
    await refreshReadOnlyNotes();
  } catch (err) {
    console.error("[Left Message] ❌ Failed to save:", err);
    alert("Failed to save note: " + err.message);
  }
});
// "Publish later" button
const publishLaterBtn = document.createElement("button");
publishLaterBtn.textContent = "publish later";
publishLaterBtn.style.padding = "2px 6px";
publishLaterBtn.style.fontSize = "11px";
publishLaterBtn.addEventListener("click", async () => {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const currentUserName = getCurrentUsername();
    const noteContent = editableDiv.innerText.trim();
    // Post revalidated note
    await postToNoteAPI({
      uuid,
      date: today,
      note: revalidationCode,
      userName: currentUserName
    });
    console.log("[Publish Later] Posted revalidated note");
    // Add reminder for today (include note if present)
    let reminderNote = `${currentUserName} has revalidated it and needs to update the frontend with fresh information`;
    if (noteContent) {
      reminderNote += `. Note: "${noteContent}"`;
    }
    await postToNoteAPI({
      uuid,
      date: today,
      note: reminderNote,
      userName: "reminder"
    });
    console.log("[Publish Later] Posted reminder note");
    // Update button text
    publishLaterBtn.textContent = `thanks, ${currentUserName}!`;
    publishLaterBtn.disabled = true;
    // Clear editable div
    editableDiv.innerText = "";
    // Refresh the notes display to show the new reminder
    await refreshReadOnlyNotes();
    // Update publish later button visibility
    await togglePublishLaterButton();
  } catch (err) {
    console.error("❌ Failed to publish later:", err);
    alert("Failed to publish later: " + err.message);
  }
});
utilityButtonsWrapper.appendChild(leftMessageBtn);
utilityButtonsWrapper.appendChild(publishLaterBtn);
noteWrapper.appendChild(utilityButtonsWrapper);
// Function to check if user has revalidated today
async function checkIfRevalidatedToday() {
  try {
    const res = await fetch(`${baseURL}locationNotes/${uuid}.json`);
    const data = (await res.json()) || {};
    const today = new Date().toISOString().slice(0, 10);
    const userNoteForToday = data?.[userName]?.[today] || null;
    const isRevalidated = userNoteForToday?.trim().toLowerCase() === revalidationCode;
    return isRevalidated;
  } catch (err) {
    console.error("[Publish Later] Failed to check revalidation status:", err);
    return false;
  }
}
// Function to toggle "publish later" button visibility
async function togglePublishLaterButton() {
  const isRevalidated = await checkIfRevalidatedToday();
  if (isRevalidated) {
    publishLaterBtn.style.display = "none";
  } else {
    publishLaterBtn.style.display = "inline-block";
  }
}
// Function to toggle "left a message" button visibility
function toggleLeftMessageButton() {
  const currentText = editableDiv.innerText.toLowerCase();
  if (currentText.includes("left a message")) {
    leftMessageBtn.style.display = "none";
  } else {
    leftMessageBtn.style.display = "inline-block";
  }
}
// Initial check for publish later button
togglePublishLaterButton();
// Show/hide dynamically based on editableDiv contents
function toggleRevalidateCheckbox() {
  const noteEmpty = editableDiv.innerText.trim().length === 0;
  const alreadyRevalidated = isRevalidatedToday;
  // Show checkbox only if note is empty AND not already revalidated
  if (noteEmpty && !alreadyRevalidated) {
    checkboxWrapper.style.display = "flex";
  } else {
    checkboxWrapper.style.display = "none";
  }
}
editableDiv.addEventListener("input", () => {
  toggleRevalidateCheckbox();
  toggleLeftMessageButton();
});
toggleRevalidateCheckbox(); // run once at load
toggleLeftMessageButton(); // run once at load
// Save when checked
revalidateCheckbox.addEventListener("change", async () => {
    if (revalidateCheckbox.checked) {
        try {
            const today = new Date().toISOString().slice(0, 10);
            const currentUserName = getCurrentUsername();
            await postToNoteAPI({
                    uuid,
                    date: today,
                    note: revalidationCode,
                    userName: currentUserName
                });
 revalidateLabel.textContent = ` Thanks, ${currentUserName}`;
    revalidateCheckbox.style.display = "none";
                editableDiv.innerText = "";
            // update read-only notes...
            // Update publish later button visibility
            await togglePublishLaterButton();
        } catch (err) {
            console.error("❌ Failed to mark as revalidated:", err);
            revalidateCheckbox.checked = false;
        }
    }
});
const liveTranscribeBtn = document.createElement("button");
liveTranscribeBtn.textContent = "Start Transcribing";
liveTranscribeBtn.style.padding = "6px 12px";
liveTranscribeBtn.style.flex = "1";
liveTranscribeBtn.style.marginRight = "5px";
const aiFormatBtn = document.createElement("button");
aiFormatBtn.textContent = "Format with AI";
aiFormatBtn.style.padding = "6px 12px";
aiFormatBtn.style.flex = "1";
noteActionWrapper.appendChild(liveTranscribeBtn);
noteActionWrapper.appendChild(aiFormatBtn);
noteWrapper.appendChild(noteActionWrapper); 
aiFormatBtn.addEventListener("click", async () => {
  const rawNote = editableDiv.innerText.trim();
  if (!rawNote) {
    alert("Note is empty.");
    return;
  }
  aiFormatBtn.disabled = true;
  aiFormatBtn.textContent = "Formatting...";
  try {
  console.log("[AI Button] Raw note:", rawNote);
const response = await fetch("https://convertnotetostructuredinfo-iygwucy2fa-uc.a.run.app", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ noteText: rawNote })
});
console.log("[AI Button] Received response:", response);
    const data = await response.json();
    console.log("[AI Button] Parsed response JSON:", data);
    if (data.structuredInfo) {
      editableDiv.innerText = data.structuredInfo;
    } else {
      throw new Error(data.error || "No structured info returned");
    }
  } catch (err) {
    alert("doobneek couldn’t format your note with AI:\n" + err.message);
    console.error("[AI Format Error]", err);
  } finally {
    aiFormatBtn.disabled = false;
    aiFormatBtn.textContent = "🧠 Format with AI";
  }
});
if (!recognition && 'webkitSpeechRecognition' in window) {
  initializeSpeechRecognition();
}
liveTranscribeBtn.addEventListener("click", () => {
  if (!recognition) {
    alert("Speech recognition not available.");
    return;
  }
  const editableDiv = document.getElementById("editable-note");
  if (!editableDiv) {
    alert("Editable notes section not found.");
    return;
  }
  if (isRecognizing) {
    recognition.stop();
    liveTranscribeBtn.textContent = "Start Transcribing";
    return;
  }
  recognition.onstart = () => {
    isRecognizing = true;
    liveTranscribeBtn.textContent = "Stop Transcribing";
    console.log("[Live Transcribe] Started.");
  };
  recognition.onend = () => {
    isRecognizing = false;
    liveTranscribeBtn.textContent = "🎤 Start Transcribing";
    console.log("[Live Transcribe] Stopped.");
  };
  recognition.onerror = (event) => {
    isRecognizing = false;
    liveTranscribeBtn.textContent = "🎤 Start Transcribing";
    console.error("[Live Transcribe] Error:", event.error);
  };
  recognition.onresult = (event) => {
    let transcript = "";
    for (let i = event.resultIndex; i < event.results.length; i++) {
      if (event.results[i].isFinal) {
        transcript += event.results[i][0].transcript;
      }
    }
    editableDiv.innerText += (editableDiv.innerText.length > 0 ? " " : "") + transcript;
  };
  try {
    recognition.start();
  } catch (err) {
    console.error("[Live Transcribe] Failed to start:", err);
    alert("Could not start transcription. Try again.");
  }
});
reminderCheckbox.addEventListener("change", () => {
  if (reminderCheckbox.checked) {
    showReminderModal(uuid, NOTE_API);
    reminderCheckbox.checked = false;
  }
});
let isDragging = false, offsetX = 0, offsetY = 0;
dragBar.addEventListener("mousedown", (e) => {
  isDragging = true;
  offsetX = e.clientX - noteWrapper.getBoundingClientRect().left;
  offsetY = e.clientY - noteWrapper.getBoundingClientRect().top;
  e.preventDefault();
});
document.addEventListener("mousemove", (e) => {
  if (!isDragging) return;
  const wrapperRect = noteWrapper.getBoundingClientRect();
  const maxX = window.innerWidth - 40; 
  const maxY = window.innerHeight - 40; 
  const newX = Math.min(Math.max(100, e.clientX - offsetX), maxX);
  const newY = Math.min(Math.max(0, e.clientY - offsetY), maxY);
  noteWrapper.style.left = `${newX}px`;
  noteWrapper.style.top = `${newY}px`;
  localStorage.setItem("ggNotePosition", JSON.stringify({ left: newX, top: newY }));
});
document.addEventListener("mouseup", () => isDragging = false);
document.body.appendChild(noteWrapper);
    }
  } catch (err) {
    console.error("🛑 Failed to load or show editable note:", err);
  }
}
    const pendingUuidSession = sessionStorage.getItem('ypPendingRedirect');
    if (pendingUuidSession && path.startsWith('/find/location/')) { 
      console.log('[YPButton] 🧭 Landed on /find from team with YP intent (clearing pending)');
      sessionStorage.removeItem('ypPendingRedirect');
    }
    return; 
  }
  if (path === '/' || path=== '/find' || path === '/team') {
    const mostOutdatedBtn = createButton('Most outdated page', () => {
      const preloadUrl = "https://yourpeer.nyc/locations?sortBy=recentlyUpdated&page=70";
      window.location.href = preloadUrl;
      const timeout = 10000;
      const observer = new MutationObserver((mutationsList, obs) => {
        const spanParent = document.querySelector("div.flex.items-center.justify-between > div.text-dark.font-medium");
        if (spanParent) {
          const spans = spanParent.querySelectorAll("span");
          if (spans.length === 3) {
            const totalPagesText = spans[2].textContent.trim();
            const totalPages = parseInt(totalPagesText, 10);
            if (!isNaN(totalPages)) {
              obs.disconnect();
              clearTimeout(observerTimeout);
              const finalUrl = `https://yourpeer.nyc/locations?sortBy=recentlyUpdated&page=${totalPages}`;
              if (window.location.href !== finalUrl) {
                window.location.href = finalUrl;
              }
            }
          }
        }
      });
      observer.observe(document.body, { childList: true, subtree: true });
      const observerTimeout = setTimeout(() => {
        observer.disconnect();
        console.warn("⏳ Timeout: Did not find pagination element.");
      }, timeout);
    });
    mostOutdatedBtn.element?.setAttribute('data-most-outdated', 'true');
  }
}
function isGoGettaAreaPath(pathname = location.pathname) {
  return /^\/team\/location\/[0-9a-f-]{12,}\/services\/[0-9a-f-]{12,}\/area\/?$/i.test(pathname);
}
function updateAreaZipOverlayForPath(path) {
  if (!isGoGettaAreaPath(path)) {
    destroyAreaZipOverlay();
    return;
  }
  if (areaZipOverlayState && areaZipOverlayState.path === path) {
    updateAreaZipAvailability(areaZipOverlayState);
    return;
  }
  destroyAreaZipOverlay();
  areaZipOverlayState = createAreaZipOverlay(path);
}
function destroyAreaZipOverlay() {
  if (!areaZipOverlayState) return;
  try {
    areaZipOverlayState.observer?.disconnect?.();
  } catch (err) {
    console.warn('[AreaZipHelper] Failed to disconnect observer:', err);
  }
  try {
    areaZipOverlayState.overlay?.remove?.();
  } catch (err) {
    console.warn('[AreaZipHelper] Failed to remove overlay:', err);
  }
  areaZipOverlayState = null;
}
function createAreaZipOverlay(path) {
  const overlay = document.createElement('div');
  overlay.id = 'gg-area-zip-overlay';
  Object.assign(overlay.style, {
    position: 'fixed',
    top: '92px',
    right: '16px',
    width: '340px',
    maxWidth: 'calc(100% - 32px)',
    background: '#fff',
    border: '1px solid rgba(15, 23, 42, 0.14)',
    borderRadius: '10px',
    boxShadow: '0 16px 40px rgba(15, 23, 42, 0.22)',
    padding: '14px',
    fontFamily: '"Inter", "Segoe UI", system-ui, sans-serif',
    fontSize: '13px',
    lineHeight: '1.4',
    color: '#111',
    zIndex: '2147483000'
  });
  const header = document.createElement('div');
  Object.assign(header.style, {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '8px',
    fontWeight: '600',
    fontSize: '14px'
  });
  const title = document.createElement('span');
  title.textContent = 'Area ZIP assistant';
  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.textContent = '×';
  closeBtn.setAttribute('aria-label', 'Close area ZIP assistant');
  Object.assign(closeBtn.style, {
    border: 'none',
    background: 'transparent',
    fontSize: '18px',
    lineHeight: '1',
    cursor: 'pointer',
    color: '#555',
    padding: '0 4px'
  });
  closeBtn.addEventListener('click', () => destroyAreaZipOverlay());
  header.appendChild(title);
  header.appendChild(closeBtn);
  const textarea = document.createElement('textarea');
  textarea.placeholder = 'Paste your ZIP list or any text with ZIP codes...';
  textarea.rows = 4;
  textarea.spellcheck = false;
  textarea.autocapitalize = 'off';
  textarea.autocomplete = 'off';
  Object.assign(textarea.style, {
    width: '100%',
    minHeight: '88px',
    borderRadius: '6px',
    border: '1px solid #d1d5db',
    padding: '8px',
    fontFamily: 'inherit',
    fontSize: '12px',
    resize: 'vertical',
    boxSizing: 'border-box'
  });
  const helper = document.createElement('div');
  helper.textContent = 'Extracts all 5-digit ZIP codes and skips ones already listed.';
  Object.assign(helper.style, {
    fontSize: '12px',
    color: '#555',
    marginTop: '6px'
  });
  const controls = document.createElement('div');
  Object.assign(controls.style, {
    display: 'flex',
    gap: '8px',
    alignItems: 'center',
    marginTop: '10px'
  });
  const runButton = document.createElement('button');
  runButton.type = 'button';
  runButton.textContent = 'Fill missing ZIPs';
  runButton.disabled = true;
  runButton.dataset.defaultLabel = runButton.textContent;
  Object.assign(runButton.style, {
    flex: '0 0 auto',
    background: '#2563eb',
    color: '#fff',
    border: 'none',
    borderRadius: '6px',
    padding: '8px 12px',
    fontWeight: '600',
    cursor: 'pointer'
  });
  controls.appendChild(runButton);
  const status = document.createElement('div');
  status.textContent = 'Looking for GoGetta area editor...';
  Object.assign(status.style, {
    marginTop: '8px',
    fontSize: '12px',
    color: '#555',
    minHeight: '18px',
    whiteSpace: 'pre-line'
  });
  overlay.appendChild(header);
  overlay.appendChild(textarea);
  overlay.appendChild(helper);
  overlay.appendChild(controls);
  overlay.appendChild(status);
  document.body.appendChild(overlay);
  const state = {
    overlay,
    path,
    textarea,
    runButton,
    statusEl: status,
    running: false,
    lastStatusType: 'auto',
    lastStatusMessage: '',
    lastStatusKind: 'info',
    observer: null,
    contextAvailable: false,
    updateScheduled: false
  };
  runButton.addEventListener('click', () => runAreaZipAutomation(state));
  const observer = new MutationObserver((mutations) => {
    if (areaZipOverlayState !== state) {
      observer.disconnect();
      return;
    }
    const hasRelevantMutation = mutations.some((mutation) => {
      const target = mutation.target;
      if (!target) return false;
      return !state.overlay.contains(target);
    });
    if (!hasRelevantMutation) {
      return;
    }
    if (state.updateScheduled) {
      return;
    }
    state.updateScheduled = true;
    requestAnimationFrame(() => {
      state.updateScheduled = false;
      if (areaZipOverlayState !== state) return;
      updateAreaZipAvailability(state);
    });
  });
  try {
    observer.observe(document.body, { childList: true, subtree: true });
  } catch (err) {
    console.warn('[AreaZipHelper] Failed to observe DOM changes:', err);
  }
  state.observer = observer;
  updateAreaZipAvailability(state);
  return state;
}
function setAreaZipStatus(state, message, type = 'info', source = 'manual') {
  if (!state || !state.statusEl) return;
  if (state.lastStatusMessage === message && state.lastStatusKind === type) {
    state.lastStatusType = source;
    return;
  }
  state.lastStatusMessage = message;
  state.lastStatusKind = type;
  state.statusEl.textContent = message;
  let color = '#374151';
  if (type === 'error') {
    color = '#b42318';
  } else if (type === 'success') {
    color = '#0f9d58';
  }
  state.statusEl.style.color = color;
  state.lastStatusType = source;
}
function updateAreaZipAvailability(state) {
  if (!state || !state.runButton) return;
  const context = getAreaPageContext();
  state.contextAvailable = !!context;
  if (!state.running) {
    state.runButton.disabled = !state.contextAvailable;
  }
  if (state.lastStatusType === 'auto') {
    if (state.contextAvailable) {
      const existing = gatherAreaZipValues(context.container);
      setAreaZipStatus(
        state,
        `Ready. ${existing.size} ZIP${existing.size === 1 ? '' : 's'} detected.`,
        'info',
        'auto'
      );
    } else {
      setAreaZipStatus(
        state,
        'Area editor not detected. Click "NO, LET\'S EDIT IT" so the inputs appear.',
        'info',
        'auto'
      );
    }
  }
}
function parseZipSequences(raw) {
  if (!raw) return [];
  const matches = String(raw).match(/\b\d{5}\b/g);
  if (!matches) return [];
  const seen = new Set();
  const result = [];
  for (const zip of matches) {
    if (!seen.has(zip)) {
      seen.add(zip);
      result.push(zip);
    }
  }
  return result;
}
function getAreaPageContext() {
  const trigger = Array.from(document.querySelectorAll('.addAnotherArea')).find((el) => {
    const text = el?.textContent?.trim().toLowerCase();
    return text && text.includes('add another');
  });
  const addButton = trigger ? trigger.closest('button') : null;
  if (!addButton) return null;
  const container =
    addButton.closest('form') ||
    addButton.closest('[role="dialog"]') ||
    addButton.closest('.Drawer, .drawer') ||
    addButton.closest('.Modal, .modal') ||
    addButton.closest('section') ||
    addButton.closest('main') ||
    addButton.parentElement ||
    document.body;
  return { addButton, container };
}
function gatherAreaZipValues(container) {
  const scope = container || document;
  const inputs = Array.from(scope.querySelectorAll('input.Input-fluid'));
  const zips = new Set();
  for (const input of inputs) {
    if (!input) continue;
    if (input.offsetParent === null) continue;
    const value = (input.value || '').trim();
    if (/^\d{5}$/.test(value)) {
      zips.add(value);
    }
  }
  return zips;
}
function findAreaFinalOkButton(container) {
  const scope = container || document;
  const buttons = Array.from(
    scope.querySelectorAll('button.Button.Button-primary[type="button"]')
  ).filter((btn) => btn.textContent && btn.textContent.trim().toUpperCase() === 'OK');
  if (!buttons.length) return null;
  const preferred = buttons.find(
    (btn) => !btn.classList.contains('mt-3') && !btn.classList.contains('mb-3')
  );
  return preferred || buttons[buttons.length - 1];
}
function isZipInputCandidate(element, areaContainer) {
  if (!element || element.tagName !== 'INPUT') return false;
  if (!element.classList.contains('Input-fluid')) return false;
  if (element.disabled || element.readOnly) return false;
  if (element.offsetParent === null) return false;
  const value = (element.value || '').trim();
  if (value && !/^\d{0,5}$/.test(value)) return false;
  if (areaContainer && areaContainer !== document.body && !areaContainer.contains(element)) {
    const dialog = element.closest('[role="dialog"], .modal, .Modal, .drawer, .Drawer');
    if (!dialog) return false;
  }
  return true;
}
function waitForCondition(predicate, timeout = 4000, interval = 120, description = 'condition') {
  const deadline = Date.now() + timeout;
  return new Promise((resolve, reject) => {
    const tick = () => {
      let result;
      try {
        result = predicate();
      } catch (err) {
        reject(err);
        return;
      }
      if (result) {
        resolve(result);
        return;
      }
      if (Date.now() > deadline) {
        reject(new Error(`Timed out waiting for ${description}`));
        return;
      }
      setTimeout(tick, interval);
    };
    tick();
  });
}
async function addZipToArea(zip, state) {
  if (!zip) return;
  if (areaZipOverlayState !== state) throw new Error('Area ZIP helper closed.');
  const context = getAreaPageContext();
  if (!context) throw new Error('Area editor not available.');
  const { addButton, container } = context;
  if (!addButton) throw new Error('"+ Add another" button not found.');
  addButton.click();
  const input = await waitForCondition(
    () => {
      if (areaZipOverlayState !== state) return null;
      const active = document.activeElement;
      if (isZipInputCandidate(active, container)) return active;
      const candidates = Array.from(document.querySelectorAll('input.Input-fluid')).filter((el) =>
        isZipInputCandidate(el, container)
      );
      return candidates.find((el) => (el.value || '').trim().length === 0) || candidates[0] || null;
    },
    6000,
    120,
    `a ZIP input for ${zip}`
  );
  if (!input) throw new Error(`Could not locate ZIP input for ${zip}.`);
  input.focus();
  input.value = zip;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
  const okButton = await waitForCondition(
    () => {
      if (areaZipOverlayState !== state) return null;
      const buttons = Array.from(
        document.querySelectorAll(
          'button.Button.mt-3.mb-3.Button-primary[type="button"], button.Button.mt-3.mb-3.Button-primary'
        )
      );
      return buttons.find(
        (btn) => btn.offsetParent !== null && btn.textContent && btn.textContent.trim().toUpperCase() === 'OK'
      ) || null;
    },
    5000,
    120,
    `inner OK button for ${zip}`
  );
  if (!okButton) throw new Error(`Could not find inner OK button for ${zip}.`);
  okButton.click();
  await waitForCondition(
    () => {
      if (areaZipOverlayState !== state) return true;
      const updated = getAreaPageContext();
      if (!updated) return false;
      return gatherAreaZipValues(updated.container).has(zip);
    },
    6000,
    150,
    `ZIP ${zip} to appear`
  ).catch(() => {
    console.warn(`[AreaZipHelper] ZIP ${zip} may not have been confirmed yet.`);
  });
}
async function runAreaZipAutomation(state) {
  if (!state || state.running) return;
  const rawInput = state.textarea.value || '';
  const zips = parseZipSequences(rawInput);
  if (!zips.length) {
    setAreaZipStatus(state, 'No 5-digit ZIP codes found in the input.', 'error');
    return;
  }
  const context = getAreaPageContext();
  if (!context) {
    setAreaZipStatus(state, 'Area editor not detected. Click "NO, LET\'S EDIT IT" first.', 'error');
    return;
  }
  state.running = true;
  state.textarea.disabled = true;
  state.runButton.disabled = true;
  state.runButton.textContent = 'Working...';
  try {
    const existing = gatherAreaZipValues(context.container);
    const queue = [];
    const skipped = [];
    for (const zip of zips) {
      if (existing.has(zip)) {
        skipped.push(zip);
      } else {
        queue.push(zip);
      }
    }
    if (skipped.length) {
      console.log('[AreaZipHelper] Skipping existing ZIPs:', skipped.join(', '));
    }
    if (!queue.length) {
      setAreaZipStatus(state, 'All ZIPs already present — nothing to add.', 'success');
      return;
    }
    setAreaZipStatus(
      state,
      `Adding ${queue.length} new ZIP${queue.length === 1 ? '' : 's'}${
        skipped.length ? ` (skipped ${skipped.length})` : ''
      }...`,
      'info'
    );
    for (const zip of queue) {
      if (areaZipOverlayState !== state) throw new Error('Area ZIP helper closed.');
      setAreaZipStatus(state, `Adding ZIP ${zip}...`, 'info');
      await addZipToArea(zip, state);
    }
    const refreshedContext = getAreaPageContext();
    if (refreshedContext) {
      const finalOk = findAreaFinalOkButton(refreshedContext.container);
      if (finalOk) {
        setAreaZipStatus(state, 'Saving ZIP list...', 'info');
        finalOk.click();
        setAreaZipStatus(state, 'ZIPs added and saved.', 'success');
      } else {
        setAreaZipStatus(state, 'ZIPs added, but final OK button not found.', 'error');
      }
    } else {
      setAreaZipStatus(state, 'ZIPs added, but area editor disappeared.', 'error');
    }
  } catch (err) {
    if (err && /helper closed/i.test(err.message || '')) {
      setAreaZipStatus(state, 'ZIP helper closed before completion.', 'info');
    } else {
      console.error('[AreaZipHelper] Failed to add ZIPs:', err);
      setAreaZipStatus(state, err?.message || 'Failed to add ZIPs.', 'error');
    }
  } finally {
    state.running = false;
    state.textarea.disabled = false;
    state.runButton.textContent = state.runButton.dataset.defaultLabel || 'Fill missing ZIPs';
    updateAreaZipAvailability(state);
  }
}
const TEAM_MAP_PINS_DATA_ATTR = 'data-gghost-team-map-pins';
function isGoGettaTeamMapRoot(url = location.href) {
  try {
    const parsed = new URL(url);
    return /(^|\.)gogetta\.nyc$/i.test(parsed.hostname)
      && /^\/team\/?$/.test(parsed.pathname);
  } catch (err) {
    return false;
  }
}
function teamMapPinsBootstrap() {
  if (window.__gghostTeamMapPinsBootstrap) return;
  window.__gghostTeamMapPinsBootstrap = true;
  const API_BASE = 'https://w6pkliozjh.execute-api.us-east-1.amazonaws.com/prod/locations';
  const HOST_RE = /(^|\.)gogetta\.nyc$/i;
  const PATH_RE = /^\/team\/?$/;
  const TYPE_STYLES = {
    default: { color: '#1e88e5', scale: 6 },
    partner: { color: '#fb8c00', scale: 8 },
    closed: { color: '#9e9e9e', scale: 5 }
  };
  const state = {
    active: false,
    map: null,
    markers: new Map(),
    listeners: [],
    pendingTimer: null,
    fetchAbort: null,
    lastRequestKey: null,
    mapPoll: null,
    infoWindow: null
  };
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
    ensureMapsReady().then((ready) => {
      if (!ready || !state.active) return;
      hookMapConstructor();
      const existing = findExistingMap();
      if (existing) {
        attachMap(existing);
        return;
      }
      state.mapPoll = setInterval(() => {
        const map = findExistingMap();
        if (map) {
          clearInterval(state.mapPoll);
          state.mapPoll = null;
          attachMap(map);
        }
      }, 500);
    });
  }
  function stop() {
    state.active = false;
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
  function tryCaptureMap(map) {
    if (!map) return;
    if (window.__gghostTeamMapInstance !== map) {
      window.__gghostTeamMapInstance = map;
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
  function attachMap(map) {
    if (!map || state.map === map) return;
    detachMap();
    state.map = map;
    state.infoWindow = state.infoWindow || new google.maps.InfoWindow();
    state.listeners.push(map.addListener('idle', scheduleFetch));
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
    if (requestKey === state.lastRequestKey) return;
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
      updateMarkers(data);
    } catch (err) {
      if (err && err.name === 'AbortError') return;
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
      if (!marker) {
        marker = new google.maps.Marker({
          map: state.map,
          position,
          icon,
          title
        });
        marker.__gghostLoc = loc;
        marker.addListener('mouseover', () => showInfo(marker));
        marker.addListener('mouseout', () => state.infoWindow && state.infoWindow.close());
        state.markers.set(id, marker);
      } else {
        marker.__gghostLoc = loc;
        marker.setPosition(position);
        marker.setIcon(icon);
        marker.setTitle(title);
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
    const desc = getLocationDescription(loc);
    if (desc) {
      const descEl = document.createElement('div');
      appendMultilineText(descEl, desc);
      wrapper.appendChild(descEl);
    }
    const address = getLocationAddress(loc);
    if (address) {
      const addrEl = document.createElement('div');
      addrEl.style.marginTop = '6px';
      addrEl.style.color = '#555';
      addrEl.textContent = address;
      wrapper.appendChild(addrEl);
    }
    return wrapper;
  }
  function appendMultilineText(node, text) {
    String(text).split(/\r?\n/).forEach((line, index) => {
      if (index > 0) node.appendChild(document.createElement('br'));
      node.appendChild(document.createTextNode(line));
    });
  }
  function getLocationTitle(loc) {
    return loc?.name || loc?.Organization?.name || loc?.slug || '';
  }
  function getLocationDescription(loc) {
    const raw = loc?.description || loc?.additional_info || loc?.Organization?.description || loc?.EventRelatedInfos?.[0]?.information || '';
    return sanitizeText(raw);
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
  function sanitizeText(value) {
    return String(value || '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]*>/g, '')
      .trim();
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
  function getLocationType(loc) {
    if (!loc) return 'default';
    if (loc.closed) return 'closed';
    const raw = loc.locationtype || loc.locationType || loc.location_type || loc.type;
    if (raw) return String(raw).toLowerCase();
    if (loc.Organization && loc.Organization.partners) return 'partner';
    const taxonomy = loc?.Services?.[0]?.Taxonomies?.[0]?.name;
    return taxonomy ? String(taxonomy).toLowerCase() : 'default';
  }
  function buildMarkerIcon(loc) {
    const type = getLocationType(loc);
    let style = TYPE_STYLES[type];
    if (!style) {
      const hash = hashString(type || 'default');
      const hue = Math.abs(hash) % 360;
      style = {
        color: `hsl(${hue}, 70%, 45%)`,
        scale: 6 + (Math.abs(hash) % 3)
      };
    }
    return {
      path: google.maps.SymbolPath.CIRCLE,
      fillColor: style.color,
      fillOpacity: 0.9,
      strokeColor: '#ffffff',
      strokeWeight: 1,
      scale: style.scale
    };
  }
  function hashString(text) {
    let hash = 0;
    for (let i = 0; i < text.length; i += 1) {
      hash = ((hash << 5) - hash) + text.charCodeAt(i);
      hash |= 0;
    }
    return hash;
  }
  function clearMarkers() {
    state.markers.forEach(marker => marker.setMap(null));
    state.markers.clear();
  }
  hookHistory();
  handleLocationChange();
}
function injectTeamMapPinsBootstrap() {
  if (!isGoGettaTeamMapRoot()) return;
  if (!chrome?.runtime?.getURL) return;
  if (document.querySelector(`script[${TEAM_MAP_PINS_DATA_ATTR}]`)) return;
  if (document.documentElement.dataset.gghostTeamMapPinsInjected === 'true') return;
  const script = document.createElement('script');
  script.type = 'text/javascript';
  script.setAttribute(TEAM_MAP_PINS_DATA_ATTR, 'true');
  script.async = true;
  script.src = chrome.runtime.getURL('teamMapPinsPage.js');
  script.onload = () => {
    document.documentElement.dataset.gghostTeamMapPinsInjected = 'true';
    script.remove();
  };
  script.onerror = () => {
    script.remove();
  };
  (document.head || document.documentElement).appendChild(script);
}
function initializeTeamMapPins() {
  injectTeamMapPinsBootstrap();
  onUrlChange((newUrl) => {
    injectTeamMapPinsBootstrap();
  });
}
function initializeEditHighlights() {
  const updateFn = typeof updateEditHighlightsForCurrentPage === 'function'
    ? updateEditHighlightsForCurrentPage
    : null;
  if (!updateFn) return;
  updateFn();
  onUrlChange(() => {
    updateFn();
  });
}
async function initializeGoGettaEnhancements() {
  initializeTeamMapPins();
  initializeEditHighlights();
  const editAnimationInit = window.gghost?.initializeEditAnimation
    || (typeof initializeEditAnimation === 'function' ? initializeEditAnimation : null);
  if (typeof editAnimationInit === 'function') {
    editAnimationInit();
  }
  installServiceTaxonomyOverlayBridge();
  setupServiceApiMonitor();
  setupServiceLoadMonitor();
  void updateLocationTitleAndVisit();
  await injectGoGettaButtons();
  updateEditablePlaceholder() 
  onUrlChange((newUrl) => {
    setupServiceLoadMonitor();
    injectGoGettaButtons(); 
    updateEditablePlaceholder()
    void updateLocationTitleAndVisit(newUrl);
  });
}
const SERVICE_LOAD_MONITOR_BUTTON_ID = 'gghost-service-load-monitor';
const SERVICE_LOAD_TEXT = 'loading service data';
const SERVICE_LOAD_BUTTON_DELAY_MS = 4000;
const SERVICE_LOAD_ERROR_WAIT_MS = 2000;
const SERVICE_LOAD_RELOAD_COOLDOWN_MS = 2000;
const SERVICE_LOAD_API_CHECK_INTERVAL_MS = 4000;
const SERVICE_LOAD_API_TIMEOUT_MS = 8000;
const SERVICE_LOAD_API_CHECK_ENABLED = false;
const SERVICE_LOAD_AUTO_RETRY_ENABLED = false;
const SERVICE_LOAD_ERROR_LABEL_RETRY_ENABLED = true;
const SERVICE_LOAD_PERSISTENT_MONITOR = true;
const SERVICE_LOAD_SNAKE_GAME_SIZE = 240;
const SERVICE_LOAD_SNAKE_CELL = 12;
const SERVICE_LOAD_SNAKE_SPEED_MS = 120;
const SERVICE_LOAD_SNAKE_FOCUS_STORAGE_PREFIX = 'gghost-service-load-monitor-snake-focus:';
const SERVICE_LOAD_PROBLEM_STABLE_MS = 1000;
const SERVICE_LOAD_RECOVERY_STABLE_MS = 1000;
const SERVICE_LOAD_USER_IDLE_BEFORE_BEEP_MS = 1000;
const SERVICE_LOAD_FORCE_TRIGGER_MS = 15000;
const SERVICE_LOAD_MONITOR_STORAGE_PREFIX = 'gghost-service-load-monitor-state:';
const SERVICE_LOAD_MONITOR_TAB_KEY_STORAGE = 'gghost-service-load-monitor-tab-key';
const SERVICE_LOAD_MONITOR_TTL_MS = 12 * 60 * 60 * 1000;
let serviceLoadMonitorState = null;
function isGoGettaTeamLocationUrl(url = location.href) {
  return /^https:\/\/gogetta\.nyc\/team\/location\/[a-f0-9-]+(\/|$)/i.test(url);
}
function getGoGettaTeamLocationUuid(url = location.pathname) {
  const match = url.match(/\/team\/location\/([a-f0-9-]{12,36})/i);
  return match ? match[1] : null;
}
function extractLocationUuidFromApiUrl(url) {
  if (!url) return null;
  const match = String(url).match(/\/prod\/locations\/([a-f0-9-]+)/i);
  return match ? match[1] : null;
}
function getServiceLoadMonitorTabKey() {
  try {
    let tabKey = sessionStorage.getItem(SERVICE_LOAD_MONITOR_TAB_KEY_STORAGE);
    if (!tabKey) {
      tabKey = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
      sessionStorage.setItem(SERVICE_LOAD_MONITOR_TAB_KEY_STORAGE, tabKey);
    }
    return tabKey;
  } catch (err) {
    return `fallback-${Date.now().toString(36)}`;
  }
}
function getServiceLoadMonitorStorageKey(tabKey) {
  return `${SERVICE_LOAD_MONITOR_STORAGE_PREFIX}${tabKey}`;
}
function readServiceLoadMonitorStorage(tabKey) {
  try {
    const raw = localStorage.getItem(getServiceLoadMonitorStorageKey(tabKey));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed;
  } catch (err) {
    console.warn('[ServiceLoadMonitor] Failed to read persisted state:', err);
    return null;
  }
}
function writeServiceLoadMonitorStorage(tabKey, payload) {
  try {
    localStorage.setItem(getServiceLoadMonitorStorageKey(tabKey), JSON.stringify(payload));
  } catch (err) {
    console.warn('[ServiceLoadMonitor] Failed to persist state:', err);
  }
}
function clearServiceLoadMonitorStorage(tabKey) {
  try {
    localStorage.removeItem(getServiceLoadMonitorStorageKey(tabKey));
  } catch (err) {
    console.warn('[ServiceLoadMonitor] Failed to clear persisted state:', err);
  }
}
function cleanupServiceLoadMonitorStorage() {
  try {
    const now = Date.now();
    for (let i = localStorage.length - 1; i >= 0; i -= 1) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith(SERVICE_LOAD_MONITOR_STORAGE_PREFIX)) continue;
      try {
        const parsed = JSON.parse(localStorage.getItem(key) || '{}');
        const updatedAt = Number(parsed.updatedAt || 0);
        if (!updatedAt || now - updatedAt > SERVICE_LOAD_MONITOR_TTL_MS) {
          localStorage.removeItem(key);
        }
      } catch (err) {
        localStorage.removeItem(key);
      }
    }
  } catch (err) {
    console.warn('[ServiceLoadMonitor] Failed to cleanup persisted state:', err);
  }
}
function getServiceLoadMonitorSnakeFocusKey(tabKey) {
  return `${SERVICE_LOAD_SNAKE_FOCUS_STORAGE_PREFIX}${tabKey}`;
}
function readServiceLoadMonitorSnakeFocus(tabKey) {
  try {
    return localStorage.getItem(getServiceLoadMonitorSnakeFocusKey(tabKey)) === 'true';
  } catch (err) {
    return false;
  }
}
function writeServiceLoadMonitorSnakeFocus(tabKey, shouldFocus) {
  try {
    const key = getServiceLoadMonitorSnakeFocusKey(tabKey);
    if (shouldFocus) {
      localStorage.setItem(key, 'true');
    } else {
      localStorage.removeItem(key);
    }
  } catch (err) {
    console.warn('[ServiceLoadMonitor] Failed to persist snake focus:', err);
  }
}
function findLoadingServiceNode() {
  const xpath = `//*[contains(translate(normalize-space(.),'ABCDEFGHIJKLMNOPQRSTUVWXYZ','abcdefghijklmnopqrstuvwxyz'),'${SERVICE_LOAD_TEXT}')]`;
  return document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
}
function isLoadingServiceVisible() {
  const node = findLoadingServiceNode();
  if (!node) return false;
  const style = window.getComputedStyle(node);
  if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
    return false;
  }
  return node.getClientRects().length > 0;
}
function isNetworkErrorScreen() {
  const errorLabel = document.querySelector('.ErrorLabel');
  if (!errorLabel) return false;
  const text = (errorLabel.textContent || '').toLowerCase();
  return text.includes('network error') || !!errorLabel.querySelector('button.default');
}
function hasProgressZeroIndicator() {
  const textNode = document.querySelector('.ProgressBarText');
  if (textNode && /progress\s*0\s*\/\s*7/i.test(textNode.textContent || '')) {
    return true;
  }
  const bar = document.querySelector('.ProgressBarValue');
  if (bar && bar.style && bar.style.right) {
    const right = bar.style.right.trim();
    if (right === '100%' || right === '100.0%') {
      return true;
    }
  }
  return false;
}
function isProgressIndicatorVisible() {
  const bar = document.querySelector('.ProgressBar');
  if (bar && bar.getClientRects().length > 0) {
    return true;
  }
  const textNode = document.querySelector('.ProgressBarText');
  if (textNode && textNode.getClientRects().length > 0) {
    return true;
  }
  const valueNode = document.querySelector('.ProgressBarValue');
  if (valueNode && valueNode.getClientRects().length > 0) {
    return true;
  }
  return false;
}
function isRootBlankScreen() {
  const root = document.getElementById('root');
  if (!root) return false;
  const text = (root.textContent || '').replace(/\s+/g, '');
  if (text.length > 0) return false;
  const visibleNodes = Array.from(root.querySelectorAll('*')).some((el) => {
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
      return false;
    }
    return el.getClientRects().length > 0;
  });
  return !visibleNodes;
}
function matchesServiceLoadFetchError(args) {
  const parts = args.map((arg) => {
    if (typeof arg === 'string') return arg;
    if (arg && typeof arg.message === 'string') return arg.message;
    try {
      return JSON.stringify(arg);
    } catch {
      return String(arg);
    }
  });
  const text = parts.join(' ').toLowerCase();
  if (!text.includes('failed to fetch')) return false;
  if (text.includes('notes header')) return true;
  if (text.includes('service taxonomy')) return true;
  if (text.includes('failed to fetch location record')) return true;
  return false;
}
async function hasSensibleLocationResponse() {
  if (!isGoGettaTeamLocationUrl()) return false;
  const uuid = getGoGettaTeamLocationUuid();
  if (!uuid) return false;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), SERVICE_LOAD_API_TIMEOUT_MS);
  try {
    const headers = typeof getAuthHeaders === 'function' ? getAuthHeaders() : { 'Content-Type': 'application/json' };
    void recordLocationInvocation(uuid, "serviceLoadMonitorApiCheck");
    const res = await fetch(`https://w6pkliozjh.execute-api.us-east-1.amazonaws.com/prod/locations/${uuid}`, {
      headers,
      signal: controller.signal
    });
    if (!res.ok) return false;
    const data = await res.json();
    const id = (data?.id || '').toString().toLowerCase();
    if (!id || id !== uuid.toLowerCase()) return false;
    return true;
  } catch (err) {
    if (err && err.name !== 'AbortError') {
      console.warn('[ServiceLoadMonitor] API check failed:', err);
    }
    return false;
  } finally {
    clearTimeout(timeoutId);
  }
}
function playBeep() {
  try {
    const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextCtor) return;
    const ctx = new AudioContextCtor();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 880;
    gain.gain.value = 0.08;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.25);
    osc.onended = () => {
      ctx.close();
    };
  } catch (err) {
    console.warn('[ServiceLoadMonitor] Beep failed:', err);
  }
}
function setupServiceLoadMonitor() {
  if (serviceLoadMonitorState) return;
  const tabKey = getServiceLoadMonitorTabKey();
  const storageKey = getServiceLoadMonitorStorageKey(tabKey);
  const state = {
    active: false,
    button: null,
    loadingTimer: null,
    observer: null,
    awaitingLoading: false,
    awaitingLoadingGone: false,
    awaitingErrorAfterLoad: false,
    errorAfterLoadTimer: null,
    lastReloadAt: 0,
    progressBeeped: false,
    apiCheckTimer: null,
    apiCheckInFlight: false,
    forceOfferUntil: 0,
    tabKey,
    storageKey,
    persistedUuid: null,
    pendingReload: false,
    initialApiCheckDone: false,
    hadProblem: false,
    beepArmed: false,
    lastProblemVisible: false,
    problemSince: null,
    recoverySince: null,
    lastPointerMoveAt: 0,
    tabWasHidden: false,
    beepRetryTimer: null,
    wrapper: null,
    snakeCleanup: null,
    snakeFocusKey: getServiceLoadMonitorSnakeFocusKey(tabKey)
  };
  serviceLoadMonitorState = state;
  cleanupServiceLoadMonitorStorage();
  let checkScheduled = false;
  const scheduleMonitorCheck = (delayMs = 0) => {
    if (delayMs > 0) {
      setTimeout(() => scheduleMonitorCheck(0), delayMs);
      return;
    }
    if (checkScheduled) return;
    checkScheduled = true;
    const run = () => {
      checkScheduled = false;
      checkMonitorState();
    };
    if (window.requestIdleCallback) {
      window.requestIdleCallback(run, { timeout: 2000 });
    } else {
      setTimeout(run, 200);
    }
  };
  const clearLoadingTimer = () => {
    if (state.loadingTimer) {
      clearTimeout(state.loadingTimer);
      state.loadingTimer = null;
    }
  };
  const clearApiCheckTimer = () => {
    if (state.apiCheckTimer) {
      clearTimeout(state.apiCheckTimer);
      state.apiCheckTimer = null;
    }
  };
  const clearBeepRetryTimer = () => {
    if (state.beepRetryTimer) {
      clearTimeout(state.beepRetryTimer);
      state.beepRetryTimer = null;
    }
  };
  const scheduleBeepRetry = (delayMs) => {
    if (state.beepRetryTimer) return;
    state.beepRetryTimer = setTimeout(() => {
      state.beepRetryTimer = null;
      scheduleMonitorCheck();
    }, delayMs);
  };
  const clearErrorAfterLoadTimer = () => {
    if (state.errorAfterLoadTimer) {
      clearTimeout(state.errorAfterLoadTimer);
      state.errorAfterLoadTimer = null;
    }
  };
  const removeButton = () => {
    if (state.snakeCleanup) {
      state.snakeCleanup();
      state.snakeCleanup = null;
    }
    if (state.wrapper) {
      state.wrapper.remove();
      state.wrapper = null;
      state.button = null;
      return;
    }
    if (state.button) {
      state.button.remove();
      state.button = null;
    }
  };
  const persistMonitorState = (isActive, pendingReload = false) => {
    if (!state.tabKey || !state.storageKey) return;
    if (!isActive) {
      state.persistedUuid = null;
      state.pendingReload = false;
      clearServiceLoadMonitorStorage(state.tabKey);
      return;
    }
    const uuid = getGoGettaTeamLocationUuid();
    if (!uuid) {
      state.persistedUuid = null;
      state.pendingReload = false;
      clearServiceLoadMonitorStorage(state.tabKey);
      return;
    }
    state.persistedUuid = uuid;
    state.pendingReload = !!pendingReload;
    writeServiceLoadMonitorStorage(state.tabKey, {
      tabId: state.tabKey,
      uuid,
      active: true,
      pendingReload: state.pendingReload,
      updatedAt: Date.now()
    });
  };
  const updateButtonLabel = () => {
    if (!state.button) return;
    state.button.textContent = state.active ? 'Stop Monitoring' : 'Notify me when the app starts working';
  };
  const startSnakeGame = (container) => {
    if (!container) return null;
    const canvas = document.createElement('canvas');
    canvas.width = SERVICE_LOAD_SNAKE_GAME_SIZE;
    canvas.height = SERVICE_LOAD_SNAKE_GAME_SIZE;
    Object.assign(canvas.style, {
      border: '1px solid #000',
      borderRadius: '6px',
      background: '#111',
      display: 'block'
    });
    const label = document.createElement('div');
    label.textContent = 'doobneek Inc Snake (click to control)';
    Object.assign(label.style, {
      fontSize: '12px',
      fontWeight: '600',
      color: '#111',
      textAlign: 'center'
    });
    const wrap = document.createElement('div');
    Object.assign(wrap.style, {
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: '6px'
    });
    wrap.appendChild(label);
    wrap.appendChild(canvas);
    container.appendChild(wrap);
    const ctx = canvas.getContext('2d');
    const gridSize = Math.floor(SERVICE_LOAD_SNAKE_GAME_SIZE / SERVICE_LOAD_SNAKE_CELL);
    let direction = { x: 1, y: 0 };
    let nextDirection = { x: 1, y: 0 };
    let snake = [{ x: 6, y: 6 }, { x: 5, y: 6 }, { x: 4, y: 6 }];
    let food = { x: 10, y: 10 };
    let tick = 0;
    let focused = readServiceLoadMonitorSnakeFocus(state.tabKey);
    const randomCell = () => Math.floor(Math.random() * gridSize);
    const placeFood = () => {
      let tries = 0;
      while (tries < 100) {
        const candidate = { x: randomCell(), y: randomCell() };
        if (!snake.some((seg) => seg.x === candidate.x && seg.y === candidate.y)) {
          food = candidate;
          return;
        }
        tries += 1;
      }
    };
    const resetGame = () => {
      direction = { x: 1, y: 0 };
      nextDirection = { x: 1, y: 0 };
      snake = [{ x: 6, y: 6 }, { x: 5, y: 6 }, { x: 4, y: 6 }];
      placeFood();
    };
    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#111';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#f5f5f5';
      ctx.fillRect(
        food.x * SERVICE_LOAD_SNAKE_CELL,
        food.y * SERVICE_LOAD_SNAKE_CELL,
        SERVICE_LOAD_SNAKE_CELL,
        SERVICE_LOAD_SNAKE_CELL
      );
      const baseHue = (tick * 6) % 360;
      snake.forEach((seg, idx) => {
        const hue = (baseHue + idx * 18) % 360;
        ctx.fillStyle = `hsl(${hue}, 90%, 60%)`;
        ctx.fillRect(
          seg.x * SERVICE_LOAD_SNAKE_CELL,
          seg.y * SERVICE_LOAD_SNAKE_CELL,
          SERVICE_LOAD_SNAKE_CELL - 1,
          SERVICE_LOAD_SNAKE_CELL - 1
        );
      });
    };
    const step = () => {
      direction = nextDirection;
      const head = { x: snake[0].x + direction.x, y: snake[0].y + direction.y };
      if (head.x < 0 || head.y < 0 || head.x >= gridSize || head.y >= gridSize) {
        resetGame();
        return;
      }
      if (snake.some((seg) => seg.x === head.x && seg.y === head.y)) {
        resetGame();
        return;
      }
      snake.unshift(head);
      if (head.x === food.x && head.y === food.y) {
        placeFood();
      } else {
        snake.pop();
      }
    };
    const loop = () => {
      tick += 1;
      step();
      draw();
    };
    const intervalId = setInterval(loop, SERVICE_LOAD_SNAKE_SPEED_MS);
    const handleKeyDown = (event) => {
      if (!focused) return;
      const activeTag = document.activeElement?.tagName;
      if (activeTag === 'INPUT' || activeTag === 'TEXTAREA' || document.activeElement?.isContentEditable) {
        return;
      }
      switch (event.key) {
        case 'ArrowUp':
          if (direction.y === 0) nextDirection = { x: 0, y: -1 };
          event.preventDefault();
          break;
        case 'ArrowDown':
          if (direction.y === 0) nextDirection = { x: 0, y: 1 };
          event.preventDefault();
          break;
        case 'ArrowLeft':
          if (direction.x === 0) nextDirection = { x: -1, y: 0 };
          event.preventDefault();
          break;
        case 'ArrowRight':
          if (direction.x === 0) nextDirection = { x: 1, y: 0 };
          event.preventDefault();
          break;
        default:
          break;
      }
    };
    const handleFocus = (event) => {
      if (canvas.contains(event.target)) {
        focused = true;
        writeServiceLoadMonitorSnakeFocus(state.tabKey, true);
      }
    };
    window.addEventListener('keydown', handleKeyDown, { capture: true });
    document.addEventListener('pointerdown', handleFocus);
    canvas.addEventListener('pointerdown', () => {
      focused = true;
      writeServiceLoadMonitorSnakeFocus(state.tabKey, true);
    });
    draw();
    return () => {
      clearInterval(intervalId);
      window.removeEventListener('keydown', handleKeyDown, { capture: true });
      document.removeEventListener('pointerdown', handleFocus);
      wrap.remove();
    };
  };
  const showButton = () => {
    if (state.button) return;
    const wrapper = document.createElement('div');
    Object.assign(wrapper.style, {
      position: 'fixed',
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
      zIndex: '10001',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: '12px',
      pointerEvents: 'auto'
    });
    const button = document.createElement('button');
    button.id = SERVICE_LOAD_MONITOR_BUTTON_ID;
    button.type = 'button';
    button.textContent = 'Notify me when the app starts working';
    Object.assign(button.style, {
      padding: '16px 28px',
      fontSize: '18px',
      fontWeight: '600',
      borderRadius: '12px',
      border: '2px solid #000',
      background: '#fff',
      cursor: 'pointer',
      boxShadow: '0 8px 20px rgba(0,0,0,0.25)'
    });
    button.addEventListener('click', () => {
      if (state.active) {
        stopMonitor(false);
      } else {
        startMonitor();
      }
    });
    wrapper.appendChild(button);
    document.body.appendChild(wrapper);
    state.button = button;
    state.wrapper = wrapper;
    updateButtonLabel();
    if (!state.snakeCleanup) {
      state.snakeCleanup = startSnakeGame(wrapper);
    }
  };
  const triggerMonitorOffer = () => {
    state.forceOfferUntil = Date.now() + SERVICE_LOAD_FORCE_TRIGGER_MS;
    clearLoadingTimer();
    showButton();
  };
  const stopMonitor = (shouldBeep) => {
    const shouldPlayBeep = shouldBeep && state.beepArmed;
    state.active = false;
    state.awaitingLoading = false;
    state.awaitingLoadingGone = false;
    state.awaitingErrorAfterLoad = false;
    state.progressBeeped = false;
    state.apiCheckInFlight = false;
    state.forceOfferUntil = 0;
    state.pendingReload = false;
    state.beepArmed = false;
    state.hadProblem = false;
    state.lastProblemVisible = false;
    state.problemSince = null;
    state.recoverySince = null;
    state.tabWasHidden = false;
    clearBeepRetryTimer();
    writeServiceLoadMonitorSnakeFocus(state.tabKey, false);
    clearErrorAfterLoadTimer();
    clearApiCheckTimer();
    updateButtonLabel();
    persistMonitorState(false);
    if (shouldPlayBeep) {
      if (tryPlayBeep()) {
        state.beepArmed = false;
      }
    }
    if (!isLoadingServiceVisible()) {
      removeButton();
    }
  };
  const scheduleApiCheck = () => {
    if (!SERVICE_LOAD_API_CHECK_ENABLED) return;
    if (!state.active || state.apiCheckTimer || state.apiCheckInFlight) return;
    state.apiCheckTimer = setTimeout(async () => {
      state.apiCheckTimer = null;
      if (!state.active) return;
      if (!isGoGettaTeamLocationUrl()) return;
      state.apiCheckInFlight = true;
      const ok = await hasSensibleLocationResponse();
      state.apiCheckInFlight = false;
      if (!state.active) return;
      if (ok) {
        stopMonitor(true);
        return;
      }
      const loadingVisible = isLoadingServiceVisible();
      const errorVisible = isNetworkErrorScreen();
      if (!loadingVisible && !errorVisible) {
        triggerReload();
        return;
      }
      scheduleApiCheck();
    }, SERVICE_LOAD_API_CHECK_INTERVAL_MS);
  };
  const startMonitor = () => {
    state.active = true;
    state.pendingReload = false;
    state.beepArmed = false;
    state.awaitingLoading = false;
    state.awaitingLoadingGone = false;
    state.awaitingErrorAfterLoad = false;
    state.progressBeeped = false;
    state.hadProblem = false;
    state.lastProblemVisible = false;
    state.problemSince = null;
    state.recoverySince = null;
    state.tabWasHidden = false;
    clearBeepRetryTimer();
    clearErrorAfterLoadTimer();
    showButton();
    updateButtonLabel();
    persistMonitorState(true, false);
    scheduleApiCheck();
    const now = Date.now();
    const loadingVisible = isLoadingServiceVisible();
    const errorVisible = isNetworkErrorScreen();
    const blankScreen = isRootBlankScreen();
    const initialProblem = loadingVisible || errorVisible || blankScreen;
    const forceOfferActive = state.forceOfferUntil && now < state.forceOfferUntil;
    if (initialProblem || forceOfferActive) {
      state.hadProblem = true;
      state.beepArmed = true;
      state.problemSince = initialProblem ? now : null;
    }
    if (errorVisible) {
      triggerReload();
      return;
    }
    if (loadingVisible) {
      state.awaitingLoading = false;
      state.awaitingLoadingGone = true;
    } else {
      state.awaitingLoading = true;
    }
  };
  const startErrorAfterLoadTimer = () => {
    clearErrorAfterLoadTimer();
    state.errorAfterLoadTimer = setTimeout(() => {
      if (!state.active) return;
      if (!isNetworkErrorScreen()) {
        stopMonitor(true);
      }
    }, SERVICE_LOAD_ERROR_WAIT_MS);
  };
  const triggerReload = (forceReload = false) => {
    if (!SERVICE_LOAD_AUTO_RETRY_ENABLED && !forceReload) {
      state.awaitingLoading = true;
      state.awaitingLoadingGone = false;
      state.awaitingErrorAfterLoad = false;
      return;
    }
    const now = Date.now();
    if (now - state.lastReloadAt < SERVICE_LOAD_RELOAD_COOLDOWN_MS) return;
    state.lastReloadAt = now;
    state.awaitingLoading = true;
    state.awaitingLoadingGone = false;
    state.awaitingErrorAfterLoad = false;
    clearErrorAfterLoadTimer();
    state.pendingReload = true;
    persistMonitorState(true, true);
    if (state.active) {
      location.reload(true);
    } else {
    if (state.active) {
      location.reload(true);
    } else {
      location.reload();
    }
    }
  };
  const scheduleButtonIfNeeded = (shouldOfferMonitor) => {
    if (!shouldOfferMonitor) {
      clearLoadingTimer();
      removeButton();
      return;
    }
    if (state.active) {
      showButton();
      return;
    }
    if (state.button) return;
    if (state.loadingTimer) return;
    state.loadingTimer = setTimeout(() => {
      state.loadingTimer = null;
      if (isGoGettaTeamLocationUrl() && isLoadingServiceVisible()) {
        showButton();
      }
    }, SERVICE_LOAD_BUTTON_DELAY_MS);
  };
  const checkMonitorState = () => {
    if (!isGoGettaTeamLocationUrl()) {
      clearLoadingTimer();
      if (state.active) {
        stopMonitor(false);
      } else {
        persistMonitorState(false);
      }
      removeButton();
      return;
    }
    const currentUuid = getGoGettaTeamLocationUuid();
    if (state.persistedUuid && currentUuid &&
      state.persistedUuid.toLowerCase() !== currentUuid.toLowerCase()) {
      stopMonitor(false);
      persistMonitorState(false);
      removeButton();
      return;
    }
    const loadingVisible = isLoadingServiceVisible();
    const errorVisible = isNetworkErrorScreen();
    const progressVisible = isProgressIndicatorVisible();
    const blankScreen = isRootBlankScreen();
    const now = Date.now();
    const wasProblemVisible = state.lastProblemVisible;
    const forceOfferActive = state.forceOfferUntil && now < state.forceOfferUntil;
    if (progressVisible) {
      clearLoadingTimer();
      removeButton();
      state.problemSince = null;
      if (state.hadProblem && !state.recoverySince) {
        state.recoverySince = now;
      }
      if (state.hadProblem && state.recoverySince && now - state.recoverySince >= SERVICE_LOAD_RECOVERY_STABLE_MS) {
        if (state.active && state.hadProblem && state.beepArmed) {
          if (tryPlayBeep()) {
            state.beepArmed = false;
          }
        }
        state.hadProblem = false;
        state.recoverySince = null;
        if (!SERVICE_LOAD_PERSISTENT_MONITOR && state.active) {
          stopMonitor(false);
        }
      }
      state.lastProblemVisible = false;
      return;
    }
    const problemVisible = loadingVisible || errorVisible || blankScreen;
    if (problemVisible) {
      state.recoverySince = null;
      if (!wasProblemVisible) {
        state.problemSince = now;
      }
      if (state.problemSince && now - state.problemSince >= SERVICE_LOAD_PROBLEM_STABLE_MS && !state.hadProblem) {
        state.hadProblem = true;
        state.beepArmed = true;
      }
    } else {
      state.problemSince = null;
    }
    state.lastProblemVisible = problemVisible;
    if (forceOfferActive && state.active && !state.hadProblem) {
      state.hadProblem = true;
      state.beepArmed = true;
    }
    const shouldOfferMonitor = problemVisible || forceOfferActive;
    scheduleButtonIfNeeded(shouldOfferMonitor);
    if (!state.active) return;
    scheduleApiCheck();
    if (!problemVisible) {
      if (state.hadProblem && !state.recoverySince) {
        state.recoverySince = now;
      }
      if (state.hadProblem && state.recoverySince && now - state.recoverySince >= SERVICE_LOAD_RECOVERY_STABLE_MS) {
        if (state.active && state.hadProblem && state.beepArmed) {
          if (tryPlayBeep()) {
            state.beepArmed = false;
          }
        }
        state.hadProblem = false;
        state.recoverySince = null;
        if (!SERVICE_LOAD_PERSISTENT_MONITOR) {
          stopMonitor(false);
        }
      }
      return;
    }
    if (errorVisible) {
      if (SERVICE_LOAD_ERROR_LABEL_RETRY_ENABLED) {
        triggerReload(true);
      }
      return;
    }
    if (state.awaitingLoading && loadingVisible) {
      state.awaitingLoading = false;
      state.awaitingLoadingGone = true;
      return;
    }
    if (state.awaitingLoadingGone && !loadingVisible) {
      state.awaitingLoadingGone = false;
      state.awaitingErrorAfterLoad = true;
      startErrorAfterLoadTimer();
      return;
    }
    if (state.awaitingErrorAfterLoad && errorVisible) {
      if (SERVICE_LOAD_ERROR_LABEL_RETRY_ENABLED) {
        triggerReload(true);
      }
    }
  };
  const resumePersistedMonitor = () => {
    if (!isGoGettaTeamLocationUrl()) {
      persistMonitorState(false);
      return;
    }
    const stored = readServiceLoadMonitorStorage(state.tabKey);
    if (!stored || !stored.active) return;
    if (state.active) return;
    const uuid = getGoGettaTeamLocationUuid();
    if (!uuid || !stored.uuid || uuid.toLowerCase() !== stored.uuid.toLowerCase()) {
      persistMonitorState(false);
      return;
    }
    state.pendingReload = false;
    showButton();
    startMonitor();
    checkMonitorState();
  };
  const runInitialApiCheckIfNeeded = () => {
    if (!SERVICE_LOAD_API_CHECK_ENABLED) return;
    if (state.active || state.initialApiCheckDone) return;
    if (!isGoGettaTeamLocationUrl()) return;
    state.initialApiCheckDone = true;
    hasSensibleLocationResponse()
      .then((ok) => {
        if (!ok) {
          triggerMonitorOffer();
          checkMonitorState();
        }
      })
      .catch(() => {
        triggerMonitorOffer();
        checkMonitorState();
      });
  };
  if (!window.gghostServiceMonitorConsoleWrapped) {
    window.gghostServiceMonitorConsoleWrapped = true;
    const originalError = console.error.bind(console);
    const originalWarn = console.warn.bind(console);
  const handleConsoleTrigger = (args) => {
    if (!matchesServiceLoadFetchError(args)) return;
    triggerMonitorOffer();
    scheduleMonitorCheck();
  };
    console.error = (...args) => {
      originalError(...args);
      handleConsoleTrigger(args);
    };
    console.warn = (...args) => {
      originalWarn(...args);
      handleConsoleTrigger(args);
    };
  }
  if (!window.gghostServiceMonitorFetchWrapped) {
    window.gghostServiceMonitorFetchWrapped = true;
    const originalFetch = window.fetch ? window.fetch.bind(window) : null;
    if (originalFetch) {
      window.fetch = (input, init) => {
        const url = typeof input === 'string' ? input : input?.url;
        const requestUuid = extractLocationUuidFromApiUrl(url);
        const pageUuid = getGoGettaTeamLocationUuid();
        const shouldTrack = requestUuid && pageUuid &&
          requestUuid.toLowerCase() === pageUuid.toLowerCase();
        return originalFetch(input, init)
          .then((res) => {
            if (shouldTrack && !res.ok) {
              triggerMonitorOffer();
              scheduleMonitorCheck();
            }
            return res;
          })
          .catch((err) => {
            if (shouldTrack) {
              triggerMonitorOffer();
              scheduleMonitorCheck();
            }
            throw err;
          });
      };
    }
  }
  if (!window.gghostServiceMonitorErrorWrapped) {
    window.gghostServiceMonitorErrorWrapped = true;
    const handleGlobalFailure = (reason) => {
      const text = String(reason?.message || reason || '').toLowerCase();
      if (!text.includes('failed to fetch')) return;
      if (!isGoGettaTeamLocationUrl()) return;
      triggerMonitorOffer();
      scheduleMonitorCheck();
    };
    window.addEventListener('unhandledrejection', (event) => {
      handleGlobalFailure(event?.reason);
    });
    window.addEventListener('error', (event) => {
      handleGlobalFailure(event?.error || event?.message);
    });
  }
  state.observer = new MutationObserver(() => {
    scheduleMonitorCheck();
  });
  if (document.body) {
    state.observer.observe(document.body, { childList: true, subtree: true });
  }
  const getBeepEligibility = () => {
    if (document.visibilityState === 'hidden') {
      state.tabWasHidden = true;
      return { allowed: false, reason: 'hidden' };
    }
    if (state.tabWasHidden) {
      return { allowed: true, reason: 'return' };
    }
    if (!state.lastPointerMoveAt) {
      return { allowed: true, reason: 'idle' };
    }
    if (Date.now() - state.lastPointerMoveAt < SERVICE_LOAD_USER_IDLE_BEFORE_BEEP_MS) {
      return { allowed: false, reason: 'moving' };
    }
    return { allowed: true, reason: 'idle' };
  };
  const tryPlayBeep = () => {
    const eligibility = getBeepEligibility();
    if (!eligibility.allowed) {
      if (eligibility.reason === 'moving') {
        scheduleBeepRetry(SERVICE_LOAD_USER_IDLE_BEFORE_BEEP_MS);
      }
      return false;
    }
    clearBeepRetryTimer();
    playBeep();
    state.tabWasHidden = false;
    return true;
  };
  const handlePointerMove = () => {
    state.lastPointerMoveAt = Date.now();
  };
  const handleVisibilityChange = () => {
    if (document.visibilityState === 'hidden') {
      state.tabWasHidden = true;
    }
    scheduleMonitorCheck();
  };
  window.addEventListener('mousemove', handlePointerMove, { passive: true });
  window.addEventListener('pointermove', handlePointerMove, { passive: true });
  window.addEventListener('blur', () => {
    state.tabWasHidden = true;
  });
  document.addEventListener('visibilitychange', handleVisibilityChange);
  window.addEventListener('beforeunload', () => {
    if (!state.active) {
      persistMonitorState(false);
      return;
    }
    persistMonitorState(true, state.pendingReload);
  });
  onUrlChange(() => {
    scheduleMonitorCheck();
  });
  resumePersistedMonitor();
  runInitialApiCheckIfNeeded();
  checkMonitorState();
}
// ---- Limits (tune as needed) ----
const MAX_ORG_NAME = 140;
const MAX_NOTE_LEN = 4000;
const MAX_ADDR_LEN = 200;       // per address
const MAX_ADDR_TOTAL = 800;     // concatenated
const MAX_ADDR_COUNT = 8;
const MAX_EMAIL = 254;
const MAX_HOST = 255;
const MAX_PHONE = 32;
// ---- Sanitizers ----
function clampLen(s, n) {
  s = String(s || "");
  return s.length > n ? s.slice(0, n) : s;
}
function cleanText(s, max = 500) {
  // Trim, collapse spaces, remove dangerous control chars
  s = String(s || "").replace(/[\u0000-\u001F\u007F]/g, "").replace(/\s+/g, " ").trim();
  return clampLen(s, max);
}
function cleanMultiline(s, max = MAX_NOTE_LEN) {
  // Allow newlines, strip controls except \n\r\t
  s = String(s || "").replace(/[^\S\r\n\t]+/g, " ").replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, "").trim();
  return clampLen(s, max);
}
function sanitizePhone(raw) {
  // digits + + (leading), trim and cap
  const digits = String(raw || "").replace(/[^\d+]/g, "");
  return clampLen(digits, MAX_PHONE);
}
function normalizeEmail(email) {
  return clampLen(String(email || "").trim().toLowerCase(), MAX_EMAIL);
}
function ensureHttpScheme(url) {
  // If user typed without scheme, default to https://
  const s = String(url || "").trim();
  if (!s) return "";
  if (/^https?:\/\//i.test(s)) return s;
  return `https://${s}`;
}
function normalizeWebsiteHost(url) {
  if (!url) return "";
  try {
    const u = new URL(ensureHttpScheme(url));
    return clampLen(u.hostname.toLowerCase(), MAX_HOST);
  } catch {
    return "";
  }
}
// Keep only the last 10 digits from any pasted phone string.
// If there are fewer than 10 digits, it will return what's there.
function getLast10Digits(str) {
  const digits = String(str || "").replace(/\D+/g, "");
  return digits.slice(-10);
}
// Accept "feasible" web addresses without requiring http.
// Rules: no spaces, no "javascript:" etc, contains at least one dot in host.
// We'll try to parse with https:// prefix to validate.
function isFeasibleLink(raw) {
  const s = String(raw || "").trim();
  if (!s) return false;
  if (/\s/.test(s)) return false;
  if (/^javascript:|^data:|^file:/i.test(s)) return false;
  try {
    // Add scheme only for parsing
    const url = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`);
    // must have at least one dot in hostname and only normal chars
    if (!/[.]/.test(url.hostname)) return false;
    if (!/^[a-z0-9.-]+$/i.test(url.hostname)) return false;
    return true;
  } catch {
    return false;
  }
}
// Normalize a website to just the hostname for your composite key.
// Accepts schemeless inputs.
function normalizeWebsiteHostLoose(input) {
  const s = String(input || "").trim();
  if (!s) return "";
  try {
    const u = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`);
    return (u.hostname || "").toLowerCase();
  } catch {
    // fallback: try to grab something like domain.tld from raw text
    const m = s.match(/([a-z0-9.-]+\.[a-z]{2,})/i);
    return m ? m[1].toLowerCase() : "";
  }
}
// You already have toFirebaseKey; keep or use this stricter one:
function toFirebaseKey(str) {
  if (typeof str !== "string") return "x";
  return str.trim().toLowerCase().replace(/[.#$/\[\]]/g, "_");
}
function fromFirebaseKey(str) {
  if (typeof str !== "string") return "";
  return str.replace(/_/g, ".");
}
// Build your composite key from last-10 phone + hostname + email
function buildFutureOrgKey({ phone, website, email }) {
  const p10 = getLast10Digits(phone) || "x";
  const host = normalizeWebsiteHostLoose(website) || "x";
  const em  = String(email || "").trim().toLowerCase() || "x";
  return `${toFirebaseKey(p10)}-${toFirebaseKey(host)}-${toFirebaseKey(em)}`;
}
// ---- Validators ----
function isValidPhone(p) {
  if (!p) return false;
  // 7–15 digits (allow one leading '+')
  const stripped = p.replace(/\D/g, "");
  return stripped.length >= 7 && stripped.length <= 15;
}
function isValidUrlStrict(u) {
  if (!u) return false;
  try {
    const url = new URL(ensureHttpScheme(u));
    if (!/^https?:$/i.test(url.protocol)) return false; // block javascript:, data:, etc
    // simple TLD-ish host check
    if (!/^[a-z0-9.-]+$/i.test(url.hostname)) return false;
    if (!/[.]/.test(url.hostname)) return false; // require dot in host
    return true;
  } catch {
    return false;
  }
}
function isValidEmail(e) {
  if (!e) return false;
  // RFC-lite; good enough for UI validation
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e);
}
function cleanAddress(a) {
  // strip controls, trim, collapse spaces, cap length
  const s = cleanText(a, MAX_ADDR_LEN);
  // basic blacklist for script-y content
  if (/javascript:|data:|<script/i.test(s)) return "";
  return s;
}
// ---- Firebase key safe ----
function toFirebaseKey(str) {
  if (typeof str !== "string") return "x";
  return str.trim()
    .toLowerCase()
    .replace(/[.#$/\[\]]/g, "_"); // firebase-forbidden -> underscore
}
// ---- Composite Future Org key (phone-website-email) ----
function buildFutureOrgKey({ phone, website, email }) {
  const p = toFirebaseKey(sanitizePhone(phone) || "x");
  const w = toFirebaseKey(normalizeWebsiteHost(website) || "x");
  const e = toFirebaseKey(normalizeEmail(email) || "x");
  return `${p || "x"}-${w || "x"}-${e || "x"}`;
}

