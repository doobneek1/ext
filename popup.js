// Cognito token utility functions
function getCognitoTokens() {
  try {
    const storage = localStorage;
    let accessToken = null;
    let idToken = null;
    let refreshToken = null;
    let username = null;
    // Find Cognito tokens by scanning localStorage
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (key && key.startsWith('CognitoIdentityServiceProvider.')) {
        if (key.includes('.accessToken')) {
          accessToken = storage.getItem(key);
        } else if (key.includes('.idToken')) {
          idToken = storage.getItem(key);
        } else if (key.includes('.refreshToken')) {
          refreshToken = storage.getItem(key);
        } else if (key.includes('.LastAuthUser')) {
          username = storage.getItem(key);
        }
      }
    }
    return { accessToken, idToken, refreshToken, username };
  } catch (error) {
    console.warn('[getCognitoTokens] Error accessing localStorage:', error);
    return { accessToken: null, idToken: null, refreshToken: null, username: null };
  }
}
document.addEventListener("DOMContentLoaded", async () => {
  const REMINDERS_URL = "https://us-central1-streetli.cloudfunctions.net/locationNote1?uuid=reminders";
  const FIREBASE_REMINDERS_URL = "https://streetli-default-rtdb.firebaseio.com/locationNotes.json";
  const REMINDERS_CACHE_KEY = "remindersCache";
  const REMINDERS_FETCH_TIMEOUT_MS = 8000;
  const REMINDERS_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
  const REMINDERS_STREAM_MAX_ERRORS = 2;
  const allReminders = [];
  let remindersEventSource = null;
  let remindersStreamLastEtag = null;
  let remindersStreamErrorCount = 0;
  let remindersStreamDisabled = false;
  const pauseBtn = document.getElementById("pauseExtensionBtn");
  const TABLE_EMBED_ORIGIN_KEY = "sheetsEmbedOrigin";
  const TABLE_DEFAULT_ORIGIN = "http://sheets.localhost:3210";
  const TABLE_LOCAL_ORIGINS = [
    "http://sheets.localhost:3210",
    "https://sheets.localhost:3210"
  ];
  const TABLE_TEST_PATH = "/favicon.ico";
  const TABLE_FETCH_TIMEOUT_MS = 900;
  const isTableOriginReachable = async (origin) => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TABLE_FETCH_TIMEOUT_MS);
    const normalized = origin.replace(/\/+$/, "");
    try {
      await fetch(`${normalized}${TABLE_TEST_PATH}`, {
        mode: "no-cors",
        cache: "no-store",
        credentials: "omit",
        signal: controller.signal
      });
      return true;
    } catch {
      return false;
    } finally {
      clearTimeout(timeoutId);
    }
  };
  function setPauseButton(paused) {
    if (!pauseBtn) return;
    pauseBtn.textContent = paused ? "Resume Extension" : "Pause Extension";
    pauseBtn.dataset.paused = paused ? "true" : "false";
  }
  const { extensionPaused } = await chrome.storage.local.get("extensionPaused");
  setPauseButton(!!extensionPaused);
  if (pauseBtn) {
    pauseBtn.addEventListener("click", async () => {
      const isPaused = pauseBtn.dataset.paused === "true";
      const nextPaused = !isPaused;
      pauseBtn.disabled = true;
      try {
        const response = await chrome.runtime.sendMessage({
          type: "SET_EXTENSION_PAUSED",
          paused: nextPaused
        });
        if (response && response.ok === false) {
          console.warn("[popup] Failed to update pause state:", response.error);
        }
      } catch (error) {
        console.warn("[popup] Failed to update pause state:", error);
      } finally {
        setPauseButton(nextPaused);
        pauseBtn.disabled = false;
      }
    });
  }
  // 👇 helper to detect "done by <letters>" at end of note
  function normalizeReminderNote(note) {
    if (note == null) return "";
    if (typeof note === "string") return note;
    if (typeof note === "object") {
      const candidate = note.note || note.text || note.summary;
      if (typeof candidate === "string") return candidate;
    }
    return String(note);
  }
  function isDoneBy(note = "") {
    const text = normalizeReminderNote(note);
    return /\bDone by [a-zA-Z]+$/.test(text.trim());
  }
  function getLocalDateKey(date = new Date()) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  function coerceReminderDateTs(value) {
    if (value == null) return null;
    if (typeof value === "number" && Number.isFinite(value)) {
      return value < 1e12 ? value * 1000 : value;
    }
    const raw = String(value).trim();
    if (!raw) return null;
    const isoMatch = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (isoMatch) {
      const year = Number(isoMatch[1]);
      const month = Number(isoMatch[2]) - 1;
      const day = Number(isoMatch[3]);
      return new Date(year, month, day).getTime();
    }
    const slashMatch = raw.match(/^(\d{1,2})[\\/\\-](\d{1,2})[\\/\\-](\d{2,4})$/);
    if (slashMatch) {
      let year = Number(slashMatch[3]);
      if (year < 100) year += 2000;
      const month = Number(slashMatch[1]) - 1;
      const day = Number(slashMatch[2]);
      return new Date(year, month, day).getTime();
    }
    const parsed = Date.parse(raw);
    return Number.isNaN(parsed) ? null : parsed;
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
  async function readRemindersCache() {
    try {
      const payload = await chrome.storage.local.get(REMINDERS_CACHE_KEY);
      const cached = payload[REMINDERS_CACHE_KEY];
      if (!cached || !Array.isArray(cached.reminders)) return null;
      if (cached.ts && (Date.now() - cached.ts) > REMINDERS_CACHE_TTL_MS) return null;
      return cached.reminders;
    } catch (err) {
      console.warn("[popup] Failed to read reminders cache:", err);
      return null;
    }
  }
  async function writeRemindersCache(reminders) {
    try {
      await chrome.storage.local.set({
        [REMINDERS_CACHE_KEY]: { ts: Date.now(), reminders }
      });
    } catch (err) {
      console.warn("[popup] Failed to store reminders cache:", err);
    }
  }
  function buildReminderList(data) {
    const reminders = [];
    if (!data || typeof data !== "object") return reminders;
    for (const uuid in data) {
      const locationData = data[uuid];
      if (locationData && typeof locationData === "object" && locationData.reminder) {
        for (const date in locationData.reminder) {
          const rawNote = locationData.reminder[date];
          const note = normalizeReminderNote(rawNote);
          const done = isDoneBy(note);
          const dateTs = coerceReminderDateTs(date);
          reminders.push({ uuid, date, note, done, dateTs });
        }
      }
    }
    reminders.sort((a, b) => {
      const aTs = typeof a.dateTs === "number" ? a.dateTs : coerceReminderDateTs(a.date);
      const bTs = typeof b.dateTs === "number" ? b.dateTs : coerceReminderDateTs(b.date);
      if (typeof aTs === "number" && typeof bTs === "number") {
        return aTs - bTs;
      }
      return String(a.date).localeCompare(String(b.date));
    });
    return reminders;
  }
  function applyReminderList(reminders, { shouldCache = false } = {}) {
    allReminders.length = 0;
    allReminders.push(...reminders);
    renderReminderList(allReminders);
    updateExtensionBadge(allReminders);
    if (shouldCache) {
      void writeRemindersCache(allReminders);
    }
  }
  function applyReminderData(data, { shouldCache = true } = {}) {
    const reminders = buildReminderList(data);
    applyReminderList(reminders, { shouldCache });
  }
  async function fetchAndRenderReminders() {
    const cachedReminders = await readRemindersCache();
    if (cachedReminders) {
      applyReminderList(cachedReminders, { shouldCache: false });
      return;
    }
    let data = null;
    try {
      data = await fetchRemindersFromApi();
    } catch (err) {
      const errMessage = err?.message || String(err || "unknown error");
      console.warn("[popup] Reminders API failed:", errMessage);
      try {
        data = await fetchRemindersFromFirebase();
      } catch (fbErr) {
        const fbMessage = fbErr?.message || String(fbErr || "unknown error");
        console.warn("[popup] Failed to fetch reminders:", fbMessage);
        renderReminderList([]);
        updateExtensionBadge([]);
        return;
      }
    }
    if (data) {
      applyReminderData(data, { shouldCache: true });
    }
  }
  function getEventSourceStateLabel(source) {
    const state = source?.readyState;
    if (state === 0 || state === EventSource.CONNECTING) return "connecting";
    if (state === 1 || state === EventSource.OPEN) return "open";
    if (state === 2 || state === EventSource.CLOSED) return "closed";
    return "unknown";
  }
  function subscribeToReminderStream() {
    if (remindersEventSource || remindersStreamDisabled || typeof EventSource === "undefined") return;
    const streamUrl = buildRemindersUrl({ stream: "true" });
    const source = new EventSource(streamUrl);
    remindersEventSource = source;
    source.addEventListener("reminders", (event) => {
      if (!event?.data) return;
      try {
        remindersStreamErrorCount = 0;
        const payload = JSON.parse(event.data);
        const etag = payload?.etag || event.lastEventId;
        if (etag && etag === remindersStreamLastEtag) return;
        if (etag) remindersStreamLastEtag = etag;
        const data = payload?.reminders || payload?.data || payload;
        applyReminderData(data, { shouldCache: true });
      } catch (err) {
        console.warn("[popup] Failed to parse reminders stream:", err);
      }
    });
    source.onerror = (err) => {
      const stateLabel = getEventSourceStateLabel(source);
      const readyState = source.readyState;
      if (readyState === 2 || readyState === EventSource.CLOSED) {
        remindersEventSource = null;
        return;
      }
      remindersStreamErrorCount += 1;
      const disableStream = remindersStreamErrorCount >= REMINDERS_STREAM_MAX_ERRORS;
      const eventType = err?.type || "error";
      console.warn(
        `[popup] Reminders stream error (${eventType}, ${stateLabel}, readyState=${readyState}${disableStream ? ", disabling stream" : ""}).`
      );
      if (disableStream) {
        remindersStreamDisabled = true;
        source.close();
        remindersEventSource = null;
        void fetchAndRenderReminders();
      }
    };
  }
function renderReminderList(remindersToShow, filtered = false) {
  const list = document.getElementById("reminderList");
  const clearBtn = document.getElementById("clearReminderFilter");
  list.innerHTML = "";
  const todayKey = getLocalDateKey();
  const todayTs = coerceReminderDateTs(todayKey) ?? Date.now();
  const normalized = remindersToShow.map((r) => {
    const note = normalizeReminderNote(r.note);
    const done = typeof r.done === "boolean" ? r.done : isDoneBy(note);
    const dateTs = typeof r.dateTs === "number" ? r.dateTs : coerceReminderDateTs(r.date);
    return { ...r, note, done, dateTs };
  });
  const isPast = (r) => {
    if (typeof r.dateTs === "number") {
      return r.dateTs < todayTs;
    }
    const raw = String(r.date || "");
    return raw && raw < todayKey;
  };
  const upcoming = normalized.filter((r) => !r.done && !isPast(r));
  const past = normalized.filter((r) => r.done || isPast(r)).reverse();
  // --- 🕒 Past Reminder Fold Section ---
  if (past.length) {
    const pastHeader = document.createElement("li");
    pastHeader.textContent = "Past reminders";
    pastHeader.style.listStyle = "none";
    pastHeader.style.opacity = "0.6";
    pastHeader.style.fontSize = "12px";
    pastHeader.style.marginBottom = "4px";
    list.appendChild(pastHeader);
    for (const r of past) {
      const li = document.createElement("li");
      li.innerHTML = `<a href="https://gogetta.nyc/team/location/${r.uuid}" target="_blank">${r.date}</a>: ${r.note}`;
      if (r.done) {
        li.style.opacity = "0.6";
        li.style.textDecoration = "line-through";
      } else {
        li.style.opacity = "0.7";
      }
      list.appendChild(li);
    }
    const foldNotice = document.createElement("li");
    foldNotice.style.listStyle = "none";
    foldNotice.style.textAlign = "center";
    foldNotice.style.fontSize = "12px";
    foldNotice.style.color = "#888";
    foldNotice.style.padding = "4px 0";
    foldNotice.style.borderTop = "1px dashed #ccc";
    foldNotice.style.marginBottom = "10px";
    foldNotice.textContent = "Upcoming";
    list.appendChild(foldNotice);   // visual divider
  }
  // --- 📅 Upcoming Reminders ---
  for (const r of upcoming) {
    const isToday = typeof r.dateTs === "number"
      ? r.dateTs >= todayTs && r.dateTs < (todayTs + 24 * 60 * 60 * 1000)
      : String(r.date) === todayKey;
    const dateText = isToday ? "Today" : r.date;
    const li = document.createElement("li");
    li.innerHTML = `<a href="https://gogetta.nyc/team/location/${r.uuid}" target="_blank">${dateText}</a>: ${r.note}`;
    list.appendChild(li);
  }
  // Toggle "Show All" button
  clearBtn.style.display = filtered ? "block" : "none";
  const section = document.getElementById("reminderSection");
  if (section) {
    section.scrollTop = 0;
  }
}
document.getElementById("clearReminderFilter").addEventListener("click", () => {
  renderReminderList(allReminders);
});
function updateExtensionBadge(reminders) {
  const todayKey = getLocalDateKey();
  const todayTs = coerceReminderDateTs(todayKey) ?? Date.now();
  const upcoming = reminders.filter((r) => {
    const note = normalizeReminderNote(r.note);
    const done = typeof r.done === "boolean" ? r.done : isDoneBy(note);
    if (done) return false;
    const dateTs = typeof r.dateTs === "number" ? r.dateTs : coerceReminderDateTs(r.date);
    if (typeof dateTs === "number") {
      return dateTs >= todayTs;
    }
    const raw = String(r.date || "");
    return raw >= todayKey;
  });
  const count = upcoming.length;
  chrome.runtime.sendMessage({ type: "setBadge", count });
}
  const redirect = document.getElementById("redirectToggle");
  const recolorToggle = document.getElementById("recolorToggle");
  const greenMode = document.getElementById("greenModeToggle");
  const gayMode = document.getElementById("gayModeToggle");
  const recolorOptions = document.getElementById("recolorOptions");
  const hideNotesToggle = document.getElementById("hideNotesToggle");
  const { redirectEnabled, greenMode: gm, gayMode: ym, hideNotes } = await chrome.storage.local.get([
    "redirectEnabled", "greenMode", "gayMode", "hideNotes"
  ]);
  redirect.checked = redirectEnabled || false;
  const isAnyRecolor = gm || ym;
  recolorToggle.checked = isAnyRecolor;
  recolorOptions.style.display = isAnyRecolor ? "flex" : "none";
  greenMode.checked = !!gm;
  gayMode.checked = !!ym;
  if (hideNotesToggle) {
    hideNotesToggle.checked = !!hideNotes;
  }
  redirect.addEventListener("change", () => {
    chrome.storage.local.set({ redirectEnabled: redirect.checked });
  });
  hideNotesToggle?.addEventListener("change", () => {
    chrome.storage.local.set({ hideNotes: hideNotesToggle.checked });
  });
  recolorToggle.addEventListener("change", () => {
    if (!recolorToggle.checked) {
      recolorOptions.style.display = "none";
      greenMode.checked = false;
      gayMode.checked = false;
      chrome.storage.local.set({ greenMode: false, gayMode: false });
    } else {
      recolorOptions.style.display = "flex";
      chrome.storage.local.get(["greenMode", "gayMode"], (data) => {
        if (!data.greenMode && !data.gayMode) {
          greenMode.checked = true;
          chrome.storage.local.set({ greenMode: true, gayMode: false });
        }
      });
    }
  });
const calendarInput = document.getElementById("reminderCalendar");
if (calendarInput) {
  calendarInput.addEventListener("change", (e) => {
    const selected = e.target.value;
    const filtered = allReminders.filter(r => r.date === selected);
    renderReminderList(filtered);
  });
}
// --- Build Site-Visit Loop (modal embed) ---
// const buildLoopBtn = document.getElementById("buildSiteVisitLoopBtn");
// if (buildLoopBtn) {
//   buildLoopBtn.addEventListener("click", async () => {
//     // Prefer current inputs; fall back to storage
//     const typedUser = (userNameInput?.value || "").trim();
//     const typedPw = (userPasswordInput?.value || "").trim();
//     const { userName: storedUser } = await chrome.storage.local.get("userName");
//     const { userPassword: storedPw } = await chrome.storage.local.get("userPassword");
//     const userName = typedUser || storedUser || "";
//     const userPassword = typedPw || storedPw || "";
//     if (!userName) {
//       alert("Please set a username first.");
//       return;
//     }
//     // Password can be optional for your flows; change if you require it
//     if (!userPassword) {
//       const ok = confirm("No password saved. Continue anyway?");
//       if (!ok) return;
//     }
//     showSiteVisitLoopEmbed({ userName, userPassword, onClose: () => {
//       // Optional: refresh reminders or UI after closing
//       // fetchAndRenderReminders().catch(console.warn);
//     }});
//   });
// }
// popup.js (only the relevant new bits)
// Assumes you already have userNameInput/userPasswordInput and storage code.
// document.getElementById("buildSiteVisitLoopBtn")?.addEventListener("click", async () => {
//   // get creds same as you already do
//   const typedUser = (document.getElementById("userNameInput")?.value || "").trim();
//   const typedPw   = (document.getElementById("userPasswordInput")?.value || "").trim();
//   const { userName: storedUser } = await chrome.storage.local.get("userName");
//   const { userPassword: storedPw } = await chrome.storage.local.get("userPassword");
//   const userName = typedUser || storedUser || "";
//   const userPassword = typedPw || storedPw || "";
//   if (!userName) { alert("Please set a username first."); return; }
//   openEmbedInPopup({ userName, userPassword });
// });
let embedWindowId = null;
const buildBtn = document.getElementById("buildSiteVisitLoopBtn");
buildBtn?.addEventListener("click", async () => {
  // ... your existing credential checks & storage ...
  const nonce = crypto?.getRandomValues
    ? Array.from(crypto.getRandomValues(new Uint32Array(2))).map(n => n.toString(36)).join("")
    : String(Date.now());
  const url = `chrome-extension://${chrome.runtime.id}/embed.html?mode=loop&nonce=${encodeURIComponent(nonce)}`;
  if (embedWindowId) {
    try {
      const win = await chrome.windows.get(embedWindowId);
      if (win) {
        await chrome.windows.update(embedWindowId, { focused: true });
        return; // don’t hide again if it was already open
      }
    } catch (_) {
      embedWindowId = null;
    }
  }
  const newWin = await chrome.windows.create({
    url,
    type: "popup",
    width: 900,
    height: 640,
    focused: true,
  });
  embedWindowId = newWin.id;
  // ✅ Hide the button once opened
  buildBtn.style.display = "none";
});
// When the popup is closed, reset and show button again
chrome.windows.onRemoved.addListener((id) => {
  if (id === embedWindowId) {
    embedWindowId = null;
    buildBtn.style.display = ""; // show it back
  }
});
  const tableBtn = document.getElementById("tableOverlayBtn");
  const stripTrailingSlash = (value = "") => (typeof value === "string" ? value.replace(/\/+$/, "") : "");
  const resolveTableEmbedOrigin = async () => {
    try {
      const stored = await chrome.storage.local.get(TABLE_EMBED_ORIGIN_KEY);
      const override = stripTrailingSlash(stored[TABLE_EMBED_ORIGIN_KEY]);
      if (override) {
        return override;
      }
    } catch (error) {
      console.warn("[popup] Failed to read embed origin override:", error);
    }
    for (const origin of TABLE_LOCAL_ORIGINS) {
      try {
        if (await isTableOriginReachable(origin)) {
          return origin;
        }
      } catch (err) {
        console.warn("[popup] Table origin check failed:", origin, err);
      }
    }
    return TABLE_DEFAULT_ORIGIN;
  };
  const buildTableEmbedUrl = async () => {
    const origin = await resolveTableEmbedOrigin();
    return `${origin}${origin.endsWith("/") ? "" : "/"}embed?mode=table&singleCircle=1`;
  };
  const isRestrictedPage = (url) => {
    if (!url) return true;
    return /^chrome:\/\//i.test(url) || /^chrome-extension:\/\//i.test(url) || /^about:/i.test(url);
  };
  const openTableTab = async (embedUrl) => {
    if (!embedUrl) return;
    try {
      await chrome.tabs.create({ url: embedUrl, active: true });
    } catch (error) {
      console.warn("[popup] Failed to open table tab:", error);
      alert("Unable to load Table view.");
    }
  };
  let tableWindowId = null;
  const openTableFullscreenWindow = async (embedUrl) => {
    if (!embedUrl) return;
    const nonce = crypto?.getRandomValues
      ? Array.from(crypto.getRandomValues(new Uint32Array(2))).map((n) => n.toString(36)).join("")
      : String(Date.now());
    const target = `chrome-extension://${chrome.runtime.id}/table.html?embedUrl=${encodeURIComponent(embedUrl)}&nonce=${encodeURIComponent(nonce)}`;
    if (tableWindowId) {
      try {
        await chrome.windows.update(tableWindowId, { focused: true });
        return;
      } catch {
        tableWindowId = null;
      }
    }
    const width = screen?.availWidth || 1280;
    const height = screen?.availHeight || 720;
    try {
      const newWin = await chrome.windows.create({
        url: target,
        type: "popup",
        left: 0,
        top: 0,
        width,
        height,
        focused: true
      });
      tableWindowId = newWin?.id || null;
      try {
        if (tableWindowId) {
          await chrome.windows.update(tableWindowId, { state: "fullscreen" });
        }
      } catch (_) {
        // Some platforms disallow forcing fullscreen; ignore.
      }
    } catch (error) {
      console.warn("[popup] Failed to open table window:", error);
      alert("Unable to load Table view.");
    }
  };
  chrome.windows.onRemoved.addListener((windowId) => {
    if (windowId === tableWindowId) {
      tableWindowId = null;
    }
  });
  tableBtn?.addEventListener("click", async () => {
    try {
      const embedUrl = await buildTableEmbedUrl();
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const tab = tabs[0];
        if (tab?.id) {
          if (isRestrictedPage(tab.url)) {
            void openTableTab(embedUrl);
            return;
          }
          const urlPath = embedUrl.replace(/^https?:\/\/[^/]+/, "");
          chrome.tabs.sendMessage(tab.id, { type: "SHOW_TABLE_OVERLAY", urlPath }, () => {
            if (chrome.runtime.lastError) {
              console.warn("[popup] Table overlay message failed:", chrome.runtime.lastError.message);
              void openTableTab(embedUrl);
            }
          });
        } else {
          void openTableTab(embedUrl);
        }
      });
      window.close();
    } catch (error) {
      console.error("[popup] Unable to open Table overlay:", error);
      alert("Unable to load Table view.");
    }
  });
  greenMode.addEventListener("change", () => {
    if (greenMode.checked) {
      gayMode.checked = false;
      chrome.storage.local.set({ greenMode: true, gayMode: false });
    } else {
      chrome.storage.local.set({ greenMode: false });
    }
  });
  gayMode.addEventListener("change", () => {
    if (gayMode.checked) {
      greenMode.checked = false;
      chrome.storage.local.set({ greenMode: false, gayMode: true });
    } else {
      chrome.storage.local.set({ gayMode: false });
    }
  });
  // Check for JWT authentication on gogetta.nyc pages
  chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
    const tab = tabs[0];
    if (!tab || !tab.url || !tab.url.includes("gogetta.nyc/team")) return;
    // Get Cognito tokens from the content script
    try {
      const response = await chrome.tabs.sendMessage(tab.id, { type: 'GET_COGNITO_TOKENS' });
      const { accessToken, idToken, username } = response || {};
      if (accessToken && username) {
        console.log(`JWT authentication successful for user: ${username}`);
        // Authentication successful - reminders list will be shown by default
      } else {
        console.log('No JWT tokens found');
      }
    } catch (error) {
      console.log('Could not get tokens from content script:', error);
    }
  });
  await fetchAndRenderReminders(); // ⬅️ Call the function!
  subscribeToReminderStream();
  window.addEventListener("beforeunload", () => {
    remindersEventSource?.close();
  });
});

