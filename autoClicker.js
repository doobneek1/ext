// ——— NOTE API URL from your global namespace ———
function getNoteApiUrl() {
  return window.gghost?.NOTE_API || null;
}
// ——— Wait for element helper function ———
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
const ADVOCATES_SERVICE_PATH_RE = /^\/team\/location\/[^/]+\/services(?:\/|$)/i;
const ADVOCATES_BUTTON_TEXT = 'Advocates / Legal Aid';
const ADVOCATES_BUTTON_TEXT_RE = /advocates\s*(?:\/|&|and)\s*legal\s*aid/i;
const ADVOCATES_BUTTON_PRIMARY_SELECTOR = 'button.Option, [role="button"].Option, button.Item, [role="button"].Item';
const ADVOCATES_BUTTON_FALLBACK_SELECTOR = 'button, [role="button"], [role="menuitem"], [role="option"]';
function getAdvocatesButtonCandidates() {
  const primary = document.querySelectorAll(ADVOCATES_BUTTON_PRIMARY_SELECTOR);
  return primary.length ? primary : document.querySelectorAll(ADVOCATES_BUTTON_FALLBACK_SELECTOR);
}
function getButtonLabel(button) {
  const rawLabel =
    button.textContent ||
    button.getAttribute('aria-label') ||
    button.getAttribute('title') ||
    '';
  return rawLabel.replace(/\s+/g, ' ').trim();
}
function isAdvocatesLegalAidLabel(label) {
  if (!label) return false;
  if (label === ADVOCATES_BUTTON_TEXT) return true;
  return ADVOCATES_BUTTON_TEXT_RE.test(label);
}
function hideAdvocatesLegalAidButton() {
  if (!ADVOCATES_SERVICE_PATH_RE.test(location.pathname)) return;
  const buttons = getAdvocatesButtonCandidates();
  if (!buttons.length) return;
  buttons.forEach((button) => {
    if (button.getAttribute('data-yp-hidden') === 'true') return;
    const label = getButtonLabel(button);
    if (!isAdvocatesLegalAidLabel(label)) return;
    const target = button.closest(ADVOCATES_BUTTON_FALLBACK_SELECTOR) || button;
    target.style.display = 'none';
    target.setAttribute('data-yp-hidden', 'true');
  });
}
function initAdvocatesButtonWatcher() {
  if (window.__gghostAdvocatesButtonWatcher) return;
  window.__gghostAdvocatesButtonWatcher = true;
  let observer = null;
  const ensureObserver = () => {
    if (observer || !document.body) return;
    observer = new MutationObserver(() => hideAdvocatesLegalAidButton());
    observer.observe(document.body, { childList: true, subtree: true });
  };
  const teardownObserver = () => {
    if (!observer) return;
    observer.disconnect();
    observer = null;
  };
  const handleRouteChange = () => {
    if (ADVOCATES_SERVICE_PATH_RE.test(location.pathname)) {
      ensureObserver();
      hideAdvocatesLegalAidButton();
    } else {
      teardownObserver();
    }
  };
  if (!window.__gghostAdvocatesHistoryWrapped) {
    window.__gghostAdvocatesHistoryWrapped = true;
    const pushState = history.pushState;
    history.pushState = function () {
      const result = pushState.apply(this, arguments);
      window.dispatchEvent(new Event('gghost:advocates-route-change'));
      return result;
    };
    const replaceState = history.replaceState;
    history.replaceState = function () {
      const result = replaceState.apply(this, arguments);
      window.dispatchEvent(new Event('gghost:advocates-route-change'));
      return result;
    };
  }
  window.addEventListener('popstate', handleRouteChange);
  window.addEventListener('gghost:advocates-route-change', handleRouteChange);
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', handleRouteChange, { once: true });
  } else {
    handleRouteChange();
  }
}
initAdvocatesButtonWatcher();
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
    const postNote = window.gghost?.postToNoteAPI;
    if (typeof postNote === "function") {
      const res = await postNote(payload);
      if (!res || !res.ok) {
        const t = res && res.text ? await res.text().catch(() => "") : "";
        throw new Error(`NOTE_API error ${res?.status || "unknown"}: ${t}`);
      }
      console.log("[YP] ? Posted OK-click note to NOTE_API", payload);
      return;
    }
    // Use getAuthHeaders() from gghost.js for JWT authentication
    const authHeaders = window.gghost?.getAuthHeaders ? window.gghost.getAuthHeaders() : { 'Content-Type': 'application/json' };
    console.log("[YP] ?? Using auth headers:", authHeaders);
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
    console.log("[YP] ? Posted OK-click note to NOTE_API", payload);
  } catch (err) {
    console.warn("[YP] ⚠️ Failed to post OK-click note:", err);
  }
}
document.addEventListener('click', (e) => {
  const okBtn = e.target.closest('button.Button-primary');
  if (!okBtn) return;
  const btnText = okBtn.textContent.trim().toUpperCase();
  if (btnText !== 'OK' && btnText !== 'DONE EDITING') return;
  // OK-click note posting disabled; rely on API-call logging instead.
  const currentUrl = window.location.href.replace(/\/$/, ''); // remove trailing slash if present
  localStorage.setItem('ypLastOkClickTime', Date.now().toString());
// if (/\/closureInfo\/?$/.test(currentUrl)) {
//   console.warn('[YP] ✅ OK clicked on /closureInfo — waiting for YES and BACK TO THE MAP');
//   localStorage.setItem('ypLastOkClickTime', Date.now().toString());
//   const yesButtonSelector = 'button.Button-primary.Button-fluid';
//   const backToMapButtonSelector = 'button.Button.mt-4.Button-primary.Button-fluid';
//   // ⏳ Add delay to allow DOM update
//   setTimeout(() => {
//     waitForElement(yesButtonSelector)
//       .then((yesBtn) => {
//         if (yesBtn.textContent.trim().toUpperCase() === 'YES') {
//           console.warn('[YP] ✅ Clicking "YES" button');
//           yesBtn.click();
//           return waitForElement(backToMapButtonSelector);
//         } else {
//           throw new Error('YES button found, but text did not match');
//         }
//       })
//       .then((backToMapBtn) => {
//         if (backToMapBtn.textContent.trim().toUpperCase() === 'BACK TO THE MAP') {
//           console.warn('[YP] 🗺️ Clicking "BACK TO THE MAP" button');
//           backToMapBtn.click();
//         } else {
//           throw new Error('BACK TO THE MAP button text mismatch');
//         }
//       })
//       .catch((err) => {
//         console.warn(`[YP] ⚠️ ${err.message}`);
//       });
//   }, 300); // Adjust delay as needed (e.g., 300–500ms)
//   return;
// }
  // 🛑 Skip action on /services or /location pages
if (
  currentUrl.endsWith('location') ||
  currentUrl.endsWith('services')
){    console.log('[YP] 🛑 OK click ignored on services or location page');
    return;
  }
// 🛑 Special case: /questions/website → replace with /services
if ( /\/services\/[a-f0-9-]+\/other-info\/?$/.test(currentUrl)) {
  // Check if redirect is enabled before proceeding
  chrome.storage.local.get('redirectEnabled', (data) => {
    if (!data.redirectEnabled) {
      console.log('[YP] 🛑 Skipping other-info auto-click — redirect not enabled');
      return;
    }
    const yesButtonSelector = 'button.Button.mt-2.Button-primary.Button-fluid';
    const nextButtonSelectors = [
      'button.Button.mt-4.Button-primary.Button-fluid'
      // Note: CSS selectors don't support text content matching
      // We'll use the fallback text search instead
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
  }); // Close chrome.storage.local.get callback
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
// Delay before triggering an automated YES click to give React time to wire handlers
const YES_CLICK_DELAY_MS = 350;
let yesClickTimer = null;
// ✅ Try click YES button only if dropdown item clicked ≤ 10s ago AND redirect is enabled
function tryClickYesButton() {
  const yesBtn = document.querySelector('button.Button-primary.Button-fluid');
  if (!yesBtn || yesBtn.textContent.trim().toUpperCase() !== 'YES' || yesBtn.disabled) return;
  chrome.storage.local.get(['recentDropdownClick', 'redirectEnabled'], (data) => {
    // Skip if redirect is not enabled
    if (!data.redirectEnabled) {
      console.log('[YP] ⏳ Skipping YES click — redirect not enabled');
      return;
    }
    const lastClick = data.recentDropdownClick || 0;
    const now = Date.now();
    const elapsed = now - lastClick;
    if (elapsed <= 10000) {
      if (yesClickTimer) {
        console.log('[YP] Pending YES click already scheduled; skipping duplicate trigger');
        return;
      }
      console.log(`[YP] YES button found after recent dropdown click; scheduling click in ${YES_CLICK_DELAY_MS}ms`);
      yesClickTimer = setTimeout(() => {
        yesClickTimer = null;
        const latestYesBtn = document.querySelector('button.Button-primary.Button-fluid');
        if (!latestYesBtn || latestYesBtn.textContent.trim().toUpperCase() !== 'YES' || latestYesBtn.disabled) {
          console.log('[YP] Skipping delayed YES click: button missing or disabled');
          return;
        }
        console.log('[YP] Triggering delayed YES click now');
        latestYesBtn.click();
      }, YES_CLICK_DELAY_MS);
    } else {
      console.log(`[YP] Skipping YES click: no recent dropdown activity (Δ ${elapsed}ms)`);
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
  // Always run on street-view pages, even if redirect is disabled
  const currentUrl = window.location.href;
  const isStreetViewPage = /\/questions\/street-view\/?$/.test(currentUrl);
  if (!data.redirectEnabled && !isStreetViewPage) return;
  const observer = new MutationObserver(() => {
    tryClickNoLetsEdit();
    // tryClickOkOnProofsRequired();
    autoClickServiceTabs();
    // Only call tryClickYesButton if redirect is enabled
    if (data.redirectEnabled) {
      tryClickYesButton();
      handleWhoDoesItServePage();
    }
    // Always check for opening-hours page
    handleOpeningHoursPage();
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
  const isOtherMatch = /\/questions\/website$/.test(currentUrl) || /\/services\/[a-f0-9-]+\/other-info\/?$/.test(currentUrl)||/\/questions\/street-view$/.test(currentUrl);
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
  // Track when we last clicked buttons to prevent infinite loops
  let lastNoLetsEditClickTime = 0;
  let lastAddGroupClickTime = 0;
  // ✅ "who-does-it-serve" page automation
  function handleWhoDoesItServePage() {
    const currentUrl = window.location.href.replace(/\/$/, '');
    // Check if we're on a who-does-it-serve page
    if (!/\/who-does-it-serve\/?$/.test(currentUrl)) {
      // Clear localStorage when we leave the page
      const storedUrl = localStorage.getItem('ypWhoDoesItServeProcessed');
      if (storedUrl) {
        console.log('[YP] 🔄 Left who-does-it-serve page - clearing localStorage');
        localStorage.removeItem('ypWhoDoesItServeProcessed');
      }
      return;
    }
    // Check if we've already processed this specific URL
    const alreadyProcessed = localStorage.getItem('ypWhoDoesItServeProcessed') === currentUrl;
    if (alreadyProcessed) {
      console.log('[YP] ⏭️ Already processed this who-does-it-serve page - skipping automation');
      return;
    }
    console.log('[YP] 🎯 Detected who-does-it-serve page (new URL)');
    // Mark this URL as processed
    localStorage.setItem('ypWhoDoesItServeProcessed', currentUrl);
    const now = Date.now();
    // ALWAYS check for "NO, LET'S EDIT IT" button first and click it
    const noLetsEditBtn = document.querySelector('button.Button.mt-2.Button-primary.Button-fluid.Button-basic');
    if (noLetsEditBtn && noLetsEditBtn.textContent.trim().toUpperCase().includes("NO, LET'S EDIT IT")) {
      // Only click if we haven't clicked in the last 2 seconds
      if (now - lastNoLetsEditClickTime > 2000) {
        console.log('[YP] ✅ Clicking "NO, LET\'S EDIT IT" button');
        lastNoLetsEditClickTime = now;
        noLetsEditBtn.click();
        // After clicking, wait for DOM to update, then check for "+ Add another group" button
        setTimeout(() => {
          checkAndClickAddGroupButton();
        }, 500);
      } else {
        console.log('[YP] ⏳ Skipping "NO, LET\'S EDIT IT" - clicked recently');
      }
      return;
    }
    // If "NO, LET'S EDIT IT" button not found, check for "+ Add another group" button
    checkAndClickAddGroupButton();
  }
const SPECIFIC_AGES_LABEL = 'Specific ages in this group';
function findSpecificAgesOption() {
  const options = document.querySelectorAll('ul li[role="presentation"]');
  for (const option of options) {
    const span = option.querySelector('span');
    if (span && span.textContent.trim().toLowerCase() === SPECIFIC_AGES_LABEL.toLowerCase()) {
      const input = option.querySelector('input[type="radio"][name="ages"]');
      if (input) {
        return { option, input };
      }
    }
  }
  return null;
}
function primeAgeInputs() {
  setTimeout(() => {
    const activeEl = document.activeElement;
    if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA')) {
      console.log('[YP] Typing space in currently focused field');
      activeEl.value = ' ';
      activeEl.dispatchEvent(new Event('input', { bubbles: true }));
    }
    setTimeout(() => {
      const inputContainer = document.querySelector('.inputContainer');
      if (inputContainer) {
        const fromInput = inputContainer.querySelector('input[type="number"]');
        if (fromInput) {
          console.log('[YP] Focusing on "From:" input field');
          fromInput.focus();
          fromInput.select();
        }
      }
    }, 200);
  }, 100);
}
function activateSpecificAgesOption() {
  const match = findSpecificAgesOption();
  if (!match || !match.input) {
    return false;
  }
  if (!match.input.checked) {
    console.log('[YP] Using existing "Specific ages in this group" radio button');
    match.input.click();
  } else {
    console.log('[YP] "Specific ages in this group" already selected');
  }
  primeAgeInputs();
  return true;
}
// Helper function to check and click "+ Add another group" button
function checkAndClickAddGroupButton(retryCount = 0) {
  const now = Date.now();
  if (document.querySelector('svg.fa-check')) {
    console.log('[YP] Found check icon - group already selected, doing nothing');
    return;
  }
  // Check if any age option is already selected (including "All ages")
  const ageOptions = document.querySelectorAll('ul li[role="presentation"] input[type="radio"][name="ages"]');
  const anyOptionChecked = Array.from(ageOptions).some(input => input.checked);
  if (anyOptionChecked) {
    console.log('[YP] An age option is already selected - doing nothing');
    return;
  }
  if (activateSpecificAgesOption()) {
    return;
  }
  const existingOptions = document.querySelectorAll('ul li[role="presentation"] input[type="radio"][name="ages"]');
  if (existingOptions.length > 0) {
    if (retryCount < 10) {
      console.log(`[YP] Waiting for "${SPECIFIC_AGES_LABEL}" option (retry ${retryCount + 1}/10)`);
      setTimeout(() => checkAndClickAddGroupButton(retryCount + 1), 200);
    } else {
      console.log(`[YP] "${SPECIFIC_AGES_LABEL}" option not available after retries`);
    }
    return;
  }
  const addGroupText = document.querySelector('.addAnotherGroup');
  if (addGroupText && addGroupText.textContent.includes('+ Add another group')) {
    const addGroupBtn = addGroupText.closest('button');
    if (addGroupBtn) {
      if (now - lastAddGroupClickTime > 2000) {
        console.log('[YP] Clicking "+ Add another group" button');
        lastAddGroupClickTime = now;
        addGroupBtn.click();
        const attemptActivate = (attempt = 0) => {
          if (activateSpecificAgesOption()) {
            return;
          }
          if (attempt < 5) {
            setTimeout(() => attemptActivate(attempt + 1), 200);
          } else {
            console.log(`[YP] Unable to locate "${SPECIFIC_AGES_LABEL}" after adding a group`);
          }
        };
        setTimeout(() => attemptActivate(), 400);
      } else {
        console.log('[YP] Skipping "+ Add another group" - clicked recently');
      }
    }
    return;
  }
  if (retryCount < 10) {
    console.log(`[YP] "+ Add another group" button not found - retrying (${retryCount + 1}/10)`);
    setTimeout(() => {
      checkAndClickAddGroupButton(retryCount + 1);
    }, 200);
  } else {
    console.log('[YP] "+ Add another group" button not found after retries - giving up');
  }
}
  // ✅ Opening-hours page automation
  function handleOpeningHoursPage() {
    const currentUrl = window.location.href.replace(/\/$/, '');
    // Check if we're on an opening-hours page
    const isOpeningHoursPage = /\/opening-hours\/?$/.test(currentUrl);
    const existingButton = document.getElementById('yp-9to5-button');
    if (isOpeningHoursPage && !existingButton) {
      console.log('[YP] 🕐 Detected opening-hours page - adding floating button');
      addFloatingButton();
    } else if (!isOpeningHoursPage && existingButton) {
      console.log('[YP] 🔄 Left opening-hours page - removing button');
      existingButton.remove();
    }
  }
  function addFloatingButton() {
    // Check if button already exists
    if (document.getElementById('yp-9to5-button')) return;
    // Create floating button
    const button = document.createElement('button');
    button.id = 'yp-9to5-button';
    button.textContent = 'set 9-5mofri';
    button.style.cssText = `
      position: fixed;
      top: 40px;
      right: 10px;
      z-index: 9999;
      padding: 10px 15px;
      background-color: #007bff;
      color: white;
      border: none;
      border-radius: 5px;
      cursor: pointer;
      font-weight: bold;
      box-shadow: 0 2px 5px rgba(0,0,0,0.3);
    `;
    button.addEventListener('click', () => {
      console.log('[YP] 🕐 Starting 9-5 Mon-Fri automation');
      button.style.display = 'none';
      set9to5MonFri();
    });
    document.body.appendChild(button);
    console.log('[YP] ✅ Floating button added');
  }
  async function set9to5MonFri() {
    try {
      // Step 1: Click "This service is closed" button
      console.log('[YP] Step 1: Looking for "closed" button');
      const closedButton = Array.from(document.querySelectorAll('button.Option.d-flex.justify-content-between.align-items-center.text-left'))
        .find(btn => btn.textContent.includes('closed'));
      if (!closedButton) {
        console.error('[YP] Could not find "closed" button');
        return;
      }
      closedButton.click();
      console.log('[YP] ✅ Clicked "closed" button');
      await sleep(300);
      // Step 2: Click "This service is not 24/7" button
      console.log('[YP] Step 2: Looking for "not 24/7" button');
      await waitForElement('button.Option.d-flex.justify-content-between.align-items-center.text-left', 5000);
      const not247Button = Array.from(document.querySelectorAll('button.Option.d-flex.justify-content-between.align-items-center.text-left'))
        .find(btn => btn.textContent.includes('not') && btn.textContent.includes('24/7'));
      if (!not247Button) {
        console.error('[YP] Could not find "not 24/7" button');
        return;
      }
      not247Button.click();
      console.log('[YP] ✅ Clicked "not 24/7" button');
      await sleep(300);
      // Step 3: Click Monday button
      console.log('[YP] Step 3: Looking for Monday button');
      await waitForElement('button.Option.d-flex.justify-content-between.align-items-center.text-left', 5000);
      const mondayButton = Array.from(document.querySelectorAll('button.Option.d-flex.justify-content-between.align-items-center.text-left'))
        .find(btn => btn.textContent.includes('Monday'));
      if (!mondayButton) {
        console.error('[YP] Could not find Monday button');
        return;
      }
      mondayButton.click();
      console.log('[YP] ✅ Clicked Monday button');
      await sleep(300);
      // Step 4: Set start time to 09:00
      console.log('[YP] Step 4: Setting start time to 09:00');
      const startTimeInput = document.querySelector('input.Input[type="time"][tabindex="1"]');
      if (!startTimeInput) {
        console.error('[YP] Could not find start time input');
        return;
      }
      startTimeInput.value = '09:00';
      startTimeInput.dispatchEvent(new Event('input', { bubbles: true }));
      startTimeInput.dispatchEvent(new Event('change', { bubbles: true }));
      console.log('[YP] ✅ Set start time to 09:00');
      await sleep(200);
      // Step 5: Set end time to 17:00
      console.log('[YP] Step 5: Setting end time to 17:00');
      const endTimeInput = document.querySelector('input.Input[type="time"][tabindex="2"]');
      if (!endTimeInput) {
        console.error('[YP] Could not find end time input');
        return;
      }
      endTimeInput.value = '17:00';
      endTimeInput.dispatchEvent(new Event('input', { bubbles: true }));
      endTimeInput.dispatchEvent(new Event('change', { bubbles: true }));
      console.log('[YP] ✅ Set end time to 17:00');
      await sleep(200);
      // Step 6: Click Tuesday through Friday
      console.log('[YP] Step 6: Clicking Tuesday through Friday');
      const daysToClick = ['Tuesday', 'Wednesday', 'Thursday', 'Friday'];
      const dayButtons = document.querySelectorAll('button.Option.d-flex.justify-content-between.align-items-center.text-left');
      for (const dayName of daysToClick) {
        const dayButton = Array.from(dayButtons).find(btn => btn.textContent.includes(dayName));
        if (dayButton) {
          dayButton.click();
          console.log(`[YP] ✅ Clicked ${dayName}`);
          await sleep(150);
        } else {
          console.warn(`[YP] Could not find ${dayName} button`);
        }
      }
      // Step 7: Click OK button
      console.log('[YP] Step 7: Looking for OK button');
      await sleep(300);
      const okButton = Array.from(document.querySelectorAll('button.Button.Button-primary'))
        .find(btn => btn.textContent.trim().toUpperCase() === 'OK');
      if (!okButton) {
        console.error('[YP] Could not find OK button');
        return;
      }
      okButton.click();
      console.log('[YP] ✅ Clicked OK button - 9-5 Mon-Fri automation complete!');
    } catch (error) {
      console.error('[YP] ❌ Error during 9-5 Mon-Fri automation:', error);
    }
  }
  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  // Run who-does-it-serve handler on page load
  if (data.redirectEnabled) {
    handleWhoDoesItServePage();
  }
  // Run opening-hours handler on page load
  handleOpeningHoursPage();
});
// ✅ Clear who-does-it-serve tracking when page closes or reloads
window.addEventListener('beforeunload', () => {
  const storedUrl = localStorage.getItem('ypWhoDoesItServeProcessed');
  if (storedUrl) {
    console.log('[YP] 🔄 Page closing/reloading - clearing who-does-it-serve localStorage');
    localStorage.removeItem('ypWhoDoesItServeProcessed');
  }
});
// ✅ Handle switching from "Specific ages" to "All ages" in who-does-it-serve
document.addEventListener('click', (e) => {
  // Check if clicked on "All ages in this group" radio button or its parent
  const clickedLi = e.target.closest('li[role="presentation"]');
  if (!clickedLi) return;
  const clickedRadio = clickedLi.querySelector('input[type="radio"][name="ages"]');
  const clickedSpan = clickedLi.querySelector('span');
  if (!clickedRadio || !clickedSpan) return;
  if (!clickedSpan.textContent.includes('All ages in this group')) return;
  // Check if "Specific ages in this group" is currently selected
  const allRadios = document.querySelectorAll('input[type="radio"][name="ages"]');
  let specificAgesIsSelected = false;
  for (const radio of allRadios) {
    if (radio.checked) {
      const radioParent = radio.closest('li[role="presentation"]');
      const radioSpan = radioParent?.querySelector('span');
      if (radioSpan && radioSpan.textContent.includes('Specific ages in this group')) {
        specificAgesIsSelected = true;
        break;
      }
    }
  }
  // Only proceed if "Specific ages" is currently selected
  if (!specificAgesIsSelected) return;
  console.log('[YP] 🔄 User switching from "Specific ages" to "All ages" - clearing input');
  // Find the input field and clear it
  setTimeout(() => {
    const inputContainer = document.querySelector('.inputContainer');
    if (inputContainer) {
      const inputs = inputContainer.querySelectorAll('input[type="number"]');
      inputs.forEach(input => {
        input.value = '';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      });
      console.log('[YP] ✅ Cleared specific age inputs');
    }
    // Now click the "All ages" radio button
    setTimeout(() => {
      clickedRadio.click();
      console.log('[YP] ✅ Selected "All ages in this group"');
    }, 100);
  }, 50);
});
