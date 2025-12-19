(function () {
  const currentHost = location.hostname;
  const currentPath = location.pathname;
  const lastPath = sessionStorage.getItem('formatterLastPath');
  const GOGETTA_WEBSITE_PATH_REGEX = /^\/team\/location\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/questions\/website\/?$/i;

  function isGoGettaWebsitePage() {
    const normalizedHost = location.hostname.toLowerCase();
    if (normalizedHost !== 'gogetta.nyc' && normalizedHost !== 'www.gogetta.nyc') {
      return false;
    }
    return GOGETTA_WEBSITE_PATH_REGEX.test(location.pathname);
  }


  // ✅ For all other domains (GoGetta, etc.)
  // The Gmail specific block that was here has been moved to gmail_injector.js

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
      const trimTrailingBlankLines = (value) => value.replace(/(?:[ \t]*(?:\r?\n))+$/g, '');

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
        |(Visit <a href="http://localhost:3210" target="_blank" rel="noopener noreferrer" class="rainbow-word">doobneek.org</a>)
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

      // The gmailComposerPosition localStorage item is specific to the Gmail composer,
      // so using a different key for the general instructions panel.
      const savedPosition = JSON.parse(localStorage.getItem('formatterInstructionsPosition')) || { top: '10px', left: '90%' };


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
        localStorage.setItem('formatterInstructionsPosition', JSON.stringify(position)); // Use the correct key
      });

      const addButton = (label, onClick, extraClass = '') => {
        const btn = document.createElement('button');
        btn.textContent = label;
        btn.style.padding = '6px 10px';
        btn.style.fontSize = '12px';
        btn.style.cursor = 'pointer';
        btn.style.border = '2px solid black';
        btn.style.background = 'white';
        btn.className = extraClass;
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
        const trimmed = trimTrailingBlankLines(formatted);
        textarea.value = trimmed;
        isConverted = true;
        dispatchInput(textarea);
        output.innerHTML = previewText(trimmed);
        updateButtonStates();
      });

      addButton('Undo', () => {
        textarea.value = lastValue;
        isConverted = false;
        dispatchInput(textarea);
        output.innerHTML = previewText(lastValue);
      });

      addButton('+ Services Include', () => {
        textarea.value = `Services include:\n${textarea.value.trim()}`;
        dispatchInput(textarea);
        output.innerHTML = previewText(textarea.value);
      });
      
      addButton('+ Metrocard Line', () => {
        textarea.value += `\n• If you are a Medicaid or Medicare recipient, see if you qualify for a Round-Trip MetroCard upon your visit.`;
        dispatchInput(textarea);
        output.innerHTML = previewText(textarea.value);
      });

      addButton('+ Criminal Risk Line', () => {
        textarea.value += `\n• If you are a non-citizen with a criminal record, please <a href="https://docs.google.com/document/d/e/2PACX-1vQ-cQznO83jSMzdwQoOOZMO22gOesH8YgiSo3GTzuRpHjMczqzzFz8JR23pM6_ZMG8khiGazWIcF-jA/pub" target="_blank" rel="noopener noreferrer">see if you might be at risk of deportation</a>.`;
        dispatchInput(textarea);
        output.innerHTML = previewText(textarea.value);
      });

      addButton('+ Ineligibility Link', () => {
        textarea.value += `\n• If you are a non-citizen, please <a href="https://docs.google.com/document/d/e/2PACX-1vSRz4FT0ndCbqt63vO1Dq5Isj7FS4TZjw5NMc0gn8HCSg2gLx-MXD56X8Z56IDD5qbLX2_xzpwCqHaK/pub" target="_blank" rel="noopener noreferrer">see if you might qualify for this service</a>.`;
        dispatchInput(textarea);
        output.innerHTML = previewText(textarea.value);
      });

      addButton('+ Survivor Benefits', () => {
        textarea.value += `\n• If you are a non-citizen and survived a crime, please <a href="https://docs.google.com/document/d/e/2PACX-1vSRz4FT0ndCbqt63vO1Dq5Isj7FS4TZjw5NMc0gn8HCSg2gLx-MXD56X8Z56IDD5qbLX2_xzpwCqHaK/pub" target="_blank" rel="noopener noreferrer">see if you might qualify for some immigration benefits</a>.`;
        dispatchInput(textarea);
        output.innerHTML = previewText(textarea.value);
      });

      addButton('Recurring Days', () => {
        showRecurringDaysOverlay();
      });

      const convertBtn = [...buttonRow.children].find(btn => btn.textContent === 'Convert');
      const undoBtn = [...buttonRow.children].find(btn => btn.textContent === 'Undo');

      const updateButtonStates = () => {
        const formatted = trimTrailingBlankLines(processText(textarea.value));
        const currentValue = trimTrailingBlankLines(textarea.value);
        convertBtn.disabled = (formatted === currentValue);
        undoBtn.disabled = (textarea.value === lastValue);
      };


      // Recurring Days Overlay
      const recurringDaysOverlay = document.createElement('div');
      recurringDaysOverlay.className = 'injector-recurring-days-overlay';
      recurringDaysOverlay.style.position = 'fixed';
      recurringDaysOverlay.style.top = '50%';
      recurringDaysOverlay.style.left = '50%';
      recurringDaysOverlay.style.transform = 'translate(-50%, -50%)';
      recurringDaysOverlay.style.zIndex = '100001';
      recurringDaysOverlay.style.display = 'none';
      recurringDaysOverlay.style.backgroundColor = '#ffffff';
      recurringDaysOverlay.style.border = '2px solid #333';
      recurringDaysOverlay.style.borderRadius = '8px';
      recurringDaysOverlay.style.boxShadow = '0 8px 24px rgba(0, 0, 0, 0.3)';
      recurringDaysOverlay.style.padding = '20px';
      recurringDaysOverlay.style.minWidth = '350px';
      recurringDaysOverlay.style.fontSize = '14px';
      recurringDaysOverlay.style.fontFamily = 'sans-serif';

      recurringDaysOverlay.innerHTML = `
        <div style="margin-bottom: 16px; font-weight: 600; font-size: 16px;">Recurring Days</div>

        <div style="margin-bottom: 12px;">
          <label style="display: block; margin-bottom: 6px; font-weight: 500;">Day of the week:</label>
          <select id="recurring-day-select" style="width: 100%; padding: 6px; border: 1px solid #94a3b8; border-radius: 4px; font-size: 14px;">
            <option value="Sunday">Sunday</option>
            <option value="Monday">Monday</option>
            <option value="Tuesday">Tuesday</option>
            <option value="Wednesday">Wednesday</option>
            <option value="Thursday">Thursday</option>
            <option value="Friday">Friday</option>
            <option value="Saturday">Saturday</option>
          </select>
        </div>

        <div style="margin-bottom: 16px;">
          <label style="display: block; margin-bottom: 6px; font-weight: 500;">Week of the month:</label>
          <div style="display: flex; flex-direction: column; gap: 6px;">
            <label style="display: flex; align-items: center; cursor: pointer;">
              <input type="checkbox" id="recurring-week-1" value="1st" style="margin-right: 8px; cursor: pointer;">
              <span>1st week</span>
            </label>
            <label style="display: flex; align-items: center; cursor: pointer;">
              <input type="checkbox" id="recurring-week-2" value="2nd" style="margin-right: 8px; cursor: pointer;">
              <span>2nd week</span>
            </label>
            <label style="display: flex; align-items: center; cursor: pointer;">
              <input type="checkbox" id="recurring-week-3" value="3rd" style="margin-right: 8px; cursor: pointer;">
              <span>3rd week</span>
            </label>
            <label style="display: flex; align-items: center; cursor: pointer;">
              <input type="checkbox" id="recurring-week-4" value="4th" style="margin-right: 8px; cursor: pointer;">
              <span>4th week</span>
            </label>
            <label style="display: flex; align-items: center; cursor: pointer;">
              <input type="checkbox" id="recurring-week-5" value="5th" style="margin-right: 8px; cursor: pointer;">
              <span>5th week</span>
            </label>
          </div>
        </div>

        <div style="display: flex; gap: 8px; justify-content: flex-end;">
          <button id="recurring-cancel-btn" style="padding: 8px 16px; border: 1px solid #cbd5e1; background: #e2e8f0; border-radius: 4px; cursor: pointer; font-size: 14px;">Cancel</button>
          <button id="recurring-submit-btn" style="padding: 8px 16px; border: 1px solid #10b981; background: #d1fae5; border-radius: 4px; cursor: pointer; font-size: 14px; font-weight: 500;">Submit</button>
        </div>
      `;

      document.body.appendChild(recurringDaysOverlay);

      // Load saved values from localStorage
      const loadRecurringDaysPreferences = () => {
        const saved = localStorage.getItem('recurringDaysPreferences');
        if (saved) {
          try {
            const prefs = JSON.parse(saved);
            const daySelect = recurringDaysOverlay.querySelector('#recurring-day-select');
            if (prefs.day) daySelect.value = prefs.day;

            if (prefs.weeks && Array.isArray(prefs.weeks)) {
              prefs.weeks.forEach((week) => {
                const checkbox = recurringDaysOverlay.querySelector(`#recurring-week-${week}`);
                if (checkbox) checkbox.checked = true;
              });
            }
          } catch (e) {
            console.error('Error loading recurring days preferences:', e);
          }
        }
      };

      // Save preferences to localStorage
      const saveRecurringDaysPreferences = () => {
        const daySelect = recurringDaysOverlay.querySelector('#recurring-day-select');
        const weekCheckboxes = recurringDaysOverlay.querySelectorAll('input[type="checkbox"]:checked');

        const prefs = {
          day: daySelect.value,
          weeks: Array.from(weekCheckboxes).map(cb => cb.id.replace('recurring-week-', ''))
        };

        localStorage.setItem('recurringDaysPreferences', JSON.stringify(prefs));
      };

      const showRecurringDaysOverlay = () => {
        loadRecurringDaysPreferences();
        recurringDaysOverlay.style.display = 'block';
      };

      const hideRecurringDaysOverlay = () => {
        recurringDaysOverlay.style.display = 'none';
      };

      const generateRecurringDaysText = () => {
        const daySelect = recurringDaysOverlay.querySelector('#recurring-day-select');
        const selectedDay = daySelect.value;

        const weekCheckboxes = recurringDaysOverlay.querySelectorAll('input[type="checkbox"]:checked');
        const selectedWeeks = Array.from(weekCheckboxes).map(cb => cb.value);

        if (selectedWeeks.length === 0) {
          return '';
        }

        if (selectedWeeks.length === 1) {
          return `Open every ${selectedWeeks[0]} ${selectedDay} of the month.`;
        }

        const lastWeek = selectedWeeks.pop();
        return `Open every ${selectedWeeks.join(', ')} and ${lastWeek} ${selectedDay} of the month.`;
      };

      recurringDaysOverlay.querySelector('#recurring-submit-btn').addEventListener('click', () => {
        const text = generateRecurringDaysText();
        if (text) {
          textarea.value += `\n${text}`;
          dispatchInput(textarea);
          output.innerHTML = previewText(textarea.value);
          saveRecurringDaysPreferences();
        }
        hideRecurringDaysOverlay();
      });

      recurringDaysOverlay.querySelector('#recurring-cancel-btn').addEventListener('click', () => {
        hideRecurringDaysOverlay();
      });

      // Close overlay on Escape key
      recurringDaysOverlay.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          hideRecurringDaysOverlay();
        }
      });
      const linkOverlay = document.createElement('div');
      linkOverlay.className = 'injector-selection-link-overlay';
      linkOverlay.style.position = 'absolute';
      linkOverlay.style.zIndex = '100000';
      linkOverlay.style.display = 'none';
      linkOverlay.style.backgroundColor = '#ffffff';
      linkOverlay.style.border = '1px solid #94a3b8';
      linkOverlay.style.borderRadius = '8px';
      linkOverlay.style.boxShadow = '0 8px 24px rgba(15, 23, 42, 0.18)';
      linkOverlay.style.padding = '8px 10px';
      linkOverlay.style.minWidth = '240px';
      linkOverlay.style.maxWidth = '320px';
      linkOverlay.style.fontSize = '12px';
      linkOverlay.style.fontFamily = 'inherit';

      const overlayLabel = document.createElement('div');
      overlayLabel.style.fontSize = '11px';
      overlayLabel.style.marginBottom = '4px';
      overlayLabel.style.fontWeight = '600';
      overlayLabel.style.color = '#1f2937';

      const overlayForm = document.createElement('div');
      overlayForm.style.display = 'flex';
      overlayForm.style.alignItems = 'center';
      overlayForm.style.gap = '6px';

      const linkInput = document.createElement('input');
      linkInput.type = 'text';
      linkInput.placeholder = 'Paste link';
      linkInput.style.flex = '1';
      linkInput.style.padding = '4px 8px';
      linkInput.style.fontSize = '12px';
      linkInput.style.border = '1px solid #94a3b8';
      linkInput.style.borderRadius = '4px';
      linkInput.setAttribute('aria-label', 'Link URL');

      const confirmButton = document.createElement('button');
      confirmButton.type = 'button';
      confirmButton.textContent = '✓';
      confirmButton.title = 'Insert link';
      confirmButton.style.padding = '4px 8px';
      confirmButton.style.border = '1px solid #10b981';
      confirmButton.style.backgroundColor = '#d1fae5';
      confirmButton.style.borderRadius = '4px';
      confirmButton.style.cursor = 'pointer';
      confirmButton.style.fontSize = '14px';
      confirmButton.setAttribute('aria-label', 'Insert link');

      const cancelButton = document.createElement('button');
      cancelButton.type = 'button';
      cancelButton.textContent = '×';
      cancelButton.title = 'Cancel';
      cancelButton.style.padding = '4px 8px';
      cancelButton.style.border = '1px solid #cbd5f5';
      cancelButton.style.backgroundColor = '#e2e8f0';
      cancelButton.style.borderRadius = '4px';
      cancelButton.style.cursor = 'pointer';
      cancelButton.style.fontSize = '14px';
      cancelButton.setAttribute('aria-label', 'Cancel link insertion');

      const errorText = document.createElement('div');
      errorText.style.display = 'none';
      errorText.style.marginTop = '4px';
      errorText.style.fontSize = '11px';
      errorText.style.color = '#dc2626';

      overlayForm.appendChild(linkInput);
      overlayForm.appendChild(confirmButton);
      overlayForm.appendChild(cancelButton);
      linkOverlay.appendChild(overlayLabel);
      linkOverlay.appendChild(overlayForm);
      linkOverlay.appendChild(errorText);
      document.body.appendChild(linkOverlay);

      const defaultInputBorder = '#94a3b8';
      let selectionRange = null;
      let overlayVisible = false;
      let lastSelectionSignature = null;
      let suppressedSelectionSignature = null;

      const selectionInsideExistingAnchor = (content, start, end) => {
        if (!content || start == null || end == null) return false;
        if (start >= end) return false;

        const openTagRegex = /<a\b[^>]*>/gi;
        let lastOpen = null;
        let match;
        while ((match = openTagRegex.exec(content)) !== null) {
          if (match.index >= start) break;
          lastOpen = { start: match.index, end: openTagRegex.lastIndex };
        }
        if (!lastOpen || lastOpen.end > start) {
          return false;
        }

        const closeTagRegex = /<\/a\s*>/gi;
        closeTagRegex.lastIndex = lastOpen.end;
        const closingMatch = closeTagRegex.exec(content);
        if (!closingMatch) return false;

        return closingMatch.index >= end;
      };

      const setError = (message) => {
        if (message) {
          errorText.textContent = message;
          errorText.style.display = 'block';
          linkInput.style.borderColor = '#dc2626';
          linkInput.setAttribute('aria-invalid', 'true');
        } else {
          errorText.textContent = '';
          errorText.style.display = 'none';
          linkInput.style.borderColor = defaultInputBorder;
          linkInput.removeAttribute('aria-invalid');
        }
      };

      const hideOverlay = (options = {}) => {
        const { suppress = false } = options;
        if (suppress && selectionRange) {
          suppressedSelectionSignature = `${selectionRange.start}:${selectionRange.end}`;
        }
        overlayVisible = false;
        linkOverlay.style.display = 'none';
        selectionRange = null;
        lastSelectionSignature = null;
        setError('');
        linkInput.value = '';
        overlayLabel.textContent = '';
      };

      const updateSelectionLabel = (rawText) => {
        const compact = rawText.replace(/\s+/g, ' ').trim();
        if (!compact) {
          overlayLabel.textContent = 'Link selection';
          return;
        }
        overlayLabel.textContent = compact.length > 40
          ? `Link \"${compact.slice(0, 37)}...\"`
          : `Link \"${compact}\"`;
      };

      const positionOverlay = (ensureVisibility = false) => {
        if (!overlayVisible || !selectionRange) return;

        const coords = getTextareaSelectionCoords(textarea, selectionRange.end);
        const computed = window.getComputedStyle(textarea);
        const lineHeight = parseFloat(computed.lineHeight);
        const fallback = parseFloat(computed.fontSize) || 16;
        const offsetY = Number.isFinite(lineHeight) ? lineHeight : fallback * 1.2;

        let top = coords.top + offsetY + 6;
        let left = coords.left;

        const rect = linkOverlay.getBoundingClientRect();
        const overlayWidth = rect.width || 260;
        const overlayHeight = rect.height || 64;

        const viewportLeft = window.scrollX;
        const viewportRight = viewportLeft + window.innerWidth;
        if (left + overlayWidth > viewportRight - 12) {
          left = viewportRight - overlayWidth - 12;
        }
        if (left < viewportLeft + 12) {
          left = viewportLeft + 12;
        }

        const viewportTop = window.scrollY;
        const viewportBottom = viewportTop + window.innerHeight;
        if (top + overlayHeight > viewportBottom - 12) {
          top = Math.max(viewportTop + 12, coords.top - overlayHeight - 12);
        }
        if (top < viewportTop + 12) {
          top = viewportTop + 12;
        }

        linkOverlay.style.left = `${left}px`;
        linkOverlay.style.top = `${top}px`;

        if (ensureVisibility) {
          linkOverlay.style.visibility = 'visible';
        }
      };

      const showOverlay = () => {
        if (!selectionRange) return;
        overlayVisible = true;
        linkOverlay.style.display = 'block';
        linkOverlay.style.visibility = 'hidden';
        positionOverlay(true);
        requestAnimationFrame(() => {
          if (!selectionRange) return;
          textarea.focus();
          textarea.selectionStart = selectionRange.start;
          textarea.selectionEnd = selectionRange.end;
        });
      };

      const applyLink = () => {
        if (!selectionRange) return;

        const urlObj = normalizeUserLink(linkInput.value);
        if (!urlObj) {
          setError('Enter a valid link.');
          linkInput.focus();
          linkInput.select();
          return;
        }

        const selected = textarea.value.slice(selectionRange.start, selectionRange.end);
        const leadingSpacesMatch = selected.match(/^\s*/);
        const trailingSpacesMatch = selected.match(/\s*$/);
        const leadingSpaces = leadingSpacesMatch ? leadingSpacesMatch[0] : '';
        const trailingSpaces = trailingSpacesMatch ? trailingSpacesMatch[0] : '';
        const coreText = selected.slice(leadingSpaces.length, selected.length - trailingSpaces.length);

        if (!coreText.trim()) {
          setError('Select text to link.');
          textarea.focus();
          return;
        }

        const anchorMarkup = buildInjectorLinkMarkup(coreText, urlObj, { escapeDisplay: true });
        if (!anchorMarkup) {
          setError('Enter a valid link.');
          return;
        }

        const anchor = `${leadingSpaces}${anchorMarkup}${trailingSpaces}`;
        const beforeValue = textarea.value.slice(0, selectionRange.start);
        const afterValue = textarea.value.slice(selectionRange.end);
        const previousValue = textarea.value;

        textarea.value = `${beforeValue}${anchor}${afterValue}`;
        dispatchInput(textarea);
        output.innerHTML = previewText(textarea.value);
        lastValue = previousValue;
        updateButtonStates();

        const caretPosition = beforeValue.length + anchor.length;
        textarea.focus();
        textarea.selectionStart = textarea.selectionEnd = caretPosition;
        hideOverlay();
      };

      const handleSelectionChange = () => {
        const start = textarea.selectionStart ?? 0;
        const end = textarea.selectionEnd ?? 0;

        if (start === end) {
          if (!linkOverlay.contains(document.activeElement)) {
            hideOverlay();
          } else {
            positionOverlay();
          }
          return;
        }

        const signature = `${start}:${end}`;
        if (suppressedSelectionSignature && signature === suppressedSelectionSignature) {
          return;
        }
        suppressedSelectionSignature = null;

        if (signature === lastSelectionSignature && overlayVisible) {
          positionOverlay();
          return;
        }
        lastSelectionSignature = signature;

        const selectedText = textarea.value.slice(start, end);
        if (!selectedText.trim()) {
          hideOverlay();
          return;
        }
        if (/<\/?a\b/i.test(selectedText)) {
          hideOverlay();
          return;
        }
        if (selectionInsideExistingAnchor(textarea.value, start, end)) {
          hideOverlay();
          return;
        }

        selectionRange = { start, end };
        updateSelectionLabel(selectedText);
        linkInput.value = '';
        setError('');
        showOverlay();
      };

      const onDocumentPointerDown = (event) => {
        if (!overlayVisible) return;
        if (linkOverlay.contains(event.target) || textarea.contains(event.target)) return;
        hideOverlay({ suppress: true });
      };

      linkInput.addEventListener('input', () => setError(''));
      confirmButton.addEventListener('click', applyLink);
      cancelButton.addEventListener('click', () => {
        hideOverlay({ suppress: true });
        if (selectionRange) {
          textarea.focus();
          textarea.selectionStart = selectionRange.start;
          textarea.selectionEnd = selectionRange.end;
        }
      });
      linkInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          applyLink();
        } else if (event.key === 'Escape') {
          event.preventDefault();
          hideOverlay({ suppress: true });
          textarea.focus();
        }
      });

      textarea.addEventListener('mouseup', handleSelectionChange);
      textarea.addEventListener('keyup', (event) => {
        if (event.key === 'Shift') return;
        handleSelectionChange();
      });
      textarea.addEventListener('select', handleSelectionChange);
      textarea.addEventListener('scroll', () => {
        if (overlayVisible) {
          positionOverlay();
        }
      });
      textarea.addEventListener('blur', () => {
        setTimeout(() => {
          if (!linkOverlay.contains(document.activeElement)) {
            hideOverlay();
          }
        }, 0);
      });

      document.addEventListener('mousedown', onDocumentPointerDown);
      document.addEventListener('touchstart', onDocumentPointerDown);
      window.addEventListener('scroll', () => overlayVisible && positionOverlay(), true);
      window.addEventListener('resize', () => overlayVisible && positionOverlay());

      cancelButton.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          hideOverlay({ suppress: true });
          textarea.focus();
        }
      });

      textarea.addEventListener('input', () => {
        updateButtonStates();
        output.innerHTML = previewText(textarea.value);
      });

      textarea.addEventListener('keydown', (e) => {
        if (e.ctrlKey && e.key === 'Enter') {
          e.preventDefault();
          lastValue = textarea.value;
          const formatted = processText(textarea.value);
          const trimmed = trimTrailingBlankLines(formatted);
          textarea.value = trimmed;
          isConverted = true;
          dispatchInput(textarea);
          output.innerHTML = previewText(trimmed);
          updateButtonStates();
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
  // This needs to be outside the if block for non-Gmail sites
  if (!location.hostname.includes('mail.google.com')) {
    injectFormatterUI();
  }

  // The MutationObserver for injectFormatterUI should also be conditional
  if (!location.hostname.includes('mail.google.com')) {
    const observer = new MutationObserver(() => injectFormatterUI());
    observer.observe(document.body, { childList: true, subtree: true });
  }


  // === UTILITY FUNCTIONS (potentially shared) ===
  function dispatchInput(el) {
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function escapeHtml(text) {
    if (text == null) return '';
    return String(text).replace(/[&<>"']/g, (char) => {
      switch (char) {
        case '&':
          return '&amp;';
        case '<':
          return '&lt;';
        case '>':
          return '&gt;';
        case '"':
          return '&quot;';
        case '\'':
          return '&#39;';
        default:
          return char;
      }
    });
  }

  function normalizeUserLink(input) {
    if (!input) return null;
    let trimmed = input.trim();
    if (!trimmed) return null;

    if (!/^https?:\/\//i.test(trimmed)) {
      trimmed = `https://${trimmed}`;
    }

    let url;
    try {
      url = new URL(trimmed);
    } catch {
      return null;
    }

    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return null;
    }

    const host = url.hostname;
    if (!host || !host.includes('.')) return null;

    const segments = host.split('.').filter(Boolean);
    if (segments.length < 2) return null;

    const tld = segments[segments.length - 1];
    const sld = segments[segments.length - 2];

    if (!/^[a-z]{2,24}$/i.test(tld)) return null;
    if (!sld || sld.length < 2) return null;

    return url;
  }

  function buildInjectorLinkMarkup(displayText, urlObj, options = {}) {
    if (!urlObj) return null;
    const { escapeDisplay = false } = options;

    const isYourPeer = urlObj.hostname.endsWith('yourpeer.nyc');
    const attrs = [`href="${urlObj.href}"`];

    if (!isYourPeer) {
      attrs.push('target="_blank"', 'rel="noopener noreferrer"');
    }

    const textContent = escapeDisplay ? escapeHtml(displayText) : displayText;
    return `<a ${attrs.join(' ')}>${textContent}</a>`;
  }

  function getTextareaSelectionCoords(textarea, position) {
    const computed = window.getComputedStyle(textarea);
    const properties = [
      'boxSizing',
      'width',
      'height',
      'overflowX',
      'overflowY',
      'borderTopWidth',
      'borderRightWidth',
      'borderBottomWidth',
      'borderLeftWidth',
      'paddingTop',
      'paddingRight',
      'paddingBottom',
      'paddingLeft',
      'fontStyle',
      'fontVariant',
      'fontWeight',
      'fontStretch',
      'fontSize',
      'fontFamily',
      'lineHeight',
      'textAlign',
      'textTransform',
      'textIndent',
      'textDecoration',
      'letterSpacing',
      'wordSpacing',
      'whiteSpace',
      'wordBreak',
      'overflowWrap'
    ];

    const mirror = document.createElement('div');
    mirror.className = 'injector-textarea-mirror';
    mirror.style.position = 'absolute';
    mirror.style.top = '0';
    mirror.style.left = '-9999px';
    mirror.style.visibility = 'hidden';
    mirror.style.whiteSpace = 'pre-wrap';
    mirror.style.wordWrap = 'break-word';

    properties.forEach((prop) => {
      mirror.style[prop] = computed[prop];
    });

    if (computed.boxSizing === 'border-box') {
      mirror.style.width = `${textarea.offsetWidth}px`;
    } else {
      mirror.style.width = `${textarea.clientWidth}px`;
    }

    const textUpToPosition = textarea.value.substring(0, position);
    const textNode = document.createTextNode(textUpToPosition);
    mirror.appendChild(textNode);

    const marker = document.createElement('span');
    marker.textContent = '\u200b';
    mirror.appendChild(marker);

    document.body.appendChild(mirror);

    const markerRect = marker.getBoundingClientRect();
    const mirrorRect = mirror.getBoundingClientRect();

    document.body.removeChild(mirror);

    const textareaRect = textarea.getBoundingClientRect();

    const relativeTop = markerRect.top - mirrorRect.top;
    const relativeLeft = markerRect.left - mirrorRect.left;

    return {
      top:
        textareaRect.top +
        relativeTop -
        textarea.scrollTop +
        window.scrollY,
      left:
        textareaRect.left +
        relativeLeft -
        textarea.scrollLeft +
        window.scrollX
    };
  }

function previewText(raw) {
  const sanitized = raw.replace(/\r\n/g, '\n');
  let firstLineEnd = sanitized.indexOf('\n');
  if (firstLineEnd === -1) firstLineEnd = sanitized.length;
  const before = sanitized.slice(0, firstLineEnd);
  const after = sanitized.slice(firstLineEnd);
  const fixed = before + after.replace(/([^\r\n])\s*•/g, '$1\n•');
    return fixed.split('\n').map((line, index) => {
      const trimmed = line.trim();
      const needsBreak = trimmed.startsWith('•') && index !== 0;
      const prefix = needsBreak ? '<br>' : '';
      return `${prefix}<span>${trimmed}</span>`;
    }).join('');
  }

  // function formatTimeRange(text) {
  //   return text.replace(/(\d{1,4}[ap])-(\d{1,4}[ap])/gi, (_, start, end) => {
  //     const parse = (t) => {
  //       const period = t.includes('a') ? 'AM' : 'PM';
  //       t = t.replace(/[ap]/i, '');
  //       let h = parseInt(t.slice(0, 2)), m = parseInt(t.slice(2) || 0);
  //       if (period === 'PM' && h !== 12) h += 12;
  //       if (period === 'AM' && h === 12) h = 0;
  //       return new Date(0, 0, 0, h, m);
  //     };
  //     const s = parse(start), e = parse(end);
  //     const nextDay = e < s ? '⁺¹' : '';
  //     return `${s.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} — ${e.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}${nextDay}`;
  //   });
  // }
  function expandDayRange(text) {
  const days = ['su', 'mo', 'tu', 'we', 'th', 'fr', 'sa'];
  const fullDays = {
    su: 'Sunday',
    mo: 'Monday',
    tu: 'Tuesday',
    we: 'Wednesday',
    th: 'Thursday',
    fr: 'Friday',
    sa: 'Saturday'
  };

  return text.replace(/\b(su|mo|tu|we|th|fr|sa)-(su|mo|tu|we|th|fr|sa)\b/gi, (_, startAbbr, endAbbr) => {
      console.log('[expandDayRange]', startAbbr, endAbbr);

    const start = startAbbr.toLowerCase();
    const end = endAbbr.toLowerCase();
    const startIdx = days.indexOf(start);
    const endIdx = days.indexOf(end);

    if (startIdx === -1 || endIdx === -1) return `${startAbbr}-${endAbbr}`; // fallback if invalid

    // If range wraps around the week
    if (endIdx < startIdx) {
      return `${fullDays[start]} through ${fullDays[end]} (next week)`;
    }

    return `${fullDays[start]} through ${fullDays[end]}`;
  });
}

function formatTimeRange(text) {
  return text.replace(/(\d{1,4}[ap])-(\d{1,4}[ap])/gi, (_, start, end) => {
    const normalize = (t) => {
      const match = t.match(/^(\d{1,2})(\d{2})?([ap])$/i);
      if (!match) return t;
      const [, h, m = '00', p] = match;
      return `${h.padStart(2, '0')}${m}${p}`;
    };

    const parse = (t) => {
      t = normalize(t); // Normalize things like "9p" → "0900p"
      const period = t.includes('a') ? 'AM' : 'PM';
      t = t.replace(/[ap]/i, '');
      const h = parseInt(t.slice(0, -2)) || 0;
      const m = parseInt(t.slice(-2)) || 0;

      let hour = h;
      if (period === 'PM' && hour !== 12) hour += 12;
      if (period === 'AM' && hour === 12) hour = 0;

      return new Date(0, 0, 0, hour, m);
    };

    const s = parse(start);
    const e = parse(end);

    const nextDay = e < s ? '⁺¹' : '';
    return `${s.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} — ${e.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}${nextDay}`;
  });
}

function formatAge(text) {
  // Helper: ordinal suffix
  const ordinal = (n) => {
    const s = ["th", "st", "nd", "rd"];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  };

  return text.replace(/age\((.+?)\)/gi, (match, ages, offset, full) => {
    const nums = ages.split(/[-,]/).map(Number);
    const phrase =
      nums.length === 2
        ? `age requirement: ${nums[0]}-${nums[1]} (until your ${ordinal(
            nums[1] + 1
          )} birthday)`
        : `age requirement: ${nums[0]}+`;

    // Check preceding char for capitalization
    const prevChar = full[offset - 1];
    const capitalize =
      offset === 0 || /[\.\?\!]\s*$/.test(full.slice(0, offset));

    return capitalize
      ? phrase.charAt(0).toUpperCase() + phrase.slice(1)
      : phrase;
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
      /(?<!href=")(?<!<a[^>]*>)(\b([\w.-]+@[\w.-]+\.\w+|((https?:\/\/)?[^\s<>()|]+\.[^\s<>()|]+(?:\/[^\s<>()|]*)?))(?:\|\(([^)]+)\))?|\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}(?:,\d+)?)(?![^<]*>)/g,
      (match) => {
        const originalMatch = match;

        // Phone numbers with optional extension (e.g., 555-123-4567,123)
        const phoneMatch = match.match(/^(\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4})(?:,(\d+))?$/);
        if (phoneMatch) {
          const clean = phoneMatch[1].replace(/\D/g, '');
          const ext = phoneMatch[2];
          const formatted = `(${clean.slice(0, 3)}) ${clean.slice(3, 6)}-${clean.slice(6)}`;
          return ext
            ? `<a href="tel:${clean},${ext}">${formatted} x${ext}</a>`
            : `<a href="tel:${clean}">${formatted}</a>`;
        }

        // Email addresses
        if (/^[\w.-]+@[\w.-]+\.\w+$/.test(match)) {
          return `<a href="mailto:${match}">${match}</a>`;
        }

        // URLs with optional custom label (|(label))
        const linkMatch = match.match(/^((https?:\/\/)?[^\s<>()|]+\.[^\s<>()|]+(?:\/[^\s<>()|]*)?)(?:\|\(([^)]+)\))?$/);
        if (!linkMatch) {
          return originalMatch;
        }

        let [, rawUrl, , label] = linkMatch;
        let trailing = '';

        if (!label) {
          const forbiddenEnd = /[.,;:!?]$/;
          if (forbiddenEnd.test(rawUrl)) {
            trailing = rawUrl.slice(-1);
            rawUrl = rawUrl.slice(0, -1);
          }
        }

        const urlObj = normalizeUserLink(rawUrl);
        if (!urlObj) {
          return originalMatch;
        }

        const display = label || (urlObj.host + urlObj.pathname + urlObj.search + urlObj.hash).replace(/^www\./, '');
        const anchor = buildInjectorLinkMarkup(display, urlObj);
        if (!anchor) {
          return originalMatch;
        }

        return `${anchor}${trailing}`;
      }
    );

    output.push(part);
  }

  return output.join('');
}

const linkHoverStatusCache = new Map();
const aiAnalysisCache = new Map();
const processedLinkElements = new WeakSet();
const LINK_PREVIEW_POPUP_DELAY = 1000;

async function fetchLinkHoverStatus(url) {
  const cached = linkHoverStatusCache.get(url);
  if (cached && Date.now() - cached.timestamp < 5 * 60 * 1000) {
    return cached;
  }

  try {
    // Check URL status
    const status = await new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(
        { type: 'CHECK_URL_STATUS', url },
        (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve(response);
          }
        }
      );
    });

    // If link is valid, get AI analysis
    let aiAnalysis = null;
    if (status.status === 'valid') {
      aiAnalysis = await fetchAIAnalysis(url);
    }

    const result = {
      ...status,
      aiAnalysis,
      timestamp: Date.now()
    };

    linkHoverStatusCache.set(url, result);
    return result;
  } catch (error) {
    console.error('[LinkPreview] Error checking link:', error);
    return { status: 'unknown', aiAnalysis: null };
  }
}

