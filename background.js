const GGHOST_PARTS = [
  "gghost.part-1.js",
  "gghost.part-2.js",
  "gghost.part-3.js",
  "gghost.part-4.js",
  "gghost.part-5.js",
  "gghost.part-6.js"
];
const CONTENT_SCRIPTS = [
  {
    id: "dnk-team-map-pins",
    matches: [
      "https://gogetta.nyc/*",
      "https://test.gogetta.nyc/*",
      "https://www.test.gogetta.nyc/*"
    ],
    js: ["teamMapPinsLoader.js"],
    runAt: "document_start"
  },
  {
    id: "dnk-main",
    matches: [
      "https://gogetta.nyc/*",
      "https://gogetta.nyc/*",
      "https://test.gogetta.nyc/*",
      "https://www.test.gogetta.nyc/*",
      "https://yourpeer.nyc/locations*",
      "https://doobneek.org/*",
      "https://*.doobneek.org/*",
      "http://localhost:3000/*",
      "https://doobneek.org/*"
    ],
    excludeMatches: [
      "https://gogetta.nyc/team/location/*",
      "https://test.gogetta.nyc/team/location/*",
      "https://www.test.gogetta.nyc/team/location/*"
    ],
    js: [
      "injector.js",
      "content-script.js",
      "listener.js",
      "autocomplOrg.js",
      "autocompladdy.js",
      "streetview.js",
      "power.js",
      "close.js",
      "telpaste.js",
      "themeOverride.js",
      "minimap.js",
      "recenter.js",
      "autoClicker.js",
      "proofsRequired.js",
      ...GGHOST_PARTS,
      "lastpage.js",
      "snackbar.js",
      "linkValidator.js"
    ],
    css: ["style.css"],
    runAt: "document_idle"
  },
  {
    id: "dnk-team-location-preload",
    matches: [
      "https://gogetta.nyc/team/location/*",
      "https://test.gogetta.nyc/team/location/*",
      "https://www.test.gogetta.nyc/team/location/*"
    ],
    js: ["gghost-loader.js"],
    runAt: "document_start"
  },
  {
    id: "dnk-team-location",
    matches: [
      "https://gogetta.nyc/team/location/*",
      "https://test.gogetta.nyc/team/location/*",
      "https://www.test.gogetta.nyc/team/location/*"
    ],
    js: [
      "injector.js",
      "content-script.js",
      "listener.js",
      "autocomplOrg.js",
      "autocompladdy.js",
      "streetview.js",
      "power.js",
      "close.js",
      "telpaste.js",
      "themeOverride.js",
      "minimap.js",
      "recenter.js",
      "autoClicker.js",
      "proofsRequired.js",
      "lastpage.js",
      "snackbar.js",
      "linkValidator.js"
    ],
    css: ["style.css"],
    runAt: "document_idle"
  },
  {
    id: "dnk-gmail",
    matches: ["https://mail.google.com/*"],
    js: [
      "gmail_injector.js",
      "power.js",
      "themeOverride.js",
      "autoClicker.js",
      "yphost.js"
    ],
    css: ["style.css"],
    runAt: "document_idle"
  },
  {
    id: "dnk-voice",
    matches: ["https://voice.google.com/*"],
    js: ["buttoncall.js"],
    runAt: "document_idle"
  },
  {
    id: "dnk-yphost",
    matches: ["https://yourpeer.nyc/locations*"],
    js: ["yphost.js"],
    runAt: "document_idle",
    allFrames: true
  },
  {
    id: "dnk-all-urls",
    matches: ["<all_urls>"],
    js: ["tel.js", "tesser.js", "linkHighlighter.js"],
    runAt: "document_idle"
  }
];
const CONTENT_SCRIPT_IDS = CONTENT_SCRIPTS.map((script) => script.id);
let extensionPaused = false;
const gghostInjectedTabs = new Set();
const GGHOST_TEAM_URL_RE = /^https:\/\/(?:www\.)?(?:test\.)?gogetta\.nyc\/team\/location\/[0-9a-f-]+/i;
const REMINDERS_URL = "https://us-central1-streetli.cloudfunctions.net/locationNote1?uuid=reminders";
const REMINDERS_ENABLED = false;
const FIREBASE_REMINDERS_URL = "https://streetli-default-rtdb.firebaseio.com/locationNotes.json";
const REMINDERS_CACHE_KEY = "remindersCache";
const REMINDERS_FETCH_TIMEOUT_MS = 8000;
const REMINDERS_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const REMINDERS_ALARM_NAME = "refreshReminders";
const REMINDERS_POLL_MINUTES = 5;
const LOCATION_NOTES_BASE_URL = "https://streetli-default-rtdb.firebaseio.com/locationNotes";
const NOTES_CACHE_PREFIX = "ggNotesCache:";
const NOTES_PREVIEW_PREFIX = "ggNotesPreview:";
const NOTES_CACHE_TTL_MS = 2 * 60 * 1000;
const NOTES_PREFETCH_TIMEOUT_MS = 5000;
const TEAM_LOCATION_URL_RE = /^https:\/\/(?:www\.)?(?:test\.)?gogetta\.nyc\/team\/location\/([0-9a-f-]+)/i;
const notesPrefetchInFlight = new Map();
const notesPrefetchLast = new Map();
let remindersRefreshInFlight = null;
function isDoneBy(note = "") {
  return /\bDone by [a-zA-Z]+$/.test(note.trim());
}
function buildRemindersUrl(extraParams = {}) {
  const url = new URL(REMINDERS_URL);
  Object.entries(extraParams).forEach(([key, value]) => {
    if (value == null) return;
    url.searchParams.set(key, String(value));
  });
  return url.toString();
}
async function fetchJsonWithTimeout(url, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { cache: "no-store", signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    if (err && err.name === "AbortError") {
      throw new Error(`Fetch timeout after ${timeoutMs}ms`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
async function fetchRemindersFromApi() {
  return fetchJsonWithTimeout(buildRemindersUrl(), REMINDERS_FETCH_TIMEOUT_MS);
}
async function fetchRemindersFromFirebase() {
  return fetchJsonWithTimeout(FIREBASE_REMINDERS_URL, REMINDERS_FETCH_TIMEOUT_MS);
}
function getNotesCacheKey(uuid) {
  return `${NOTES_CACHE_PREFIX}${uuid}`;
}
function getNotesPreviewKey(uuid) {
  return `${NOTES_PREVIEW_PREFIX}${uuid}`;
}
function extractLocationUuid(url) {
  if (!url) return null;
  const match = url.match(TEAM_LOCATION_URL_RE);
  return match ? match[1].toLowerCase() : null;
}
function pickLatestNoteEntry(data) {
  if (!data || typeof data !== "object") return null;
  let latestDate = null;
  let latestUser = null;
  let latestNote = null;
  for (const user in data) {
    const dateMap = data[user];
    if (!dateMap || typeof dateMap !== "object") continue;
    for (const date in dateMap) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
      if (!latestDate || date > latestDate) {
        latestDate = date;
        latestUser = user;
        latestNote = dateMap[date];
      }
    }
  }
  if (!latestDate) return null;
  return { user: latestUser, date: latestDate, note: latestNote };
}
async function prefetchNotes(uuid, { force = false } = {}) {
  if (!uuid || !chrome?.storage?.local) return null;
  const key = uuid.toLowerCase();
  if (!force) {
    const last = notesPrefetchLast.get(key);
    if (last && Date.now() - last < NOTES_CACHE_TTL_MS) return null;
  }
  if (notesPrefetchInFlight.has(key)) {
    return notesPrefetchInFlight.get(key);
  }
  const task = (async () => {
    const now = Date.now();
    const cacheKey = getNotesCacheKey(key);
    const previewKey = getNotesPreviewKey(key);
    if (!force) {
      try {
        const cached = await chrome.storage.local.get(cacheKey);
        const ts = Number(cached?.[cacheKey]?.ts) || 0;
        if (ts && now - ts < NOTES_CACHE_TTL_MS) {
          notesPrefetchLast.set(key, now);
          return;
        }
      } catch {
        // ignore cache read failures
      }
    }
    try {
      const data = await fetchJsonWithTimeout(`${LOCATION_NOTES_BASE_URL}/${key}.json`, NOTES_PREFETCH_TIMEOUT_MS);
      if (!data || typeof data !== "object") return;
      const latest = pickLatestNoteEntry(data);
      const payload = { [cacheKey]: { ts: now, data } };
      if (latest) {
        payload[previewKey] = { ts: now, latest };
      }
      await chrome.storage.local.set(payload);
    } catch (err) {
      const errMessage = err?.message || String(err || "unknown error");
      console.warn("[Background] Notes prefetch failed:", errMessage);
    } finally {
      notesPrefetchLast.set(key, Date.now());
    }
  })();
  notesPrefetchInFlight.set(key, task);
  return task.finally(() => {
    notesPrefetchInFlight.delete(key);
  });
}
function buildReminderList(data) {
  const reminders = [];
  if (!data || typeof data !== "object") return reminders;
  for (const uuid in data) {
    const locationData = data[uuid];
    if (locationData && typeof locationData === "object" && locationData.reminder) {
      for (const date in locationData.reminder) {
        const note = locationData.reminder[date];
        if (isDoneBy(note)) continue;
        reminders.push({ uuid, date, note });
      }
    }
  }
  reminders.sort((a, b) => a.date.localeCompare(b.date));
  return reminders;
}
async function readRemindersCache() {
  try {
    const payload = await chrome.storage.local.get(REMINDERS_CACHE_KEY);
    const cached = payload[REMINDERS_CACHE_KEY];
    if (!cached || !Array.isArray(cached.reminders)) return null;
    if (cached.ts && (Date.now() - cached.ts) > REMINDERS_CACHE_TTL_MS) return null;
    return cached.reminders;
  } catch (err) {
    console.warn("[Background] Failed to read reminders cache:", err);
    return null;
  }
}
async function writeRemindersCache(reminders) {
  try {
    await chrome.storage.local.set({
      [REMINDERS_CACHE_KEY]: { ts: Date.now(), reminders }
    });
  } catch (err) {
    console.warn("[Background] Failed to store reminders cache:", err);
  }
}
function updateReminderBadge(reminders) {
  const list = Array.isArray(reminders) ? reminders : [];
  const today = new Date().toISOString().split("T")[0];
  const upcoming = list.filter((r) => r.date >= today);
  const count = upcoming.length;
  const text = count > 0 ? String(count) : "";
  chrome.action.setBadgeText({ text });
  chrome.action.setBadgeBackgroundColor({ color: "#f44336" });
}
function refreshReminders() {
  if (!REMINDERS_ENABLED) {
    return (async () => {
      const cachedReminders = await readRemindersCache();
      if (cachedReminders) {
        updateReminderBadge(cachedReminders);
        return;
      }
      updateReminderBadge([]);
    })();
  }
  if (remindersRefreshInFlight) return remindersRefreshInFlight;
  remindersRefreshInFlight = (async () => {
    let data = null;
    try {
      data = await fetchRemindersFromApi();
    } catch (err) {
      const errMessage = err?.message || String(err || "unknown error");
      console.warn("[Background] Reminders API failed:", errMessage);
      try {
        data = await fetchRemindersFromFirebase();
      } catch (fbErr) {
        const fbMessage = fbErr?.message || String(fbErr || "unknown error");
        console.warn("[Background] Failed to fetch reminders:", fbMessage);
      }
    }
    if (data) {
      const reminders = buildReminderList(data);
      await writeRemindersCache(reminders);
      updateReminderBadge(reminders);
      return;
    }
    const cachedReminders = await readRemindersCache();
    if (cachedReminders) {
      updateReminderBadge(cachedReminders);
      return;
    }
    updateReminderBadge([]);
  })();
  return remindersRefreshInFlight.finally(() => {
    remindersRefreshInFlight = null;
  });
}
function ensureRemindersAlarm() {
  if (!REMINDERS_ENABLED) {
    chrome.alarms.clear(REMINDERS_ALARM_NAME);
    return;
  }
  chrome.alarms.get(REMINDERS_ALARM_NAME, (alarm) => {
    if (!alarm) {
      chrome.alarms.create(REMINDERS_ALARM_NAME, { periodInMinutes: REMINDERS_POLL_MINUTES });
    }
  });
}
async function unregisterContentScriptsSafe() {
  try {
    await chrome.scripting.unregisterContentScripts({ ids: CONTENT_SCRIPT_IDS });
  } catch (err) {
    const lastError = chrome.runtime.lastError;
    if (lastError) {
      console.warn("[Background] unregisterContentScripts failed:", lastError.message);
    } else if (err) {
      console.warn("[Background] unregisterContentScripts failed:", err);
    }
  }
}
async function registerContentScriptsSafe() {
  const scripts = CONTENT_SCRIPTS.map((script) => ({
    ...script,
    persistAcrossSessions: true
  }));
  try {
    await chrome.scripting.registerContentScripts(scripts);
  } catch (err) {
    const lastError = chrome.runtime.lastError;
    if (lastError) {
      console.warn("[Background] registerContentScripts failed:", lastError.message);
    } else if (err) {
      console.warn("[Background] registerContentScripts failed:", err);
    }
  }
}
async function loadPausedState() {
  const data = await chrome.storage.local.get("extensionPaused");
  extensionPaused = !!data.extensionPaused;
  return extensionPaused;
}
async function initializeContentScripts() {
  await loadPausedState();
  if (extensionPaused) {
    await unregisterContentScriptsSafe();
  } else {
    await unregisterContentScriptsSafe();
    await registerContentScriptsSafe();
  }
}
async function setExtensionPaused(paused) {
  extensionPaused = !!paused;
  await chrome.storage.local.set({ extensionPaused });
  if (extensionPaused) {
    await unregisterContentScriptsSafe();
  } else {
    await unregisterContentScriptsSafe();
    await registerContentScriptsSafe();
  }
}
loadPausedState().catch((err) => {
  console.warn("[Background] Failed to load pause state:", err);
});
try {
  if (chrome?.runtime?.onInstalled) {
    chrome.runtime.onInstalled.addListener(() => {
  initializeContentScripts().catch((err) => {
    console.warn("[Background] Failed to register content scripts on install:", err);
    });
    });
  }
} catch (err) {
  console.warn("[Background] Failed to register onInstalled handler:", err);
}
  ensureRemindersAlarm();
  refreshReminders().catch((err) => {
    console.warn("[Background] Failed to refresh reminders on install:", err);
  });
chrome.runtime.onStartup.addListener(() => {
  initializeContentScripts().catch((err) => {
    console.warn("[Background] Failed to register content scripts on startup:", err);
  });
  ensureRemindersAlarm();
  refreshReminders().catch((err) => {
    console.warn("[Background] Failed to refresh reminders on startup:", err);
  });
});
chrome.alarms.onAlarm.addListener((alarm) => {
  if (!REMINDERS_ENABLED) return;
  if (alarm && alarm.name === REMINDERS_ALARM_NAME) {
    refreshReminders().catch((err) => {
      console.warn("[Background] Failed to refresh reminders on alarm:", err);
    });
  }
});
function maybeRedirect(details) {
  if (extensionPaused) return;
  chrome.storage.local.get("redirectEnabled", (data) => {
    const redirectEnabled = data.redirectEnabled;
    const url = details.url;
    const match = url.match(/^https:\/\/gogetta\.nyc\/team\/location\/([a-f0-9-]+)\/recap$/);
    if (match) {
      let newUrl;
      if (redirectEnabled) {
        newUrl = `https://gogetta.nyc/team/location/${match[1]}/services/recap`;
        console.log(`[Redirect] Redirecting to: ${newUrl}`);
      } else {
        newUrl = `https://gogetta.nyc/team/location/${match[1]}`;
        console.log(`[Redirect] Redirecting to: ${newUrl}`);
      }
      chrome.tabs.update(details.tabId, { url: newUrl });
    }
  });
}
function maybePrefetchNotes(details) {
  if (extensionPaused) return;
  const uuid = extractLocationUuid(details?.url || "");
  if (!uuid) return;
  void prefetchNotes(uuid);
}
chrome.webNavigation.onBeforeNavigate.addListener(maybeRedirect, {
  url: [
    { hostEquals: "gogetta.nyc", pathPrefix: "/team/location/" },
    { hostEquals: "gogetta.nyc", pathPrefix: "/team/location/" }
  ]
});
chrome.webNavigation.onHistoryStateUpdated.addListener(maybeRedirect, {
  url: [
    { hostEquals: "gogetta.nyc", pathPrefix: "/team/location/" },
    { hostEquals: "gogetta.nyc", pathPrefix: "/team/location/" }
  ]
});
chrome.webNavigation.onHistoryStateUpdated.addListener(maybePrefetchNotes, {
  url: [
    { hostEquals: "gogetta.nyc", pathPrefix: "/team/location/" },
    { hostEquals: "gogetta.nyc", pathPrefix: "/team/location/" }
  ]
});
chrome.webNavigation.onCommitted.addListener((details) => {
  if (details.frameId !== 0) return;
  gghostInjectedTabs.delete(details.tabId);
  maybePrefetchNotes(details);
});
chrome.tabs.onRemoved.addListener((tabId) => {
  gghostInjectedTabs.delete(tabId);
});
// chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
//   if (msg.type === 'fetchFindHtml') {
//     const url = `https://gogetta.nyc/find/location/${msg.uuid}`;
//     fetch(url, { credentials: 'include' })
//       .then(res => res.text())
//       .then(html => sendResponse({ success: true, html }))
//       .catch(err => {
//         console.error('[Background] Fetch Find failed:', err);
//         sendResponse({ success: false });
//       });
//     return true;
//   }
//   if (msg.type === 'fetchYourPeerSearch') {
//     const name = encodeURIComponent(msg.name);
//     const page = msg.page || 1;
//     const url = `https://yourpeer.nyc/locations?search=${name}${page > 1 ? `&page=${page}` : ''}`;
//     fetch(url)
//       .then(res => res.text())
//       .then(html => sendResponse({ success: true, html }))
//       .catch(err => {
//         console.error('[Background] YP fetch failed:', err);
//         sendResponse({ success: false, error: err.toString() });
//       });
//     return true;
//   }
//   if (msg.type === 'verifyYourPeerUrl') {
//     fetch(msg.url, { credentials: 'include' })
//       .then(res => res.text())
//       .then(html => {
//         const isValid = !html.includes('Oops!') && !html.includes("We can't seem to find");
//         sendResponse({ success: true, valid: isValid });
//       })
//       .catch(err => {
//         console.error('[Background] YP verify failed:', err);
//         sendResponse({ success: false, error: err.toString() });
//       });
//     return true;
//   }
// });
// chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
//   if (request.type === "setBadge") {
//     const text = request.count > 0 ? String(request.count) : "";
//     chrome.action.setBadgeText({ text });
//     chrome.action.setBadgeBackgroundColor({ color: "#f44336" });
//   }
// });
// chrome.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
//   if (message.type === 'getAddressSuggestions') {
//     const input = message.input;
//     const API_KEY = '';
//     const url = `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(input)}&types=address&location=40.7128,-74.0060&radius=30000&key=${API_KEY}`;
//     try {
//       const res = await fetch(url);
//       const data = await res.json();
//       console.log('[YP] ✅ Responding with:', data.predictions);
//       sendResponse({ predictions: data.predictions || [] });
//     } catch (err) {
//       console.warn('[YP] ❌ Fetch error:', err);
//       sendResponse({ predictions: [] });
//     }
//     return true; // ✅ THIS LINE IS CRITICAL
//   }
// });
const STREETVIEW_CACHE_MS = 60 * 1000;
const streetViewCache = new Map();
const streetViewInFlight = new Map();
function normalizeCityName(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  const lower = text.toLowerCase();
  return lower.replace(/(^|[\s-])([a-z])/g, (match, sep, letter) => `${sep}${letter.toUpperCase()}`);
}
function normalizeLocationCity(data) {
  if (!data || typeof data !== 'object') return;
  if (data.address && typeof data.address === 'object' && data.address.city) {
    data.address.city = normalizeCityName(data.address.city);
  }
  if (data.Address && typeof data.Address === 'object' && data.Address.city) {
    data.Address.city = normalizeCityName(data.Address.city);
  }
  const physical = data.PhysicalAddresses?.[0];
  if (physical && physical.city) {
    physical.city = normalizeCityName(physical.city);
  }
}
function getStreetViewApiKey() {
  return new Promise((resolve) => {
    if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
      resolve(null);
      return;
    }
    chrome.storage.local.get(['googleMapsApiKey'], (result) => {
      const rawKey = result && typeof result.googleMapsApiKey === 'string'
        ? result.googleMapsApiKey.trim()
        : '';
      resolve(rawKey || null);
    });
  });
}
function fetchStreetViewLocation(uuid) {
  if (!uuid) {
    return Promise.reject(new Error("Missing UUID for street view fetch"));
  }
  const now = Date.now();
  const cached = streetViewCache.get(uuid);
  if (cached && now - cached.timestamp < STREETVIEW_CACHE_MS) {
    return Promise.resolve(cached.data);
  }
  const inFlight = streetViewInFlight.get(uuid);
  if (inFlight) {
    return inFlight;
  }
  const apiUrl = `https://w6pkliozjh.execute-api.us-east-1.amazonaws.com/prod/locations/${uuid}`;
  const request = fetch(apiUrl)
    .then(res => {
      if (!res.ok) throw new Error('Failed to fetch location data');
      return res.json();
    })
    .then(data => {
      normalizeLocationCity(data);
      streetViewCache.set(uuid, { data, timestamp: Date.now() });
      return data;
    })
    .finally(() => {
      streetViewInFlight.delete(uuid);
    });
  streetViewInFlight.set(uuid, request);
  return request;
}
function decodeBasicEntities(text) {
  return text
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}
function extractTextFromHtml(html) {
  if (typeof DOMParser !== 'undefined') {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    doc.querySelectorAll('script, style, noscript').forEach(el => el.remove());
    return (doc.body ? doc.body.textContent : doc.textContent || '');
  }
  const withoutScripts = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ');
  const withoutTags = withoutScripts.replace(/<\/?[^>]+>/g, ' ');
  return decodeBasicEntities(withoutTags);
}
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "GET_TAB_ID") {
    sendResponse({ tabId: sender?.tab?.id ?? null });
    return true;
  }
  if (msg.type === "PREFETCH_NOTES") {
    prefetchNotes(msg?.uuid, { force: !!msg?.force })
      .then(() => sendResponse({ ok: true }))
      .catch((err) => {
        sendResponse({ ok: false, error: err?.message || String(err) });
      });
    return true;
  }
  if (msg.type === "SET_EXTENSION_PAUSED") {
    setExtensionPaused(msg.paused)
      .then(() => sendResponse({ ok: true, paused: !!msg.paused }))
      .catch((err) => {
        console.error("[Background] Failed to update pause state:", err);
        sendResponse({ ok: false, error: err?.message || String(err) });
      });
    return true;
  }
  if (msg.type === "GET_EXTENSION_PAUSED") {
    sendResponse({ paused: extensionPaused });
    return true;
  }
  if (msg.type === "INJECT_GGHOST") {
    const tabId = sender?.tab?.id;
    const tabUrl = sender?.tab?.url || "";
    if (!tabId) {
      sendResponse({ ok: false, error: "Missing tabId" });
      return true;
    }
    if (tabUrl && !GGHOST_TEAM_URL_RE.test(tabUrl)) {
      sendResponse({ ok: false, error: "Not a team location url" });
      return true;
    }
    if (gghostInjectedTabs.has(tabId)) {
      sendResponse({ ok: true, skipped: true });
      return true;
    }
    gghostInjectedTabs.add(tabId);
    chrome.scripting.executeScript({
      target: { tabId },
      files: GGHOST_PARTS
    }).then(() => {
      sendResponse({ ok: true });
    }).catch((err) => {
      gghostInjectedTabs.delete(tabId);
      sendResponse({ ok: false, error: err?.message || String(err) });
    });
    return true;
  }
  if (msg.type === "INJECT_TEAM_MAP_PINS_PAGE") {
    const tabId = sender?.tab?.id;
    if (!tabId) {
      sendResponse({ ok: false, error: "Missing tabId" });
      return true;
    }
    chrome.scripting.executeScript({
      target: { tabId },
      files: ["teamMapPinsPage.js"],
      world: "MAIN"
    }).then(() => {
      sendResponse({ ok: true });
    }).catch((err) => {
      sendResponse({ ok: false, error: err?.message || String(err) });
    });
    return true;
  }
  if (msg.type === 'FETCH_LOCATION_DETAILS') {
    const uuid = msg.uuid;
    if (!uuid) {
      sendResponse({ ok: false, error: 'Missing uuid' });
      return true;
    }
    const url = `https://w6pkliozjh.execute-api.us-east-1.amazonaws.com/prod/locations/${uuid}`;
    const headers = msg.headers && typeof msg.headers === 'object' ? msg.headers : {};
    fetch(url, { headers })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => {
        sendResponse({ ok: true, data });
      })
      .catch((err) => {
        sendResponse({ ok: false, error: err?.message || String(err) });
      });
    return true;
  }
  if (msg.type === 'FETCH_LOCATIONS_BY_RADIUS') {
    const query = msg?.query || {};
    const url = new URL('https://w6pkliozjh.execute-api.us-east-1.amazonaws.com/prod/locations');
    if (query.latitude != null) {
      url.searchParams.set('latitude', query.latitude);
    }
    if (query.longitude != null) {
      url.searchParams.set('longitude', query.longitude);
    }
    if (query.radius != null) {
      url.searchParams.set('radius', query.radius);
    }
    if (query.maxResults != null) {
      url.searchParams.set('maxResults', query.maxResults);
    }
    fetch(url.toString())
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => {
        sendResponse({ ok: true, data });
      })
      .catch((err) => {
        sendResponse({ ok: false, error: err?.message || String(err) });
      });
    return true;
  }
  if (msg.type === 'BACKGROUND_FETCH') {
    const url = msg?.url;
    if (!url) {
      sendResponse({
        ok: false,
        status: 0,
        statusText: 'Missing url',
        body: '',
        headers: {}
      });
      return true;
    }
    const options = msg?.options && typeof msg.options === 'object' ? msg.options : {};
    fetch(url, options)
      .then(async (res) => {
        const text = await res.text();
        sendResponse({
          ok: res.ok,
          status: res.status,
          statusText: res.statusText,
          body: text,
          headers: { 'content-type': res.headers.get('content-type') || '' }
        });
      })
      .catch((err) => {
        sendResponse({
          ok: false,
          status: 0,
          statusText: err?.message || 'fetch failed',
          body: '',
          headers: {}
        });
      });
    return true;
  }
  if (msg.type === 'SERVICE_TAXONOMY_UPDATE') {
    const { url, method, headers, body, credentials, mode } = msg || {};
    const options = { method, headers, body };
    if (credentials) options.credentials = credentials;
    if (mode) options.mode = mode;
    fetch(url, options)
      .then(async (res) => {
        const text = await res.text();
        sendResponse({
          ok: res.ok,
          status: res.status,
          statusText: res.statusText,
          body: text,
          headers: { 'content-type': res.headers.get('content-type') || '' }
        });
      })
      .catch((err) => {
        sendResponse({
          ok: false,
          status: 0,
          statusText: err?.message || 'fetch failed',
          body: '',
          headers: {}
        });
      });
    return true;
  }
  if (msg.type === 'fetchFindHtml') {
    const url = `https://gogetta.nyc/find/location/${msg.uuid}`;
    fetch(url, { credentials: 'include' })
      .then(res => res.text())
      .then(html => sendResponse({ success: true, html }))
      .catch(err => {
        console.error('[Background] Fetch Find failed:', err);
        sendResponse({ success: false });
      });
    return true;
  }
  if (msg.type === 'fetchYourPeerSearch') {
    const name = encodeURIComponent(msg.name);
    const page = msg.page || 1;
    const url = `https://yourpeer.nyc/locations?search=${name}${page > 1 ? `&page=${page}` : ''}`;
    fetch(url)
      .then(res => res.text())
      .then(html => sendResponse({ success: true, html }))
      .catch(err => {
        console.error('[Background] YP fetch failed:', err);
        sendResponse({ success: false, error: err.toString() });
      });
    return true;
  }
  if (msg.type === 'verifyYourPeerUrl') {
    fetch(msg.url, { credentials: 'include' })
      .then(res => res.text())
      .then(html => {
        const normalizedHtml = html.replace(/[\u2018\u2019\uFFFD]/g, "'");
        const isValid = !normalizedHtml.includes('Oops!') && !normalizedHtml.includes("We can't seem to find");
        sendResponse({ success: true, valid: isValid });
      })
      .catch(err => {
        console.error('[Background] YP verify failed:', err);
        sendResponse({ success: false, error: err.toString() });
      });
    return true;
  }
  if (msg.type === 'setBadge') {
    const text = msg.count > 0 ? String(msg.count) : "";
    chrome.action.setBadgeText({ text });
    chrome.action.setBadgeBackgroundColor({ color: "#f44336" });
    // No async, so no need for return true
  }
