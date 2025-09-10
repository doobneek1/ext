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
  link.href = `https://www.gogetta.nyc/team/location/${locationId}/services/${serviceId}/opening-hours`;
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
  link.href = `https://www.gogetta.nyc/team/location/${locationId}/services/${serviceId}/other-info`;
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
      link.href = `https://www.gogetta.nyc/team/location/${locationId}/services/${serviceId}/description`;
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
        const url = `https://www.gogetta.nyc/team/location/${locationId}/services/${serviceId}`;
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
    document.querySelectorAll('.yp-service-edit-btn').forEach(btn => btn.remove());
    if (host !== 'test.yourpeer.nyc' || !path.startsWith('/locations')) return;
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
        window.location.href = 'https://www.gogetta.nyc/team';
      });
      document.body.appendChild(btn);
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

      const baseUrl = `https://www.gogetta.nyc/team/location/${uuid}`;
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
      if (isClosed) createYPButton('Open Location', 'closureInfo', 120);
      await injectServiceEditButtons(slug, uuid, json?.Services || []);}
    } catch (err) {
      console.error('[YP] ❌ Failed to inject buttons:', err);
    }
  }
  await injectButtons();
  onUrlChange(() => {
    injectButtons();
  });
})();