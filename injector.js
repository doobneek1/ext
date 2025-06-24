(function () {
  const currentHost = location.hostname;
  const currentPath = location.pathname;
  const lastPath = sessionStorage.getItem('formatterLastPath');

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
          const phoneMatch = match.match(/^(\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4})(?:,(\d+))?$/);
          if (phoneMatch) {
            const clean = phoneMatch[1].replace(/\D/g, '');
            const ext = phoneMatch[2];
            const formatted = `(${clean.slice(0, 3)}) ${clean.slice(3, 6)}-${clean.slice(6)}`;
            return ext
              ? `<a href="tel:${clean},${ext}">${formatted} x${ext}</a>`
              : `<a href="tel:${clean}">${formatted}</a>`;
          }
          const emailMatch = match.match(/^[\w.-]+@[\w.-]+\.\w+$/);
          if (emailMatch) {
            return `<a href="mailto:${match}">${match}</a>`;
          }
          const labelMatch = match.match(/^((https?:\/\/)?[^\s<>()|]+\.[^\s<>()|]+)(?:\|\(([^)]+)\))?$/);
          if (labelMatch) {
            let [, rawUrl, scheme, label] = labelMatch;
            let trailing = '';
            if (!label) {
              const forbiddenEnd = /[.,;:!?]$/;
              if (forbiddenEnd.test(rawUrl)) {
                trailing = rawUrl.slice(-1);
                rawUrl = rawUrl.slice(0, -1);
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
    const normalized = input
      .replace(/([^\n])\s*•\s+/g, '$1\n• ')
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