if (msg.type === 'getAddressSuggestions') {
  const input = encodeURIComponent(msg.input);
  const proxyUrl = `https://us-central1-streetli.cloudfunctions.net/placesProxy?input=${input}`;
  fetch(proxyUrl)
    .then(res => res.json())
    .then(data => {
      console.log('[YP] ✅ Responding with:', data.predictions);
      sendResponse({ predictions: data.predictions || [] });
    })
    .catch(err => {
      console.warn('[YP] ❌ Proxy fetch error:', err);
      sendResponse({ predictions: [] });
    });
  return true;
}
if (msg.type === 'showStreetView') {
    const uuid = msg.uuid;
    console.log('[Background] Fetching Street View data for UUID:', uuid);
    fetchStreetViewLocation(uuid)
      .then(async data => {
        const apiKey = await getStreetViewApiKey();
        console.log('[Background] Location data fetched, injecting Street View script');
        // Inject script with error handling
        chrome.scripting.executeScript({
          target: { tabId: sender.tab.id },
          files: ['streetview.js'],
          world: 'MAIN'
        }).then(() => {
          // Wait a bit for script to load before executing function
          setTimeout(() => {
            chrome.scripting.executeScript({
              target: { tabId: sender.tab.id },
              function: (locationData, apiKey) => {
                if (typeof createStreetViewPicker === 'function') {
                  createStreetViewPicker(locationData, apiKey);
                } else {
                  console.error('createStreetViewPicker function not found');
                }
              },
              args: [data, apiKey || null],
              world: 'MAIN'
            }).catch(err => {
              console.error('[Background] Street View function execution failed:', err);
            });
          }, 100);
        }).catch(err => {
          console.error('[Background] Street View script injection failed:', err);
        });
      })
      .catch(err => {
        console.error('[Background] Street View fetch failed:', err);
      });
    return true;
  }
