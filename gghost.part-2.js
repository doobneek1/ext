// GGHOST_PART_MARKER: gghost.part-2.js
window.__GGHOST_PARTS_LOADED__ = window.__GGHOST_PARTS_LOADED__ || [];
window.__GGHOST_PARTS_LOADED__.push('gghost.part-2.js');
console.log('[gghost] loaded gghost.part-2.js');
/* =========================
   Helpers: service hash
   ========================= */
function getServiceIdFromPath(){
  // e.g. .../services/9e3f.../languages
  const m = location.pathname.match(/\/services\/([0-9a-f-]{8,})\b/i);
  return m ? m[1] : null;
}
function pickServiceHash(services, preferId){
  if (!Array.isArray(services) || services.length === 0) return "";
  let svc = null;
  if (preferId) svc = services.find(s => s.id === preferId);
  if (!svc) svc = services[0];
  if (!svc?.name) return "";
  // Only use a hash if the name is letters/numbers/spaces
  if (!/^[A-Za-z0-9 ]+$/.test(svc.name)) return "";
  return "#" + svc.name.trim().replace(/\s+/g, "-");
}
/* =========================
   Helpers: service taxonomy
   ========================= */
const locationRecordCache = new Map();
const CACHE_DURATION_MS = 60 * 1000; // 1 minute
const LOCATION_CACHE_PREFIX = 'gghost-location-cache-';
const LOCATION_CACHE_MIN_PRUNE = 4;
const LOCATION_API_BASE = 'https://w6pkliozjh.execute-api.us-east-1.amazonaws.com/prod/locations';
const SERVICE_API_BASE = 'https://w6pkliozjh.execute-api.us-east-1.amazonaws.com/prod/services';
const PHONE_API_BASE = 'https://w6pkliozjh.execute-api.us-east-1.amazonaws.com/prod/phones';
const SERVICE_EDIT_OCCASION = 'COVID19';
const WEEKDAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const SERVICE_STASH_DELETED_KEY = 'gghost-service-deleted';
const SERVICE_STASH_SAVED_KEY = 'gghost-service-saved';
const SERVICE_CREATE_TAXONOMY_KEY = 'gghost-service-create-taxonomy';
const SERVICE_STASH_MAX = 25;
let activeTaxonomyBannerKey = null;
let taxonomyRenderRequestId = 0;
const TAXONOMY_BANNER_ATTR = 'data-gghost-service-taxonomy-v2';
const TAXONOMY_BANNER_SELECTOR = `[${TAXONOMY_BANNER_ATTR}]`;
const LEGACY_TAXONOMY_BANNER_SELECTOR = '[data-gghost-service-taxonomy]';
const SERVICE_TAXONOMY_EVENT = 'gghost-open-service-taxonomy';
let taxonomyBannerObserver = null;
let taxonomyOverlayBridgeInstalled = false;
function removeLegacyTaxonomyBanners() {
  document.querySelectorAll(LEGACY_TAXONOMY_BANNER_SELECTOR).forEach(node => node.remove());
}
function ensureTaxonomyBannerObserver() {
  if (taxonomyBannerObserver) return;
  if (!document.documentElement) return;
  taxonomyBannerObserver = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      mutation.addedNodes.forEach((node) => {
        if (!(node instanceof HTMLElement)) return;
        if (node.matches?.(LEGACY_TAXONOMY_BANNER_SELECTOR)) {
          node.remove();
          return;
        }
        node.querySelectorAll?.(LEGACY_TAXONOMY_BANNER_SELECTOR).forEach(el => el.remove());
      });
    }
  });
  taxonomyBannerObserver.observe(document.documentElement, { childList: true, subtree: true });
}
function buildTaxonomyBannerKey(locationId, serviceId) {
  const locationKey = normalizeId(locationId);
  const serviceKey = normalizeId(serviceId);
  if (!locationKey || !serviceKey) return null;
  return `${locationKey}::${serviceKey}`;
}
function invalidateServiceTaxonomyRender() {
  taxonomyRenderRequestId += 1;
}
function isServiceTaxonomyPath(pathname, locationId, serviceId) {
  const locationKey = normalizeId(locationId);
  const serviceKey = normalizeId(serviceId);
  if (!locationKey || !serviceKey || !pathname) return false;
  const path = String(pathname).toLowerCase();
  if (/\/questions(?:\/|$)/i.test(path)) return false;
  const base = `/team/location/${locationKey}/services/${serviceKey}`;
  return path === base || path.startsWith(`${base}/`);
}
function isQuotaExceededError(err) {
  if (!err) return false;
  if (err.name === 'QuotaExceededError') return true;
  if (err.code === 22 || err.code === 1014) return true;
  return false;
}
function listLocationCacheEntries() {
  const entries = [];
  try {
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith(LOCATION_CACHE_PREFIX)) continue;
      let timestamp = 0;
      try {
        const parsed = JSON.parse(localStorage.getItem(key));
        timestamp = Number(parsed?.timestamp) || 0;
      } catch {
        timestamp = 0;
      }
      entries.push({ key, timestamp });
    }
  } catch (err) {
    console.warn('[Service Taxonomy] Failed to list cache keys', err);
  }
  return entries;
}
function pruneLocationCache() {
  const entries = listLocationCacheEntries();
  if (!entries.length) return;
  entries.sort((a, b) => a.timestamp - b.timestamp);
  const removeCount = Math.max(LOCATION_CACHE_MIN_PRUNE, Math.ceil(entries.length / 2));
  for (let i = 0; i < removeCount; i += 1) {
    localStorage.removeItem(entries[i].key);
  }
}
function clearLocationCache() {
  const entries = listLocationCacheEntries();
  entries.forEach(entry => {
    localStorage.removeItem(entry.key);
  });
}
function getLocationCacheKey(uuid) {
  return `${LOCATION_CACHE_PREFIX}${uuid}`;
}
function getCachedLocationData(uuid) {
  try {
    const cacheKey = getLocationCacheKey(uuid);
    const cached = localStorage.getItem(cacheKey);
    if (!cached) return null;
    const parsed = JSON.parse(cached);
    const age = Date.now() - parsed.timestamp;
    // Return cached data if less than 5 minutes old
    if (age < CACHE_DURATION_MS) {
      console.log('[Service Taxonomy] Using cached data, age:', Math.round(age / 1000), 'seconds');
      return parsed.data;
    }
    console.log('[Service Taxonomy] Cache expired, age:', Math.round(age / 1000), 'seconds');
    return null;
  } catch (err) {
    console.error('[Service Taxonomy] Failed to read cache', err);
    return null;
  }
}
function setCachedLocationData(uuid, data) {
  const cacheKey = getLocationCacheKey(uuid);
  const cacheData = {
    timestamp: Date.now(),
    data: data
  };
  try {
    localStorage.setItem(cacheKey, JSON.stringify(cacheData));
    console.log('[Service Taxonomy] Cached location data for', uuid);
    return;
  } catch (err) {
    if (!isQuotaExceededError(err)) {
      console.error('[Service Taxonomy] Failed to cache data', err);
      return;
    }
    pruneLocationCache();
    try {
      localStorage.setItem(cacheKey, JSON.stringify(cacheData));
      console.log('[Service Taxonomy] Cached location data after pruning for', uuid);
      return;
    } catch (retryErr) {
      if (isQuotaExceededError(retryErr)) {
        clearLocationCache();
      }
      console.error('[Service Taxonomy] Failed to cache data after pruning', retryErr);
    }
  }
}
function updateServiceMetadataField(service, section, fieldName, updateTimestamp) {
  if (!service || !fieldName) return;
  if (!service.metadata) service.metadata = {};
  if (!Array.isArray(service.metadata[section])) {
    service.metadata[section] = [];
  }
  const field = service.metadata[section].find(f => f?.field_name === fieldName);
  if (field) {
    field.last_action_date = updateTimestamp;
  } else {
    service.metadata[section].push({ field_name: fieldName, last_action_date: updateTimestamp });
  }
}
function updateCachedServiceRecord(locationId, serviceId, applyUpdate) {
  const locationKey = normalizeId(locationId);
  const serviceKey = normalizeId(serviceId);
  if (!locationKey || !serviceKey || typeof applyUpdate !== 'function') return false;
  const applyUpdateToData = (data) => {
    if (!data) return false;
    const services = normalizeServices(data.Services || data.services);
    const service = services.find(svc => normalizeId(svc?.id) === serviceKey);
    if (!service) return false;
    return !!applyUpdate(service, data);
  };
  let updated = false;
  const memEntry = locationRecordCache.get(locationId) || locationRecordCache.get(locationKey);
  if (memEntry?.data && applyUpdateToData(memEntry.data)) {
    locationRecordCache.set(locationId, { data: memEntry.data, timestamp: Date.now() });
    updated = true;
  }
  const cacheKeys = [getLocationCacheKey(locationId)];
  if (locationId !== locationKey) {
    cacheKeys.push(getLocationCacheKey(locationKey));
  }
  cacheKeys.forEach((cacheKey) => {
    try {
      const cached = localStorage.getItem(cacheKey);
      if (!cached) return;
      const parsed = JSON.parse(cached);
      if (!parsed || !applyUpdateToData(parsed.data)) return;
      parsed.timestamp = Date.now();
      localStorage.setItem(cacheKey, JSON.stringify(parsed));
      updated = true;
    } catch (err) {
      console.warn('[Service Taxonomy] Failed to update cached service record', err);
    }
  });
  return updated;
}
function updateCachedServiceDescription(locationId, serviceId, description, updatedAt = null) {
  const updateTimestamp = updatedAt || new Date().toISOString();
  return updateCachedServiceRecord(locationId, serviceId, (service) => {
    service.description = description;
    updateServiceMetadataField(service, 'service', 'description', updateTimestamp);
    return true;
  });
}
function updateCachedServiceEventInfo(locationId, serviceId, information, updatedAt = null) {
  const updateTimestamp = updatedAt || new Date().toISOString();
  return updateCachedServiceRecord(locationId, serviceId, (service) => {
    const existing = Array.isArray(service.EventRelatedInfos) ? service.EventRelatedInfos : [];
    const filtered = existing.filter(info => info?.event !== SERVICE_EDIT_OCCASION);
    if (information) {
      filtered.push({
        event: SERVICE_EDIT_OCCASION,
        information,
        updatedAt: updateTimestamp
      });
    }
    service.EventRelatedInfos = filtered;
    updateServiceMetadataField(service, 'service', 'eventRelatedInfo', updateTimestamp);
    return true;
  });
}
function updateCachedServiceRequiredDocs(locationId, serviceId, documents, updatedAt = null) {
  const updateTimestamp = updatedAt || new Date().toISOString();
  return updateCachedServiceRecord(locationId, serviceId, (service) => {
    const docList = Array.isArray(documents) ? documents.filter(Boolean) : [];
    service.RequiredDocuments = docList.map(doc => ({ document: doc }));
    updateServiceMetadataField(service, 'documents', 'proofs', updateTimestamp);
    return true;
  });
}
function updateCachedServiceAgeRequirement(locationId, serviceId, ageGroups, updatedAt = null) {
  const updateTimestamp = updatedAt || new Date().toISOString();
  return updateCachedServiceRecord(locationId, serviceId, (service) => {
    const nextGroups = Array.isArray(ageGroups) ? ageGroups : [];
    const eligibilities = Array.isArray(service.Eligibilities) ? service.Eligibilities : [];
    const idx = eligibilities.findIndex(e => e?.EligibilityParameter?.name?.toLowerCase?.() === 'age');
    if (nextGroups.length === 0) {
      if (idx >= 0) {
        eligibilities.splice(idx, 1);
      }
    } else if (idx >= 0) {
      eligibilities[idx] = {
        ...eligibilities[idx],
        eligible_values: nextGroups,
        updatedAt: updateTimestamp
      };
    } else {
      eligibilities.push({
        eligible_values: nextGroups,
        updatedAt: updateTimestamp,
        EligibilityParameter: { name: 'age' }
      });
    }
    service.Eligibilities = eligibilities;
    service.who_does_it_serve = nextGroups;
    updateServiceMetadataField(service, 'service', 'who_does_it_serve', updateTimestamp);
    return true;
  });
}
function updateCachedServiceHolidaySchedules(locationId, serviceId, schedules, updatedAt = null) {
  const updateTimestamp = updatedAt || new Date().toISOString();
  return updateCachedServiceRecord(locationId, serviceId, (service) => {
    const nextSchedules = Array.isArray(schedules) ? schedules : [];
    service.HolidaySchedules = nextSchedules.map(schedule => ({
      ...schedule,
      updatedAt: updateTimestamp
    }));
    updateServiceMetadataField(service, 'service', 'irregularHours', updateTimestamp);
    return true;
  });
}
function sendBackgroundRequest(payload) {
  if (!chrome?.runtime?.sendMessage) return Promise.resolve(null);
  return new Promise((resolve, reject) => {
    try {
      chrome.runtime.sendMessage(payload, (response) => {
        let lastError = null;
        try {
          lastError = chrome?.runtime?.lastError;
        } catch (err) {
          reject(err);
          return;
        }
        if (lastError) {
          reject(lastError);
          return;
        }
        resolve(response);
      });
    } catch (err) {
      reject(err);
    }
  });
}
async function fetchViaBackgroundServiceUpdate(url, options) {
  const payload = {
    type: 'SERVICE_TAXONOMY_UPDATE',
    url,
    method: options?.method || 'GET',
    headers: options?.headers || {},
    body: options?.body,
    credentials: options?.credentials,
    mode: options?.mode
  };
  try {
    const response = await sendBackgroundRequest(payload);
    if (!response || typeof response !== 'object') return null;
    const responseBody = response.body ?? '';
    const responseHeaders = response.headers || {};
    return {
      ok: !!response.ok,
      status: typeof response.status === 'number' ? response.status : 0,
      statusText: response.statusText || '',
      headers: responseHeaders,
      text: async () => responseBody,
      json: async () => {
        if (!responseBody) return null;
        try {
          return JSON.parse(responseBody);
        } catch (err) {
          return null;
        }
      }
    };
  } catch (err) {
    console.warn('[Service Taxonomy] Background fetch failed, falling back to direct fetch', err);
    return null;
  }
}
async function submitServiceUpdate(locationId, serviceId, params) {
  if (!locationId || !serviceId) throw new Error('Missing location or service id.');
  const url = `${SERVICE_API_BASE}/${serviceId}`;
  const payload = params || {};
  const tokens = (() => {
    const { accessToken, idToken } = getCognitoTokens();
    const list = [];
    if (idToken) list.push(idToken);
    if (accessToken && accessToken !== idToken) list.push(accessToken);
    if (!list.length) list.push(null);
    return list;
  })();
  const attemptRequest = async (method, body, token) => {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = token;
    const options = { method, headers, body: JSON.stringify(body) };
    const backgroundRes = await fetchViaBackgroundServiceUpdate(url, options);
    if (backgroundRes) return backgroundRes;
    return fetch(url, options);
  };
  let res = null;
  for (const token of tokens) {
    res = await attemptRequest('PATCH', payload, token);
    if (res.ok) break;
    if (res.status !== 401 && res.status !== 403) break;
  }
  if (!res) {
    throw new Error('Service update failed: no response');
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Failed to update service: HTTP ${res.status} ${text}`);
  }
  return res.json().catch(() => null);
}
async function submitServiceDescriptionUpdate(locationId, serviceId, description) {
  return submitServiceUpdate(locationId, serviceId, { description });
}
async function deleteServiceRecord(serviceId) {
  if (!serviceId) throw new Error('Missing service id.');
  const url = `${SERVICE_API_BASE}/${serviceId}`;
  const tokens = (() => {
    const { accessToken, idToken } = getCognitoTokens();
    const list = [];
    if (idToken) list.push(idToken);
    if (accessToken && accessToken !== idToken) list.push(accessToken);
    if (!list.length) list.push(null);
    return list;
  })();
  const attemptRequest = async (token) => {
    const headers = { accept: 'application/json, text/plain, */*' };
    if (token) headers.Authorization = token;
    const options = { method: 'DELETE', headers, mode: 'cors', credentials: 'include' };
    const backgroundRes = await fetchViaBackgroundServiceUpdate(url, options);
    if (backgroundRes) return backgroundRes;
    return fetch(url, options);
  };
  let res = null;
  for (const token of tokens) {
    res = await attemptRequest(token);
    if (res.ok) break;
    if (res.status !== 401 && res.status !== 403) break;
  }
  if (!res) {
    throw new Error('Service delete failed: no response');
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Failed to delete service: HTTP ${res.status} ${text}`);
  }
  return res.json().catch(() => null);
}
async function createServiceRecord(payload) {
  if (!payload || typeof payload !== 'object') throw new Error('Missing service payload.');
  const url = SERVICE_API_BASE;
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
      'Content-Type': 'application/json',
      accept: 'application/json, text/plain, */*'
    };
    if (token) headers.Authorization = token;
    const options = {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      mode: 'cors',
      credentials: 'include'
    };
    const backgroundRes = await fetchViaBackgroundServiceUpdate(url, options);
    if (backgroundRes) return backgroundRes;
    return fetch(url, options);
  };
  let res = null;
  for (const token of tokens) {
    res = await attemptRequest(token);
    if (res.ok) break;
    if (res.status !== 401 && res.status !== 403) break;
  }
  if (!res) {
    throw new Error('Service create failed: no response');
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Failed to create service: HTTP ${res.status} ${text}`);
  }
  return res.json().catch(() => null);
}
function readServiceStash(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
function writeServiceStash(key, items) {
  try {
    const trimmed = Array.isArray(items) ? items.slice(0, SERVICE_STASH_MAX) : [];
    localStorage.setItem(key, JSON.stringify(trimmed));
  } catch (err) {
    console.warn('[Service Taxonomy] Failed to write service stash', err);
  }
}
function upsertServiceStashItem(key, item) {
  if (!item || typeof item !== 'object') return [];
  const stash = readServiceStash(key);
  const matchIndex = stash.findIndex(entry =>
    entry?.stashId === item.stashId
    || (entry?.sourceServiceId && entry.sourceServiceId === item.sourceServiceId)
    || (entry?.name && entry?.taxonomyId && entry.name === item.name && entry.taxonomyId === item.taxonomyId)
  );
  if (matchIndex >= 0) stash.splice(matchIndex, 1);
  stash.unshift(item);
  writeServiceStash(key, stash);
  return stash;
}
function removeServiceStashItem(key, stashId) {
  const stash = readServiceStash(key);
  const filtered = stash.filter(item => item?.stashId !== stashId);
  writeServiceStash(key, filtered);
  return filtered;
}
function buildServiceStashItem(service) {
  if (!service || typeof service !== 'object') return null;
  const taxonomy = Array.isArray(service.Taxonomies)
    ? service.Taxonomies.find(tax => tax?.id || tax?.ServiceTaxonomy?.taxonomy_id)
    : null;
  const taxonomyId = taxonomy?.id || taxonomy?.ServiceTaxonomy?.taxonomy_id || null;
  const taxonomyLabel = [taxonomy?.parent_name, taxonomy?.name].filter(Boolean).join(' / ');
  return {
    stashId: typeof uuidv === 'function' ? uuidv() : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    sourceServiceId: service?.id || null,
    name: String(service?.name || '').trim() || 'Unnamed service',
    taxonomyId,
    taxonomyLabel: taxonomyLabel || null,
    description: service?.description || null,
    url: service?.url || null,
    email: service?.email || null,
    additional_info: service?.additional_info || null,
    fees: service?.fees || null,
    interpretation_services: service?.interpretation_services || null,
    createdAt: new Date().toISOString()
  };
}
const STATIC_TAXONOMY_OPTIONS = [
  { name: "Clothing", parent_name: null, label: "Clothing" },
  { name: "Clothing Pantry", parent_name: "Clothing", label: "Clothing / Clothing Pantry" },
  { name: "Food", parent_name: null, label: "Food" },
  { name: "Brown Bag", parent_name: "Food", label: "Food / Brown Bag" },
  { name: "Farmer's Markets", parent_name: "Food", label: "Food / Farmer's Markets" },
  { name: "Food Pantry", parent_name: "Food", label: "Food / Food Pantry" },
  { name: "Mobile Market", parent_name: "Food", label: "Food / Mobile Market" },
  { name: "Mobile Pantry", parent_name: "Food", label: "Food / Mobile Pantry" },
  { name: "Mobile Soup Kitchen", parent_name: "Food", label: "Food / Mobile Soup Kitchen" },
  { name: "Soup Kitchen", parent_name: "Food", label: "Food / Soup Kitchen" },
  { name: "Health", parent_name: null, label: "Health" },
  { name: "Mental Health", parent_name: "Health", label: "Health / Mental Health" },
  { name: "Other service", parent_name: null, label: "Other service" },
  { name: "Benefits", parent_name: "Other service", label: "Other service / Benefits" },
  { name: "Case Workers", parent_name: "Other service", label: "Other service / Case Workers" },
  { name: "Education", parent_name: "Other service", label: "Other service / Education" },
  { name: "Employment", parent_name: "Other service", label: "Other service / Employment" },
  { name: "Free Wifi", parent_name: "Other service", label: "Other service / Free Wifi" },
  { name: "Legal Services", parent_name: "Other service", label: "Other service / Legal Services" },
  { name: "Mail", parent_name: "Other service", label: "Other service / Mail" },
  { name: "Taxes", parent_name: "Other service", label: "Other service / Taxes" },
  { name: "Personal Care", parent_name: null, label: "Personal Care" },
  { name: "Haircut", parent_name: "Personal Care", label: "Personal Care / Haircut" },
  { name: "Laundry", parent_name: "Personal Care", label: "Personal Care / Laundry" },
  { name: "Restrooms", parent_name: "Personal Care", label: "Personal Care / Restrooms" },
  { name: "Shower", parent_name: "Personal Care", label: "Personal Care / Shower" },
  { name: "Support Groups", parent_name: "Personal Care", label: "Personal Care / Support Groups" },
  { name: "Toiletries", parent_name: "Personal Care", label: "Personal Care / Toiletries" },
  { name: "Shelter", parent_name: null, label: "Shelter" },
  { name: "Assessment", parent_name: "Shelter", label: "Shelter / Assessment" },
  { name: "Crisis", parent_name: "Shelter", label: "Shelter / Crisis" },
  { name: "Families", parent_name: "Shelter", label: "Shelter / Families" },
  { name: "LGBTQ Young Adult", parent_name: "Shelter", label: "Shelter / LGBTQ Young Adult" },
  { name: "Single Adult", parent_name: "Shelter", label: "Shelter / Single Adult" },
  { name: "Veterans Short-Term Housing", parent_name: "Shelter", label: "Shelter / Veterans Short-Term Housing" }
];
function getTaxonomyOptionsFromServices(services) {
  if (Array.isArray(STATIC_TAXONOMY_OPTIONS) && STATIC_TAXONOMY_OPTIONS.length) {
    const options = new Map();
    STATIC_TAXONOMY_OPTIONS.forEach((item) => {
      if (!item) return;
      const parentName = item.parent_name || "";
      const name = item.name || "";
      if (!parentName && !name) return;
      const label = item.label || [parentName, name].filter(Boolean).join(" / ");
      if (!label) return;
      const id = item.id || label;
      if (!options.has(id)) options.set(id, { id, label });
    });
    return Array.from(options.values()).sort((a, b) => a.label.localeCompare(b.label));
  }
  const options = new Map();
  const list = Array.isArray(services) ? services : [];
  list.forEach(service => {
    const taxonomies = Array.isArray(service?.Taxonomies) ? service.Taxonomies : [];
    taxonomies.forEach(tax => {
      const id = tax?.id || tax?.ServiceTaxonomy?.taxonomy_id;
      if (!id) return;
      const label = [tax?.parent_name, tax?.name].filter(Boolean).join(' / ') || tax?.name || id;
      if (!options.has(id)) options.set(id, { id, label });
    });
  });
  return Array.from(options.values()).sort((a, b) => a.label.localeCompare(b.label));
}
function getRedirectEnabledFlag() {
  return new Promise(resolve => {
    if (!chrome?.storage?.local) {
      resolve(false);
      return;
    }
    chrome.storage.local.get(['redirectEnabled'], (data) => {
      resolve(!!data?.redirectEnabled);
    });
  });
}
function buildEditSummary(label, beforeValue, afterValue) {
  const beforeText = (beforeValue == null ? '' : String(beforeValue)).trim();
  const afterText = (afterValue == null ? '' : String(afterValue)).trim();
  if (!beforeText && afterText) return `Added ${label}`;
  if (beforeText && !afterText) return `Cleared ${label}`;
  return `Updated ${label}`;
}
async function recordServiceEditLog({
  locationId,
  serviceId,
  field,
  label,
  urlSuffix,
  before,
  after
}) {
  if (!locationId || !serviceId) return;
  const userName = getCurrentUsername();
  const ts = new Date().toISOString();
  const dateKey = String(Date.now());
  const pagePath = buildServicePath(locationId, serviceId, urlSuffix || '');
  const summary = buildEditSummary(label || field || 'field', before, after);
  const note = {
    type: 'edit',
    field: field || '',
    label: label || '',
    before,
    after,
    note: summary,
    summary,
    ts,
    userName,
    pagePath,
    locationId,
    serviceId
  };
  let notePayload = note;
  if (note && typeof note === 'object') {
    try {
      notePayload = JSON.stringify(note);
    } catch (err) {
      notePayload = JSON.stringify({ summary, note: summary, ts, userName, field: field || '' });
    }
  }
  try {
    const res = await postToNoteAPI({
      uuid: pagePath,
      userName,
      date: dateKey,
      note: notePayload
    });
    if (!res?.ok) {
      const text = await res.text().catch(() => '');
      console.warn('[Service Taxonomy] Failed to record edit log', res?.status, text);
    }
  } catch (err) {
    console.warn('[Service Taxonomy] Failed to record edit log', err);
  }
}
const SERVICE_API_MONITOR_ATTR = 'data-gghost-service-api-monitor';
let serviceApiMonitorInitialized = false;
function injectServiceApiMonitor() {
  if (!chrome?.runtime?.getURL) return;
  if (document.querySelector(`script[${SERVICE_API_MONITOR_ATTR}]`)) return;
  const script = document.createElement('script');
  script.type = 'text/javascript';
  script.setAttribute(SERVICE_API_MONITOR_ATTR, 'true');
  script.async = true;
  script.src = chrome.runtime.getURL('serviceApiMonitor.js');
  script.onload = () => script.remove();
  script.onerror = () => script.remove();
  (document.head || document.documentElement).appendChild(script);
}
function safeJsonParse(text) {
  if (!text || typeof text !== 'string') return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
function extractServiceIdFromApiUrl(url) {
  if (!url) return null;
  const match = String(url).match(/\/services\/([0-9a-f-]{8,})/i);
  return match ? match[1] : null;
}
function extractLocationIdFromPath(pathname = location.pathname) {
  const match = String(pathname).match(/\/team\/location\/([0-9a-f-]{12,36})/i);
  return match ? match[1] : null;
}
function getCachedServiceRecord(locationId, serviceId) {
  if (!locationId || !serviceId) return null;
  const locationKey = normalizeId(locationId);
  const memEntry = locationRecordCache.get(locationId) || locationRecordCache.get(locationKey);
  if (memEntry?.data) {
    const service = findServiceRecord(memEntry.data, serviceId);
    if (service) return service;
  }
  const cached = getCachedLocationData(locationId) || (locationKey !== locationId ? getCachedLocationData(locationKey) : null);
  if (cached) {
    return findServiceRecord(cached, serviceId);
  }
  return null;
}
function getServiceFieldValue(service, field) {
  if (!service) return null;
  if (field === 'description') return (service.description || '').trim();
  if (field === 'eventInfo') {
    const infos = Array.isArray(service.EventRelatedInfos) ? service.EventRelatedInfos : [];
    const info = infos.find(item => item?.event === SERVICE_EDIT_OCCASION) || null;
    return (info?.information || '').trim();
  }
  if (field === 'requiredDocs') {
    const docs = Array.isArray(service.RequiredDocuments) ? service.RequiredDocuments : [];
    return docs
      .map(doc => (doc?.document || '').trim())
      .filter(name => name && name.toLowerCase() !== 'none');
  }
  if (field === 'age') {
    const eligibilities = Array.isArray(service?.Eligibilities) ? service.Eligibilities : [];
    const ageEligibility = eligibilities.find(e => e?.EligibilityParameter?.name?.toLowerCase?.() === 'age');
    return Array.isArray(ageEligibility?.eligible_values) ? ageEligibility.eligible_values : [];
  }
  if (field === 'hours') {
    return Array.isArray(service.HolidaySchedules) ? service.HolidaySchedules : [];
  }
  return null;
}
function buildServiceApiChanges(payload, serviceBefore) {
  const changes = [];
  if (!payload || typeof payload !== 'object') return changes;
  if (Object.prototype.hasOwnProperty.call(payload, 'description')) {
    changes.push({
      field: 'description',
      label: 'Description',
      urlSuffix: 'description',
      before: getServiceFieldValue(serviceBefore, 'description'),
      after: payload.description ?? null
    });
  }
  if (payload.eventRelatedInfo) {
    changes.push({
      field: 'eventInfo',
      label: 'Event info',
      urlSuffix: 'other-info',
      before: getServiceFieldValue(serviceBefore, 'eventInfo'),
      after: payload.eventRelatedInfo?.information ?? null
    });
  }
  if (payload.documents && Object.prototype.hasOwnProperty.call(payload.documents, 'proofs')) {
    changes.push({
      field: 'requiredDocs',
      label: 'Required documents',
      urlSuffix: 'documents/proofs-required',
      before: getServiceFieldValue(serviceBefore, 'requiredDocs'),
      after: payload.documents?.proofs ?? null
    });
  }
  if (Object.prototype.hasOwnProperty.call(payload, 'whoDoesItServe')) {
    changes.push({
      field: 'age',
      label: 'Age requirement',
      urlSuffix: 'who-does-it-serve',
      before: getServiceFieldValue(serviceBefore, 'age'),
      after: payload.whoDoesItServe ?? null
    });
  }
  if (Object.prototype.hasOwnProperty.call(payload, 'irregularHours')) {
    changes.push({
      field: 'hours',
      label: 'Hours',
      urlSuffix: 'opening-hours',
      before: getServiceFieldValue(serviceBefore, 'hours'),
      after: payload.irregularHours ?? null
    });
  }
  return changes;
}
function buildLocationFieldLabel(field) {
  if (!field) return '';
  const map = {
    organization_id: 'Organization Id',
    organizationId: 'Organization Id',
    location_id: 'Location Id',
    locationId: 'Location Id',
    additional_info: 'Additional info',
    last_validated_at: 'Last validated',
    updated_at: 'Updated at',
    created_at: 'Created at',
    postal_code: 'Postal code'
  };
  if (map[field]) return map[field];
  const spaced = String(field)
    .replace(/_/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .trim();
  return spaced.replace(/\b\w/g, (match) => match.toUpperCase());
}
function normalizeLocationFieldKey(field) {
  if (!field) return '';
  return String(field).replace(/\s+/g, '').trim();
}
function getLocationFieldValue(location, field) {
  if (!location || !field) return null;
  const key = normalizeLocationFieldKey(field);
  if (Object.prototype.hasOwnProperty.call(location, key)) {
    return location[key];
  }
  const snake = key.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();
  if (snake !== key && Object.prototype.hasOwnProperty.call(location, snake)) {
    return location[snake];
  }
  const camel = key.replace(/_([a-z])/g, (_, char) => char.toUpperCase());
  if (camel !== key && Object.prototype.hasOwnProperty.call(location, camel)) {
    return location[camel];
  }
  if (key === 'organization_id' || key === 'organizationId') {
    return location.organization_id || location.organizationId || location.Organization?.id || null;
  }
  if (key === 'address') {
    return location.address || location.Address || location.PhysicalAddresses?.[0] || null;
  }
  if (key === 'physicalAddresses' || key === 'PhysicalAddresses') {
    return location.PhysicalAddresses || location.physicalAddresses || null;
  }
  if (key === 'closed') {
    return location.closed ?? location.isClosed ?? null;
  }
  return null;
}
function areLocationValuesEqual(a, b) {
  if (a === b) return true;
  if (a == null || b == null) return false;
  if (typeof a === 'object' || typeof b === 'object') {
    try {
      return JSON.stringify(a) === JSON.stringify(b);
    } catch {
      return false;
    }
  }
  return false;
}
function buildLocationApiChanges(payload, locationBefore) {
  const changes = [];
  if (!payload || typeof payload !== 'object') return changes;
  const ignoredKeys = new Set([
    'id',
    'locationId',
    'createdAt',
    'created_at',
    'updatedAt',
    'updated_at',
    'slug',
    'Services',
    'services',
    'Organization',
    'organization'
  ]);
  Object.entries(payload).forEach(([field, value]) => {
    if (!Object.prototype.hasOwnProperty.call(payload, field)) return;
    if (ignoredKeys.has(field)) return;
    const before = getLocationFieldValue(locationBefore, field);
    if (areLocationValuesEqual(before, value)) return;
    changes.push({
      field,
      label: buildLocationFieldLabel(field),
      before,
      after: value
    });
  });
  return changes;
}
async function recordServiceApiNote({
  locationId,
  serviceId,
  field,
  label,
  urlSuffix,
  before,
  after,
  summary,
  action,
  meta
}) {
  if (!locationId) return;
  const userName = getCurrentUsername();
  if (!userName) return;
  const ts = new Date().toISOString();
  const dateKey = String(Date.now());
  const pagePath = locationId && serviceId
    ? buildServicePath(locationId, serviceId, urlSuffix || '')
    : `/team/location/${locationId}`;
  const noteSummary = summary || buildEditSummary(label || field || 'field', before, after);
  const note = {
    type: 'edit',
    field: field || '',
    label: label || '',
    before,
    after,
    summary: noteSummary,
    ts,
    userName,
    pagePath,
    locationId,
    serviceId,
    resourceTable: 'services',
    action: action || 'update',
    copyedit: false,
    source: 'service-api'
  };
  let notePayload = note;
  if (note && typeof note === 'object') {
    try {
      notePayload = JSON.stringify(note);
    } catch {
      notePayload = JSON.stringify({ summary: noteSummary, note: noteSummary, ts, userName });
    }
  }
  try {
    const res = await postToNoteAPI({
      uuid: pagePath,
      userName,
      date: dateKey,
      note: notePayload
    });
    if (!res?.ok) {
      const text = await res.text().catch(() => '');
      console.warn('[Service API] Failed to record edit log', res?.status, text);
    }
  } catch (err) {
    console.warn('[Service API] Failed to record edit log', err);
  }
}
async function recordPhoneApiNote({
  locationId,
  phoneId,
  field,
  label,
  before,
  after,
  summary,
  action,
  meta
}) {
  if (!locationId) return;
  const userName = getCurrentUsername();
  if (!userName) return;
  const ts = new Date().toISOString();
  const dateKey = String(Date.now());
  const pagePath = buildLocationPhonePath(locationId, phoneId);
  const noteSummary = summary || buildEditSummary(label || field || 'field', before, after);
  const note = {
    type: 'edit',
    field: field || '',
    label: label || '',
    before,
    after,
    note: noteSummary,
    summary: noteSummary,
    ts,
    userName,
    pagePath,
    locationId,
    serviceId: '',
    phoneId: phoneId || '',
    resourceTable: 'phones',
    action: action || 'update',
    copyedit: false,
    source: 'phone-api'
  };
  if (meta && typeof meta === 'object') {
    note.meta = meta;
  }
  let notePayload = note;
  if (note && typeof note === 'object') {
    try {
      notePayload = JSON.stringify(note);
    } catch {
      notePayload = JSON.stringify({ summary: noteSummary, note: noteSummary, ts, userName });
    }
  }
  try {
    const res = await postToNoteAPI({
      uuid: pagePath,
      userName,
      date: dateKey,
      note: notePayload
    });
    if (!res?.ok) {
      const text = await res.text().catch(() => '');
      console.warn('[Phone API] Failed to record edit log', res?.status, text);
    }
  } catch (err) {
    console.warn('[Phone API] Failed to record edit log', err);
  }
}
async function recordLocationApiNote({
  locationId,
  field,
  label,
  before,
  after,
  summary,
  action,
  meta
}) {
  if (!locationId) return;
  const userName = getCurrentUsername();
  if (!userName) return;
  const ts = new Date().toISOString();
  const dateKey = String(Date.now());
  const pagePath = `/team/location/${locationId}`;
  const noteSummary = summary || buildEditSummary(label || field || 'field', before, after);
  const note = {
    type: 'edit',
    field: field || '',
    label: label || '',
    before,
    after,
    note: noteSummary,
    summary: noteSummary,
    ts,
    userName,
    pagePath,
    locationId,
    serviceId: '',
    resourceTable: 'locations',
    action: action || 'update',
    copyedit: false,
    source: 'location-api'
  };
  if (meta && typeof meta === 'object') {
    note.meta = meta;
  }
  let notePayload = note;
  if (note && typeof note === 'object') {
    try {
      notePayload = JSON.stringify(note);
    } catch {
      notePayload = JSON.stringify({ summary: noteSummary, note: noteSummary, ts, userName });
    }
  }
  try {
    const res = await postToNoteAPI({
      uuid: pagePath,
      userName,
      date: dateKey,
      note: notePayload
    });
    if (!res?.ok) {
      const text = await res.text().catch(() => '');
      console.warn('[Location API] Failed to record edit log', res?.status, text);
    }
  } catch (err) {
    console.warn('[Location API] Failed to record edit log', err);
  }
}
function actionFromMethod(method) {
  const normalized = String(method || '').toUpperCase();
  if (normalized === 'POST') return 'create';
  if (normalized === 'DELETE') return 'delete';
  return 'update';
}
function buildApiFailureSummary(resourceLabel, method, status) {
  const label = resourceLabel || 'API';
  const statusText = status ? ` (status ${status})` : '';
  return `${label} ${String(method || '').toUpperCase()} failed${statusText}`;
}
function handleLocationApiMonitorMessage(event) {
  if (event.source !== window) return;
  const data = event.data;
  if (!data || data.source !== 'gghost-location-api' || !data.payload) return;
  const payload = data.payload;
  const url = payload?.url;
  const method = String(payload?.method || '').toUpperCase();
  const status = typeof payload?.status === 'number' ? payload.status : 0;
  const ok = payload?.ok === true;
  if (!url || !method) return;
  if (!String(url).startsWith(LOCATION_API_BASE)) return;
  if (!['POST', 'PATCH', 'PUT', 'DELETE'].includes(method)) return;
  const requestData = safeJsonParse(payload.requestBody);
  const responseData = safeJsonParse(payload.responseBody);
  const locationId = extractLocationUuidFromApiUrl(url)
    || requestData?.id
    || requestData?.locationId
    || responseData?.id
    || responseData?.locationId
    || extractLocationIdFromPath();
  if (!locationId) return;
  const requestMeta = {
    url,
    method,
    status,
    ok,
    error: payload?.error || null
  };
  if (!ok) {
    const summary = buildApiFailureSummary('Location', method, status);
    void recordLocationApiNote({
      locationId,
      field: 'api_error',
      label: 'API error',
      before: null,
      after: requestData || null,
      summary,
      action: actionFromMethod(method),
      meta: requestMeta
    });
    return;
  }
  const locationKey = String(locationId);
  const cacheEntry = locationRecordCache.get(locationKey) || locationRecordCache.get(locationKey.toLowerCase());
  const locationBefore = cacheEntry?.data || getCachedLocationData(locationKey) || null;
  if (method === 'POST') {
    const name = requestData?.name || responseData?.name;
    const summary = name ? `Created location: ${name}` : 'Created location';
    const baseAfter = requestData && typeof requestData === 'object'
      ? requestData
      : (responseData && typeof responseData === 'object' ? responseData : null);
    const after = baseAfter && responseData?.id && !baseAfter.id
      ? { ...baseAfter, id: responseData.id }
      : baseAfter;
    void recordLocationApiNote({
      locationId,
      field: 'location',
      label: 'Location',
      before: null,
      after,
      summary,
      action: 'create',
      meta: requestMeta
    });
    return;
  }
  if (method === 'DELETE') {
    const before = locationBefore
      ? { id: locationBefore.id || locationId || null, name: locationBefore.name || null }
      : { id: locationId || null };
    const summary = before?.name ? `Deleted location: ${before.name}` : 'Deleted location';
    void recordLocationApiNote({
      locationId,
      field: 'location',
      label: 'Location',
      before,
      after: null,
      summary,
      action: 'delete',
      meta: requestMeta
    });
    return;
  }
  const updatePayload = requestData && typeof requestData === 'object'
    ? requestData
    : (responseData && typeof responseData === 'object' ? responseData : null);
  if (!updatePayload) {
    return;
  }
  const changes = buildLocationApiChanges(updatePayload, locationBefore);
  if (!changes.length) {
    void recordLocationApiNote({
      locationId,
      field: 'location',
      label: 'Location',
      before: null,
      after: updatePayload || null,
      summary: 'Updated location',
      action: 'update',
      meta: requestMeta
    });
    return;
  }
  changes.forEach((change) => {
    void recordLocationApiNote({
      locationId,
      field: change.field,
      label: change.label,
      before: change.before,
      after: change.after,
      action: 'update',
      meta: requestMeta
    });
  });
}
function handleServiceApiMonitorMessage(event) {
  if (event.source !== window) return;
  const data = event.data;
  if (!data || data.source !== 'gghost-service-api' || !data.payload) return;
  const payload = data.payload;
  const url = payload?.url;
  const method = String(payload?.method || '').toUpperCase();
  const status = typeof payload?.status === 'number' ? payload.status : 0;
  const ok = payload?.ok === true;
  if (!url || !method) return;
  if (!String(url).startsWith(SERVICE_API_BASE)) return;
  if (!['POST', 'PATCH', 'PUT', 'DELETE'].includes(method)) return;
  const requestData = safeJsonParse(payload.requestBody);
  const responseData = safeJsonParse(payload.responseBody);
  const serviceIdFromUrl = extractServiceIdFromApiUrl(url);
  const serviceId = serviceIdFromUrl || responseData?.id || responseData?.service?.id || null;
  const locationId = requestData?.locationId
    || responseData?.locationId
    || responseData?.location_id
    || extractLocationIdFromPath();
  if (!locationId) return;
  const requestMeta = {
    url,
    method,
    status,
    ok,
    error: payload?.error || null
  };
  if (!ok) {
    const summary = buildApiFailureSummary('Service', method, status);
    void recordServiceApiNote({
      locationId,
      serviceId,
      field: 'api_error',
      label: 'API error',
      urlSuffix: '',
      before: null,
      after: requestData || null,
      summary,
      action: actionFromMethod(method),
      meta: requestMeta
    });
    return;
  }
  if (method === 'POST') {
    const name = requestData?.name || responseData?.name || responseData?.service?.name;
    const summary = name ? `Created service: ${name}` : 'Created service';
    const after = Object.assign({}, requestData || null, serviceId ? { id: serviceId } : null);
    void recordServiceApiNote({
      locationId,
      serviceId,
      field: 'service',
      label: 'Service',
      urlSuffix: '',
      before: null,
      after,
      summary,
      action: 'create',
      meta: requestMeta
    });
    return;
  }
  if (method === 'DELETE') {
    const serviceBefore = getCachedServiceRecord(locationId, serviceId);
    const name = serviceBefore?.name;
    const summary = name ? `Deleted service: ${name}` : 'Deleted service';
    const before = serviceBefore
      ? { id: serviceBefore.id || serviceId || null, name: serviceBefore.name || null }
      : { id: serviceId || null };
    void recordServiceApiNote({
      locationId,
      serviceId,
      field: 'service',
      label: 'Service',
      urlSuffix: '',
      before,
      after: null,
      summary,
      action: 'delete',
      meta: requestMeta
    });
    return;
  }
  const serviceBefore = getCachedServiceRecord(locationId, serviceId);
  const changes = buildServiceApiChanges(requestData, serviceBefore);
  if (!changes.length) {
    void recordServiceApiNote({
      locationId,
      serviceId,
      field: 'service',
      label: 'Service',
      urlSuffix: '',
      before: null,
      after: requestData || null,
      summary: 'Updated service',
      action: 'update',
      meta: requestMeta
    });
    return;
  }
  changes.forEach(change => {
    void recordServiceApiNote({
      locationId,
      serviceId,
      field: change.field,
      label: change.label,
      urlSuffix: change.urlSuffix,
      before: change.before,
      after: change.after,
      action: 'update',
      meta: requestMeta
    });
  });
}
function handlePhoneApiMonitorMessage(event) {
  if (event.source !== window) return;
  const data = event.data;
  if (!data || data.source !== 'gghost-phone-api' || !data.payload) return;
  const payload = data.payload;
  const url = payload?.url;
  const method = String(payload?.method || '').toUpperCase();
  const status = typeof payload?.status === 'number' ? payload.status : 0;
  const ok = payload?.ok === true;
  if (!url || !method) return;
  const urlText = String(url);
  if (!urlText.startsWith(PHONE_API_BASE) && !/\/prod\/phones\//i.test(urlText)) return;
  if (!['POST', 'PATCH', 'PUT', 'DELETE'].includes(method)) return;
  const requestData = safeJsonParse(payload.requestBody);
  const responseData = safeJsonParse(payload.responseBody);
  const phoneId = extractPhoneIdFromApiUrl(url) || responseData?.id || requestData?.id || null;
  const locationId = requestData?.locationId
    || requestData?.location_id
    || responseData?.locationId
    || responseData?.location_id
    || extractLocationIdFromPath();
  if (!locationId) return;
  const requestMeta = {
    url,
    method,
    status,
    ok,
    error: payload?.error || null
  };
  if (!ok) {
    const summary = buildApiFailureSummary('Phone', method, status);
    void recordPhoneApiNote({
      locationId,
      phoneId,
      field: 'api_error',
      label: 'API error',
      before: null,
      after: requestData || null,
      summary,
      action: actionFromMethod(method),
      meta: requestMeta
    });
    return;
  }
  const numberValue = requestData?.number ?? responseData?.number ?? null;
  const field = numberValue ? 'number' : 'phone';
  const label = numberValue ? 'Phone number' : 'Phone';
  const action = actionFromMethod(method);
  const summary = action === 'create'
    ? (numberValue ? `Created phone: ${numberValue}` : 'Created phone')
    : action === 'delete'
      ? (numberValue ? `Deleted phone: ${numberValue}` : 'Deleted phone')
      : (numberValue ? `Updated phone: ${numberValue}` : 'Updated phone');
  const before = action === 'delete' ? { id: phoneId || null, number: numberValue || null } : null;
  const after = action === 'delete'
    ? null
    : (numberValue ? { id: phoneId || null, number: numberValue } : (requestData || null));
  void recordPhoneApiNote({
    locationId,
    phoneId,
    field,
    label,
    before,
    after,
    summary,
    action,
    meta: requestMeta
  });
}
function setupServiceApiMonitor() {
  if (serviceApiMonitorInitialized) return;
  serviceApiMonitorInitialized = true;
  if (!/gogetta\.nyc$/i.test(location.hostname)) return;
  injectServiceApiMonitor();
  window.addEventListener('message', handleServiceApiMonitorMessage);
  window.addEventListener('message', handleLocationApiMonitorMessage);
  window.addEventListener('message', handlePhoneApiMonitorMessage);
}
async function fetchFullLocationRecord(uuid, { refresh = false } = {}) {
  if (!uuid) return { data: null, fromCache: false };
  if (!refresh) {
    const pageEntry = readPageLocationCacheEntry(uuid);
    if (pageEntry?.data) {
      locationRecordCache.set(uuid, { data: pageEntry.data, timestamp: Date.now() });
      setCachedLocationData(uuid, pageEntry.data);
      return { data: pageEntry.data, fromCache: !!pageEntry.isStale };
    }
  }
  // Check localStorage cache first if not forcing refresh
  if (!refresh) {
    const cachedData = getCachedLocationData(uuid);
    if (cachedData) {
      return { data: cachedData, fromCache: true };
    }
  }
  // Check memory cache
  if (!refresh && locationRecordCache.has(uuid)) {
    const memEntry = locationRecordCache.get(uuid);
    const age = Date.now() - (memEntry?.timestamp || 0);
    if (memEntry && age < CACHE_DURATION_MS) {
      return { data: memEntry.data, fromCache: true };
    }
    locationRecordCache.delete(uuid);
  }
  try {
    const headers = getAuthHeaders();
    void recordLocationInvocation(uuid, "fetchFullLocationRecord");
    const res = await fetch(`https://w6pkliozjh.execute-api.us-east-1.amazonaws.com/prod/locations/${uuid}`, { headers });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    const data = await res.json();
    void recordLocationStatsFromPayload(uuid, data, { source: "fetchFullLocationRecord" });
    // Store in both memory and localStorage cache
    locationRecordCache.set(uuid, { data, timestamp: Date.now() });
    setCachedLocationData(uuid, data);
    return { data, fromCache: false };
  } catch (err) {
    console.error('[Service Taxonomy] Failed to fetch location record', uuid, err);
    return { data: null, fromCache: false };
  }
}
function findServiceRecord(locationData, serviceId) {
  const targetId = normalizeId(serviceId);
  if (!locationData || !targetId) return null;
  const services = normalizeServices(locationData.Services || locationData.services);
  return services.find(service => normalizeId(service?.id) === targetId) || null;
}
function removeServiceTaxonomyBanner() {
  ensureTaxonomyBannerObserver();
  removeLegacyTaxonomyBanners();
  document.querySelectorAll(`${TAXONOMY_BANNER_SELECTOR}, ${LEGACY_TAXONOMY_BANNER_SELECTOR}`).forEach(node => node.remove());
  activeTaxonomyBannerKey = null;
}
function getValidationColor(dateStr) {
  const now = new Date();
  const then = new Date(dateStr);
  const diffMonths = (now - then) / (1000 * 60 * 60 * 24 * 30.44);
  if (diffMonths <= 6) return 'green';
  if (diffMonths <= 12) return 'orange';
  return 'red';
}
function getMostRecentUpdateDate(service) {
  const dates = [];
  // Check description update
  const descUpdate = service.metadata?.service?.find(f => f.field_name === 'description')?.last_action_date;
  if (descUpdate) dates.push(new Date(descUpdate));
  // Check holiday schedules
  const holidayUpdate = service.HolidaySchedules?.[0]?.createdAt;
  if (holidayUpdate) dates.push(new Date(holidayUpdate));
  // Check event related info
  const eventUpdate = service.EventRelatedInfos?.[0]?.createdAt;
  if (eventUpdate) dates.push(new Date(eventUpdate));
  if (dates.length === 0) return null;
  return new Date(Math.max(...dates));
}
function formatOxfordList(items) {
  if (!Array.isArray(items) || items.length === 0) return "";
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  const head = items.slice(0, -1).join(", ");
  return `${head}, and ${items[items.length - 1]}`;
}
function truncateText(text, maxLen = 80) {
  const value = (text || "").trim();
  if (!value) return "";
  if (value.length <= maxLen) return value;
  return `${value.slice(0, maxLen - 3)}...`;
}
function pickLatestDate(dates = []) {
  let latest = null;
  let latestTs = -Infinity;
  dates.forEach(d => {
    if (!d) return;
    const ts = new Date(d).getTime();
    if (Number.isNaN(ts)) return;
    if (ts > latestTs) {
      latestTs = ts;
      latest = d;
    }
  });
  return latest;
}
function getRecencyStyles(dateStr) {
  const color = dateStr ? getValidationColor(dateStr) : null;
  if (color === "green") {
    return { background: "#d4edda", color: "#1c512c", border: "#b9dfc3" };
  }
  if (color === "orange") {
    return { background: "#fff3cd", color: "#7c5a00", border: "#f2d17d" };
  }
  if (color === "red") {
    return { background: "#f8d7da", color: "#842029", border: "#f0aab4" };
  }
  return { background: "#f2f2f2", color: "#333", border: "#d9d9d9" };
}
function buildServiceUrl(locationId, serviceId, suffix = "") {
  const base = `https://gogetta.nyc/team/location/${locationId}/services/${serviceId}`;
  if (!suffix) return base;
  return `${base}/${suffix.replace(/^\/+/, "")}`;
}
function buildServicePath(locationId, serviceId, suffix = "") {
  const base = `/team/location/${locationId}/services/${serviceId}`;
  if (!suffix) return base;
  return `${base}/${suffix.replace(/^\/+/, "")}`;
}
function toWeekdayNumber(value) {
  if (value == null) return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const str = String(value).trim().toLowerCase();
  if (!str) return null;
  const idx = WEEKDAY_NAMES.findIndex(name => name.toLowerCase() === str);
  return idx >= 0 ? idx + 1 : null;
}
function toWeekdayName(value) {
  const num = toWeekdayNumber(value);
  if (!num) return WEEKDAY_NAMES[0];
  return WEEKDAY_NAMES[num - 1] || WEEKDAY_NAMES[0];
}
function toTimeInputValue(value) {
  if (!value) return '';
  const str = String(value).trim();
  const match = str.match(/^(\d{2}:\d{2})/);
  return match ? match[1] : '';
}
function toScheduleTimeValue(value) {
  if (!value) return null;
  const str = String(value).trim();
  const match = str.match(/^(\d{2}):(\d{2})/);
  if (!match) return null;
  return `${match[1]}:${match[2]}:00`;
}
function normalizeAgeNumber(value) {
  if (value == null || value === '') return null;
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  return Math.max(0, Math.floor(num));
}
function formatAgeGroups(values = []) {
  const parts = values
    .map(v => {
      if (!v || typeof v !== 'object') return null;
      if (v.all_ages) return 'All ages';
      const min = v.age_min;
      const max = v.age_max;
      const hasMin = min !== null && min !== undefined && !Number.isNaN(Number(min));
      const hasMax = max !== null && max !== undefined && !Number.isNaN(Number(max));
      if (hasMin && hasMax) return `${Number(min)}-${Number(max)}`;
      if (hasMin) return `${Number(min)}+`;
      if (hasMax) return `Under ${Number(max)}`;
      return null;
    })
    .filter(Boolean);
  return parts.join(', ');
}
function formatAgeRequirement(service) {
  const eligibilities = Array.isArray(service?.Eligibilities) ? service.Eligibilities : [];
  const ageEligibility = eligibilities.find(e => e?.EligibilityParameter?.name?.toLowerCase?.() === "age");
  const values = Array.isArray(ageEligibility?.eligible_values) ? ageEligibility.eligible_values : [];
  const latestAgeDate = pickLatestDate([
    ageEligibility?.updatedAt,
    ageEligibility?.createdAt,
    ...(values.map(v => v?.updatedAt || v?.createdAt).filter(Boolean))
  ]);
  const formatted = formatAgeGroups(values);
  return {
    label: "Age requirement",
    value: formatted,
    rawValue: values,
    emptyLabel: "Set age requirement",
    urlSuffix: "who-does-it-serve",
    updatedAt: latestAgeDate,
    field: "age",
    editable: true
  };
}
function parseTimeStr(t) {
  if (!t || typeof t !== "string") return null;
  const m = t.match(/^(\d{2}):(\d{2})/);
  if (!m) return null;
  let hour24 = Number(m[1]);
  const minute = Number(m[2]);
  if (Number.isNaN(hour24) || Number.isNaN(minute)) return null;
  const mer = hour24 >= 12 ? "p" : "a";
  let hour12 = hour24 % 12;
  if (hour12 === 0) hour12 = 12;
  return { hour12, minute, mer };
}
function formatTimeDisplay(info, includeMer = true) {
  if (!info) return "";
  const mins = info.minute ? `:${String(info.minute).padStart(2, "0")}` : "";
  return `${info.hour12}${mins}${includeMer ? info.mer : ""}`;
}
function formatRangeStr(openStr, closeStr) {
  const open = parseTimeStr(openStr);
  const close = parseTimeStr(closeStr);
  if (!open || !close) return null;
  const sameMer = open.mer === close.mer;
  const start = formatTimeDisplay(open, !sameMer);
  const end = formatTimeDisplay(close, true);
  return `${start}-${end}`;
}
function buildHoursEntry(service) {
  const schedules = Array.isArray(service?.HolidaySchedules) ? service.HolidaySchedules : [];
  const latestDate = pickLatestDate(schedules.map(s => s?.updatedAt || s?.createdAt).filter(Boolean));
  if (!schedules.length) {
    return {
      label: "Hours",
      value: "No hours",
      rawValue: schedules,
      emptyLabel: "Set hours",
      urlSuffix: "opening-hours",
      updatedAt: latestDate,
      field: "hours",
      editable: true
    };
  }
  const openEntries = schedules.filter(s => s && s.closed === false && s.opens_at && s.closes_at);
  const days = [1, 2, 3, 4, 5, 6, 7];
  const dayNames = ["", "Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
  const isFullDay = (s) => s.opens_at === "00:00:00" && s.closes_at === "23:59:00" && s.closed === false;
  const hasFullWeek =
    days.every(d => openEntries.some(s => Number(s.weekday) === d && isFullDay(s))) && openEntries.length >= 7;
  if (hasFullWeek) {
    return {
      label: "Hours",
      value: "24/7",
      rawValue: schedules,
      emptyLabel: "Set hours",
      urlSuffix: "opening-hours",
      updatedAt: latestDate,
      field: "hours",
      editable: true
    };
  }
  const dayStrings = days.map(day => {
    const dayEntries = openEntries
      .filter(s => Number(s.weekday) === day)
      .sort((a, b) => (a.opens_at || "").localeCompare(b.opens_at || ""));
    if (!dayEntries.length) return { day, str: "Closed" };
    const ranges = dayEntries
      .map(s => formatRangeStr(s.opens_at, s.closes_at))
      .filter(Boolean);
    if (!ranges.length) return { day, str: "Closed" };
    return { day, str: ranges.join("&") };
  });
  const allClosed = dayStrings.every(d => d.str === "Closed");
  if (allClosed) {
    return {
      label: "Hours",
      value: "Closed",
      rawValue: schedules,
      emptyLabel: "Set hours",
      urlSuffix: "opening-hours",
      updatedAt: latestDate,
      field: "hours",
      editable: true
    };
  }
  const segments = [];
  let i = 0;
  while (i < dayStrings.length) {
    const current = dayStrings[i];
    if (current.str === "Closed") {
      i += 1;
      continue;
    }
    let j = i;
    while (j + 1 < dayStrings.length && dayStrings[j + 1].str === current.str) {
      j += 1;
    }
    segments.push({ start: dayStrings[i].day, end: dayStrings[j].day, str: current.str });
    i = j + 1;
  }
  const formatSegment = (seg) => {
    const startName = dayNames[seg.start];
    const endName = dayNames[seg.end];
    const dayLabel = seg.start === seg.end ? startName : `${startName}-${endName}`;
    return `${dayLabel} ${seg.str}`;
  };
  const value = segments.map(formatSegment).join("; ");
  return {
    label: "Hours",
    value,
    rawValue: schedules,
    emptyLabel: "Set hours",
    urlSuffix: "opening-hours",
    updatedAt: latestDate,
    field: "hours",
    editable: true
  };
}
function getServiceQuickEntries(service) {
  const entries = [];
  const ageEntry = formatAgeRequirement(service);
  if (ageEntry) entries.push(ageEntry);
  const hoursEntry = buildHoursEntry(service);
  if (hoursEntry) entries.push(hoursEntry);
  const rawDesc = String(service?.description || "").trim();
  const desc = truncateText(rawDesc, 120);
  const metaDescDate = service?.metadata?.service?.find(f => f.field_name === "description")?.last_action_date;
  entries.push({
    label: "Description",
    value: desc,
    rawValue: rawDesc,
    emptyLabel: "Add description",
    urlSuffix: "description",
    updatedAt: metaDescDate || service?.updatedAt || service?.createdAt,
    field: "description",
    editable: true
  });
  const eventInfos = Array.isArray(service?.EventRelatedInfos) ? service.EventRelatedInfos : [];
  const eventInfo = eventInfos.find(info => info?.event === SERVICE_EDIT_OCCASION) || null;
  const eventText = truncateText((eventInfo?.information || "").trim(), 120);
  entries.push({
    label: "Event info",
    value: eventText,
    rawValue: (eventInfo?.information || "").trim(),
    emptyLabel: "Add event info",
    urlSuffix: "other-info",
    updatedAt: eventInfo?.updatedAt || eventInfo?.createdAt || null,
    field: "eventInfo",
    editable: true
  });
  const requiredDocs = Array.isArray(service?.RequiredDocuments) ? service.RequiredDocuments : [];
  const docNames = requiredDocs
    .map(d => (d?.document || "").trim())
    .filter(name => name && name.toLowerCase() !== "none");
  const docList = formatOxfordList(docNames);
  entries.push({
    label: "Required documents",
    value: docList,
    rawValue: docNames,
    emptyLabel: "Add required documents",
    urlSuffix: "documents/proofs-required",
    updatedAt: pickLatestDate(requiredDocs.map(d => d?.updatedAt || d?.createdAt).filter(Boolean)),
    field: "requiredDocs",
    editable: true
  });
  return entries;
}
