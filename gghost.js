  console.log('🚀 GGHOST.JS LOADING - URL:', window.location.href);





  let globalButtonDropdown = null;





  const buttonActions = [];





  let areaZipOverlayState = null;











// Check for extension context validity





if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.id) {





  console.warn('Extension context may be invalidated');





}











const NOTE_API = "https://locationnote1-iygwucy2fa-uc.a.run.app";
const EDIT_TIMELINE_API = window.gghost?.EDIT_TIMELINE_API
  || "https://us-central1-doobneek-fe7b7.cloudfunctions.net/locationNotesTimeline";
const NOTE_API_SKIP_HOST_RE = /(^|\.)test\.gogetta\.nyc$|(^|\.)test\.yourpeer(\.nyc)?$/i;





window.gghost = window.gghost || {};





window.gghost.NOTE_API = NOTE_API;
window.gghost.EDIT_TIMELINE_API = EDIT_TIMELINE_API;





const baseURL = "https://doobneek-fe7b7-default-rtdb.firebaseio.com/";

const NOTES_HIDDEN_CLASS = "gg-hide-notes";
const NOTES_HIDDEN_STORAGE_KEY = "hideNotes";

function ensureNotesHiddenStyle() {
  if (document.getElementById("gg-hide-notes-style")) return;
  const style = document.createElement("style");
  style.id = "gg-hide-notes-style";
  style.textContent = `
html.${NOTES_HIDDEN_CLASS} #gg-note-wrapper,
html.${NOTES_HIDDEN_CLASS} #gg-note-overlay,
html.${NOTES_HIDDEN_CLASS} #gg-note-username-banner {
  display: none !important;
}
`;
  (document.head || document.documentElement).appendChild(style);
}

function setNotesHidden(hidden) {
  ensureNotesHiddenStyle();
  document.documentElement.classList.toggle(NOTES_HIDDEN_CLASS, !!hidden);
}

if (chrome?.storage?.local) {
  chrome.storage.local.get(NOTES_HIDDEN_STORAGE_KEY, (data) => {
    setNotesHidden(!!data?.[NOTES_HIDDEN_STORAGE_KEY]);
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes[NOTES_HIDDEN_STORAGE_KEY]) {
      setNotesHidden(!!changes[NOTES_HIDDEN_STORAGE_KEY].newValue);
    }
  });
}

let firebaseWriteDisabled = false;
let firebaseWriteDisableLogged = false;
let firebaseWriteMissingTokenLogged = false;
const FIREBASE_AUTH_TOKEN_STORAGE_KEY = "gghostFirebaseAuthToken";

function getFirebaseAuthToken() {
  const directToken = window.gghost?.firebaseAuthToken;
  if (typeof directToken === "string" && directToken.trim()) return directToken.trim();
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
  const token = getFirebaseAuthToken();
  if (!token) return url;
  const joiner = url.includes("?") ? "&" : "?";
  return `${url}${joiner}auth=${encodeURIComponent(token)}`;
}

function disableFirebaseWrites(reason) {
  firebaseWriteDisabled = true;
  if (!firebaseWriteDisableLogged) {
    console.warn("[Firebase] Disabling RTDB writes:", reason);
    firebaseWriteDisableLogged = true;
  }
}





window.gghost.baseURL = baseURL;
window.gghost.getFirebaseAuthToken = getFirebaseAuthToken;
window.gghost.withFirebaseAuth = withFirebaseAuth;











const LOCATION_INVOCATION_BUCKET_SECONDS = 1;
const INVOCATION_WRITES_ENABLED = false;

let locationInvocationDisabled = !INVOCATION_WRITES_ENABLED;





let locationInvocationDisableLogged = false;











function disableLocationInvocation(reason) {





  locationInvocationDisabled = true;





  if (!locationInvocationDisableLogged) {





    console.warn('[LocationInvocation] Disabled invocation writes:', reason);





    locationInvocationDisableLogged = true;





  }





}











function getInvocationBucketSeconds() {





  return Math.floor(Date.now() / 1000).toString();





}











async function recordLocationInvocation(uuid, source = 'unknown') {





  if (!uuid) return;





  if (locationInvocationDisabled) return;





  const bucket = getInvocationBucketSeconds();





  const url = withFirebaseAuth(`${baseURL}locationNotes/${uuid}/invocations/${bucket}.json`);





  try {





    const existingRes = await fetch(url, { cache: "no-store" });





    if (existingRes.status === 401 || existingRes.status === 403) {





      disableLocationInvocation('permission denied');





      return;





    }





    let current = 0;





    if (existingRes.ok) {





      const existing = await existingRes.json();





      if (typeof existing === "number") {





        current = existing;





      }





    }





    const next = current + 1;





    const writeRes = await fetch(url, {





      method: "PUT",





      headers: { "Content-Type": "application/json" },





      body: JSON.stringify(next)





    });





    if (!writeRes.ok) {





      const text = await writeRes.text().catch(() => "");





      if (writeRes.status === 401 || writeRes.status === 403 || text.includes('Permission denied')) {





        disableLocationInvocation('permission denied');





        return;





      }





      console.warn(`[LocationInvocation] Write failed for ${uuid}:`, text);





    }





  } catch (err) {





    console.warn(`[LocationInvocation] Failed to record invocation for ${uuid} (${source}):`, err);





  }





}











// Shared Cognito authentication utilities





window.gghost = window.gghost || {};





console.log('[gghost.js] Script loaded, setting up getCognitoTokens');





window.gghost.getCognitoTokens = function getCognitoTokens() {





  try {





    const prefix = 'CognitoIdentityServiceProvider.';





    const cognitoKeys = [];





    const candidates = [];











    const decodeJwtPayload = (token) => {





      if (!token || typeof token !== 'string') return null;





      const parts = token.split('.');





      if (parts.length < 2) return null;





      const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');





      const padded = payload + '='.repeat((4 - (payload.length % 4)) % 4);





      try {





        return JSON.parse(atob(padded));





      } catch {





        return null;





      }





    };











    const getTokenExp = (token) => {





      const payload = decodeJwtPayload(token);





      const exp = payload?.exp;





      return Number.isFinite(exp) ? exp : 0;





    };











    const addCandidatesFromStorage = (storage, label) => {





      const clients = new Map();





      for (let i = 0; i < storage.length; i += 1) {





        const key = storage.key(i);





        if (!key || !key.startsWith(prefix)) continue;





        cognitoKeys.push(key);











        const rest = key.slice(prefix.length);





        const parts = rest.split('.');





        if (parts.length < 2) continue;





        const clientId = parts[0];





        const tail = parts[parts.length - 1];





        const entry = clients.get(clientId) || { lastAuthUser: null, users: new Map() };











        if (tail === 'LastAuthUser') {





          entry.lastAuthUser = storage.getItem(key);





          clients.set(clientId, entry);





          continue;





        }











        if (!['accessToken', 'idToken', 'refreshToken'].includes(tail)) continue;





        const username = parts.slice(1, -1).join('.');





        if (!username) continue;





        const userTokens = entry.users.get(username) || {};





        userTokens[tail] = storage.getItem(key);





        entry.users.set(username, userTokens);





        clients.set(clientId, entry);





      }











      clients.forEach((entry, clientId) => {





        if (entry.lastAuthUser && entry.users.has(entry.lastAuthUser)) {





          const tokens = entry.users.get(entry.lastAuthUser);





          candidates.push({





            clientId,





            username: entry.lastAuthUser,





            storageLabel: label,





            isLastAuthUser: true,





            accessToken: tokens.accessToken || null,





            idToken: tokens.idToken || null,





            refreshToken: tokens.refreshToken || null





          });





        }





        entry.users.forEach((tokens, user) => {





          candidates.push({





            clientId,





            username: user,





            storageLabel: label,





            isLastAuthUser: entry.lastAuthUser === user,





            accessToken: tokens.accessToken || null,





            idToken: tokens.idToken || null,





            refreshToken: tokens.refreshToken || null





          });





        });





      });





    };











    console.log('[getCognitoTokens] Scanning storage for Cognito tokens...');





    const storages = [





      { storage: localStorage, label: 'localStorage' },





      { storage: sessionStorage, label: 'sessionStorage' }





    ];





    storages.forEach(({ storage, label }) => {





      try {





        if (!storage) return;





        addCandidatesFromStorage(storage, label);





      } catch (error) {





        console.warn(`[getCognitoTokens] Unable to access ${label}:`, error);





      }





    });











    const uniqueKeys = Array.from(new Set(cognitoKeys));





    console.log('[getCognitoTokens] Found Cognito keys:', uniqueKeys);











    const nowSec = Date.now() / 1000;





    let best = null;











    candidates.forEach((candidate) => {





      if (!candidate.accessToken && !candidate.idToken && !candidate.refreshToken) return;





      const accessExp = getTokenExp(candidate.accessToken);





      const idExp = getTokenExp(candidate.idToken);





      const maxExp = Math.max(accessExp || 0, idExp || 0);





      const accessValid = accessExp ? accessExp > nowSec + 30 : false;





      const idValid = idExp ? idExp > nowSec + 30 : false;





      const valid = accessValid || idValid || (!accessExp && !idExp);





      const tokenCount = (candidate.accessToken ? 1 : 0) + (candidate.idToken ? 1 : 0);





      const scored = { ...candidate, accessExp, idExp, maxExp, valid, tokenCount };











      if (!best) {





        best = scored;





        return;





      }





      if (scored.valid !== best.valid) {





        if (scored.valid) best = scored;





        return;





      }





      if (scored.tokenCount !== best.tokenCount) {





        if (scored.tokenCount > best.tokenCount) best = scored;





        return;





      }





      if (scored.maxExp !== best.maxExp) {





        if (scored.maxExp > best.maxExp) best = scored;





        return;





      }





      if (scored.isLastAuthUser !== best.isLastAuthUser) {





        if (scored.isLastAuthUser) best = scored;





      }





    });











    const accessToken = best?.accessToken || null;





    const idToken = best?.idToken || null;





    const refreshToken = best?.refreshToken || null;





    const username = best?.username || null;











    if (best) {





      console.log('[getCognitoTokens] Selected tokens from', best.storageLabel, 'client', best.clientId, 'user', best.username);





    }





    console.log('[getCognitoTokens] Result:', {





      hasAccessToken: !!accessToken,





      hasIdToken: !!idToken,





      hasRefreshToken: !!refreshToken,





      username





    });











    return { accessToken, idToken, refreshToken, username };





  } catch (error) {





    console.warn('[getCognitoTokens] Error accessing localStorage:', error);





    return { accessToken: null, idToken: null, refreshToken: null, username: null };





  }





};











// Local reference for this file





const getCognitoTokens = window.gghost.getCognitoTokens;











function getAuthHeaders() {





  console.log('[getAuthHeaders] Getting auth headers...');





  const { accessToken, idToken } = getCognitoTokens();





  const token = accessToken || idToken;





  if (token) {





    console.log('[getAuthHeaders] Using JWT token');





    return {





      'Authorization': `Bearer ${token}`,





      'Content-Type': 'application/json'





    };





  }





  console.log('[getAuthHeaders] No JWT token found, using plain headers');





  return { 'Content-Type': 'application/json' };





}











// Expose getAuthHeaders on window.gghost for use by autoClicker.js





window.gghost.getAuthHeaders = getAuthHeaders;











function getCurrentUsername() {





  const { username } = getCognitoTokens();





  return username || 'doobneek'; // fallback to default





}











// Helper function for authenticated NOTE_API calls
function shouldSkipNoteApi() {
  const host = location?.hostname || '';
  return NOTE_API_SKIP_HOST_RE.test(host);
}

function fetchViaBackground(url, options = {}) {
  if (!chrome?.runtime?.sendMessage) {
    return fetch(url, options);
  }

  return new Promise((resolve, reject) => {
    try {
      chrome.runtime.sendMessage({ type: 'BACKGROUND_FETCH', url, options }, (response) => {
        const lastError = chrome.runtime.lastError;
        if (lastError) {
          reject(new Error(lastError.message || 'Background fetch failed'));
          return;
        }
        if (!response) {
          reject(new Error('Background fetch returned no response'));
          return;
        }
        const headers = new Headers(response.headers || {});
        const status = typeof response.status === 'number' ? response.status : 0;
        const body = response.body || '';
        resolve(new Response(body, { status, statusText: response.statusText || '', headers }));
      });
    } catch (err) {
      reject(err);
    }
  }).catch((err) => {
    console.warn('[BackgroundFetch] Falling back to window.fetch:', err);
    return fetch(url, options);
  });
}


async function fetchLocationsByRadiusViaExtension(query) {
  if (!chrome?.runtime?.sendMessage) {
    return null;
  }

  try {
    const response = await sendBackgroundRequest({ type: 'FETCH_LOCATIONS_BY_RADIUS', query });
    if (!response || !response.ok) {
      throw new Error(response?.error || 'Extension failed to fetch locations');
    }
    return response.data;
  } catch (err) {
    console.warn('[gghost] Extension location fetch failed:', err);
    return null;
  }
}

window.gghost = window.gghost || {};
window.gghost.fetchLocationsByRadius = fetchLocationsByRadiusViaExtension;


async function postToNoteAPI(payload) {
  if (shouldSkipNoteApi()) {
    return new Response('', { status: 204, statusText: 'Skipped note API on test host' });
  }





  console.log('[postToNoteAPI] Making authenticated API call with payload:', payload);





  const headers = getAuthHeaders();





  console.log('[postToNoteAPI] Using headers:', headers);





  





  const response = await fetchViaBackground(NOTE_API, {





    method: "POST",





    headers: headers,





    credentials: 'include',





    body: JSON.stringify(payload)





  });





  





  console.log('[postToNoteAPI] Response status:', response.status);





  return response;





}





window.gghost.postToNoteAPI = postToNoteAPI;




function normalizeOrgName(name) {





  return (name || "")





    .toLowerCase()





    .replace(/[^a-z0-9]/gi, '') 





    .trim();





}





  const ns = "http://www.w3.org/2000/svg";











  const label = document.createElementNS(ns, "text");











        const today = new Date().toISOString().slice(0, 10); 





async function fetchValidationStats(uuid) {





  const url = `${baseURL}locationNotes/${uuid}/stats.json`;





  const r = await fetch(url);





  if (!r.ok) return [];





  const data = (await r.json()) || {};





  // Allow either validatedAt or lastValidated





  const dates = [];





  for (const k in data) {





    const v = data[k];





    const iso = v?.validatedAt || v?.lastValidated || null;





    if (!iso) continue;





    const d = new Date(iso);





    if (!isNaN(d)) dates.push(d);





  }





  return dates.sort((a, b) => a - b);





}











function monthKey(d) {





  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;





}





function monthKeyFromParts(y, m) {





  const mm = String(m + 1).padStart(2, "0");





  return `${y}-${mm}`;





}











function parseMonthKey(k) {





  const [y, m] = k.split("-").map(Number);





  return { y, m: m - 1 }; // JS month 0..11





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





  return new Date(y, m, 1).toLocaleDateString("en-US", {





    month: "short",





    year: "2-digit",





  }); // e.g. "Apr 25"





}





