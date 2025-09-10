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
function formatTimeAgo(dateStr) {
  const now = new Date();
  const then = new Date(dateStr);
  const diffMs = now - then;
  const seconds = Math.floor(diffMs / 1000);
  const minutes = Math.floor(diffMs / (1000 * 60));
  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const weeks = Math.floor(days / 7);
  const months = Math.floor(days / 30.44);
  const years = Math.floor(days / 365.25);
  if (seconds < 10) return 'just now';
  if (seconds < 60) return `${seconds} second${seconds !== 1 ? 's' : ''} ago`;
  if (minutes < 60) return `${minutes} minute${minutes !== 1 ? 's' : ''} ago`;
  if (hours < 24) return `${hours} hour${hours !== 1 ? 's' : ''} ago`;
  if (days < 7) return `${days} day${days !== 1 ? 's' : ''} ago`;
  if (days < 30) return `${weeks} week${weeks !== 1 ? 's' : ''} ago`;
  if (days < 365) return `${months} month${months !== 1 ? 's' : ''} ago`;
  return `over a year ago`;
}
function getValidationColor(dateStr) {
  const now = new Date();
  const then = new Date(dateStr);
  const diffMonths = (now - then) / (1000 * 60 * 60 * 24 * 30.44);
  if (diffMonths <= 6) return 'green';
  if (diffMonths <= 12) return 'orange';
  return 'red';
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
  const service = services.find(s => s.name && normalize(s.name) === normalized);
  if (!service) return;
  const firstValid = service.HolidaySchedules?.[0]?.createdAt || null;
  const locationId = service.ServiceAtLocation?.location_id;
  const serviceId = service.id;
  if (!firstValid || !locationId || !serviceId) return;
  const statusText = formatTimeAgo(firstValid);
  const color = getValidationColor(firstValid);
  const pTag = section.querySelector('p.text-dark.text-sm span');
 const alreadyInjected = section.querySelector('a[data-holiday-link]');
if (pTag && !alreadyInjected) {
  const dash = document.createTextNode(' – ');
  const link = document.createElement('a');
  link.href = `https://gogetta.nyc/team/location/${locationId}/services/${serviceId}/opening-hours`;
  link.textContent = statusText;
  link.setAttribute('data-holiday-link', 'true'); 
  Object.assign(link.style, {
    color: color,
    fontWeight: 'bold',
    marginLeft: '2px',
    textDecoration: 'underline',
  });
  pTag.after(dash, link);
}
});
document.querySelectorAll('div[id]').forEach(section => {
  const rawId = section.id;
  const normalized = normalize(rawId);
  const service = services.find(s => s.name && normalize(s.name) === normalized);
  if (!service || !service.EventRelatedInfos?.length) return;
  const infoBlock = section.querySelector('p.text-dark.text-sm.have-links.service-info');
  if (!infoBlock) return;
  const firstValid = service.EventRelatedInfos[0]?.createdAt;
  const locationId = service.ServiceAtLocation?.location_id;
  const serviceId = service.id;
  if (!firstValid || !locationId || !serviceId) return;
  const statusText = formatTimeAgo(firstValid);
  const color = getValidationColor(firstValid);
 const alreadyInjected = section.querySelector('a[data-otherinfo-link]');
if (infoBlock && !alreadyInjected) {
  const dashText = document.createTextNode(' – ');
  const link = document.createElement('a');
  link.href = `https://gogetta.nyc/team/location/${locationId}/services/${serviceId}/other-info`;
  link.textContent = statusText;
  link.setAttribute('data-otherinfo-link', 'true'); 
  Object.assign(link.style, {
    color: color,
    fontWeight: 'bold',
    marginLeft: '2px',
    textDecoration: 'underline',
  });
  infoBlock.after(dashText, link);
}
});
document.querySelectorAll('div[id]').forEach(async section => {
  const rawId = section.id;
  const normalized = normalize(rawId);
  const service = services.find(s => s.name && normalize(s.name) === normalized);
  if (!service) return;

  const locationId = service.ServiceAtLocation?.location_id;
  const serviceId = service.id;
  if (!locationId || !serviceId) return;

  try {
    const res = await fetch(`https://w6pkliozjh.execute-api.us-east-1.amazonaws.com/prod/locations/${locationId}`);
    const fullLocation = await res.json();
    const matchingService = fullLocation?.Services?.find(s => s.id === serviceId);
    const metadataList = matchingService?.metadata?.service;

    if (!Array.isArray(metadataList)) {
      console.warn(`[⚠️ Missing metadata.service for] ${service.name}`);
      return;
    }

    const lastDescriptionUpdate = metadataList.find(f => f.field_name === 'description')?.last_action_date;
    if (!lastDescriptionUpdate) {
      console.warn(`[⚠️ Missing description update for] ${service.name}`);
      return;
    }

    const pTag = section.querySelector('p.text-sm.text-dark.mb-4.have-links');
    if (!pTag) return;

    // Remove duplicates (optional safety net)
    const links = section.querySelectorAll('a[data-description-link]');
    links.forEach((link, i) => {
      if (i > 0) link.remove(); // remove all but the first
    });

    const alreadyInjected = links.length > 0;
    if (!alreadyInjected) {
      const statusText = formatTimeAgo(lastDescriptionUpdate);
      const color = getValidationColor(lastDescriptionUpdate);
      const dash = document.createTextNode(' – ');
      const link = document.createElement('a');
      link.href = `https://gogetta.nyc/team/location/${locationId}/services/${serviceId}/description`;
      link.textContent = statusText;
      link.setAttribute('data-description-link', 'true');
      Object.assign(link.style, {
        color: color,
        fontWeight: 'bold',
        marginLeft: '2px',
        textDecoration: 'underline',
      });
      pTag.after(dash, link);
    }

  } catch (err) {
    console.error(`[⚠️ Failed to fetch full location for description update]`, err);
  }
});

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
    document.querySelectorAll('[data-yp-button]').forEach(btn => btn.remove());
    document.querySelectorAll('[data-yp-container]').forEach(container => container.remove());
    document.querySelectorAll('.yp-service-edit-btn').forEach(btn => btn.remove());
    const isYourPeer = host === 'yourpeer.nyc';
    const isGoGetta = host === 'gogetta.nyc' || host === 'gogetta.nyc';
    
    if (!isYourPeer && !isGoGetta) return;
    if (isYourPeer && !path.startsWith('/locations')) return;

    if (!slug&& isYourPeer) {
      // Create hover button for YourPeer pages without location
      const hoverButton = document.createElement('button');
      hoverButton.textContent = 'Hover';
      hoverButton.setAttribute('data-yp-container', 'true');
      Object.assign(hoverButton.style, {
        position: 'fixed',
        bottom: '0px',
        right: '0px',
        zIndex: '9999',
        padding: '4px 8px',
        fontSize: '11px',
        background: '#fff',
        border: '1px solid black',
        borderRight: 'none',
        borderBottom: 'none',
        borderRadius: '4px 0 0 0',
        boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
        cursor: 'pointer',
        transition: 'all 0.2s ease'
      });

      // Simple button for Go to Getta only
      const goToGettaBtn = document.createElement('button');
      goToGettaBtn.textContent = 'Go to Getta';
      goToGettaBtn.setAttribute('data-yp-button', 'true');
      Object.assign(goToGettaBtn.style, {
        position: 'fixed',
        bottom: '50px',
        right: '0px',
        zIndex: '9998',
        padding: '10px 16px',
        fontSize: '13px',
        background: '#fff',
        border: '2px solid black',
        borderRadius: '4px',
        boxShadow: '0 2px 6px rgba(0,0,0,0.15)',
        cursor: 'pointer',
        opacity: '0',
        transform: 'translateY(20px)',
        transition: 'all 0.3s ease',
        pointerEvents: 'none'
      });

      goToGettaBtn.addEventListener('click', () => {
        window.location.href = 'https://gogetta.nyc/team';
      });

      // Hover functionality
      let hoverTimeout;
      const showButton = () => {
        clearTimeout(hoverTimeout);
        goToGettaBtn.style.opacity = '1';
        goToGettaBtn.style.transform = 'translateY(0)';
        goToGettaBtn.style.pointerEvents = 'auto';
      };

      const hideButton = () => {
        hoverTimeout = setTimeout(() => {
          goToGettaBtn.style.opacity = '0';
          goToGettaBtn.style.transform = 'translateY(20px)';
          goToGettaBtn.style.pointerEvents = 'none';
        }, 300);
      };

      hoverButton.addEventListener('mouseenter', showButton);
      hoverButton.addEventListener('mouseleave', hideButton);
      goToGettaBtn.addEventListener('mouseenter', () => clearTimeout(hoverTimeout));
      goToGettaBtn.addEventListener('mouseleave', hideButton);

      document.body.appendChild(hoverButton);
      document.body.appendChild(goToGettaBtn);
      return;
    }
    try {
      const res = await fetch(`https://w6pkliozjh.execute-api.us-east-1.amazonaws.com/prod/locations-by-slug/${slug}`);
      const json = await res.json();
      const uuid = json?.id;
      if (!uuid) return;
      // 🔹 Show draggable read-only note overlay
try {
  const NOTE_API = "https://locationnote1-iygwucy2fa-uc.a.run.app";
  const noteRes = await fetch(`${NOTE_API}?uuid=${uuid}`);
  const noteData = await noteRes.json(); // noteData is expected to be { user1: { "YYYY-MM-DD": "note" }, ... }

  let allNotesContent = "";
  if (noteData && typeof noteData === 'object' && Object.keys(noteData).length > 0) {
      const notesArray = [];
      for (const user in noteData) {
          if (typeof noteData[user] === 'object') {
              for (const date in noteData[user]) {
                  notesArray.push({
                      user: user,
                      date: date,
                      note: noteData[user][date]
                  });
              }
          }
      }
      notesArray.sort((a, b) => new Date(a.date) - new Date(b.date));
      allNotesContent = notesArray.map(n => `${n.user} (${n.date}): ${n.note}`).join("\n\n");
  }

  const note = document.createElement("div");
  note.id = "yp-note-overlay";
  note.textContent = allNotesContent || "(No notes available for this location)"; // Updated to use allNotesContent
Object.assign(note.style, {
  position: "fixed",
  top: "100px",
  right: "20px",
  width: "300px",
  height: "150px",
  background: "#fff",
  border: "2px solid #000",
  borderRadius: "8px",
  padding: "10px",
  fontSize: "14px",
  overflowY: "auto",        // vertical scroll enabled
  overflowX: "hidden",      // horizontal scroll disabled
  boxShadow: "0 2px 6px rgba(0,0,0,0.2)",
  zIndex: 9999,
  cursor: "move",
  userSelect: "text",
  whiteSpace: "pre-wrap",   // preserve line breaks but wrap long lines
  wordBreak: "break-word"   // force long words to wrap instead of overflow
});


  let offsetX = 0, offsetY = 0, isDragging = false;
  note.addEventListener("mousedown", (e) => {
    isDragging = true;
    offsetX = e.clientX - note.getBoundingClientRect().left;
    offsetY = e.clientY - note.getBoundingClientRect().top;
    e.preventDefault();
  });
  document.addEventListener("mousemove", (e) => {
    if (!isDragging) return;
    note.style.left = `${e.clientX - offsetX}px`;
    note.style.top = `${e.clientY - offsetY}px`;
  });
  document.addEventListener("mouseup", () => {
    isDragging = false;
  });

  document.body.appendChild(note);
} catch (err) {
  console.error("🛑 Failed to load note overlay:", err);
}

      const baseUrl = `https://gogetta.nyc/team/location/${uuid}`;
      const isClosed = document.querySelector('p.text-dark.mb-0\\.5.font-medium.text-sm')?.textContent.trim() === 'Closed';
      // Create hover button to expose YP buttons
      const hoverButton = document.createElement('button');
      hoverButton.textContent = 'Hover';
      hoverButton.setAttribute('data-yp-container', 'true');
      Object.assign(hoverButton.style, {
        position: 'fixed',
        bottom: '0px',
        right: '0px',
        zIndex: '9999',
        padding: '4px 8px',
        fontSize: '11px',
        background: '#fff',
        border: '1px solid black',
        borderRight: 'none',
        borderBottom: 'none',
        borderRadius: '4px 0 0 0',
        boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
        cursor: 'pointer',
        transition: 'all 0.2s ease'
      });

      // Create the actual YP buttons (initially hidden) - dynamic based on URL and context
      const buttonData = [];
      
      // Core editing options
      buttonData.push(
        { text: 'Edit Services', target: 'recap' },
        { text: 'Add/Delete Services', target: 'services' },
        { text: 'Edit Location', target: 'edit' }
      );
      
      // Navigation options based on current context
      const url = new URL(window.location.href);
      const currentPath = url.pathname;
      const searchParams = url.searchParams;
      
      // Add navigation options based on current page context
      if (currentPath === '/locations' && searchParams.get('sortBy') === 'recentlyUpdated') {
        // On outdated pages listing, show lastpage navigation
        buttonData.push({ text: 'Go to Last Page', target: 'lastPageDirect' });
      } else {
        // On individual location pages, show only most outdated page option
        buttonData.push({ text: 'Most outdated page', target: 'mostOutdated' });
      }
      
      // Add Go to Getta button for YourPeer pages
      buttonData.push({ text: 'Go to Getta', target: 'goToGetta' });
      
      // Conditional closure button
      if (isClosed) {
        buttonData.push({ text: 'Open Location', target: 'closureInfo' });
      }
      
      console.log('Creating YourPeer hover menu');
      console.log('YP Button Data:', buttonData);

      const ypButtons = [];
      buttonData.forEach((data, index) => {
        const btn = document.createElement('button');
        btn.textContent = data.text;
        btn.setAttribute('data-yp-button', 'true');
        Object.assign(btn.style, {
          position: 'fixed',
          bottom: `${50 + (index * 50)}px`,
          right: '0px',
          zIndex: '9998',
          padding: '10px 16px',
          fontSize: '13px',
          background: '#fff',
          border: '2px solid black',
          borderRadius: '4px',
          boxShadow: '0 2px 6px rgba(0,0,0,0.15)',
          cursor: 'pointer',
          opacity: '0',
          transform: 'translateY(20px)',
          transition: 'all 0.3s ease',
          pointerEvents: 'none'
        });

        btn.addEventListener('click', () => {
          if (data.target === 'mostOutdated') {
            const preloadUrl = "https://yourpeer.nyc/locations?sortBy=recentlyUpdated&page=70";
            window.location.href = preloadUrl;

            const timeout = 10000;
            const observer = new MutationObserver((mutationsList, obs) => {
              const spanParent = document.querySelector("div.flex.items-center.justify-between > div.text-dark.font-medium");
              if (spanParent) {
                const spans = spanParent.querySelectorAll("span");
                if (spans.length === 3) {
                  const totalPagesText = spans[2].textContent.trim();
                  const totalPages = parseInt(totalPagesText, 10);
                  if (!isNaN(totalPages)) {
                    obs.disconnect();
                    clearTimeout(observerTimeout);
                    const finalUrl = `https://yourpeer.nyc/locations?sortBy=recentlyUpdated&page=${totalPages}`;
                    if (window.location.href !== finalUrl) {
                      window.location.href = finalUrl;
                    }
                  }
                }
              }
            });

            observer.observe(document.body, { childList: true, subtree: true });

            const observerTimeout = setTimeout(() => {
              observer.disconnect();
              console.warn("⏳ Timeout: Did not find pagination element.");
            }, timeout);
          } else if (data.target === 'lastPage') {
            // Navigate to the last page of outdated locations
            const preloadUrl = "https://yourpeer.nyc/locations?sortBy=recentlyUpdated&page=70";
            window.location.href = preloadUrl;

            const timeout = 10000;
            const observer = new MutationObserver((mutationsList, obs) => {
              const spanParent = document.querySelector("div.flex.items-center.justify-between > div.text-dark.font-medium");
              if (spanParent) {
                const spans = spanParent.querySelectorAll("span");
                if (spans.length === 3) {
                  const totalPagesText = spans[2].textContent.trim();
                  const totalPages = parseInt(totalPagesText, 10);
                  if (!isNaN(totalPages)) {
                    obs.disconnect();
                    clearTimeout(observerTimeout);
                    const finalUrl = `https://yourpeer.nyc/locations?sortBy=recentlyUpdated&page=${totalPages}`;
                    if (window.location.href !== finalUrl) {
                      window.location.href = finalUrl;
                    }
                  }
                }
              }
            });

            observer.observe(document.body, { childList: true, subtree: true });

            const observerTimeout = setTimeout(() => {
              observer.disconnect();
              console.warn("⏳ Timeout: Did not find pagination element.");
            }, timeout);
          } else if (data.target === 'lastPageDirect') {
            // Direct navigation to last page (used when already on locations page)
            const timeout = 5000;
            const observer = new MutationObserver((mutationsList, obs) => {
              const spanParent = document.querySelector("div.flex.items-center.justify-between > div.text-dark.font-medium");
              if (spanParent) {
                const spans = spanParent.querySelectorAll("span");
                if (spans.length === 3) {
                  const totalPagesText = spans[2].textContent.trim();
                  const totalPages = parseInt(totalPagesText, 10);
                  if (!isNaN(totalPages)) {
                    obs.disconnect();
                    clearTimeout(observerTimeout);
                    const currentUrl = new URL(window.location.href);
                    currentUrl.searchParams.set('page', totalPages.toString());
                    window.location.href = currentUrl.toString();
                  }
                }
              }
            });

            // If pagination is already loaded, try to get the last page immediately
            const spanParent = document.querySelector("div.flex.items-center.justify-between > div.text-dark.font-medium");
            if (spanParent) {
              const spans = spanParent.querySelectorAll("span");
              if (spans.length === 3) {
                const totalPagesText = spans[2].textContent.trim();
                const totalPages = parseInt(totalPagesText, 10);
                if (!isNaN(totalPages)) {
                  const currentUrl = new URL(window.location.href);
                  currentUrl.searchParams.set('page', totalPages.toString());
                  window.location.href = currentUrl.toString();
                  return;
                }
              }
            }

            // If not immediately available, observe for changes
            observer.observe(document.body, { childList: true, subtree: true });

            const observerTimeout = setTimeout(() => {
              observer.disconnect();
              console.warn("⏳ Timeout: Did not find pagination element for direct navigation.");
            }, timeout);
          } else if (data.target === 'goToGetta') {
            window.location.href = 'https://gogetta.nyc/team';
          } else {
            const finalUrl = {
              edit: `${baseUrl}`,
              services: `${baseUrl}/services`,
              recap: `${baseUrl}/services/recap`,
              closure: `${baseUrl}/closureInfo`
            }[data.target] || baseUrl;
            chrome.storage?.local?.set?.({ redirectEnabled: false }, () => {
              sessionStorage.setItem('ypNeedsRedirectReenable', 'true');
              sessionStorage.setItem('ypSkipBackgroundRedirect', 'true');
              window.location.href = finalUrl;
            });
          }
        });

        ypButtons.push(btn);
        document.body.appendChild(btn);
      });

      // Hover functionality to show/hide buttons
      let hoverTimeout;
      const showButtons = () => {
        clearTimeout(hoverTimeout);
        ypButtons.forEach((btn, index) => {
          setTimeout(() => {
            btn.style.opacity = '1';
            btn.style.transform = 'translateY(0)';
            btn.style.pointerEvents = 'auto';
          }, index * 100);
        });
      };

      const hideButtons = () => {
        hoverTimeout = setTimeout(() => {
          ypButtons.forEach((btn) => {
            btn.style.opacity = '0';
            btn.style.transform = 'translateY(20px)';
            btn.style.pointerEvents = 'none';
          });
        }, 300);
      };

      hoverButton.addEventListener('mouseenter', showButtons);
      hoverButton.addEventListener('mouseleave', hideButtons);

      // Also keep buttons visible when hovering over them
      ypButtons.forEach(btn => {
        btn.addEventListener('mouseenter', () => clearTimeout(hoverTimeout));
        btn.addEventListener('mouseleave', hideButtons);
      });

      document.body.appendChild(hoverButton);
      
      if (slug) {
        await injectServiceEditButtons(slug, uuid, json?.Services || []);
      }
    } catch (err) {
      console.error('[YP] ❌ Failed to inject buttons:', err);
    }
  }
  await injectButtons();
  onUrlChange(() => {
    injectButtons();
  });
})();