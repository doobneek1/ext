
document.addEventListener('click', (e) => {
  const okBtn = e.target.closest('button.Button-primary');
  if (!okBtn || okBtn.textContent.trim() !== 'OK') return;

  console.log('[YP] 🖱️ OK button clicked — waiting for save to complete...');

  // Wait for a little moment after clicking OK to allow save to trigger
  setTimeout(() => {
    const arrowButton = document.querySelector('button.Button-compact svg.fa-chevron-down')?.closest('button');
if (arrowButton && !arrowButton.disabled) {
  console.log('[YP] ✅ Chevron enabled — clicking it');
  arrowButton.click();
} else {
  const currentUrl = window.location.href;
  if (/\/other-info$/.test(currentUrl)) {
    const newUrl = currentUrl.replace(/\/other-info$/, '/documents');
    console.warn('[YP] ❌ Chevron disabled on other-info — switching to documents:', newUrl);
    window.location.href = newUrl;
  } else {
    const newUrl = currentUrl.replace(/\/[^/]+\/?$/, '');  // Removes last slug
    console.warn('[YP] ❌ Chevron disabled — redirecting to:', newUrl);
    window.location.href = newUrl;
  }
}

  }, 500); // Adjust delay as needed based on actual save time (500ms usually works)
});
function tryClickYesButton() {
  const yesBtn = document.querySelector('button.Button-primary.Button-fluid');
  if (
    yesBtn &&
    yesBtn.textContent.trim().toUpperCase() === 'YES' &&
    !yesBtn.disabled
  ) {
    console.log('[YP] ✅ YES button found — clicking it');
    yesBtn.click();
  }
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

  const url = location.href;
  const cancelRedirectTargets = [
    'location-address', 'organization-name', 'location-name', 'location-description',
    'phone-number', 'website', 'name', 'description', 'opening-hours',
    'languages', 'membership', 'area', 'other-info'
  ];

  const observer = new MutationObserver(() => {
    tryClickNoLetsEdit();
    tryClickOkOnProofsRequired();
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

  function tryClickNoLetsEdit() {
    const btn = document.querySelector('button.Button-primary.Button-fluid.Button-basic');
    if (btn && btn.textContent.trim().toUpperCase().includes("NO, LET'S EDIT IT")) {
      btn.click();
    }
  }

function tryClickOkOnProofsRequired() {
  if (!/proofs-required$/.test(location.href)) return;

  const okBtn = document.querySelector('button.Button-primary:not(.Button-basic)');
  if (okBtn && okBtn.textContent.trim().toUpperCase() === 'OK') {
    okBtn.click();

    // Delay going back slightly to allow any modal close animations or actions to complete
    setTimeout(() => {
      history.back();
    }, 300); // Adjust delay if needed
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
