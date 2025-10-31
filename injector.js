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

      const convertBtn = [...buttonRow.children].find(btn => btn.textContent === 'Convert');
      const undoBtn = [...buttonRow.children].find(btn => btn.textContent === 'Undo');

      const updateButtonStates = () => {
        const formatted = trimTrailingBlankLines(processText(textarea.value));
        const currentValue = trimTrailingBlankLines(textarea.value);
        convertBtn.disabled = (formatted === currentValue);
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
        // Phone
        const phoneMatch = match.match(/^(\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4})(?:,(\d+))?$/);
        if (phoneMatch) {
          const clean = phoneMatch[1].replace(/\D/g, '');
          const ext = phoneMatch[2];
          const formatted = `(${clean.slice(0, 3)}) ${clean.slice(3, 6)}-${clean.slice(6)}`;
          return ext
            ? `<a href="tel:${clean},${ext}">${formatted} x${ext}</a>`
            : `<a href="tel:${clean}">${formatted}</a>`;
        }

        // Email
        const emailMatch = match.match(/^[\w.-]+@[\w.-]+\.\w+$/);
        if (emailMatch) {
          return `<a href="mailto:${match}">${match}</a>`;
        }

        // URL (with optional label)
        const labelMatch = match.match(/^((https?:\/\/)?[^\s<>()|]+\.[^\s<>()|]+(?:\/[^\s<>()|]*)?)(?:\|\(([^)]+)\))?$/);
        if (labelMatch) {
          let [, rawUrl, scheme, label] = labelMatch;
          let trailing = '';

          // If no label, peel off trailing punctuation like ".", ",", etc.
          if (!label) {
            const forbiddenEnd = /[.,;:!?]$/;
            if (forbiddenEnd.test(rawUrl)) {
              trailing = rawUrl.slice(-1);
              rawUrl = rawUrl.slice(0, -1);
            }
          }

          // Ensure scheme
          const urlWithScheme = scheme ? rawUrl : `https://${rawUrl}`;

          // Parse safely and validate using the hostname only
          let u;
          try {
            u = new URL(urlWithScheme);
          } catch {
            return match; // not a parsable URL — leave as-is
          }

          const host = u.hostname;           // e.g., "yourpeer.nyc"
          const parts = host.split('.');
          if (parts.length < 2) return match; // needs at least sld.tld

          const tld = parts[parts.length - 1];
          const sld = parts[parts.length - 2];

          // Basic sanity checks: TLD letters 2–24; SLD length >= 2
          if (!/^[a-z]{2,24}$/i.test(tld)) return match;
          if (!sld || sld.length < 2) return match;

          // Display: use label if provided; else show host + path (no scheme)
          const display = label || (u.host + u.pathname + u.search + u.hash).replace(/^www\./, '');

          const isYourPeer = host.endsWith('yourpeer.nyc');
          const attrParts = ['class="injector-link"'];

          if (!isYourPeer) {
            attrParts.unshift('target="_blank"', 'rel="noopener noreferrer"');
          }

          // Check all website links, not just HTTPS
          attrParts.push(`data-link-check="${u.href}"`);

          return `<a href="${u.href}" ${attrParts.join(' ')}>${display}</a>${trailing}`;
        }

        return match;
      }
    );

    output.push(part);
  }

  return output.join('');
}

