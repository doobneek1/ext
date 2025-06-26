function escapeHtml(str) {
  if (typeof str !== 'string') return '';
  return str.replace(/[&<>"']/g, match =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[match]
  );
}

async function fetchLocationDetails(uuid) {
  try {
    const res = await fetch(`https://w6pkliozjh.execute-api.us-east-1.amazonaws.com/prod/locations/${uuid}`);
    if (!res.ok) throw new Error("Fetch failed");
    const data = await res.json();
    return {
      org: data.Organization?.name || "",
      name: data.name || "",
      slug: data.slug || ""
    };
  } catch (err) {
    console.warn("Failed to fetch location:", err);
    return { org: "", name: "", slug: "" };
  }
}

let isInConnectionMode = false;

async function toggleConnectionMode() {
  const NOTE_API = "https://locationnote-iygwucy2fa-uc.a.run.app";
  isInConnectionMode = !isInConnectionMode;

  const connectionButton = document.getElementById("connection-mode-button");
  const readonlyNotesDiv = document.getElementById("readonly-notes");
  const editableNoteDiv = document.getElementById("editable-note"); // Get editable note div
const liveBtn = Array.from(document.querySelectorAll("button"))
  .find(btn => btn.textContent.includes("Transcribing"));
const aiBtn = Array.from(document.querySelectorAll("button"))
  .find(btn => btn.textContent.includes("Format with AI"));

let connectionsDiv = document.getElementById("connected-locations"); // Use let as it might be re-assigned by showConnectedLocations

  if (connectionButton) {
    if (isInConnectionMode) { // Switching TO connection (branches/groups) mode
      console.log('Switching to connection mode.');
      connectionButton.innerText = "Notes";
      if (readonlyNotesDiv) readonlyNotesDiv.style.display = "none";
      if (editableNoteDiv) editableNoteDiv.style.display = "none"; // Hide editable notes

if (liveBtn) liveBtn.style.display = "none";
if (aiBtn) aiBtn.style.display = "none";

      if (connectionsDiv) {
        // If connectionsDiv exists, ensure it's in the noteWrapper and visible
        const noteWrapper = document.getElementById('gg-note-wrapper');
        if (noteWrapper && connectionsDiv.parentNode !== noteWrapper) {
            noteWrapper.appendChild(connectionsDiv); // Ensure it's correctly parented
        }
        connectionsDiv.style.display = "block";
      } else {
        // If connectionsDiv does not exist (e.g., removed by a refresh action or first time)
        // showConnectedLocations will create it and append it to gg-note-wrapper
        await showConnectedLocations(NOTE_API);
        // connectionsDiv = document.getElementById("connected-locations"); // Re-fetch in case it was created
      }
    } else { // Exiting connection mode, switching back TO notes view
      console.log('Exiting connection mode.');
      connectionButton.innerText = "Show Other Branches";
      if (readonlyNotesDiv) readonlyNotesDiv.style.display = "block";
      if (editableNoteDiv) editableNoteDiv.style.display = "block"; // Show editable notes
if (liveBtn) liveBtn.style.display = "inline-block";
if (aiBtn) aiBtn.style.display = "inline-block";

      if (connectionsDiv) {
        connectionsDiv.style.display = "none"; // Just hide connections view
      }
    }
  } else {
    console.warn('Connection mode button not found!');
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
  if (content.style.display === "none" || content.style.display === "") { // Check for "" as it might be the initial state if not explicitly set
    content.style.display = "block";
    if (header) header.innerText = `▼ ${groupName}`;
    console.log(`[toggleGroupVisibility] Group ${groupName} expanded.`);
  } else {
    content.style.display = "none";
    if (header) header.innerText = `▶ ${groupName}`;
    console.log(`[toggleGroupVisibility] Group ${groupName} collapsed.`);
  }
}





// Add the connection mode button
async function addConnectionModeButton() {
  const connectionButton = document.createElement("button");
  connectionButton.id = "connection-mode-button";
  connectionButton.innerText = "Other Locations";  // Default text
  connectionButton.style.position = "fixed";
  connectionButton.style.bottom = "20px";
  connectionButton.style.left = "20px";
  connectionButton.style.padding = "10px 16px";
  connectionButton.style.zIndex = 9999;
  connectionButton.addEventListener('click', toggleConnectionMode);

  document.body.appendChild(connectionButton);
}






async function showConnectedLocations(NOTE_API) {
  const fullServiceMatch = location.pathname.match(/^\/team\/location\/([a-f0-9-]+)\/services\/([a-f0-9-]+)(?:\/|$)/);
  const teamMatch = location.pathname.match(/^\/team\/location\/([a-f0-9-]+)\/?/);
  const findMatch = location.pathname.match(/^\/find\/location\/([a-f0-9-]+)\/?/);

  const uuid = (fullServiceMatch || teamMatch || findMatch)?.[1];
  if (!uuid) return;

  // Fetch current page's organization details
  const currentPageLocationDetails = await fetchLocationDetails(uuid);
  const currentPageOrgName = currentPageLocationDetails.org;

  const firebaseURL = `https://doobneek-fe7b7-default-rtdb.firebaseio.com/locationNotes/${uuid}.json`;
  const res = await fetch(firebaseURL);
  const allData = await res.json();
  const connections = allData || {};

  const connectionsDiv = document.createElement("div");
  connectionsDiv.id = "connected-locations";
  connectionsDiv.style.marginTop = "10px";

  const addGroupDiv = document.createElement("div");
  addGroupDiv.style.marginBottom = "15px";
  addGroupDiv.style.padding = "10px";
  addGroupDiv.style.border = "1px solid #ccc";
  addGroupDiv.style.borderRadius = "4px";

  const groupNameInput = document.createElement("input");
  groupNameInput.type = "text";
  groupNameInput.placeholder = "New group name";
  groupNameInput.style.width = "calc(50% - 15px)";
  groupNameInput.style.marginRight = "10px";
  groupNameInput.style.padding = "5px";

  const groupLinkInput = document.createElement("input");
  groupLinkInput.type = "url";
  groupLinkInput.placeholder = "New group link (GoGetta URL)";
  groupLinkInput.style.width = "calc(50% - 15px)";
  groupLinkInput.style.marginRight = "10px";
  groupLinkInput.style.padding = "5px";

  const addGroupButton = document.createElement("button");
  addGroupButton.innerText = "Add New Group";
  addGroupButton.style.padding = "5px 10px";
  addGroupButton.addEventListener("click", async () => {
    const newGroupName = groupNameInput.value.trim();
    const newGroupLink = groupLinkInput.value.trim();
    const forbidden = ["doobneek", "Gavilan"];

    if (!newGroupName || forbidden.includes(newGroupName) || !newGroupLink.includes("/location/")) {
      alert("Please enter a valid group name and link.");
      return;
    }

    await addNewGroup(newGroupName, newGroupLink, NOTE_API);
    hideConnectedLocations();
    await showConnectedLocations(NOTE_API);
  });

  addGroupDiv.appendChild(groupNameInput);
  addGroupDiv.appendChild(groupLinkInput);
  addGroupDiv.appendChild(addGroupButton);
  connectionsDiv.appendChild(addGroupDiv);

  for (const [groupName, entry] of Object.entries(connections)) {
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

      const { org: connectedOrgName, name: connectedLocName } = await fetchLocationDetails(connectedUuid);
      let linkText = "";
      if (connectedLocName) {
        if (currentPageOrgName && connectedOrgName && currentPageOrgName !== connectedOrgName) {
          linkText = `${connectedOrgName} - ${connectedLocName}`;
        } else {
          linkText = connectedLocName;
        }
      } else {
        linkText = `Location ${connectedUuid}`;
      }

      const locationLink = document.createElement("a");
      locationLink.href = `https://gogetta.nyc/team/location/${connectedUuid}`;
      locationLink.target = "_blank";
      locationLink.innerText = linkText;
      locationLink.style.display = "inline-block";
      locationLink.style.marginRight = "10px";

      const disconnectButton = document.createElement("button");
      disconnectButton.innerText = "Disconnect";
      disconnectButton.style.backgroundColor = "red";
      disconnectButton.style.color = "white";
      disconnectButton.style.padding = "2px 6px";
      disconnectButton.addEventListener("click", () =>
        disconnectLocation(groupName, uuid, connectedUuid, NOTE_API)
      );

      const locationWrapper = document.createElement("div");
      locationWrapper.style.marginBottom = "8px";
      locationWrapper.appendChild(locationLink);
      locationWrapper.appendChild(disconnectButton);

      groupContent.appendChild(locationWrapper);
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
      if (!newLink.includes("/location/")) {
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

      if (!newConnectedUuid || !/^[a-f0-9-]{12,}$/.test(newConnectedUuid)) {
        alert("Could not extract a valid UUID from the link.");
        return;
      }

      if (newConnectedUuid === uuid) {
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
    groupContent.appendChild(addLinkToGroupDiv);

    groupContainer.appendChild(groupContent);
    connectionsDiv.appendChild(groupContainer);
  }

  const noteWrapper = document.getElementById("gg-note-wrapper");
  if (noteWrapper) {
    noteWrapper.appendChild(connectionsDiv);
  } else {
    console.warn("[showConnectedLocations] gg-note-wrapper not found. Appending connectionsDiv to body as fallback.");
    document.body.appendChild(connectionsDiv);
  }
}


function hideConnectedLocations() {
  const connectionsDiv = document.getElementById("connected-locations");
  if (connectionsDiv) {
    console.log('Hiding connected locations...');
    connectionsDiv.remove();
  }
}








async function disconnectLocation(groupName, uuid, connectedUuid, NOTE_API) {
  try {
    const payload = {
      uuid,
      userName: groupName,
date: `https://gogetta.nyc/team/location/${connectedUuid}`,
      note: false
    };

    const response = await fetch(NOTE_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Failed to disconnect: ${errText}`);
    }

    hideConnectedLocations();
    await showConnectedLocations(NOTE_API);
  } catch (err) {
    console.error('[Disconnect Error]', err);
  }
}


async function addNewGroup(groupNameFromInput, linkUrlFromInput, NOTE_API) { // Updated signature
  const path = location.pathname;

  const fullServiceMatch = path.match(/^\/team\/location\/([a-f0-9-]+)\/services\/([a-f0-9-]+)(?:\/|$)/);
  const teamMatch = path.match(/^\/team\/location\/([a-f0-9-]+)\/?/);
  const findMatch = path.match(/^\/find\/location\/([a-f0-9-]+)\/?/);
  const currentPageUuid = (fullServiceMatch || teamMatch || findMatch)?.[1]; // UUID of the current page

  if (!currentPageUuid) {
    alert("Could not determine the current location's UUID. Cannot add group.");
    return;
  }

  // Validations for groupNameFromInput and linkUrlFromInput are expected to be done by the caller,
  // but we can keep some crucial ones here as a safeguard.

  if (!groupNameFromInput || groupNameFromInput.length < 2) {
    alert("Group name is invalid (must be at least 2 characters).");
    return;
  }
  // Forbidden names check is also done by caller.

  if (!linkUrlFromInput || !linkUrlFromInput.includes("/location/")) {
    alert("The provided link does not appear to be a valid GoGetta location link.");
    return;
  }
  
  const uuidMatchInProvidedLink = linkUrlFromInput.match(/\/(?:team|find)\/location\/([a-f0-9-]{12,})/i);
  const connectedUuidViaLink = uuidMatchInProvidedLink?.[1];

  if (!connectedUuidViaLink) {
    alert("Could not extract a UUID from the provided link.");
    return;
  }

  if (connectedUuidViaLink === currentPageUuid) {
    alert("You cannot link a location to itself within a group.");
    return;
  }

  // Check if the group name already exists for *this specific location's connections*
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
  
  // Confirmation (optional, could be removed if inline inputs are clear enough)
  const confirmMsg = `Create group "${groupNameFromInput}" and add the link: ${linkUrlFromInput}?`;
  if (!confirm(confirmMsg)) {
    console.log("[addNewGroup] User cancelled group creation.");
    return;
  }

  try {
    const response = await fetch(NOTE_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        uuid: currentPageUuid,      // UUID of the current page/location where the group is being added
        userName: groupNameFromInput, // This acts as the key for the group
        date: linkUrlFromInput,     // The URL to be stored under this new group
        note: true                // Using "true" (string) as this is what addUuidToGroup uses. 
                                    // The original addNewGroup used boolean `true`.
                                    // Let's be consistent with addUuidToGroup for now.
                                    // If the API strictly needs boolean, this might need adjustment.
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Server error: ${response.status} - ${errText}`);
    }

    console.log(`✅ Group "${groupNameFromInput}" created with link ${linkUrlFromInput}.`);
    alert(`Group "${groupNameFromInput}" created successfully!`);

    // The calling function (`showConnectedLocations` button handler) will call:
    // hideConnectedLocations();
    // await showConnectedLocations(NOTE_API);
    // So, no need to duplicate that here.

  } catch (err) {
    console.error("[Group Creation Error]", err);
    alert(`Failed to create group "${groupNameFromInput}". Error: ${err.message}`);
  }
}


async function addUuidToGroup(groupName, uuid, connectedUuid, NOTE_API) {
  try {
    const payload = {
      uuid,
      userName: groupName,
      date: `/team/location/${connectedUuid}`,  // Storing a canonical path
      note: true
    };

    const response = await fetch(NOTE_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (!response.ok) throw new Error(`Failed to add UUID ${connectedUuid} to group ${groupName}`);
    console.log(`✅ Added UUID ${connectedUuid} to group ${groupName}`);
  } catch (err) {
    console.error('[Add UUID Error]', err);
  }
}


// Call this function when the page loads
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
document.addEventListener("DOMContentLoaded", function() {
  // Check if the specific element exists
  const signInHeader = document.querySelector('.sign-in-header');

  // If the element is found, hide the notes section
  if (signInHeader) {
    const noteOverlay = document.getElementById('gg-note-overlay');
    const noteWrapper = document.getElementById('gg-note-wrapper');

    if (noteOverlay) {
      noteOverlay.style.display = 'none';  // Hides the note overlay
    }

    if (noteWrapper) {
      noteWrapper.style.display = 'none';  // Hides the note wrapper
    }
  }
});
function addMicrophoneButton() {
  const reminderNote = document.getElementById("reminder-note");
  if (!reminderNote) {
    console.warn("🎤 reminder-note element not found.");
    return null;  // Return null to indicate it didn't attach
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
  // Check if the browser supports SpeechRecognition
  if (!('webkitSpeechRecognition' in window)) {
    alert("Speech recognition is not supported by this browser.");
    return;
  }

  recognition = new webkitSpeechRecognition(); // For Chrome, use 'webkitSpeechRecognition'
  recognition.continuous = true; // Keep listening even after pause
  recognition.interimResults = true; // Show results while speaking
  recognition.lang = "en-US"; // You can change the language here
  recognition.maxAlternatives = 1; // Max alternatives to choose from

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
    reminderNote.value = transcript; // Update the textarea with the transcript
  };
}

function attachMicButtonHandler() {
  const micButton = addMicrophoneButton(); // This function already ensures reminder-note exists
  if (!micButton) {
    console.warn("Mic button could not be added to the reminder modal.");
    return;
  }

  // Ensure recognition is initialized. If not, this handler shouldn't have been called
  // or initializeSpeechRecognition should be called first.
  // We rely on the DOMContentLoaded listener to call initializeSpeechRecognition then attachMicButtonHandler.
  if (!recognition) {
    console.warn("Speech recognition not initialized. Mic button will not work.");
    // Optionally, try to initialize it here if it's robust enough
    // initializeSpeechRecognition();
    // if (!recognition) return; // If still not initialized, then exit.
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
      micButton.innerHTML = "🎤"; // Reset button text/icon
      // isRecognizing will be set to false by recognition.onend
    } else {
      // Configure onresult specifically for the reminder note
      recognition.onresult = (event) => {
        let transcript = "";
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            transcript += event.results[i][0].transcript;
          }
        }
        // Append to existing content, or set if empty
        reminderNoteTextarea.value += (reminderNoteTextarea.value.length > 0 ? " " : "") + transcript;
      };
      
      recognition.onstart = () => {
        isRecognizing = true;
        micButton.innerHTML = "🛑"; // Change button to stop icon/text
        console.log("Reminder speech recognition started.");
      };

      recognition.onend = () => {
        isRecognizing = false;
        micButton.innerHTML = "🎤"; // Reset button text/icon
        console.log("Reminder speech recognition ended.");
         // Important: Reset onstart and onend to their defaults or clear them
         // if they were specifically set for this interaction, to avoid conflicts
         // with the global note's speech recognition if it uses the same `recognition` instance.
         // However, the current code seems to re-assign onresult for the global note when it starts.
      };
      
      recognition.onerror = (event) => {
        console.error("Reminder speech recognition error:", event.error);
        // Ensure isRecognizing is reset if an error occurs that stops recognition
        if(isRecognizing) {
            isRecognizing = false;
            micButton.innerHTML = "🎤";
        }
      };

      try {
        recognition.start();
      } catch (e) {
        console.error("Error starting recognition:", e);
        // Potentially show an alert to the user or update UI
        alert("Could not start microphone. Please check permissions and try again.");
      }
    }
  });
}