async function fetchAIAnalysis(url) {
  const cached = aiAnalysisCache.get(url);
  if (cached && Date.now() - cached.timestamp < 30 * 60 * 1000) {
    return cached.analysis;
  }

  try {
    const result = await new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(
        { type: 'ANALYZE_PAGE_CONTENT', url },
        (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve(response);
          }
        }
      );
    });

    aiAnalysisCache.set(url, {
      analysis: result.analysis,
      timestamp: Date.now()
    });

    return result.analysis;
  } catch (error) {
    console.error('[LinkPreview] Error analyzing page:', error);
    return null;
  }
}

async function updateLinkHoverPreview(preview, link, validationResult) {
  // Find the status div (second child after header)
  const header = preview.children[0];
  const statusDiv = preview.children[1];

  if (!statusDiv) return;

  // Update status content
  if (status === 'checking') {
    statusDiv.innerHTML = `<div style="color: #666;">⏳ Checking link...</div>`;
  } else if (status === 'valid') {
    let statusHTML = `<div style="color: #28a745; font-weight: bold; margin-bottom: 4px;">✅ Link is accessible</div>`;
    if (validationResult.isHttps) {
      statusHTML += `<div style="color: #666; font-size: 11px;">🔒 HTTPS</div>`;
    } else {
      statusHTML += `<div style="color: #ffa500; font-size: 11px;">⚠️ HTTP only (using proxy for preview)</div>`;
    }

    // Add AI Analysis
    if (validationResult.aiAnalysis) {
      const analysis = validationResult.aiAnalysis;
      statusHTML += `<div style="margin-top: 10px; padding-top: 10px; border-top: 1px solid #ddd;">`;
      statusHTML += `<div style="font-weight: bold; margin-bottom: 4px;">🤖 AI Analysis:</div>`;

      if (analysis.isInvalid || analysis.isClosed) {
        statusHTML += `<div style="color: #dc3545; font-weight: bold; margin-bottom: 4px;">⚠️ WARNING: ${analysis.reason}</div>`;
      } else {
        statusHTML += `<div style="color: #28a745; margin-bottom: 4px;">✓ Page appears active</div>`;
      }

      if (analysis.summary) {
        statusHTML += `<div style="color: #666; font-size: 11px; margin-top: 4px;">${analysis.summary}</div>`;
      }
      statusHTML += `</div>`;
    }

    statusDiv.innerHTML = statusHTML;

    // Add iframe if not already present and status is valid
    if (!preview.children[2]) {
      const iframeContainer = document.createElement('div');
      iframeContainer.style.cssText = `
        width: 100%;
        height: 400px;
        background: #f5f5f5;
        display: flex;
        align-items: center;
        justify-content: center;
        position: relative;
      `;

      const loadingDiv = document.createElement('div');
      loadingDiv.textContent = '⏳ Loading preview...';
      loadingDiv.style.cssText = `
        color: #666;
        font-size: 14px;
      `;
      iframeContainer.appendChild(loadingDiv);

      // Load iframe
      const needsProxy = !validationResult.isHttps && window.location.protocol === 'https:';
      let iframeUrl = link.href;

      if (needsProxy) {
        try {
          const result = await new Promise((resolve, reject) => {
            chrome.runtime.sendMessage(
              { type: 'PROXY_WEBSITE', url: link.href },
              (response) => {
                if (chrome.runtime.lastError) {
                  reject(new Error(chrome.runtime.lastError.message));
                } else {
                  resolve(response);
                }
              }
            );
          });

          if (result.success) {
            const blob = new Blob([result.html], { type: 'text/html' });
            iframeUrl = URL.createObjectURL(blob);
          }
        } catch (error) {
          console.error('[LinkPreview] Proxy failed:', error);
        }
      }

      const iframe = document.createElement('iframe');
      iframe.src = iframeUrl;
      iframe.style.cssText = `
        width: 100%;
        height: 100%;
        border: none;
        position: absolute;
        top: 0;
        left: 0;
      `;

      iframe.onload = () => loadingDiv.remove();
      iframe.onerror = () => {
        loadingDiv.textContent = '❌ Failed to load preview';
        loadingDiv.style.color = '#dc3545';
      };

      iframeContainer.appendChild(iframe);
      preview.appendChild(iframeContainer);

      // Cleanup blob URL when preview is removed
      if (needsProxy && iframeUrl.startsWith('blob:')) {
        const originalRemove = preview.remove.bind(preview);
        preview.remove = function() {
          URL.revokeObjectURL(iframeUrl);
          originalRemove();
        };
      }
    }
  } else if (status === 'broken') {
    statusDiv.innerHTML = `
      <div style="color: #dc3545; font-weight: bold;">❌ Link appears broken</div>
      ${validationResult.httpStatus ? `<div style="color: #666; font-size: 11px;">HTTP ${validationResult.httpStatus}</div>` : ''}
    `;
  } else {
    statusDiv.innerHTML = `<div style="color: #999;">❓ Status unknown</div>`;
  }
}

