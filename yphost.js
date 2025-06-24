// (async function () {
//   const host = location.hostname;
//   const path = location.pathname;
// const slug = path.split('/locations/')[1]?.split('#')[0];

//   function normalize(str) {
//     return str?.toLowerCase()?.replace(/[^a-z0-9]+/g, '').trim();
//   }

//   // 🔘 Floating buttons for location-level redirects
//   const createYPButton = (text, redirectTarget, offset = 0) => {
//     const btn = document.createElement('button');
//     btn.textContent = text;
//     btn.setAttribute('data-yp-button', 'true');
//     btn.style.position = 'fixed';
//     btn.style.bottom = `${20 + offset}px`;
//     btn.style.right = '20px';
//     btn.style.zIndex = '9999';
//     btn.style.padding = '10px 16px';
//     btn.style.fontSize = '13px';
//     btn.style.background = '#fff';
//     btn.style.border = '2px solid black';
//     btn.style.borderRadius = '4px';
//     btn.style.boxShadow = '0 2px 6px rgba(0,0,0,0.15)';
//     btn.style.cursor = 'pointer';
//     document.body.appendChild(btn);

//     btn.addEventListener('click', async () => {
//       if (!slug) return alert('Missing slug');

//       try {
//         const res = await fetch(`https://w6pkliozjh.execute-api.us-east-1.amazonaws.com/prod/locations-by-slug/${slug}`, {
//           method: 'GET',
//           credentials: 'omit'
//         });

//         const json = await res.json();
//         const uuid = json?.id;
//         if (!uuid) throw new Error('Missing location UUID');

//         const baseUrl = `https://gogetta.nyc/team/location/${uuid}`;
//         const finalUrl = {
//           edit: `${baseUrl}`,
//           services: `${baseUrl}/services`,
//           recap: `${baseUrl}/services/recap`,
//           closure: `${baseUrl}/closureInfo`
//         }[redirectTarget] || baseUrl;

//         chrome.storage?.local?.set?.({ redirectEnabled: false }, () => {
//           sessionStorage.setItem('ypNeedsRedirectReenable', 'true');
//           sessionStorage.setItem('ypSkipBackgroundRedirect', 'true');
//           console.log('[YPButton] 🚀 Redirecting to:', finalUrl);
//           window.location.href = finalUrl;
//         });

//       } catch (err) {
//         console.error('[YPButton] ❌ Failed to fetch location UUID for button:', err);
//         alert('Could not fetch location info');
//       }
//     });

//     return btn;
//   };

//   // 🧠 Inject service-level edit buttons immediately
//   async function injectServiceEditButtons(slug) {
//     try {
//       const res = await fetch(`https://w6pkliozjh.execute-api.us-east-1.amazonaws.com/prod/locations-by-slug/${slug}`, {
//         method: 'GET',
//         credentials: 'omit'
//       });

//       const json = await res.json();
//       const services = json?.Services || [];
//       const locationId = json?.id;
//       if (!locationId) return;

//       // Build service name → id map
//       const serviceMap = {};
//       for (const svc of services) {
//         if (svc?.name && svc?.id) {
//           serviceMap[normalize(svc.name)] = svc.id;
//         }
//       }

//       // Add buttons
//       document.querySelectorAll('div[id]').forEach(section => {
//         const rawId = section.id;
//         const normalized = normalize(rawId);
//         const serviceId = serviceMap[normalized];
//         if (!serviceId) return;

//         const btn = document.createElement('button');
//         btn.textContent = 'Edit Service';
//         btn.className = 'yp-service-edit-btn';
//         btn.style.marginLeft = '12px';
//         btn.style.fontSize = '12px';
//         btn.style.border = '1px solid #000';
//         btn.style.background = '#fff';
//         btn.style.padding = '4px 8px';
//         btn.style.cursor = 'pointer';
//         btn.style.borderRadius = '4px';

//         btn.addEventListener('click', () => {
//           const url = `https://gogetta.nyc/team/location/${locationId}/services/${serviceId}`;
//           console.log('[YP] 🧭 Redirecting to service editor:', url);
//          window.location.href = url;
//         });

//         const header = section.querySelector('h2');
//         if (header) header.appendChild(btn);
//       });

//     } catch (err) {
//       console.error('[YP] ❌ Failed to inject service buttons:', err);
//     }
//   }

//   if (host === 'yourpeer.nyc' && path.startsWith('/locations/')) {
// if (!slug) {
//   const btn = document.createElement('button');
//   btn.textContent = 'Go to Getta';
//   btn.setAttribute('data-yp-button', 'true');
//   btn.style.position = 'fixed';
//   btn.style.bottom = `20px`;
//   btn.style.right = '20px';
//   btn.style.zIndex = '9999';
//   btn.style.padding = '10px 16px';
//   btn.style.fontSize = '13px';
//   btn.style.background = '#fff';
//   btn.style.border = '2px solid black';
//   btn.style.borderRadius = '4px';
//   btn.style.boxShadow = '0 2px 6px rgba(0,0,0,0.15)';
//   btn.style.cursor = 'pointer';
//   document.body.appendChild(btn);