// Initialize everything when the document is ready
document.addEventListener("DOMContentLoaded", () => {
  initializeSpeechRecognition(); // Ensures `recognition` object is created
  // attachMicButtonHandler is called when the reminder modal is shown,
  // which is a more appropriate place if addMicrophoneButton is also called then.
  // However, the current structure calls addMicrophoneButton from attachMicButtonHandler.
  // Let's keep the original flow for now, assuming addMicrophoneButton is robust.
  attachMicButtonHandler();
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

  // Retrieve the existing data from localStorage (or initialize an empty array if not present)
  let storedData = JSON.parse(localStorage.getItem("ypLastViewedService")) || [];

  // Create the new entry
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
  // Check if the entry for the current UUID already exists
  const existingEntryIndex = storedData.findIndex(entry => entry.uuid === uuid);
  if (existingEntryIndex === -1) {
    // If the entry doesn't exist, add the new entry
    storedData.push(newEntry);
  } else {
    // If the entry exists, update it
    storedData[existingEntryIndex] = newEntry;
  }

  // Save the updated array back to localStorage
  localStorage.setItem("ypLastViewedService", JSON.stringify(storedData));
  console.log(`[YPButton] ✅ Successfully stored: ${data.Organization?.name} - ${data.name} for UUID: ${uuid}`);

  // If slug is available, redirect to the location's page on YourPeer
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
        // ✅ Skip if not a valid YYYY-MM-DD
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
} else {
  dragBar.textContent = `⋮ notes`;
}

// Create the "Show Other Branches" button
const toggleButton = document.createElement("button");
toggleButton.id = "connection-mode-button"; // Assign the correct ID
toggleButton.innerText = "Show Other Branches";
toggleButton.style.marginLeft = "10px";
toggleButton.style.fontSize = "14px";
toggleButton.style.padding = "5px 10px";
toggleButton.style.border = "2px solid #000";
toggleButton.style.borderRadius = "4px";
toggleButton.style.cursor = "pointer";
toggleButton.addEventListener("click", toggleConnectionMode);

// Append the toggle button to dragBar
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
const noteActionWrapper = document.createElement("div");
noteActionWrapper.style.padding = "10px";
noteActionWrapper.style.borderTop = "1px dashed #ccc";
noteActionWrapper.style.display = "flex";
noteActionWrapper.style.justifyContent = "space-between";

// 🎙 Live Transcript Button
const liveTranscribeBtn = document.createElement("button");
liveTranscribeBtn.textContent = "🎤 Start Transcribing";
liveTranscribeBtn.style.padding = "6px 12px";
liveTranscribeBtn.style.flex = "1";
liveTranscribeBtn.style.marginRight = "5px";

// 🧠 AI Format Button
const aiFormatBtn = document.createElement("button");
aiFormatBtn.textContent = "🧠 Format with AI";
aiFormatBtn.style.padding = "6px 12px";
aiFormatBtn.style.flex = "1";

// Add to DOM
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
  aiFormatBtn.textContent = "🧠 Formatting...";

  try {
    const response = await fetch("https://convertnotetostructuredinfo-iygwucy2fa-uc.a.run.app", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ noteText: rawNote })
    });

    const data = await response.json();
    if (data.structuredInfo) {
      editableDiv.innerText = data.structuredInfo;
    } else {
      throw new Error(data.error || "No structured info returned");
    }
  } catch (err) {
    alert("Failed to format note with AI:\n" + err.message);
    console.error("[AI Format Error]", err);
  } finally {
    aiFormatBtn.disabled = false;
    aiFormatBtn.textContent = "🧠 Format with AI";
  }
});
liveTranscribeBtn.addEventListener("click", () => {
  if (!recognition) return;

  if (isRecognizing) {
    recognition.stop();
    liveTranscribeBtn.textContent = "🎤 Start Transcribing";
  } else {
    recognition.onresult = (event) => {
      let transcript = "";
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        transcript += event.results[i][0].transcript;
      }
      editableDiv.innerText += transcript + " ";
    };
    recognition.start();
    liveTranscribeBtn.textContent = "🛑 Stop Transcribing";
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