if (msg.type === 'getPlaceDetails') {
  const placeId = encodeURIComponent(msg.placeId);
  const proxyUrl = `https://us-central1-streetli.cloudfunctions.net/placesProxy?placeId=${placeId}`;
  fetch(proxyUrl)
    .then(res => res.json())
    .then(data => {
      const location = data.result?.geometry?.location;
      if (location) {
        sendResponse({ success: true, location });
      } else {
        sendResponse({ success: false, error: 'No location found' });
      }
    })
    .catch(err => {
      console.error('[Background] Place details fetch failed:', err);
      sendResponse({ success: false, error: err.toString() });
    });
  return true;
}
  // Check URL status for link validator using Cloud Function
  if (msg.type === 'CHECK_URL_STATUS') {
    const url = msg.url;
    console.log('[LinkValidator] Checking URL via Cloud Function:', url);
    // Note: Cloud Run URLs are case-sensitive, use exact URL from deployment
    const CLOUD_FUNCTION_URL = 'https://checkwebsitestatus-iygwucy2fa-uc.a.run.app';
    // Retry logic with progressive timeouts
    const attemptCheck = async (retryCount = 0, timeout = 10000) => {
      const maxRetries = 2;
      try {
        console.log(`[LinkValidator] Attempt ${retryCount + 1}/${maxRetries + 1} with ${timeout}ms timeout for:`, url);
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);
        const res = await fetch(CLOUD_FUNCTION_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ url, timeout }),
          signal: controller.signal
        });
        clearTimeout(timeoutId);
        // Check if response is JSON
        const contentType = res.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
          const text = await res.text();
          console.error('[LinkValidator] Cloud Function returned non-JSON response:', text.substring(0, 200));
          throw new Error('Cloud Function returned HTML instead of JSON.');
        }
        const data = await res.json();
        console.log('[LinkValidator] URL check result:', data);
        sendResponse({
          status: data.ok ? 'valid' : 'broken',
          isHttps: data.isHttps,
          workingUrl: data.url || url,
          httpStatus: data.status
        });
      } catch (err) {
        console.warn(`[LinkValidator] Attempt ${retryCount + 1} failed:`, err.message);
        // Retry with longer timeout if we haven't exceeded max retries
        if (retryCount < maxRetries) {
          const nextTimeout = timeout + 5000; // Add 5 seconds for each retry
          console.log(`[LinkValidator] Retrying with ${nextTimeout}ms timeout...`);
          await attemptCheck(retryCount + 1, nextTimeout);
        } else {
          console.error('[LinkValidator] All retry attempts failed for:', url);
          sendResponse({ status: 'unknown', isHttps: false, workingUrl: url });
        }
      }
    };
    attemptCheck();
    return true;
  }
  // Proxy website for link validator preview
  if (msg.type === 'PROXY_WEBSITE') {
    const url = msg.url;
    console.log('[LinkValidator] Proxying website:', url);
    // Note: Cloud Run URLs are case-sensitive, use exact URL from deployment
    const PROXY_URL = 'https://proxywebsite-iygwucy2fa-uc.a.run.app';
    const proxyUrl = `${PROXY_URL}?url=${encodeURIComponent(url)}`;
    fetch(proxyUrl)
      .then(async res => {
        if (!res.ok) {
          const text = await res.text();
          console.error('[LinkValidator] Proxy endpoint error:', res.status, text.substring(0, 200));
          throw new Error(`Proxy returned ${res.status}`);
        }
        // Check content type
        const contentType = res.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
          // Error response in JSON format
          const json = await res.json();
          throw new Error(json.error || 'Proxy failed');
        }
        return res.text();
      })
      .then(html => {
        console.log('[LinkValidator] Website proxied successfully');
        sendResponse({ success: true, html });
      })
      .catch(err => {
        console.error('[LinkValidator] Proxy failed:', err);
        sendResponse({ success: false, error: err.toString() });
      });
    return true;
  }
  // AI-powered page content analysis for link validator
  if (msg.type === 'ANALYZE_PAGE_CONTENT') {
    const url = msg.url;
    console.log('[LinkValidator] Analyzing page content with AI:', url);
    fetch(url)
      .then(res => res.text())
      .then(html => {
        const text = extractTextFromHtml(html).toLowerCase();
        // AI-powered analysis using pattern matching
        const analysis = analyzePageText(text, url);
        console.log('[LinkValidator] AI Analysis result:', analysis);
        sendResponse({ success: true, analysis });
      })
      .catch(err => {
        console.error('[LinkValidator] Page analysis failed:', err);
        sendResponse({ success: false, analysis: null });
      });
    return true;
  }
  // Fallback — prevent "port closed" errors if no handler matched
  return false;
});
/**
 * Analyzes page text content to detect if page is invalid/closed
 * Uses pattern matching to identify common phrases
 */