//   btn.addEventListener('click', () => {
//     window.location.href = 'https://gogetta.nyc/team';
//   });

//   return;
// }

//     const isClosed = document.querySelector('p.text-dark.mb-0\\.5.font-medium.text-sm')?.textContent.trim() === 'Closed';

//     if (slug) {
//       createYPButton('Edit Services', 'recap', 0);
//       createYPButton('Add/Delete Services', 'services', 40);
//       createYPButton('Edit Location', 'edit', 80);
//       if (isClosed) createYPButton('Open Location', 'closure', 120);

//       await injectServiceEditButtons(slug); // 👈 Auto-run on load
//     }

//   }
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

(async function () {
  function normalize(str) {
    return str?.toLowerCase()?.replace(/[^a-z0-9]+/g, '').trim();
  }

  async function injectServiceEditButtons(slug, locationId, services) {
    const serviceMap = {};
    for (const svc of services) {
      if (svc?.name && svc?.id) {
        serviceMap[normalize(svc.name)] = svc.id;
      }
    }

    document.querySelectorAll('div[id]').forEach(section => {
      const rawId = section.id;
      const normalized = normalize(rawId);
      const serviceId = serviceMap[normalized];
      if (!serviceId) return;

      const btn = document.createElement('button');
      btn.textContent = 'Edit Service';
      btn.className = 'yp-service-edit-btn';
      Object.assign(btn.style, {
        marginLeft: '12px',
        fontSize: '12px',
        border: '1px solid #000',
        background: '#fff',
        padding: '4px 8px',
        cursor: 'pointer',
        borderRadius: '4px',
      });

      btn.addEventListener('click', () => {
        const url = `https://gogetta.nyc/team/location/${locationId}/services/${serviceId}`;
        window.location.href = url;
      });

      const header = section.querySelector('h2');
      if (header) header.appendChild(btn);
    });
  }

  async function injectButtons() {
    const host = location.hostname;
    const path = location.pathname;
    const slug = path.split('/locations/')[1]?.split('#')[0];

    // Clean up old buttons
    document.querySelectorAll('[data-yp-button]').forEach(btn => btn.remove());
    document.querySelectorAll('.yp-service-edit-btn').forEach(btn => btn.remove());

    if (host !== 'yourpeer.nyc' || !path.startsWith('/locations')) return;

    if (!slug) {
      const btn = document.createElement('button');
      btn.textContent = 'Go to Getta';
      btn.setAttribute('data-yp-button', 'true');
      Object.assign(btn.style, {
        position: 'fixed', bottom: `20px`, right: '20px', zIndex: '9999',
        padding: '10px 16px', fontSize: '13px', background: '#fff',
        border: '2px solid black', borderRadius: '4px',
        boxShadow: '0 2px 6px rgba(0,0,0,0.15)', cursor: 'pointer',
      });
      btn.addEventListener('click', () => {
        window.location.href = 'https://gogetta.nyc/team';
      });
      document.body.appendChild(btn);
      return;
    }

    try {
      const res = await fetch(`https://w6pkliozjh.execute-api.us-east-1.amazonaws.com/prod/locations-by-slug/${slug}`);
      const json = await res.json();
      const uuid = json?.id;
      if (!uuid) return;

      const baseUrl = `https://gogetta.nyc/team/location/${uuid}`;
      const isClosed = document.querySelector('p.text-dark.mb-0\\.5.font-medium.text-sm')?.textContent.trim() === 'Closed';

      const createYPButton = (text, target, offset = 0) => {
        const btn = document.createElement('button');
        btn.textContent = text;
        btn.setAttribute('data-yp-button', 'true');
        Object.assign(btn.style, {
          position: 'fixed', bottom: `${20 + offset}px`, right: '20px', zIndex: '9999',
          padding: '10px 16px', fontSize: '13px', background: '#fff',
          border: '2px solid black', borderRadius: '4px',
          boxShadow: '0 2px 6px rgba(0,0,0,0.15)', cursor: 'pointer',
        });

        btn.addEventListener('click', () => {
          const finalUrl = {
            edit: `${baseUrl}`,
            services: `${baseUrl}/services`,
            recap: `${baseUrl}/services/recap`,
            closure: `${baseUrl}/closureInfo`
          }[target] || baseUrl;

          chrome.storage?.local?.set?.({ redirectEnabled: false }, () => {
            sessionStorage.setItem('ypNeedsRedirectReenable', 'true');
            sessionStorage.setItem('ypSkipBackgroundRedirect', 'true');
            window.location.href = finalUrl;
          });
        });

        document.body.appendChild(btn);
      };

    if (slug) { createYPButton('Edit Services', 'recap', 0);
      createYPButton('Add/Delete Services', 'services', 40);
      createYPButton('Edit Location', 'edit', 80);
      if (isClosed) createYPButton('Open Location', 'closure', 120);

      await injectServiceEditButtons(slug, uuid, json?.Services || []);}
    } catch (err) {
      console.error('[YP] ❌ Failed to inject buttons:', err);
    }
  }

  // Handle initial load
  await injectButtons();

  // Handle future route changes
  onUrlChange(() => {
    injectButtons();
  });

})();

