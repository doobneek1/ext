function normalizeOrgName(name) {
  return (name || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/gi, '') 
    .trim();
}
// ---- Site Visit helpers ----
async function fetchSiteVisitRecord(uuid) {
  const url = `https://doobneek-fe7b7-default-rtdb.firebaseio.com/locationNotes/siteVisit/${uuid}.json`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`SiteVisit fetch failed: ${r.status}`);
  return await r.json(); // null if not present
}

// Fire-and-forget delete/incinerate on your backend.
// Recommended: POST JSON to a dedicated endpoint; fallback to GET with querystring if needed.
async function incinerateSiteVisitRecord({ uuid, userName, userPassword }) {
  try {
    // Preferred (POST JSON; safer than putting secrets in URL)
    await fetch(`https://doobneek.org/api/sitevisit/delete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uuid, name: userName, pw: userPassword }),
      // You likely don't need credentials; CORS can be configured server-side
    });
  } catch (_) {
    // Fallback: legacy GET (no-cors; you won't read the response)
    try {
      const u = `https://doobneek.org/${encodeURIComponent(uuid)}?name=${encodeURIComponent(userName)}&pw=${encodeURIComponent(userPassword)}&action=delete`;
      await fetch(u, { mode: 'no-cors' });
    } catch (_) { /* swallow */ }
  }
}

// Simple overlay with an iframe to add a site-visit request on doobneek.org
function showSiteVisitEmbed({ uuid, userName, userPassword, onClose = () => {} }) {
  const overlay = document.createElement('div');
  Object.assign(overlay.style, {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 100000
  });
  const modal = document.createElement('div');
  Object.assign(modal.style, {
    position: 'fixed', top: '8%', left: '50%', transform: 'translateX(-50%)',
    width: '860px', height: '70vh', background: '#fff', border: '2px solid #000',
    borderRadius: '8px', overflow: 'hidden', display: 'flex', flexDirection: 'column'
  });

  const bar = document.createElement('div');
  Object.assign(bar.style, { padding: '8px 12px', background: '#eee', borderBottom: '1px solid #ccc', display: 'flex', justifyContent: 'space-between' });
  bar.textContent = 'Add site visit';
  const close = document.createElement('button');
  close.textContent = 'Close';
  close.onclick = () => { overlay.remove(); onClose(); };
  bar.appendChild(close);

  // Current convention (you can swap to your POST/tokenized flow later)
  const src = `https://doobneek.org/${encodeURIComponent(uuid)}?name=${encodeURIComponent(userName)}&pw=${encodeURIComponent(userPassword)}`;

  const iframe = document.createElement('iframe');
  Object.assign(iframe, { src });
  Object.assign(iframe.style, { border: '0', width: '100%', height: '100%' });

  modal.appendChild(bar);
  modal.appendChild(iframe);
  overlay.appendChild(modal);
  document.body.appendChild(overlay);
}

