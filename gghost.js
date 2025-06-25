function escapeHtml(str) {
  return str.replace(/[&<>"']/g, match =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[match]
  );
}
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
    <h3 style="margin-top:0;">📅 Set a Reminder</h3>
    <label>Date: <input type="date" id="reminder-date" style="width:100%;margin:5px 0;"></label>
    <label>Note:<textarea id="reminder-note" style="width:100%;height:100px;"></textarea></label>
    <div style="text-align:right;margin-top:10px;">
      <button id="reminder-cancel">Cancel</button>
      <button id="reminder-google" style="margin-left:5px;">📅 Add to Google</button>
      <button id="reminder-download" style="margin-left:5px;">📥 Download .ics</button>
    </div>
  `;

  overlay.appendChild(modal);
  document.body.appendChild(overlay);

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
      body: JSON.stringify({ uuid, userName: "reminder", date, note })
    });

    const { org, location: locName } = JSON.parse(localStorage.getItem("ypLastViewedService") || '{}');
    const summaryText = `${org || 'GoGetta'}${locName ? ' - ' + locName : ''}: ${note.slice(0, 40).replace(/\n/g, ' ')}`.slice(0, 60);
    const fullDescription = `${note.replace(/\n/g, '\\n')}${locName ? `\\nLocation: ${locName}` : ''}${org ? `\\nOrganization: ${org}` : ''}`;

    if (mode === 'google') {
      openGoogleCalendarEvent({
        title: summaryText,
        description: note + (locName ? `\nLocation: ${locName}` : '') + (org ? `\nOrganization: ${org}` : ''),
        date,
        locationUrl: `https://gogetta.nyc/team/location/${uuid}`
      });
    } else if (mode === 'ics') {
      const icsContent = `
BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//GoGetta//EN
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
  const start = date.replace(/-/g, '') + 'T120000Z'; // YYYYMMDDT120000Z
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

  // ⬇ Try to load saved position or use default
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

  const title = document.createElement("span");
  title.textContent = "⋮ YourPeer Details";

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

  // 🖱 Drag behavior with clamping + localStorage save
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


async function injectGoGettaButtons() {
      let offsetX = 0, offsetY = 0, isDragging = false;
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
   localStorage.setItem("ypLastViewedService", JSON.stringify({
        name:  data.Organization?.name,
        location: data.name,
        uuid: uuid
      }));
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
const ypMiniBtn = createButton('YP Mini', async () => {
  try {
    const res = await fetch(`https://w6pkliozjh.execute-api.us-east-1.amazonaws.com/prod/locations/${uuid}`);
    const data = await res.json();
    const slug = data.slug;

    if (slug) {
      ypMiniBtn.style.display = "none"; // 👈 hide button
      createYourPeerEmbedWindow(slug, () => {
        ypMiniBtn.style.display = "block"; // 👈 show when closed
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
//if feature is useful add read and write only to reminders make them objects and only fetch notes from notes key and add each temamembers'name and notes as a response.
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
        const today = new Date().toISOString().slice(0, 10); 
        if (data && data[userName] && data[userName][today]) {
            currentUserNoteForToday = data[userName][today];
        }
const noteWrapper = document.createElement("div");
noteWrapper.id = "gg-note-wrapper";
Object.assign(noteWrapper.style, {
  position: "fixed",
  top: "100px",
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
} else{dragBar.textContent = `⋮ notes`;
}
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
    .filter(n => !(n.user === userName && n.date === today))
    .map(n => {
      const safeUser = n.user === 'doobneek'
        ? `<a href="https://doobneek.org" target="_blank" rel="noopener noreferrer"><strong>doobneek</strong></a>`
        : `<strong>${escapeHtml(n.user)}</strong>`;
      return `<div style="margin-bottom:10px;">${safeUser} (${n.date}):<br>${n.note}</div>`;
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

const editableDiv = document.createElement("div");
editableDiv.id = "editable-note";
editableDiv.contentEditable = isEditable ? "true" : "false";
editableDiv.innerText = currentUserNoteForToday || "";
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
  });
  let saveTimeout = null;
  editableDiv.addEventListener("input", () => {
    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => {
      const note = editableDiv.innerText.trim();
      fetch(NOTE_API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uuid, userName, date: today, note })
      }).then(() => {
        console.log(`[📝 Saved ${userName}'s note for ${today}]`);
      }).catch(err => {
        console.error("[❌ Failed to save note]", err);
      });
    }, 1000);
  });
}
noteWrapper.appendChild(editableDiv);
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
  noteWrapper.style.left = `${e.clientX - offsetX}px`;
  noteWrapper.style.top = `${e.clientY - offsetY}px`;
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
(async function () {
  await initializeGoGettaEnhancements();
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    // Only re-inject if it's not already rendered
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
})();