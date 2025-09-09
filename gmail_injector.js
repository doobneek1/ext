(function () {
  // === GMAIL SPECIFIC INJECTION LOGIC ===
 if (location.hostname.includes('mail.google.com')) {
    const ensureInjected = () => {
      console.log('[Formatter] Forcing Gmail UI injection...');
      injectGmailComposerUI(); // ← Always inject, no conditions
    };

    // Inject immediately
    ensureInjected();

    // Also reinject on DOM changes in case Gmail mutates layout
    const gmailObserver = new MutationObserver(() => {
      clearTimeout(window._gmailInjectTimeout);
      window._gmailInjectTimeout = setTimeout(ensureInjected, 300);
    });

    gmailObserver.observe(document.body, {
      childList: true,
      subtree: true
    });

    // Optional: retry every few seconds in case Gmail resets DOM (defensive)
    const periodicRetry = setInterval(ensureInjected, 5000);
  }
function findActiveGmailBodyField() {
  // 1. Try normal dialog-based compose window
  const dialogCompose = [...document.querySelectorAll('[role="dialog"]')]
    .find(d => d.offsetParent !== null)
    ?.querySelector('[aria-label="Message Body"][contenteditable="true"]');
  if (dialogCompose) return dialogCompose;

  // 2. Fallback: generic visible editable field with correct aria-label
  const fallbackCompose = [...document.querySelectorAll('div[contenteditable="true"][aria-label="Message Body"]')]
    .find(el => el.offsetParent !== null);
  if (fallbackCompose) return fallbackCompose;

  // 3. Last resort: hardcoded pattern like `id=":sb"` with class `editable`
  return document.querySelector('div[contenteditable="true"][aria-label="Message Body"].editable');
}


  function injectGmailComposerUI() {
    const existingForm = document.getElementById('gmailEmailComposerForm');
    // If form already exists, do nothing further in this function call.
    // This allows repeated calls by observers/timers without re-creating the form.
    if (existingForm) return;

    // The form itself is injected regardless of whether a compose window is open.
    // Interaction with compose window elements happens later, e.g., when "Generate Email" is clicked.

    const savedPosition = JSON.parse(localStorage.getItem('gmailComposerPosition'));

    const form = document.createElement('div');
    form.id = 'gmailEmailComposerForm';

    if (savedPosition) {
      form.style.top = savedPosition.top;
      form.style.left = savedPosition.left;
      form.style.right = 'auto';
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
      <button id="gmailGenerateBtn" style="margin-top: 10px; background:black; color:white; padding: 8px;">Generate Email</button>
      <button id="gmailResetBtn" style="margin-top: 5px; background: #ccc; padding: 6px;">Reset Fields</button>
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

    const styleElement = document.createElement('style');
    styleElement.textContent = `
      @keyframes rainbow {
        0% { background-position: 0% 50%; }
        50% { background-position: 100% 50%; }
        100% { background-position: 0% 50%; }
      }`;
    document.head.appendChild(styleElement);

    const resetBtn = document.getElementById('gmailResetBtn');
    const notOnYPCheckbox = document.getElementById('gmailNotOnYP');
    const addLinkBtn = document.getElementById('gmailAddLinkBtn');
    const nameInput = document.getElementById('gmailYourName');
    const phoneInput = document.getElementById('gmailPhone');
    
    // This function needs to be defined before it's used in resetBtn listener
    // And also before it's used in the (async () => { ... })(); block for tag input
    const tags = new Set(); 
    const updateHiddenField = () => {
        const hiddenInput = document.getElementById('gmailRecipientNames');
        if (hiddenInput) {
            hiddenInput.value = [...tags].join(' ');
        }
    };


    const gmailLinkInputs = () => [...document.querySelectorAll('.gmailOrgLink')]; // Renamed to avoid conflict
    
    function updateGmailLinkInputsState() { // Renamed to avoid conflict
        const disabled = notOnYPCheckbox.checked;
        gmailLinkInputs().forEach(input => input.disabled = disabled);
        addLinkBtn.disabled = disabled;
    }

    resetBtn.addEventListener('click', () => {
      document.getElementById('gmailOrgName').value = '';
      document.getElementById('gmailRecipientNames').value = '';
      const tagInputElement = document.getElementById('tagInput'); // Renamed
      if (tagInputElement) tagInputElement.value = '';
      
      const tagWrapper = tagInputElement?.parentElement;
      const tagElements = tagWrapper?.querySelectorAll('.tag') || [];
      tagElements.forEach(tag => tag.remove());
      tags.clear(); 
      updateHiddenField();

      document.getElementById('gmailNotOnYP').checked = false;
      document.getElementById('gmailFollowUp').checked = false;

      const currentGmailLinkInputs = gmailLinkInputs(); // Renamed
      currentGmailLinkInputs.forEach((input, index) => {
        if (index === 0) {
          input.value = '';
        } else {
          input.remove();
        }
      });
      updateGmailLinkInputsState(); // Renamed
    });

    notOnYPCheckbox.addEventListener('change', updateGmailLinkInputsState); // Renamed
    updateGmailLinkInputsState(); // Renamed initially

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
      .catch(err => console.error('[Formatter] Failed to load org names:', err));

    let isDragging = false;
    let offsetX, offsetY;
    const dragHandle = document.getElementById('dragHandle');

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
        const peek = 300;
        const maxLeft = window.innerWidth - form.offsetWidth + peek;
        const maxTop = window.innerHeight - form.offsetHeight + peek;
        const left = Math.min(Math.max(e.clientX - offsetX, -peek), maxLeft);
        const top = Math.min(e.clientY - offsetY, maxTop);
        form.style.left = `${left}px`;
        form.style.top = `${Math.max(0, top)}px`;
        form.style.right = 'auto';
      }
    });

    document.addEventListener('mouseup', () => {
      if (isDragging) {
        isDragging = false;
        document.body.style.userSelect = 'auto';
        const position = { top: form.style.top, left: form.style.left };
        localStorage.setItem('gmailComposerPosition', JSON.stringify(position));
      }
    });

    nameInput.value = localStorage.getItem('userName') || '';
    phoneInput.value = localStorage.getItem('userPhone') || '';
    nameInput.addEventListener('input', e => localStorage.setItem('userName', e.target.value));
    phoneInput.addEventListener('input', e => localStorage.setItem('userPhone', e.target.value));

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
document.body.addEventListener('mousedown', (e) => {
  let clickedBody = e.target.closest?.('[aria-label="Message Body"][contenteditable="true"]');
  if (!clickedBody && e.target.isContentEditable) {
    clickedBody = e.target;
  }

  // Only set if still valid
  if (clickedBody?.getAttribute('aria-label') === 'Message Body') {
    activeBodyField = clickedBody;
  }
});


    function capitalize(str) { // Moved capitalize here, it's used below
        if (!str) return '';
        return str.charAt(0).toUpperCase() + str.slice(1);
    }

    document.getElementById('gmailGenerateBtn').addEventListener('click', () => {
      let targetBody = activeBodyField;
      if (!targetBody || !document.body.contains(targetBody)) {
        alert("Please click inside the email body you want to generate content for before clicking the Generate button.");
        return;
      }
 // Try finding subject input near the active body
let currentSubjectField = targetBody.closest('[role="dialog"]')?.querySelector('input[name="subjectbox"]');

// Fallback: fullscreen or non-dialog subject box
if (!currentSubjectField) {
  currentSubjectField = document.querySelector('input[name="subjectbox"]') ||
                        document.querySelector('input#\\:oh'); // Escape Gmail colon ID
}

// If no subject field is found but it's a reply box, that's OK
const isFollowUpChecked = document.getElementById('gmailFollowUp').checked;
if (!currentSubjectField && !isFollowUpChecked) {
  alert("No subject field found. If you're starting a new email, please ensure the subject is visible.");
  return;
}

      const editableBody = targetBody;
      const name = nameInput.value.trim();
      const phone = phoneInput.value.trim();
      const org = document.getElementById('gmailOrgName').value.trim();
      const isNotOnYP = document.getElementById('gmailNotOnYP').checked; // Renamed
      const links = [...document.querySelectorAll('.gmailOrgLink')].map(i => i.value.trim()).filter(Boolean);

      if (!name || !org || !phone || (!isNotOnYP && links.length === 0)) {
        alert("Fill in all fields.");
        return;
      }

      const phoneDigits = phone.replace(/\D/g, '');
      const formattedPhone = phoneDigits.length === 10
        ? `(${phoneDigits.slice(0, 3)}) ${phoneDigits.slice(3, 6)}-${phoneDigits.slice(6)}`
        : phone;

      const subjectValue = `Question about services at ${org}`; // Renamed
      let bodyValue; // Renamed
      const isGavilan = ['doobneek'].includes(name.toLowerCase());
      const tagInputField = document.getElementById('tagInput');
      const leftoverName = tagInputField.value.trim().replace(/[^a-zA-Z\s]/g, '');

      if (leftoverName) {
        const hiddenField = document.getElementById('gmailRecipientNames');
        const currentNames = hiddenField.value.trim();
        const updatedNames = currentNames ? `${currentNames} ${leftoverName}` : leftoverName;
        hiddenField.value = updatedNames.trim();
        tagInputField.value = '';
      }
      const currentTags = [...document.querySelectorAll('#tagInputWrapper .tag')].map(tag => tag.textContent.trim().toLowerCase());
      document.getElementById('gmailRecipientNames').value = currentTags.join(' ');

      const rawNamesEl = document.getElementById('gmailRecipientNames');
      const rawNames = rawNamesEl ? rawNamesEl.value.trim() : '';
      const recipientNames = rawNames ? rawNames.split(/\s+/) : []; // Renamed
      let greeting;

      if (recipientNames.length === 1) {
        greeting = `Hello ${capitalize(recipientNames[0])},`;
      } else if (recipientNames.length === 2) {
        greeting = `Hello ${capitalize(recipientNames[0])} and ${capitalize(recipientNames[1])},`;
      } else if (recipientNames.length > 2) {
        const last = capitalize(recipientNames.pop());
        const capitalizedRest = recipientNames.map(capitalize);
        greeting = `Hello ${capitalizedRest.join(', ')}, and ${last},`;
      } else {
        greeting = `Hello ${org} Team,`;
      }
      const flyerPaths = [
        { url: 'https://drive.google.com/uc?export=view&id=1qUkoBlL6T9yikMiFoVdQE4dvM-cLB7ko', label: 'English Flyer doobneek.org' },
        { url: 'https://drive.google.com/uc?export=view&id=15UDov31X95bh-Owm5KHbcAC4iiC_8rGZ', label: 'Spanish Flyer doobneek.org' },
        { url: 'https://drive.google.com/uc?export=view&id=1NJ6-PmKTVCTAlE_uj1_RtSWaRatgm9yY', label: 'YourPeer Flyer' }
      ];
      let flyerHTML = `<div style="margin-top: 10px;"><strong>Flyers:</strong></div><div style="display: flex; flex-wrap: wrap; gap: 10px; margin-top: 10px;">`;
      flyerPaths.forEach(flyer => {
        flyerHTML += `<div style="flex: 1 1 calc(33.333% - 10px); box-sizing: border-box; text-align: center;"><a href="${flyer.url}" target="_blank" rel="noopener noreferrer"><img src="${flyer.url}" alt="${flyer.label}" style="width: 100%; border: 1px solid #ccc; border-radius: 4px;" /></a><div style="font-size: 12px; color: #555; margin-top: 4px;">${flyer.label}</div></div>`;
      });
      flyerHTML += `</div>`;

      const linksFormatted = links.map(link => {
        if (!/^https?:\/\//i.test(link)) link = 'https://' + link;
        const display = link.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '');
        return `<a href="${link}" target="_blank" rel="noopener noreferrer">${display}</a>`;
      }).join(', ');
      

      if (isGavilan && isFollowUpChecked && isNotOnYP) {
        bodyValue = `${greeting}<br>Just following up on my earlier message — I’m ${name} from <a href="https://streetlives.nyc">Streetlives</a>, where we publish <a href="https://yourpeer.nyc">YourPeer</a>, a peer-powered, walk-in-friendly resource map for NYC social services.<br>We’d love to include <strong>${org}</strong> to help more folks find your services. We highlight programs that welcome walk-ins or accept direct enrollment without referrals.<br>Let me know if you’d be open to a call or a quick visit. My number is <a href="tel:${phoneDigits}">${formattedPhone}</a>. I’ve also attached a flyer you’re welcome to print or share.`;
      } else if (isGavilan && isFollowUpChecked && !isNotOnYP) {
        bodyValue = `${greeting}<br>I wanted to follow up and see if you had a chance to review your listing on <a href="https://yourpeer.nyc">YourPeer</a>, our community-verified map of NYC social services.<br>We want to make sure <strong>${org}</strong> is accurately represented and that community members can rely on the information we share. Here’s the current page: ${linksFormatted}<br>If there’s anything you’d like us to update, just let me know. I’m available at <a href="tel:${phoneDigits}">${formattedPhone}</a> and can also stop by if easier. Flyer attached!`;
      } else if (isGavilan && !isFollowUpChecked && isNotOnYP) {
        bodyValue = `${greeting}<br>${name} here, a Community Information Specialist over at <a href="https://streetlives.nyc">Streetlives</a>, a nonprofit organization that publishes <a href="https://yourpeer.nyc">YourPeer</a>, a free, peer-validated resource guide and interactive map of social services in NYC.<br>We’re building YourPeer with an international team of community researchers and lived experts—people with direct experience navigating housing, immigration, and legal systems. We focus on providing walk-in-friendly, low-barrier services that youth and adults can access without a referral.<br>I’d love to add <strong>${org}</strong> to our platform so we can help more people find your services. We prioritize locations that allow individuals to inquire in person or begin service access on-site.<br>We currently feature 2,700+ services across 1,500+ locations in the NYC area. Our team reviews, translates, and updates listings regularly.<br>I’ve also attached a flyer you’re welcome to print and share with your participants.<br>Would you be open to a quick call? My number is <a href="tel:${phoneDigits}">${formattedPhone}</a>. I’m also happy to visit your site if helpful.<br>Additionally, I’ve included flyers from my independent project, <a href="http://localhost:3210">doobneek.org</a> — a secure, youth-friendly tool for organizing personal finances. It’s not affiliated with Streetlives but may be useful to some of the people you serve.`;
      } else if (isGavilan && !isFollowUpChecked && !isNotOnYP) {
        bodyValue = `${greeting}<br>${name} here, a Community Information Specialist over at <a href="https://streetlives.nyc">Streetlives</a>, a technology nonprofit publishing <a href="https://yourpeer.nyc">YourPeer</a>, a peer-validated resource guide and interactive map of social services for NYC.<br>Our international team of lived experts and community researchers—representing diverse genders, races, and sexual orientations—builds and maintains YourPeer to ensure it’s both relatable and reliable.<br>I’d like to confirm that the information we’re sharing about <strong>${org}</strong> is accurate and up to date. Please take a moment to review this page: ${linksFormatted}<br>We highlight services that allow direct access—such as walk-ins, in-person inquiry, or enrollment without a referral. Your location is included based on these criteria.<br>We currently feature over 2,700 services at more than 1,500 locations across the NYC Metro Area. Listings are peer-reviewed, and translated by native speakers where possible.<br>I’ve attached a printable flyer for your team to share with participants if desired.<br>Would you be open to a quick call? You can reach me at <a href="tel:${phoneDigits}">${formattedPhone}</a>. I’m also happy to visit in person if helpful.<br>Additionally, I’ve included flyers from my independent project, <a href="http://localhost:3210">doobneek.org</a> — a secure, youth-friendly tool for organizing personal finances. It’s not affiliated with Streetlives but may be useful to some of the people you serve.`;
      } else if (!isGavilan && isFollowUpChecked && isNotOnYP) {
        bodyValue = `${greeting}<br>Just following up on my earlier message — I’m ${name} from <a href="https://streetlives.nyc">Streetlives</a>, where we publish <a href="https://yourpeer.nyc">YourPeer</a>, a peer-powered, walk-in-friendly resource map for NYC social services.<br>We’d love to include <strong>${org}</strong> to help more folks find your services. We highlight programs that welcome walk-ins or accept direct enrollment without referrals.<br>Let me know if you’d be open to a call or a quick visit. My number is <a href="tel:${phoneDigits}">${formattedPhone}</a>. I’ve also attached a flyer you’re welcome to print or share.`;
      } else if (!isGavilan && isFollowUpChecked && !isNotOnYP) {
        bodyValue = `${greeting}<br>I wanted to follow up and see if you had a chance to review your listing on <a href="https://yourpeer.nyc">YourPeer</a>, our community-verified map of NYC social services.<br>We want to make sure <strong>${org}</strong> is accurately represented and that community members can rely on the information we share. Here’s the current page: ${linksFormatted}<br>If there’s anything you’d like us to update, just let me know. I’m available at <a href="tel:${phoneDigits}">${formattedPhone}</a> and can also stop by if easier. Flyer attached!`;
      } else if (!isGavilan && !isFollowUpChecked && isNotOnYP) {
        bodyValue = `${greeting}<br>I'm ${name}, a Community Information Specialist at <a href="https://streetlives.nyc">Streetlives</a>, a nonprofit organization that publishes <a href="https://yourpeer.nyc">YourPeer</a>, a free, peer-validated resource guide and interactive map of social services in NYC.<br>We’re building YourPeer with an international team of community researchers and lived experts—people with direct experience navigating housing, immigration, and legal systems. We focus on providing walk-in-friendly, low-barrier services that youth and adults can access without a referral.<br>I’d love to add <strong>${org}</strong> to our platform so we can help more people find your services. We prioritize locations that allow individuals to inquire in person or begin service access on-site.<br>We currently feature 2,700+ services across 1,500+ locations in the NYC area. Our team reviews, translates, and updates listings regularly.<br>I’ve also attached a flyer you’re welcome to print and share with your participants.<br>Would you be open to a quick call? My number is <a href="tel:${phoneDigits}">${formattedPhone}</a>. I’m also happy to visit your site if helpful.`;
      } else if (!isGavilan && !isFollowUpChecked && !isNotOnYP) {
        bodyValue = `${greeting}<br>I'm ${name}, a Community Information Specialist at <a href="https://streetlives.nyc">Streetlives</a>, a technology nonprofit publishing <a href="https://yourpeer.nyc">YourPeer</a>, a peer-validated resource guide and interactive map of social services for NYC.<br>Our international team of lived experts and community researchers—representing diverse genders, races, and sexual orientations—builds and maintains YourPeer to ensure it’s both relatable and reliable.<br>I’d like to confirm that the information we’re sharing about <strong>${org}</strong> is accurate and up to date. Please take a moment to review this page: ${linksFormatted}<br>We highlight services that allow direct access—such as walk-ins, in-person inquiry, or enrollment without a referral. Your location is included based on these criteria.<br>We currently feature over 2,700 services at more than 1,500 locations across the NYC Metro Area. Listings are peer-reviewed, and translated by native speakers where possible.<br>I’ve attached a printable flyer for your team to share with participants if desired.<br>Would you be open to a quick call? You can reach me at <a href="tel:${phoneDigits}">${formattedPhone}</a>. I’m also happy to visit in person if helpful.`;
      }

if (currentSubjectField) {
  currentSubjectField.value = subjectValue;
}
      editableBody.focus();
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = bodyValue;
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
      const range = document.createRange();
      range.selectNodeContents(tempDiv);
      range.collapse(false);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
    });

    (async () => {
      const raw = await fetch(chrome.runtime.getURL('people_names.txt')).then(r => r.text());
      const nameList = raw.split('\n').map(n => n.trim().toLowerCase()).filter(Boolean);

      const wrapper = document.getElementById('tagInputWrapper');
      const input = document.getElementById('tagInput');
      // const hiddenInput = document.getElementById('gmailRecipientNames'); // Already defined
      const suggestionsInline = document.createElement('div');
      suggestionsInline.id = 'suggestionsInline';
      suggestionsInline.style.display = 'flex';
      suggestionsInline.style.flexWrap = 'wrap';
      suggestionsInline.style.gap = '4px';
      suggestionsInline.style.marginTop = '4px';
      wrapper.appendChild(suggestionsInline);

      // const tags = new Set(); // Already defined above
      let activeIndex = 0;

      // const updateHiddenField = () => { // Already defined above
      //   hiddenInput.value = [...tags].join(' ');
      // };

      const clearSuggestions = () => {
        suggestionsInline.innerHTML = '';
        activeIndex = 0;
      };

      // const capitalize = str => str.charAt(0).toUpperCase() + str.slice(1); // Already defined above

      const createTag = (name) => {
        const lowerName = name.toLowerCase(); // Use lowercase for Set and comparison
        if (!name || tags.has(lowerName)) return;
        tags.add(lowerName);

        const span = document.createElement('span');
        span.className = 'tag';
        span.textContent = capitalize(name); // Display capitalized
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

        if (e.key === 'Tab' && suggestions.length > 0 && suggestions[activeIndex]) {
          e.preventDefault();
          createTag(suggestions[activeIndex].textContent.trim()); // Use textContent which is capitalized
          return;
        }

        if (e.key === 'ArrowDown') {
          e.preventDefault();
          activeIndex = (activeIndex + 1) % (suggestions.length || 1); // Avoid modulo by zero
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          activeIndex = (activeIndex - 1 + (suggestions.length || 1)) % (suggestions.length || 1); // Avoid modulo by zero
        }

        suggestions.forEach((el, idx) => {
          el.style.background = idx === activeIndex ? '#e0e0e0' : '#f9f9f9';
        });

        if ((e.key === 'Enter' || e.key === ' ') && input.value.trim()) {
          e.preventDefault();
           if (suggestions.length > 0 && suggestions[activeIndex] && suggestions[activeIndex].textContent.toLowerCase().startsWith(input.value.trim().toLowerCase())) {
             createTag(suggestions[activeIndex].textContent.trim());
           } else {
             createTag(input.value.trim());
           }
        } else if (e.key === 'Backspace' && input.value === '') {
          const lastTag = [...wrapper.querySelectorAll('.tag')].pop();
          if (lastTag) {
            const tagText = lastTag.textContent.trim().toLowerCase();
            tags.delete(tagText);
            lastTag.remove();
            updateHiddenField();
          }
        }
      });

      document.addEventListener('click', (e) => {
        if (!wrapper.contains(e.target)) clearSuggestions();
      });

      const initialGmailLinkInput = document.querySelector('.gmailOrgLink'); // Renamed
      if (initialGmailLinkInput) {
        ['contextmenu', 'dblclick'].forEach(evt => {
          initialGmailLinkInput.addEventListener(evt, async (e) => {
            e.preventDefault();
            const text = await navigator.clipboard.readText();
            initialGmailLinkInput.value = text;
          });
        });
      }
      updateGmailLinkInputsState(); // Renamed
    })();
  }
})();