// Injects the Site Visit UI *inside* the read-only notes panel.
async function injectSiteVisitUI({ parentEl /* readOnlyDiv */, uuid, userName, userPassword, NOTE_API, today }) {
  try {
    // Remove prior banner if re-rendered
    parentEl.querySelector('#sitevisit-banner')?.remove();

    const rec = await fetchSiteVisitRecord(uuid);
    const banner = document.createElement('div');
    banner.id = 'sitevisit-banner';
    Object.assign(banner.style, {
      border: '2px solid #FFB300', background: '#FFF8E1', padding: '8px 10px',
      borderRadius: '6px', marginBottom: '10px', fontStyle: 'normal'
    });

    if (rec) {
      // Show "Site visit needed"
      const title = document.createElement('div');
      title.style.fontWeight = '700';
      title.textContent = 'Site visit needed';

      const noteLabel = document.createElement('div');
      noteLabel.style.marginTop = '6px';
      noteLabel.textContent = 'Note for record (optional):';

      const svNote = document.createElement('textarea');
      svNote.style.width = '100%';
      svNote.style.height = '80px';
      svNote.style.marginTop = '4px';
      svNote.value = typeof rec.notes === 'string' ? rec.notes : '';

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

      banner.appendChild(title);
      banner.appendChild(noteLabel);
      banner.appendChild(svNote);
      banner.appendChild(chkWrap);

      // Handle "Done?"
      chk.addEventListener('change', async () => {
        if (!chk.checked) return;
        try {
          // 1) Post a normal note for today
          const finalNote = svNote.value
            ? `[Site Visit] ${svNote.value}`
            : `[Site Visit] Completed`;
          const res = await fetch(NOTE_API, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              uuid, userName, password: userPassword, date: today, note: finalNote
            })
          });
          await checkResponse(res, 'Saving site-visit completion');

          // 2) Ask backend to delete the siteVisit record
          await incinerateSiteVisitRecord({ uuid, userName, userPassword });

          // 3) UI cleanup
          chk.disabled = true;
          svNote.disabled = true;
          chkWrap.textContent = 'Thanks — recorded and cleared.';
          setTimeout(() => banner.remove(), 1200);
        } catch (err) {
          console.error('[SiteVisit] Failed to mark done:', err);
          alert('Failed to record completion.');
          chk.checked = false;
        }
      });
    } else {
      // No record exists: show a button to open the embed where a request can be added
      const row = document.createElement('div');
      row.style.display = 'flex';
      row.style.alignItems = 'center';
      row.style.justifyContent = 'space-between';



      const btn = document.createElement('button');
      btn.textContent = 'Visit this site';
      Object.assign(btn.style, { padding: '6px 10px', border: '1px solid #000', borderRadius: '4px', background: '#fff', cursor: 'pointer' });
      btn.addEventListener('click', () => {
        showSiteVisitEmbed({ uuid, userName, userPassword, onClose: () => {
          // optional: recheck after closing
          injectSiteVisitUI({ parentEl, uuid, userName, userPassword, NOTE_API, today });
        }});
      });

      row.appendChild(btn);
      banner.appendChild(row);
    }

    // Insert at the top of the read-only notes
    parentEl.prepend(banner);
  } catch (e) {
    console.warn('[SiteVisit] Skipping banner due to error:', e);
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

        const today = new Date().toISOString().slice(0, 10); 

async function transferFutureNoteToUUID({ orgKey, sourceUserName, sourceDate, noteText, NOTE_API, userName, userPassword, locationUuid }) {
  if (!locationUuid) {
    alert("Open a specific GoGetta location first.");
    return;
  }
  await fetch(NOTE_API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      uuid: orgKey,
      userName: sourceUserName,
      date: `https://gogetta.nyc/team/location/${sourceDate}`,
      password: userPassword,
      note: null
    })
  }).then(r => checkResponse(r, "Deleting original future/online note"));

  // 2) Write note under real UUID for today, authored by current user
  await fetch(NOTE_API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      uuid: locationUuid,
      userName,
      date: today,
      password: userPassword,
note: `${noteText},${sanitizeOrgNameForKey(decodeURIComponent(sourceDate))},${fromFirebaseKey(sourceUserName)},${decodeURIComponent(orgKey.replace(/-futureNote$/, "").split("_")[1])},` || "(moved from future/online)"

    })
  }).then(r => checkResponse(r, "Transferring note to UUID"));
  editableDiv.innerText=`${noteText},${sanitizeOrgNameForKey(decodeURIComponent(sourceDate))},${fromFirebaseKey(sourceUserName)},${decodeURIComponent(orgKey.replace(/-futureNote$/, "").split("_")[1])},` || "(moved from future/online)"

}
async function openFutureOnlineModal() {
  const NOTE_API = "https://locationnote-iygwucy2fa-uc.a.run.app";
  const userPassword = window.gghostPassword || await getUserPasswordSafely();
  const userName = window.gghostUserName || await getUserNameSafely();

  // if (!userPassword) { alert("Please set your password in the extension popup first."); return; }
  // if (!userName)     { alert("Please set your username in the extension popup first."); return; }

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
  function extractOrgNameFromDateUrl(dateField) {
    try {
      if (typeof dateField !== "string") return "";
      if (!dateField.startsWith("http")) return "";
      const u = new URL(dateField);
      const parts = u.pathname.split("/").filter(Boolean);
      const idx = parts.findIndex(p => p === "location");
      if (idx >= 0 && parts[idx + 1]) {
        return decodeURIComponent(parts[idx + 1]);
      }
      // fallback: last path segment
      return decodeURIComponent(parts[parts.length - 1] || "");
    } catch { return ""; }
  }
  function parseUuidFromUrlOrInput(input) {
    const s = String(input || "").trim();
    const uuidMatch = s.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
    return uuidMatch ? uuidMatch[0] : null;
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

  const addresses = [];
  function renderAddresses() {
    addressList.innerHTML = '';
    addresses.forEach((addr, idx) => {
      const pill = document.createElement('div');
      pill.textContent = addr;
      Object.assign(pill.style, { padding: '4px 8px', border: '1px solid #000', borderRadius: '999px', background:'#fff', display:'inline-flex', alignItems:'center', gap:'8px' });
      const x = document.createElement('span');
      x.textContent = '×';
      Object.assign(x.style, { cursor: 'pointer', fontWeight: 700 });
      x.onclick = () => { addresses.splice(idx,1); renderAddresses(); };
      pill.appendChild(x);
      addressList.appendChild(pill);
    });
  }

  addressAdd.onclick = () => {
    const v = addressInput.value.trim();
    if (!v) return;
    addresses.push(v);
    addressInput.value = '';
    renderAddresses();
  };

  cancelBtn.onclick = () => overlay.remove();

async function saveFutureLead() {
  const orgName   = orgNameEl.value.trim();
  const phone     = getLast10Digits(phoneEl.value.trim());
  const website   = websiteEl.value.trim();
  const email     = emailEl.value.trim();
  const noteText  = noteEl.value.trim();

  // if address input has text but not yet added, push it
  const addrVal = addressInput.value.trim();
  if (addrVal && !addresses.includes(addrVal)) {
    addresses.push(addrVal);
    renderAddresses();
  }

  if (!orgName) { alert("Organization name is required."); return; }
  if (!phone && !website && !email) { alert("Provide at least one of phone, website, or email."); return; }
  if (!validPhone(phone))   { alert("Phone looks invalid."); return; }
  if (!validUrl(website))   { alert("Website must be a valid link."); return; }
  if (!validEmail(email))   { alert("Email looks invalid."); return; }

  const compositeUuid = `${uuidv()}_${addresses.join(' | ')}-futureNote`;
  const userNameForRecord = buildCompositeUuid(website, email, phone);
  const dateField = `https://gogetta.nyc/team/location/${encodeURIComponent(orgName)}`;

  const payload = {
    uuid: compositeUuid,
    userName: userNameForRecord,
    date: dateField,
    password: userPassword,
    note: noteText || "(no note)"
  };

  try {
    const res = await fetch(NOTE_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    await checkResponse(res, "Saving future/online org");
    await loadExisting();
    orgNameEl.value = "";
    phoneEl.value = "";
    websiteEl.value = "";
    emailEl.value = "";
    noteEl.value = "";
    addressInput.value = ""; // clear
    addresses.splice(0, addresses.length);
    renderAddresses();
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
  existingDiv.innerHTML = "Loading…";
  try {
    const firebaseURL = "https://doobneek-fe7b7-default-rtdb.firebaseio.com/locationNotes.json";
    const r = await fetch(firebaseURL);
    if (!r.ok) throw new Error(`Fetch failed: ${r.status}`);
    const all = await r.json() || {};

    const cards = [];

    for (const [topKey, userMap] of Object.entries(all)) {
      if (!userMap || typeof userMap !== "object") continue;

      const entries = [];

      for (const [userKey, dateMap] of Object.entries(userMap)) {
        if (!dateMap || typeof dateMap !== "object") continue;

        const isFuture =
          /-futurenote$/i.test(userKey) ||
          /-futurenote$/i.test(topKey) ||
          looksLikeCompositeKey(topKey) ||
          looksLikeCompositeKey(userKey);

        if (!isFuture) continue;

        for (const [dateKey, noteVal] of Object.entries(dateMap)) {
          const noteText = typeof noteVal === "string" ? noteVal : String(noteVal ?? "");
          entries.push({
            topKey,
            userKey,
            dateKey, // org name
            note: noteText
          });
        }
      }

      if (!entries.length) continue;

      // === Card ===
      const card = document.createElement("div");
      Object.assign(card.style, {
        border: "1px solid #ccc",
        borderRadius: "6px",
        background: "#fff",
        padding: "8px",
        marginBottom: "8px"
      });

      // Title
      const title = document.createElement("div");
      title.style.fontWeight = "700";
      title.textContent = decodeURIComponent(entries[0].dateKey || entries[0].userKey || topKey);
      card.appendChild(title);

      // Meta (phone/email/website/address) — always try to show
      let website = "", email = "", phone = "", address = "";
      try {
        if (looksLikeCompositeKey(entries[0].userKey)) {
          const decoded = decodeCompositeKey(entries[0].userKey) || {};
          website = decoded.website || "";
          email = decoded.email || "";
          phone = decoded.phone || "";
        }
      } catch (err) {
        console.warn("decodeCompositeKey failed:", err);
      }
      try {
        address = decodeURIComponent(
          entries[0].topKey.replace(/-futurenote$/i, "")
            .split("_").slice(1).join(" ")
        );
      } catch (err) {
        address = "";
      }

      const meta = document.createElement("div");
      meta.style.fontSize = "12px";
      meta.style.color = "#555";
      meta.innerHTML = `
        Website: ${escapeHtml(website) || "(none)"}<br>
        Email: ${escapeHtml(email) || "(none)"}<br>
        Phone: ${escapeHtml(phone) || "(none)"}<br>
        Address: ${escapeHtml(address) || "(none)"}
      `;
      card.appendChild(meta);

      // === Entries list ===
      const list = document.createElement("div");
      list.style.marginTop = "6px";

      entries.forEach(entry => {
        const row = document.createElement("div");
        row.style.borderTop = "1px dashed #eee";
        row.style.padding = "6px 0";
        row.innerHTML = `
          <div style="white-space:pre-wrap;margin-top:4px">${escapeHtml(entry.note)}</div>
        `;

        // Action buttons
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
                noteText: entry.note,
                NOTE_API,
                userName,
                userPassword,
                locationUuid: currentUuid
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
              noteText: entry.note,
              NOTE_API,
              userName,
              userPassword,
              locationUuid: targetUuid
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
async function fetchLocationDetails(uuid) {
  try {
    const res = await fetch(`https://w6pkliozjh.execute-api.us-east-1.amazonaws.com/prod/locations/${uuid}`);
    if (!res.ok) throw new Error("Fetch failed");
    const data = await res.json();
return {
  org: data.Organization?.name || "",
  name: data.name || "",
  slug: data.slug || "",
  address: data.address?.street || "",
  city: data.address?.city || "",
  state: data.address?.state || "",
  zip: data.address?.postalCode || "",
  services: Array.isArray(data.Services) ? data.Services.map(s => s.name).filter(Boolean) : [],
  lastValidated: data.last_validated_at || null  
};
  } catch (err) {
    console.warn("Failed to fetch location:", err);
    return {
      org: "",
      name: "",
      slug: "",
      address: "",
      city: "",
      state: "",
      zip: "",
      services: []
    };
  }
}
let isInConnectionMode = false;
async function toggleConnectionMode() {
  console.log("[gghost.js] toggleConnectionMode called. Current isInConnectionMode:", isInConnectionMode); 
  const NOTE_API = "https://locationnote-iygwucy2fa-uc.a.run.app";
  const userPassword =  window.gghostPassword || await getUserPasswordSafely(); 
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
        await showConnectedLocations(NOTE_API, userPassword);
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
      connectionButton.innerText = "Show Other Branches";
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
  const firebaseURL = 'https://doobneek-fe7b7-default-rtdb.firebaseio.com/locationNotes/connections.json';
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
async function showConnectedLocations(NOTE_API, userPassword) {
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
  const firebaseURL = `https://doobneek-fe7b7-default-rtdb.firebaseio.com/locationNotes/connections.json`;
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
const groupListDatalist = document.createElement("datalist");
groupListDatalist.id = "group-list-datalist";
groupNames.forEach(name => {
  const option = document.createElement("option");
  option.value = name;
  groupListDatalist.appendChild(option);
});
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
groupNameInput.addEventListener("input", async () => {
  const currentGroup = groupNameInput.value.trim();
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
      await addNewGroup(currentGroup, groupLinkInput.value, NOTE_API, userPassword);
      hideConnectedLocations();
      await showConnectedLocations(NOTE_API, userPassword);
    };
  } else {
    addGroupButton.innerText = "Create a group";
    groupLinkInput.disabled = false;
    groupLinkInput.value = "";
    addGroupButton.onclick = async () => {
      const newGroupName = groupNameInput.value.trim();
      const newGroupLink = groupLinkInput.value.trim();
      const forbidden = ["doobneek", "gavilan","liz","kiesha", "adam"];
      const isExistingGroup = await doesSanitizedGroupNameExist(newGroupName);
      if (
        !newGroupName || forbidden.includes(newGroupName) ||
        (!newGroupLink.includes("/location/") && !isExistingGroup)
      ) {
        alert("Please enter a valid group name and link.");
        return;
      }
      await addNewGroup(newGroupName, newGroupLink, NOTE_API, userPassword);
      hideConnectedLocations();
      await showConnectedLocations(NOTE_API, userPassword);
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
    disconnectLocation(groupName, userPassword, connectedUuid, NOTE_API)
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
      await addUuidToGroup(groupName, uuid, newConnectedUuid, NOTE_API, userPassword);
      newLinkInput.value = "";
      hideConnectedLocations();
      await showConnectedLocations(NOTE_API, userPassword);
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
async function disconnectLocation(groupName,  userPassword,connectedUuid, NOTE_API) {
  try {
    const payload = {
      uuid:"connections",
      userName: groupName,
date: `https://gogetta.nyc/team/location/${connectedUuid}`,
      password: userPassword,
      note: false
    };
    const response = await fetch(NOTE_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
await checkResponse(response, `Disconnection`);
    hideConnectedLocations();
    await showConnectedLocations(NOTE_API, userPassword);
  } catch (err) {
    console.error('[Disconnect Error]', err);
  }
}
async function addNewGroup(groupNameFromInput, linkUrlFromInput, NOTE_API,userPassword) { 
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
  const locationNotesURL = `https://doobneek-fe7b7-default-rtdb.firebaseio.com/locationNotes/${currentPageUuid}.json`;
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
      fetch(NOTE_API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          uuid: "connections",
          userName: groupNameFromInput,
          password: userPassword,
          date: url,
          note: true
        })
      })
    )
  );
  console.log(`[✅] Group "${groupNameFromInput}" saved with URLs:`, urlsToSave);
} catch (err) {
  console.error("[Group Creation Error]", err);
  alert(`Failed to create group "${groupNameFromInput}". Error: ${err.message}`);
}
}
async function addUuidToGroup(groupName, uuid, newConnectedUuid, NOTE_API, userPassword) {
  try {
    console.log("[🛂 Password used for POST]", userPassword);
    const payload = {
      uuid: "connections",
      userName: groupName,
        password: userPassword,
      date: `https://gogetta.nyc/team/location/${newConnectedUuid}`,  
      note: true
    };
    const response = await fetch(NOTE_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
await checkResponse(response, `Adding UUID ${newConnectedUuid} to group ${groupName}`);
    console.log(`✅ Added UUID ${newConnectedUuid} to group ${groupName}`);
  } catch (err) {
    console.error('[Add UUID Error]', err);
  }
}
document.addEventListener("DOMContentLoaded", () => {
  addConnectionModeButton();
});
function showReminderModal(uuid, NOTE_API, userPassword) {
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
    await fetch(NOTE_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ uuid, userName: "reminder", password: userPassword,date, note })
    });
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
  new MutationObserver(() => {
    const currentUrl = location.href;
    if (currentUrl !== lastUrl) {
      lastUrl = currentUrl;
      callback(currentUrl);
    }
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
function createYourPeerEmbedWindow(slug, onClose = () => {}) {
  if (!slug) return;
  const wrapperId = "yp-embed-wrapper";
  document.getElementById(wrapperId)?.remove();
  const savedPos = JSON.parse(localStorage.getItem("ypMiniPosition") || "{}");
  const defaultTop = 120;
  const defaultLeft = 360;
  const wrapper = document.createElement("div");
  wrapper.id = wrapperId;
  Object.assign(wrapper.style, {
    position: "fixed",
    top: `${savedPos.top || defaultTop}px`,
    left: `${savedPos.left || defaultLeft}px`,
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
const title = document.createElement("button");
title.textContent = "Copy YP Link";
Object.assign(title.style, {
  fontSize: "12px",
  padding: "4px 8px",
  cursor: "pointer",
  backgroundColor: "#f0f0f0",
  border: "1px solid #ccc",
  borderRadius: "4px"
});
title.onclick = () => {
  navigator.clipboard.writeText(`https://yourpeer.nyc/locations/${slug}`)
    .then(() => {
      title.textContent = "Copied!";
      setTimeout(() => { title.textContent = "Copy YP Link"; }, 1200);
    })
    .catch(() => {
      title.textContent = "Failed to copy";
      setTimeout(() => { title.textContent = "Copy YP Link"; }, 1200);
    });
};
  const closeBtn = document.createElement("span");
  closeBtn.innerHTML = "&times;";
  Object.assign(closeBtn.style, {
    cursor: "pointer",
    fontSize: "18px",
    padding: "0 6px"
  });
  closeBtn.onclick = () => {
    wrapper.remove();
    onClose();
  };
  dragBar.appendChild(title);
  dragBar.appendChild(closeBtn);
  wrapper.appendChild(dragBar);
  const iframe = document.createElement("iframe");
  iframe.src = `https://yourpeer.nyc/locations/${slug}`;
  Object.assign(iframe.style, {
    border: "none",
    width: "100%",
    height: "100%"
  });
  wrapper.appendChild(iframe);
  document.body.appendChild(wrapper);
  let isDragging = false, offsetX = 0, offsetY = 0;
  dragBar.addEventListener("mousedown", (e) => {
    isDragging = true;
    offsetX = e.clientX - wrapper.getBoundingClientRect().left;
    offsetY = e.clientY - wrapper.getBoundingClientRect().top;
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
    localStorage.setItem("ypMiniPosition", JSON.stringify({ left: newX, top: newY }));
  });
  document.addEventListener("mouseup", () => {
    isDragging = false;
  });
}
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
async function injectGoGettaButtons() {
if (document.body.dataset.gghostRendered === 'true') return;
document.body.dataset.gghostRendered = 'true';
  document.querySelectorAll('[data-gghost-button]').forEach(btn => btn.remove());
  const existingGoToYpBtn = document.querySelector('[data-go-to-yp]');
  if (existingGoToYpBtn) {
    existingGoToYpBtn.remove();
  }
  const host = location.hostname;
  const path = location.pathname;
  if (host !== 'gogetta.nyc') return;
  const createButton = (text, onClick, offset = 0) => {
    const btn = document.createElement('button');
    btn.textContent = text;
    btn.style.position = 'fixed';
    btn.style.bottom = `${20 + offset}px`; 
    btn.style.left = '20px';
    btn.style.zIndex = '9999';
    btn.style.padding = '10px 16px';
    btn.style.fontSize = '13px';
    btn.style.background = '#fff';
    btn.style.border = '2px solid black';
    btn.style.borderRadius = '4px';
    btn.style.boxShadow = '0 2px 6px rgba(0,0,0,0.15)';
    btn.style.cursor = 'pointer';
    btn.setAttribute('data-gghost-button', 'true'); 
    document.body.appendChild(btn);
    btn.addEventListener('click', onClick);
    return btn;
  };
const fullServiceMatch = path.match(/^\/team\/location\/([a-f0-9-]+)\/services\/([a-f0-9-]+)(?:\/|$)/);
const teamMatch = path.match(/^\/team\/location\/([a-f0-9-]+)\/?/);
const findMatch = path.match(/^\/find\/location\/([a-f0-9-]+)\/?/);
const uuid = (fullServiceMatch || teamMatch || findMatch)?.[1];
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
      const res = await fetch(`https://w6pkliozjh.execute-api.us-east-1.amazonaws.com/prod/locations/${locationId}`);
      const data = await res.json();
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
  const res = await fetch(`https://w6pkliozjh.execute-api.us-east-1.amazonaws.com/prod/locations/${uuid}`);
  const data = await res.json();
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
}, 60); 
const futureBtn = createButton(
  'Add future/online org',
  () => {
    openFutureOnlineModal(); // 2) Then open the modal
  },
  180 // offset so it sits below your other fixed buttons
);


const ypMiniBtn = createButton('YP Mini', async () => {
  try {
    const res = await fetch(`https://w6pkliozjh.execute-api.us-east-1.amazonaws.com/prod/locations/${uuid}`);
    const data = await res.json();
    const slug = data.slug;
    if (slug) {
      ypMiniBtn.style.display = "none"; 
      createYourPeerEmbedWindow(slug, () => {
        ypMiniBtn.style.display = "block"; 
      });
    } else {
      console.warn('[YP Mini] ❌ Slug not found.');
    }
  } catch (err) {
    console.error('[YP Mini] 🛑 Error fetching slug:', err);
  }
}, 120);
if (!document.getElementById("gg-note-overlay")) {
  try {
const userName = window.gghostUserName || await getUserNameSafely();
const userPassword =  window.gghostPassword || await getUserPasswordSafely(); 
    const NOTE_API = "https://locationnote-iygwucy2fa-uc.a.run.app";
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
    const firebaseURL = "https://doobneek-fe7b7-default-rtdb.firebaseio.com/locationNotes.json";
const res = await fetch(firebaseURL);
const allData = await res.json();
const data = allData?.[uuid] || {};
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
          note: escapeHtml(data[user][date])
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
    const res = await fetch(`https://w6pkliozjh.execute-api.us-east-1.amazonaws.com/prod/locations/${currentUuid}`);
    if (!res.ok) {
      throw new Error(`API request failed with status ${res.status}`);
    }
    const data = await res.json();
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
}
if (orgName || locationName) {
  dragBar.textContent = `⋮ ${orgName}${locationName ? ' - ' + locationName : ''}`;
} else {
  dragBar.textContent = `⋮ notes`;
}
const toggleButton = document.createElement("button");
toggleButton.id = "notes-toggle-button"; 
toggleButton.innerText = "Show Other Branches";
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
readOnlyDiv.innerHTML =
notesArray
  .filter(n => !(n.user === userName && n.date === today && n.note.trim().toLowerCase() !== "revalidated123435355342"))
  .map(n => {
    const safeUser = n.user === 'doobneek'
      ? `<a href="https://doobneek.org" target="_blank" rel="noopener noreferrer"><strong>doobneek</strong></a>`
      : `<strong>${escapeHtml(n.user)}</strong>`;
    const isReminder = n.user === "reminder";
    const today = new Date().toISOString().slice(0, 10);
    const isDue = n.date <= today;
const isDone = /\n?\s*Done by .+$/i.test(n.note.trim());
    const noteId = `done-btn-${n.date}-${n.uuid || 'x'}`; 
    const displayNote = n.note.trim().toLowerCase() === "revalidated123435355342"
      ? "Revalidated"
      : escapeHtml(n.note);
    let html = `<div style="margin-bottom:10px;">${safeUser} (${n.date}):<br>${displayNote}`;
    if (isReminder && isDue && !isDone) {
      html += `<br><button id="${noteId}" style="margin-top:5px;">Done?</button>`;
      setTimeout(() => {
        const btn = document.getElementById(noteId);
        if (btn) {
          btn.addEventListener("click", async () => {
            const updatedNote = `${n.note.trim()}\n\nDone by ${userName}`;
            try {
              const response = await fetch(NOTE_API, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  uuid,
                  userName: "reminder",
                  password: userPassword,
                  date: n.date,
                  note: updatedNote
                })
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
        }
      }, 0);
    }
    html += `</div>`;
    return html;
  })
  .join("") || "<i>(No past notes available)</i>";
Object.assign(readOnlyDiv.style, {
  background: "#f9f9f9",
  padding: "10px",
  overflowY: "auto",
  maxHeight: "200px",
  borderBottom: "1px solid #ccc",
  fontSize: "13px",
  fontStyle: "italic"
});
noteWrapper.appendChild(readOnlyDiv);

// ⬇️ Add this call
await injectSiteVisitUI({
  parentEl: readOnlyDiv,
  uuid,                       // same uuid you already computed above
  userName,                   // current user (already resolved earlier)
  userPassword,               // current password (already resolved earlier)
  NOTE_API,                   // "https://locationnote-iygwucy2fa-uc.a.run.app"
  today                       // you already have const today = new Date().toISOString().slice(0, 10);
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
      userName,
      password: userPassword,
      date: today,
      note: note || null  
    };
    try {
      const response = await fetch(NOTE_API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
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

editableDiv.addEventListener("input", toggleRevalidateCheckbox);
toggleRevalidateCheckbox(); // run once at load

// Save when checked
revalidateCheckbox.addEventListener("change", async () => {
    if (revalidateCheckbox.checked) {
        try {
            await fetch(NOTE_API, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    uuid,
                    userName,
                    password: userPassword,
                    date: today,
                    note: revalidationCode
                })
            });
            checkboxWrapper.style.display = "none";
            editableDiv.innerText = "";
            // update read-only notes...
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
    showReminderModal(uuid, NOTE_API, userPassword);
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
  if (path === '/' || path === '/find' || path === '/team') {
    const genericYpBtn = createButton('Go to YP', () => {
      window.location.href = 'https://yourpeer.nyc/locations?sortBy=recentlyUpdated';
    });
    genericYpBtn.setAttribute('data-go-to-yp', 'true');
  }
}
async function initializeGoGettaEnhancements() {
  await injectGoGettaButtons(); 
  onUrlChange(() => {
    injectGoGettaButtons(); 
  });
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
    return true; 
  });
    chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
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
})();