async function createLinkHoverPreview(link, validationResult) {
  const existing = document.querySelector('.injector-link-preview');
  if (existing) {
    existing.remove();
  }

  const preview = document.createElement('div');
  preview.className = 'injector-link-preview';
  preview.style.cssText = `
    position: relative;
    background: white;
    border: 2px solid #333;
    border-radius: 8px;
    padding: 0;
    width: min(420px, 100%);
    max-width: 100%;
    z-index: 100000;
    box-shadow: 0 8px 24px rgba(0,0,0,0.3);
    font-size: 13px;
    pointer-events: auto;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  `;
  const status = validationResult?.status || 'unknown';
  preview.dataset.linkUrl = link.href;
  preview.dataset.status = status;

  const cleanupCallbacks = [];
  const registerCleanup = (cb) => {
    cleanupCallbacks.push(cb);
  };
  const originalRemove = preview.remove.bind(preview);
  preview.remove = function() {
    while (cleanupCallbacks.length) {
      const cb = cleanupCallbacks.pop();
      try {
        cb();
      } catch (error) {
        console.error('[LinkPreview] Cleanup error:', error);
      }
    }
    originalRemove();
  };

  // Create header
  const header = document.createElement('div');
  header.style.cssText = `
    padding: 12px 16px;
    background: #f8f9fa;
    border-bottom: 2px solid #dee2e6;
    display: flex;
    justify-content: space-between;
    align-items: center;
  `;

  const titleDiv = document.createElement('div');
  titleDiv.style.cssText = `
    font-weight: 600;
    font-size: 14px;
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    margin-right: 8px;
  `;
  titleDiv.textContent = link.href;

  const closeBtn = document.createElement('button');
  closeBtn.innerHTML = '✕';
  closeBtn.style.cssText = `
    background: none;
    border: none;
    font-size: 18px;
    cursor: pointer;
    padding: 0 4px;
    color: #666;
  `;
  closeBtn.onclick = () => preview.remove();

  header.appendChild(titleDiv);
  header.appendChild(closeBtn);

  // Create status/AI analysis section
  const statusDiv = document.createElement('div');
  statusDiv.style.cssText = `
    padding: 12px 16px;
    background: #fff;
    border-bottom: 1px solid #dee2e6;
  `;

  if (status === 'checking') {
    statusDiv.innerHTML = `<div style="color: #666;">⏳ Checking link...</div>`;
  } else if (status === 'valid') {
    let statusHTML = `<div style="color: #28a745; font-weight: bold; margin-bottom: 4px;">✅ Link is accessible</div>`;
    if (validationResult.isHttps) {
      statusHTML += `<div style="color: #666; font-size: 11px;">🔒 HTTPS</div>`;
    } else {
      statusHTML += `<div style="color: #ffa500; font-size: 11px;">⚠️ HTTP only (using proxy for preview)</div>`;
    }

    // Add AI Analysis
    if (validationResult.aiAnalysis) {
      const analysis = validationResult.aiAnalysis;
      statusHTML += `<div style="margin-top: 10px; padding-top: 10px; border-top: 1px solid #ddd;">`;
      statusHTML += `<div style="font-weight: bold; margin-bottom: 4px;">🤖 AI Analysis:</div>`;

      if (analysis.isInvalid || analysis.isClosed) {
        statusHTML += `<div style="color: #dc3545; font-weight: bold; margin-bottom: 4px;">⚠️ WARNING: ${analysis.reason}</div>`;
      } else {
        statusHTML += `<div style="color: #28a745; margin-bottom: 4px;">✓ Page appears active</div>`;
      }

      if (analysis.summary) {
        statusHTML += `<div style="color: #666; font-size: 11px; margin-top: 4px;">${analysis.summary}</div>`;
      }
      statusHTML += `</div>`;
    }

    statusDiv.innerHTML = statusHTML;
  } else if (status === 'broken') {
    statusDiv.innerHTML = `
      <div style="color: #dc3545; font-weight: bold;">❌ Link appears broken</div>
      ${validationResult.httpStatus ? `<div style="color: #666; font-size: 11px;">HTTP ${validationResult.httpStatus}</div>` : ''}
    `;
  } else {
    statusDiv.innerHTML = `<div style="color: #999;">❓ Status unknown</div>`;
  }

  // Create iframe preview (only for valid links)
  if (status === 'valid') {
    const iframeContainer = document.createElement('div');
    iframeContainer.style.cssText = `
      width: 100%;
      height: 400px;
      background: #f5f5f5;
      display: flex;
      align-items: center;
      justify-content: center;
      position: relative;
    `;

    const loadingDiv = document.createElement('div');
    loadingDiv.textContent = '⏳ Loading preview...';
    loadingDiv.style.cssText = `
      color: #666;
      font-size: 14px;
    `;
    iframeContainer.appendChild(loadingDiv);

    // Load iframe
    const needsProxy = !validationResult.isHttps && window.location.protocol === 'https:';
    let iframeUrl = link.href;

    if (needsProxy) {
      try {
        const result = await new Promise((resolve, reject) => {
          chrome.runtime.sendMessage(
            { type: 'PROXY_WEBSITE', url: link.href },
            (response) => {
              if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
              } else {
                resolve(response);
              }
            }
          );
        });

        if (result.success) {
          const blob = new Blob([result.html], { type: 'text/html' });
          iframeUrl = URL.createObjectURL(blob);
        }
      } catch (error) {
        console.error('[LinkPreview] Proxy failed:', error);
      }
    }

    const iframe = document.createElement('iframe');
    iframe.src = iframeUrl;
    iframe.style.cssText = `
      width: 100%;
      height: 100%;
      border: none;
      position: absolute;
      top: 0;
      left: 0;
    `;

    iframe.onload = () => loadingDiv.remove();
    iframe.onerror = () => {
      loadingDiv.textContent = '❌ Failed to load preview';
      loadingDiv.style.color = '#dc3545';
    };

    iframeContainer.appendChild(iframe);
    preview.appendChild(header);
    preview.appendChild(statusDiv);
    preview.appendChild(iframeContainer);

    // Cleanup blob URL when preview is removed
    if (needsProxy && iframeUrl.startsWith('blob:')) {
      registerCleanup(() => {
        URL.revokeObjectURL(iframeUrl);
      });
    }
  } else {
    preview.appendChild(header);
    preview.appendChild(statusDiv);
  }

  const host = document.createElement('div');
  host.className = 'injector-link-preview-host';
  Object.assign(host.style, {
    display: 'flex',
    justifyContent: 'flex-start',
    width: '100%',
    position: 'relative',
    marginTop: '8px'
  });
  host.appendChild(preview);

  const anchorTarget = findPreviewInsertionAnchor(link);
  const insertionParent = anchorTarget?.parentElement || link.parentElement || document.body;
  insertionParent.insertBefore(host, anchorTarget?.nextSibling || null);
  registerCleanup(() => {
    if (host.isConnected) {
      host.remove();
    }
  });

  // Close preview on click outside
  const handleClickOutside = (e) => {
    if (!preview.contains(e.target) && !link.contains(e.target)) {
      preview.remove();
    }
  };

  // Close preview on Escape key
  const handleEscape = (e) => {
    if (e.key === 'Escape') {
      preview.remove();
    }
  };

  const removeGlobalListeners = () => {
    document.removeEventListener('click', handleClickOutside);
    document.removeEventListener('keydown', handleEscape);
  };
  registerCleanup(removeGlobalListeners);

  // Add listeners after a short delay to avoid immediate closure
  const listenerTimer = setTimeout(() => {
    if (!preview.isConnected) {
      return;
    }
    document.addEventListener('click', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
  }, 100);
  registerCleanup(() => clearTimeout(listenerTimer));

  return preview;
}

