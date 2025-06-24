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

async function injectGoGettaButtons() {
  // Clean up existing buttons injected by this script
  document.querySelectorAll('[data-gghost-button]').forEach(btn => btn.remove());
  // Also clean up the specific "Go to YP" button if it exists
  const existingGoToYpBtn = document.querySelector('[data-go-to-yp]');
  if (existingGoToYpBtn) {
    existingGoToYpBtn.remove();
  }

  const host = location.hostname;
  const path = location.pathname;
  if (host !== 'gogetta.nyc') return;

  // Helper function to create buttons (defined once, early)
  const createButton = (text, onClick, offset = 0) => {
    const btn = document.createElement('button');
    btn.textContent = text;
    btn.style.position = 'fixed';
    btn.style.bottom = `${20 + offset}px`; // Base offset + specific offset
    btn.style.left = '20px';
    btn.style.zIndex = '9999';
    btn.style.padding = '10px 16px';
    btn.style.fontSize = '13px';
    btn.style.background = '#fff';
    btn.style.border = '2px solid black';
    btn.style.borderRadius = '4px';
    btn.style.boxShadow = '0 2px 6px rgba(0,0,0,0.15)';
    btn.style.cursor = 'pointer';
    btn.setAttribute('data-gghost-button', 'true'); // Common attribute for cleanup
    document.body.appendChild(btn);
    btn.addEventListener('click', onClick);
    return btn;
  };

  // 1. Check for service page first (most specific)
  // Example: /team/location/UUID/services/SERVICE_ID
  const fullServiceMatch = path.match(/^\/team\/location\/([a-f0-9-]+)\/services\/([a-f0-9-]+)(?:\/|$)/);
let redirected = false;

if (fullServiceMatch) {
  const locationId = fullServiceMatch[1];
  const serviceId = fullServiceMatch[2];
  try {
    const res = await fetch(`https://w6pkliozjh.execute-api.us-east-1.amazonaws.com/prod/locations/${locationId}`);
    const data = await res.json();
    const matchingService = data.services?.find(s => s.id === serviceId);
    const slug = data.slug;

    if (!slug || !matchingService?.name) {
      console.warn("[YPButton] ❌ Missing slug or service name for service page.");
    } else {
      const forbiddenChars = /[(){}\[\]"'“”‘’—–]/;
      const name = matchingService.name;
      if (forbiddenChars.test(name)) {
        console.warn("[YPButton] 🚫 Forbidden characters in service name. Redirecting to slug without hash.");
        window.location.href = `https://yourpeer.nyc/locations/${slug}`;
        redirected = true;
      } else {
        sessionStorage.setItem('ypScrollTarget', name); 
        const serviceHash = '#' + name
          .trim()
          .replace(/\s+/g, '-')
          .replace(/[^a-zA-Z0-9+_\-]/g, '')
          .replace(/-+/g, '-')
          .replace(/^-|-$/g, '');

        const finalUrl = `https://yourpeer.nyc/locations/${slug}${serviceHash}`;
        console.log(`[YPButton] ✅ Redirecting to YP service (from service page): ${finalUrl}`);
        window.location.href = finalUrl;
        redirected = true;
      }
    }
  } catch (err) {
    console.error("[YPButton] 🛑 Error fetching location/service data for service page:", err);
  }
}

if (redirected) return;


  // 2. Then, check for UUID-specific pages (e.g., /team/location/UUID or /find/location/UUID)
  // Regexes updated to handle optional trailing slash (\/?).
  const teamMatch = path.match(/^\/team\/location\/([a-f0-9-]+)\/?/);
  const findMatch = path.match(/^\/find\/location\/([a-f0-9-]+)\/?/);
  const uuid = (teamMatch || findMatch || fullServiceMatch)?.[1];

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
      0 // Base offset for first button
    );

    createButton('Show on YP', async () => {
      console.log(`[YPButton] 🔎 Attempting to fetch slug for UUID (Show on YP): ${uuid}`);
      try {
        const res = await fetch(`https://w6pkliozjh.execute-api.us-east-1.amazonaws.com/prod/locations/${uuid}`);
        const data = await res.json();
        const slug = data.slug;

        if (slug) {
          const ypUrl = `https://yourpeer.nyc/locations/${slug}`;
          console.log(`[YPButton] ✅ Redirecting to YourPeer (Show on YP): ${ypUrl}`);
          window.location.href = ypUrl;
        } else {
          console.warn('[YPButton] ❌ Slug not found for (Show on YP), not redirecting.');
        }
      } catch (err) {
        console.error('[YPButton] 🛑 Error fetching slug for (Show on YP):', err);
      }
    }, 
    60 // Offset for the second button (e.g. 20px default bottom + 40px additional)
       // Assuming button height + margin is around 40-50px. Adjust if needed.
       // If createButton's 'offset' is 'bottom position', then this should be e.g. 20 + 40 = 60
       // If createButton's 'offset' is 'margin from previous', it's different.
       // The current createButton uses `bottom = ${20 + offset}px`. So an offset of 40 means bottom: 60px.
       // Let's try offset 40 for the second button, meaning it will be at bottom: 60px.
       // The first button is at bottom: 20px.
    );


    const pendingUuidSession = sessionStorage.getItem('ypPendingRedirect');
    if (pendingUuidSession && path.startsWith('/find/location/')) { 
      console.log('[YPButton] 🧭 Landed on /find from team with YP intent (clearing pending)');
      sessionStorage.removeItem('ypPendingRedirect');
    }
    
    return; 
  }

  // 3. If not a service page AND not a UUID-specific page,
  //    check for general pages like /, /find, /team for a generic "Go to YP" button.
  if (path === '/' || path === '/find' || path === '/team') {
    const genericYpBtn = createButton('Go to YP', () => {
      window.location.href = 'https://yourpeer.nyc/locations?sortBy=nearby';
    });
    genericYpBtn.setAttribute('data-go-to-yp', 'true');
  }
}

async function initializeGoGettaEnhancements() {
  await injectGoGettaButtons(); // Call once and wait for it to complete
  onUrlChange(() => {
    injectGoGettaButtons(); // Then setup for URL changes (no await needed here as it's event driven)
  });
}
(async function () {
  console.log('[GGoGetta] 🚀 gghost.js loaded on', location.href);

  await initializeGoGettaEnhancements();

  // Also re-run buttons when tab becomes visible again (just in case)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      injectGoGettaButtons();
    }
  });
})();