function analyzePageText(text, url) {
  const patterns = {
    closed: [
      /form (is|has been)?\s*(no longer|closed|not)\s*(accepting|available)/i,
      /no longer accepting (responses|applications|submissions)/i,
      /this (form|page|survey) (is|has been)?\s*(closed|disabled|deactivated)/i,
      /applications? (are|is)?\s*(closed|not being accepted)/i,
      /(registration|enrollment|signup)\s*(has|is)?\s*(closed|ended)/i,
      /deadline has passed/i,
      /submissions? (are|is)?\s*closed/i
    ],
    invalid: [
      /page (not found|cannot be found|does not exist)/i,
      /404\s*error/i,
      /(content|page|resource)\s*(was|has been)?\s*(removed|deleted)/i,
      /this page (is|has been)?\s*discontinued/i,
      /link (is|has)?\s*(expired|invalid|broken)/i,
      /(access|permission)\s*denied/i,
      /unauthorized/i
    ],
    unavailable: [
      /temporarily unavailable/i,
      /under maintenance/i,
      /service unavailable/i,
      /site (is|has been)?\s*down/i
    ]
  };
  let matchedType = null;
  let matchedPattern = null;
  // Check for closed forms/pages
  for (const pattern of patterns.closed) {
    if (pattern.test(text)) {
      matchedType = 'closed';
      matchedPattern = pattern.source;
      break;
    }
  }
  // Check for invalid/removed pages
  if (!matchedType) {
    for (const pattern of patterns.invalid) {
      if (pattern.test(text)) {
        matchedType = 'invalid';
        matchedPattern = pattern.source;
        break;
      }
    }
  }
  // Check for temporarily unavailable
  if (!matchedType) {
    for (const pattern of patterns.unavailable) {
      if (pattern.test(text)) {
        matchedType = 'unavailable';
        matchedPattern = pattern.source;
        break;
      }
    }
  }
  if (matchedType) {
    let reason = '';
    let isClosed = false;
    let isInvalid = false;
    if (matchedType === 'closed') {
      reason = 'Form/page is no longer accepting responses';
      isClosed = true;
    } else if (matchedType === 'invalid') {
      reason = 'Page not found or has been removed';
      isInvalid = true;
    } else if (matchedType === 'unavailable') {
      reason = 'Page is temporarily unavailable';
      isInvalid = true;
    }
    return {
      isClosed,
      isInvalid,
      reason,
      confidence: 'high',
      summary: `Detected pattern: ${matchedPattern.substring(0, 50)}...`
    };
  }
  // No problematic patterns found
  return {
    isClosed: false,
    isInvalid: false,
    reason: null,
    confidence: 'medium',
    summary: 'Page appears to be active and accessible'
  };
}