function findPreviewInsertionAnchor(link) {
  const selectors = [
    '.formatter-preview',
    'li',
    'p',
    'div',
    'section',
    'article',
    'td',
    'th',
    'main'
  ];

  for (const selector of selectors) {
    const candidate = link.closest(selector);
    if (candidate && candidate.parentElement) {
      return candidate;
    }
  }

  return link;
}

function clearLinkHoverPreview() {
  const existing = document.querySelector('.injector-link-preview');
  if (existing) {
    existing.remove();
  }
}

function applyLinkHoverStyles(link, result) {
  link.classList.remove('link-valid', 'link-broken', 'link-warning');
  link.style.backgroundColor = '';
  link.style.borderBottom = '';
  link.style.textDecoration = '';

  if (result.status === 'valid') {
    // Check if AI detected issues
    if (result.aiAnalysis && (result.aiAnalysis.isInvalid || result.aiAnalysis.isClosed)) {
      link.classList.add('link-warning');
      link.style.backgroundColor = '#fff3cd';
      link.style.borderBottom = '2px solid #ffa500';
      link.title = `⚠️ ${result.aiAnalysis.reason}`;
    } else {
      link.classList.add('link-valid');
      link.style.borderBottom = '2px solid #28a745';
      link.title = '✅ Link is valid';
    }
  } else if (result.status === 'broken') {
    link.classList.add('link-broken');
    link.style.backgroundColor = '#f8d7da';
    link.style.borderBottom = '2px solid #dc3545';
    link.style.textDecoration = 'line-through';
    link.title = '❌ Link appears broken';
  } else {
    link.title = '';
  }
}

