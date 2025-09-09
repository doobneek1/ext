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
function waitForElement(selector, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const intervalTime = 100;
    let timeElapsed = 0;

    const interval = setInterval(() => {
      const el = document.querySelector(selector);
      if (el) {
        clearInterval(interval);
        resolve(el);
      } else if ((timeElapsed += intervalTime) >= timeout) {
        clearInterval(interval);
        reject(new Error(`[YP] ⏱️ Timeout: Element "${selector}" not found within ${timeout}ms`));
      }
    }, intervalTime);
  });
}

if (/\/questions\/website$/.test(currentUrl) || /\/services\/[a-f0-9-]+\/other-info\/?$/.test(currentUrl)) {
  const yesButtonSelector = 'button.Button.mt-2.Button-primary.Button-fluid';
  const nextButtonSelector = 'button.Button.mt-4.Button-primary.Button-fluid';

  waitForElement(yesButtonSelector)
    .then((yesButton) => {
      console.warn('[YP] ✅ Clicking "YES" button');
      yesButton.click();

      // Wait for "GO TO NEXT SECTION" button after clicking YES
      return waitForElement(nextButtonSelector);
    })
    .then((nextButton) => {
      console.warn('[YP] ✅ Clicking "GO TO NEXT SECTION" button after YES');
      nextButton.click();
    })
    .catch((err) => {
      console.warn(`[YP] ⚠️ ${err.message}`);
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
  setTimeout(() => history.back(), 300);
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


});
