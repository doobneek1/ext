// function onUrlChange(callback) {
//   let lastUrl = location.href;
//   new MutationObserver(() => {
//     const currentUrl = location.href;
//     if (currentUrl !== lastUrl) {
//       lastUrl = currentUrl;
//       callback(currentUrl);
//     }
//   }).observe(document, { subtree: true, childList: true });
//   const pushState = history.pushState;
//   history.pushState = function () {
//     pushState.apply(this, arguments);
//     window.dispatchEvent(new Event('pushstate'));
//     window.dispatchEvent(new Event('locationchange'));
//   };
//   const replaceState = history.replaceState;
//   history.replaceState = function () {
//     replaceState.apply(this, arguments);
//     window.dispatchEvent(new Event('replacestate'));
//     window.dispatchEvent(new Event('locationchange'));
//   };
//   window.addEventListener('popstate', () => {
//     window.dispatchEvent(new Event('locationchange'));
//   });
// }
// function findServiceName(obj, serviceId) {
//   let foundName = null;
//   function recurse(item) {
//     if (!item || typeof item !== 'object') return;
//     if (Array.isArray(item)) {
//       for (const subItem of item) {
//         if (foundName) return;
//         recurse(subItem);
//       }
//     } else {
//       if (
//         item.id === serviceId &&
//         typeof item.name === 'string' &&
//         item.name.trim() !== ''
//       ) {
//         foundName = item.name.trim();
//         return;
//       }
//       for (const key in item) {
//         if (foundName) return;
//         recurse(item[key]);
//       }
//     }
//   }
//   recurse(obj);
//   return foundName;
// }
// async function injectGoGettaButtons() {
//   document.querySelectorAll('[data-gghost-button]').forEach(btn => btn.remove());
//   const existingGoToYpBtn = document.querySelector('[data-go-to-yp]');
//   if (existingGoToYpBtn) {
//     existingGoToYpBtn.remove();
//   }
//   const host = location.hostname;
//   const path = location.pathname;
//   if (host !== 'gogetta.nyc') return;
//   const createButton = (text, onClick, offset = 0) => {
//     const btn = document.createElement('button');
//     btn.textContent = text;
//     btn.style.position = 'fixed';
//     btn.style.bottom = `${20 + offset}px`; 
//     btn.style.left = '20px';
//     btn.style.zIndex = '9999';
//     btn.style.padding = '10px 16px';
//     btn.style.fontSize = '13px';
//     btn.style.background = '#fff';
//     btn.style.border = '2px solid black';
//     btn.style.borderRadius = '4px';
//     btn.style.boxShadow = '0 2px 6px rgba(0,0,0,0.15)';
//     btn.style.cursor = 'pointer';
//     btn.setAttribute('data-gghost-button', 'true'); 
//     document.body.appendChild(btn);
//     btn.addEventListener('click', onClick);
//     return btn;
//   };
// const fullServiceMatch = path.match(/^\/team\/location\/([a-f0-9-]+)\/services\/([a-f0-9-]+)(?:\/|$)/);
// const teamMatch = path.match(/^\/team\/location\/([a-f0-9-]+)\/?/);
// const findMatch = path.match(/^\/find\/location\/([a-f0-9-]+)\/?/);

// const uuid = (fullServiceMatch || teamMatch || findMatch)?.[1];