function attachLinkHoverHandlers(link) {
  if (processedLinkElements.has(link)) {
    return;
  }

  const url = link.href;
  if (!url || !/^https?:\/\//i.test(url)) {
    return;
  }

  processedLinkElements.add(link);
  console.log('[LinkPreview] Attached handlers to:', url);

  let hoverTimer;
  let isHovering = false;
  let delayElapsed = false;
  let validationResolved = false;
  let pendingResult = null;

  const handleValidationResult = async (result) => {
    validationResolved = true;
    pendingResult = result;

    if (!link.isConnected || !isHovering) {
      return;
    }

    console.log('[LinkPreview] Got validation result:', result);
    applyLinkHoverStyles(link, result);

    if (delayElapsed) {
      await createLinkHoverPreview(link, result);
    }
  };

  link.addEventListener('mouseenter', () => {
    console.log('[LinkPreview] Mouse entered link:', url);
    isHovering = true;
    delayElapsed = false;
    validationResolved = false;
    pendingResult = null;

    fetchLinkHoverStatus(url)
      .then((result) => handleValidationResult(result))
      .catch(async (error) => {
        console.error('[LinkPreview] Validation error:', error);
        await handleValidationResult({ status: 'unknown' });
      });

    hoverTimer = setTimeout(async () => {
      delayElapsed = true;
      if (!isHovering || !link.isConnected) {
        return;
      }

      if (validationResolved && pendingResult) {
        await createLinkHoverPreview(link, pendingResult);
      } else {
        await createLinkHoverPreview(link, { status: 'checking' });
      }
    }, LINK_PREVIEW_POPUP_DELAY);
  });

  link.addEventListener('mouseleave', () => {
    console.log('[LinkPreview] Mouse left link');
    isHovering = false;

    // Clear the timer if user leaves before preview shows
    if (hoverTimer) {
      clearTimeout(hoverTimer);
      hoverTimer = null;
    }

    const preview = document.querySelector('.injector-link-preview');
    if (preview &&
        preview.dataset.linkUrl === link.href &&
        preview.dataset.status === 'checking') {
      preview.remove();
    }

    // Don't remove preview - let it stay stable
  });

  // Validate link immediately on load
  fetchLinkHoverStatus(url).then((result) => {
    if (link.isConnected) {
      console.log('[LinkPreview] Applied initial styles for:', url);
      applyLinkHoverStyles(link, result);
    }
  });
}

