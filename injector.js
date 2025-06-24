
(function () {
  const currentHost = location.hostname;
  const currentPath = location.pathname;
  const lastPath = sessionStorage.getItem('formatterLastPath');
// async function fetchTitleFromFindPage(uuid) {
//   console.log('[YPButton] Fetching title from /find page for UUID:', uuid);
//   try {
//     const res = await fetch(`https://gogetta.nyc/find/location/${uuid}`, {
//       credentials: 'include' // in case auth is required
//     });
//     const html = await res.text();
//     const doc = new DOMParser().parseFromString(html, 'text/html');

//     const titleEl = doc.querySelector('h1.locationTitle span');
//     const textNodes = [...(titleEl?.childNodes || [])]
//       .filter(n => n.nodeType === Node.TEXT_NODE)
//       .map(n => n.textContent.trim())
//       .filter(Boolean);

//     const name = textNodes.join('');
//     if (!name) {
//       console.warn('[YPButton] Could not extract title from fetched /find page');
//       return null;
//     }

//     console.log('[YPButton] Fallback title extracted from /find page:', name);
//     return name;
//   } catch (e) {
//     console.error('[YPButton] Failed to fetch or parse /find page:', e);
//     return null;
//   }
// }

// function toggleFrontendEditMode() {
// console.log('[YPButton] Script started');

//   // 🔍 Extract location title from GoGetta




//   // 🔁 Check and return valid YourPeer match
// async function tryYourPeerSearch(name, uuid, makeButton) {
// if (!name) {
//   console.warn('[YPButton] Skipping YP search: empty location name');
//   return; // Button already exists, no need to create fallback again
// }
//   const encoded = encodeURIComponent(name);
//   const cachedLink = localStorage.getItem(`uuidToYpLink_${uuid}`);

//  if (cachedLink && await verifyYpUrl(cachedLink)) {
//   console.log('[YPButton] Using cached YourPeer link');
//   makeButton('Show on YP', () => window.location.href = cachedLink);
//   return;
// }
// else {
//     localStorage.removeItem(`uuidToYpLink_${uuid}`);
//   }

//   const link = await findValidYpLink(encoded);
// if (link) {
//   console.log('[YPButton] Found valid YourPeer link:', link);

//   localStorage.setItem(`uuidToYpLink_${uuid}`, link);

//   const slug = link.split('/locations/')[1]?.split('?')[0];
//   if (slug) {
//     localStorage.setItem(`ypToUuid_${slug}`, uuid);
//   }

// makeButton('Show on YP', () => {
//   console.log('[YPButton] Redirecting to:', link);
//   window.location.href = link;
// });
// } else {
//   console.warn('[YPButton] No valid YourPeer match found for:', name);
//   // No need to re-create or re-update fallback button — it already exists
// }

// }



//   async function verifyYpUrl(url) {
//     try {
//       const res = await fetch(url);
//       const html = await res.text();
//       return !html.includes('Oops!') && !html.includes("We can’t seem to find");
//     } catch {
//       return false;
//     }
//   }

// async function findValidYpLink(encodedQuery) {
//   for (let page = 1; page <= 5; page++) {
//     const pageParam = page === 1 ? '' : `&page=${page}`;
//     const url = `https://yourpeer.nyc/locations?search=${encodedQuery}${pageParam}`;
//     console.log(`[YPButton] Searching YP page ${page}: ${url}`);

//     try {
//       const res = await fetch(url);
//       const html = await res.text();

//       if (html.includes("No item found. Please try to change filters.")) {
//         console.log(`[YPButton] Page ${page} returned 'no items'`);
//         break; // no point in continuing
//       }

//       const doc = new DOMParser().parseFromString(html, 'text/html');
//       const match = doc.querySelector('ul#locations li a[href^="/locations/"]');

//       if (match) {
//         const href = match.getAttribute('href');
//         console.log(`[YPButton] Match found on page ${page}: ${href}`);
//         return `https://yourpeer.nyc${href}`;
//       } else {
//         console.log(`[YPButton] No match found on page ${page}`);
//       }
//     } catch (err) {
//       console.error(`[YPButton] Failed to fetch or parse page ${page}`, err);
//     }
//   }

//   console.warn('[YPButton] No valid link found across all pages');
//   return null;
// }


//   // 🧭 Main GoGetta logic
//   const host = location.hostname;
//   if (host === 'gogetta.nyc') {
//     const teamMatch = location.pathname.match(/^\/team\/location\/([a-f0-9-]+)/);
//     const findMatch = location.pathname.match(/^\/find\/location\/([a-f0-9-]+)/);
//     const uuid = (teamMatch || findMatch)?.[1];
//     if (!uuid) return;

//     const currentMode = teamMatch ? 'edit' : 'view';

//     const targetUrl = currentMode === 'edit'
//       ? `https://gogetta.nyc/find/location/${uuid}`
//       : `https://gogetta.nyc/team/location/${uuid}`;

//     const makeButton = (text, onClick, offset = 0) => {
//       const btn = document.createElement('button');
//       btn.textContent = text;
//       btn.style.position = 'fixed';
//       btn.style.bottom = `${20 + offset}px`;
//       btn.style.left = '20px';
//       btn.style.zIndex = '9999';
//       btn.style.padding = '10px 16px';
//       btn.style.fontSize = '13px';
//       btn.style.background = '#fff';
//       btn.style.border = '2px solid black';
//       btn.style.borderRadius = '4px';
//       btn.style.boxShadow = '0 2px 6px rgba(0,0,0,0.15)';
//       btn.style.cursor = 'pointer';
//       document.body.appendChild(btn);
//       btn.addEventListener('click', onClick);
//     };

// makeButton(
//   currentMode === 'edit' ? 'Switch to Frontend Mode' : 'Switch to Edit Mode',
//   () => {
//     if (currentMode === 'edit') {
//       // Mark that we're switching from edit to view (team → find)
//       localStorage.setItem('arrivedViaFrontendRedirect', 'true');
//     } else if (currentMode === 'view') {
//       // If we arrived here via redirect, go back instead of forcing reload
//       const arrivedViaRedirect = localStorage.getItem('arrivedViaFrontendRedirect') === 'true';
//       if (arrivedViaRedirect) {
//         localStorage.removeItem('arrivedViaFrontendRedirect');
//         history.back();
//         return;
//       }
//     }

//     // Fallback: regular navigation
//     window.location.href = targetUrl;
//   }
// );



// let ypBtn;
// const defaultUrl = 'https://yourpeer.nyc/locations?sortBy=nearby';
// makeButton('Show on YP', () => {
//   console.log('[YPButton] No match found. Going to default:', defaultUrl);
//   window.location.href = defaultUrl;
// });

// // Save reference to the last button made (so we can edit it later)
// ypBtn = [...document.querySelectorAll('button')]
//   .find(b => b.textContent === 'Show on YP' && b.style.bottom === '60px');

// // Run the async lookup and update the button if successful
// extractLocationName(uuid, currentMode, (rawName) => {
//   if (rawName && ypBtn) {
//     tryYourPeerSearch(rawName, uuid, (label, handler) => {
//       ypBtn.textContent = label;
//       ypBtn.onclick = handler;
//     });
//   }
// });


//   }

// // 🔁 Show in GoGetta button from anywhere on YP
// if (host === 'yourpeer.nyc') {
//   const slug = location.pathname.startsWith('/locations/') ? location.pathname.split('/locations/')[1] : null;

//   // Always inject the button immediately
//   const btn = document.createElement('button');
//   btn.textContent = 'Show in GoGetta';
//   btn.style.position = 'fixed';
//   btn.style.bottom = '20px';
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

//   // Default action: GoGetta homepage
//   btn.addEventListener('click', () => {
//     console.log('[GoGettaButton] Default redirect to https://gogetta.nyc/team');
//     window.location.href = 'https://gogetta.nyc/team';
//   });

//   // Enhance the click behavior after DOM settles
//   setTimeout(() => {
//     const locationName = document.querySelector('h1#location_name')?.textContent.trim();
//     const locationSub = document.querySelector('p[x-text*="location_name"]')?.textContent.trim();

//     // If we’re on a location page and have a cached UUID, override
//     if (slug) {
//       const cachedUuid = localStorage.getItem(`ypToUuid_${slug}`);
//       if (cachedUuid) {
//         console.log('[GoGettaButton] Cached UUID found:', cachedUuid);
//         btn.onclick = () => {
//           window.location.href = `https://gogetta.nyc/team/location/${cachedUuid}`;
//         };
//         return;
//       }
//     }

//     // If we have enough data, enhance with search-injection
//     if (locationName && locationSub) {
//       console.log('[GoGettaButton] Will try live GoGetta match for:', locationName);
// btn.onclick = async () => {
//   console.log('[GoGettaButton] Attempting silent GoGetta lookup...');

//   if (!locationName || !locationSub) {
//     console.warn('[GoGettaButton] Missing data. Fallback to homepage.');
//     window.location.href = 'https://gogetta.nyc/team';
//     return;
//   }

//   const query = encodeURIComponent(locationName);
//   const url = `https://gogetta.nyc/team?search=${query}`;

//   try {
//     const res = await fetch(url, { credentials: 'include' });
//     const html = await res.text();
//     const doc = new DOMParser().parseFromString(html, 'text/html');

//     const options = [...doc.querySelectorAll('.Dropdown-item')];
//     const match = options.find(el =>
//       el.textContent.includes(locationName) &&
//       el.textContent.includes(locationSub)
//     );

//     if (match) {
//       const uuid = match.getAttribute('data-uuid');
//       if (slug && uuid) {
//         localStorage.setItem(`ypToUuid_${slug}`, uuid);
//         console.log('[GoGettaButton] UUID mapped silently:', slug, '→', uuid);
//         window.location.href = `https://gogetta.nyc/team/location/${uuid}`;
//         return;
//       }
//     }

//     console.warn('[GoGettaButton] Match not found, fallback to homepage');
//     window.location.href = 'https://gogetta.nyc/team';

//   } catch (err) {
//     console.error('[GoGettaButton] Error fetching GoGetta search results:', err);
//     window.location.href = 'https://gogetta.nyc/team';
//   }
// };

//     } else {
//       console.log('[GoGettaButton] Not enough data to enhance click handler, using fallback.');
//     }
//   }, 300);
// }


// }
// async function autoMapGoGettaToYourPeer() {
//   const host = location.hostname;
//   if (host !== 'gogetta.nyc') return;

//   const match = location.pathname.match(/^\/(team|find)\/location\/([a-f0-9-]+)/);
//   if (!match) return;

//   const [, , uuid] = match;

//   // Skip if already linked
//   if (localStorage.getItem(`uuidToYpLink_${uuid}`)) {
//     console.log('[AutoMap] Already linked, skipping...');
//     return;
//   }

//   const findUrl = `https://gogetta.nyc/find/location/${uuid}`;

//   try {
//     const res = await fetch(findUrl, { credentials: 'include' });
//     const html = await res.text();
//     const doc = new DOMParser().parseFromString(html, 'text/html');

//     const titleEl = doc.querySelector('h1.locationTitle span');
//     const orgEl = doc.querySelector('h2.orgTitle span');

//     const locationName = [...(titleEl?.childNodes || [])]
//       .filter(n => n.nodeType === Node.TEXT_NODE)
//       .map(n => n.textContent.trim())
//       .filter(Boolean).join('');

//     const orgName = [...(orgEl?.childNodes || [])]
//       .filter(n => n.nodeType === Node.TEXT_NODE)
//       .map(n => n.textContent.trim())
//       .filter(Boolean).join('');

//     if (!locationName) {
//       console.warn('[AutoMap] Missing location name, skipping...');
//       return;
//     }

//     const encoded = encodeURIComponent(locationName);
//     const link = await findValidYpLink(encoded);

//     if (link) {
//       const slug = link.split('/locations/')[1]?.split('?')[0];
//       localStorage.setItem(`uuidToYpLink_${uuid}`, link);
//       if (slug) {
//         localStorage.setItem(`ypToUuid_${slug}`, uuid);
//         console.log('[AutoMap] ✅ Linked:', uuid, '↔', slug);
//       }
//     } else {
//       console.log('[AutoMap] No match found for:', locationName);
//     }
//   } catch (err) {
//     console.error('[AutoMap] Failed:', err);
//   }
// }


// window.addEventListener('load', () => {
//   toggleFrontendEditMode();
//   autoMapGoGettaToYourPeer(); // <-- call your new function
// });

if (location.hostname.includes('mail.google.com')) {

  let injectionTimeout;
  const gmailObserver = new MutationObserver(() => {
    clearTimeout(injectionTimeout);
    injectionTimeout = setTimeout(() => {
      const composeDialogs = [...document.querySelectorAll('div[role="dialog"]')];
      const visible = composeDialogs.find(d => d.offsetParent !== null);
      const subject = visible?.querySelector('input[name="subjectbox"]');
      const body = visible?.querySelector('[aria-label="Message Body"][contenteditable="true"]');
      const alreadyInjected = document.getElementById('gmailEmailComposerForm');

      if (subject && body && !alreadyInjected) {
        console.log('[Formatter] Gmail compose window detected. Injecting...');
        injectGmailComposerUI(subject, body);
      }
    }, 300); // debounce: wait for elements to fully render
  });

  gmailObserver.observe(document.body, {
    childList: true,
    subtree: true
  });

  return;
}


  // ✅ For all other domains (GoGetta, etc.)
  if (lastPath !== currentPath) {
    sessionStorage.setItem('formatterLastPath', currentPath);
    console.log('[Formatter] Path changed, reloading page for injection...');
    location.reload();
    return;
  }

  // ✅ Safe fallback: inject after short delay if not reloading
  setTimeout(() => {
    injectFormatterUI();
  }, 500);
  // === CORE INJECTION FUNCTION ===
  function injectFormatterUI() {
    const textareas = document.querySelectorAll('textarea.TextArea-fluid');

    textareas.forEach((textarea) => {
      if (textarea.nextSibling?.classList?.contains('formatter-button-row')) return;

      let lastValue = textarea.value;
      let isConverted = false;

      const wrapper = document.createElement('div');
      wrapper.className = 'formatter-button-row';
      wrapper.style.marginTop = '10px';
      wrapper.style.display = 'flex';
      wrapper.style.flexWrap = 'wrap';
      wrapper.style.gap = '6px';
      wrapper.style.alignItems = 'flex-start';
      wrapper.style.flexDirection = 'row';

      const buttonRow = document.createElement('div');
      buttonRow.style.display = 'flex';
      buttonRow.style.flexWrap = 'wrap';
      buttonRow.style.gap = '6px';

      const output = document.createElement('div');
      output.className = 'formatter-preview';
      output.style.marginTop = '10px';
      output.style.border = '2px solid black';
      output.style.padding = '10px';
      output.style.minHeight = '60px';
      output.style.fontSize = '14px';
      output.style.fontFamily = 'sans-serif';
      output.style.width = '70%';

      const instructions = document.createElement('div');
      instructions.style.marginTop = '10px';
      instructions.style.border = '2px solid black';
      instructions.style.padding = '10px';
      instructions.style.minHeight = '60px';
      instructions.style.fontSize = '14px';
      instructions.style.fontFamily = 'sans-serif';
      instructions.style.width = '30%';
      instructions.style.position = 'fixed';
      instructions.style.right = '0';
      instructions.style.top = '10px';
      instructions.style.zIndex = '9999';
      instructions.style.backgroundColor = 'white';
      instructions.style.overflowY = 'auto';
      instructions.style.cursor = 'move';
      instructions.innerHTML = `
        <style>
    .rainbow-word {
      font-weight: bold;
      text-decoration: underline;
      color: transparent;
      background: linear-gradient(to right, red, orange, yellow, green, blue, indigo, violet);
      -webkit-background-clip: text;
      background-clip: text;
      white-space: nowrap;
      display: inline-block;
    }
  </style>  
      <strong>Instructions:</strong>
        <ul>
          <li>Start lines with <strong>-</strong> for em-dash bullets <code>&lt;br&gt;&emsp;— </code></li>
               <li>Use double line breaks to insert <code>&lt;br&gt;</code></li>
          <li>Use single line breaks to insert <code>•</code></li>
          <li>Type links (with or without <code>https://</code>, <code>http://</code> or <code>www.</code>), numbers (any format, but if you wnat to add extension, type <code>,extension_number</code> immediatley after the number), and emails and it all will be converted as soon as you hit <button style="padding: 4px 10px; font-size: 12px; border: 2px solid black; background: white; cursor: default;" disabled>Convert</button></li>
          <li>Hit <button style="padding: 4px 10px; font-size: 12px; border: 2px solid black; background: white; cursor: default;" disabled>+ Services Include</button> or other buttons starting with <strong>+</strong> to inject commonly used sentences into your text</li>
<li>
  Use <strong>|(label)</strong> at the end of the link to customize text.
  Example:
 <strong>
        yourpeer.nyc/<span class="rainbow-word">doobneek</span>/
        |(Visit <a href="https://doobneek.org" target="_blank" rel="noopener noreferrer" class="rainbow-word">doobneek.org</a>)
      </strong>
  will convert to
  <code>
    &lt;a href="https://yourpeer.nyc/<span style="font-weight: bold; color: red;">d</span><span style="font-weight: bold; color: orange;">o</span><span style="font-weight: bold; color: yellow;">o</span><span style="font-weight: bold; color: green;">b</span><span style="font-weight: bold; color: blue;">n</span><span style="font-weight: bold; color: cyan;">e</span><span style="font-weight: bold; color: violet;">e</span><span style="font-weight: bold; color: deeppink;">k</span>/"&gt;Visit <span style="font-weight: bold; color: red;">d</span><span style="font-weight: bold; color: orange;">o</span><span style="font-weight: bold; color: yellow;">o</span><span style="font-weight: bold; color: green;">b</span><span style="font-weight: bold; color: blue;">n</span><span style="font-weight: bold; color: cyan;">e</span><span style="font-weight: bold; color: violet;">e</span><span style="font-weight: bold; color: deeppink;">k</span>.org&lt;/a&gt;
  </code>
</li>

          <li>Use <code>1a-1230p</code> for <strong>1:00 AM — 12:30 PM</strong></li>
          <li>Use <code>age(18)</code> for <strong>Age requirement: 18+</strong>, <code>age(-18)</code> for <strong>Age requirement: 0-18 (until your 19th birthday)</strong>, or <code>age(11-18)</code> for <strong>Age requirement: 11-18 (until your 19th birthday)</strong></li>
<li>Hit <button style="padding: 4px 10px; font-size: 12px; border: 2px solid black; background: white; cursor: default;" disabled>Convert</button> or use a shortcut <code>Ctrl+Enter</code> to standardize all your input</li>

          </ul>`;

const savedPosition = JSON.parse(localStorage.getItem('gmailComposerPosition')) || { top: '10px', left: '90%' };

// Clamp top to avoid hidden handle
const topPx = parseInt(savedPosition.top);
instructions.style.top = `${Math.max(0, isNaN(topPx) ? 10 : topPx)}px`;
instructions.style.left = savedPosition.left;


      let isDragging = false, offsetX, offsetY;
      instructions.addEventListener('mousedown', (e) => {
        isDragging = true;
        offsetX = e.clientX - instructions.getBoundingClientRect().left;
        offsetY = e.clientY - instructions.getBoundingClientRect().top;
        document.body.style.userSelect = 'none';
      });
      document.addEventListener('mousemove', (e) => {
        if (isDragging) {
          const rightEdge = window.innerWidth - instructions.offsetWidth;
          const left = Math.max(0, Math.min(e.clientX - offsetX, rightEdge + instructions.offsetWidth * 0.8));
          const bottomEdge = window.innerHeight - instructions.offsetHeight;
          const top = Math.max(0, Math.min(e.clientY - offsetY, bottomEdge));
          
          instructions.style.left = `${left}px`;
          instructions.style.top = `${top}px`;
        }
      });
      document.addEventListener('mouseup', () => {
        isDragging = false;
        document.body.style.userSelect = 'auto';
        const position = { top: instructions.style.top, left: instructions.style.left };
        localStorage.setItem('instructionsPosition', JSON.stringify(position));
      });

      const addButton = (label, onClick, extraClass = '') => {
        const btn = document.createElement('button');
        btn.textContent = label;
        btn.style.padding = '6px 10px';
        btn.style.fontSize = '12px';
        btn.style.cursor = 'pointer';
        btn.style.border = '2px solid black';
        btn.style.background = 'white';
        btn.className = extraClass; // Apply the optional class
        btn.addEventListener('click', () => {
          if (label !== 'Undo') lastValue = textarea.value;
          onClick();
          textarea.focus();
          textarea.selectionStart = textarea.selectionEnd = textarea.value.length;
        });
        buttonRow.appendChild(btn);
      };
      

      addButton('Convert', () => {
        
        lastValue = textarea.value;
        const formatted = processText(lastValue);
        textarea.value = formatted;
        isConverted = true;
        dispatchInput(textarea);
        output.innerHTML = formatted.replace(/•/g, '<br>•');
      });

      addButton('Undo', () => {
        textarea.value = lastValue;
        isConverted = false;
        dispatchInput(textarea);
        output.innerHTML = previewText(lastValue);
      });

      addButton('+ Services Include', () => {
        textarea.value = `Services include:\n${textarea.value.trim()}`;
        dispatchInput(textarea); // 👈 make the change recognized
        output.innerHTML = previewText(textarea.value);
      });
      

      addButton('+ Metrocard Line', () => {
        textarea.value += `\n• If you are a Medicaid or Medicare recipient, see if you qualify for a Round-Trip MetroCard upon your visit.`;
        dispatchInput(textarea);
        output.innerHTML = previewText(textarea.value);
      });

      addButton('+ Criminal Risk Line', () => {
        textarea.value += `\n• If you are a non-citizen with a criminal record, please <a href="https://docs.google.com/document/d/e/2PACX-1vQ-cQznO83jSMzdwQoOOZMO22gOesH8YgiSo3GTzuRpHjMczqzzFz8JR23pM6_ZMG8khiGazWIcF-jA/pub" target="_blank" rel="noopener noreferrer">see if you might be at risk of deportation</a>.`;
        dispatchInput(textarea); // 👈 make the change recognized

        output.innerHTML = previewText(textarea.value);
      });

      addButton('+ Ineligibility Link', () => {
        textarea.value += `\n• If you are a non-citizen, please <a href="https://docs.google.com/document/d/e/2PACX-1vSRz4FT0ndCbqt63vO1Dq5Isj7FS4TZjw5NMc0gn8HCSg2gLx-MXD56X8Z56IDD5qbLX2_xzpwCqHaK/pub" target="_blank" rel="noopener noreferrer">see if you might qualify for this service</a>.`;
        dispatchInput(textarea); // 👈 make the change recognized

        output.innerHTML = previewText(textarea.value);
      });

      addButton('+ Survivor Benefits', () => {
        textarea.value += `\n• If you are a non-citizen and survived a crime, please <a href="https://docs.google.com/document/d/e/2PACX-1vSRz4FT0ndCbqt63vO1Dq5Isj7FS4TZjw5NMc0gn8HCSg2gLx-MXD56X8Z56IDD5qbLX2_xzpwCqHaK/pub" target="_blank" rel="noopener noreferrer">see if you might qualify for some immigration benefits</a>.`;
        dispatchInput(textarea); // 👈 make the change recognized

        output.innerHTML = previewText(textarea.value);
      });

      const convertBtn = [...buttonRow.children].find(btn => btn.textContent === 'Convert');
      const undoBtn = [...buttonRow.children].find(btn => btn.textContent === 'Undo');

      const updateButtonStates = () => {
        const formatted = processText(textarea.value);
        convertBtn.disabled = (formatted === textarea.value);
        undoBtn.disabled = (textarea.value === lastValue);
      };

      textarea.addEventListener('input', () => {
        updateButtonStates();
        output.innerHTML = previewText(textarea.value);
      });

      textarea.addEventListener('keydown', (e) => {
        if (e.ctrlKey && e.key === 'Enter') {
          e.preventDefault();
          lastValue = textarea.value;
          const formatted = processText(textarea.value);
          textarea.value = formatted;
          isConverted = true;
          dispatchInput(textarea);
          output.innerHTML = formatted.replace(/•/g, '<br>•');
        } 
      });

      wrapper.appendChild(buttonRow);
      wrapper.appendChild(output);
      wrapper.appendChild(instructions);
      textarea.parentNode.insertBefore(wrapper, textarea.nextSibling);
      output.innerHTML = previewText(textarea.value);
    });
  }

  // === Run on page load (fixes first-load issue) ===
  injectFormatterUI();
function findActiveGmailBodyField() {
  // Try normal compose window
  const dialogCompose = [...document.querySelectorAll('[role="dialog"]')]
    .find(d => d.offsetParent !== null)
    ?.querySelector('[aria-label="Message Body"][contenteditable="true"]');

  if (dialogCompose) return dialogCompose;

  // Fallback: detect inline reply box
  const replyBox = [...document.querySelectorAll('[aria-label="Message Body"][contenteditable="true"]')]
    .find(el => el.offsetParent !== null);

  return replyBox || null;
}


function injectGmailComposerUI() {
 
 const composeWindows = [...document.querySelectorAll('[role="dialog"]')];
const visibleCompose = composeWindows.find(win => win.offsetParent !== null);

const subjectField = visibleCompose?.querySelector('input[name="subjectbox"]');
const bodyField = visibleCompose?.querySelector('[aria-label="Message Body"][contenteditable="true"]');

 
  // const subjectField = document.querySelector('input[name="subjectbox"]');
  // const bodyField = document.querySelector('[aria-label="Message Body"][contenteditable="true"]');
  const existingForm = document.getElementById('gmailEmailComposerForm');

  if (!subjectField || !bodyField || existingForm) return;

  const savedPosition = JSON.parse(localStorage.getItem('gmailComposerPosition')); // ← Moved here

  const form = document.createElement('div');
  form.id = 'gmailEmailComposerForm';

  if (savedPosition) {
    form.style.top = savedPosition.top;
    form.style.left = savedPosition.left;
    form.style.right = 'auto'; // override fixed right if using left
  } else {
    form.style.top = '80px';
    form.style.left = '10px';
  }

form.style.position = 'fixed';
form.style.width = '320px';
form.style.padding = '10px';
form.style.background = '#fff';
form.style.border = '2px solid black';
form.style.zIndex = '9999';
form.style.cursor = 'move';


//   form.innerHTML = `
//     <h3 style="margin-top:0;">Generate Email</h3>
//     <label>Your Name:<br>
//       <input type="text" id="gmailYourName" style="width: 100%;" />
//     </label><br>
//     <label>Phone Number:<br>
//       <input type="text" id="gmailPhone" style="width: 100%;" />
//     </label><br>
// <label>Recipient Names (optional):<br>
//   <div id="tagInputWrapper" style="display:flex;flex-wrap:wrap;border:1px solid #ccc;padding:5px;">
//   <input type="hidden" id="gmailRecipientNames" />
  
//   <input type="text" id="tagInput" placeholder="Type name and press space..." style="flex:1;border:none;outline:none;" />
//   </div>
// </label>
//   <ul id="suggestionsList" style="position:absolute;z-index:10000;background:white;border:1px solid #ccc;list-style:none;margin:0;padding:0;"></ul>

// </label><br>

//     <label>Organization Name:<br>
//   <input type="text" id="gmailOrgName" list="orgSuggestions" style="width: 100%;" />
//   <datalist id="orgSuggestions"></datalist>    </label><br>
//     <label><input type="checkbox" id="gmailNotOnYP" /> Not on YourPeer yet?</label><br>
//     <label>Links:<br>
//       <input type="text" class="gmailOrgLink" placeholder="Paste link..." style="width: 100%;" />
//       <div id="gmailLinksContainer"></div>
//     </label>
//     <button id="gmailAddLinkBtn" style="margin-top: 5px;">+ Add Another Link</button><br>
//     <button id="gmailGenerateBtn" style="margin-top: 10px; background:black; color:white; padding: 8px;">Generate Email</button>
//   `;
  // <div style="position:relative;">
  //   <div id="tagInputWrapper" style="display:flex;flex-wrap:wrap;border:1px solid #ccc;padding:5px;">
  //     <input type="text" id="tagInput" placeholder="Type name and press space..." style="flex:1;border:none;outline:none;" />
  //   </div>
  //   <input type="hidden" id="gmailRecipientNames" />
  //   <ul id="suggestionsList" style="position:absolute;z-index:10000;background:white;border:1px solid #ccc;list-style:none;margin:0;padding:0;"></ul>
  // </div>
form.innerHTML = `
<h3 id="dragHandle" style="margin-top:0;cursor:move;">Generate Email</h3>

  <label>Your Name:<br>
    <input type="text" id="gmailYourName" style="width: 100%;" />
  </label><br>

  <label>Phone Number:<br>
    <input type="text" id="gmailPhone" style="width: 100%;" />
  </label><br>

  <label>Recipient Names (optional):</label><br>
  <div style="position:relative;">
    <div id="tagInputWrapper" style="display:flex;flex-wrap:wrap;border:1px solid #ccc;padding:5px;position:relative;">
      <input type="text" id="tagInput" placeholder="Type name and press space..." style="flex:1;border:none;outline:none;" />
    </div>
    <input type="hidden" id="gmailRecipientNames" />
  </div>

  <br>

  <label>Organization Name:<br>
    <input type="text" id="gmailOrgName" list="orgSuggestions" style="width: 100%;" />
    <datalist id="orgSuggestions"></datalist>
  </label><br>

  <label><input type="checkbox" id="gmailNotOnYP" /> Not on YourPeer yet?</label><br>
<label><input type="checkbox" id="gmailFollowUp" /> Follow-Up Email?</label><br>

  <label>Links:<br>
    <input type="text" class="gmailOrgLink" placeholder="Paste link..." style="width: 100%;" />
    <div id="gmailLinksContainer"></div>
  </label>
  <button id="gmailAddLinkBtn" style="margin-top: 5px;">+ Add Another Link</button><br>

  <button id="gmailGenerateBtn" style="margin-top: 10px; background:black; color:white; padding: 8px;">Generate Email</button> <button id="gmailResetBtn" style="margin-top: 5px; background: #ccc; padding: 6px;">Reset Fields</button>

`;


  document.body.appendChild(form);
  const generateBtn = document.getElementById('gmailGenerateBtn');

generateBtn.style.background = 'linear-gradient(270deg, red, orange, yellow, green, blue, indigo, violet)';
generateBtn.style.backgroundSize = '1400% 1400%';
generateBtn.style.animation = 'rainbow 6s ease infinite';
generateBtn.style.color = 'white';
generateBtn.style.border = 'none';
generateBtn.style.fontWeight = 'bold';
generateBtn.style.borderRadius = '4px';

const style = document.createElement('style');
style.textContent = `
@keyframes rainbow {
  0% { background-position: 0% 50%; }
  50% { background-position: 100% 50%; }
  100% { background-position: 0% 50%; }
}`;
document.head.appendChild(style);
const resetBtn = document.getElementById('gmailResetBtn');
resetBtn.addEventListener('click', () => {
  // Clear organization name
  document.getElementById('gmailOrgName').value = '';

  // Clear recipient names
  document.getElementById('gmailRecipientNames').value = '';
const tagInput = document.getElementById('tagInput');
tagInput.value = '';
const tagWrapper = tagInput?.parentElement;
const tagElements = tagWrapper?.querySelectorAll('.tag') || [];
tagElements.forEach(tag => tag.remove());
tags.clear(); // <-- THIS is needed to reset the underlying Set
updateHiddenField(); // optional but ensures hidden input is synced


  // Clear checkboxes
  document.getElementById('gmailNotOnYP').checked = false;
  document.getElementById('gmailFollowUp').checked = false;

  // Clear links
  const linkInputs = document.querySelectorAll('.gmailOrgLink');
  linkInputs.forEach((input, index) => {
    if (index === 0) {
      input.value = '';
    } else {
      input.remove();
    }
  });

  // Disable additional link input if "Not on YP" is checked
  updateLinkInputsState();
});

const isFollowUp = document.getElementById('gmailFollowUp').checked;

  const notOnYPCheckbox = document.getElementById('gmailNotOnYP');
const linkInputs = () => [...document.querySelectorAll('.gmailOrgLink')];

// function updateLinkInputsState() {
//   const disabled = notOnYPCheckbox.checked;
//   linkInputs().forEach(input => input.disabled = disabled);
// }
const addLinkBtn = document.getElementById('gmailAddLinkBtn');

function updateLinkInputsState() {
  const disabled = notOnYPCheckbox.checked;
  linkInputs().forEach(input => input.disabled = disabled);
  addLinkBtn.disabled = disabled;
}

notOnYPCheckbox.addEventListener('change', updateLinkInputsState);
updateLinkInputsState(); // call initially

fetch(chrome.runtime.getURL('org_names.txt'))
  .then(res => res.text())
  .then(text => {
    const orgList = text.split('\n').map(line => line.trim()).filter(Boolean);
    const datalist = document.getElementById('orgSuggestions');

    orgList.forEach(org => {
      const option = document.createElement('option');
      option.value = org;
      datalist.appendChild(option);
    });
  })
  .catch(err => console.error('[doobneek] Failed to load org names:', err));
let isDragging = false;
let offsetX, offsetY;

// form.addEventListener('mousedown', (e) => {
//   // Only allow dragging from the top area (e.g., the title bar)
//   if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'BUTTON') return;

//   isDragging = true;
//   offsetX = e.clientX - form.getBoundingClientRect().left;
//   offsetY = e.clientY - form.getBoundingClientRect().top;
//   document.body.style.userSelect = 'none';
// });
const dragHandle = document.getElementById('dragHandle');

// dragHandle.addEventListener('mousedown', (e) => {
//   isDragging = true;
//   offsetX = e.clientX - form.getBoundingClientRect().left;
//   offsetY = e.clientY - form.getBoundingClientRect().top;
//   document.body.style.userSelect = 'none';
// });
dragHandle.addEventListener('mousedown', (e) => {
  const rect = form.getBoundingClientRect();
  form.style.left = `${rect.left}px`;
  form.style.top = `${rect.top}px`;
  form.style.right = 'auto';

  isDragging = true;
  offsetX = e.clientX - rect.left;
  offsetY = e.clientY - rect.top;
  document.body.style.userSelect = 'none';
});

document.addEventListener('mousemove', (e) => {
  if (isDragging) {
    // const maxLeft = window.innerWidth - form.offsetWidth;
    // const maxTop = window.innerHeight - form.offsetHeight;
    // const left = Math.min(Math.max(e.clientX - offsetX, 0), maxLeft);
    // const top = Math.min(Math.max(e.clientY - offsetY, 0), maxTop);
const peek = 300; // how far it can go offscreen (right and bottom)

const maxLeft = window.innerWidth - form.offsetWidth + peek;
const maxTop = window.innerHeight - form.offsetHeight + peek;

const left = Math.min(Math.max(e.clientX - offsetX, -peek), maxLeft);
const top = Math.min(e.clientY - offsetY, maxTop); // 👈 NO NEGATIVE TOP ALLOWED

form.style.left = `${left}px`;
form.style.top = `${Math.max(0, top)}px`; // 👈 clamp to screen top

    form.style.right = 'auto'; // override fixed 'right' so left works
  }
});

document.addEventListener('mouseup', () => {
  if (isDragging) {
    isDragging = false;
    document.body.style.userSelect = 'auto';

    const position = {
      top: form.style.top,
      left: form.style.left
    };
    localStorage.setItem('gmailComposerPosition', JSON.stringify(position));
  }
});


  // Prefill from localStorage
  const nameInput = document.getElementById('gmailYourName');
  const phoneInput = document.getElementById('gmailPhone');
  nameInput.value = localStorage.getItem('userName') || '';
  phoneInput.value = localStorage.getItem('userPhone') || '';

  // Save updates
  nameInput.addEventListener('input', e => {
    localStorage.setItem('userName', e.target.value);
  });
  phoneInput.addEventListener('input', e => {
    localStorage.setItem('userPhone', e.target.value);
  });

document.getElementById('gmailAddLinkBtn').addEventListener('click', () => {
  const newInput = document.createElement('input');
  newInput.type = 'text';
  newInput.className = 'gmailOrgLink';
  newInput.placeholder = 'Paste another link...';
  newInput.style.marginTop = '5px';
  newInput.style.width = '100%';

  ['contextmenu', 'dblclick'].forEach(evt => {
    newInput.addEventListener(evt, async (e) => {
      e.preventDefault();
      const text = await navigator.clipboard.readText();
      newInput.value = text;
    });
  });

  document.getElementById('gmailLinksContainer').appendChild(newInput);
});

  let activeBodyField = null;

// document.body.addEventListener('focusin', (e) => {
//   if (e.target.getAttribute('aria-label') === 'Message Body' && e.target.isContentEditable) {
//     activeBodyField = e.target;
//   }
// });
document.body.addEventListener('mousedown', (e) => {
  const clickedBody = e.target.closest('[aria-label="Message Body"][contenteditable="true"]');
  if (clickedBody) {
    activeBodyField = clickedBody;
  }
});

document.getElementById('gmailGenerateBtn').addEventListener('click', () => {
  


  // const subjectField = document.querySelector('input[name="subjectbox"]');
  // const bodyFields = [...document.querySelectorAll('[aria-label="Message Body"][contenteditable="true"]')];

  // // Determine target body field
  // let targetBody;

  // if (bodyFields.length === 1) {
  //   targetBody = bodyFields[0]; // ✅ Only one: just use it
  // } else if (activeBodyField && bodyFields.includes(activeBodyField)) {
  //   targetBody = activeBodyField; // ✅ Multiple but one is focused
  // } else {
  //   alert("Multiple compose windows are open. Please click inside the email you want to generate content for.");
  //   return;
  // }
  let targetBody = activeBodyField;

if (!targetBody || !document.body.contains(targetBody)) {
  alert("Please click inside the email body you want to generate content for before clicking the Generate button.");
  return;
}

const subjectField = targetBody.closest('[role="dialog"]')?.querySelector('input[name="subjectbox"]');

  if (!subjectField || !targetBody) {
    alert("Could not find an active compose window.");
    return;
  }
const editableBody = targetBody;



const name = nameInput.value.trim();
const phone = phoneInput.value.trim();
const org = document.getElementById('gmailOrgName').value.trim();
const notOnYP = document.getElementById('gmailNotOnYP').checked;
const links = [...document.querySelectorAll('.gmailOrgLink')]
  .map(i => i.value.trim()).filter(Boolean);

if (!name || !org || !phone || (!notOnYP && links.length === 0)) {
  alert("Fill in all fields.");
  return;
}

const phoneDigits = phone.replace(/\D/g, '');
const formattedPhone = phoneDigits.length === 10
  ? `(${phoneDigits.slice(0, 3)}) ${phoneDigits.slice(3, 6)}-${phoneDigits.slice(6)}`
  : phone;

const subject = `Question about services at ${org}`;
let body;
const isGavilan = ['doobneek'].includes(name.toLowerCase());
const tagInputField = document.getElementById('tagInput');
const leftoverName = tagInputField.value.trim().replace(/[^a-zA-Z\s]/g, '');

if (leftoverName) {
  const hiddenField = document.getElementById('gmailRecipientNames');
  const currentNames = hiddenField.value.trim();
  const updatedNames = currentNames ? `${currentNames} ${leftoverName}` : leftoverName;
  hiddenField.value = updatedNames.trim();
  tagInputField.value = ''; // clear after saving
}
const currentTags = [...document.querySelectorAll('#tagInputWrapper .tag')].map(tag => tag.textContent.trim().toLowerCase());
document.getElementById('gmailRecipientNames').value = currentTags.join(' ');

const rawNamesEl = document.getElementById('gmailRecipientNames');
const rawNames = rawNamesEl ? rawNamesEl.value.trim() : '';
const names = rawNames ? rawNames.split(/\s+/) : [];
let greeting;

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

if (names.length === 1) {
  greeting = `Hello ${capitalize(names[0])},`;
} else if (names.length === 2) {
  greeting = `Hello ${capitalize(names[0])} and ${capitalize(names[1])},`;
} else if (names.length > 2) {
  const last = capitalize(names.pop());
  const capitalizedRest = names.map(capitalize);
  greeting = `Hello ${capitalizedRest.join(', ')}, and ${last},`;
} else {
  greeting = `Hello ${org} Team,`;
}
const flyerPaths = [
  {
    url: 'https://drive.google.com/uc?export=view&id=1qUkoBlL6T9yikMiFoVdQE4dvM-cLB7ko',
    label: 'English Flyer doobneek.org'
  },
  {
    url: 'https://drive.google.com/uc?export=view&id=15UDov31X95bh-Owm5KHbcAC4iiC_8rGZ',
    label: 'Spanish Flyer doobneek.org'
  },
  {
    url: 'https://drive.google.com/uc?export=view&id=1NJ6-PmKTVCTAlE_uj1_RtSWaRatgm9yY',
    label: 'YourPeer Flyer'
  }
];

let flyerHTML = `
<div style="margin-top: 10px;"><strong>Flyers:</strong></div>
<div style="display: flex; flex-wrap: wrap; gap: 10px; margin-top: 10px;">
`;

flyerPaths.forEach(flyer => {
  flyerHTML += `
    <div style="flex: 1 1 calc(33.333% - 10px); box-sizing: border-box; text-align: center;">
      <a href="${flyer.url}" target="_blank" rel="noopener noreferrer">
        <img src="${flyer.url}" alt="${flyer.label}" style="width: 100%; border: 1px solid #ccc; border-radius: 4px;" />
      </a>
      <div style="font-size: 12px; color: #555; margin-top: 4px;">${flyer.label}</div>
    </div>`;
});

flyerHTML += `</div>`;


  const linksFormatted = links.map(link => {
    if (!/^https?:\/\//i.test(link)) link = 'https://' + link;
    const display = link.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '');
    return `<a href="${link}" target="_blank" rel="noopener noreferrer">${display}</a>`;
  }).join(', ');

if (isGavilan && isFollowUp && notOnYP) {
body = `${greeting}<br>
Just following up on my earlier message — I’m ${name} from <a href="https://streetlives.nyc">Streetlives</a>, where we publish <a href="https://yourpeer.nyc">YourPeer</a>, a peer-powered, walk-in-friendly resource map for NYC social services.<br>
We’d love to include <strong>${org}</strong> to help more folks find your services. We highlight programs that welcome walk-ins or accept direct enrollment without referrals.<br>
Let me know if you’d be open to a call or a quick visit. My number is <a href="tel:${phoneDigits}">${formattedPhone}</a>. I’ve also attached a flyer you’re welcome to print or share.`;
} else if (isGavilan && isFollowUp && !notOnYP) {
body = `${greeting}<br>
I wanted to follow up and see if you had a chance to review your listing on <a href="https://yourpeer.nyc">YourPeer</a>, our community-verified map of NYC social services.<br>
We want to make sure <strong>${org}</strong> is accurately represented and that community members can rely on the information we share. Here’s the current page: ${linksFormatted}<br>
If there’s anything you’d like us to update, just let me know. I’m available at <a href="tel:${phoneDigits}">${formattedPhone}</a> and can also stop by if easier. Flyer attached!`;
} else if (isGavilan && !isFollowUp && notOnYP) {
  body = `${greeting}<br>
${name} here, a Community Information Specialist over at <a href="https://streetlives.nyc">Streetlives</a>, a nonprofit organization that publishes <a href="https://yourpeer.nyc">YourPeer</a>, a free, peer-validated resource guide and interactive map of social services in NYC.<br>
We’re building YourPeer with an international team of community researchers and lived experts—people with direct experience navigating housing, immigration, and legal systems. We focus on providing walk-in-friendly, low-barrier services that youth and adults can access without a referral.<br>
I’d love to add <strong>${org}</strong> to our platform so we can help more people find your services. We prioritize locations that allow individuals to inquire in person or begin service access on-site.<br>
We currently feature 2,700+ services across 1,500+ locations in the NYC area. Our team reviews, translates, and updates listings regularly.<br>
I’ve also attached a flyer you’re welcome to print and share with your participants.<br>
Would you be open to a quick call? My number is <a href="tel:${phoneDigits}">${formattedPhone}</a>. I’m also happy to visit your site if helpful.
<br>Additionally, I’ve included flyers from my independent project, <a href="https://doobneek.org">doobneek.org</a> — a secure, youth-friendly tool for organizing personal finances. It’s not affiliated with Streetlives but may be useful to some of the people you serve.`;
} else if (isGavilan && !isFollowUp && !notOnYP) {
  body = `${greeting}<br>
${name} here, a Community Information Specialist over at <a href="https://streetlives.nyc">Streetlives</a>, a technology nonprofit publishing <a href="https://yourpeer.nyc">YourPeer</a>, a peer-validated resource guide and interactive map of social services for NYC.<br>
Our international team of lived experts and community researchers—representing diverse genders, races, and sexual orientations—builds and maintains YourPeer to ensure it’s both relatable and reliable.<br>
I’d like to confirm that the information we’re sharing about <strong>${org}</strong> is accurate and up to date. Please take a moment to review this page: ${linksFormatted}<br>
We highlight services that allow direct access—such as walk-ins, in-person inquiry, or enrollment without a referral. Your location is included based on these criteria.<br>
We currently feature over 2,700 services at more than 1,500 locations across the NYC Metro Area. Listings are peer-reviewed, and translated by native speakers where possible.<br>
I’ve attached a printable flyer for your team to share with participants if desired.<br>
Would you be open to a quick call? You can reach me at <a href="tel:${phoneDigits}">${formattedPhone}</a>. I’m also happy to visit in person if helpful.
<br>Additionally, I’ve included flyers from my independent project, <a href="https://doobneek.org">doobneek.org</a> — a secure, youth-friendly tool for organizing personal finances. It’s not affiliated with Streetlives but may be useful to some of the people you serve.`;
} else if (!isGavilan && isFollowUp && notOnYP) {
body = `${greeting}<br>
Just following up on my earlier message — I’m ${name} from <a href="https://streetlives.nyc">Streetlives</a>, where we publish <a href="https://yourpeer.nyc">YourPeer</a>, a peer-powered, walk-in-friendly resource map for NYC social services.<br>
We’d love to include <strong>${org}</strong> to help more folks find your services. We highlight programs that welcome walk-ins or accept direct enrollment without referrals.<br>
Let me know if you’d be open to a call or a quick visit. My number is <a href="tel:${phoneDigits}">${formattedPhone}</a>. I’ve also attached a flyer you’re welcome to print or share.`;
} else if (!isGavilan && isFollowUp && !notOnYP) {
body = `${greeting}<br>
I wanted to follow up and see if you had a chance to review your listing on <a href="https://yourpeer.nyc">YourPeer</a>, our community-verified map of NYC social services.<br>
We want to make sure <strong>${org}</strong> is accurately represented and that community members can rely on the information we share. Here’s the current page: ${linksFormatted}<br>
If there’s anything you’d like us to update, just let me know. I’m available at <a href="tel:${phoneDigits}">${formattedPhone}</a> and can also stop by if easier. Flyer attached!`;
} else if (!isGavilan && !isFollowUp && notOnYP) {
  body = `${greeting}<br>
I'm ${name}, a Community Information Specialist at <a href="https://streetlives.nyc">Streetlives</a>, a nonprofit organization that publishes <a href="https://yourpeer.nyc">YourPeer</a>, a free, peer-validated resource guide and interactive map of social services in NYC.<br>
We’re building YourPeer with an international team of community researchers and lived experts—people with direct experience navigating housing, immigration, and legal systems. We focus on providing walk-in-friendly, low-barrier services that youth and adults can access without a referral.<br>
I’d love to add <strong>${org}</strong> to our platform so we can help more people find your services. We prioritize locations that allow individuals to inquire in person or begin service access on-site.<br>
We currently feature 2,700+ services across 1,500+ locations in the NYC area. Our team reviews, translates, and updates listings regularly.<br>
I’ve also attached a flyer you’re welcome to print and share with your participants.<br>
Would you be open to a quick call? My number is <a href="tel:${phoneDigits}">${formattedPhone}</a>. I’m also happy to visit your site if helpful.`;
} else if (!isGavilan && !isFollowUp && !notOnYP) {
  body = `${greeting}<br>
I'm ${name}, a Community Information Specialist at <a href="https://streetlives.nyc">Streetlives</a>, a technology nonprofit publishing <a href="https://yourpeer.nyc">YourPeer</a>, a peer-validated resource guide and interactive map of social services for NYC.<br>
Our international team of lived experts and community researchers—representing diverse genders, races, and sexual orientations—builds and maintains YourPeer to ensure it’s both relatable and reliable.<br>
I’d like to confirm that the information we’re sharing about <strong>${org}</strong> is accurate and up to date. Please take a moment to review this page: ${linksFormatted}<br>
We highlight services that allow direct access—such as walk-ins, in-person inquiry, or enrollment without a referral. Your location is included based on these criteria.<br>
We currently feature over 2,700 services at more than 1,500 locations across the NYC Metro Area. Listings are peer-reviewed, and translated by native speakers where possible.<br>
I’ve attached a printable flyer for your team to share with participants if desired.<br>
Would you be open to a quick call? You can reach me at <a href="tel:${phoneDigits}">${formattedPhone}</a>. I’m also happy to visit in person if helpful.`;
}

subjectField.value = subject;

editableBody.focus();

const tempDiv = document.createElement('div');
tempDiv.innerHTML = body;

if (editableBody.firstChild) {
  editableBody.insertBefore(tempDiv, editableBody.firstChild);
} else {
  editableBody.appendChild(tempDiv);
}

if (isGavilan) {
  const flyerContainer = document.createElement('div');
  flyerContainer.innerHTML = flyerHTML;

  if (tempDiv.nextSibling) {
    editableBody.insertBefore(flyerContainer, tempDiv.nextSibling);
  } else {
    editableBody.appendChild(flyerContainer);
  }
}


// Optional: Move caret to end of inserted content
const range = document.createRange();
range.selectNodeContents(tempDiv);
range.collapse(false); // end of inserted content

const selection = window.getSelection();
selection.removeAllRanges();
selection.addRange(range);


  });
(async () => {
  const raw = await fetch(chrome.runtime.getURL('people_names.txt')).then(r => r.text());
  const nameList = raw.split('\n').map(n => n.trim().toLowerCase()).filter(Boolean);

  const wrapper = document.getElementById('tagInputWrapper');
  const input = document.getElementById('tagInput');
  const hiddenInput = document.getElementById('gmailRecipientNames');
  const suggestionsInline = document.createElement('div');
  suggestionsInline.id = 'suggestionsInline';
  suggestionsInline.style.display = 'flex';
  suggestionsInline.style.flexWrap = 'wrap';
  suggestionsInline.style.gap = '4px';
  suggestionsInline.style.marginTop = '4px';
  wrapper.appendChild(suggestionsInline);

  const tags = new Set();
  let activeIndex = 0;

  const updateHiddenField = () => {
    hiddenInput.value = [...tags].join(' ');
  };

  const clearSuggestions = () => {
    suggestionsInline.innerHTML = '';
    activeIndex = 0;
  };

  const capitalize = str => str.charAt(0).toUpperCase() + str.slice(1);

  const createTag = (name) => {
    if (!name || tags.has(name)) return;
    tags.add(name);

    const span = document.createElement('span');
    span.className = 'tag';
    span.textContent = capitalize(name);
    span.style.padding = '4px 8px';
    span.style.margin = '2px';
    span.style.background = '#eee';
    span.style.borderRadius = '4px';
    span.style.display = 'inline-block';

    wrapper.insertBefore(span, input);
    input.value = '';
    clearSuggestions();
    updateHiddenField();
  };

  input.addEventListener('input', () => {
    const query = input.value.trim().toLowerCase();
    clearSuggestions();
    if (!query) return;

    const matches = nameList.filter(n => n.startsWith(query) && !tags.has(n)).slice(0, 5);
    matches.forEach((name, idx) => {
      const suggestion = document.createElement('div');
      suggestion.textContent = capitalize(name);
      suggestion.style.padding = '4px 8px';
      suggestion.style.border = '1px solid #ccc';
      suggestion.style.borderRadius = '4px';
      suggestion.style.cursor = 'pointer';
      suggestion.style.background = idx === activeIndex ? '#e0e0e0' : '#f9f9f9';
      suggestion.addEventListener('click', () => createTag(name));
      suggestionsInline.appendChild(suggestion);
    });
  });

  input.addEventListener('keydown', (e) => {
    const suggestions = [...suggestionsInline.children];

    if (e.key === 'Tab' && suggestions.length > 0) {
      e.preventDefault();
      createTag(suggestions[activeIndex].textContent.trim());
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      activeIndex = (activeIndex + 1) % suggestions.length;
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      activeIndex = (activeIndex - 1 + suggestions.length) % suggestions.length;
    }

    // highlight active suggestion
    suggestions.forEach((el, idx) => {
      el.style.background = idx === activeIndex ? '#e0e0e0' : '#f9f9f9';
    });

    if ((e.key === 'Enter' || e.key === ' ') && input.value.trim()) {
      e.preventDefault();
      createTag(input.value.trim());
    } else if (e.key === 'Backspace' && input.value === '') {
  const lastTag = [...wrapper.querySelectorAll('.tag')].pop();
  if (lastTag) {
    const tagText = lastTag.textContent.trim().toLowerCase();
    tags.delete(tagText);
    lastTag.remove();
    updateHiddenField(); // <-- ensure hidden input is updated
  }
}
  });

  document.addEventListener('click', (e) => {
    if (!wrapper.contains(e.target)) clearSuggestions();
  });

  // Disable link input if Not on YourPeer is checked
  const notOnYPCheckbox = document.getElementById('gmailNotOnYP');
  const addLinkBtn = document.getElementById('gmailAddLinkBtn');

  const linkInputs = () => [...document.querySelectorAll('.gmailOrgLink')];
const initialLinkInput = document.querySelector('.gmailOrgLink');
if (initialLinkInput) {
  ['contextmenu', 'dblclick'].forEach(evt => {
    initialLinkInput.addEventListener(evt, async (e) => {
      e.preventDefault();
      const text = await navigator.clipboard.readText();
      initialLinkInput.value = text;
    });
  });
}

  const updateLinkInputsState = () => {
    const disabled = notOnYPCheckbox.checked;
    linkInputs().forEach(input => input.disabled = disabled);
    addLinkBtn.disabled = disabled;
  };

  notOnYPCheckbox.addEventListener('change', updateLinkInputsState);
  updateLinkInputsState();
})();

}

  const observer = new MutationObserver(() => injectFormatterUI());
  observer.observe(document.body, { childList: true, subtree: true });

  function dispatchInput(el) {
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }

function previewText(raw) {
  // Only insert \n before bullets that are NOT on the first line
  let firstLineEnd = raw.indexOf('\n');
  if (firstLineEnd === -1) firstLineEnd = raw.length;

  const before = raw.slice(0, firstLineEnd);
  const after = raw.slice(firstLineEnd);

  const fixed = before + after.replace(/([^\n])\s*•/g, '$1\n•');

  return fixed.split('\n').map((line, index) => {
    const trimmed = line.trim();
    const needsBreak = trimmed.startsWith('•') && index !== 0;
    const prefix = needsBreak ? '<br>' : '';
    return `${prefix}<span>${trimmed}</span>`;
  }).join('');
}


  function formatTimeRange(text) {
    return text.replace(/(\d{1,4}[ap])-(\d{1,4}[ap])/gi, (_, start, end) => {
      const parse = (t) => {
        const period = t.includes('a') ? 'AM' : 'PM';
        t = t.replace(/[ap]/i, '');
        let h = parseInt(t.slice(0, 2)), m = parseInt(t.slice(2) || 0);
        if (period === 'PM' && h !== 12) h += 12;
        if (period === 'AM' && h === 12) h = 0;
        return new Date(0, 0, 0, h, m);
      };
      const s = parse(start), e = parse(end);
      const nextDay = e < s ? '⁺¹' : '';
      return `${s.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} — ${e.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}${nextDay}`;
    });
  }

  function formatAge(text) {
    return text.replace(/age\((.+?)\)/gi, (_, ages) => {
      const nums = ages.split(/[-,]/).map(Number);
      return nums.length === 2
        ? `Age requirement: ${nums[0]}-${nums[1]} (until your ${nums[1] + 1}th birthday)`
        : `Age requirement: ${nums[0]}+`;
    });
  }

  function safeHyperlink(text) {
    const parts = text.split(/(<a .*?>.*?<\/a>)/g);
    const output = [];
    for (let part of parts) {
      if (part.startsWith('<a ')) {
        output.push(part);
        continue;
      }
    part = part.replace(
      /(?<!href=")(?<!<a[^>]*>)(\b([\w.-]+@[\w.-]+\.\w+|((https?:\/\/)?[^\s<>()|]+\.[^\s<>()|]+))(?:\|\(([^)]+)\))?|\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}(?:,\d+)?)(?![^<]*>)/g,
      (match) => {
        // PHONE NUMBER CHECK
        const phoneMatch = match.match(/^(\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4})(?:,(\d+))?$/);
        if (phoneMatch) {
          const clean = phoneMatch[1].replace(/\D/g, '');
          const ext = phoneMatch[2];
          const formatted = `(${clean.slice(0, 3)}) ${clean.slice(3, 6)}-${clean.slice(6)}`;
          return ext
            ? `<a href="tel:${clean},${ext}">${formatted} x${ext}</a>`
            : `<a href="tel:${clean}">${formatted}</a>`;
        }
    
        // EMAIL CHECK
        const emailMatch = match.match(/^[\w.-]+@[\w.-]+\.\w+$/);
        if (emailMatch) {
          return `<a href="mailto:${match}">${match}</a>`;
        }

// URL CHECK (robust punctuation-safe version)
const labelMatch = match.match(/^((https?:\/\/)?[^\s<>()|]+\.[^\s<>()|]+)(?:\|\(([^)]+)\))?$/);
if (labelMatch) {
  let [, rawUrl, scheme, label] = labelMatch;

  let trailing = '';

  // Only clean if there's no custom label
  if (!label) {
    const forbiddenEnd = /[.,;:!?]$/;
    if (forbiddenEnd.test(rawUrl)) {
      trailing = rawUrl.slice(-1);
      rawUrl = rawUrl.slice(0, -1); // strip last char
    }
  }

  const urlWithScheme = scheme ? rawUrl : `https://${rawUrl}`;
  const cleanedLabel = urlWithScheme.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '');
  const display = label || cleanedLabel;
  const isYourPeer = urlWithScheme.includes('yourpeer.nyc');
  const targetAttr = isYourPeer ? '' : 'target="_blank" rel="noopener noreferrer"';
  return `<a href="${urlWithScheme}" ${targetAttr}>${display}</a>${trailing}`;
}

        return match;
      }
    );
    
      
      
    
      output.push(part);
    }
    return output.join('');
  }

  function processText(input) {
    // Preprocess bullets embedded mid-line
const normalized = input
  // Put " • " mid-line bullets on a new line
  .replace(/([^\n])\s*•\s+/g, '$1\n• ')
  // Remove spaces before bullets (if they start the line)
  .replace(/^\s*•/gm, '•');

const lines = normalized.split('\n');
    let output = [], lastWasEmpty = false;
    lines.forEach((line, i) => {
      let raw = line.trim();
      if (!raw) {
        lastWasEmpty = true;
        return;
      }
      const isFirst = i === 0;
      const alreadyBullet = raw.startsWith('•') || raw.startsWith('<br>&emsp;—') || raw.startsWith('<br>');
      if (!alreadyBullet && !(isFirst && raw.endsWith(':'))) {
        if (raw.startsWith('-')) {
          raw = `<br>&emsp;— ${raw.slice(1).trim()}`;
        } else if (lastWasEmpty) {
          raw = `<br>${raw}`;
        } else {
          raw = `• ${raw}`;
        }
      }
      lastWasEmpty = false;
      output.push(safeHyperlink(formatAge(formatTimeRange(raw))));
    });
    return output.join('\n');
  }

})();