//   if (uuid) {
//     const currentMode = teamMatch ? 'edit' : 'view';
//     const targetUrl = currentMode === 'edit'
//       ? `https://gogetta.nyc/find/location/${uuid}`
//       : `https://gogetta.nyc/team/location/${uuid}`;
//     createButton(
//       currentMode === 'edit' ? 'Switch to Frontend Mode' : 'Switch to Edit Mode',
//       () => {
//         if (currentMode === 'edit') {
//           sessionStorage.setItem('arrivedViaFrontendRedirect', 'true');
//         } else if (sessionStorage.getItem('arrivedViaFrontendRedirect') === 'true') {
//           sessionStorage.removeItem('arrivedViaFrontendRedirect');
//           history.back();
//           return;
//         }
//         window.location.href = targetUrl;
//       }, 
//       0 
//     );
//   createButton('Show on YP', async () => {
//   console.log(`[YPButton] 🔎 Attempting to fetch slug for UUID (Show on YP): ${uuid}`);
//   const path = location.pathname;
//   const fullServiceMatch = path.match(/^\/team\/location\/([a-f0-9-]+)\/services\/([a-f0-9-]+)(?:\/|$)/);
//   if (fullServiceMatch) {
//     const locationId = fullServiceMatch[1];
//     const serviceId = fullServiceMatch[2];
//     try {
//       const res = await fetch(`https://w6pkliozjh.execute-api.us-east-1.amazonaws.com/prod/locations/${locationId}`);
//       const data = await res.json();
//       const slug = data.slug;
//       const serviceName = findServiceName(data, serviceId);
//       if (!slug || !serviceName) {
//         console.warn("[YPButton] ❌ Missing slug or service name for service page. Will not redirect.");
//         return;
//       }
//       const forbiddenChars = /[(){}\[\]"'“”‘’—–]/;
//       if (forbiddenChars.test(serviceName)) {
//         console.warn("[YPButton] 🚫 Forbidden characters in service name. Will not redirect.");
//         return;
//       }
//       sessionStorage.setItem('ypScrollTarget', serviceName);
//       const safeServiceName = serviceName
//         .trim()
//         .replace(/\s+/g, '-')
//         .replace(/[^\w\-+]/g, '')
//         .replace(/-+/g, '-')
//         .replace(/^-|-$/g, '');
//       const serviceHash = `#${safeServiceName}`;
//       const finalUrl = `https://yourpeer.nyc/locations/${slug}${serviceHash}`;
//       console.log(`[YPButton] ✅ Redirecting to YP service (from service page): ${finalUrl}`);
//       window.location.href = finalUrl;
//     } catch (err) {
//       console.error("[YPButton] 🛑 Error fetching location/service data for service page:", err);
//       return;
//     }
//   } else {
//     try {
//       const res = await fetch(`https://w6pkliozjh.execute-api.us-east-1.amazonaws.com/prod/locations/${uuid}`);
//       const data = await res.json();
//       const slug = data.slug;
//       if (slug) {
//         const ypUrl = `https://yourpeer.nyc/locations/${slug}`;
//         console.log(`[YPButton] ✅ Redirecting to YourPeer (location level): ${ypUrl}`);
//         window.location.href = ypUrl;
//       } else {
//         console.warn('[YPButton] ❌ Slug not found for location-level redirect.');
//       }
//     } catch (err) {
//       console.error('[YPButton] 🛑 Error fetching slug for location-level redirect:', err);
//     }
//   }
// }, 60); 
// // 🔹 Create editable note overlay for GoGetta (prevent duplicates)
// if (!document.getElementById("gg-note-overlay")) {
//   try {
//     const NOTE_API = "https://locationnote-iygwucy2fa-uc.a.run.app";

//     const res = await fetch(`${NOTE_API}?uuid=${uuid}`);
//     const data = await res.json();
//     const noteText = typeof data.note === "string" ? data.note.trim() : "";

//     const noteBox = document.createElement("div");
//     noteBox.id = "gg-note-overlay";
//     const isFindMode = location.pathname.startsWith('/find/');
// noteBox.contentEditable = isFindMode ? "false" : "true";

//     noteBox.style.pointerEvents = 'auto';
//     noteBox.addEventListener("click", () => {
//   noteBox.focus();
// });

//     noteBox.style.position = 'fixed';
// noteBox.style.zIndex = 999999; // boost to avoid being hidden behind anything
// noteBox.style.pointerEvents = 'auto';
// console.log('🧩 Note box added to DOM:', document.getElementById('gg-note-overlay'));