function processFormatterPreview(previewElement) {
  console.log('[LinkPreview] Processing formatter preview');

  const candidateLinks = previewElement.querySelectorAll('a[href]');
  console.log('[LinkPreview] Total links found:', candidateLinks.length);

  candidateLinks.forEach(link => {
    const href = link.href;
    if (!href ||
        href.startsWith('tel:') ||
        href.startsWith('mailto:') ||
        href.includes('voice.google.com') ||
        href.includes('mail.google.com')) {
      return;
    }

    if (/^https?:\/\//i.test(href)) {
      attachLinkHoverHandlers(link);
    }
  });
}

function setupLinkHoverValidation() {
  console.log('[LinkPreview] Setting up link hover validation');

  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType === Node.ELEMENT_NODE) {
          const element = node;
          if (element.classList.contains('formatter-preview')) {
            console.log('[LinkPreview] Found formatter-preview in mutation');
            processFormatterPreview(element);
            return;
          }

          const ancestor = element.closest?.('.formatter-preview');
          if (ancestor) {
            console.log('[LinkPreview] Found ancestor formatter-preview');
            processFormatterPreview(ancestor);
          }

          element.querySelectorAll?.('.formatter-preview').forEach(preview => {
            console.log('[LinkPreview] Found nested formatter-preview');
            processFormatterPreview(preview);
          });
        } else if (node.nodeType === Node.TEXT_NODE && node.parentElement) {
          const ancestor = node.parentElement.closest('.formatter-preview');
          if (ancestor) {
            processFormatterPreview(ancestor);
          }
        }
      });
    });
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });

  const processExistingPreviews = () => {
    const previews = document.querySelectorAll('.formatter-preview');
    console.log('[LinkPreview] Processing', previews.length, 'existing previews');
    previews.forEach(processFormatterPreview);
  };

  // Process existing previews with multiple retry attempts
  setTimeout(processExistingPreviews, 500);
  setTimeout(processExistingPreviews, 1500);
  setTimeout(processExistingPreviews, 3000);

  let lastHoverUrl = window.location.href;
  const hoverLocationPoller = setInterval(() => {
    const currentHref = window.location.href;
    if (currentHref !== lastHoverUrl) {
      lastHoverUrl = currentHref;
      clearLinkHoverPreview();
      linkHoverStatusCache.clear();
      aiAnalysisCache.clear();
      processExistingPreviews();
    }
  }, 1000);

  window.addEventListener('beforeunload', () => clearInterval(hoverLocationPoller));
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', setupLinkHoverValidation);
} else {
  setupLinkHoverValidation();
}

