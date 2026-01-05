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
  const REMINDERS_URL = "https://locationnote1-iygwucy2fa-uc.a.run.app?uuid=reminders";
  const FIREBASE_REMINDERS_URL = "https://doobneek-fe7b7-default-rtdb.firebaseio.com/locationNotes.json";
  const REMINDERS_CACHE_KEY = "remindersCache";
  const REMINDERS_FETCH_TIMEOUT_MS = 8000;
  const REMINDERS_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
  const allReminders = [];
  let remindersEventSource = null;
  let remindersStreamLastEtag = null;
  const pauseBtn = document.getElementById("pauseExtensionBtn");

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
          const note = locationData.reminder[date];
          if (isDoneBy(note)) continue;
          reminders.push({ uuid, date, note });
        }
      }
    }
    reminders.sort((a, b) => a.date.localeCompare(b.date));
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

  function subscribeToReminderStream() {
    if (remindersEventSource || typeof EventSource === "undefined") return;
    const streamUrl = buildRemindersUrl({ stream: "true" });
    const source = new EventSource(streamUrl);
    remindersEventSource = source;

    source.addEventListener("reminders", (event) => {
      if (!event?.data) return;
      try {
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
      if (source.readyState === EventSource.CLOSED) {
        remindersEventSource = null;
      } else {
        console.warn("[popup] Reminders stream error:", err);
      }
    };
  }

function renderReminderList(remindersToShow, filtered = false) {
  const list = document.getElementById("reminderList");
  const clearBtn = document.getElementById("clearReminderFilter");
  list.innerHTML = "";

  const today = new Date().toISOString().split("T")[0];
  const upcoming = remindersToShow.filter(r => r.date >= today);
  const past = remindersToShow.filter(r => r.date < today).reverse();
  let firstUpcomingItem = null;

  // --- 🕒 Past Reminder Fold Section ---
  if (past.length) {
    const pastContainer = document.createElement("div");
    pastContainer.style = `
      opacity: 0.6;
      margin-bottom: 10px;
    `;

    for (const r of past) {
      const li = document.createElement("li");
      li.innerHTML = `<a href="https://gogetta.nyc/team/location/${r.uuid}" target="_blank">${r.date}</a>: ${r.note}`;
      pastContainer.appendChild(li);
    }

    const foldNotice = document.createElement("div");
    foldNotice.style = `
      text-align: center;
      font-size: 12px;
      color: #888;
      padding: 4px 0;
      border-top: 1px dashed #ccc;
      margin-bottom: 10px;
    `;

    list.appendChild(pastContainer); // past on top
    list.appendChild(foldNotice);   // visual divider
  }

  // --- 📅 Upcoming Reminders ---
  for (const r of upcoming) {
    const dateText = r.date === today ? "Today" : r.date;
    const li = document.createElement("li");
    li.innerHTML = `<a href="https://gogetta.nyc/team/location/${r.uuid}" target="_blank">${dateText}</a>: ${r.note}`;
    list.appendChild(li);
    if (!firstUpcomingItem) {
      firstUpcomingItem = li;
    }
  }

  // Toggle "Show All" button
  clearBtn.style.display = filtered ? "block" : "none";

  const section = document.getElementById("reminderSection");
  if (section) {
    if (past.length && firstUpcomingItem) {
      const sectionRect = section.getBoundingClientRect();
      const itemRect = firstUpcomingItem.getBoundingClientRect();
      const maxScroll = section.scrollHeight - section.clientHeight;
      const targetScrollTop = section.scrollTop + (itemRect.top - sectionRect.top);
      section.scrollTop = Math.max(0, Math.min(targetScrollTop, maxScroll));
    } else {
      section.scrollTop = 0;
    }
  }
}


document.getElementById("clearReminderFilter").addEventListener("click", () => {
  renderReminderList(allReminders);
});

function updateExtensionBadge(reminders) {
  const today = new Date().toISOString().split("T")[0];
  const upcoming = reminders.filter(r => r.date >= today);
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



