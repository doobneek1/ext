function escapeHtml(str) {
  return str.replace(/[&<>"']/g, match =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[match]
  );
}

let isInConnectionMode = false;

async function toggleConnectionMode() {
  console.log('Toggling connection mode...');
  isInConnectionMode = !isInConnectionMode;

  const connectionButton = document.getElementById("connection-mode-button");
  
  // Check if the connection button exists
  if (connectionButton) {
    if (isInConnectionMode) {
      console.log('Switching to connection mode.');
      // Switch to connection mode
      await showConnectedLocations();  // Fetch and display connections
      connectionButton.innerText = "Notes";  // Change button text to "Notes"
    } else {
      console.log('Exiting connection mode.');
      // Exit connection mode
      hideConnectedLocations();  // Hide connections
      connectionButton.innerText = "Other Locations";  // Change button text back to "Other Locations"
    }
  } else {
    console.warn('Connection mode button not found!');
  }
}





function toggleGroupVisibility(groupName) {
  const groupContainer = document.getElementById(`${groupName}-group-container`);
  if (groupContainer.style.display === "none") {
    groupContainer.style.display = "block";
  } else {
    groupContainer.style.display = "none";
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

document.addEventListener("DOMContentLoaded", () => {
  addConnectionModeButton();  // Add connection mode button when the page loads
});




async function showConnectedLocations() {
  const fullServiceMatch = location.pathname.match(/^\/team\/location\/([a-f0-9-]+)\/services\/([a-f0-9-]+)(?:\/|$)/);
  const teamMatch = location.pathname.match(/^\/team\/location\/([a-f0-9-]+)\/?/);
  const findMatch = location.pathname.match(/^\/find\/location\/([a-f0-9-]+)\/?/);

  const uuid = (fullServiceMatch || teamMatch || findMatch)?.[1]; // Get the current location UUID
  if (!uuid) return;
  const firebaseURL = "https://doobneek-fe7b7-default-rtdb.firebaseio.com/connections.json";
  const res = await fetch(firebaseURL);  // Fetch the data from the Firebase URL
  const allData = await res.json();  // Parse the response as JSON

  // Handle the data (in your case, the connections)
  const connections = allData || {};  // Fallback to an empty object if no data is found

  const connectionsDiv = document.createElement("div");
  connectionsDiv.id = "connected-locations";
  connectionsDiv.style.marginTop = "10px";
  console.log('Displaying connected locations...');

  // UI for adding a new group
  const addGroupDiv = document.createElement("div");
  addGroupDiv.style.marginBottom = "15px";
  addGroupDiv.style.padding = "10px";
  addGroupDiv.style.border = "1px solid #ccc";
  addGroupDiv.style.borderRadius = "4px";

  const groupNameInput = document.createElement("input");
  groupNameInput.type = "text";
  groupNameInput.placeholder = "New group name";
  groupNameInput.style.marginRight = "10px";
  groupNameInput.style.padding = "5px";
  groupNameInput.id = "new-group-name-input"; // Added ID for potential future use

  const addGroupButton = document.createElement("button");
  addGroupButton.innerText = "Add New Group";
  addGroupButton.style.padding = "5px 10px";
  addGroupButton.addEventListener('click', async () => {
    const newGroupName = groupNameInput.value.trim();
    if (newGroupName) {
      await addNewGroup(newGroupName);
      // Refresh the view to show the new group
      hideConnectedLocations(); // Remove old view
      await showConnectedLocations(); // Re-render view
    } else {
      alert("Please enter a group name.");
    }
  });

  addGroupDiv.appendChild(groupNameInput);
  addGroupDiv.appendChild(addGroupButton);
  connectionsDiv.appendChild(addGroupDiv);

  // Iterate through the connection groups
  for (const [groupName, groupData] of Object.entries(connections)) {
    const groupHeader = document.createElement("div");
    groupHeader.style.cursor = "pointer";
    groupHeader.style.fontWeight = "bold";
    groupHeader.innerText = groupName;
    groupHeader.addEventListener("click", () => toggleGroupVisibility(groupName));

    const groupContainer = document.createElement("div");
    groupContainer.style.display = "none"; // Initially hidden
    groupContainer.id = `${groupName}-group-container`;

    const stored = JSON.parse(localStorage.getItem("ypLastViewedService") || '{}');
    if (stored.uuid === uuid) { 
      orgName = stored.org || "";
      locationName = stored.location || "";
      console.log(`[Notes Header] Used fallback localStorage data: Org='${orgName}', Location='${locationName}' for UUID='${uuid}'`);
    } else {
      let locationName = "";
      try {
        console.log(`[Notes Header] Attempting to fetch details for UUID: ${uuid}`);
        const res = await fetch(`https://w6pkliozjh.execute-api.us-east-1.amazonaws.com/prod/locations/${uuid}`);
        if (!res.ok) {
          throw new Error(`API request failed with status ${res.status}`);
        }
        const data = await res.json();
        orgName = data.Organization?.name || "";
        locationName = data.name || "";

        if (orgName || locationName) {
          // Retrieve existing data from localStorage or initialize as an empty array
          let storedData = JSON.parse(localStorage.getItem("ypLastViewedService")) || [];

          // Create the new entry
          const newEntry = {
            uuid: uuid,
            orgName: orgName,
            locationName: locationName,
            slug: data.slug || "" // Assuming slug is available in the fetched data
          };

          // Check if the entry for the current UUID already exists
          const existingEntryIndex = storedData.findIndex(entry => entry.uuid === uuid);
          if (existingEntryIndex === -1) {
            // If the entry doesn't exist, add the new entry
            storedData.push(newEntry);
          } else {
            // Optionally, update the existing entry if needed
            storedData[existingEntryIndex] = newEntry;
          }

          // Save the updated array back to localStorage
          localStorage.setItem("ypLastViewedService", JSON.stringify(storedData));
          console.log(`[Notes Header] Successfully fetched and stored: Org='${orgName}', Location='${locationName}' for UUID='${uuid}'`);
        } else {
          console.warn(`[Notes Header] API returned data but orgName or locationName is missing for UUID: ${uuid}. Data:`, data);
        }
      } catch (err) {
        console.error(`[Notes Header] 🛑 Failed to fetch details from API for UUID ${uuid}:`, err);
        // Retrieve stored data from localStorage as a fallback
        let storedData = JSON.parse(localStorage.getItem("ypLastViewedService")) || [];

        // Fallback logic when the data is missing or doesn't match the current UUID
        const storedEntry = storedData.find(entry => entry.uuid === uuid);
        if (storedEntry) {
          orgName = storedEntry.orgName || "";
          locationName = storedEntry.locationName || "";
          console.log(`[Notes Header] Used fallback localStorage data: Org='${orgName}', Location='${locationName}' for UUID='${uuid}'`);
        } else {
          console.warn(`[Notes Header] No fallback data found for UUID: ${uuid}`);
        }
      }
    }

    // Display UUIDs in the group
    for (const [connectionStatus, connectedUuid] of Object.entries(groupData)) {
      const locationLink = document.createElement("a");
      locationLink.href = `https://gogetta.nyc/team/location/${connectedUuid}`;
      locationLink.target = "_blank";
      locationLink.innerText = locationName || `Location ${connectedUuid}`;
      locationLink.style.display = "block";

      if (connectionStatus === "true") {
        const disconnectButton = document.createElement("button");
        disconnectButton.innerText = "Disconnect";
        disconnectButton.style.backgroundColor = "red";
        disconnectButton.style.color = "white";
        disconnectButton.addEventListener('click', () => disconnectLocation(uuid, groupName, connectedUuid));
        locationLink.appendChild(disconnectButton);
      } else {
        locationLink.style.color = "red"; // Indicate that the link is disconnected
      }

      groupContainer.appendChild(locationLink);
    }

    // UI for adding a UUID to this group
    const addUuidDiv = document.createElement("div");
    addUuidDiv.style.marginTop = "5px";
    addUuidDiv.style.paddingTop = "5px";
    addUuidDiv.style.borderTop = "1px dashed #eee";

    const uuidInput = document.createElement("input");
    uuidInput.type = "text";
    uuidInput.placeholder = "Enter UUID to add";
    uuidInput.style.marginRight = "5px";
    uuidInput.style.padding = "4px";
    uuidInput.id = `add-uuid-input-${groupName}`; // Unique ID

    const addUuidButton = document.createElement("button");
    addUuidButton.innerText = "Add UUID to Group";
    addUuidButton.style.padding = "4px 8px";
    addUuidButton.addEventListener('click', async () => {
      const newUuid = uuidInput.value.trim();
      if (newUuid) {
        // Validate UUID format (simple check for non-empty, can be enhanced)
        if (newUuid.match(/^[a-f0-9-]+$/i) && newUuid.length > 10) { // Basic UUID-like check
          await addUuidToGroup(groupName, newUuid);
          // Refresh the view
          hideConnectedLocations();
          await showConnectedLocations();
        } else {
          alert("Please enter a valid UUID format.");
        }
      } else {
        alert("Please enter a UUID.");
      }
    });

    addUuidDiv.appendChild(uuidInput);
    addUuidDiv.appendChild(addUuidButton);
    groupContainer.appendChild(addUuidDiv);

    connectionsDiv.appendChild(groupHeader);
    connectionsDiv.appendChild(groupContainer);
  }

  document.body.appendChild(connectionsDiv);
}


function hideConnectedLocations() {
  const connectionsDiv = document.getElementById("connected-locations");
  if (connectionsDiv) {
    console.log('Hiding connected locations...');
    connectionsDiv.remove();
  }
}








// Firebase function to update connection status
async function disconnectLocation(currentUuid, groupName, targetUuid) {
  try {
    const firebaseURL = "https://doobneek-fe7b7-default-rtdb.firebaseio.com/connections.json";
    
    // Fetch the current connections data
    const res = await fetch(firebaseURL);
    const allData = await res.json(); // Parse the response as JSON

    // Get the group data or initialize as an empty object if the group doesn't exist
    const groupData = allData?.[groupName] || {};

    // If the targetUuid doesn't exist, log a warning and exit
    if (!groupData[targetUuid]) {
      console.warn(`No connection found for ${targetUuid} in group ${groupName}`);
      return;
    }

    // Set the connection status to false for the target UUID
    groupData[targetUuid] = false;

    // Update Firebase with the modified group data using PATCH
    const updateResponse = await fetch(firebaseURL, {
      method: 'PATCH', // Use PATCH instead of PUT
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        ...allData, // Retain existing data
        [groupName]: groupData // Update the group with the modified connection status
      })
    });

    // Check for a successful response
    if (!updateResponse.ok) {
      throw new Error(`Failed to update connection status for ${targetUuid}`);
    }

    console.log(`Disconnected ${currentUuid} from ${targetUuid} in group ${groupName}`);

    // Re-render the connected locations after disconnection
    hideConnectedLocations(); // Clear the old view first
    await showConnectedLocations(); // Then show the updated view
  } catch (err) {
    console.error('[Disconnect Error] 🛑 Failed to disconnect location:', err);
  }
}



// Firebase function to add a new group
async function addNewGroup(groupName) {
  try {
    const firebaseURL = "https://doobneek-fe7b7-default-rtdb.firebaseio.com/connections.json";

    // Fetch the existing data from Firebase
    const res = await fetch(firebaseURL);
    const allData = await res.json(); // Parse the response as JSON

    // Add the new group as an empty object
    const updatedData = {
      ...allData, // Retain existing data
      [groupName]: {} // Add the new group as an empty object
    };

    // Update Firebase with the new group using PATCH
    const updateResponse = await fetch(firebaseURL, {
      method: 'PATCH', // Use PATCH instead of PUT
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(updatedData) // Send the updated data with the new group
    });

    if (!updateResponse.ok) {
      throw new Error(`Failed to add new group: ${groupName}`);
    }

    console.log(`New group ${groupName} added to connections.`);
  } catch (err) {
    console.error('[Add New Group Error] 🛑 Failed to add new group:', err);
  }
}



async function addUuidToGroup(groupName, uuid) {
  try {
    const firebaseURL = "https://doobneek-fe7b7-default-rtdb.firebaseio.com/connections.json";

    // Fetch the current connections data
    const res = await fetch(firebaseURL);
    const allData = await res.json(); // Parse the response as JSON

    // Get the current group data or initialize as an empty object
    const groupData = allData?.[groupName] || {};

    // Add the UUID to the group with a default status of `true` (if not already there)
    if (groupData[uuid] !== undefined) {
      console.log(`UUID ${uuid} is already in group ${groupName}, no update needed.`);
      return; // No update needed if the UUID already exists
    }

    groupData[uuid] = true; // Add UUID with the status of true

    // Update Firebase with the modified group data using PATCH
    const updateResponse = await fetch(firebaseURL, {
      method: 'PATCH', // Use PATCH instead of PUT
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        ...allData, // Retain existing data
        [groupName]: groupData // Only update the specific group with the new UUID added
      })
    });

    if (!updateResponse.ok) {
      throw new Error(`Failed to add UUID ${uuid} to group ${groupName}`);
    }

    console.log(`Added UUID ${uuid} to group ${groupName}`);
  } catch (err) {
    console.error('[Add UUID to Group Error] 🛑 Failed to add UUID:', err);
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
  const micButton = document.createElement("button");
  micButton.id = "mic-button";
  micButton.style.marginLeft = "10px";
  micButton.style.padding = "10px";
  micButton.style.background = "#fff";
  micButton.style.border = "2px solid #000";
  micButton.style.borderRadius = "50%";
  micButton.style.cursor = "pointer";
  micButton.innerHTML = "🎤"; // You can replace this with an actual microphone icon if needed

  // Append it next to the textarea
  const reminderNote = document.getElementById("reminder-note");
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
  const micButton = addMicrophoneButton();
  
  micButton.addEventListener('click', () => {
    if (isRecognizing) {
      recognition.stop(); // Stop recording
      micButton.innerHTML = "🎤"; // Change icon back to mic
    } else {
      recognition.start(); // Start recording
      micButton.innerHTML = "🛑"; // Change icon to stop button
    }
  });
}

// Initialize everything when the document is ready
document.addEventListener("DOMContentLoaded", () => {
  initializeSpeechRecognition();
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