const linkHoverStatusCache = new Map();
const aiAnalysisCache = new Map();

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
    position: fixed;
    background: white;
    border: 2px solid #333;
    border-radius: 8px;
    padding: 0;
    width: 600px;
    max-width: 90vw;
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
      const originalRemove = preview.remove.bind(preview);
      preview.remove = function() {
        URL.revokeObjectURL(iframeUrl);
        originalRemove();
      };
    }
  } else {
    preview.appendChild(header);
    preview.appendChild(statusDiv);
  }

  document.body.appendChild(preview);

  // Position the preview
  const rect = link.getBoundingClientRect();

  preview.style.left = `${Math.max(8, rect.left)}px`;
  preview.style.top = `${rect.bottom + 5}px`;

  // Adjust if off-screen
  setTimeout(() => {
    const previewRect = preview.getBoundingClientRect();
    if (previewRect.right > window.innerWidth) {
      preview.style.left = `${Math.max(8, window.innerWidth - previewRect.width - 8)}px`;
    }
    if (previewRect.bottom > window.innerHeight) {
      preview.style.top = `${Math.max(8, rect.top - previewRect.height - 5)}px`;
    }
  }, 10);

  // Close preview on click outside
  const handleClickOutside = (e) => {
    if (!preview.contains(e.target) && !link.contains(e.target)) {
      preview.remove();
      document.removeEventListener('click', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    }
  };

  // Close preview on Escape key
  const handleEscape = (e) => {
    if (e.key === 'Escape') {
      preview.remove();
      document.removeEventListener('click', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    }
  };

  // Add listeners after a short delay to avoid immediate closure
  setTimeout(() => {
    document.addEventListener('click', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
  }, 100);

  return preview;
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
  if (link.dataset.linkHoverProcessed === 'true') {
    return;
  }

  const url = link.getAttribute('data-link-check');
  // Accept both HTTP and HTTPS URLs
  if (!url || !/^https?:\/\//i.test(url)) {
    console.log('[LinkPreview] Skipping link without valid URL:', url);
    return;
  }

  link.dataset.linkHoverProcessed = 'true';
  console.log('[LinkPreview] Attached handlers to:', url);

  let hoverTimer;
  let validationPromise;
  let isHovering = false;

  link.addEventListener('mouseenter', () => {
    console.log('[LinkPreview] Mouse entered link:', url);
    isHovering = true;

    // Start fetching validation result immediately
    validationPromise = fetchLinkHoverStatus(url);

    // Show preview quickly with a checking placeholder
    hoverTimer = setTimeout(() => {
      if (!isHovering || !link.isConnected) return;

      createLinkHoverPreview(link, { status: 'checking' });

      validationPromise
        .then(async (result) => {
          console.log('[LinkPreview] Got validation result:', result);
          if (!link.isConnected || !isHovering) {
            return;
          }
          await createLinkHoverPreview(link, result);
          applyLinkHoverStyles(link, result);
        })
        .catch(async (error) => {
          console.error('[LinkPreview] Validation error:', error);
          if (!link.isConnected || !isHovering) {
            return;
          }
          await createLinkHoverPreview(link, { status: 'unknown' });
        });
    }, 0);
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

  // Find all links (including those without our attributes)
  const allLinks = previewElement.querySelectorAll('a');
  console.log('[LinkPreview] Total links found:', allLinks.length);

  // Add attributes to website links dynamically
  let websiteLinksProcessed = 0;
  allLinks.forEach(link => {
    const href = link.href;

    // Skip tel:, mailto:, and voice.google.com links
    if (!href ||
        href.startsWith('tel:') ||
        href.startsWith('mailto:') ||
        href.includes('voice.google.com') ||
        href.includes('mail.google.com')) {
      return;
    }

    // Check if it's an HTTP/HTTPS website link
    if (/^https?:\/\//i.test(href)) {
      // Add the attributes if they don't exist
      if (!link.classList.contains('injector-link')) {
        link.classList.add('injector-link');
      }
      if (!link.hasAttribute('data-link-check')) {
        link.setAttribute('data-link-check', href);
      }
      websiteLinksProcessed++;
      console.log('[LinkPreview] Added attributes to:', href);
    }
  });

  console.log('[LinkPreview] Processed', websiteLinksProcessed, 'website links');

  // Now find and attach handlers to all properly attributed links
  const links = previewElement.querySelectorAll('a.injector-link[data-link-check]');
  console.log('[LinkPreview] Attaching handlers to', links.length, 'links');
  links.forEach(attachLinkHoverHandlers);
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

    // 👇 Add weekday formatting here
    const formatted = formatAge(formatTimeRange(expandDayRange(raw)));
    output.push(safeHyperlink(formatted));
  });

  return output.join('\n');
}

})();