//   Object.assign(noteBox.style, {
//   position: "fixed",
//   top: "100px",
//   right: "20px",
//   width: "300px",
//   height: "150px",
//   background: "#fff",
//   border: "2px solid #000",
//   borderRadius: "8px",
//   padding: "10px",
//   fontSize: "14px",
//   overflowY: "auto",
//   boxShadow: "0 2px 6px rgba(0,0,0,0.2)",
//   zIndex: 9999,
//   whiteSpace: "pre-wrap",
//   cursor: isFindMode ? "default" : "text"  // ✅ Use text cursor for edit mode
// });

// if (isFindMode) {
//   noteBox.style.background = "#f9f9f9"; // light gray for read-only
//   noteBox.style.cursor = "default";
//   noteBox.setAttribute("aria-label", "Read-only location note");
//       noteBox.innerText = noteText || "(No notes available)";

// } else {
//   noteBox.style.background = "#e6ffe6"; // subtle green for editable
//   noteBox.setAttribute("aria-label", "Editable location note");
//   noteBox.innerText = noteText || "(Click here to add a note)";

// }

// // Add drag handle bar
// const dragBar = document.createElement('div');
// Object.assign(dragBar.style, {
//   height: '20px',
//   background: '#eee',
//   cursor: 'grab',
//   margin: '-10px -10px 10px -10px',
//   borderBottom: '1px solid #ccc'
// });
// noteBox.insertBefore(dragBar, noteBox.firstChild);
// noteBox.addEventListener('paste', (e) => {
//   e.preventDefault();
//   const text = e.clipboardData.getData('text/plain');
//   document.execCommand('insertText', false, text); // older method
// });

// dragBar.addEventListener("mousedown", (e) => {
//   isDragging = true;
//   offsetX = e.clientX - noteBox.getBoundingClientRect().left;
//   offsetY = e.clientY - noteBox.getBoundingClientRect().top;
//   e.preventDefault();
// });
// noteBox.style.outline = 'none';
// noteBox.setAttribute("tabindex", "0"); // to allow keyboard focus
// noteBox.addEventListener("click", () => noteBox.focus());

//     // ✅ Drag behavior (click anywhere inside)
//     let offsetX = 0, offsetY = 0, isDragging = false;
// noteBox.setAttribute("aria-label", "Editable location note");
// noteBox.setAttribute("role", "textbox");

//     document.addEventListener("mousemove", (e) => {
//       if (!isDragging) return;
//       noteBox.style.left = `${e.clientX - offsetX}px`;
//       noteBox.style.top = `${e.clientY - offsetY}px`;
//     });
//     document.addEventListener("mouseup", () => {
//       isDragging = false;
//     });

//     // ✅ Debounced save
//     let saveTimeout = null;
//     noteBox.addEventListener("input", () => {
//       clearTimeout(saveTimeout);
//       saveTimeout = setTimeout(() => {
//         fetch(NOTE_API, {
//           method: "POST",
//           headers: { "Content-Type": "application/json" },
//           body: JSON.stringify({ uuid, note: noteBox.innerText.trim() })
//         }).then(() => {
//           console.log("[📝 Note saved]");
//         }).catch(err => {
//           console.error("[❌ Failed to save note]", err);
//         });
//       }, 1000);
//     });

//     document.body.appendChild(noteBox);
//   } catch (err) {
//     console.error("🛑 Failed to load or show editable note:", err);
//   }
// }

//     const pendingUuidSession = sessionStorage.getItem('ypPendingRedirect');
//     if (pendingUuidSession && path.startsWith('/find/location/')) { 
//       console.log('[YPButton] 🧭 Landed on /find from team with YP intent (clearing pending)');
//       sessionStorage.removeItem('ypPendingRedirect');
//     }
//     return; 
//   }
//   if (path === '/' || path === '/find' || path === '/team') {
//     const genericYpBtn = createButton('Go to YP', () => {
//       window.location.href = 'https://yourpeer.nyc/locations?sortBy=nearby';
//     });
//     genericYpBtn.setAttribute('data-go-to-yp', 'true');
//   }
// }
// async function initializeGoGettaEnhancements() {
//   await injectGoGettaButtons(); 
//   onUrlChange(() => {
//     injectGoGettaButtons(); 
//   });
// }
// (async function () {
//   await initializeGoGettaEnhancements();
  
