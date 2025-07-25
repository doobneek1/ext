document.addEventListener('click', (e) => {
  const okBtn = e.target.closest('button.Button-primary');
  if (!okBtn) return;

  const btnText = okBtn.textContent.trim().toUpperCase();
  if (btnText !== 'OK' && btnText !== 'DONE EDITING') return;

  const currentUrl = window.location.href.replace(/\/$/, ''); // remove trailing slash if present

  // 🛑 Skip action on /services or /location pages
  if (currentUrl.endsWith('services') || currentUrl.endsWith('location')) {
    console.log('[YP] 🛑 OK click ignored on services or location page');
    return;
  }

// 🛑 Special case: /questions/website → replace with /services
if (/\/questions\/website$/.test(currentUrl)) {
  const newUrl = currentUrl.replace(/\/questions\/website$/, '/services');
  console.warn('[YP] 🌀 Redirecting from /questions/website → /services — new URL:', newUrl);
  window.location.href = newUrl;
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
      console.log('[YP] ✅ Chevron enabled — clicking it');
      arrowButton.click();
    } else {
      if (/\/documents\/other-info\/?$/.test(currentUrl)) {
        if (!sessionStorage.getItem('ypRedirected')) {
          sessionStorage.setItem('ypRedirected', 'true');
          const newUrl = currentUrl.replace(/\/documents\/other-info\/?$/, '');
          console.warn('[YP] ❌ Redirecting from /documents/other-info — new URL:', newUrl);
          window.location.href = newUrl;
        } else {
          console.log('[YP] 🚫 Redirect skipped — already redirected this session');
        }
      } else {
        const newUrl = currentUrl.replace(/\/[^/]+\/?$/, '');
        console.warn('[YP] ❌ Chevron disabled — fallback redirect to:', newUrl);
        window.location.href = newUrl;
      }
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

  const url = location.href;
  const cancelRedirectTargets = [
    'location-address', 'organization-name', 'location-name', 'location-description',
    'phone-number', 'website', 'name', 'description', 'opening-hours',
    'languages', 'membership', 'area', 'other-info'
  ];

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