console.log('[LinkPreview] injector.js link preview module loaded');

function processText(input) {
  const normalized = input
    .replace(/\r\n/g, '\n')
    .replace(/([^\r\n])\s*•\s+/g, '$1\n• ')
    .replace(/^\s*•/gm, '•');
  const lines = normalized.split('\n');
  let output = [];
  let pendingBreak = false;

  // Count non-empty lines to determine if we should add bullets
  const nonEmptyLines = lines.filter(line => line.trim()).length;
  const shouldAddBullets = nonEmptyLines > 1;

  lines.forEach((line, i) => {
    let raw = line.trim();
    if (!raw) {
      if (pendingBreak) {
        output.push('<br>');
      }
      pendingBreak = true;
      return;
    }

    const isFirst = i === 0;
    const alreadyBullet = raw.startsWith('•') || raw.startsWith('<br>&emsp;—') || raw.startsWith('<br>');
    const hadPendingBreak = pendingBreak;
    pendingBreak = false;

    if (!alreadyBullet && !(isFirst && raw.endsWith(':'))) {
      if (raw.startsWith('-')) {
        raw = `<br>&emsp;— ${raw.slice(1).trim()}`;
      } else if (hadPendingBreak) {
        raw = `<br>${raw}`;
      } else if (shouldAddBullets) {
        raw = `• ${raw}`;
      }
    }


    // 👇 Add weekday formatting here
    const formatted = formatAge(formatTimeRange(expandDayRange(raw)));
    output.push(safeHyperlink(formatted));
  });

  return output.join('\n');
}

})();