//   document.addEventListener('visibilitychange', () => {
//     if (document.visibilityState === 'visible') {
//       injectGoGettaButtons();
//     }
//   });
// })();
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
async function injectGoGettaButtons() {
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
// 🔹 Create editable note overlay for GoGetta (prevent duplicates)
if (!document.getElementById("gg-note-overlay")) {
  try {
    const userName = localStorage.getItem("userName");
    const NOTE_API = "https://locationnote-iygwucy2fa-uc.a.run.app";

    if (!userName && !location.pathname.startsWith('/find/')) {
      // Only enforce username for editable notes, not for viewing in /find/
      console.warn("[📝 Notes] Username not set. Please set it in the extension popup to add notes.");
      // Optionally, create a read-only box or a message box here.
      // For now, we'll just not create the editable note box if username is missing for edit mode.
    }

    // Fetch existing notes
    const res = await fetch(`${NOTE_API}?uuid=${uuid}`);
    const data = await res.json();
    
    let allNotesContent = "";
    if (data && typeof data === 'object' && Object.keys(data).length > 0) {
        const notesArray = [];
        // data is expected to be { user1: { "YYYY-MM-DD": "note" }, user2: { ... } }
        for (const user in data) {
            if (typeof data[user] === 'object') {
                for (const date in data[user]) {
                    notesArray.push({
                        user: user,
                        date: date,
                        note: data[user][date]
                    });
                }
            }
        }
        // Sort notes by date chronologically
        notesArray.sort((a, b) => new Date(a.date) - new Date(b.date));
        allNotesContent = notesArray.map(n => `${n.user} (${n.date}): ${n.note}`).join("\n\n");
    }


    const noteBox = document.createElement("div");
    noteBox.id = "gg-note-overlay";
    const isFindMode = location.pathname.startsWith('/find/');
    
    // Note box is editable only if NOT in find mode AND username is set
    const isEditable = !isFindMode && !!userName;
    noteBox.contentEditable = isEditable ? "true" : "false";

    noteBox.style.pointerEvents = 'auto';
    noteBox.addEventListener("click", () => {
        if (isEditable) {
            noteBox.focus();
        }
    });

    noteBox.style.position = 'fixed';
    noteBox.style.zIndex = 999999; 
    noteBox.style.pointerEvents = 'auto';
    console.log('🧩 Note box added to DOM:', document.getElementById('gg-note-overlay'));

    Object.assign(noteBox.style, {
        position: "fixed",
        top: "100px",
        right: "20px",
        width: "300px",
        minHeight: "150px", // Use minHeight to allow expansion
        maxHeight: "400px", // Prevent it from becoming too large
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

    if (isFindMode || !userName) { // Read-only mode or if username not set for edit pages
        noteBox.style.background = "#f9f9f9"; 
        noteBox.style.cursor = "default";
        noteBox.setAttribute("aria-label", "Location notes (Read-only)");
        noteBox.innerText = allNotesContent || "(No notes available for this location)";
        if (!isFindMode && !userName) {
             noteBox.innerText = "(Set a username in the extension popup to add notes)\n\n" + (allNotesContent || "(No notes available for this location)");
        }
    } else { // Editable mode
        noteBox.style.background = "#e6ffe6"; 
        noteBox.setAttribute("aria-label", "Editable location notes. Previous notes are read-only.");
        // Display existing notes as read-only text, new notes are added in the editable area
        // For simplicity in this iteration, we'll make the entire box editable
        // but prime it with existing notes. The user will edit their note for the current day.
        // A more complex UI would separate display of old notes and input of new.
        
        // Construct the text for the current user for today.
        // The save logic will handle sending only the current user's note for today.
        let currentUserNoteForToday = "";
        const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
        if (data && data[userName] && data[userName][today]) {
            currentUserNoteForToday = data[userName][today];
        }

        // Display all notes, then the current user's note for today in the editable area
        // This is a simplification. A better UI would have a dedicated input field.
        noteBox.innerText = (allNotesContent ? allNotesContent + "\n\n--- Add your note for today ---\n" : "") + currentUserNoteForToday;
        if (!currentUserNoteForToday && !allNotesContent) {
             noteBox.innerText = "(Click here to add a note for today)";
        } else if (!currentUserNoteForToday && allNotesContent) {
            noteBox.innerText = allNotesContent + "\n\n(Click here to add your note for today)";
        }
    }

    const dragBar = document.createElement('div');
    Object.assign(dragBar.style, {
        height: '20px',
        background: '#eee',
        cursor: 'grab',
        margin: '-10px -10px 10px -10px',
        borderBottom: '1px solid #ccc'
    });
    noteBox.insertBefore(dragBar, noteBox.firstChild);
    
    noteBox.addEventListener('paste', (e) => {
        e.preventDefault();
        const text = e.clipboardData.getData('text/plain');
        document.execCommand('insertText', false, text); 
    });

    dragBar.addEventListener("mousedown", (e) => {
        isDragging = true;
        offsetX = e.clientX - noteBox.getBoundingClientRect().left;
        offsetY = e.clientY - noteBox.getBoundingClientRect().top;
        e.preventDefault();
    });
    noteBox.style.outline = 'none';
    noteBox.setAttribute("tabindex", "0"); 
    if (isEditable) {
      noteBox.addEventListener("click", () => noteBox.focus());
    }


    let offsetX = 0, offsetY = 0, isDragging = false;
    if (isEditable) {
        noteBox.setAttribute("role", "textbox");
    }

    document.addEventListener("mousemove", (e) => {
        if (!isDragging) return;
        noteBox.style.left = `${e.clientX - offsetX}px`;
        noteBox.style.top = `${e.clientY - offsetY}px`;
    });
    document.addEventListener("mouseup", () => {
        isDragging = false;
    });

    if (isEditable) {
        let saveTimeout = null;
        noteBox.addEventListener("input", () => {
            clearTimeout(saveTimeout);
            saveTimeout = setTimeout(() => {
                const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
                
                // Extract only the text that is meant to be the current day's note.
                // This is a bit naive. If the user deletes the "--- Add your note ---" line, this won't work well.
                // A dedicated input field for "today's note" would be much better.
                let currentDayNote = noteBox.innerText;
                const separator = "--- Add your note for today ---";
                const separatorIndex = currentDayNote.lastIndexOf(separator);
                if (separatorIndex !== -1) {
                    currentDayNote = currentDayNote.substring(separatorIndex + separator.length).trim();
                } else if (allNotesContent) { 
                    // If separator is gone, but there was old content, assume new text is everything after old.
                    // This is brittle.
                    currentDayNote = noteBox.innerText.replace(allNotesContent, "").trim();
                }
                // If it was empty and user types "(Click here...", treat it as empty
                if (currentDayNote === "(Click here to add a note for today)" || currentDayNote === "(Click here to add your note for today)") {
                    currentDayNote = "";
                }


                fetch(NOTE_API, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ 
                        uuid, 
                        userName: userName, 
                        date: today, 
                        note: currentDayNote 
                    })
                }).then(() => {
                    console.log(`[📝 Note saved for ${userName} on ${today}]`);
                    // Potentially refresh the displayed notes here if needed, or simply rely on next load.
                }).catch(err => {
                    console.error("[❌ Failed to save note]", err);
                });
            }, 1000);
        });
    }

    document.body.appendChild(noteBox);
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
      window.location.href = 'https://yourpeer.nyc/locations?sortBy=nearby';
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
      injectGoGettaButtons();
    }
  });
})();