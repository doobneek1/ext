// ——— NOTE API URL from your global namespace ———
function getNoteApiUrl() {
  return window.gghost?.NOTE_API || null;

}
function refreshYourPeerEmbed1() {
  return window.gghost?.refreshYourPeerEmbed || null;
}

// ——— Robust UUID extraction ———




async function getUserNameSafely() {
  // Use window override if present; else call your existing getter if defined
  if (window.gghostUserName) return window.gghostUserName;
  if (typeof window.getUserNameSafely === "function") return await window.getUserNameSafely();
  return "unknown-user";
}

async function getUserPasswordSafely() {
  if (window.gghostPassword) return window.gghostPassword;
  if (typeof window.getUserPasswordSafely === "function") return await window.getUserPasswordSafely();
  return "";
}

// ——— Prevent rapid duplicate posts (per OK click) ———
function shouldPostOkNote() {
  const now = Date.now();
  const last = parseInt(localStorage.getItem("ypLastOkNotePostTime") || "0", 10);
  const tooSoon = now - last < 800; // tweak if needed
  if (tooSoon) return false;
  localStorage.setItem("ypLastOkNotePostTime", String(now));
  return true;
}

async function postOkClickNote() {
  const NOTE_API_URL = getNoteApiUrl();
  if (!NOTE_API_URL) {
    console.warn("[YP] NOTE_API missing on window.gghost; skipping post.");
    return;
  }
  if (!shouldPostOkNote()) return;



  // JWT authentication will be handled by getAuthHeaders()

const today = new Date().toISOString().slice(0, 10);








  const payload = {
    uuid: encodeURIComponent(location.pathname),
    date: today,
    note: "done"
  };

  try {
    // Use getAuthHeaders() from gghost.js for JWT authentication
    const authHeaders = window.gghost?.getAuthHeaders ? window.gghost.getAuthHeaders() : { 'Content-Type': 'application/json' };
    console.log("[YP] 🔑 Using auth headers:", authHeaders);
    
    const res = await fetch(NOTE_API_URL, {
      method: "POST",
      headers: authHeaders,
      credentials: 'include',
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      throw new Error(`NOTE_API error ${res.status}: ${t}`);
    }
    console.log("[YP] ✅ Posted OK-click note to NOTE_API", payload);
  } catch (err) {
    console.warn("[YP] ⚠️ Failed to post OK-click note:", err);
  }
}

document.addEventListener('click', (e) => {
  const okBtn = e.target.closest('button.Button-primary');
  if (!okBtn) return;

  const btnText = okBtn.textContent.trim().toUpperCase();
  if (btnText !== 'OK' && btnText !== 'DONE EDITING') return;
  (async () => { await postOkClickNote(); })();

  const currentUrl = window.location.href.replace(/\/$/, ''); // remove trailing slash if present
  localStorage.setItem('ypLastOkClickTime', Date.now().toString());
if (/\/closureInfo\/?$/.test(currentUrl)) {
  console.warn('[YP] ✅ OK clicked on /closureInfo — waiting for YES and BACK TO THE MAP');

  localStorage.setItem('ypLastOkClickTime', Date.now().toString());


  const yesButtonSelector = 'button.Button-primary.Button-fluid';
  const backToMapButtonSelector = 'button.Button.mt-4.Button-primary.Button-fluid';

  // ⏳ Add delay to allow DOM update
  setTimeout(() => {
    waitForElement(yesButtonSelector)
      .then((yesBtn) => {
        if (yesBtn.textContent.trim().toUpperCase() === 'YES') {
          console.warn('[YP] ✅ Clicking "YES" button');
          yesBtn.click();

          return waitForElement(backToMapButtonSelector);
        } else {
          throw new Error('YES button found, but text did not match');
        }
      })
      .then((backToMapBtn) => {
        if (backToMapBtn.textContent.trim().toUpperCase() === 'BACK TO THE MAP') {
          console.warn('[YP] 🗺️ Clicking "BACK TO THE MAP" button');
          backToMapBtn.click();
        } else {
          throw new Error('BACK TO THE MAP button text mismatch');
        }
      })
      .catch((err) => {
        console.warn(`[YP] ⚠️ ${err.message}`);
      });
  }, 300); // Adjust delay as needed (e.g., 300–500ms)

  return;
}


  // 🛑 Skip action on /services or /location pages
if (
  currentUrl.endsWith('location') ||
  currentUrl.endsWith('services')
){    console.log('[YP] 🛑 OK click ignored on services or location page');
    return;
  }

// 🛑 Special case: /questions/website → replace with /services
function waitForElement(selector, timeout = 10000) {
  return new Promise((resolve, reject) => {
    const intervalTime = 100;
    let timeElapsed = 0;

    console.log(`[YP] 🔍 Looking for element: ${selector}`);
    
    const interval = setInterval(() => {
      const el = document.querySelector(selector);
      if (el) {
        console.log(`[YP] ✅ Found element: ${selector}`, el);
        clearInterval(interval);
        resolve(el);
      } else {
        if (timeElapsed % 1000 === 0) { // Log every second
          console.log(`[YP] ⏳ Still waiting for ${selector}... (${timeElapsed}ms elapsed)`);
        }
        if ((timeElapsed += intervalTime) >= timeout) {
          console.log(`[YP] ❌ Timeout looking for ${selector} after ${timeout}ms`);
          clearInterval(interval);
          reject(new Error(`[YP] ⏱️ Timeout: Element "${selector}" not found within ${timeout}ms`));
        }
      }
    }, intervalTime);
  });
}

if (/\/questions\/street-view$/.test(currentUrl) || /\/services\/[a-f0-9-]+\/other-info\/?$/.test(currentUrl)) {
  const yesButtonSelector = 'button.Button.mt-2.Button-primary.Button-fluid';
  const nextButtonSelectors = [
    'button.Button.mt-4.Button-primary.Button-fluid',
    'button.Button-primary.Button-fluid[contains(text(), "GO TO NEXT")]',
    'button:contains("GO TO NEXT SECTION")',
    'button.Button-primary:contains("NEXT")'
  ];

  console.log(`[YP] 🎯 Processing ${currentUrl}`);
  
  waitForElement(yesButtonSelector)
    .then((yesButton) => {
      console.warn('[YP] ✅ Found and clicking "YES" button', yesButton);
      console.warn('[YP] Button text:', yesButton.textContent.trim());
      yesButton.click();

      // Try multiple selectors for the next button
      const tryNextSelector = (index = 0) => {
        if (index >= nextButtonSelectors.length) {
          // Fallback: look for any button with "NEXT" text
          return new Promise((resolve, reject) => {
            setTimeout(() => {
              const buttons = document.querySelectorAll('button');
              for (let btn of buttons) {
                if (btn.textContent.toUpperCase().includes('NEXT') || 
                    btn.textContent.toUpperCase().includes('GO TO')) {
                  console.warn('[YP] 🎯 Found next button via text search:', btn);
                  resolve(btn);
                  return;
                }
              }
              reject(new Error('No next button found with any method'));
            }, 1000);
          });
        }
        
        return waitForElement(nextButtonSelectors[index], 3000)
          .catch(() => tryNextSelector(index + 1));
      };

      return tryNextSelector();
    })
    .then((nextButton) => {
      console.warn('[YP] ✅ Found "GO TO NEXT SECTION" button:', nextButton);
      console.warn('[YP] Button text:', nextButton.textContent.trim());
      console.warn('[YP] Button classes:', nextButton.className);
      
      setTimeout(() => {
        console.warn('[YP] 🖱️ Clicking "GO TO NEXT SECTION" button now...');
        nextButton.click();
        console.warn('[YP] ✅ Click executed');
      }, 500);
    })
    .catch((err) => {
      console.warn(`[YP] ⚠️ Error in button sequence:`, err);
      // List all buttons for debugging
      const allButtons = document.querySelectorAll('button');
      console.warn(`[YP] 🔍 All buttons found (${allButtons.length}):`, Array.from(allButtons).map(b => ({
        text: b.textContent.trim(),
        classes: b.className
      })));
    });

  return;
}



  // Skip the first OK button with extra margin classes
  if (okBtn.classList.contains('mt-3') && okBtn.classList.contains('mb-3')) {
    console.log('[YP] 🖱️ First OK button clicked (mt-3 mb-3) — no redirect yet');
    return;
  }

  console.log(`[YP] ✅ Final OK-type button clicked ("${btnText}") — will redirect if chevron is disabled`);

  setTimeout(() => {
    const arrowButton = document.querySelector('button.Button-compact svg.fa-chevron-down')?.closest('button');

    if (arrowButton && !arrowButton.disabled) {
      arrowButton.click();
    } 
  }, 500);
});

document.addEventListener('click', (e) => {
  const dropdownItem = e.target.closest('li.Dropdown-item.list-group-item[role="menuitem"]');
  if (!dropdownItem) return;

  const text = dropdownItem.textContent.trim().toUpperCase();
  if (text === 'TEST FOR FEEDBACK') {
    console.log('[YP] ⏩ Skipped timestamp for TEST FOR FEEDBACK');
    return;
  }

  console.log('[YP] 🕒 Dropdown item clicked — storing timestamp');
  chrome.storage.local.set({ recentDropdownClick: Date.now() });
});


// ✅ Try click YES button only if dropdown item clicked ≤ 2s ago
function tryClickYesButton() {
  const yesBtn = document.querySelector('button.Button-primary.Button-fluid');
  if (!yesBtn || yesBtn.textContent.trim().toUpperCase() !== 'YES' || yesBtn.disabled) return;

  chrome.storage.local.get('recentDropdownClick', (data) => {
    const lastClick = data.recentDropdownClick || 0;
    const now = Date.now();
    const elapsed = now - lastClick;

    if (elapsed <= 10000) {
      console.log('[YP] ✅ YES button found & recent dropdown click detected — clicking YES');
      yesBtn.click();
    } else {
      console.log(`[YP] ⏳ Skipping YES click — no recent dropdown activity (Δ ${elapsed}ms)`);
    }
  });
}


function autoClickServiceTabs() {
  const match = location.pathname.match(/^\/team\/location\/[a-f0-9-]+\/services$/);
  if (!match) return;

  // Select all active service tab buttons
  const buttons = document.querySelectorAll('button.Item.w-100.Item-active');
  if (buttons.length === 0) {
    console.log('[YP] ℹ️ No active service tab buttons found.');
    return;
  }

  console.log(`[YP] 🔘 Found ${buttons.length} active service tab buttons — clicking each...`);
  buttons.forEach(btn => btn.click());
}
autoClickServiceTabs();


chrome.storage.local.get("redirectEnabled", (data) => {
  if (!data.redirectEnabled) return;

  const observer = new MutationObserver(() => {
    tryClickNoLetsEdit();
    // tryClickOkOnProofsRequired();
    autoClickServiceTabs();
      tryClickYesButton(); // 👈 Add this line

  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });

  document.body.addEventListener('click', (e) => {
    const cancelBtn = e.target.closest('button.Button-primary.Button-basic');
if (cancelBtn && cancelBtn.textContent.trim().toUpperCase() === 'CANCEL') {
  // Check if we're on a questions page to prevent unwanted closureinfo redirect
  const currentUrl = window.location.href;
  const isQuestionsPage = /\/questions\//.test(currentUrl);
  
  if (isQuestionsPage) {
    // Navigate directly to location page instead of using history.back()
    // to avoid triggering the popstate handler that redirects to closureinfo
    const uuidMatch = currentUrl.match(/\/team\/location\/([a-f0-9\-]{12,36})\//);
    if (uuidMatch) {
      const uuid = uuidMatch[1];
      window.location.href = `https://gogetta.nyc/team/location/${uuid}`;
    } else {
      // Fallback to history.back() if UUID extraction fails
      setTimeout(() => history.back(), 300);
    }
  } else {
    setTimeout(() => history.back(), 300);
  }
}

  });

// function tryClickNoLetsEdit() {
//   const currentUrl = window.location.pathname;
//     const btn = document.querySelector('button.Button-primary.Button-fluid.Button-basic');

//   // ✅ Only proceed if on /questions/website
// if (/\/questions\/website$/.test(currentUrl) || /\/services\/[a-f0-9-]+\/other-info\/?$/.test(currentUrl)||/\/closureInfo\/?$/.test(currentUrl)) {
 
//   const lastOkClickTime = parseInt(localStorage.getItem('ypLastOkClickTime') || '0', 10);
//     const now = Date.now();

//     // ✅ Skip clicking "NO, LET'S EDIT IT" if "OK" was clicked within the last second
//     if (now - lastOkClickTime < 5000) {
//       console.log("[YP] Skipping 'NO, LET'S EDIT IT' — 'OK' clicked too recently.");
//       return;
//     }
//   if (btn && btn.textContent.trim().toUpperCase().includes("NO, LET'S EDIT IT")) {
//       btn.click();
//       console.log("[YP] Clicked 'NO, LET'S EDIT IT'");
//     }
   
//   } else if (btn && btn.textContent.trim().toUpperCase().includes("NO, LET'S EDIT IT")) {
//       btn.click();
//       console.log("[YP] Clicked 'NO, LET'S EDIT IT'");
//     }
// }

function tryClickNoLetsEdit() {
  const currentUrl = window.location.pathname;

  const btn = document.querySelector('button.Button-primary.Button-fluid.Button-basic');

  const lastOkClickTime = parseInt(localStorage.getItem('ypLastOkClickTime') || '0', 10);
  const now = Date.now();
  const elapsed = now - lastOkClickTime;

  const isclosureInfo = /\/closureInfo\/?$/.test(currentUrl);
  const isOtherMatch = /\/questions\/website$/.test(currentUrl) || /\/services\/[a-f0-9-]+\/other-info\/?$/.test(currentUrl);

  // ⏳ Skip if OK was clicked in the last 5s (for closureInfo)
  if ((isclosureInfo || isOtherMatch) && elapsed < 10000) {
    console.log(`[YP] ⏳ Skipping 'NO, LET'S EDIT IT' — recent OK click (${elapsed}ms ago)`);
    return;
  }

  if (btn && btn.textContent.trim().toUpperCase().includes("NO, LET'S EDIT IT")) {
    btn.click();
    console.log("[YP] ✅ Clicked 'NO, LET'S EDIT IT'");
  }
}


  function autoClickServiceTabs() {
    if (!/\/team\/location\/[a-f0-9-]+\/services$/.test(location.href)) return;
    const buttons = [...document.querySelectorAll('button.Item.w-100.Item-active')];
    if (buttons.length > 0) {
      buttons.forEach(btn => btn.click());
    }
  }

  // Streetview functionality for questions/street-view page
  async function handleStreetViewPage() {
    const currentUrl = window.location.href;
    
    console.log('[YP] 🔍 handleStreetViewPage called for URL:', currentUrl);
    
    // Check if we're on the street-view questions page
    if (!/\/questions\/street-view$/.test(currentUrl)) {
      console.log('[YP] ❌ Not a street-view questions page, skipping');
      return;
    }
    
    console.log('[YP] ✅ On street-view questions page, proceeding...');
    
    // Extract UUID from URL
    const uuidMatch = currentUrl.match(/\/team\/location\/([a-f0-9-]+)\//);
    if (!uuidMatch) {
      console.log('[YP] ❌ Could not extract UUID from URL');
      return;
    }
    
    const uuid = uuidMatch[1];
    console.log('[YP] 🆔 Extracted UUID:', uuid);
    
    const apiUrl = `https://w6pkliozjh.execute-api.us-east-1.amazonaws.com/prod/locations/${uuid}`;
    
    try {
      console.log('[YP] 📡 Fetching location data from:', apiUrl);
      const response = await fetch(apiUrl);
      const data = await response.json();
      
      console.log('[YP] 📋 API Response:', data);
      console.log('[YP] 🗺️ Creating inline streetview for street-view page');
      
      // Use coordinates from API or fallback
      const lat = data.coordinates?.[1] || 40.704860924325;
      const lng = data.coordinates?.[0] || -74.0143901193432;
      const existingStreetviewUrl = data.streetview_url;
      
      console.log('[YP] 📍 Using coordinates:', { lat, lng });
      console.log('[YP] 🔗 Existing streetview URL:', existingStreetviewUrl);
      
      createInlineStreetView(lat, lng, uuid, existingStreetviewUrl);
      
    } catch (error) {
      console.error('[YP] ⚠️ Error fetching location data:', error);
      // Still create streetview with fallback coordinates
      console.log('[YP] 🔄 Using fallback coordinates');
      createInlineStreetView(40.704860924325, -74.0143901193432, uuid, null);
    }
  }

  function createInlineStreetView(lat, lng, uuid, existingStreetviewUrl = null) {
    console.log('[YP] 🎯 createInlineStreetView called with:', { lat, lng, uuid, existingStreetviewUrl });
    
    // Remove any existing streetview container
    const existing = document.getElementById('inline-streetview-container');
    if (existing) {
      console.log('[YP] 🧹 Removing existing streetview container');
      existing.remove();
    }
    
    // Hardcoded Google Places API key
    const GOOGLE_API_KEY = 'AIzaSyBFIrEjge5TMx-Zz-GAFhwFnrmkECLd28k';
    
    // Load Google Maps JavaScript API if not already loaded
    if (!window.google || !window.google.maps) {
      console.log('[YP] 📥 Google Maps API not loaded, loading now...');
      loadGoogleMapsAPI(GOOGLE_API_KEY, () => {
        console.log('[YP] ✅ Google Maps API loaded, creating modal...');
        createStreetViewModal(lat, lng, uuid, existingStreetviewUrl, GOOGLE_API_KEY);
      });
      return;
    }
    
    console.log('[YP] ✅ Google Maps API already loaded, creating modal...');
    createStreetViewModal(lat, lng, uuid, existingStreetviewUrl, GOOGLE_API_KEY);
  }

  function loadGoogleMapsAPI(apiKey, callback) {
    console.log('[YP] ❌ Google Maps API cannot be loaded due to CSP restrictions');
    console.log('[YP] 🔄 Creating fallback modal without Google Maps...');
    
    // Since we can't load Google Maps API in content script due to CSP,
    // we'll create a simple modal with an iframe pointing to Google Maps
    callback();
  }

  function createStreetViewModal(lat, lng, uuid, existingStreetviewUrl, GOOGLE_API_KEY) {
    console.log('[YP] 🏗️ createStreetViewModal called with:', { lat, lng, uuid, existingStreetviewUrl, GOOGLE_API_KEY });
    
    try {
      // Create streetview container
      const streetviewContainer = document.createElement('div');
    streetviewContainer.id = 'inline-streetview-container';
    streetviewContainer.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: 900px;
      height: 700px;
      background: white;
      border: 2px solid #ccc;
      border-radius: 8px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.3);
      z-index: 10000;
      display: flex;
      flex-direction: column;
    `;
    
    // Create header with title and close button
    const header = document.createElement('div');
    header.style.cssText = `
      padding: 15px;
      border-bottom: 1px solid #eee;
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: #f8f9fa;
      border-radius: 6px 6px 0 0;
    `;
    
    const title = document.createElement('h3');
    title.textContent = 'Interactive Map & Street View - Click Map to Navigate';
    title.style.margin = '0';
    title.style.color = '#333';
    title.style.fontSize = '16px';
    
    const closeBtn = document.createElement('button');
    closeBtn.textContent = '×';
    closeBtn.style.cssText = `
      background: none;
      border: none;
      font-size: 24px;
      cursor: pointer;
      color: #666;
      padding: 0;
      width: 30px;
      height: 30px;
      display: flex;
      align-items: center;
      justify-content: center;
    `;
    
    header.appendChild(title);
    header.appendChild(closeBtn);
    
    // Create content area with interactive map and streetview
    const content = document.createElement('div');
    content.style.cssText = `
      display: flex;
      flex-grow: 1;
      height: 500px;
    `;
    
    // Create map container for interactive map
    const mapContainer = document.createElement('div');
    mapContainer.id = 'interactive-map-container';
    mapContainer.style.cssText = `
      width: 45%;
      border-right: 1px solid #eee;
      position: relative;
    `;
    
    // Create streetview container for interactive streetview
    const streetviewContainer2 = document.createElement('div');
    streetviewContainer2.id = 'interactive-streetview-container';
    streetviewContainer2.style.cssText = `
      width: 55%;
      position: relative;
    `;
    
    // Add instructions overlay
    const instructions = document.createElement('div');
    instructions.style.cssText = `
      position: absolute;
      top: 10px;
      left: 10px;
      background: rgba(0,0,0,0.8);
      color: white;
      padding: 8px 12px;
      border-radius: 4px;
      font-size: 12px;
      z-index: 1000;
    `;
    instructions.innerHTML = `
      <div>📍 Click on map to update Street View location</div>
      <div>🖱️ Drag Street View to look around</div>
      <div>🔄 Edit coordinates below for precise location</div>
    `;
    
    streetviewContainer2.appendChild(instructions);
    
    content.appendChild(mapContainer);
    content.appendChild(streetviewContainer2);
    
    // Create coordinates input section
    const coordSection = document.createElement('div');
    coordSection.style.cssText = `
      padding: 10px 15px;
      border-bottom: 1px solid #eee;
      background: #f8f9fa;
      display: flex;
      gap: 10px;
      align-items: center;
      flex-wrap: wrap;
    `;
    
    const coordLabel = document.createElement('span');
    coordLabel.textContent = existingStreetviewUrl ? 
      'Current Location (existing URL found):' : 
      'Current Location:';
    coordLabel.style.fontWeight = 'bold';
    coordLabel.style.fontSize = '14px';
    
    const latInput = document.createElement('input');
    latInput.type = 'number';
    latInput.step = 'any';
    latInput.value = lat;
    latInput.placeholder = 'Latitude';
    latInput.style.cssText = `
      width: 120px;
      padding: 4px 8px;
      border: 1px solid #ccc;
      border-radius: 4px;
      font-size: 12px;
    `;
    
    const lngInput = document.createElement('input');
    lngInput.type = 'number';
    lngInput.step = 'any';
    lngInput.value = lng;
    lngInput.placeholder = 'Longitude';
    lngInput.style.cssText = `
      width: 120px;
      padding: 4px 8px;
      border: 1px solid #ccc;
      border-radius: 4px;
      font-size: 12px;
    `;
    
    const updateBtn = document.createElement('button');
    updateBtn.textContent = 'Update View';
    updateBtn.style.cssText = `
      padding: 4px 12px;
      border: 1px solid #007bff;
      background: #007bff;
      color: white;
      border-radius: 4px;
      cursor: pointer;
      font-size: 12px;
    `;
    
    coordSection.appendChild(coordLabel);
    if (existingStreetviewUrl) {
      const urlInfo = document.createElement('div');
      urlInfo.textContent = `Existing URL: ${existingStreetviewUrl}`;
      urlInfo.style.cssText = `
        font-size: 11px;
        color: #666;
        margin-top: 4px;
        word-break: break-all;
        width: 100%;
      `;
      coordSection.appendChild(urlInfo);
    }
    coordSection.appendChild(latInput);
    coordSection.appendChild(lngInput);
    coordSection.appendChild(updateBtn);
    
    // Create footer with buttons
    const footer = document.createElement('div');
    footer.style.cssText = `
      padding: 15px;
      border-top: 1px solid #eee;
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: #f8f9fa;
      border-radius: 0 0 6px 6px;
    `;
    
    const leftButtons = document.createElement('div');
    leftButtons.style.display = 'flex';
    leftButtons.style.gap = '10px';
    
    const resetBtn = document.createElement('button');
    resetBtn.textContent = 'Reset to Original';
    resetBtn.style.cssText = `
      padding: 8px 16px;
      border: 1px solid #6c757d;
      background: #6c757d;
      color: white;
      border-radius: 4px;
      cursor: pointer;
      font-size: 14px;
    `;
    
    leftButtons.appendChild(resetBtn);
    
    const rightButtons = document.createElement('div');
    rightButtons.style.display = 'flex';
    rightButtons.style.gap = '10px';
    
    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'Cancel';
    cancelBtn.style.cssText = `
      padding: 8px 16px;
      border: 1px solid #ccc;
      background: white;
      border-radius: 4px;
      cursor: pointer;
    `;
    
    const okBtn = document.createElement('button');
    okBtn.textContent = 'Use This Street View';
    okBtn.style.cssText = `
      padding: 8px 16px;
      border: none;
      background: #28a745;
      color: white;
      border-radius: 4px;
      cursor: pointer;
      font-weight: bold;
    `;
    
    rightButtons.appendChild(cancelBtn);
    rightButtons.appendChild(okBtn);
    
    footer.appendChild(leftButtons);
    footer.appendChild(rightButtons);
    
    // Assemble the container
    streetviewContainer.appendChild(header);
    streetviewContainer.appendChild(coordSection);
    streetviewContainer.appendChild(content);
    streetviewContainer.appendChild(footer);
    
    // Add to page
    document.body.appendChild(streetviewContainer);
    
    // Initialize Google Maps components
    let map, streetView, marker, currentLocation;
    
    const initializeGoogleMaps = () => {
      currentLocation = new google.maps.LatLng(lat, lng);
      
      // Initialize Map
      map = new google.maps.Map(mapContainer, {
        center: currentLocation,
        zoom: 18,
        mapTypeId: google.maps.MapTypeId.ROADMAP,
        streetViewControl: false,
        fullscreenControl: false
      });
      
      // Initialize Street View
      streetView = new google.maps.StreetViewPanorama(streetviewContainer2, {
        position: currentLocation,
        pov: { heading: 34, pitch: 10 },
        visible: true,
        enableCloseButton: false,
        fullscreenControl: false,
        addressControl: false,
        showRoadLabels: true
      });
      
      // Add marker on map
      marker = new google.maps.Marker({
        position: currentLocation,
        map: map,
        draggable: true,
        title: 'Street View Location'
      });
      
      // Map click handler - update street view location
      map.addListener('click', (event) => {
        const newPos = event.latLng;
        currentLocation = newPos;
        
        // Update marker
        marker.setPosition(newPos);
        
        // Update street view
        streetView.setPosition(newPos);
        
        // Update coordinate inputs
        latInput.value = newPos.lat().toFixed(8);
        lngInput.value = newPos.lng().toFixed(8);
        
        console.log(`[YP] 🗺️ Map clicked - updated to: ${newPos.lat()}, ${newPos.lng()}`);
      });
      
      // Marker drag handler
      marker.addListener('dragend', (event) => {
        const newPos = event.latLng;
        currentLocation = newPos;
        
        // Update street view
        streetView.setPosition(newPos);
        
        // Update coordinate inputs
        latInput.value = newPos.lat().toFixed(8);
        lngInput.value = newPos.lng().toFixed(8);
        
        console.log(`[YP] 🗺️ Marker dragged to: ${newPos.lat()}, ${newPos.lng()}`);
      });
      
      // Street view position change handler
      streetView.addListener('position_changed', () => {
        const newPos = streetView.getPosition();
        if (newPos) {
          currentLocation = newPos;
          
          // Update map center and marker
          map.setCenter(newPos);
          marker.setPosition(newPos);
          
          // Update coordinate inputs
          latInput.value = newPos.lat().toFixed(8);
          lngInput.value = newPos.lng().toFixed(8);
        }
      });
      
      console.log(`[YP] 🗺️ Google Maps initialized at: ${lat}, ${lng}`);
    };
    
    // Initialize maps after a brief delay to ensure DOM is ready
    setTimeout(initializeGoogleMaps, 100);
    
    // Event handlers
    const closeStreetview = () => {
      streetviewContainer.remove();
    };
    
    const updateStreetview = () => {
      const newLat = parseFloat(latInput.value);
      const newLng = parseFloat(lngInput.value);
      
      if (isNaN(newLat) || isNaN(newLng)) {
        alert('Please enter valid coordinates');
        return;
      }
      
      const newPos = new google.maps.LatLng(newLat, newLng);
      currentLocation = newPos;
      
      // Update map center and marker
      if (map) {
        map.setCenter(newPos);
        if (marker) {
          marker.setPosition(newPos);
        }
      }
      
      // Update street view
      if (streetView) {
        streetView.setPosition(newPos);
      }
      
      console.log(`[YP] 🗺️ Updated via coordinates to: ${newLat}, ${newLng}`);
    };
    
    closeBtn.onclick = closeStreetview;
    cancelBtn.onclick = closeStreetview;
    updateBtn.onclick = updateStreetview;
    
    resetBtn.onclick = () => {
      const originalPos = new google.maps.LatLng(lat, lng);
      latInput.value = lat;
      lngInput.value = lng;
      
      // Reset map and street view to original position
      if (map) {
        map.setCenter(originalPos);
        if (marker) {
          marker.setPosition(originalPos);
        }
      }
      
      if (streetView) {
        streetView.setPosition(originalPos);
      }
      
      currentLocation = originalPos;
      console.log(`[YP] 🔄 Reset to original coordinates: ${lat}, ${lng}`);
    };
    
    // Allow Enter key to update
    [latInput, lngInput].forEach(input => {
      input.onkeypress = (e) => {
        if (e.key === 'Enter') {
          updateStreetview();
        }
      };
    });
    
    okBtn.onclick = () => {
      // Use current location from the interactive components
      let finalLat, finalLng;
      
      if (currentLocation) {
        finalLat = currentLocation.lat();
        finalLng = currentLocation.lng();
      } else {
        finalLat = parseFloat(latInput.value);
        finalLng = parseFloat(lngInput.value);
      }
      
      // Fill the input field with the streetview URL
      const input = document.querySelector('input.Input.Input-fluid[placeholder*="google map streetview"]');
      if (input) {
        const publicStreetviewUrl = `https://www.google.com/maps/@${finalLat},${finalLng},3a,75y,210h,10t`;
        input.value = publicStreetviewUrl;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        console.log('[YP] ✅ Filled streetview URL:', publicStreetviewUrl);
      }
      closeStreetview();
    };
    
    // Close on background click
    streetviewContainer.onclick = (e) => {
      if (e.target === streetviewContainer) {
        closeStreetview();
      }
    };
    
    console.log('[YP] ✅ Street View modal created successfully');
    
    } catch (error) {
      console.error('[YP] ❌ Error in createStreetViewModal:', error);
      alert('Error creating street view modal: ' + error.message);
    }
  }

  // Initialize streetview functionality when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      console.log('[YP] 📋 DOM loaded, calling handleStreetViewPage');
      handleStreetViewPage();
    });
  } else {
    console.log('[YP] 📋 DOM already ready, calling handleStreetViewPage immediately');
    handleStreetViewPage();
  }
  
  // Also call it immediately to test
  console.log('[YP] 🧪 Testing immediate call to handleStreetViewPage');
  setTimeout(() => handleStreetViewPage(), 1000);
  
  // Enhanced SPA navigation detection
  let lastUrl = location.href;
  
  // Override history methods to detect navigation
  const originalPushState = history.pushState;
  const originalReplaceState = history.replaceState;
  
  history.pushState = function(...args) {
    originalPushState.apply(history, args);
    setTimeout(() => {
      if (location.href !== lastUrl) {
        lastUrl = location.href;
        handleStreetViewPage();
      }
    }, 100);
  };
  
  history.replaceState = function(...args) {
    originalReplaceState.apply(history, args);
    setTimeout(() => {
      if (location.href !== lastUrl) {
        lastUrl = location.href;
        handleStreetViewPage();
      }
    }, 100);
  };
  
  // Handle back/forward navigation
  window.addEventListener('popstate', () => {
    setTimeout(() => {
      if (location.href !== lastUrl) {
        lastUrl = location.href;
        handleStreetViewPage();
      }
    }, 100);
  });
  
  // Fallback: periodic check for URL changes (for SPAs that don't use history API properly)
  setInterval(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      handleStreetViewPage();
    }
  }, 1000);
  
  // Also listen for DOM mutations that might indicate page changes
  const pageObserver = new MutationObserver(() => {
    // Debounce to avoid too many calls
    clearTimeout(window.streetviewCheckTimeout);
    window.streetviewCheckTimeout = setTimeout(() => {
      if (location.href !== lastUrl) {
        lastUrl = location.href;
        handleStreetViewPage();
      }
    }, 500);
  });
  
  pageObserver.observe(document.body, {
    childList: true,
    subtree: true
  });


});
