document.addEventListener('click', (e) => {
  const okBtn = e.target.closest('button.Button-primary');
  if (!okBtn) return;

  const btnText = okBtn.textContent.trim().toUpperCase();
  if (btnText !== 'OK' && btnText !== 'DONE EDITING') return;

  const currentUrl = window.location.href.replace(/\/$/, ''); // remove trailing slash if present
  localStorage.setItem('ypLastOkClickTime', Date.now().toString());
  if (currentUrl.endsWith('closureInfo') ) {
    console.log('[YP] ✅ OK clicked on /closureInfo — waiting for BACK TO THE MAP');
  localStorage.setItem('ypLastOkClickTime', Date.now().toString());
    console.log("ypLastOkClickTime done")

    setTimeout(() => {
      const backToMapBtn = document.querySelector('button.Button.mt-4.Button-primary.Button-fluid');
      if (backToMapBtn && backToMapBtn.textContent.trim().toUpperCase() === 'BACK TO THE MAP') {
        backToMapBtn.click();
        console.log('[YP] 🗺️ Clicked BACK TO THE MAP');
      } else {
        console.warn('[YP] ⚠️ BACK TO THE MAP button not found');
      }
    }, 1000); // 1 second delay
    return; // 🛑 Don't continue to the chevron logic
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
// if (/\/questions\/website$/.test(currentUrl) || /\/services\/[a-f0-9-]+\/other-info\/?$/.test(currentUrl)||/\/closureinfo\/?$/.test(currentUrl)) {
 
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

  const isClosureInfo = /\/closureinfo\/?$/.test(currentUrl);
  const isOtherMatch = /\/questions\/website$/.test(currentUrl) || /\/services\/[a-f0-9-]+\/other-info\/?$/.test(currentUrl);

  // ⏳ Skip if OK was clicked in the last 5s (for closureInfo)
  if ((isClosureInfo || isOtherMatch) && elapsed < 5000) {
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