function buildAdaptiveMonthBuckets(dates, limit = 12) {





  if (!Array.isArray(dates) || dates.length === 0) return [];











  const counts = new Map();





  for (const d of dates) {





    const k = monthKey(d); // assumes you already have monthKey(d)





    counts.set(k, (counts.get(k) || 0) + 1);





  }











  const keys = Array.from(counts.keys()).sort();





  const firstKey = keys[0];





  const lastKey = keys[keys.length - 1];











  const span = monthsBetween(firstKey, lastKey) + 1;











  let startKey, endKey;





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

















// Optional: cumulative transform (if you want the smooth rising line)





function toCumulative(buckets) {





  let run = 0;





  return buckets.map(b => ({ key: b.key, count: (run += b.count) }));





}











function buildLast12MonthBuckets(dates) {





  // Make a map counts per YYYY-MM





  const counts = new Map();





  for (const d of dates) {





    const key = monthKey(d);





    counts.set(key, (counts.get(key) || 0) + 1);





  }





  // Build last 12 months ending this month





  const now = new Date();





  const keys = [];





  const cursor = new Date(now.getFullYear(), now.getMonth(), 1);





  for (let i = 11; i >= 0; i--) {





    const k = new Date(cursor.getFullYear(), cursor.getMonth() - i, 1);





    keys.push(monthKey(k));





  }





  return keys.map(k => ({ key: k, count: counts.get(k) || 0 }));





}











function renderValidationChartSVG(buckets, opts = {}) {





  const w = opts.width || 320;





  const h = opts.height || 120;





  const pad = opts.pad || 24;











  const max = Math.max(1, ...buckets.map(b => b.count));





  const svg = document.createElementNS(ns, "svg");





  svg.setAttribute("width", w);





  svg.setAttribute("height", h);





  svg.setAttribute("viewBox", `0 0 ${w} ${h}`);











  // X axis





  const axis = document.createElementNS(ns, "line");





  axis.setAttribute("x1", pad);





  axis.setAttribute("y1", h - pad);





  axis.setAttribute("x2", w - pad);





  axis.setAttribute("y2", h - pad);





  axis.setAttribute("stroke", "#ddd");





  axis.setAttribute("stroke-width", "1");





  svg.appendChild(axis);











  const bw = (w - pad * 2) / buckets.length;











  // Build line points





  const points = buckets.map((b, i) => {





    const x = pad + i * bw + bw / 2;





    const y = h - pad - Math.round(((h - pad * 2) * b.count) / max);





    return [x, y];





  });











  // Line path





  const path = document.createElementNS(ns, "path");





  const d = points





    .map((p, i) => (i === 0 ? `M ${p[0]} ${p[1]}` : `L ${p[0]} ${p[1]}`))





    .join(" ");





  path.setAttribute("d", d);





  path.setAttribute("fill", "none");





  path.setAttribute("stroke", "#444");





  path.setAttribute("stroke-width", "2");





  svg.appendChild(path);











  // Small circles on data points





  // Small circles on data points with hover tooltips





  for (let i = 0; i < points.length; i++) {





    const [x, y] = points[i];





    const bucket = buckets[i];











    const c = document.createElementNS(ns, "circle");





    c.setAttribute("cx", x);





    c.setAttribute("cy", y);





    c.setAttribute("r", "2.5");





    c.setAttribute("fill", "#444");











    // Tooltip shows on hover





    const title = document.createElementNS(ns, "title");





    title.textContent = `${bucket.key}: ${bucket.count}`;





    c.appendChild(title);











    svg.appendChild(c);





  }

















  // Labels





  const first = buckets[0]?.key || "";





  const last = buckets[buckets.length - 1]?.key || "";





const total = buckets[buckets.length - 1]?.count || 0;





label.textContent = `Validations (last 12) — total ${total}`;











  label.setAttribute("x", pad);





  label.setAttribute("y", pad - 8);





  label.setAttribute("font-size", "11");





  label.setAttribute("fill", "#333");





  svg.appendChild(label);











  const leftLabel = document.createElementNS(ns, "text");





  leftLabel.setAttribute("x", pad);





  leftLabel.setAttribute("y", h - 6);





  leftLabel.setAttribute("font-size", "10");





  leftLabel.setAttribute("fill", "#666");





  leftLabel.textContent = first;





  svg.appendChild(leftLabel);











  const rightLabel = document.createElementNS(ns, "text");





  rightLabel.setAttribute("x", w - pad);





  rightLabel.setAttribute("y", h - 6);





  rightLabel.setAttribute("text-anchor", "end");





  rightLabel.setAttribute("font-size", "10");





  rightLabel.setAttribute("fill", "#666");





  rightLabel.textContent = last;





  svg.appendChild(rightLabel);











  return svg;





}

















async function addValidationHistoryBadge(readOnlyDiv, uuid) {





  try {





    const dates = await fetchValidationStats(uuid);





    if (!Array.isArray(dates) || dates.length < 2) return;











    const wrap = document.createElement("div");





    Object.assign(wrap.style, {





      position: "relative",





      display: "inline-block",





      float: "right",





      margin: "-6px -6px 0 0",





    });











    const btn = document.createElement("button");





    btn.type = "button";





    btn.title = "Show validation history";





    btn.textContent = "ℹ️";





    Object.assign(btn.style, {





      border: "1px solid #aaa",





      background: "#fff",





      borderRadius: "50%",





      width: "22px",





      height: "22px",





      lineHeight: "18px",





      fontSize: "14px",





      cursor: "pointer",





    });











    const pop = document.createElement("div");





    pop.setAttribute("role", "dialog");





    Object.assign(pop.style, {





      position: "fixed",





      top: "0px",





      left: "0px",





      width: "360px",





      padding: "8px",





      background: "#fff",





      border: "1px solid #ccc",





      borderRadius: "6px",





      boxShadow: "0 8px 24px rgba(0,0,0,0.2)",





      display: "none",





      zIndex: 2147483647,





    });











    // ✅ use adaptive buckets





    const buckets = buildAdaptiveMonthBuckets(dates, 12);





    const shown = toCumulative(buckets); // if you want cumulative view











    const svg = renderValidationChartSVG(shown, {





      width: 340,





      height: 140,





      pad: 28





    });





    pop.appendChild(svg);











    wrap.appendChild(btn);





    readOnlyDiv.prepend(wrap);





    document.body.appendChild(pop);











    function positionPop() {





      const r = btn.getBoundingClientRect();





      const gap = 6;





      const popW = 360;





      const popH = 160;





      let top = Math.min(window.innerHeight - popH - 10, Math.max(10, r.bottom + gap));





      let left = Math.min(window.innerWidth - popW - 10, Math.max(10, r.right - popW));





      pop.style.top = `${top}px`;





      pop.style.left = `${left}px`;





    }











    let pinned = false;





    function show() {





      positionPop();





      pop.style.display = "block";





    }





    function hide() {





      if (!pinned) pop.style.display = "none";





    }











    btn.addEventListener("mouseenter", show);





    btn.addEventListener("mouseleave", hide);





    pop.addEventListener("mouseenter", () => { if (!pinned) pop.style.display = "block"; });





    pop.addEventListener("mouseleave", hide);





    btn.addEventListener("click", () => {





      pinned = !pinned;





      if (pinned) show(); else hide();





    });





    window.addEventListener("scroll", () => { if (pop.style.display === "block") positionPop(); }, { passive: true });





    window.addEventListener("resize", () => { if (pop.style.display === "block") positionPop(); });











  } catch (err) {





    console.warn("[ValidationHistory] Failed to mount badge:", err);





  }





}

















const STATS_WRITE_ENABLED = false;
const statsWriteInFlight = new Map();




const statsWriteOk = new Set();









function coerceStatTimestamp(value) {




  if (value == null) return null;




  if (typeof value === "number" && Number.isFinite(value)) {




    return value < 1e12 ? value * 1000 : value;




  }




  const parsed = Date.parse(String(value));




  if (!Number.isNaN(parsed)) return parsed;




  return null;




}









function buildStatKey(prefix, value) {




  const ts = coerceStatTimestamp(value);




  if (Number.isFinite(ts)) return `${prefix}${ts}`;




  const safe = String(value || "")




    .trim()




    .toLowerCase()




    .replace(/[.#$/\[\]]/g, "_");




  if (!safe) return null;




  return `${prefix}${safe}`;




}









async function writeLocationStatEntry(uuid, key, payload) {




  if (!uuid || !key || !payload) return;
  if (!STATS_WRITE_ENABLED) return;

  if (firebaseWriteDisabled) return;
  const firebaseToken = getFirebaseAuthToken();
  if (!firebaseToken) {
    if (!firebaseWriteMissingTokenLogged) {
      console.warn("[Firebase] Skipping RTDB writes: missing auth token");
      firebaseWriteMissingTokenLogged = true;
    }
    return;
  }
  firebaseWriteMissingTokenLogged = false;


  const cacheKey = `${uuid}::${key}`;




  if (statsWriteOk.has(cacheKey)) return;




  if (statsWriteInFlight.has(cacheKey)) return statsWriteInFlight.get(cacheKey);









  const url = withFirebaseAuth(`${baseURL}locationNotes/${uuid}/stats/${key}.json`);




  const req = fetch(url, {




    method: "PUT",




    headers: { "Content-Type": "application/json" },




    body: JSON.stringify(payload)




  }).then((res) => {




    if (!res.ok) {
      if (res.status === 401 || res.status === 403) disableFirebaseWrites(`HTTP ${res.status}`);
      throw new Error(`HTTP ${res.status}`);
    }




    statsWriteOk.add(cacheKey);




  }).catch((err) => {




    console.warn("[YP] Stat write failed:", err);




  }).finally(() => {




    statsWriteInFlight.delete(cacheKey);




  });









  statsWriteInFlight.set(cacheKey, req);




  return req;




}









function getLocationUpdateDate(data) {




  if (!data || typeof data !== "object") return null;




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









async function recordLocationStat(uuid, lastValidated, meta = {}) {




  if (!uuid || !lastValidated) return;




  const key = buildStatKey("v_", lastValidated);




  if (!key) return;




  const payload = { lastValidated, kind: "validation", ...meta };




  await writeLocationStatEntry(uuid, key, payload);




}









async function recordLocationUpdateStat(uuid, updatedAt, meta = {}) {




  if (!uuid || !updatedAt) return;




  const key = buildStatKey("u_", updatedAt);




  if (!key) return;




  const payload = { updatedAt, kind: "update", ...meta };




  await writeLocationStatEntry(uuid, key, payload);




}









async function recordLocationStatsFromPayload(uuid, data, meta = {}) {




  if (!uuid || !data || typeof data !== "object") return;




  const lastValidated = data.last_validated_at || data.lastValidated || null;




  const updatedAt = getLocationUpdateDate(data);




  if (lastValidated) await recordLocationStat(uuid, lastValidated, meta);




  if (updatedAt) await recordLocationUpdateStat(uuid, updatedAt, meta);




}









async function maybeRecordValidation(uuid, data) {




  try {




    await recordLocationStatsFromPayload(uuid, data, { source: "aws" });




  } catch (e) {




    console.warn("[YPButton] Could not record validation/update stats:", e);




    // Don't throw - this is a non-critical operation




  }




}









function toCumulative(buckets) {





  let run = 0;





  return buckets.map(b => {





    run += b.count || 0;





    return { ...b, count: run };





  });





}











// Posts a normal note from a site-visit record





async function postNoteFromSiteVisit({ uuid, NOTE_API, rec }) {





  if (!rec || !rec.meta) return;











  const userName = getCurrentUsername();





  const svNote = (typeof rec.notes === 'string' && rec.notes.trim()) ? rec.notes.trim() : "";





  const finalNote = `${userName} competed this Site Visit, ${svNote} `;











  const res = await postToNoteAPI({





    uuid,





    userName,





    date: today,   // past note





    note: finalNote





  });





  await checkResponse(res, "Posting past site-visit note");





}











async function fetchSiteVisitRecord(uuid) {





  if (!uuid) {





    console.warn("[SiteVisit] fetchSiteVisitRecord called without a UUID");





    return null;





  }











  const url = `${baseURL}/siteVisits/${uuid}.json`;





  try {





    const r = await fetch(url, { cache: "no-store" });





    if (!r.ok) {





      console.warn(`[SiteVisit] Record fetch failed (${r.status}) for ${uuid}`);





      return null;





    }





    return await r.json(); // null if not present





  } catch (err) {





    console.warn("[SiteVisit] Record fetch threw, treating as no record:", err);





    return null;





  }





}























// Usage:











// Simple overlay with an iframe to add a site-visit request on doobneek.org





// Replace your current showSiteVisitEmbed with this version





function showSiteVisitEmbed({ uuid, onClose = () => {} }) {





  const overlay = document.createElement('div');





  Object.assign(overlay.style, {





    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 100000,





    // NEW: stop scroll chaining to the page





    overscrollBehavior: 'contain',





  });











  const modal = document.createElement('div');





  Object.assign(modal.style, {





    position: 'fixed', top: '8%', left: '50%', transform: 'translateX(-50%)',





    width: '860px', height: '70vh', background: '#fff', border: '2px solid #000',





    borderRadius: '8px', overflow: 'hidden', display: 'flex', flexDirection: 'column',





    // NEW: also contain overscroll at the modal level





    overscrollBehavior: 'contain',





  });











  const bar = document.createElement('div');





  Object.assign(bar.style, {





    padding: '8px 12px', background: '#eee', borderBottom: '1px solid #ccc',





    display: 'flex', justifyContent: 'space-between', alignItems: 'center'





  });





  bar.textContent = 'Add site visit';





  const closeBtn = document.createElement('button');





  closeBtn.textContent = 'Close';





  closeBtn.onclick = cleanup;





  bar.appendChild(closeBtn);











  const nonce = crypto?.getRandomValues





    ? Array.from(crypto.getRandomValues(new Uint32Array(2))).map(n => n.toString(36)).join('')





    : String(Date.now());











  const src = `http://localhost:3210/embed?uuid=${encodeURIComponent(uuid)}&mode=siteVisit&nonce=${encodeURIComponent(nonce)}`;





  const iframe = document.createElement('iframe');





  Object.assign(iframe, { src, allow: "clipboard-read; clipboard-write" });





  Object.assign(iframe.style, {





    border: '0', width: '100%', height: '100%',





    // NEW: ensure the iframe itself can scroll and stops scroll chaining





    overscrollBehavior: 'contain',





    // NEW: allow programmatic focus for wheel/keyboard scroll





    outline: 'none'





  });





  // NEW: make it focusable & focus it so PageUp/PageDown/space/arrow keys go here





  iframe.tabIndex = 0;











  const EMBED_ORIGIN = new URL(src).origin;











  modal.appendChild(bar);





  modal.appendChild(iframe);





  overlay.appendChild(modal);





  document.body.appendChild(overlay);











  // NEW: lock background scroll (both <html> and <body>)





  const prevHtmlOverflow = document.documentElement.style.overflow;





  const prevBodyOverflow = document.body.style.overflow;





  document.documentElement.style.overflow = 'hidden';





  document.body.style.overflow = 'hidden';











  // NEW: focus the iframe after it’s in the DOM





  setTimeout(() => {





    try { iframe.focus(); } catch {}





  }, 0);











  // NEW: prevent wheel/touch from scrolling the underlying page when pointer is on overlay header





  // (wheel events do not cross iframe boundaries, so this won’t block scrolling *inside* the iframe)





  const blockScroll = (e) => {





    // Allow scroll if the event target is inside the iframe element itself (the event won’t bubble from inside the iframe doc)





    if (e.target === iframe) return;





    e.preventDefault();





  };





  overlay.addEventListener('wheel', blockScroll, { passive: false });





  overlay.addEventListener('touchmove', blockScroll, { passive: false });











  function onMessage(e) {





    if (e.source !== iframe.contentWindow) return;





    if (e.origin !== EMBED_ORIGIN) return;





    const { type, payload } = e.data || {};





    if (type === "REQUEST_CREDS") {





      const ok = !payload?.nonce || payload.nonce === nonce;





      if (!ok) return;





      





      const { accessToken, idToken, refreshToken, username } = getCognitoTokens();





      iframe.contentWindow.postMessage(





        { type: "CREDS", payload: { username, accessToken, idToken, refreshToken, nonce } },





        EMBED_ORIGIN





      );





    } else if (type === "CLOSE_EMBED") {





      cleanup();





    }





  }











  function onKey(e) {





    if (e.key === "Escape") cleanup();





  }











  function cleanup() {





    window.removeEventListener('message', onMessage);





    window.removeEventListener('keydown', onKey);





    overlay.removeEventListener('wheel', blockScroll);





    overlay.removeEventListener('touchmove', blockScroll);





    // restore scroll lock





    document.documentElement.style.overflow = prevHtmlOverflow;





    document.body.style.overflow = prevBodyOverflow;





    overlay.remove();





    onClose();





  }











  window.addEventListener('message', onMessage);





  window.addEventListener('keydown', onKey);





}























// Injects the Site Visit UI *inside* the read-only notes panel.





async function injectSiteVisitUI({





  parentEl, /* readOnlyDiv */





  uuid,





  userName,





  NOTE_API,





  today,





  done = false





}) {





  if (!parentEl || typeof parentEl.prepend !== "function") {





    console.warn("[SiteVisit] Cannot render UI without a valid parent element");





    return;





  }











  parentEl.querySelector("#sitevisit-banner")?.remove();











  function buildVisitButtonRow() {





    const row = document.createElement("div");





    row.style.display = "flex";





    row.style.alignItems = "center";





    row.style.justifyContent = "space-between";











    const btn = document.createElement("button");





    btn.textContent = done ? `Thanks, ${userName || "team"}` : "Visit this location";





    Object.assign(btn.style, {





      padding: "6px 10px",





      border: "1px solid #000",





      borderRadius: "4px",





      background: "#fff",





      cursor: uuid ? "pointer" : "not-allowed",





      opacity: uuid ? "1" : "0.6"





    });











    if (uuid) {





      btn.addEventListener("click", () => {





        showSiteVisitEmbed({





          uuid,





          onClose: () => {





            injectSiteVisitUI({





              parentEl,





              uuid,





              userName,





              NOTE_API,





              today,





              done: false





            });





          }





        });





      });





    } else {





      btn.disabled = true;





      btn.title = "Location ID unavailable for this page";





    }











    row.appendChild(btn);





    return row;





  }











  function renderVisitButtonBanner() {





    const fallbackBanner = document.createElement("div");





    fallbackBanner.id = "sitevisit-banner";





    fallbackBanner.appendChild(buildVisitButtonRow());





    parentEl.prepend(fallbackBanner);





  }











  try {











    // --- Helpers ------------------------------------------------------------





    function normalizeSiteVisitRecord(raw, uuid) {





      // If the caller fetched the whole branch and it's keyed by uuid





      let rec = raw && raw[uuid] ? raw[uuid] : raw;





      if (!rec || typeof rec !== 'object') return null;











      // Ensure meta exists, coerce done to boolean





      rec.meta = rec.meta || {};





      const dv = rec.meta.done;





      rec.meta.done = dv === true || dv === 'true' || dv === 1 ? true





                   : dv === false || dv === 'false' || dv === 0 ? false





                   : Boolean(dv); // fallback











      // Ensure updatedAt is usable





      if (!rec.meta.updatedAt) rec.meta.updatedAt = new Date().toISOString();











      // Notes may be an object keyed by push IDs





      if (rec.notes && typeof rec.notes === 'object' && !Array.isArray(rec.notes)) {





        // leave as-is





      }





      return rec;





    }











    function getLatestNoteTextFromObjectNotes(notesObj) {





      if (!notesObj || typeof notesObj !== 'object') return '';





      const entries = Object.entries(notesObj);





      if (entries.length === 0) return '';





      entries.sort((a, b) => {





        const da = Date.parse(a[1]?.date || 0);





        const db = Date.parse(b[1]?.date || 0);





        return da - db;





      });





      const last = entries[entries.length - 1];





      return (last?.[1]?.text || '').trim();





    }











    function formatUpdatedAt(value) {





      if (!value) return "recently";





      const dateObj = new Date(value);





      if (Number.isNaN(dateObj.getTime())) return value;





      try {





        return dateObj.toLocaleDateString("en-US", {





          month: "short",





          day: "numeric",





          year: "2-digit"





        });





      } catch {





        return value;





      }





    }











    async function postNoteFromSiteVisit({ uuid, NOTE_API, rec }) {





      // Prefer the latest object note text if present





      const latestObjNote = getLatestNoteTextFromObjectNotes(rec?.notes);





      const note = latestObjNote





        ? `[Site Visit] ${latestObjNote}`





        : `[Site Visit] Completed`;











      const userName = getCurrentUsername();





      const res = await postToNoteAPI({





        uuid,





        userName,





        date: (typeof today === 'string' && today) ? today : new Date().toISOString(),





        note





      });





      if (!res.ok) throw new Error("NOTE_API post failed");





      return res;





    }











    // --- Fetch + normalize --------------------------------------------------





    const raw = await fetchSiteVisitRecord(uuid);





    const rec = normalizeSiteVisitRecord(raw, uuid);











    // Build banner





    const banner = document.createElement('div');





    banner.id = 'sitevisit-banner';











    if (rec?.meta?.done === false) {





      // Active site-visit request exists











      // Title / info





      const info = document.createElement('div');





      info.style.marginTop = '4px';





      const updated = formatUpdatedAt(rec.meta.updatedAt);





      info.textContent = `Marked for site visit ${rec.meta.userName || userName || ''} on ${updated}`;





      banner.appendChild(info);











      // Show the latest previous note (object notes)





      const noteText = getLatestNoteTextFromObjectNotes(rec.notes);





      if (noteText) {





        const prevNote = document.createElement("div");





        prevNote.style.marginTop = "4px";





        prevNote.style.fontStyle = "italic";





        prevNote.textContent = `Previous note: ${noteText}`;





        banner.appendChild(prevNote);





      }











      if (done !== true) {





        // ========= OLD VERSION: Checkbox, no embedding =========











        // Back-compat: If rec.notes had been a string in some old records





        if (typeof rec.notes === 'string' && rec.notes.trim()) {





          const svNote = document.createElement('div');





          svNote.style.marginTop = '6px';





          svNote.style.fontStyle = 'italic';





          svNote.textContent = `Note: ${rec.notes}`;





          banner.appendChild(svNote);





        }











        const chkWrap = document.createElement('label');





        chkWrap.style.display = 'inline-flex';





        chkWrap.style.alignItems = 'center';





        chkWrap.style.gap = '6px';





        chkWrap.style.marginTop = '8px';











        const chk = document.createElement('input');





        chk.type = 'checkbox';





        const chkText = document.createTextNode(' Done?');











        chkWrap.appendChild(chk);





        chkWrap.appendChild(chkText);





        banner.appendChild(chkWrap);











        chk.addEventListener('change', async () => {





          if (!chk.checked) return;











          try {





            // --- 1) Flip the done flag directly in RTDB ---





            async function flipDone(uuid) {





              const url = withFirebaseAuth(`${baseURL}/siteVisits/${uuid}/meta/done.json`);





              const res = await fetch(url, {





                method: "PUT",





                headers: { "Content-Type": "application/json" },





                body: JSON.stringify(true)





              });





              if (!res.ok) throw new Error("Failed to flip done flag");





            }











            await flipDone(uuid);











            // --- 2) Post a note to NOTE_API (use latest object-note if any) ---





            await postNoteFromSiteVisit({ uuid, NOTE_API, rec });











            // --- 3) UI cleanup ---





            chk.disabled = true;





            chkWrap.textContent = "Thanks — recorded and cleared.";





            setTimeout(() => banner.remove(), 1200);











          } catch (err) {





            console.error("[SiteVisit] Failed to mark done:", err);





            alert("Failed to record completion.");





            chk.checked = false;





          }





        });











        // ========= END OLD VERSION =========





      } else {





        // ========= NEW VERSION: Inline editor via embed (when done === true) =========





        const editorWrap = document.createElement('div');











        const nonce = crypto?.getRandomValues





          ? crypto.getRandomValues(new Uint32Array(1))[0].toString(36)





          : String(Date.now());











        const src = `http://localhost:3210/embed?uuid=${encodeURIComponent(uuid)}&mode=siteVisit&nonce=${encodeURIComponent(nonce)}`;





        const iframe = document.createElement('iframe');





        Object.assign(iframe.style, { width: '100%', height: '30px', display: 'block' });





        iframe.src = src;





        editorWrap.appendChild(iframe);











        const EMBED_ORIGIN = new URL(src).origin;











        async function onMessage(e) {





          if (e.source !== iframe.contentWindow) return;





          if (e.origin !== EMBED_ORIGIN) return;











          const { type, payload } = e.data || {};











          if (type === 'REQUEST_CREDS') {





            const ok = !payload?.nonce || payload.nonce === nonce;





            if (!ok) return;





            iframe.contentWindow.postMessage(





              { type: 'CREDS', payload: { userName, nonce } },





              EMBED_ORIGIN





            );











          } else if (type === 'CLOSE_EMBED') {





            try {





              const latestRaw = await fetchSiteVisitRecord(uuid);





              const latest = normalizeSiteVisitRecord(latestRaw, uuid);





              if (latest?.meta?.done === true) {





                await postNoteFromSiteVisit({





                  uuid,





                  NOTE_API,





                  rec: latest





                });





              }





            } catch (err) {





              console.warn("[SiteVisit] Could not convert site-visit into past note:", err);





            }











            cleanupInline();





            // Re-render with done:true





            injectSiteVisitUI({





              parentEl,





              uuid,





              userName,





              NOTE_API,





              today,





              done: true





            });





          }





        }











        function onKey(e) {





          if (e.key === 'Escape') cleanupInline();





        }











        function cleanupInline() {





          window.removeEventListener('message', onMessage);





          window.removeEventListener('keydown', onKey);





          editorWrap.remove();





        }











        window.addEventListener('message', onMessage);





        window.addEventListener('keydown', onKey);





        banner.appendChild(editorWrap);





        // ========= END NEW VERSION =========





      }











    } else {





      // No active record: show action button





      banner.appendChild(buildVisitButtonRow());





    }











    // Insert at the top of the read-only notes





    parentEl.prepend(banner);





  } catch (e) {





    console.warn('[SiteVisit] Skipping banner due to error:', e);





    renderVisitButtonBanner();





  }





}











const editableDiv = document.createElement("div");











function sanitizeOrgNameForKey(name) {





  if (typeof name !== "string") return "";





  // Remove illegal symbols (anything not alphanumeric, space, hyphen)





  let cleaned = name.replace(/[^a-zA-Z0-9 \-]/g, "");





  // Trim and collapse spaces





  cleaned = cleaned.trim().replace(/\s+/g, " ");





  // Encode apostrophes





  return cleaned;





}











function decodeOrgNameFromDateKey(dateKey) {





  if (!dateKey) return "";





  try {





    const parts = String(dateKey).split("/").filter(Boolean);





    const last = parts[parts.length - 1] || "";





    return decodeURIComponent(last);





  } catch {





    return String(dateKey || "");





  }





}











function deriveAddressesFromFutureOrgKey(topKey) {





  if (!topKey) return [];





  try {





    const withoutSuffix = String(topKey).replace(/-futurenote$/i, "");





    const encodedSegment = withoutSuffix.split("_").slice(1).join(" ");





    if (!encodedSegment) return [];





    const decoded = decodeURIComponent(encodedSegment);





    return decoded





      .split("|")





      .map((part) => part.trim())





      .filter(Boolean);





  } catch {





    return [];





  }





}











function formatFutureOrgNoteForTransfer({





  notePayload,





  fallbackNote,





  fallbackOrgName,





  fallbackUserKey,





  fallbackTopKey





}) {





  const sanitizedFallbackNote = (fallbackNote || "").trim();





  const fallbackAddresses = deriveAddressesFromFutureOrgKey(fallbackTopKey);











  if (notePayload && typeof notePayload === "object") {





    const lines = [];





    const body = typeof notePayload.note === "string" ? notePayload.note.trim() : "";





    const primaryLine = body && body !== "(no note)" ? body : "";





    if (primaryLine) lines.push(primaryLine);











    const detailParts = [];





    const orgName = (notePayload.orgName || fallbackOrgName || "").trim();





    if (orgName) detailParts.push(`Org: ${orgName}`);











    const contact = notePayload.contact || {};





    const phone = (contact.phoneRaw || contact.phone || "").trim();





    if (phone) detailParts.push(`Phone: ${phone}`);





    const email = (contact.email || "").trim();





    if (email) detailParts.push(`Email: ${email}`);





    const website = (contact.website || "").trim();





    if (website) detailParts.push(`Website: ${website}`);











    const addresses = Array.isArray(notePayload.addresses) && notePayload.addresses.length





      ? notePayload.addresses





      : fallbackAddresses;





    if (addresses.length) {





      detailParts.push(`Addresses: ${addresses.join(" | ")}`);





    }











    if (detailParts.length) {





      lines.push(detailParts.join(" | "));





    }











    lines.push("(moved from future/online leads)");





    return lines.filter(Boolean).join("\n");





  }











  const fallbackParts = [];





  if (sanitizedFallbackNote && sanitizedFallbackNote !== "(no note)") fallbackParts.push(sanitizedFallbackNote);





  if (fallbackOrgName) fallbackParts.push(`Org: ${fallbackOrgName}`);





  if (fallbackUserKey) fallbackParts.push(`Key: ${fallbackUserKey}`);





  if (fallbackAddresses.length) fallbackParts.push(`Addresses: ${fallbackAddresses.join(" | ")}`);





  fallbackParts.push("(moved from future/online leads)");





  return fallbackParts.filter(Boolean).join("\n");





}











function uuidv() {





  if (typeof crypto !== "undefined" && crypto.randomUUID) {





    return crypto.randomUUID();





  }





  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {





    const r = Math.random() * 16 | 0;





    const v = c === 'x' ? r : (r & 0x3 | 0x8);





    return v.toString(16);





  });





}





function resetForm() {





  // text inputs





  orgNameInput.value = "";





  phoneInput.value = "";





  websiteInput.value = "";





  emailInput.value = "";





  noteArea.value = "";











  // address input + chips





  addrInput.value = "";





  addresses.length = 0;           // wipe array





  renderChips();                  // refresh chips UI











  // recompute key line + clear existing list





  currentKey = "";





  keyLine.textContent = "Key: —";





  existingList.innerHTML = "(No notes yet)";











  // focus for fast data entry





  orgNameInput.focus();





}

















async function transferFutureNoteToUUID({ orgKey, sourceUserName, sourceDate, noteText, NOTE_API, locationUuid, notePayload }) {





  if (!locationUuid) {





    alert("Open a specific GoGetta location first.");





    return;





  }





  await postToNoteAPI({





    uuid: orgKey,





    userName: sourceUserName,





    date: `https://gogetta.nyc/team/location/${sourceDate}`,





    note: null





  }).then(r => checkResponse(r, "Deleting original future/online note"));











  // 2) Write note under real UUID for today, authored by current user





  const currentUser = getCurrentUsername();





  const fallbackOrgName = decodeOrgNameFromDateKey(sourceDate);





  const readableUserKey = typeof fromFirebaseKey === "function" ? fromFirebaseKey(sourceUserName) : sourceUserName;





  const noteForLocation = formatFutureOrgNoteForTransfer({





    notePayload,





    fallbackNote: noteText,





    fallbackOrgName,





    fallbackUserKey: readableUserKey,





    fallbackTopKey: orgKey





  });











  await postToNoteAPI({





    uuid: locationUuid,





    userName: currentUser,





    date: today,





    note: noteForLocation





  }).then(r => checkResponse(r, "Transferring future/online note to UUID"));





  editableDiv.innerText = noteForLocation;





}





async function openFutureOnlineModal() {





  const userName = window.gghostUserName || await getUserNameSafely();











  // === helpers (scoped) ===











  function normalizeWebsiteHost(url) {





    if (!url) return "";





    try {





      const u = new URL(/^[a-z]+:\/\//i.test(url) ? url : `https://${url}`);





      return u.hostname.toLowerCase();





    } catch { return String(url || "").trim().toLowerCase(); }





  }





function toFirebaseKey(str) {





  if (typeof str !== "string") return "x";





  return str





    .trim()





    .toLowerCase()





    .replace(/[.#$/\[\]]/g, "_"); // replace forbidden chars with underscore





}











function buildCompositeUuid(website, email, phone) {





  const w = toFirebaseKey(normalizeWebsiteHost(website) || "x");





  const e = toFirebaseKey(email || "x");





  const p = toFirebaseKey(phone || "x");





  return `${w}-${e}-${p}`;





}











  function looksLikeCompositeKey(key) {





    // Accept keys that clearly aren't UUIDs: contain a dot (domain) or '@' (email)





    // and exclude plain UUIDs like 8-4-4-4-12 hex.





    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(key);





    return !isUUID && (key.includes("@") || key.includes("."));





  }





  function getCurrentLocationUuidFromPath() {





    const path = location.pathname;





    const fullServiceMatch = path.match(/^\/team\/location\/([a-f0-9-]+)\/services\/([a-f0-9-]+)(?:\/|$)/);





    const teamMatch = path.match(/^\/team\/location\/([a-f0-9-]+)\/?/);





    const findMatch = path.match(/^\/find\/location\/([a-f0-9-]+)\/?/);





    return (fullServiceMatch || teamMatch || findMatch)?.[1] || null;





  }





  function validPhone(p){ return !p || /^[0-9()+\-\s]{7,}$/.test(p); }





function validUrl(u) {





  if (!u) return true; // empty allowed





  const s = String(u).trim();





  if (/\s/.test(s)) return false;





  if (/^javascript:|^data:|^file:/i.test(s)) return false;





  try {





    // If missing scheme, add https:// for parsing only





    new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`);





    return true;





  } catch {





    return false;





  }





}





  function validEmail(e){ return !e || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e); }











  // === Overlay ===





  const overlay = document.createElement('div');





  Object.assign(overlay.style, { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 100000 });











  const modal = document.createElement('div');





  Object.assign(modal.style, {





    position: 'fixed', top: '10%', left: '50%', transform: 'translateX(-50%)',





    width: '760px', maxHeight: '80%', overflow: 'hidden',





    background: '#fff', border: '2px solid #000', borderRadius: '8px',





    display: 'flex', gap: '16px', padding: '16px', zIndex: 100001





  });











  // Left/form





  const form = document.createElement('div');





  Object.assign(form.style, { flex: '1 1 55%', display: 'flex', flexDirection: 'column', gap: '8px', overflow: 'auto' });





  form.innerHTML = `





    <h3 style="margin:0 0 8px 0;">Add future/online org</h3>





    <label style="font-weight:600">Organization name





      <input id="fo-org-name" type="text" placeholder="e.g., New Example Org" style="width:100%;padding:6px;margin-top:4px;">





    </label>

















    <div style="display:grid;grid-template-columns:1fr;gap:6px;padding:8px;border:1px solid #ddd;border-radius:6px;">





      <div style="font-weight:600">At least one required:</div>





      <input id="fo-phone" type="text" placeholder="Phone (digits only)" style="width:100%;padding:6px;">





      <input id="fo-website" type="text" placeholder="Website (https://example.org)" style="width:100%;padding:6px;">





      <input id="fo-email" type="text" placeholder="Email (name@example.org)" style="width:100%;padding:6px;">





    </div>











    <div style="padding:8px;border:1px solid #ddd;border-radius:6px;">





      <div style="display:flex;gap:6px;align-items:center;margin-bottom:6px;">





        <input id="fo-address-input" type="text" placeholder="Address (add multiple)" style="flex:1;padding:6px;">





        <button id="fo-address-add" type="button" style="padding:6px 10px;border:1px solid #000;border-radius:4px;background:#fff;cursor:pointer;">Add</button>





      </div>





      <div id="fo-address-list" style="display:flex;flex-wrap:wrap;gap:6px;"></div>





      <div style="font-size:12px;color:#666;margin-top:6px;">Tip: add several addresses. We will concatenate them for storage.</div>





    </div>











    <label style="font-weight:600">Note about the org





      <textarea id="fo-note" placeholder="What should we know?" style="width:100%;height:120px;padding:6px;margin-top:4px;"></textarea>





    </label>











    <div style="display:flex;gap:8px;margin-top:8px;">





      <button id="fo-cancel" type="button" style="padding:8px 12px;border:1px solid #000;border-radius:4px;background:#fff;cursor:pointer;">Cancel</button>





      <button id="fo-save" type="button" style="padding:8px 12px;border:1px solid #000;border-radius:4px;background:#e6ffe6;cursor:pointer;font-weight:700;">Save</button>





    </div>





  `;











  // Right/existing





  const right = document.createElement('div');





  Object.assign(right.style, { flex: '1 1 45%', display: 'flex', flexDirection: 'column' });





  right.innerHTML = `





    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">





      <h4 style="margin:0;">Existing future/online leads</h4>





    </div>





    <div id="fo-existing" style="flex:1 1 auto;overflow:auto;border:1px solid #ddd;border-radius:6px;padding:8px;min-height:180px;background:#fafafa;"></div>





  `;











  modal.appendChild(form);





  modal.appendChild(right);





  overlay.appendChild(modal);





  document.body.appendChild(overlay);





requestAnimationFrame(() => loadExisting());





overlay.addEventListener("click", (e) => {





  if (e.target === overlay) {





    resetFormState();





    overlay.remove();





  }





});





  const q = sel => modal.querySelector(sel);





  const orgNameEl    = q('#fo-org-name');





  const phoneEl      = q('#fo-phone');





  const websiteEl    = q('#fo-website');





  const emailEl      = q('#fo-email');





  const addressInput = q('#fo-address-input');





  const addressAdd   = q('#fo-address-add');





  const addressList  = q('#fo-address-list');





  const noteEl       = q('#fo-note');





  const cancelBtn    = q('#fo-cancel');





  const saveBtn      = q('#fo-save');





  const refreshBtn   = q('#fo-refresh');





  const existingDiv  = q('#fo-existing');











  let editingEntry = null;











  function parseFutureOrgNoteValue(noteVal) {





    if (!noteVal) return null;





    if (typeof noteVal === "object") {





      if (!noteVal) return null;





      if (!noteVal.type || noteVal.type === "futureOrg" || noteVal.orgName || noteVal.addresses) {





        return noteVal;





      }





      return null;





    }





    if (typeof noteVal !== "string") return null;





    try {





      const parsed = JSON.parse(noteVal);





      if (parsed && typeof parsed === "object") {





        if (!parsed.type || parsed.type === "futureOrg" || parsed.orgName || parsed.addresses) {





          return parsed;





        }





      }





    } catch {





      return null;





    }





    return null;





  }











  function getEntryAddresses(entry) {





    if (!entry) return [];





    const noteAddresses = Array.isArray(entry.noteData?.addresses)





      ? entry.noteData.addresses.filter(Boolean)





      : [];





    if (noteAddresses.length) return noteAddresses;





    return deriveAddressesFromFutureOrgKey(entry.topKey);





  }











  function getEntryContact(entry) {





    const contact = {





      website: "",





      email: "",





      phone: "",





      phoneDisplay: ""





    };





    if (!entry) return contact;











    const noteContact = entry.noteData?.contact || {};





    if (noteContact.website) contact.website = noteContact.website;





    if (noteContact.email) contact.email = noteContact.email;





    if (noteContact.phone) contact.phone = noteContact.phone;





    if (noteContact.phoneRaw) contact.phoneDisplay = noteContact.phoneRaw;





    if (!contact.phoneDisplay && contact.phone) contact.phoneDisplay = contact.phone;











    if (looksLikeCompositeKey(entry.userKey)) {





      const decoded = decodeCompositeKey(entry.userKey);





      if (!contact.website && decoded.website) contact.website = decoded.website;





      if (!contact.email && decoded.email) contact.email = decoded.email;





      if (!contact.phone && decoded.phone) contact.phone = decoded.phone;





      if (!contact.phoneDisplay && decoded.phone) contact.phoneDisplay = decoded.phone;





    }











    if (!contact.phoneDisplay && contact.phone) contact.phoneDisplay = contact.phone;











    return contact;





  }











  function getEntryOrgName(entry) {





    if (!entry) return "";





    if (entry.noteData?.orgName) return entry.noteData.orgName;





    return decodeOrgNameFromDateKey(entry.dateKey);





  }











  function formatTimestampForDisplay(ts) {





    if (!ts) return "";





    try {





      const date = new Date(ts);





      if (Number.isNaN(date.getTime())) return String(ts);





      return date.toLocaleString();





    } catch {





      return String(ts);





    }





  }











  function buildFutureOrgNotePayload({





    orgName,





    noteText,





    addressesList,





    website,





    email,





    phoneDigits,





    phoneRaw,





    actingUser,





    existing,





    compositeKey,





    targetKeys





  }) {





    const nowIso = new Date().toISOString();





    const metadata = {





      createdAt: existing?.metadata?.createdAt || nowIso,





      createdBy: existing?.metadata?.createdBy || actingUser,





      updatedAt: nowIso,





      updatedBy: actingUser





    };











    const contact = {};





    if (website) contact.website = website;





    if (email) contact.email = email;





    if (phoneDigits) contact.phone = phoneDigits;





    if (phoneRaw) contact.phoneRaw = phoneRaw;





    if (compositeKey) contact.compositeKey = compositeKey;











    const payload = {





      type: "futureOrg",





      version: 1,





      orgName,





      note: noteText || "(no note)",





      metadata





    };











    if (addressesList.length) payload.addresses = addressesList;





    if (Object.keys(contact).length) payload.contact = contact;





    if (targetKeys) payload.source = targetKeys;











    return payload;





  }











  const addresses = [];





  function renderAddresses() {





    addressList.innerHTML = '';





    addresses.forEach((addr, idx) => {





      const pill = document.createElement('div');





      pill.textContent = addr;





      Object.assign(pill.style, { padding: '4px 8px', border: '1px solid #000', borderRadius: '999px', background:'#fff', display:'inline-flex', alignItems:'center', gap:'8px' });





      const x = document.createElement('span');





      x.textContent = 'x';





      Object.assign(x.style, { cursor: 'pointer', fontWeight: 700 });





      x.onclick = () => { addresses.splice(idx,1); renderAddresses(); };





      pill.appendChild(x);





      addressList.appendChild(pill);





    });





  }





  function exitEditingMode() {





    editingEntry = null;





    saveBtn.textContent = "Save";





    saveBtn.removeAttribute("data-mode");





  }











  function resetFormState() {





    orgNameEl.value = "";





    phoneEl.value = "";





    websiteEl.value = "";





    emailEl.value = "";





    noteEl.value = "";





    addressInput.value = "";





    addresses.splice(0, addresses.length);





    renderAddresses();





    exitEditingMode();





  }











  function startEditing(entry) {





    editingEntry = {





      topKey: entry.topKey,





      userKey: entry.userKey,





      dateKey: entry.dateKey,





      noteData: entry.noteData





    };





    saveBtn.textContent = "Update";





    saveBtn.dataset.mode = "edit";











    const orgName = getEntryOrgName(entry);





    const contact = getEntryContact(entry);





    const editAddresses = getEntryAddresses(entry);











    orgNameEl.value = orgName || "";





    phoneEl.value = contact.phoneDisplay || "";





    websiteEl.value = contact.website || "";





    emailEl.value = contact.email || "";











    const noteValue = entry.noteData?.note || entry.displayNote || "";





    noteEl.value = noteValue === "(no note)" ? "" : noteValue;











    addresses.splice(0, addresses.length);





    addresses.push(...editAddresses);





    renderAddresses();





    addressInput.value = "";





    orgNameEl.focus();





  }











  addressAdd.onclick = () => {





    const v = addressInput.value.trim();





    if (!v) return;





    if (!addresses.includes(v)) {





      addresses.push(v);





      renderAddresses();





    }





    addressInput.value = '';





  };











  cancelBtn.onclick = () => {





    resetFormState();





    overlay.remove();





  };











async function saveFutureLead() {





  const orgName = orgNameEl.value.trim();





  const phoneRawInput = phoneEl.value.trim();





  const phoneDigits = getLast10Digits(phoneRawInput);





  const website = websiteEl.value.trim();





  const email = emailEl.value.trim();





  const noteText = noteEl.value.trim();











  const addrVal = addressInput.value.trim();





  if (addrVal && !addresses.includes(addrVal)) {





    addresses.push(addrVal);





    renderAddresses();





  }





  if (addrVal) {





    addressInput.value = "";





  }











  const sanitizedAddresses = addresses.map(addr => addr.trim()).filter(Boolean);











  if (!orgName) { alert("Organization name is required."); return; }





  if (!phoneDigits && !website && !email) { alert("Provide at least one of phone, website, or email."); return; }





  if (!validPhone(phoneRawInput))   { alert("Phone looks invalid."); return; }





  if (!validUrl(website))   { alert("Website must be a valid link."); return; }





  if (!validEmail(email))   { alert("Email looks invalid."); return; }











  const actingUser = userName || getCurrentUsername();





  const compositeKey = buildCompositeUuid(website, email, phoneDigits);











  const isEditing = !!editingEntry;





  const targetUuid = isEditing





    ? editingEntry.topKey





    : `${uuidv()}_${sanitizedAddresses.join(' | ')}-futureNote`;





  const targetUserKey = isEditing ? editingEntry.userKey : compositeKey;





  const targetDateKey = isEditing





    ? editingEntry.dateKey





    : `https://gogetta.nyc/team/location/${encodeURIComponent(orgName)}`;











  const notePayload = buildFutureOrgNotePayload({





    orgName,





    noteText,





    addressesList: sanitizedAddresses,





    website,





    email,





    phoneDigits,





    phoneRaw: phoneRawInput,





    actingUser,





    existing: editingEntry?.noteData,





    compositeKey,





    targetKeys: { uuid: targetUuid, userKey: targetUserKey, dateKey: targetDateKey }





  });











  const actionLabel = isEditing ? "Updating future/online org" : "Saving future/online org";











  const payload = {





    uuid: targetUuid,





    userName: targetUserKey,





    date: targetDateKey,





    note: JSON.stringify(notePayload)





  };











  try {





    const res = await postToNoteAPI(payload);





    await checkResponse(res, actionLabel);





    resetFormState();





    await loadExisting();





  } catch (e) {





    console.error(e);





    alert(e.message || "Failed to save.");





  }





}











  saveBtn.onclick = saveFutureLead;











function decodeCompositeKey(key) {





  // Split into 3 parts: website, email, phone





  const parts = key.split("-");





  while (parts.length < 3) parts.push("x"); // pad if short





  const [w, e, p] = parts.map(v => v.replace(/_/g, ".")); // restore dots





  return { website: w === "x" ? "" : w, email: e === "x" ? "" : e, phone: p === "x" ? "" : p };





}











async function loadExisting() {





  existingDiv.innerHTML = "Loading...";





  try {





    const r = await fetch(`${baseURL}locationNotes.json`);





    if (!r.ok) throw new Error(`Fetch failed: ${r.status}`);





    const all = await r.json() || {};











    const cards = [];











    for (const [topKey, userMap] of Object.entries(all)) {





      if (!userMap || typeof userMap !== "object") continue;











      const entries = [];











      for (const [userKey, dateMap] of Object.entries(userMap)) {





        if (!dateMap || typeof dateMap !== "object") continue;











        for (const [dateKey, noteVal] of Object.entries(dateMap)) {





          const noteData = parseFutureOrgNoteValue(noteVal);





          const isFuture =





            noteData?.type === "futureOrg" ||





            /-futurenote$/i.test(userKey) ||





            /-futurenote$/i.test(topKey) ||





            looksLikeCompositeKey(topKey) ||





            looksLikeCompositeKey(userKey);











          if (!isFuture) continue;











          const displayNote =





            noteData?.note ||





            (typeof noteVal === "string" ? noteVal : "");











          entries.push({





            topKey,





            userKey,





            dateKey,





            noteData,





            displayNote: displayNote || "(no note)",





            rawNote: noteVal





          });





        }





      }











      if (!entries.length) continue;











      const card = document.createElement("div");





      Object.assign(card.style, {





        border: "1px solid #ccc",





        borderRadius: "6px",





        background: "#fff",





        padding: "8px",





        marginBottom: "8px"





      });











      const title = document.createElement("div");





      title.style.fontWeight = "700";





      const nameFromNotes = entries.map(getEntryOrgName).find(Boolean);





      let fallbackTitle = "";





      const firstEntry = entries[0];





      if (firstEntry) {





        const candidate = firstEntry.dateKey || firstEntry.userKey || topKey;





        const decodedName = decodeOrgNameFromDateKey(firstEntry.dateKey);





        if (decodedName) {





          fallbackTitle = decodedName;





        } else {





          try {





            fallbackTitle = decodeURIComponent(candidate);





          } catch {





            fallbackTitle = candidate;





          }





        }





      }





      title.textContent = nameFromNotes || fallbackTitle || "(unknown org)";





      card.appendChild(title);











      const meta = document.createElement("div");





      meta.style.fontSize = "12px";





      meta.style.color = "#555";











      const metaSource = entries.find(entry => entry.noteData) || entries[0];





      const metaContact = getEntryContact(metaSource);





      const metaAddresses = getEntryAddresses(metaSource);











      const websiteHtml = metaContact.website ? escapeHtml(metaContact.website) : "(none)";





      const emailHtml = metaContact.email ? escapeHtml(metaContact.email) : "(none)";





      const phoneDisplay = metaContact.phoneDisplay || "";





      const phoneHtml = phoneDisplay ? escapeHtml(phoneDisplay) : "(none)";





      const addressesHtml = metaAddresses.length





        ? metaAddresses.map(addr => escapeHtml(addr)).join("<br>")





        : "(none)";











      meta.innerHTML = `





        Website: ${websiteHtml}<br>





        Email: ${emailHtml}<br>





        Phone: ${phoneHtml}<br>





        Addresses: ${addressesHtml}





      `;





      card.appendChild(meta);











      const list = document.createElement("div");





      list.style.marginTop = "6px";











      entries.forEach(entry => {





        const row = document.createElement("div");





        row.style.borderTop = "1px dashed #eee";





        row.style.padding = "6px 0";











        const noteBlock = document.createElement("div");





        noteBlock.style.whiteSpace = "pre-wrap";





        noteBlock.style.marginTop = "4px";





        noteBlock.textContent = entry.noteData?.note || entry.displayNote || "(no note)";





        row.appendChild(noteBlock);











        const noteMeta = entry.noteData?.metadata;





        if (noteMeta && (noteMeta.updatedAt || noteMeta.updatedBy || noteMeta.createdAt || noteMeta.createdBy)) {





          const metaLine = document.createElement("div");





          metaLine.style.fontSize = "12px";





          metaLine.style.color = "#666";





          const parts = [];





          if (noteMeta.updatedAt) parts.push(`Updated: ${formatTimestampForDisplay(noteMeta.updatedAt)}`);





          if (noteMeta.updatedBy) parts.push(`By: ${noteMeta.updatedBy}`);





          if (!parts.length && noteMeta.createdAt) parts.push(`Created: ${formatTimestampForDisplay(noteMeta.createdAt)}`);





          if (!parts.length && noteMeta.createdBy) parts.push(`By: ${noteMeta.createdBy}`);





          if (parts.length) metaLine.textContent = parts.join(" | ");





          row.appendChild(metaLine);





        }











        const actions = document.createElement("div");





        actions.style.marginTop = "6px";





        actions.style.display = "flex";





        actions.style.flexWrap = "wrap";





        actions.style.gap = "8px";











        const currentUuid = getCurrentLocationUuidFromPath();





        if (currentUuid) {





          const moveHereBtn = document.createElement("button");





          moveHereBtn.textContent = "Move to this location";





          moveHereBtn.style.padding = "4px 6px";





          moveHereBtn.addEventListener("click", async () => {





            if (!confirm(`Move note to current location (${currentUuid})?`)) return;





            try {





              await transferFutureNoteToUUID({





                orgKey: entry.topKey,





                sourceUserName: entry.userKey,





                sourceDate: entry.dateKey,





                noteText: entry.noteData?.note || entry.displayNote,





                NOTE_API,





                locationUuid: currentUuid,





                notePayload: entry.noteData





              });





              await loadExisting();





            } catch (err) {





              console.error(err);





              alert("Failed to move note.");





            }





          });





          actions.appendChild(moveHereBtn);





        }











        const moveOtherWrapper = document.createElement("div");





        moveOtherWrapper.style.display = "flex";





        moveOtherWrapper.style.gap = "4px";





        const linkInput = document.createElement("input");





        linkInput.type = "url";





        linkInput.placeholder = "Paste GoGetta link";





        linkInput.style.flex = "1";





        linkInput.style.minWidth = "140px";











        const moveOtherBtn = document.createElement("button");





        moveOtherBtn.textContent = "Move to link";





        moveOtherBtn.addEventListener("click", async () => {





          const val = linkInput.value.trim();





          const match = val.match(/\/location\/([a-f0-9-]{12,})/);





          if (!match) {





            alert("Invalid GoGetta location link.");





            return;





          }





          const targetUuid = match[1];





          if (!confirm(`Move note to location: ${targetUuid}?`)) return;





          try {





            await transferFutureNoteToUUID({





              orgKey: entry.topKey,





              sourceUserName: entry.userKey,





              sourceDate: entry.dateKey,





              noteText: entry.noteData?.note || entry.displayNote,





              NOTE_API,





              locationUuid: targetUuid,





              notePayload: entry.noteData





            });





            await loadExisting();





          } catch (err) {





            console.error(err);





            alert("Failed to move note.");





          }





        });











        moveOtherWrapper.appendChild(linkInput);





        moveOtherWrapper.appendChild(moveOtherBtn);





        actions.appendChild(moveOtherWrapper);











        const editBtn = document.createElement("button");





        editBtn.textContent = "Edit";





        editBtn.style.padding = "4px 6px";





        editBtn.addEventListener("click", () => {





          startEditing(entry);





        });





        actions.appendChild(editBtn);











        row.appendChild(actions);





        list.appendChild(row);





      });











      card.appendChild(list);





      cards.push(card);





    }











    existingDiv.innerHTML = cards.length





      ? ""





      : "<i>No future/online leads found.</i>";





    cards.forEach(c => existingDiv.appendChild(c));











  } catch (e) {





    console.error(e);





    existingDiv.innerHTML = `<span style="color:#900">Failed to load.</span>`;





  }





}









































}











function getTrafficLightColor(lastValidated) {





  if (!lastValidated) return "#ccc"; 





  const last = new Date(lastValidated);





  const now = new Date();





  const diffInMonths = (now - last) / (1000 * 60 * 60 * 24 * 30);





  if (diffInMonths < 6) return "#4CAF50"; 





  if (diffInMonths < 12) return "#FF9800"; 





  return "#F44336"; 





}





function escapeHtml(str) {





  if (typeof str !== 'string') return '';





  return str.replace(/[&<>"']/g, match =>





    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[match]





  );





}





async function checkResponse(response, actionDescription) {





  const errText = await response.text();





  if (!response.ok) {





    if (response.status === 403) {





      alert("⚠️ Incorrect password. Please check your name and password, then refresh the page.");





    } else {





      alert(`❌ ${actionDescription} failed.\n\nPlease check your name and password, then refresh the page.\n\nError: ${errText}`);





    }





    throw new Error(`${actionDescription} failed. Status ${response.status}: ${errText}`);





  }





}











const PAGE_LOCATION_CACHE_KEY = 'gghost-page-location-cache';





const PAGE_LOCATION_CACHE_TTL_MS = 2 * 60 * 1000;











function getCurrentPageLocationUuid() {





  const match = location.pathname.match(/\/(?:team|find)\/location\/([a-f0-9-]{12,36})/i);





  return match ? match[1] : null;





}











function readPageLocationCacheEntry(uuid) {





  if (!uuid) return null;





  const pageUuid = getCurrentPageLocationUuid();





  if (!pageUuid || pageUuid.toLowerCase() !== uuid.toLowerCase()) return null;





  try {





    const raw = localStorage.getItem(PAGE_LOCATION_CACHE_KEY);





    if (!raw) return null;





    const parsed = JSON.parse(raw);





    if (!parsed || typeof parsed !== 'object') return null;





    if (!parsed.uuid || String(parsed.uuid).toLowerCase() !== uuid.toLowerCase()) return null;





    const timestamp = Number(parsed.timestamp) || 0;





    const data = parsed.data;





    if (!data || typeof data !== 'object') return null;





    const dataId = String(data.id || '').toLowerCase();





    if (dataId && dataId !== uuid.toLowerCase()) return null;





    const isStale = !timestamp || Date.now() - timestamp > PAGE_LOCATION_CACHE_TTL_MS;





    return { data, timestamp, isStale };





  } catch (err) {





    console.warn('[LocationCache] Failed to read page cache', err);





    return null;





  }





}











function readPageLocationCache(uuid, { allowStale = false } = {}) {
  const entry = readPageLocationCacheEntry(uuid);





  if (!entry) return null;





  if (entry.isStale && !allowStale) {





    localStorage.removeItem(PAGE_LOCATION_CACHE_KEY);





    return null;





  }





  return entry.data;
}

const VISIT_HISTORY_STORAGE_KEY = 'gghost-location-visit-history';
const VISIT_HISTORY_LIMIT = 200;
const VISIT_HISTORY_DEDUP_MS = 30 * 1000;

function getLocationPageType(pathname) {
  const normalized = String(pathname || '').toLowerCase();
  if (normalized.includes('/services/')) return 'Service';
  if (normalized.includes('/questions/')) return 'Question';
  if (normalized.includes('/other-info')) return 'Other Info';
  if (normalized.includes('/recap')) return 'Recap';
  return 'Location';
}

function getLocationContextFromUrl(url) {
  let pathname = '';
  try {
    pathname = new URL(url).pathname;
  } catch {
    pathname = location.pathname || '';
  }
  const match = pathname.match(/\/(?:team|find)\/location\/([a-f0-9-]{12,36})(?:\/([^?#]*))?/i);
  if (!match) return null;
  const uuid = match[1];
  const suffix = (match[2] || '').replace(/^\/+|\/+$/g, '');
  const fullPath = suffix ? `/team/location/${uuid}/${suffix}` : `/team/location/${uuid}`;
  return {
    uuid,
    fullPath,
    pageType: getLocationPageType(fullPath)
  };
}

function buildLocationDisplayName(details, uuid) {
  const org = String(details?.org || details?.orgName || '').trim();
  const name = String(details?.name || details?.locationName || '').trim();
  if (org && name && org.toLowerCase() !== name.toLowerCase()) {
    return `${org} - ${name}`;
  }
  return org || name || `Location ${uuid}`;
}

function readVisitHistory() {
  try {
    const raw = localStorage.getItem(VISIT_HISTORY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((entry) => ({
        uuid: entry?.uuid || '',
        fullPath: entry?.fullPath || '',
        pageType: entry?.pageType || getLocationPageType(entry?.fullPath || ''),
        visitedAt: Number(entry?.visitedAt) || 0
      }))
      .filter((entry) => entry.uuid && entry.visitedAt)
      .sort((a, b) => b.visitedAt - a.visitedAt)
      .slice(0, VISIT_HISTORY_LIMIT);
  } catch (err) {
    console.warn('[VisitHistory] Failed to read visit history', err);
    return [];
  }
}

function recordLocationVisit(context) {
  if (!context || !context.uuid || !context.fullPath) return;
  const now = Date.now();
  const entry = {
    uuid: context.uuid,
    fullPath: context.fullPath,
    pageType: context.pageType || getLocationPageType(context.fullPath),
    visitedAt: now
  };
  try {
    const history = readVisitHistory();
    const last = history[0];
    if (last
      && last.uuid === entry.uuid
      && last.fullPath === entry.fullPath
      && now - last.visitedAt < VISIT_HISTORY_DEDUP_MS
    ) {
      return;
    }
    const next = [entry, ...history];
    if (next.length > VISIT_HISTORY_LIMIT) {
      next.length = VISIT_HISTORY_LIMIT;
    }
    localStorage.setItem(VISIT_HISTORY_STORAGE_KEY, JSON.stringify(next));
  } catch (err) {
    console.warn('[VisitHistory] Failed to record visit', err);
  }
}

let locationTitleRequestId = 0;

async function updateLocationTitleAndVisit(url = location.href) {
  const context = getLocationContextFromUrl(url);
  if (!context) return;
  recordLocationVisit(context);
  const requestId = ++locationTitleRequestId;
  const details = await fetchLocationDetails(context.uuid);
  if (requestId !== locationTitleRequestId) return;
  if (!details?.org && !details?.name) return;
  const displayName = buildLocationDisplayName(details, context.uuid);
  const suffix = context.pageType && context.pageType !== 'Location'
    ? ` - ${context.pageType}`
    : '';
  document.title = `${displayName}${suffix} | GoGetta`;
}

const LOCATION_DETAILS_CACHE_MS = 60 * 1000;
const locationDetailsCache = new Map();





const locationDetailsInFlight = new Map();











function buildEmptyLocationDetails() {





  return {





    org: "",





    name: "",





    slug: "",





    address: "",





    city: "",





    state: "",





    zip: "",





    services: [],





    isClosed: false





  };





}











function buildLocationDetails(data, lastValidated) {





  // Determine if location is closed based on HolidaySchedules





  const isLocationClosed = (() => {





    if (!Array.isArray(data.Services) || data.Services.length === 0) {





      return false; // No services means we can't determine closure





    }











    // Check if ALL services have closed: true in their HolidaySchedules





    return data.Services.every(service => {





      if (!Array.isArray(service.HolidaySchedules) || service.HolidaySchedules.length === 0) {





        return false; // No holiday schedules means not closed





      }











      // Check if any holiday schedule has closed: true





      return service.HolidaySchedules.some(schedule => schedule.closed === true);





    });





  })();











  return {





    org: data.Organization?.name || "",





    name: data.name || "",





    slug: data.slug || "",





    address: data.address?.street || "",





    city: data.address?.city || "",





    state: data.address?.state || "",





    zip: data.address?.postalCode || "",





    services: Array.isArray(data.Services) ? data.Services.map(s => s.name).filter(Boolean) : [],





    lastValidated,





    isClosed: isLocationClosed





  };





}











async function fetchLocationDetailsFromBackground(uuid, headers) {
  if (!chrome?.runtime?.sendMessage) return null;
  return new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage(
        { type: 'FETCH_LOCATION_DETAILS', uuid, headers },
        (response) => {
          if (chrome.runtime.lastError) {
            resolve({ ok: false, error: chrome.runtime.lastError.message });
            return;
          }
          resolve(response || { ok: false, error: 'No response' });
        }
      );
    } catch (err) {
      resolve({ ok: false, error: err?.message || String(err) });
    }
  });
}


async function fetchLocationDetails(uuid, { refresh = false } = {}) {





  if (!uuid) return buildEmptyLocationDetails();











  if (!refresh) {





    const cached = locationDetailsCache.get(uuid);





    if (cached && Date.now() - cached.timestamp < LOCATION_DETAILS_CACHE_MS) {





      return cached.data;





    }





    const inFlight = locationDetailsInFlight.get(uuid);





    if (inFlight) {





      return inFlight;





    }





  }











  if (!refresh) {





    const pageData = readPageLocationCache(uuid);





    if (pageData) {





      const lastValidated = pageData.last_validated_at || null;







      await recordLocationStatsFromPayload(uuid, pageData, { source: "page-cache" });







      const result = buildLocationDetails(pageData, lastValidated);





      locationDetailsCache.set(uuid, { data: result, timestamp: Date.now() });





      return result;





    }





  }











  const request = (async () => {





    try {





      const headers = getAuthHeaders();





      void recordLocationInvocation(uuid, "fetchLocationDetails");





      let data = null;
      try {
        const res = await fetch(`https://w6pkliozjh.execute-api.us-east-1.amazonaws.com/prod/locations/${uuid}`, { headers });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        data = await res.json();
      } catch (err) {
        if (err && err.name === 'TypeError') {
          const fallback = await fetchLocationDetailsFromBackground(uuid, headers);
          if (fallback?.ok && fallback.data) {
            data = fallback.data;
          } else {
            throw err;
          }
        } else {
          throw err;
        }
      }

      if (!data) throw new Error('No location data');
















      const lastValidated = data.last_validated_at || null;







      await recordLocationStatsFromPayload(uuid, data, { source: "fetchLocationDetails" });







      return buildLocationDetails(data, lastValidated);





    } catch (err) {





      console.warn("Failed to fetch location:", err);

      const cached = locationDetailsCache.get(uuid);
      if (cached?.data) return cached.data;

      return buildEmptyLocationDetails();





    }





  })();











  if (!refresh) {





    locationDetailsInFlight.set(uuid, request);





  }











  let result;





  try {





    result = await request;





  } finally {





    if (!refresh) {





      locationDetailsInFlight.delete(uuid);





    }





  }











  const hasData = result.org || result.name || result.slug || result.address || result.services.length;





  if (!refresh && hasData) {





    locationDetailsCache.set(uuid, { data: result, timestamp: Date.now() });





  }











  return result;





}











let isInConnectionMode = false;





function updateEditablePlaceholder() {





  const editableNoteDiv = document.getElementById("editable-note");





  if (!editableNoteDiv) return;











  const placeholder = "Write your note here...";





  if (editableNoteDiv.textContent.trim() === "") {





    editableNoteDiv.setAttribute("data-placeholder", placeholder);





    editableNoteDiv.classList.add("empty");





  } else {





    editableNoteDiv.removeAttribute("data-placeholder");





    editableNoteDiv.classList.remove("empty");





  }





}











document.addEventListener("input", updateEditablePlaceholder);





document.addEventListener("DOMContentLoaded", updateEditablePlaceholder);











// Function to check if current location has linked locations





async function hasLinkedLocations() {





  const fullServiceMatch = location.pathname.match(/^\/team\/location\/([a-f0-9-]+)\/services\/([a-f0-9-]+)(?:\/|$)/);





  const teamMatch = location.pathname.match(/^\/team\/location\/([a-f0-9-]+)\/?/);





  const findMatch = location.pathname.match(/^\/find\/location\/([a-f0-9-]+)\/?/);





  const uuid = (fullServiceMatch || teamMatch || findMatch)?.[1];











  if (!uuid) return false;











  try {





    const firebaseURL = `${baseURL}locationNotes/connections.json`;





    const res = await fetch(firebaseURL);





    if (!res.ok) return false;











    const allData = await res.json();





    const allGroups = allData || {};











    const relevantGroups = Object.entries(allGroups).filter(





      ([groupName, entry]) =>





        typeof entry === "object" &&





        entry[uuid] === true





    );











    return relevantGroups.length > 0;





  } catch (error) {





    console.error("[gghost.js] Error checking linked locations:", error);





    return false;





  }





}











async function toggleConnectionMode() {





  console.log("[gghost.js] toggleConnectionMode called. Current isInConnectionMode:", isInConnectionMode); 





 





  isInConnectionMode = !isInConnectionMode;





  console.log("[gghost.js] isInConnectionMode toggled to:", isInConnectionMode); 





const connectionButton =





  document.getElementById("connection-mode-button") ||





  document.getElementById("notes-toggle-button");





  const readonlyNotesDiv = document.getElementById("readonly-notes");





  const editableNoteDiv = document.getElementById("editable-note"); 





  const liveBtn = Array.from(document.querySelectorAll("button"))





    .find(btn => btn.textContent.includes("Transcribing"));





  const aiBtn = Array.from(document.querySelectorAll("button"))





    .find(btn => btn.textContent.includes("Format with AI"));





  let connectionsDiv = document.getElementById("connected-locations");





  console.log("[gghost.js] connectionButton:", connectionButton);





  console.log("[gghost.js] readonlyNotesDiv:", readonlyNotesDiv);





  console.log("[gghost.js] editableNoteDiv:", editableNoteDiv);





  console.log("[gghost.js] liveBtn:", liveBtn);





  console.log("[gghost.js] aiBtn:", aiBtn);





  console.log("[gghost.js] connectionsDiv (initial):", connectionsDiv);





  if (connectionButton) {





    if (isInConnectionMode) { 





      console.log('[gghost.js] Switching to connection mode.');





      connectionButton.innerText = "Notes";





      if (readonlyNotesDiv) readonlyNotesDiv.style.display = "none"; else console.warn("[gghost.js] readonlyNotesDiv not found for hiding");





      if (editableNoteDiv) editableNoteDiv.style.display = "none"; else console.warn("[gghost.js] editableNoteDiv not found for hiding");





      if (liveBtn) liveBtn.style.display = "none"; else console.warn("[gghost.js] liveBtn not found for hiding");





      if (aiBtn) aiBtn.style.display = "none"; else console.warn("[gghost.js] aiBtn not found for hiding");





      if (connectionsDiv) {





        console.log('[gghost.js] connectionsDiv exists. Ensuring it is in noteWrapper and visible.');





        const noteWrapper = document.getElementById('gg-note-wrapper');





        if (noteWrapper && connectionsDiv.parentNode !== noteWrapper) {





            console.log('[gghost.js] connectionsDiv is not a child of noteWrapper. Appending it.');





            noteWrapper.appendChild(connectionsDiv); 





        }





        connectionsDiv.style.display = "block";





      } else {





        console.log('[gghost.js] connectionsDiv does not exist. Calling showConnectedLocations.');





        await showConnectedLocations(NOTE_API);





        connectionsDiv = document.getElementById("connected-locations"); 





        console.log('[gghost.js] connectionsDiv after showConnectedLocations:', connectionsDiv);





        if (!connectionsDiv) {





          console.error("[gghost.js] FAILED to get connectionsDiv after showConnectedLocations!");





        } else {





          connectionsDiv.style.display = "block"; 





        }





      }





    } else {





      console.log('[gghost.js] Exiting connection mode.');





      const hasLinks = await hasLinkedLocations();





      connectionButton.innerText = hasLinks ? "Show Other Branches" : "Link to other branches";





      if (readonlyNotesDiv) readonlyNotesDiv.style.display = "block"; else console.warn("[gghost.js] readonlyNotesDiv not found for showing");





      if (editableNoteDiv) editableNoteDiv.style.display = "block"; else console.warn("[gghost.js] editableNoteDiv not found for showing");





      if (liveBtn) liveBtn.style.display = "inline-block"; else console.warn("[gghost.js] liveBtn not found for showing");





      if (aiBtn) aiBtn.style.display = "inline-block"; else console.warn("[gghost.js] aiBtn not found for showing");





      if (connectionsDiv) {





        console.log('[gghost.js] Hiding connectionsDiv.');





        connectionsDiv.style.display = "none"; 





      } else {





        console.warn('[gghost.js] connectionsDiv not found when trying to hide in notes view.');





      }





    }





  } else {





    console.warn('[gghost.js] Connection mode button (ID: connection-mode-button) not found!');





  }





}





function toggleGroupVisibility(groupName) {





  const content = document.getElementById(`${groupName}-group-content`);





const header = document.querySelector(`#${CSS.escape(groupName)}-group-container h4`);





  if (!content) {





    console.warn(`[toggleGroupVisibility] Content element not found for group: ${groupName}-group-content`);





    return;





  }





  if (!header) {





    console.warn(`[toggleGroupVisibility] Header element not found for group: ${groupName}-group-container h4`);





  }





  console.log(`[toggleGroupVisibility] Toggling group: ${groupName}. Current display: ${content.style.display}`);





  if (content.style.display === "none" || content.style.display === "") { 





    content.style.display = "block";





    if (header) header.innerText = `▼ ${groupName}`;





    console.log(`[toggleGroupVisibility] Group ${groupName} expanded.`);





  } else {





    content.style.display = "none";





    if (header) header.innerText = `▶ ${groupName}`;





    console.log(`[toggleGroupVisibility] Group ${groupName} collapsed.`);





  }





}





async function addConnectionModeButton() {





  const connectionButton = document.createElement("button");





  connectionButton.id = "connection-mode-button";





  connectionButton.innerText = "Other Locations";  





  connectionButton.style.position = "fixed";





  connectionButton.style.bottom = "20px";





  connectionButton.style.left = "20px";





  connectionButton.style.padding = "10px 16px";





  connectionButton.style.zIndex = 9999;





  connectionButton.addEventListener('click', toggleConnectionMode);





  document.body.appendChild(connectionButton);





}





async function doesSanitizedGroupNameExist(userInput) {





  const firebaseURL = `${baseURL}locationNotes/connections.json`;





  if (!userInput || typeof userInput !== 'string') return false;





  const sanitize = str => str.replace(/\s+/g, '').toLowerCase(); 





  const sanitizedInput = sanitize(userInput);





  try {





    const res = await fetch(firebaseURL);





    if (!res.ok) {





      console.error(`[checkIfGroupExists] Firebase fetch failed: ${res.status}`, await res.text());





      return false;





    }





    const allData = await res.json();





    if (!allData || typeof allData !== 'object') return false;





    return Object.keys(allData).some(groupName => sanitize(groupName) === sanitizedInput);





  } catch (err) {





    console.error('[checkIfGroupExists] Error fetching/parsing group data:', err);





    return false;





  }





}





async function showConnectedLocations(NOTE_API) {





  console.log("[gghost.js] showConnectedLocations called with NOTE_API:", NOTE_API);





  const fullServiceMatch = location.pathname.match(/^\/team\/location\/([a-f0-9-]+)\/services\/([a-f0-9-]+)(?:\/|$)/);





  const teamMatch = location.pathname.match(/^\/team\/location\/([a-f0-9-]+)\/?/);





  const findMatch = location.pathname.match(/^\/find\/location\/([a-f0-9-]+)\/?/);





  const uuid = (fullServiceMatch || teamMatch || findMatch)?.[1];





  console.log("[gghost.js] showConnectedLocations: Extracted UUID:", uuid);





  if (!uuid) {





    console.warn("[gghost.js] showConnectedLocations: No UUID found, returning.");





    return;





  }





  const currentPageLocationDetails = await fetchLocationDetails(uuid);





  const currentPageOrgName = currentPageLocationDetails.org;





  console.log("[gghost.js] showConnectedLocations: Current page org name:", currentPageOrgName);





  const firebaseURL = `${baseURL}locationNotes/connections.json`;





  console.log("[gghost.js] showConnectedLocations: Fetching connections from:", firebaseURL);





  let allData;





  try {





    const res = await fetch(firebaseURL);





    if (!res.ok) {





      console.error("[gghost.js] showConnectedLocations: Firebase fetch failed!", res.status, await res.text());





      return;





    }





    allData = await res.json();





    console.log("[gghost.js] showConnectedLocations: Fetched all connection data:", JSON.parse(JSON.stringify(allData))); 





  } catch (error) {





    console.error("[gghost.js] showConnectedLocations: Error fetching or parsing Firebase data:", error);





    return;





  }





  const allGroups = allData || {};





  const groupNames = Object.keys(allGroups).filter(name =>





  typeof allGroups[name] === "object" &&





  !['reminder'].includes(name) &&





  !/^\d{4}-\d{2}-\d{2}$/.test(name)





);











const suggestibleGroupNames = Object.keys(allGroups).filter(name => {





  const entry = allGroups[name];





  if (typeof entry !== "object") return false;





  if (name === "reminder") return false;





  if (/^\d{4}-\d{2}-\d{2}$/.test(name)) return false;





  // 👇 exclude groups that already have this uuid





  return !(entry[uuid] === true || entry[uuid] === "true");





});





const groupListDatalist = document.createElement("datalist");





groupListDatalist.id = "group-list-datalist";





suggestibleGroupNames.forEach(name => {





  const option = document.createElement("option");





  option.value = name;





  groupListDatalist.appendChild(option);





});





const groupHasUuid = (groupName) => {





  const entry = allGroups?.[groupName];





  return !!(entry && (entry[uuid] === true || entry[uuid] === "true"));





};





const relevantGroups = Object.entries(allGroups).filter(





  ([groupName, entry]) =>





    typeof entry === "object" &&





    entry[uuid] === true 





);





  console.log("[gghost.js] showConnectedLocations: Relevant groups for UUID", uuid, ":", relevantGroups);





  const connectionsDiv = document.createElement("div");





  connectionsDiv.id = "connected-locations";





  connectionsDiv.style.marginTop = "10px";





  console.log("[gghost.js] showConnectedLocations: Created connectionsDiv:", connectionsDiv);





  const addGroupDiv = document.createElement("div");





  addGroupDiv.style.marginBottom = "15px";





  addGroupDiv.style.padding = "10px";





  addGroupDiv.style.border = "1px solid #ccc";





  addGroupDiv.style.borderRadius = "4px";





  const groupNameInput = document.createElement("input");





  groupNameInput.setAttribute("list", "group-list-datalist");





  groupNameInput.type = "text";





  groupNameInput.placeholder = "Group name";





  groupNameInput.style.width = "calc(50% - 15px)";





  groupNameInput.style.marginRight = "10px";





  groupNameInput.style.padding = "5px";





  const groupLinkInput = document.createElement("input");





  groupLinkInput.type = "url";





  groupLinkInput.placeholder = "New GG URL";





  groupLinkInput.style.width = "calc(50% - 15px)";





  groupLinkInput.style.marginRight = "10px";





  groupLinkInput.style.padding = "5px";





  const addGroupButton = document.createElement("button");





addGroupButton.innerText = "+ New Grp/+ Loc2Grp";





function sanitizeGroupName(rawName) {





  if (!rawName) return "";











  // Trim and collapse spaces





  let name = rawName.trim().replace(/\s+/g, " ");











  // Replace Firebase-forbidden characters with "_"





  name = name.replace(/[.#$/\[\]/]/g, "_");











  // Normalize apostrophes, commas, hyphens, periods into "_" as well





  name = name.replace(/['.,-]/g, "_");











  // Collapse multiple underscores





  name = name.replace(/_+/g, "_");











  // Remove leading/trailing underscores





  name = name.replace(/^_+|_+$/g, "");











  // Truncate to a safe max length (80 chars is plenty)





  if (name.length > 80) {





    name = name.substring(0, 80).trim();





  }











  return name;





}

















groupNameInput.addEventListener("input", async () => {





   const currentGroup = sanitizeGroupName(groupNameInput.value);











  // If user typed an existing group that already includes this UUID, block action





  if (groupHasUuid(currentGroup)) {





    addGroupButton.innerText = "Already in this group";





    addGroupButton.disabled = true;





    groupLinkInput.disabled = true;





    return;





  } else {





    addGroupButton.disabled = false;





  }











  const isExisting = await doesSanitizedGroupNameExist(currentGroup);





  if (isExisting) {





    addGroupButton.innerText = "Add This Location to Group";





    groupLinkInput.disabled = true;





    const path = location.pathname;





    const match = path.match(/\/location\/([a-f0-9-]{12,})/);





    const currentUuid = match?.[1];





    if (currentUuid) {





      groupLinkInput.value = `https://gogetta.nyc/team/location/${currentUuid}`;





    }





    addGroupButton.onclick = async () => {





      await addNewGroup(currentGroup, groupLinkInput.value, NOTE_API);





      hideConnectedLocations();





      await showConnectedLocations(NOTE_API);





    };





  } else {





    addGroupButton.innerText = "Create a group";





    groupLinkInput.disabled = false;





    groupLinkInput.value = "";





    addGroupButton.onclick = async () => {





const rawGroupName = groupNameInput.value.trim();





const newGroupName = sanitizeGroupName(rawGroupName);





const newGroupLink = groupLinkInput.value.trim();





const forbidden = ["doobneek", "gavilan","liz","kiesha", "adam"];





const isExistingGroup = await doesSanitizedGroupNameExist(newGroupName);











      // Guard: block invalid/forbidden names and require a valid link for a new group





      if (





        !newGroupName || forbidden.includes(newGroupName) ||





        (!newGroupLink.includes("/location/") && !isExistingGroup)





      ) {





        alert("Please enter a valid group name and link.");





        return;





      }











      await addNewGroup(newGroupName, newGroupLink, NOTE_API);





      hideConnectedLocations();





      await showConnectedLocations(NOTE_API);





    };





  }





});











connectionsDiv.appendChild(groupListDatalist);





  addGroupDiv.appendChild(groupNameInput);





  addGroupDiv.appendChild(groupLinkInput);





  addGroupDiv.appendChild(addGroupButton);





  connectionsDiv.appendChild(addGroupDiv);





const connectionsScrollWrapper = document.createElement("div");





connectionsDiv.style.maxHeight = "400px";





connectionsDiv.style.overflowY = "auto";





connectionsDiv.style.display = "flex";





connectionsDiv.style.flexDirection = "column";





connectionsScrollWrapper.style.flex = "1"; 





connectionsScrollWrapper.style.overflowY = "auto";





connectionsScrollWrapper.style.borderTop = "1px solid #ccc";





connectionsScrollWrapper.style.paddingTop = "10px";





connectionsScrollWrapper.style.paddingBottom = "20px";





connectionsDiv.appendChild(connectionsScrollWrapper);





for (const [groupName, entry] of relevantGroups) {





    if (typeof entry !== "object" || !entry) continue;





    if (['reminder'].includes(groupName)) continue;





    if (/^\d{4}-\d{2}-\d{2}$/.test(Object.keys(entry)[0])) continue;





    const groupContainer = document.createElement("div");





    groupContainer.id = `${groupName}-group-container`;





    groupContainer.style.marginBottom = "10px";





    const header = document.createElement("h4");





    header.innerText = `▼ ${groupName}`;





    header.style.cursor = "pointer";





    header.onclick = () => toggleGroupVisibility(groupName);





    groupContainer.appendChild(header);





    const groupContent = document.createElement("div");





    groupContent.id = `${groupName}-group-content`;





    groupContent.style.display = "block";





   for (const [connectedUuid, status] of Object.entries(entry)) {





  if (!status || status === "false") continue;





  if (!/^[a-f0-9-]{12,}$/.test(connectedUuid)) {





    console.warn(`[showConnectedLocations] Invalid UUID format: ${connectedUuid}`);





    continue;





  }





let locationDisplayElement;





if (connectedUuid === uuid) {





  locationDisplayElement = document.createElement("strong");





  locationDisplayElement.innerText = "This location";





  locationDisplayElement.style.display = "inline-block";





  locationDisplayElement.style.marginRight = "10px";





} else {





  locationDisplayElement = document.createElement("a");





  locationDisplayElement.href = `https://gogetta.nyc/team/location/${connectedUuid}`;





  locationDisplayElement.target = "_blank";





  locationDisplayElement.innerText = `Location ${connectedUuid}`;





  locationDisplayElement.style.display = "inline-block";





  locationDisplayElement.style.marginRight = "10px";





}





const tooltip = document.createElement("div");





tooltip.style.position = "absolute";





tooltip.style.padding = "8px";





tooltip.style.background = "#fff";





tooltip.style.border = "1px solid #ccc";





tooltip.style.borderRadius = "4px";





tooltip.style.boxShadow = "0 2px 6px rgba(0,0,0,0.15)";





tooltip.style.maxWidth = "300px";





tooltip.style.zIndex = "9999";





tooltip.style.display = "none";





tooltip.innerText = "Loading...";





document.body.appendChild(tooltip);





let cache = {};





locationDisplayElement.addEventListener("mouseenter", async (e) => {





  tooltip.style.left = `${e.pageX + 10}px`;





  tooltip.style.top = `${e.pageY + 10}px`;





  tooltip.style.display = "block";





  tooltip.innerText = "Loading…";





  if (cache[connectedUuid]) {





    tooltip.innerHTML = cache[connectedUuid];





    return;





  }





  try {





const data = await fetchLocationDetails(connectedUuid);





const addrParts = [data.address, data.city, data.state, data.zip].filter(Boolean);





const addr = addrParts.join(", ") || "Address not available";





const serviceList = data.services.length





  ? data.services.map(s => `• ${s}`).join("<br>")





  : "No services listed";





    const tooltipContent = `<strong>${addr}</strong><br><br>${serviceList}`;





    cache[connectedUuid] = tooltipContent;





    tooltip.innerHTML = tooltipContent;





  } catch (err) {





    tooltip.innerText = "Error loading details.";





    console.error(`[Tooltip] Failed to load data for ${connectedUuid}:`, err);





  }





});





locationDisplayElement.addEventListener("mouseleave", () => {





  tooltip.style.display = "none";





});





  const disconnectButton = document.createElement("button");





  disconnectButton.innerText = "Disconnect";





  disconnectButton.style.backgroundColor = "red";





  disconnectButton.style.color = "white";





  disconnectButton.style.padding = "2px 6px";





  disconnectButton.addEventListener("click", () =>





    disconnectLocation(groupName, connectedUuid, NOTE_API)





  );





  const locationWrapper = document.createElement("div");





  locationWrapper.style.marginBottom = "8px";





  locationWrapper.appendChild(locationDisplayElement);





  locationWrapper.appendChild(disconnectButton);





  groupContent.appendChild(locationWrapper);





locationDisplayElement.style.borderLeft = `8px solid #ccc`;





locationDisplayElement.style.paddingLeft = "6px";





locationDisplayElement.innerText = connectedUuid === uuid ? "This location" : "Loading...";





fetchLocationDetails(connectedUuid).then(data => {





  const { org: connectedOrgName, name: connectedLocName, lastValidated } = data;





  const trafficColor = getTrafficLightColor(lastValidated);





  locationDisplayElement.style.borderLeft = `8px solid ${trafficColor}`;





  if (connectedUuid === uuid) {





    locationDisplayElement.innerText = "This location";





  } else if (





    normalizeOrgName(currentPageOrgName) &&





    normalizeOrgName(connectedOrgName) &&





    normalizeOrgName(currentPageOrgName) !== normalizeOrgName(connectedOrgName)





  ) {





    locationDisplayElement.innerText = `${connectedOrgName} - ${connectedLocName}`;





  } else {





    locationDisplayElement.innerText = connectedLocName;





  }





}).catch(err => {





  console.error(`[Traffic Light] Failed to fetch details for ${connectedUuid}:`, err);





  locationDisplayElement.innerText = "(Unavailable)";





});





}





    const addLinkToGroupDiv = document.createElement("div");





    addLinkToGroupDiv.style.marginTop = "10px";





    addLinkToGroupDiv.style.paddingTop = "10px";





    addLinkToGroupDiv.style.borderTop = "1px dashed #eee";





    const newLinkInput = document.createElement("input");





    newLinkInput.type = "url";





    newLinkInput.placeholder = "Paste GoGetta link here";





    newLinkInput.style.marginRight = "5px";





    newLinkInput.style.padding = "4px";





    newLinkInput.style.width = "calc(70% - 10px)";





    const addLinkButton = document.createElement("button");





    addLinkButton.innerText = "Add Link";





    addLinkButton.style.padding = "4px 8px";





    addLinkButton.addEventListener("click", async () => {





      const newLink = newLinkInput.value.trim();





      const isValidGoGettaLink = /^https:\/\/(www\.)?gogetta\.nyc\/(team|find)\/location\/[a-f0-9-]{12,}(\/.*)?$/.test(newLink);





if (!isValidGoGettaLink&&!doesSanitizedGroupNameExist(groupName)) {





        alert("This doesn't look like a valid GoGetta location link.");





        return;





      }





      let newConnectedUuid = null;





      try {





        const url = new URL(newLink);





        const pathSegments = url.pathname.split("/").filter(Boolean);





        const locationIndex = pathSegments.findIndex((seg) => seg === "location");





        if (locationIndex !== -1 && pathSegments.length > locationIndex + 1) {





          newConnectedUuid = pathSegments[locationIndex + 1];





        }





      } catch (err) {





        console.warn("Invalid URL format:", newLink, err);





      }





      if ((!newConnectedUuid&&!doesSanitizedGroupNameExist(groupName)) || !/^[a-f0-9-]{12,}$/.test(newConnectedUuid)) {





        alert("Re-check the link.");





        return;





      }





      if ((newConnectedUuid === uuid)&&!doesSanitizedGroupNameExist(groupName)) {





        alert("You cannot link the current location to itself.");





        return;





      }





      if (entry[newConnectedUuid] === "true" || entry[newConnectedUuid] === true) {





        alert("This location is already in the group.");





        return;





      }





      await addUuidToGroup(groupName, uuid, newConnectedUuid, NOTE_API);





      newLinkInput.value = "";





      hideConnectedLocations();





      await showConnectedLocations(NOTE_API);





    });





    addLinkToGroupDiv.appendChild(newLinkInput);





    addLinkToGroupDiv.appendChild(addLinkButton);





    groupContainer.appendChild(groupContent);





connectionsScrollWrapper.appendChild(groupContainer);





    groupContent.appendChild(addLinkToGroupDiv);





  }





  const noteWrapper = document.getElementById("gg-note-wrapper");





  if (noteWrapper) {





    noteWrapper.appendChild(connectionsDiv);





    console.log("[gghost.js] showConnectedLocations: Appended connectionsDiv to gg-note-wrapper.");





  } else {





    console.warn("[gghost.js] [showConnectedLocations] gg-note-wrapper not found. Appending connectionsDiv to body as fallback.");





    document.body.appendChild(connectionsDiv);





  }





  if (!document.getElementById("connected-locations")) {





    console.error("[gghost.js] CRITICAL: connectionsDiv (id: connected-locations) was NOT found in the DOM after attempting to append it in showConnectedLocations!");





  } else {





    console.log("[gghost.js] showConnectedLocations: Successfully created and appended connected-locations div.");





  }





}





function hideConnectedLocations() {





  const connectionsDiv = document.getElementById("connected-locations");





  if (connectionsDiv) {





    console.log('Hiding connected locations...');





    connectionsDiv.remove();





  }





}





async function disconnectLocation(groupName, connectedUuid, NOTE_API) {





  try {





    const payload = {





      uuid: "connections",





      date: `https://gogetta.nyc/team/location/${connectedUuid}`,





      note: false,





      userName: groupName





    };





    const response = await postToNoteAPI(payload);





await checkResponse(response, `Disconnection`);





    hideConnectedLocations();





    await showConnectedLocations(NOTE_API);





  } catch (err) {





    console.error('[Disconnect Error]', err);





  }





}





async function addNewGroup(groupNameFromInput, linkUrlFromInput, NOTE_API) { 





  const path = location.pathname;





  const fullServiceMatch = path.match(/^\/team\/location\/([a-f0-9-]+)\/services\/([a-f0-9-]+)(?:\/|$)/);





  const teamMatch = path.match(/^\/team\/location\/([a-f0-9-]+)\/?/);





  const findMatch = path.match(/^\/find\/location\/([a-f0-9-]+)\/?/);





  const currentPageUuid = (fullServiceMatch || teamMatch || findMatch)?.[1]; 





  if (!currentPageUuid&&!doesSanitizedGroupNameExist(groupNameFromInput)) {





    alert("Invalid link. Cannot add group.");





    return;





  }





  if (!groupNameFromInput || groupNameFromInput.length < 2) {





    alert("Group name is invalid (must be at least 2 characters).");





    return;





  }





  if ((!linkUrlFromInput || !linkUrlFromInput.includes("/location/"))&&doesSanitizedGroupNameExist(groupNameFromInput)) {





    alert("The provided link does not appear to be a valid GoGetta location link.");





    return;





  }





  const uuidMatchInProvidedLink = linkUrlFromInput.match(/\/(?:team|find)\/location\/([a-f0-9-]{12,})/i);





const trimmedLink = linkUrlFromInput.trim();





const connectedUuidViaLink = uuidMatchInProvidedLink?.[1] || "";





const allowBecauseLinkIsBlank = trimmedLink === "";





const allowBecauseValidUuid = connectedUuidViaLink !== "";





const allowBecauseGroupExists = doesSanitizedGroupNameExist(groupNameFromInput);





if (!allowBecauseLinkIsBlank && !allowBecauseValidUuid && !allowBecauseGroupExists) {





  alert("Please enter a valid GoGetta location link or an existing group name.");





  return;





}





  const locationNotesURL = `${baseURL}locationNotes/${currentPageUuid}.json`;





  try {





    const res = await fetch(locationNotesURL);





    const existingLocationNotes = await res.json();





    if (existingLocationNotes && existingLocationNotes[groupNameFromInput]) {





      alert(`A group named "${groupNameFromInput}" already exists for this location. Please choose a different name or add the link to the existing group.`);





      return;





    }





  } catch (err) {





    console.error("Error checking for existing group name:", err);





    alert("Could not verify if group name is unique. Please try again.");





    return;





  }





const groupExists = await doesSanitizedGroupNameExist(groupNameFromInput);





if (!groupExists) {





  const confirmMsg = `Create group "${groupNameFromInput}" and add the link: ${linkUrlFromInput}?`;





  if (!confirm(confirmMsg)) {





    console.log("[addNewGroup] User cancelled group creation.");





    return;





  }





}





const urlsToSave = [];





const canonicalCurrent = `https://gogetta.nyc/team/location/${currentPageUuid}`;





urlsToSave.push(canonicalCurrent);





const uuidMatch = trimmedLink.match(/\/(?:team|find)\/location\/([a-f0-9-]{12,})/);





const otherUuid = uuidMatch?.[1];





if (otherUuid && otherUuid !== currentPageUuid) {





  const canonicalOther = `https://gogetta.nyc/team/location/${otherUuid}`;





  urlsToSave.push(canonicalOther);





}





try {





  const responses = await Promise.all(





    urlsToSave.map(url =>





      postToNoteAPI({





          uuid: "connections",





          date: url,





          note: true,





          userName: groupNameFromInput





        })





    )





  );





  console.log(`[✅] Group "${groupNameFromInput}" saved with URLs:`, urlsToSave);





} catch (err) {





  console.error("[Group Creation Error]", err);





  alert(`Failed to create group "${groupNameFromInput}". Error: ${err.message}`);





}





}





async function addUuidToGroup(groupName, uuid, newConnectedUuid, NOTE_API) {





  try {





    const payload = {





      uuid: "connections",





      date: `https://gogetta.nyc/team/location/${newConnectedUuid}`,  





      note: true,





      userName: groupName





    };





    const response = await postToNoteAPI(payload);





await checkResponse(response, `Adding UUID ${newConnectedUuid} to group ${groupName}`);





    console.log(`✅ Added UUID ${newConnectedUuid} to group ${groupName}`);





  } catch (err) {





    console.error('[Add UUID Error]', err);





  }





}





document.addEventListener("DOMContentLoaded", () => {





  addConnectionModeButton();





});





function showReminderModal(uuid, NOTE_API) {





  const overlay = document.createElement("div");





  overlay.id = "reminder-modal";





  Object.assign(overlay.style, {





    position: "fixed",





    top: 0,





    left: 0,





    width: "100%",





    height: "100%",





    backgroundColor: "rgba(0,0,0,0.5)",





    display: "flex",





    alignItems: "center",





    justifyContent: "center",





    zIndex: 100000





  });





  const modal = document.createElement("div");





  Object.assign(modal.style, {





    background: "#fff",





    padding: "20px",





    borderRadius: "8px",





    width: "320px",





    boxShadow: "0 2px 10px rgba(0,0,0,0.25)"





  });





  modal.innerHTML = `





    <h3 style="margin-top:0;">Set a Reminder</h3>





    <label>Date: <input type="date" id="reminder-date" style="width:100%;margin:5px 0;"></label>





    <label>Note:<textarea id="reminder-note" style="width:100%;height:100px;"></textarea></label>





    <div style="text-align:right;margin-top:10px;">





      <button id="reminder-cancel">Cancel</button>





      <button id="reminder-google" style="margin-left:5px;">Add to Google</button>





      <button id="reminder-download" style="margin-left:5px;">Download .ics</button>





    </div>





  `;





  overlay.appendChild(modal);





  document.body.appendChild(overlay);





attachMicButtonHandler();





  document.getElementById("reminder-cancel").onclick = () => overlay.remove();





  const handleSave = async (mode) => {





    const date = document.getElementById("reminder-date").value;





    const note = document.getElementById("reminder-note").value.trim();





    if (!date || !note) {





      alert("Please fill both date and note.");





      return;





    }





    await postToNoteAPI({ uuid, date, note, userName: "reminder" })





  





    const { org, location: locName,slug } = JSON.parse(localStorage.getItem("ypLastViewedService") || '{}');





    const summaryText = `${org || 'GoGetta'}${locName ? ' - ' + locName : ''}: ${note.slice(0, 40).replace(/\n/g, ' ')}`.slice(0, 60);





const ypLink = slug ? `\\nYP: https://yourpeer.nyc/locations/${slug}` : '';





const fullDescription = `${note.replace(/\n/g, '\\n')}${locName ? `\\nLocation: ${locName}` : ''}${org ? `\\nOrganization: ${org}` : ''}${ypLink}`;





    if (mode === 'google') {





      openGoogleCalendarEvent({





        title: summaryText,





        description: note +





  (locName ? `\nLocation: ${locName}` : '') +





  (org ? `\nOrganization: ${org}` : '') +





  (slug ? `\nYP: https://yourpeer.nyc/locations/${slug}` : ''),





        date,





        locationUrl: `https://gogetta.nyc/team/location/${uuid}`





      });





    } else if (mode === 'ics') {





      const icsContent = `





BEGIN:VCALENDAR





VERSION:2.0





PRODID:-





BEGIN:VEVENT





UID:${uuid}-${date}@gogetta.nyc





DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').split('.')[0]}Z





DTSTART;VALUE=DATE:${date.replace(/-/g, '')}





SUMMARY:${summaryText}





DESCRIPTION:${fullDescription}





URL:https://gogetta.nyc/team/location/${uuid}





END:VEVENT





END:VCALENDAR`.trim();





      const blob = new Blob([icsContent], { type: 'text/calendar' });





      const url = URL.createObjectURL(blob);





      const a = document.createElement('a');





      a.href = url;





      a.download = `reminder-${date}.ics`;





      document.body.appendChild(a);





      a.click();





      document.body.removeChild(a);





      URL.revokeObjectURL(url);





      console.log(`[📅 Downloaded reminder .ics for ${date}]`);





    }





    overlay.remove();





  };





  document.getElementById("reminder-google").onclick = () => handleSave('google');





  document.getElementById("reminder-download").onclick = () => handleSave('ics');





}





function openGoogleCalendarEvent({ title, description, date, locationUrl }) {





  const start = date.replace(/-/g, '') + 'T120000Z'; 





  const end = date.replace(/-/g, '') + 'T130000Z';





  const params = new URLSearchParams({





    action: 'TEMPLATE',





    text: title,





    dates: `${start}/${end}`,





    details: description,





    location: locationUrl





  });





  const calendarUrl = `https://calendar.google.com/calendar/render?${params.toString()}`;





  window.open(calendarUrl, '_blank');





}





async function getUserPasswordSafely() {





  return new Promise((resolve) => {





    try {





      chrome.storage?.local?.get(["userPassword"], result => {





        resolve(result?.userPassword || null);





      });





    } catch (err) {





      console.warn("[🛑 Extension context lost while getting password]", err);





      resolve(null);





    }





  });





}





async function getUserNameSafely() {





  return new Promise((resolve) => {





    try {





      chrome.storage?.local?.get(["userName"], result => {





        resolve(result?.userName || null);





      });





    } catch (err) {





      console.warn("[🛑 Extension context lost while getting username]", err);





      resolve(null);





    }





  });





}





function onUrlChange(callback) {





  let lastUrl = location.href;





  const notifyIfChanged = () => {





    const currentUrl = location.href;





    if (currentUrl === lastUrl) return;





    lastUrl = currentUrl;





    try {





      callback(currentUrl);





    } catch (error) {





      if (error.message && error.message.includes('Extension context invalidated')) {





        console.warn('[gghost] Extension context invalidated, stopping URL monitoring');





        return;





      }





      console.error('[gghost] URL change callback error:', error);





    }





  };





  new MutationObserver(() => {





    notifyIfChanged();





  }).observe(document, { subtree: true, childList: true });





  const pushState = history.pushState;





  history.pushState = function () {





    pushState.apply(this, arguments);





    window.dispatchEvent(new Event('pushstate'));





    window.dispatchEvent(new Event('locationchange'));





  };





  const replaceState = history.replaceState;





  history.replaceState = function () {





    replaceState.apply(this, arguments);





    window.dispatchEvent(new Event('replacestate'));





    window.dispatchEvent(new Event('locationchange'));





  };





  window.addEventListener('popstate', () => {





    window.dispatchEvent(new Event('locationchange'));





  });





  window.addEventListener('locationchange', notifyIfChanged);





  window.addEventListener('pushstate', notifyIfChanged);





  window.addEventListener('replacestate', notifyIfChanged);





}





function findServiceName(obj, serviceId) {





  let foundName = null;





  function recurse(item) {





    if (!item || typeof item !== 'object') return;





    if (Array.isArray(item)) {





      for (const subItem of item) {





        if (foundName) return;





        recurse(subItem);





      }





    } else {





      if (





        item.id === serviceId &&





        typeof item.name === 'string' &&





        item.name.trim() !== ''





      ) {





        foundName = item.name.trim();





        return;





      }





      for (const key in item) {





        if (foundName) return;





        recurse(item[key]);





      }





    }





  }





  recurse(obj);





  return foundName;





}





// --- Position helpers ---





function getSavedYPPos() {





  try { return JSON.parse(localStorage.getItem("ypMiniPosition") || "{}"); } catch { return {}; }





}





function saveYPPos(pos) {





  localStorage.setItem("ypMiniPosition", JSON.stringify(pos || {}));





}





function getCurrentYPPos(wrapper) {





  if (!wrapper) return null;





  const rect = wrapper.getBoundingClientRect();





  return { left: Math.max(0, Math.round(rect.left)), top: Math.max(0, Math.round(rect.top)) };





}











// --- Refresh (kept as-is) ---





function refreshYourPeerEmbed() {





  const wrapper = document.getElementById("yp-embed-wrapper");





  if (!wrapper) return false; // Not open





  const iframe = wrapper.querySelector("iframe");





  if (iframe) {





    const currentSrc = iframe.src;





    iframe.src = currentSrc;





    return true;





  }





  return false;





}





function slugifyName(name) {





  // Check if only letters, numbers, and spaces





  if (/^[A-Za-z0-9 ]+$/.test(name)) {





    return "#" + name.trim().replace(/\s+/g, "-");





  }





  return "";





}





function getServiceIdFromPath(url = location.href) {





  const m = url.match(/\/services\/([0-9a-fA-F-]{36})(?:\/|$)/);





  return m?.[1] || null;





}











function coerceServicesArray(services) {





  if (Array.isArray(services)) return services;





  // also handle object map form: { "<id>": {id, name}, ... }





  if (services && typeof services === "object") {





    return Object.values(services);





  }





  return [];





}











function normalizeId(value) {





  if (!value) return "";





  return String(value).trim().toLowerCase();





}











function normalizeServices(services) {





  const list = coerceServicesArray(services).filter(service => {





    return service && typeof service === "object" && service.id;





  });





  const seen = new Set();





  return list.filter(service => {





    const id = normalizeId(service.id);





    if (!id || seen.has(id)) return false;





    seen.add(id);





    return true;





  });





}











function serviceNameToHash(name) {





  // only letters, numbers, spaces -> "#Name-With-Dashes"





  if (typeof name === "string" && /^[A-Za-z0-9 ]+$/.test(name)) {





    return "#" + name.trim().replace(/\s+/g, "-");





  }





  return "";





}











function pickServiceHash(services, preferredId = null) {





  const arr = coerceServicesArray(services);





  if (!arr.length) return "";











  let chosen = null;





  if (preferredId) {





    chosen = arr.find(s => s?.id === preferredId) || null;





  }





  if (!chosen) {





    chosen = arr[0]; // fallback to first





  }





  return serviceNameToHash(chosen?.name);





}











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





        const lastError = chrome.runtime.lastError;





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











async function fetchViaBackground(url, options) {





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





    const backgroundRes = await fetchViaBackground(url, options);





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











function createServiceHoverPanel(services, locationId, currentServiceId = null) {





  const panel = document.createElement('div');





  const navDelayMs = 500;





  const servicePageMatch = location.pathname.match(/^\/team\/location\/([a-f0-9-]{12,36})\/services\/([a-f0-9-]{12,36})(?:\/(.*))?$/i);





  const currentServicePage = servicePageMatch ? {





    locationId: servicePageMatch[1],





    serviceId: servicePageMatch[2],





    field: servicePageMatch[3] || ''





  } : null;





  const normalizeServiceSuffix = (value) => String(value || '').replace(/^\/+|\/+$/g, '').toLowerCase();





  const isServicePageForService = (serviceId) => {





    if (!currentServicePage) return false;





    if (!locationId || !serviceId) return false;





    return normalizeId(currentServicePage.locationId) === normalizeId(locationId)





      && normalizeId(currentServicePage.serviceId) === normalizeId(serviceId);





  };





  const isServiceEntryHidden = (serviceId, urlSuffix) => {





    if (!isServicePageForService(serviceId)) return false;





    const pageSuffix = normalizeServiceSuffix(currentServicePage.field);





    const entrySuffix = normalizeServiceSuffix(urlSuffix);





    if (!pageSuffix || !entrySuffix) return false;





    return pageSuffix === entrySuffix || pageSuffix.startsWith(`${entrySuffix}/`);





  };





  let activeEdit = null;





  const commitActiveEdit = () => {





    if (!activeEdit || typeof activeEdit.commit !== 'function') {





      return Promise.resolve();





    }





    const edit = activeEdit;





    activeEdit = null;





    return Promise.resolve(edit.commit());





  };





  panel.__gghostCommitActiveEdit = commitActiveEdit;





  panel.setAttribute('data-gghost-service-quick-panel', 'true');





  Object.assign(panel.style, {





    position: 'absolute',





    top: 'calc(100% + 6px)',





    left: '0',





    width: '280px',





    minWidth: '260px',





    maxWidth: '320px',





    background: '#fff',





    border: '1px solid #d4c79a',





    borderRadius: '8px',





    boxShadow: '0 8px 16px rgba(0, 0, 0, 0.18)',





    padding: '6px',





    maxHeight: '240px',





    overflowY: 'auto',





    opacity: '0',





    pointerEvents: 'none',





    transform: 'translateY(6px)',





    transition: 'opacity 0.15s ease, transform 0.15s ease',





    zIndex: '10000',





    backgroundClip: 'padding-box'





  });











  const svcList = Array.isArray(services) ? services : [];





  if (!svcList.length) return panel;











  const formatEntryText = (entry) => {





    const value = entry.value || entry.emptyLabel || 'Missing';





    return `${entry.label}: ${value}`;





  };











  const applyEntryPalette = (node, palette, withBorder = false) => {





    node.style.background = palette.background;





    node.style.color = palette.color;





    if (withBorder) {





      node.style.border = `1px solid ${palette.border}`;





    }





  };











  const attachCommitOnFocusOut = (node, commit, boundary = node) => {





    let lastPointerDownAt = 0;





    let lastPointerDownTarget = null;











    boundary.addEventListener('pointerdown', (event) => {





      lastPointerDownAt = Date.now();





      lastPointerDownTarget = event.target;





    }, true);











    node.addEventListener('focusout', (event) => {





      const fallbackFocus = event?.target;





      setTimeout(() => {





        const activeEl = document.activeElement;





        const recentPointerInside = lastPointerDownTarget





          && boundary.contains(lastPointerDownTarget)





          && (Date.now() - lastPointerDownAt < 250);





        if (boundary.contains(activeEl) || recentPointerInside) {





          if (recentPointerInside && fallbackFocus && typeof fallbackFocus.focus === 'function') {





            fallbackFocus.focus();





          }





          return;





        }





        commit();





      }, 0);





    });





  };











  let redirectEnabled = false;





  const redirectHandlers = [];





  const extrasWrap = document.createElement('div');





  Object.assign(extrasWrap.style, {





    marginTop: '6px',





    paddingTop: '6px',





    borderTop: '1px solid #efe7c8',





    display: 'none',





    flexDirection: 'column',





    gap: '6px'





  });











  const setRedirectEnabled = (enabled) => {





    redirectEnabled = !!enabled;





    redirectHandlers.forEach(handler => handler(redirectEnabled));





  };











  const createServiceFromStash = async (item, nameOverride = null) => {





    if (!locationId) {





      window.alert('Missing location id for service creation.');





      return;





    }





    const fallbackTaxonomyId = localStorage.getItem(SERVICE_CREATE_TAXONOMY_KEY);





    const taxonomyId = item?.taxonomyId || fallbackTaxonomyId;





    if (!taxonomyId) {





      window.alert('Select a taxonomy before creating a service.');





      return;





    }





    const name = String(nameOverride || item?.name || 'New service').trim() || 'New service';





    const payload = { locationId, taxonomyId, name };





    ['description', 'url', 'email', 'additional_info', 'fees', 'interpretation_services'].forEach((key) => {





      const value = item?.[key];





      if (value != null && value !== '') payload[key] = value;





    });





    try {





      const created = await createServiceRecord(payload);





      const newId = created?.id;





      if (newId) {





        localStorage.setItem('gghost-taxonomy-overlay-active', 'true');





        window.location.href = buildServiceUrl(locationId, newId);





      }





    } catch (err) {





      console.warn('[Service Taxonomy] Failed to create service', err);





      window.alert('Failed to create service. Please try again.');





    }





  };











  const buildSectionTitle = (text) => {





    const title = document.createElement('div');





    title.textContent = text;





    Object.assign(title.style, {





      fontSize: '11px',





      fontWeight: '600',





      color: '#6b5200'





    });





    return title;





  };











  const buildCreateServiceSection = () => {





    const section = document.createElement('div');





    section.appendChild(buildSectionTitle('Create service'));











    const row = document.createElement('div');





    Object.assign(row.style, { display: 'flex', gap: '4px', alignItems: 'center' });











    const options = getTaxonomyOptionsFromServices(svcList);





    const select = document.createElement('select');





    Object.assign(select.style, {





      flex: '1 1 auto',





      fontSize: '11px',





      padding: '3px 4px',





      borderRadius: '4px',





      border: '1px solid #d9d9d9',





      background: '#fff'





    });











    if (!options.length) {





      const opt = document.createElement('option');





      opt.value = '';





      opt.textContent = 'No taxonomies';





      select.appendChild(opt);





      select.disabled = true;





    } else {





      options.forEach(option => {





        const opt = document.createElement('option');





        opt.value = option.id;





        opt.textContent = option.label;





        select.appendChild(opt);





      });





      const stored = localStorage.getItem(SERVICE_CREATE_TAXONOMY_KEY);





      if (stored && options.some(option => option.id === stored)) {





        select.value = stored;





      }





      select.addEventListener('change', () => {





        localStorage.setItem(SERVICE_CREATE_TAXONOMY_KEY, select.value);





      });





    }











    const addBtn = document.createElement('button');





    addBtn.type = 'button';





    addBtn.textContent = '+';





    Object.assign(addBtn.style, {





      border: '1px solid #d0d0d0',





      background: '#fff',





      borderRadius: '4px',





      width: '24px',





      height: '22px',





      lineHeight: '18px',





      cursor: locationId && options.length ? 'pointer' : 'not-allowed'





    });





    addBtn.disabled = !locationId || !options.length;





    addBtn.addEventListener('click', async (evt) => {





      evt.stopPropagation();





      if (!locationId) return;





      if (!options.length) return;





      addBtn.disabled = true;





      addBtn.textContent = '...';





      const taxonomyId = select.value;





      localStorage.setItem(SERVICE_CREATE_TAXONOMY_KEY, taxonomyId);





      try {





        await createServiceFromStash({ taxonomyId, name: 'New service' });





      } finally {





        addBtn.disabled = false;





        addBtn.textContent = '+';





      }





    });











    row.appendChild(select);





    row.appendChild(addBtn);





    section.appendChild(row);





    return section;





  };











  const buildServiceStashSection = (title, key, { allowEdit = false, showSave = false } = {}) => {





    const stash = readServiceStash(key);





    if (!stash.length) return null;











    const section = document.createElement('div');





    section.appendChild(buildSectionTitle(title));











    const list = document.createElement('div');





    Object.assign(list.style, { display: 'flex', flexDirection: 'column', gap: '4px' });











    stash.forEach(item => {





      const row = document.createElement('div');





      Object.assign(row.style, { display: 'flex', alignItems: 'center', gap: '4px' });











      const label = item?.taxonomyLabel





        ? `${item.name} (${item.taxonomyLabel})`





        : item?.name || 'Saved service';











      const btn = document.createElement('button');





      btn.type = 'button';





      btn.textContent = label;





      Object.assign(btn.style, {





        flex: '1 1 auto',





        border: '1px solid #d9d9d9',





        background: '#fff',





        borderRadius: '6px',





        padding: '3px 6px',





        fontSize: '11px',





        textAlign: 'left',





        lineHeight: '1.2',





        whiteSpace: 'normal',





        wordBreak: 'break-word',





        overflowWrap: 'anywhere',





        cursor: locationId ? 'pointer' : 'not-allowed'





      });











      let clickTimer = null;





      btn.addEventListener('click', () => {





        if (!locationId) return;





        if (clickTimer) clearTimeout(clickTimer);





        clickTimer = setTimeout(() => {





          clickTimer = null;





          createServiceFromStash(item);





        }, 220);





      });





      if (allowEdit) {





        btn.addEventListener('dblclick', (evt) => {





          evt.preventDefault();





          evt.stopPropagation();





          if (clickTimer) {





            clearTimeout(clickTimer);





            clickTimer = null;





          }





          const nextName = window.prompt('Edit saved service name', item?.name || '');





          if (nextName == null) return;





          const trimmed = String(nextName).trim();





          if (!trimmed) return;





          item.name = trimmed;





          writeServiceStash(key, stash.map(entry => entry?.stashId === item?.stashId ? item : entry));





          refreshExtras();





        });





      }











      const removeBtn = document.createElement('button');





      removeBtn.type = 'button';





      removeBtn.textContent = 'x';





      removeBtn.title = 'Remove';





      Object.assign(removeBtn.style, {





        border: '1px solid #d0d0d0',





        background: '#fff',





        color: '#b42318',





        borderRadius: '999px',





        width: '18px',





        height: '18px',





        fontSize: '11px',





        lineHeight: '16px',





        padding: '0',





        cursor: 'pointer'





      });





      removeBtn.addEventListener('click', (evt) => {





        evt.stopPropagation();





        removeServiceStashItem(key, item?.stashId);





        refreshExtras();





      });











      row.appendChild(btn);





      if (showSave) {





        const saveBtn = document.createElement('button');





        saveBtn.type = 'button';





        saveBtn.textContent = 'save';





        saveBtn.title = 'Save';





        Object.assign(saveBtn.style, {





          border: '1px solid #d0d0d0',





          background: '#fff',





          color: '#1f5f9b',





          borderRadius: '10px',





          minWidth: '28px',





          height: '18px',





          fontSize: '9px',





          lineHeight: '16px',





          padding: '0 4px',





          cursor: 'pointer'





        });





        saveBtn.addEventListener('click', (evt) => {





          evt.stopPropagation();





          upsertServiceStashItem(SERVICE_STASH_SAVED_KEY, item);





          refreshExtras();





        });





        row.appendChild(saveBtn);





      }





      row.appendChild(removeBtn);





      list.appendChild(row);





    });











    section.appendChild(list);





    return section;





  };











  const refreshExtras = () => {





    if (!redirectEnabled) return;





    extrasWrap.innerHTML = '';





    extrasWrap.style.display = 'flex';











    const createSection = buildCreateServiceSection();





    extrasWrap.appendChild(createSection);











    const savedSection = buildServiceStashSection('Saved services', SERVICE_STASH_SAVED_KEY, { allowEdit: true });





    if (savedSection) extrasWrap.appendChild(savedSection);











    const deletedSection = buildServiceStashSection('Recently deleted', SERVICE_STASH_DELETED_KEY, { showSave: true });





    if (deletedSection) extrasWrap.appendChild(deletedSection);





  };











  redirectHandlers.push((enabled) => {





    extrasWrap.style.display = enabled ? 'flex' : 'none';





    if (enabled) refreshExtras();





  });











  void getRedirectEnabledFlag().then(setRedirectEnabled);











  svcList.forEach((service, idx) => {





    const entries = getServiceQuickEntries(service);





    const row = document.createElement('div');





    Object.assign(row.style, {





      position: 'relative',





      display: 'flex',





      flexDirection: 'column',





      gap: '4px',





      padding: '4px 6px',





      paddingRight: '64px',





      borderBottom: idx === svcList.length - 1 ? 'none' : '1px solid #efe7c8',





      background: '#fff',





      borderRadius: '6px'





    });











    row.addEventListener('mouseenter', () => {





      row.style.background = '#fff9e6';





    });





    row.addEventListener('mouseleave', () => {





      row.style.background = '#fff';





    });











    const headerBtn = document.createElement('button');





    headerBtn.type = 'button';





    headerBtn.textContent = service?.name || 'Unnamed service';





    const isCurrent = currentServiceId && service?.id === currentServiceId;





    Object.assign(headerBtn.style, {





      fontSize: '12px',





      fontWeight: '700',





      color: '#2d2400',





      background: 'transparent',





      border: 'none',





      padding: '0',





      textAlign: 'left',





      cursor: isCurrent ? 'default' : 'pointer',





      opacity: isCurrent ? '0.7' : '1',





      whiteSpace: 'normal',





      wordBreak: 'break-word',





      overflowWrap: 'anywhere'





    });





    headerBtn.disabled = !!isCurrent;





    if (!isCurrent) {





      headerBtn.addEventListener('click', (evt) => {





        evt.stopPropagation();





        if (!locationId || !service?.id) return;





        localStorage.setItem('gghost-taxonomy-overlay-active', 'true');





        window.location.href = buildServiceUrl(locationId, service.id);





      });





    }





    row.appendChild(headerBtn);











    const actionWrap = document.createElement('div');





    Object.assign(actionWrap.style, {





      position: 'absolute',





      top: '4px',





      right: '6px',





      display: 'flex',





      alignItems: 'center',





      gap: '4px',





      zIndex: '1'





    });











    const saveBtn = document.createElement('button');





    saveBtn.type = 'button';





    saveBtn.textContent = 'save';





    saveBtn.title = 'Save service';





    Object.assign(saveBtn.style, {





      border: '1px solid #d0d0d0',





      background: '#fff',





      color: '#1f5f9b',





      borderRadius: '10px',





      minWidth: '28px',





      height: '18px',





      fontSize: '9px',





      lineHeight: '16px',





      padding: '0 4px',





      cursor: service?.id ? 'pointer' : 'not-allowed'





    });





    saveBtn.style.display = 'none';





    if (!service?.id) {





      saveBtn.disabled = true;





    } else {





      saveBtn.addEventListener('click', (evt) => {





        evt.stopPropagation();





        evt.preventDefault();





        const stashItem = buildServiceStashItem(service);





        if (!stashItem) return;





        upsertServiceStashItem(SERVICE_STASH_SAVED_KEY, stashItem);





        refreshExtras();





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





      width: '18px',





      height: '18px',





      fontSize: '11px',





      lineHeight: '16px',





      padding: '0',





      cursor: service?.id ? 'pointer' : 'not-allowed'





    });





    if (!service?.id) {





      deleteBtn.disabled = true;





    } else {





      deleteBtn.addEventListener('click', async (evt) => {





        evt.stopPropagation();





        evt.preventDefault();





        const serviceName = service?.name || 'this service';





        if (!window.confirm(`Delete ${serviceName}?`)) return;





        deleteBtn.disabled = true;





        saveBtn.disabled = true;





        headerBtn.disabled = true;





        row.style.opacity = '0.6';





        deleteBtn.textContent = '...';





        try {





          await deleteServiceRecord(service.id);





          if (redirectEnabled) {





            const stashItem = buildServiceStashItem(service);





            if (stashItem) {





              upsertServiceStashItem(SERVICE_STASH_DELETED_KEY, stashItem);





              refreshExtras();





            }





          }





          const index = svcList.findIndex(item => normalizeId(item?.id) === normalizeId(service.id));





          if (index >= 0) svcList.splice(index, 1);





          row.remove();





        } catch (err) {





          console.warn('[Service Taxonomy] Failed to delete service', err);





          deleteBtn.disabled = false;





          saveBtn.disabled = !service?.id;





          headerBtn.disabled = isCurrent;





          row.style.opacity = '1';





          deleteBtn.textContent = 'x';





          window.alert('Failed to delete service. Please try again.');





        }





      });





    }











    const applySaveVisibility = (enabled) => {





      saveBtn.style.display = enabled ? '' : 'none';





    };





    redirectHandlers.push(applySaveVisibility);





    applySaveVisibility(redirectEnabled);











    actionWrap.appendChild(saveBtn);





    actionWrap.appendChild(deleteBtn);





    row.appendChild(actionWrap);











    if (entries.length) {





      const chips = document.createElement('div');





      Object.assign(chips.style, {





        display: 'flex',





        flexWrap: 'wrap',





        gap: '4px'





      });











      entries.forEach(entry => {





        if (entry.urlSuffix && isServiceEntryHidden(service?.id, entry.urlSuffix)) {





          return;





        }





        const palette = getRecencyStyles(entry.updatedAt);





        const entryWrap = document.createElement('div');





        Object.assign(entryWrap.style, {





          width: '100%',





          display: 'flex',





          flexDirection: 'column'





        });











        const btn = document.createElement('button');





        btn.type = 'button';





        btn.textContent = formatEntryText(entry);





        Object.assign(btn.style, {





          border: 'none',





          background: palette.background,





          color: palette.color,





          borderRadius: '4px',





          padding: '4px 6px',





          fontSize: '12px',





          cursor: 'pointer',





          textAlign: 'left',





          lineHeight: '1.3',





          maxWidth: '100%',





          whiteSpace: 'normal',





          wordBreak: 'break-word',





          overflowWrap: 'anywhere',





          width: '100%',





          boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.05)'





        });











        const isEditable = entry.editable && locationId && service?.id;





        if (isEditable) {





          btn.title = 'Double-click to edit';





        }











        let clickTimer = null;





        const navigateToEntry = () => {





          if (!entry.urlSuffix) return;





          if (!locationId || !service?.id) return;





          localStorage.setItem('gghost-taxonomy-overlay-active', 'true');





          window.location.href = buildServiceUrl(locationId, service.id, entry.urlSuffix);





        };





        const navigateAfterCommit = () => {





          commitActiveEdit().then(() => {





            navigateToEntry();





          });





        };











        const beginDescriptionEdit = () => {





          if (entryWrap.dataset.editing === 'true') return;





          if (clickTimer) {





            clearTimeout(clickTimer);





            clickTimer = null;





          }





          entryWrap.dataset.editing = 'true';





          btn.style.display = 'none';











          const textarea = document.createElement('textarea');





          const startingValue = entry.rawValue || '';





          textarea.value = startingValue;





          textarea.placeholder = entry.emptyLabel || '';





          textarea.spellcheck = true;





          Object.assign(textarea.style, {





            width: '100%',





            minHeight: '40px',





            resize: 'vertical',





            borderRadius: '4px',





            padding: '6px',





            fontSize: '12px',





            lineHeight: '1.3',





            fontFamily: 'inherit',





            boxSizing: 'border-box'





          });





          applyEntryPalette(textarea, palette, true);











          const autoResize = () => {





            textarea.style.height = 'auto';





            const nextHeight = textarea.scrollHeight;





            textarea.style.height = `${Math.max(nextHeight, 40)}px`;





          };











          const cleanup = () => {





            entryWrap.dataset.editing = 'false';





            textarea.remove();





            btn.style.display = '';





            if (activeEdit && activeEdit.entryWrap === entryWrap) {





              activeEdit = null;





            }





          };











          let commitInFlight = false;





          const commit = async () => {





            if (commitInFlight) return;





            commitInFlight = true;





            const nextValue = textarea.value.replace(/\r\n/g, '\n').trim();





            const normalizedStart = startingValue.replace(/\r\n/g, '\n').trim();





            if (nextValue === normalizedStart) {





              commitInFlight = false;





              cleanup();





              return;





            }





            textarea.disabled = true;





            textarea.style.opacity = '0.7';





            const descriptionValue = nextValue ? nextValue : null;





            try {





              await submitServiceDescriptionUpdate(locationId, service.id, descriptionValue);





              const updatedAt = new Date().toISOString();





              entry.rawValue = nextValue;





              entry.value = truncateText(nextValue, 120);





              entry.updatedAt = updatedAt;





              service.description = descriptionValue;





              updateCachedServiceDescription(locationId, service.id, descriptionValue, updatedAt);





              const nextPalette = getRecencyStyles(updatedAt);





              applyEntryPalette(btn, nextPalette);





              btn.textContent = formatEntryText(entry);





              void recordServiceEditLog({





                locationId,





                serviceId: service.id,





                field: entry.field,





                label: entry.label,





                urlSuffix: entry.urlSuffix,





                before: normalizedStart,





                after: nextValue





              });





            } catch (err) {





              console.error('[Service Taxonomy] Failed to update description', err);





            } finally {





              commitInFlight = false;





              cleanup();





            }





          };











          activeEdit = { entryWrap, commit };











          textarea.addEventListener('input', autoResize);





          attachCommitOnFocusOut(textarea, commit, entryWrap);





          textarea.addEventListener('keydown', (e) => {





            if (e.key === 'Escape') {





              e.preventDefault();





              cleanup();





            }





            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {





              e.preventDefault();





              textarea.blur();





            }





          });











          entryWrap.appendChild(textarea);





          autoResize();





          setTimeout(() => textarea.focus(), 0);





        };











        const beginEventInfoEdit = () => {





          if (entryWrap.dataset.editing === 'true') return;





          if (clickTimer) {





            clearTimeout(clickTimer);





            clickTimer = null;





          }





          entryWrap.dataset.editing = 'true';





          btn.style.display = 'none';











          const textarea = document.createElement('textarea');





          const startingValue = entry.rawValue || '';





          textarea.value = startingValue;





          textarea.placeholder = entry.emptyLabel || '';





          textarea.spellcheck = true;





          Object.assign(textarea.style, {





            width: '100%',





            minHeight: '40px',





            resize: 'vertical',





            borderRadius: '4px',





            padding: '6px',





            fontSize: '12px',





            lineHeight: '1.3',





            fontFamily: 'inherit',





            boxSizing: 'border-box'





          });





          applyEntryPalette(textarea, palette, true);











          const autoResize = () => {





            textarea.style.height = 'auto';





            const nextHeight = textarea.scrollHeight;





            textarea.style.height = `${Math.max(nextHeight, 40)}px`;





          };











          const cleanup = () => {





            entryWrap.dataset.editing = 'false';





            textarea.remove();





            btn.style.display = '';





            if (activeEdit && activeEdit.entryWrap === entryWrap) {





              activeEdit = null;





            }





          };











          let commitInFlight = false;





          const commit = async () => {





            if (commitInFlight) return;





            commitInFlight = true;





            const nextValue = textarea.value.replace(/\r\n/g, '\n').trim();





            const normalizedStart = startingValue.replace(/\r\n/g, '\n').trim();





            if (nextValue === normalizedStart) {





              commitInFlight = false;





              cleanup();





              return;





            }





            textarea.disabled = true;





            textarea.style.opacity = '0.7';





            const infoValue = nextValue ? nextValue : null;





            try {





              await submitServiceUpdate(locationId, service.id, {





                eventRelatedInfo: { event: SERVICE_EDIT_OCCASION, information: infoValue }





              });





              const updatedAt = new Date().toISOString();





              const existingInfos = Array.isArray(service.EventRelatedInfos) ? service.EventRelatedInfos : [];





              const filteredInfos = existingInfos.filter(info => info?.event !== SERVICE_EDIT_OCCASION);





              if (infoValue) {





                filteredInfos.push({ event: SERVICE_EDIT_OCCASION, information: infoValue, updatedAt });





              }





              service.EventRelatedInfos = filteredInfos;





              entry.rawValue = nextValue;





              entry.value = truncateText(nextValue, 120);





              entry.updatedAt = updatedAt;





              updateCachedServiceEventInfo(locationId, service.id, infoValue, updatedAt);





              const nextPalette = getRecencyStyles(updatedAt);





              applyEntryPalette(btn, nextPalette);





              btn.textContent = formatEntryText(entry);





              void recordServiceEditLog({





                locationId,





                serviceId: service.id,





                field: entry.field,





                label: entry.label,





                urlSuffix: entry.urlSuffix,





                before: normalizedStart,





                after: nextValue





              });





            } catch (err) {





              console.error('[Service Taxonomy] Failed to update event info', err);





            } finally {





              commitInFlight = false;





              cleanup();





            }





          };











          activeEdit = { entryWrap, commit };











          textarea.addEventListener('input', autoResize);





          attachCommitOnFocusOut(textarea, commit, entryWrap);





          textarea.addEventListener('keydown', (e) => {





            if (e.key === 'Escape') {





              e.preventDefault();





              cleanup();





            }





            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {





              e.preventDefault();





              textarea.blur();





            }





          });











          entryWrap.appendChild(textarea);





          autoResize();





          setTimeout(() => textarea.focus(), 0);





        };











        const beginRequiredDocsEdit = () => {





          if (entryWrap.dataset.editing === 'true') return;





          if (clickTimer) {





            clearTimeout(clickTimer);





            clickTimer = null;





          }





          entryWrap.dataset.editing = 'true';





          btn.style.display = 'none';











          const editor = document.createElement('div');





          Object.assign(editor.style, {





            display: 'flex',





            flexDirection: 'column',





            gap: '6px',





            padding: '6px',





            borderRadius: '4px',





            boxSizing: 'border-box'





          });





          applyEntryPalette(editor, palette, true);











          const list = document.createElement('div');





          Object.assign(list.style, { display: 'flex', flexDirection: 'column', gap: '4px' });











          const normalizeDocs = (docs) => docs





            .map(doc => String(doc || '').trim())





            .filter(Boolean)





            .filter(doc => doc.toLowerCase() !== 'none');











          const startingDocs = normalizeDocs(Array.isArray(entry.rawValue) ? entry.rawValue : []);





          const startingKey = JSON.stringify(startingDocs);











          const addRow = (value = '') => {





            const row = document.createElement('div');





            Object.assign(row.style, { display: 'flex', gap: '4px', alignItems: 'center' });











            const input = document.createElement('input');





            input.type = 'text';





            input.value = value;





            input.placeholder = 'Document name';





            Object.assign(input.style, {





              flex: '1',





              fontSize: '12px',





              padding: '4px 6px',





              borderRadius: '4px',





              border: '1px solid #d9d9d9'





            });











            const removeBtn = document.createElement('button');





            removeBtn.type = 'button';





            removeBtn.textContent = 'x';





            Object.assign(removeBtn.style, {





              border: '1px solid #d9d9d9',





              background: '#fff',





              borderRadius: '4px',





              padding: '2px 6px',





              cursor: 'pointer'





            });





            removeBtn.addEventListener('click', (e) => {





              e.preventDefault();





              e.stopPropagation();





              row.remove();





            });











            row.appendChild(input);





            row.appendChild(removeBtn);





            list.appendChild(row);





            return input;





          };











          if (startingDocs.length) {





            startingDocs.forEach(doc => addRow(doc));





          } else {





            addRow('');





          }











          const addBtn = document.createElement('button');





          addBtn.type = 'button';





          addBtn.textContent = '+ Add document';





          Object.assign(addBtn.style, {





            alignSelf: 'flex-start',





            border: '1px solid #d9d9d9',





            background: '#fff',





            borderRadius: '4px',





            padding: '3px 6px',





            fontSize: '12px',





            cursor: 'pointer'





          });





          addBtn.addEventListener('click', (e) => {





            e.preventDefault();





            e.stopPropagation();





            const input = addRow('');





            setTimeout(() => input.focus(), 0);





          });











          const cleanup = () => {





            entryWrap.dataset.editing = 'false';





            editor.remove();





            btn.style.display = '';





            if (activeEdit && activeEdit.entryWrap === entryWrap) {





              activeEdit = null;





            }





          };











          let commitInFlight = false;





          const commit = async () => {





            if (commitInFlight) return;





            commitInFlight = true;











            const inputs = Array.from(list.querySelectorAll('input'));





            const nextDocs = normalizeDocs(inputs.map(input => input.value));





            if (JSON.stringify(nextDocs) === startingKey) {





              commitInFlight = false;





              cleanup();





              return;





            }











            Array.from(editor.querySelectorAll('input, button')).forEach(el => {





              el.disabled = true;





            });





            editor.style.opacity = '0.7';











            try {





              await submitServiceUpdate(locationId, service.id, {





                documents: { proofs: nextDocs }





              });





              const updatedAt = new Date().toISOString();





              entry.rawValue = nextDocs;





              entry.value = formatOxfordList(nextDocs);





              entry.updatedAt = updatedAt;





              service.RequiredDocuments = nextDocs.map(doc => ({ document: doc }));





              updateCachedServiceRequiredDocs(locationId, service.id, nextDocs, updatedAt);





              const nextPalette = getRecencyStyles(updatedAt);





              applyEntryPalette(btn, nextPalette);





              btn.textContent = formatEntryText(entry);





              void recordServiceEditLog({





                locationId,





                serviceId: service.id,





                field: entry.field,





                label: entry.label,





                urlSuffix: entry.urlSuffix,





                before: startingDocs,





                after: nextDocs





              });





            } catch (err) {





              console.error('[Service Taxonomy] Failed to update required documents', err);





            } finally {





              commitInFlight = false;





              cleanup();





            }





          };











          activeEdit = { entryWrap, commit };





          attachCommitOnFocusOut(editor, commit, entryWrap);











          editor.addEventListener('keydown', (e) => {





            if (e.key === 'Escape') {





              e.preventDefault();





              cleanup();





            }





          });











          editor.appendChild(list);





          editor.appendChild(addBtn);





          entryWrap.appendChild(editor);





          const firstInput = list.querySelector('input');





          if (firstInput) setTimeout(() => firstInput.focus(), 0);





        };











        const beginAgeEdit = () => {





          if (entryWrap.dataset.editing === 'true') return;





          if (clickTimer) {





            clearTimeout(clickTimer);





            clickTimer = null;





          }





          entryWrap.dataset.editing = 'true';





          btn.style.display = 'none';











          const editor = document.createElement('div');





          Object.assign(editor.style, {





            display: 'flex',





            flexDirection: 'column',





            gap: '6px',





            padding: '6px',





            borderRadius: '4px',





            boxSizing: 'border-box'





          });





          applyEntryPalette(editor, palette, true);











          const errorText = document.createElement('div');





          Object.assign(errorText.style, { fontSize: '11px', color: '#b42318' });











          const list = document.createElement('div');





          Object.assign(list.style, { display: 'flex', flexDirection: 'column', gap: '6px' });











          const normalizeGroups = (groups) => groups





            .map(group => ({





              all_ages: !!group.all_ages,





              age_min: normalizeAgeNumber(group.age_min),





              age_max: normalizeAgeNumber(group.age_max),





              population_served: String(group.population_served || '').trim() || null





            }))





            .filter(group => group.all_ages || group.age_min != null || group.age_max != null || group.population_served);











          const startingGroups = normalizeGroups(Array.isArray(entry.rawValue) ? entry.rawValue : []);





          const startingKey = JSON.stringify(startingGroups);











          const addRow = (group = {}) => {





            const row = document.createElement('div');





            row.dataset.ageRow = 'true';





            Object.assign(row.style, { display: 'flex', flexWrap: 'wrap', gap: '4px', alignItems: 'center' });











            const labelInput = document.createElement('input');





            labelInput.type = 'text';





            labelInput.placeholder = 'Group';





            labelInput.value = group.population_served || '';





            Object.assign(labelInput.style, {





              flex: '1 1 80px',





              fontSize: '12px',





              padding: '4px 6px',





              borderRadius: '4px',





              border: '1px solid #d9d9d9'





            });











            const allAgesWrap = document.createElement('label');





            Object.assign(allAgesWrap.style, { display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px' });





            const allAgesInput = document.createElement('input');





            allAgesInput.type = 'checkbox';





            allAgesInput.checked = !!group.all_ages;





            allAgesWrap.appendChild(allAgesInput);





            allAgesWrap.appendChild(document.createTextNode('All ages'));











            const minInput = document.createElement('input');





            minInput.type = 'number';





            minInput.min = '0';





            minInput.placeholder = 'Min';





            minInput.value = group.age_min != null ? String(group.age_min) : '';





            Object.assign(minInput.style, {





              width: '58px',





              fontSize: '12px',





              padding: '4px 6px',





              borderRadius: '4px',





              border: '1px solid #d9d9d9'





            });











            const maxInput = document.createElement('input');





            maxInput.type = 'number';





            maxInput.min = '0';





            maxInput.placeholder = 'Max';





            maxInput.value = group.age_max != null ? String(group.age_max) : '';





            Object.assign(maxInput.style, {





              width: '58px',





              fontSize: '12px',





              padding: '4px 6px',





              borderRadius: '4px',





              border: '1px solid #d9d9d9'





            });











            const removeBtn = document.createElement('button');





            removeBtn.type = 'button';





            removeBtn.textContent = 'x';





            Object.assign(removeBtn.style, {





              border: '1px solid #d9d9d9',





              background: '#fff',





              borderRadius: '4px',





              padding: '2px 6px',





              cursor: 'pointer'





            });





            removeBtn.addEventListener('click', (e) => {





              e.preventDefault();





              e.stopPropagation();





              row.remove();





            });











            const syncAllAges = () => {





              const disabled = allAgesInput.checked;





              minInput.disabled = disabled;





              maxInput.disabled = disabled;





              if (disabled) {





                minInput.value = '';





                maxInput.value = '';





              }





            };





            allAgesInput.addEventListener('change', syncAllAges);





            syncAllAges();











            row.appendChild(labelInput);





            row.appendChild(allAgesWrap);





            row.appendChild(minInput);





            row.appendChild(maxInput);





            row.appendChild(removeBtn);





            list.appendChild(row);





            return labelInput;





          };











          if (startingGroups.length) {





            startingGroups.forEach(group => addRow(group));





          } else {





            addRow({ all_ages: true });





          }











          const addBtn = document.createElement('button');





          addBtn.type = 'button';





          addBtn.textContent = '+ Add age range';





          Object.assign(addBtn.style, {





            alignSelf: 'flex-start',





            border: '1px solid #d9d9d9',





            background: '#fff',





            borderRadius: '4px',





            padding: '3px 6px',





            fontSize: '12px',





            cursor: 'pointer'





          });





          addBtn.addEventListener('click', (e) => {





            e.preventDefault();





            e.stopPropagation();





            const input = addRow({ all_ages: false });





            setTimeout(() => input.focus(), 0);





          });











          const cleanup = () => {





            entryWrap.dataset.editing = 'false';





            editor.remove();





            btn.style.display = '';





            if (activeEdit && activeEdit.entryWrap === entryWrap) {





              activeEdit = null;





            }





          };











          let commitInFlight = false;





          const commit = async () => {





            if (commitInFlight) return;





            commitInFlight = true;











            errorText.textContent = '';





            Array.from(editor.querySelectorAll('input')).forEach(el => {





              el.style.borderColor = '#d9d9d9';





            });











            const rows = Array.from(list.querySelectorAll('[data-age-row="true"]'));





            const nextGroups = [];





            let validationError = null;





            let invalidInputs = [];











            rows.forEach(row => {





              const inputs = row.querySelectorAll('input');





              const labelInput = inputs[0];





              const allAgesInput = inputs[1];





              const minInput = inputs[2];





              const maxInput = inputs[3];











              const label = labelInput.value.trim();





              const allAges = allAgesInput.checked;





              const minVal = normalizeAgeNumber(minInput.value);





              const maxVal = normalizeAgeNumber(maxInput.value);











              if (allAges) {





                nextGroups.push({





                  all_ages: true,





                  age_min: null,





                  age_max: null,





                  population_served: label || null





                });





                return;





              }











              if (minVal == null && maxVal == null) {





                validationError = 'Enter a min/max age or select All ages.';





                invalidInputs = [minInput, maxInput];





                return;





              }











              if (minVal != null && maxVal != null && minVal > maxVal) {





                validationError = 'Min age cannot exceed max age.';





                invalidInputs = [minInput, maxInput];





                return;





              }











              nextGroups.push({





                all_ages: false,





                age_min: minVal,





                age_max: maxVal,





                population_served: label || null





              });





            });











            if (validationError) {





              errorText.textContent = validationError;





              invalidInputs.forEach(input => {





                input.style.borderColor = '#b42318';





              });





              commitInFlight = false;





              return;





            }











            const normalizedNext = normalizeGroups(nextGroups);





            if (JSON.stringify(normalizedNext) === startingKey) {





              commitInFlight = false;





              cleanup();





              return;





            }











            Array.from(editor.querySelectorAll('input, button')).forEach(el => {





              el.disabled = true;





            });





            editor.style.opacity = '0.7';











            try {





              await submitServiceUpdate(locationId, service.id, {





                whoDoesItServe: normalizedNext





              });





              const updatedAt = new Date().toISOString();





              updateCachedServiceAgeRequirement(locationId, service.id, normalizedNext, updatedAt);





              const eligibilities = Array.isArray(service.Eligibilities) ? service.Eligibilities : [];





              const idx = eligibilities.findIndex(e => e?.EligibilityParameter?.name?.toLowerCase?.() === 'age');





              if (normalizedNext.length === 0) {





                if (idx >= 0) eligibilities.splice(idx, 1);





              } else if (idx >= 0) {





                eligibilities[idx] = {





                  ...eligibilities[idx],





                  eligible_values: normalizedNext,





                  updatedAt





                };





              } else {





                eligibilities.push({





                  eligible_values: normalizedNext,





                  updatedAt,





                  EligibilityParameter: { name: 'age' }





                });





              }





              service.Eligibilities = eligibilities;





              entry.rawValue = normalizedNext;





              entry.value = formatAgeGroups(normalizedNext);





              entry.updatedAt = updatedAt;





              const nextPalette = getRecencyStyles(updatedAt);





              applyEntryPalette(btn, nextPalette);





              btn.textContent = formatEntryText(entry);





              void recordServiceEditLog({





                locationId,





                serviceId: service.id,





                field: entry.field,





                label: entry.label,





                urlSuffix: entry.urlSuffix,





                before: startingGroups,





                after: normalizedNext





              });





            } catch (err) {





              console.error('[Service Taxonomy] Failed to update age requirement', err);





            } finally {





              commitInFlight = false;





              cleanup();





            }





          };











          activeEdit = { entryWrap, commit };





          attachCommitOnFocusOut(editor, commit, entryWrap);











          editor.addEventListener('keydown', (e) => {





            if (e.key === 'Escape') {





              e.preventDefault();





              cleanup();





            }





          });











          editor.appendChild(list);





          editor.appendChild(addBtn);





          editor.appendChild(errorText);





          entryWrap.appendChild(editor);





          const firstInput = list.querySelector('input');





          if (firstInput) setTimeout(() => firstInput.focus(), 0);





        };











        const beginHoursEdit = () => {





          if (entryWrap.dataset.editing === 'true') return;





          if (clickTimer) {





            clearTimeout(clickTimer);





            clickTimer = null;





          }





          entryWrap.dataset.editing = 'true';





          btn.style.display = 'none';











          const editor = document.createElement('div');





          Object.assign(editor.style, {





            display: 'flex',





            flexDirection: 'column',





            gap: '6px',





            padding: '6px',





            borderRadius: '4px',





            boxSizing: 'border-box'





          });





          applyEntryPalette(editor, palette, true);











          const errorText = document.createElement('div');





          Object.assign(errorText.style, { fontSize: '11px', color: '#b42318' });











          const list = document.createElement('div');





          Object.assign(list.style, { display: 'flex', flexDirection: 'column', gap: '6px' });











          const scheduleDraftKey = locationId && service?.id





            ? `gghost-schedule-draft:${locationId}:${service.id}`





            : null;











          const readScheduleDraft = () => {





            if (!scheduleDraftKey) return null;





            try {





              return JSON.parse(localStorage.getItem(scheduleDraftKey) || 'null');





            } catch {





              return null;





            }





          };











          const writeScheduleDraft = (payload) => {





            if (!scheduleDraftKey) return;





            try {





              localStorage.setItem(scheduleDraftKey, JSON.stringify(payload));





            } catch {}





          };











          const normalizeSchedule = (schedule) => ({





            weekday: toWeekdayNumber(schedule.weekday),





            opens_at: toScheduleTimeValue(schedule.opens_at || schedule.opensAt),





            closes_at: toScheduleTimeValue(schedule.closes_at || schedule.closesAt),





            closed: !!schedule.closed,





            occasion: schedule.occasion || SERVICE_EDIT_OCCASION,





            start_date: schedule.start_date || schedule.startDate || null,





            end_date: schedule.end_date || schedule.endDate || null





          });











          const rawSchedules = Array.isArray(entry.rawValue) ? entry.rawValue.map(normalizeSchedule) : [];





          const openSchedules = rawSchedules.filter(schedule => !schedule.closed);





          const draft = readScheduleDraft();





          const draftSchedules = Array.isArray(draft?.schedules) ? draft.schedules : null;





          const startingSchedules = draftSchedules ? draftSchedules.map(normalizeSchedule) : openSchedules;





          const startingClosedAll = draft





            ? !!draft.closedAll





            : (rawSchedules.length > 0 && rawSchedules.every(schedule => schedule.closed));





          const startingKey = JSON.stringify(startingSchedules);





          let closedAllInput = null;











          const getDraftRows = () => {





            const rows = Array.from(list.querySelectorAll('[data-schedule-row="true"]'));





            return rows.map(row => {





              const selects = row.querySelectorAll('select');





              const inputs = row.querySelectorAll('input');





              const weekdaySelect = selects[0];





              const openInput = inputs[0];





              const closeInput = inputs[1];





              const weekdayNum = Number(weekdaySelect?.value);





              return {





                weekday: weekdayNum || null,





                opensAt: openInput?.value || null,





                closesAt: closeInput?.value || null,





                occasion: row.dataset.occasion || SERVICE_EDIT_OCCASION,





                startDate: row.dataset.startDate || null,





                endDate: row.dataset.endDate || null





              };





            }).filter(row => row.weekday);





          };











          const persistScheduleDraft = () => {





            writeScheduleDraft({





              closedAll: !!closedAllInput?.checked,





              schedules: getDraftRows()





            });





          };











          const normalizeScheduleDate = (value) => {





            if (value === null || value === undefined || value === '') return null;





            if (typeof value === 'number' && Number.isFinite(value)) return value;





            const str = String(value).trim();





            if (!str) return null;





            if (/^\d+$/.test(str)) return Number(str);





            const parsed = Date.parse(str);





            if (Number.isNaN(parsed)) return null;





            return str;





          };











          const addRow = (schedule = {}) => {





            const row = document.createElement('div');





            row.dataset.scheduleRow = 'true';





            Object.assign(row.style, { display: 'flex', flexWrap: 'wrap', gap: '4px', alignItems: 'center' });











            const weekdaySelect = document.createElement('select');





            Object.assign(weekdaySelect.style, {





              fontSize: '12px',





              padding: '4px 6px',





              borderRadius: '4px',





              border: '1px solid #d9d9d9'





            });





            WEEKDAY_NAMES.forEach((name, index) => {





              const opt = document.createElement('option');





              opt.value = String(index + 1);





              opt.textContent = name.slice(0, 3);





              weekdaySelect.appendChild(opt);





            });





            const weekdayNum = toWeekdayNumber(schedule.weekday) || 1;





            weekdaySelect.value = String(weekdayNum);











            const openInput = document.createElement('input');





            openInput.type = 'time';





            openInput.value = toTimeInputValue(schedule.opens_at || schedule.opensAt);





            Object.assign(openInput.style, {





              width: '88px',





              fontSize: '12px',





              padding: '4px 6px',





              borderRadius: '4px',





              border: '1px solid #d9d9d9'





            });











            const closeInput = document.createElement('input');





            closeInput.type = 'time';





            closeInput.value = toTimeInputValue(schedule.closes_at || schedule.closesAt);





            Object.assign(closeInput.style, {





              width: '88px',





              fontSize: '12px',





              padding: '4px 6px',





              borderRadius: '4px',





              border: '1px solid #d9d9d9'





            });











            const removeBtn = document.createElement('button');





            removeBtn.type = 'button';





            removeBtn.textContent = 'x';





            Object.assign(removeBtn.style, {





              border: '1px solid #d9d9d9',





              background: '#fff',





              borderRadius: '4px',





              padding: '2px 6px',





              cursor: 'pointer'





            });





            removeBtn.addEventListener('click', (e) => {





              e.preventDefault();





              e.stopPropagation();





              row.remove();





              persistScheduleDraft();





            });











            row.dataset.occasion = schedule.occasion || SERVICE_EDIT_OCCASION;





            row.dataset.startDate = schedule.start_date || schedule.startDate || '';





            row.dataset.endDate = schedule.end_date || schedule.endDate || '';











            const handleDraftChange = () => {





              persistScheduleDraft();





            };





            weekdaySelect.addEventListener('change', handleDraftChange);





            openInput.addEventListener('input', handleDraftChange);





            closeInput.addEventListener('input', handleDraftChange);











            row.appendChild(weekdaySelect);





            row.appendChild(openInput);





            row.appendChild(closeInput);





            row.appendChild(removeBtn);





            list.appendChild(row);





            persistScheduleDraft();





          };











          if (startingSchedules.length) {





            startingSchedules.forEach(schedule => addRow(schedule));





          } else {





            addRow({});





          }











          const addBtn = document.createElement('button');





          addBtn.type = 'button';





          addBtn.textContent = '+ Add schedule';





          Object.assign(addBtn.style, {





            alignSelf: 'flex-start',





            border: '1px solid #d9d9d9',





            background: '#fff',





            borderRadius: '4px',





            padding: '3px 6px',





            fontSize: '12px',





            cursor: 'pointer'





          });





          addBtn.addEventListener('click', (e) => {





            e.preventDefault();





            e.stopPropagation();





            addRow({});





          });











          const listWrap = document.createElement('div');





          Object.assign(listWrap.style, { display: 'flex', flexDirection: 'column', gap: '6px' });





          listWrap.appendChild(list);





          listWrap.appendChild(addBtn);











          const closedAllWrap = document.createElement('label');





          Object.assign(closedAllWrap.style, { display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px' });





          closedAllInput = document.createElement('input');





          closedAllInput.type = 'checkbox';





          closedAllInput.checked = startingClosedAll;





          closedAllWrap.appendChild(closedAllInput);





          closedAllWrap.appendChild(document.createTextNode('Closed (all days)'));











          const syncClosedAll = () => {





            const isClosedAll = !!closedAllInput.checked;





            listWrap.style.display = isClosedAll ? 'none' : 'flex';





            persistScheduleDraft();





          };





          closedAllInput.addEventListener('change', syncClosedAll);





          syncClosedAll();











          const cleanup = () => {





            entryWrap.dataset.editing = 'false';





            editor.remove();





            btn.style.display = '';





            if (activeEdit && activeEdit.entryWrap === entryWrap) {





              activeEdit = null;





            }





          };











          let commitInFlight = false;





          const commit = async () => {





            if (commitInFlight) return;





            commitInFlight = true;





            errorText.textContent = '';





            Array.from(editor.querySelectorAll('input, select')).forEach(el => {





              el.style.borderColor = '#d9d9d9';





            });











            const rows = Array.from(list.querySelectorAll('[data-schedule-row="true"]'));





            const nextSchedules = [];





            const payloadRows = [];





            let validationError = null;





            let invalidInputs = [];





            const closedAll = !!closedAllInput?.checked;











            persistScheduleDraft();











            if (!closedAll && rows.length === 0) {





              validationError = 'Add at least one schedule or mark closed.';





            }











            if (!validationError && closedAll) {





              const days = [1, 2, 3, 4, 5, 6, 7];





              days.forEach(day => {





                payloadRows.push({





                  weekday: toWeekdayName(day),





                  opensAt: null,





                  closesAt: null,





                  closed: true,





                  occasion: SERVICE_EDIT_OCCASION





                });











                nextSchedules.push({





                  weekday: day,





                  opens_at: null,





                  closes_at: null,





                  closed: true,





                  occasion: SERVICE_EDIT_OCCASION,





                  start_date: null,





                  end_date: null





                });





              });





            }











            if (!validationError && !closedAll) {





              rows.forEach(row => {





                if (validationError) return;





                const selects = row.querySelectorAll('select');





                const inputs = row.querySelectorAll('input');





                const weekdaySelect = selects[0];





                const openInput = inputs[0];





                const closeInput = inputs[1];











                const weekdayNum = Number(weekdaySelect.value);





                if (!weekdayNum) {





                  validationError = 'Select a weekday for each schedule.';





                  invalidInputs = [weekdaySelect];





                  return;





                }











                const opensAt = openInput.value;





                const closesAt = closeInput.value;











                if (!opensAt || !closesAt) {





                  validationError = 'Enter open/close times for each schedule.';





                  invalidInputs = [openInput, closeInput];





                  return;





                }











                const occasion = row.dataset.occasion || SERVICE_EDIT_OCCASION;





                const startDate = normalizeScheduleDate(row.dataset.startDate);





                const endDate = normalizeScheduleDate(row.dataset.endDate);











                const payloadRow = {





                  weekday: toWeekdayName(weekdayNum),





                  opensAt,





                  closesAt,





                  closed: false,





                  occasion





                };





                if (startDate !== null) payloadRow.startDate = startDate;





                if (endDate !== null) payloadRow.endDate = endDate;





                payloadRows.push(payloadRow);











                nextSchedules.push({





                  weekday: weekdayNum,





                  opens_at: toScheduleTimeValue(opensAt),





                  closes_at: toScheduleTimeValue(closesAt),





                  closed: false,





                  occasion,





                  start_date: startDate == null ? null : startDate,





                  end_date: endDate == null ? null : endDate





                });





              });





            }











            if (validationError) {





              errorText.textContent = validationError;





              invalidInputs.forEach(input => {





                input.style.borderColor = '#b42318';





              });





              commitInFlight = false;





              return;





            }











            const normalizedNext = nextSchedules.map(normalizeSchedule);





            const closedStateChanged = closedAll !== startingClosedAll;





            if (!closedStateChanged && JSON.stringify(normalizedNext) === startingKey) {





              commitInFlight = false;





              cleanup();





              return;





            }











            Array.from(editor.querySelectorAll('input, select, button')).forEach(el => {





              el.disabled = true;





            });





            editor.style.opacity = '0.7';











            try {





              await submitServiceUpdate(locationId, service.id, {





                irregularHours: payloadRows





              });





              const updatedAt = new Date().toISOString();





              service.HolidaySchedules = nextSchedules.map(schedule => ({





                ...schedule,





                updatedAt





              }));





              updateCachedServiceHolidaySchedules(locationId, service.id, service.HolidaySchedules, updatedAt);





              const nextEntry = buildHoursEntry(service);





              entry.rawValue = service.HolidaySchedules;





              entry.value = nextEntry.value;





              entry.updatedAt = updatedAt;





              const nextPalette = getRecencyStyles(updatedAt);





              applyEntryPalette(btn, nextPalette);





              btn.textContent = formatEntryText(entry);





              void recordServiceEditLog({





                locationId,





                serviceId: service.id,





                field: entry.field,





                label: entry.label,





                urlSuffix: entry.urlSuffix,





                before: startingSchedules,





                after: service.HolidaySchedules





              });





            } catch (err) {





              console.error('[Service Taxonomy] Failed to update schedules', err);





            } finally {





              commitInFlight = false;





              cleanup();





            }





          };











          activeEdit = { entryWrap, commit };





          attachCommitOnFocusOut(editor, commit, entryWrap);











          editor.addEventListener('keydown', (e) => {





            if (e.key === 'Escape') {





              e.preventDefault();





              cleanup();





            }





          });











          editor.appendChild(closedAllWrap);





          editor.appendChild(listWrap);





          editor.appendChild(errorText);





          entryWrap.appendChild(editor);





          const firstInput = list.querySelector('input, select');





          if (firstInput && !closedAllInput?.checked) {





            setTimeout(() => firstInput.focus(), 0);





          }





        };











        const beginEdit = () => {





          if (entry.field === 'description') return beginDescriptionEdit();





          if (entry.field === 'eventInfo') return beginEventInfoEdit();





          if (entry.field === 'requiredDocs') return beginRequiredDocsEdit();





          if (entry.field === 'age') return beginAgeEdit();





          if (entry.field === 'hours') return beginHoursEdit();





        };











        btn.addEventListener('click', (evt) => {





          evt.stopPropagation();





          if (entryWrap.dataset.editing === 'true') return;





          if (isEditable) {





            if (evt.detail > 1) {





              commitActiveEdit().then(beginEdit);





              return;





            }





            if (clickTimer) clearTimeout(clickTimer);





            clickTimer = setTimeout(() => {





              clickTimer = null;





              navigateAfterCommit();





            }, navDelayMs);





            return;





          }





          navigateAfterCommit();





        });











        if (isEditable) {





          btn.addEventListener('dblclick', (evt) => {





            evt.preventDefault();





            evt.stopPropagation();





            commitActiveEdit().then(beginEdit);





          });





        }











        entryWrap.appendChild(btn);





        chips.appendChild(entryWrap);





      });











      row.appendChild(chips);





    } else {





      const empty = document.createElement('div');





      empty.textContent = 'No quick data yet.';





      Object.assign(empty.style, {





        fontSize: '12px',





        color: '#7a6b2b'





      });





      row.appendChild(empty);





    }











    panel.appendChild(row);





  });











  panel.appendChild(extrasWrap);





  return panel;





}











function renderServiceTaxonomyBanner(taxonomies, services = [], locationId = null, currentServiceIndex = 0) {





  if (!Array.isArray(taxonomies) || taxonomies.length === 0) return;





  ensureTaxonomyBannerObserver();





  removeLegacyTaxonomyBanners();











  const navServices = normalizeServices(services).filter(service => {





    const id = normalizeId(service?.id);





    return id && id !== 'null' && id !== 'undefined';





  });





  const showNavigation = !!locationId && navServices.length > 1;





  const safeServiceIndex = navServices.length





    ? Math.max(0, Math.min(currentServiceIndex, navServices.length - 1))





    : 0;





  const activeServiceId = navServices[safeServiceIndex]?.id || null;





  activeTaxonomyBannerKey = buildTaxonomyBannerKey(locationId, activeServiceId);











  const banner = document.createElement('div');





  banner.setAttribute(TAXONOMY_BANNER_ATTR, 'true');





  Object.assign(banner.style, {





    position: 'fixed',





    top: '88px',





    right: '20px',





    background: 'rgba(255, 254, 245, 0.85)',





    border: '1px solid #d4c79a',





    borderRadius: '8px',





    padding: '6px 8px',





    boxShadow: '0 6px 18px rgba(0, 0, 0, 0.12)',





    maxWidth: '320px',





    fontFamily: 'Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',





    color: '#1f1f1f',





    zIndex: '9999',





    lineHeight: '1.3'





  });











  const headerRow = document.createElement('div');





  Object.assign(headerRow.style, {





    gap: '6px',





    position: 'relative'





  });





  headerRow.style.setProperty('display', 'flex', 'important');





  headerRow.style.setProperty('align-items', 'center', 'important');





  headerRow.style.setProperty('flex-wrap', 'nowrap', 'important');





  headerRow.style.setProperty('flex-direction', 'row', 'important');





  headerRow.style.setProperty('width', '100%', 'important');





  headerRow.style.setProperty('max-width', '100%', 'important');





  headerRow.style.setProperty('min-width', '0', 'important');





  headerRow.style.setProperty('gap', '8px', 'important');











  const canShowHoverPanel = navServices.length > 0 && locationId;





  let hoverPanel = null;





  let showHoverPanel = null;





  let hideHoverPanel = null;





  let wireHoverPanel = null;





  let hoverPanelAttached = false;





  if (canShowHoverPanel) {





    hoverPanel = createServiceHoverPanel(





      navServices,





      locationId,





      navServices[safeServiceIndex]?.id || null





    );





    hoverPanel.style.left = 'auto';





    hoverPanel.style.right = '0';





    let hoverPanelTimeout = null;





    showHoverPanel = () => {





      clearTimeout(hoverPanelTimeout);





      hoverPanel.style.opacity = '1';





      hoverPanel.style.pointerEvents = 'auto';





      hoverPanel.style.transform = 'translateY(0)';





    };





    hideHoverPanel = () => {





      if (hoverPanel && typeof hoverPanel.__gghostCommitActiveEdit === 'function') {





        hoverPanel.__gghostCommitActiveEdit();





      }





      hoverPanelTimeout = setTimeout(() => {





        hoverPanel.style.opacity = '0';





        hoverPanel.style.pointerEvents = 'none';





        hoverPanel.style.transform = 'translateY(6px)';





      }, 120);





    };





    wireHoverPanel = (target) => {





      target.addEventListener('mouseenter', showHoverPanel);





      target.addEventListener('mouseleave', hideHoverPanel);





      hoverPanel.addEventListener('mouseenter', showHoverPanel);





      hoverPanel.addEventListener('mouseleave', hideHoverPanel);





    };





  }

















  // Add navigation controls / hover panel if we have multiple services





  if (showNavigation) {





    const navContainer = document.createElement('div');





    Object.assign(navContainer.style, {





      display: 'flex',





      gap: '4px',





      alignItems: 'center',





      position: 'relative',





      flexShrink: '0'





    });





    navContainer.style.setProperty('flex-wrap', 'nowrap', 'important');





    navContainer.style.setProperty('white-space', 'nowrap', 'important');





    navContainer.style.setProperty('flex', '0 0 auto', 'important');











    // Previous button





    const prevBtn = document.createElement('button');





    prevBtn.textContent = '←';





    const prevIndex = (safeServiceIndex - 1 + navServices.length) % navServices.length;





    const prevService = navServices[prevIndex];





    prevBtn.title = `Previous: ${prevService?.name || 'Unknown'}`;





    Object.assign(prevBtn.style, {





      padding: '2px 6px',





      fontSize: '14px',





      border: '1px solid #d4c79a',





      background: '#fff',





      borderRadius: '4px',





      cursor: 'pointer',





      fontWeight: 'bold'





    });





    prevBtn.addEventListener('click', () => {





      const prevServiceId = navServices[prevIndex]?.id;





      if (prevServiceId) {





        // Set flag to keep overlay visible on next page





        localStorage.setItem('gghost-taxonomy-overlay-active', 'true');





        window.location.href = `https://gogetta.nyc/team/location/${locationId}/services/${prevServiceId}`;





      }





    });











    // Next button





    const nextBtn = document.createElement('button');





    nextBtn.textContent = '→';





    const nextIndex = (safeServiceIndex + 1) % navServices.length;





    const nextService = navServices[nextIndex];





    nextBtn.title = `Next: ${nextService?.name || 'Unknown'}`;





    Object.assign(nextBtn.style, {





      padding: '2px 6px',





      fontSize: '14px',





      border: '1px solid #d4c79a',





      background: '#fff',





      borderRadius: '4px',





      cursor: 'pointer',





      fontWeight: 'bold'





    });





    nextBtn.addEventListener('click', () => {





      const nextServiceId = navServices[nextIndex]?.id;





      if (nextServiceId) {





        // Set flag to keep overlay visible on next page





        localStorage.setItem('gghost-taxonomy-overlay-active', 'true');





        window.location.href = `https://gogetta.nyc/team/location/${locationId}/services/${nextServiceId}`;





      }





    });











    navContainer.appendChild(prevBtn);





    navContainer.appendChild(nextBtn);





    if (hoverPanel && wireHoverPanel) {





      headerRow.appendChild(hoverPanel);





      wireHoverPanel(navContainer);





      hoverPanelAttached = true;





    }





    headerRow.appendChild(navContainer);





  }











  const listWrap = document.createElement('div');





  Object.assign(listWrap.style, {





    flex: '1 1 0',





    minWidth: '0',





    maxWidth: '100%',





    overflowX: 'auto',





    overflowY: 'hidden'





  });





  listWrap.style.setProperty('display', 'block', 'important');





  listWrap.style.setProperty('min-width', '0', 'important');











  const list = document.createElement('ul');





  Object.assign(list.style, {





    margin: '0',





    padding: '0',





    listStyle: 'none',





    fontSize: '13px',





    gap: '2px 6px'





  });





  list.style.setProperty('display', 'inline-flex', 'important');





  list.style.setProperty('flex-direction', 'row', 'important');





  list.style.setProperty('flex-wrap', 'nowrap', 'important');





  list.style.setProperty('align-items', 'center', 'important');





  list.style.setProperty('white-space', 'nowrap', 'important');











  taxonomies.forEach(({ parent_name: parentName, name }) => {





    if (!parentName && !name) return;











    const item = document.createElement('li');





    item.style.display = 'inline-flex';





    item.style.alignItems = 'center';





    item.style.gap = '4px';





    item.style.padding = '1px 0';





    item.style.whiteSpace = 'nowrap';





    item.style.flexShrink = '0';











    if (parentName) {





      const parent = document.createElement('span');





      parent.textContent = parentName;





      parent.style.fontWeight = '500';





      parent.style.color = '#5f4b00';





      item.appendChild(parent);





    }











    if (parentName && name) {





      const separator = document.createElement('span');





      separator.textContent = '›';





      separator.style.color = '#a38300';





      separator.style.fontSize = '12px';





      item.appendChild(separator);





    }











    if (name) {





      const child = document.createElement('span');





      child.textContent = name;





      child.style.color = '#2f2f2f';





      item.appendChild(child);





    }











    list.appendChild(item);





  });











  if (!list.children.length) {





    const empty = document.createElement('div');





    empty.textContent = 'No taxonomy data available for this service.';





    empty.style.fontSize = '12px';





    empty.style.color = '#6f6f6f';





    listWrap.appendChild(empty);





  } else {





    listWrap.appendChild(list);





  }





  headerRow.appendChild(listWrap);











  if (hoverPanel && wireHoverPanel && !hoverPanelAttached) {





    headerRow.appendChild(hoverPanel);





    wireHoverPanel(headerRow);





  }











  banner.appendChild(headerRow);





  document.body.appendChild(banner);





}











async function showServiceTaxonomy(locationId, serviceId, options = {}) {
  const requestId = ++taxonomyRenderRequestId;
  const normalizedServiceId = normalizeId(serviceId);
  const allowMismatch = options.force === true;
  // Set up timeout to clear the flag after 4 seconds
  const clearFlagTimeout = setTimeout(() => {
    localStorage.removeItem('gghost-taxonomy-overlay-active');
  }, 4000);






  // Fetch data (uses cache if available and fresh)





  const { data: locationData, fromCache } = await fetchFullLocationRecord(locationId, { refresh: false });











  // Clear flag and timeout after fetch





  clearTimeout(clearFlagTimeout);





  localStorage.removeItem('gghost-taxonomy-overlay-active');











  if (!locationData) {





    console.warn('[Service Taxonomy] No location data available for', locationId);





    return;





  }











  const renderWithData = (data) => {





    if (requestId !== taxonomyRenderRequestId) return;





    if (!allowMismatch && !isServiceTaxonomyPath(location.pathname, locationId, normalizedServiceId)) {
      return;
    }
    const service = findServiceRecord(data, normalizedServiceId);





    if (!service) {





      console.warn('[Service Taxonomy] Service not found in location payload', { locationId, serviceId });





      return;





    }











    const taxonomies = Array.isArray(service.Taxonomies)





      ? service.Taxonomies.filter(tax => tax && (tax.parent_name || tax.name))





      : [];











    if (!taxonomies.length) {





      console.log('[Service Taxonomy] No taxonomy entries to display for service', serviceId);





      return;





    }











    // Get all services for navigation





    const allServices = normalizeServices(data.Services || data.services);





    const currentServiceIndex = allServices.findIndex(s => normalizeId(s.id) === normalizedServiceId);





    const safeServiceIndex = currentServiceIndex >= 0 ? currentServiceIndex : 0;











    // Render with data (either cached or freshly fetched)





    removeServiceTaxonomyBanner();





    renderServiceTaxonomyBanner(taxonomies, allServices, locationId, safeServiceIndex);





  };











  if (fromCache) {





    // Avoid flashing different layouts by rendering only once after a refresh attempt.





    fetchFullLocationRecord(locationId, { refresh: true })





      .then(({ data: freshData }) => {





        if (requestId !== taxonomyRenderRequestId) return;





        if (freshData) {





          renderWithData(freshData);





        } else {





          renderWithData(locationData);





        }





      })





      .catch(err => {





        console.error('[Service Taxonomy] Background refresh failed', err);





        if (requestId !== taxonomyRenderRequestId) return;





        renderWithData(locationData);





      });





    return;





  }











  renderWithData(locationData);
}

function installServiceTaxonomyOverlayBridge() {
  if (taxonomyOverlayBridgeInstalled) return;
  taxonomyOverlayBridgeInstalled = true;
  window.addEventListener(SERVICE_TAXONOMY_EVENT, (event) => {
    const detail = event?.detail || {};
    const locationId = detail.locationId;
    const serviceId = detail.serviceId;
    const normalizedLocationId = normalizeId(locationId);
    const normalizedServiceId = normalizeId(serviceId);
    if (!normalizedLocationId || !normalizedServiceId) return;
    removeTaxonomyHeartOverlay();
    showServiceTaxonomy(locationId, serviceId, { force: true }).catch((err) => {
      console.error('[Service Taxonomy] Failed to open overlay from event', err);
    });
  });
}

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











  const { data: locationData, fromCache } = await fetchFullLocationRecord(locationId, { refresh: false });





  if (!locationData) {





    removeTaxonomyHeartOverlay();





    return;





  }











  const services = normalizeServices(locationData.Services || locationData.services);





  renderTaxonomyHeartOverlay(services, locationId);











  if (fromCache) {





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











const LOCATION_LINK_RE = /https?:\/\/[^\s"'<>]+/gi;





const LOCATION_EMAIL_RE = /[\w.+-]+@[\w.-]+\.\w{2,}/g;





const LOCATION_PHONE_RE = /(?:(?:\+?1[\s.\-]*)?)\(?\d{3}\)?[\s.\-]*\d{3}[\s.\-]*\d{4}(?:\s*(?:x|ext\.?|extension|#)\s*\d+)?/gi;











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





        if (chrome.runtime.lastError) {





          reject(new Error(chrome.runtime.lastError.message));





        } else {





          resolve(response);





        }





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





          if (chrome.runtime.lastError) {





            reject(new Error(chrome.runtime.lastError.message));





          } else {





            resolve(response);





          }





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











function removeLocationContactOverlay() {





  document.getElementById(LOCATION_CONTACT_CONTAINER_ID)?.remove();





}











function renderLocationContactOverlay(locationId, locationData) {





  const existing = document.getElementById(LOCATION_CONTACT_CONTAINER_ID);





  const wasOpen = existing?.dataset?.open === 'true';





  if (existing) existing.remove();











  const { linkItems, emailItems, phoneItems } = buildLocationContactData(locationData, locationId);





  if (!linkItems.length && !emailItems.length && !phoneItems.length) {





    return;





  }











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











  appendSection('Links', linkItems, createLinkEntry);





  appendSection('Emails', emailItems, createEmailEntry);





  appendSection('Phones', phoneItems, createPhoneEntry);











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





    const { data: locationData, fromCache } = await fetchFullLocationRecord(locationId, { refresh: false });





    if (requestId !== locationContactRequestId) return;





    if (!locationData) {





      removeLocationContactOverlay();





      return;





    }











    renderLocationContactOverlay(locationId, locationData);











    if (fromCache) {





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





    if (a.closest(`#${LOCATION_CONTACT_CONTAINER_ID}`)) return;





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





        if (node.parentElement?.closest(`a,script,style,textarea,select,code,pre,svg,#yp-embed-wrapper,#${LOCATION_CONTACT_CONTAINER_ID}`)) {





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











async function injectGoGettaButtons() {





  const host = location.hostname;





  if (!host.includes('gogetta.nyc')) {





    removeServiceTaxonomyBanner();





    removeTaxonomyHeartOverlay();





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











  if (document.body.dataset.gghostRendered === 'true') {





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
const closeLocationStateCache = new Map();
let closeLocationButtonObserver = null;
let closeLocationButtonRequestId = 0;

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

function findLocationBackButtons() {
  const buttons = Array.from(document.querySelectorAll('button.default.font-weight-light'));
  return buttons.filter((btn) => {
    if (!btn || btn.dataset.gghostCloseLocation === '1') return false;
    const text = (btn.textContent || '').replace(/\s+/g, '').toLowerCase();
    return text.includes('back');
  });
}

function pickPreferredBackButton(buttons) {
  if (!buttons.length) return null;
  const visible = buttons.filter((btn) => btn.offsetParent !== null);
  const candidates = visible.length ? visible : buttons;
  const absolute = candidates.find((btn) => window.getComputedStyle(btn).position === 'absolute');
  return absolute || candidates[0];
}

function getExistingCloseLocationButton(locationId) {
  const existing = document.querySelector('button[data-gghost-close-location="1"]');
  if (!existing) return null;
  if (!locationId || existing.dataset.locationId === locationId) return existing;
  existing.remove();
  return null;
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
  if (meta && typeof meta === 'object') {
    note.meta = meta;
  }

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
    ? 'Reopen the location?'
    : 'Close this location?';
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

  target.replaceWith(closeButton);
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

function initializeCloseLocationButton() {
  if (closeLocationButtonObserver) {
    closeLocationButtonObserver.disconnect();
    closeLocationButtonObserver = null;
  }

  const locationId = getTeamLocationHomeUuid();
  if (!locationId) {
    const existing = document.querySelector('button[data-gghost-close-location="1"]');
    if (existing) existing.remove();
    return;
  }

  const closeButton = replaceBackButtonWithClose(locationId);
  if (closeButton) {
    void updateCloseLocationButtonState(locationId, closeButton);
  }

  const observerRoot = document.body || document.documentElement;
  if (!observerRoot) return;
  closeLocationButtonObserver = new MutationObserver(() => {
    const updatedButton = replaceBackButtonWithClose(locationId);
    if (updatedButton) {
      void updateCloseLocationButtonState(locationId, updatedButton);
    }
  });
  closeLocationButtonObserver.observe(observerRoot, { childList: true, subtree: true });
}

initializeCloseLocationButton();

window.addEventListener('locationchange', () => {
  initializeCloseLocationButton();
});
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
const editTimelineCacheInflight = new Map();
let editTimelineApiDisabledFor = null;
let editTimelineApiDisabledLogged = false;

function getEditTimelineApiBase() {
  const override = window.gghost?.EDIT_TIMELINE_API;
  if (typeof override === 'string' && override.trim()) return override.trim();
  return EDIT_TIMELINE_API;
}

function markEditTimelineApiDisabled(apiBase, status) {
  editTimelineApiDisabledFor = apiBase;
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
  if (raw.startsWith('%2F')) {
    try {
      return decodeURIComponent(raw);
    } catch {
      return raw;
    }
  }
  if (raw.startsWith('/team/')) return raw;
  if (raw.startsWith('http://') || raw.startsWith('https://')) {
    try {
      return new URL(raw).pathname;
    } catch {}
  }
  return raw;
}

function getTimelinePageEntry(data, pagePath) {
  if (!data || typeof data !== 'object') return null;
  const pages = data.pages;
  if (!pages || typeof pages !== 'object') return null;
  const encodedKey = encodeURIComponent(pagePath);
  return pages[encodedKey] || pages[pagePath] || null;
}

async function fetchEditTimelineForLocation(locationId, { refresh = false } = {}) {
  if (!locationId) return null;
  const apiBase = getEditTimelineApiBase();
  if (!apiBase) return null;
  if (!refresh && editTimelineApiDisabledFor === apiBase) return null;
  if (refresh && editTimelineApiDisabledFor === apiBase) {
    editTimelineApiDisabledFor = null;
  }
  const cached = readEditTimelineCache(locationId);
  if (cached && !refresh) return { data: cached, fromCache: true };
  if (!refresh && editTimelineCacheInflight.has(locationId)) {
    return editTimelineCacheInflight.get(locationId);
  }

  const url = `${apiBase}?locationId=${encodeURIComponent(locationId)}&scope=location&includeSegments=true`;
  const request = (async () => {
    const res = await fetchViaBackground(url, { cache: 'no-store' });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      if (res.status === 404 || res.status === 410) {
        markEditTimelineApiDisabled(apiBase, res.status);
        return null;
      }
      throw new Error(`Timeline fetch failed: ${res.status} ${text}`);
    }
    const data = await res.json();
    if (data && typeof data === 'object') {
      writeEditTimelineCache(locationId, data);
    }
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
  const locationId = extractLocationIdFromPath(normalized);
  if (!locationId) return null;

  const cached = readEditTimelineCache(locationId);
  if (cached && !refresh) {
    const entry = getTimelinePageEntry(cached, normalized);
    if (entry) {
      return { page: entry, locationId, data: cached, fromCache: true };
    }
  }

  const result = await fetchEditTimelineForLocation(locationId, { refresh });
  const entry = getTimelinePageEntry(result?.data, normalized);
  if (entry) {
    return { ...result, page: entry, locationId };
  }
  return result;
}

function preloadEditTimelineForCurrentLocation() {
  const locationId = extractLocationIdFromPath();
  if (!locationId) return;
  void preloadEditTimelineForLocation(locationId);
}

window.gghost.preloadEditTimelineForLocation = preloadEditTimelineForLocation;
window.gghost.getEditTimelineForPage = getEditTimelineForPage;

preloadEditTimelineForCurrentLocation();
window.addEventListener('locationchange', preloadEditTimelineForCurrentLocation);

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











    console.log('[Edit History] Current user:', currentUser);





    console.log('[Edit History] All data keys:', Object.keys(allData));











    progress.textContent = 'Analyzing your edits...';











    for (const [locationKey, userMap] of Object.entries(allData)) {





      if (!userMap || typeof userMap !== 'object') continue;











      // Check if current user has edits for this location





      const userKey = `${currentUser}-futurenote`;





      console.log('[Edit History] Checking location:', locationKey, 'for users:', Object.keys(userMap));





      if (userMap[userKey] || userMap[currentUser]) {





        const dateMap = userMap[userKey] || userMap[currentUser];





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











        const colorPalette = ['#1b9e77', '#d95f02', '#7570b3', '#e7298a', '#66a61e', '#e6ab02'];





        const userColors = new Map();





        const pickColor = (user) => {





          if (userColors.has(user)) return userColors.get(user);





          const color = colorPalette[userColors.size % colorPalette.length];





          userColors.set(user, color);





          return color;





        };











        const legend = document.createElement('div');





        Object.assign(legend.style, { display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '12px' });





        locationEdits.forEach((edit) => {





          const user = edit.userName || 'Unknown';





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











        const detailsList = document.createElement('div');





        Object.assign(detailsList.style, { display: 'flex', flexDirection: 'column', gap: '10px' });





        locationEdits.forEach((edit) => {





          const row = document.createElement('div');





          Object.assign(row.style, {





            border: '1px solid #e0e0e0',





            borderRadius: '6px',





            padding: '8px',





            background: '#fafafa'





          });











          const headerRow = document.createElement('div');





          Object.assign(headerRow.style, { display: 'flex', alignItems: 'center', gap: '8px' });











          const dot = document.createElement('span');





          Object.assign(dot.style, {





            width: '10px',





            height: '10px',





            borderRadius: '50%',





            background: pickColor(edit.userName || 'Unknown'),





            display: 'inline-block'





          });





          const who = document.createElement('div');





          who.textContent = edit.userName || 'Unknown';





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











          detailsList.appendChild(row);





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





    if (userColors.has(user)) return userColors.get(user);





    const color = palette[userColors.size % palette.length];





    userColors.set(user, color);





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





    const color = getColor(edit.userName || 'Unknown');





    Object.assign(dot.style, {





      width: '8px',





      height: '8px',





      borderRadius: '50%',





      background: color,





      display: 'inline-block'





    });





    const text = document.createElement('span');





    text.textContent = `${edit.userName || 'Unknown'} - ${formatNycDateTime(edit.date)}`;





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





    const color = getColor(edit.userName || 'Unknown');





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





const res = await fetch(`${baseURL}locationNotes/${uuid}.json`);





const data = (await res.json()) || {};





            const notesArray = [];





    let allNotesContent = "";





if (data && typeof data === 'object' && Object.keys(data).length > 0) {





  for (const user in data) {





    if (typeof data[user] === 'object') {





      for (const date in data[user]) {





        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;





        notesArray.push({





          user: user,





          date: date,





          note: data[user][date]  // Don't escape here, will escape when displaying





        });





      }





    }





  }





  notesArray.sort((a, b) => new Date(a.date) - new Date(b.date));





  allNotesContent = notesArray.map(n => `${n.user} (${n.date}): ${n.note}`).join("\n\n");





}





document.getElementById("gg-note-overlay")?.remove();





document.getElementById("gg-note-wrapper")?.remove();





    const noteBox = document.createElement("div");





    noteBox.id = "gg-note-overlay";





    const isFindMode = location.pathname.startsWith('/find/');





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





        let currentUserNoteForToday = "";





        if (data && data[userName] && data[userName][today]) {





            currentUserNoteForToday = data[userName][today];





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











if (notesArray.length > 0) {





  notesArray





    .filter(n => !(n.user === userName && n.date === today && n.note.trim().toLowerCase() !== "revalidated123435355342"))





    .forEach(n => {





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





      const today = new Date().toISOString().slice(0, 10);





      const isDue = n.date <= today;





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





          } catch (err) {





            console.error("❌ Failed to mark done", err);





            alert("Failed to update reminder.");





          }





        });











        container.appendChild(document.createElement("br"));





        container.appendChild(btn);





      }











      readOnlyDiv.appendChild(container);





    });





} else {





  readOnlyDiv.innerHTML = "<i>(No past notes available)</i>";





}











noteWrapper.appendChild(readOnlyDiv);











// After readOnlyDiv is populated:





await addValidationHistoryBadge(readOnlyDiv, uuid);











// ⬇️ Add this call





await injectSiteVisitUI({





  parentEl: readOnlyDiv,





  uuid,                       // same uuid you already computed above





  userName,                   // current user (already resolved earlier)





  NOTE_API,                   // "https://locationnote1-iygwucy2fa-uc.a.run.app"





  today,                       // you already have const today = new Date().toISOString().slice(0, 10);





  done:false





});





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





    const payload = {





      uuid,





      date: today,





      note: note || null,





      userName: getCurrentUsername()





    };





    try {





      const response = await postToNoteAPI(payload);





      await checkResponse(response, note ? "Saving note" : "Deleting note");





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





const userNoteForToday = data?.[userName]?.[today] || null;





const isRevalidatedToday = userNoteForToday?.trim().toLowerCase() === revalidationCode;





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





    const notesArray = [];











    if (data && typeof data === 'object' && Object.keys(data).length > 0) {





      for (const user in data) {





        if (typeof data[user] === 'object') {





          for (const date in data[user]) {





            if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;





            notesArray.push({





              user: user,





              date: date,





              note: data[user][date]  // Don't escape here, will escape when displaying





            });





          }





        }





      }





      notesArray.sort((a, b) => new Date(a.date) - new Date(b.date));





    }











    // Clear and repopulate readOnlyDiv





    readOnlyDiv.innerHTML = '';











    if (notesArray.length > 0) {





      const today = new Date().toISOString().slice(0, 10);





      notesArray





        .filter(n => !(n.user === userName && n.date === today && n.note.trim().toLowerCase() !== "revalidated123435355342"))





        .forEach(n => {





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





          const isDue = n.date <= today;





          const isDone = /\n?\s*Done by .+$/i.test(n.note.trim());











          if (isReminder && isDue && !isDone) {





            const btn = document.createElement("button");





            btn.textContent = "Done?";





            btn.style.marginTop = "5px";











            btn.addEventListener("click", async () => {





              const updatedNote = `${n.note.trim()}\n\nDone by ${userName}`;





              try {





                await postToNoteAPI({





                  uuid,





                  date: n.date,





                  note: updatedNote,





                  userName: "reminder"





                });





                btn.textContent = "Thanks!";





                btn.disabled = true;





                btn.style.backgroundColor = "#ccc";





                // Refresh notes to show the updated "Done by" status





                await refreshReadOnlyNotes();





              } catch (err) {





                console.error("❌ Failed to mark done", err);





                alert("Failed to update reminder.");





              }





            });











            container.appendChild(document.createElement("br"));





            container.appendChild(btn);





          }











          readOnlyDiv.appendChild(container);





        });





    } else {





      readOnlyDiv.innerHTML = "<i>(No past notes available)</i>";





    }











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





      checkMonitorState();





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





      checkMonitorState();





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





              checkMonitorState();





            }





            return res;





          })





          .catch((err) => {





            if (shouldTrack) {





              triggerMonitorOffer();





              checkMonitorState();





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





      checkMonitorState();





    };





    window.addEventListener('unhandledrejection', (event) => {





      handleGlobalFailure(event?.reason);





    });





    window.addEventListener('error', (event) => {





      handleGlobalFailure(event?.error || event?.message);





    });





  }











  state.observer = new MutationObserver(() => {





    checkMonitorState();





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





    checkMonitorState();





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





    checkMonitorState();





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











(async function () {











  // Function to check if current URL is a street-view page and trigger modal





  const checkAndShowStreetView = (url) => {





    // Strict URL matching - must end exactly with /questions/street-view or /questions/street-view/





    const streetViewPattern = /\/team\/location\/([a-f0-9-]+)\/questions\/street-view\/?$/;





    const match = url.match(streetViewPattern);











    if (match && match[1]) {





      const uuid = match[1];





      console.log('[gghost] Triggering Street View for UUID:', uuid, 'from URL:', url);











      try {





        if (chrome && chrome.runtime && chrome.runtime.sendMessage) {





          chrome.runtime.sendMessage({ type: 'showStreetView', uuid }, (response) => {





            if (chrome.runtime.lastError) {





              console.warn('[gghost] Street View message error:', chrome.runtime.lastError.message);





              // Retry once after a short delay





              setTimeout(() => {





                try {





                  chrome.runtime.sendMessage({ type: 'showStreetView', uuid });





                } catch (retryError) {





                  console.error('[gghost] Street View retry failed:', retryError);





                }





              }, 1000);





            } else {





              console.log('[gghost] Street View message sent successfully');





            }





          });





        } else {





          console.warn('Extension context invalidated, cannot send message');





        }





      } catch (error) {





        console.warn('Extension context error:', error.message);





      }





    } else {





      // Only log if the URL contains street-view but doesn't match (for debugging)





      if (url.includes('street-view')) {





        console.log('[gghost] URL contains street-view but doesn\'t match pattern:', url);





      }





    }





  };











  // Check current URL immediately on load





  try {





    checkAndShowStreetView(location.href);





  } catch (error) {





    if (error.message && error.message.includes('Extension context invalidated')) {





      console.warn('[gghost] Extension context invalidated on initial load');





      return;





    }





    console.error('[gghost] Initial street view check error:', error);





  }











  // Also check on URL changes





  onUrlChange((newUrl) => {





    checkAndShowStreetView(newUrl);





  });











  // --- GoGetta custom back/redirect logic ---





  function getGoGettaLocationUuid() {





    const path = location.pathname;





    const match = path.match(/\/team\/location\/([a-f0-9\-]{12,36})/);





    return match ? match[1] : null;





  }











  function isGoGettaLocationPage() {





    return /^\/team\/location\/[a-f0-9\-]{12,36}$/.test(location.pathname);





  }





  function isGoGettaClosureInfoPage() {





    return /^\/team\/location\/[a-f0-9\-]{12,36}\/closureinfo$/.test(location.pathname);





  }





  function isGoGettaIsClosedPage() {





    return /^\/team\/location\/[a-f0-9\-]{12,36}\/isClosed$/.test(location.pathname);





  }











  function getClosureInfoUrl(uuid) {





    return `https://gogetta.nyc/team/location/${uuid}/closureinfo`;





  }





  function getLocationUrl(uuid) {





    return `https://gogetta.nyc/team/location/${uuid}`;





  }











  // Intercept browser back button - DISABLED: Replaced with closure dialog system





  // window.addEventListener('popstate', function(e) {





  //   const uuid = getGoGettaLocationUuid();





  //   if (!uuid) return;





  //   if (isGoGettaLocationPage()) {





  //     // If on /location/:uuid, redirect to /closureinfo





  //     window.location.href = getClosureInfoUrl(uuid);





  //   } else if (isGoGettaClosureInfoPage()) {





  //     // If on /closureinfo, redirect to /location/:uuid





  //     window.location.href = getLocationUrl(uuid);





  //   }





  //   // Don't redirect from /isClosed anymore





  // });











  // Intercept <Back button clicks - DISABLED: Replaced with closure dialog system





  // document.addEventListener('click', function(e) {





  //   const t = e.target;





  //   if (t && t.tagName === 'BUTTON' && t.textContent && t.textContent.replace(/\s/g, '').startsWith('<Back')) {





  //     const uuid = getGoGettaLocationUuid();





  //     if (!uuid) return;





  //     if (isGoGettaLocationPage() || isGoGettaIsClosedPage()) {





  //       window.location.href = getClosureInfoUrl(uuid);





  //       e.preventDefault();





  //     } else if (isGoGettaClosureInfoPage()) {





  //       window.location.href = getLocationUrl(uuid);





  //       e.preventDefault();





  //     }





  //   }





  // }, true);











  await initializeGoGettaEnhancements();





document.addEventListener('visibilitychange', () => {





  if (document.visibilityState === 'visible') {





    if (document.body.dataset.gghostRendered !== 'true') {





      injectGoGettaButtons();





    }





  }





});





  chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {





    if (request.type === "userNameUpdated") {





      console.log("[gghost.js] Received userNameUpdated message:", request.userName);





      const existingOverlay = document.getElementById("gg-note-overlay");





      if (existingOverlay) {





        existingOverlay.remove();





      }





      window.gghostUserName = request.userName; 





      injectGoGettaButtons(); 





      sendResponse({ status: "Username received by content script" });





    }





    





    if (request.type === "GET_COGNITO_TOKENS") {





      console.log("[gghost.js] Popup requested Cognito tokens");





      const tokens = getCognitoTokens();





      console.log("[gghost.js] Sending tokens to popup:", { 





        hasAccessToken: !!tokens.accessToken, 





        hasIdToken: !!tokens.idToken, 





        hasRefreshToken: !!tokens.refreshToken,





        username: tokens.username 





      });





      sendResponse(tokens);





    }





    





    if (request.type === "passwordUpdated") {





      const existingOverlay = document.getElementById("gg-note-overlay");





      if (existingOverlay) {





        existingOverlay.remove();





      }





      window.gghostPassword = request.userPassword; 





      injectGoGettaButtons(); 





      sendResponse({ status: "Pass received by content script" });





    }





    return true;





  });











  // Title case formatting for Input-fluid fields





  // Track manual lowercase positions per input





  const manualLowercasePositions = new WeakMap();





  const previousValues = new WeakMap();





  const inputListeners = new WeakMap(); // Track listeners for cleanup











  // Check if current URL should have capitalization enabled





  function shouldEnableCapitalization() {





    const path = window.location.pathname;











    // Specific paths where capitalization should be enabled





    const capitalizePatterns = [





      /\/questions\/organization-name$/,





      /\/questions\/location-name$/,





      /\/questions\/location-address$/,





      /\/services\/[a-f0-9-]+\/name$/





    ];











    return capitalizePatterns.some(pattern => pattern.test(path));





  }











  function toTitleCase(str, respectManualLowercase = false, input = null) {





    if (!str) return str;











    // Words that should not be capitalized (articles, short prepositions)





    const minorWords = new Set([





      'a', 'an', 'and', 'as', 'at', 'but', 'by', 'for', 'in', 'nor',





      'of', 'on', 'or', 'so', 'the', 'to', 'up', 'yet', 'via'





    ]);











    // Split on spaces and other delimiters while preserving them





    const parts = str.split(/(\s+|\(|\)|\/|-)/);





    const manualPositions = respectManualLowercase && input ? (manualLowercasePositions.get(input) || new Set()) : new Set();











    let currentPos = 0;





    return parts.map((word, index) => {





      const wordStartPos = currentPos;





      currentPos += word.length;











      // Don't modify delimiters





      if (/^(\s+|\(|\)|\/|-)$/.test(word)) return word;











      // Don't modify words that are all uppercase (like acronyms - 2+ consecutive caps)





      if (word.length > 1 && word === word.toUpperCase() && /[A-Z]{2,}/.test(word)) {





        return word;





      }











      // Check if first character was manually lowercased





      if (respectManualLowercase && manualPositions.has(wordStartPos)) {





        return word;





      }











      const lowerWord = word.toLowerCase();











      // Always capitalize first and last word





      if (index === 0 || index === parts.length - 1) {





        return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();





      }











      // Check if it's a minor word





      if (minorWords.has(lowerWord)) {





        return lowerWord;





      }











      // Capitalize the word





      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();





    }).join('');





  }











  // Apply title case formatting to Input-fluid fields





  function setupTitleCaseFormatting() {





    let observer = null;





    let okButtonListener = null;











    // Helper to attach listeners to an input





    function attachListeners(input) {





      if (input.dataset.titleCaseEnabled) return;











      // Only attach if we're on the right URL





      if (!shouldEnableCapitalization()) return;











      input.dataset.titleCaseEnabled = 'true';











      // Initialize tracking





      if (!manualLowercasePositions.has(input)) {





        manualLowercasePositions.set(input, new Set());





      }





      if (!previousValues.has(input)) {





        previousValues.set(input, input.value);





      }











      // Live formatting on input





      const inputHandler = function(e) {





        const currentValue = this.value;





        const prevValue = previousValues.get(this) || '';





        const cursorPos = this.selectionStart;











        // Check if user manually changed a capital letter to lowercase





        if (prevValue.length > 0 && currentValue.length === prevValue.length) {





          for (let i = 0; i < currentValue.length; i++) {





            if (prevValue[i] !== currentValue[i]) {





              // User changed a character





              if (prevValue[i] === prevValue[i].toUpperCase() &&





                  currentValue[i] === prevValue[i].toLowerCase() &&





                  /[a-zA-Z]/.test(currentValue[i])) {





                // User manually lowercased a capital letter - remember this position





                const manualPositions = manualLowercasePositions.get(this);





                manualPositions.add(i);





                manualLowercasePositions.set(this, manualPositions);





              }





            }





          }





        }











        // Live capitalize if word just completed (followed by space/delimiter)





        if (currentValue.length > prevValue.length) {





          const lastChar = currentValue[currentValue.length - 1];











          // Check if we just typed a delimiter (space, parenthesis, slash, dash)





          if (/[\s()\/-]/.test(lastChar)) {





            const formatted = toTitleCase(currentValue, true, this);











            if (currentValue !== formatted) {





              this.value = formatted;





              this.setSelectionRange(cursorPos, cursorPos);





            }





          }





        }











        // Update previous value





        previousValues.set(this, this.value);





      };











      // Format on blur (when user leaves the field)





      const blurHandler = function() {





        if (this.value) {





          const cursorPosition = this.selectionStart;





          const formatted = toTitleCase(this.value, false, null); // Full format on blur, ignore manual positions











          if (this.value !== formatted) {





            this.value = formatted;











            // Clear manual lowercase positions on blur since we're doing a full format





            manualLowercasePositions.set(this, new Set());











            // Trigger input event to notify any listeners





            this.dispatchEvent(new Event('input', { bubbles: true }));





            this.dispatchEvent(new Event('change', { bubbles: true }));





          }





        }





      };











      input.addEventListener('input', inputHandler);





      input.addEventListener('blur', blurHandler);











      // Store listeners for cleanup





      inputListeners.set(input, { inputHandler, blurHandler });





    }











    // Helper to detach listeners from an input





    function detachListeners(input) {





      if (!input.dataset.titleCaseEnabled) return;











      const listeners = inputListeners.get(input);





      if (listeners) {





        input.removeEventListener('input', listeners.inputHandler);





        input.removeEventListener('blur', listeners.blurHandler);





        inputListeners.delete(input);





      }











      delete input.dataset.titleCaseEnabled;





      manualLowercasePositions.delete(input);





      previousValues.delete(input);





    }











    // Process all inputs based on current URL





    function processInputs() {





      const inputs = document.querySelectorAll('input.Input-fluid');











      if (shouldEnableCapitalization()) {





        inputs.forEach(attachListeners);





      } else {





        inputs.forEach(detachListeners);





      }





    }











    // Start mutation observer





    function startObserver() {





      if (observer) return;











      observer = new MutationObserver(() => {





        if (shouldEnableCapitalization()) {





          const inputs = document.querySelectorAll('input.Input-fluid');





          inputs.forEach(attachListeners);





        }





      });











      observer.observe(document.body, {





        childList: true,





        subtree: true





      });





    }











    // Stop mutation observer





    function stopObserver() {





      if (observer) {





        observer.disconnect();





        observer = null;





      }





    }











    // Setup OK button listener





    function setupOkButtonListener() {





      if (okButtonListener) return;











      okButtonListener = function(e) {





        const target = e.target;











        // Check if it's an OK button and we're on the right URL





        if (shouldEnableCapitalization() &&





            target.tagName === 'BUTTON' &&





            target.classList.contains('Button-primary') &&





            target.textContent.trim() === 'OK') {











          // Format all Input-fluid fields before the click proceeds





          const allInputs = document.querySelectorAll('input.Input-fluid');





          allInputs.forEach(input => {





            if (input.value && input.dataset.titleCaseEnabled) {





              const formatted = toTitleCase(input.value, false, null);





              if (input.value !== formatted) {





                input.value = formatted;





                input.dispatchEvent(new Event('input', { bubbles: true }));





                input.dispatchEvent(new Event('change', { bubbles: true }));





              }





            }





          });





        }





      };











      document.addEventListener('click', okButtonListener, true);





    }











    // Initialize based on current URL





    processInputs();





    startObserver();





    setupOkButtonListener();











    // Listen for history changes (SPA navigation)





    const originalPushState = history.pushState;





    const originalReplaceState = history.replaceState;











    history.pushState = function() {





      originalPushState.apply(this, arguments);





      setTimeout(processInputs, 0);





    };











    history.replaceState = function() {





      originalReplaceState.apply(this, arguments);





      setTimeout(processInputs, 0);





    };











    window.addEventListener('popstate', () => {





      setTimeout(processInputs, 0);





    });





  }











  // Initialize title case formatting





  if (document.readyState === 'loading') {





    document.addEventListener('DOMContentLoaded', setupTitleCaseFormatting);





  } else {





    setupTitleCaseFormatting();





  }





})();
