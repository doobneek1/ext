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
  const host = location.hostname;
  const path = location.pathname;
  if (host !== 'gogetta.nyc') return;

  const teamMatch = path.match(/^\/team\/location\/([a-f0-9-]+)/);
  const findMatch = path.match(/^\/find\/location\/([a-f0-9-]+)/);
  const uuid = (teamMatch || findMatch)?.[1];
  if (!uuid) return;
const fullServiceMatch = path.match(/^\/team\/location\/([a-f0-9-]+)\/services\/([a-f0-9-]+)(?:\/|$)/);

if (fullServiceMatch) {
  const locationId = fullServiceMatch[1];
  const serviceId = fullServiceMatch[2];

  try {
    const res = await fetch(`https://w6pkliozjh.execute-api.us-east-1.amazonaws.com/prod/locations/${locationId}`);
    const data = await res.json();
    const matchingService = data.services?.find(s => s.id === serviceId);
    const slug = data.slug;

    if (!slug || !matchingService?.name) {
      console.warn("[YPButton] ❌ Missing slug or service name.");
      // window.location.href = 'https://yourpeer.nyc/locations?sortBy=nearby';
      return;
    }

    const forbiddenChars = /[(){}\[\]"'“”‘’—–]/;
    const name = matchingService.name;

if (forbiddenChars.test(name)) {
  console.warn("[YPButton] 🚫 Forbidden characters found. Skipping hash.");
  window.location.href = `https://yourpeer.nyc/locations/${slug}`;
  return;
}

sessionStorage.setItem('ypScrollTarget', name);

    const serviceHash = '#' + name
      .trim()
      .replace(/\s+/g, '-')              // Replace spaces with hyphens
      .replace(/[^a-zA-Z0-9+_\-]/g, '')  // Strip all except alphanumerics, +, _, -
      .replace(/-+/g, '-')               // Collapse dashes
      .replace(/^-|-$/g, '');            // Trim dashes

    const finalUrl = `https://yourpeer.nyc/locations/${slug}${serviceHash ? `#${serviceHash}` : ''}`;
    console.log(`[YPButton] ✅ Redirecting to YP service: ${finalUrl}`);
    window.location.href = finalUrl;
    return;

  } catch (err) {
    console.error("[YPButton] 🛑 Error fetching location/service:", err);
    // window.location.href = 'https://yourpeer.nyc/locations?sortBy=nearby';
    return;
  }
}


  const currentMode = teamMatch ? 'edit' : 'view';
  const targetUrl = currentMode === 'edit'
    ? `https://gogetta.nyc/find/location/${uuid}`
    : `https://gogetta.nyc/team/location/${uuid}`;

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
    document.body.appendChild(btn);
    btn.addEventListener('click', onClick);
    return btn;
  };

  // 🌐 Edit/View toggle
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
    }
  );

  // 🎯 Show on YP
// 🎯 Show on YP
const ypBtn = createButton('Show on YP', async () => {
  const freshUuid = location.pathname.match(/^\/(?:find|team)\/location\/([a-f0-9-]+)/)?.[1];
  if (!freshUuid) {
    console.warn('[YPButton] ❌ Could not extract UUID');
    alert('Could not determine location ID');
    return;
  }

  console.log(`[YPButton] 🔎 Attempting to fetch slug for UUID: ${freshUuid}`);
  try {
    const res = await fetch(`https://w6pkliozjh.execute-api.us-east-1.amazonaws.com/prod/locations/${freshUuid}`);
    const data = await res.json();
    const slug = data.slug;

    if (slug) {
      const ypUrl = `https://yourpeer.nyc/locations/${slug}`;
      console.log(`[YPButton] ✅ Redirecting to YourPeer: ${ypUrl}`);
      window.location.href = ypUrl;
    } else {
      console.warn('[YPButton] ❌ Slug not found, falling back');
      // window.location.href = 'https://yourpeer.nyc/locations?sortBy=nearby';
    }
  } catch (err) {
    console.error('[YPButton] 🛑 Error fetching slug:', err);
    // window.location.href = 'https://yourpeer.nyc/locations?sortBy=nearby';
  }
}, 40);



const pendingUuid = sessionStorage.getItem('ypPendingRedirect');
if (pendingUuid && host === 'gogetta.nyc' && path.startsWith('/find/location/')) {
  console.log('[YPButton] 🧭 Landed on /find from team with YP intent');

  sessionStorage.removeItem('ypPendingRedirect');






}



if (location.hostname === 'yourpeer.nyc') {
  const rawName = sessionStorage.getItem('ypScrollTarget');
  if (rawName) {
    sessionStorage.removeItem('ypScrollTarget'); // clean up

    const hashId = rawName
      .trim()
      .replace(/\s+/g, '-')
      .replace(/[^a-zA-Z0-9+_\-]/g, '')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');

    const tryClickExpand = () => {
      const el = document.getElementById(hashId);
      if (!el) return false;

      const btn = el.querySelector('button.collapseButton');
      if (btn) {
        console.log(`[YPButton] 🔽 Expanding fallback service: ${hashId}`);
        btn.click();
        return true;
      }
      return false;
    };

    if (!tryClickExpand()) {
      const observer = new MutationObserver(() => {
        if (tryClickExpand()) observer.disconnect();
      });
      observer.observe(document.body, { childList: true, subtree: true });
      setTimeout(() => observer.disconnect(), 5000);
    }
  }
}


if (
  host === 'gogetta.nyc' &&
  (path === '/' || path === '/find' || path === '/team')
) {
  const existing = document.querySelector('[data-go-to-yp]');
  if (!existing) {
    const btn = document.createElement('button');
    btn.textContent = 'Go to YP';
    btn.setAttribute('data-go-to-yp', 'true');
    btn.style.position = 'fixed';
    btn.style.bottom = '20px';
    btn.style.left = '20px';
    btn.style.zIndex = '9999';
    btn.style.padding = '10px 16px';
    btn.style.fontSize = '13px';
    btn.style.background = '#fff';
    btn.style.border = '2px solid black';
    btn.style.borderRadius = '4px';
    btn.style.boxShadow = '0 2px 6px rgba(0,0,0,0.15)';
    btn.style.cursor = 'pointer';
    btn.addEventListener('click', () => {
      window.location.href = 'https://yourpeer.nyc/locations?sortBy=nearby';
    });
    document.body.appendChild(btn);
  }
}


};
(async function () {
  await injectGoGettaButtons();
  onUrlChange(() => {
    injectGoGettaButtons();
  });
})();

