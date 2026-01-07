(() => {
  const isIframe = window.top !== window.self;
  const hostname = location.hostname.toLowerCase();
  const isGoGettaDomain = hostname.includes('gogetta.nyc') ||
                          hostname.includes('test.gogetta.nyc');
  const isYourPeerFrame = hostname.endsWith('yourpeer.nyc') ||
                          hostname.endsWith('yourpeer-staging.nyc');
  // Skip gogetta pages entirely
  if (isGoGettaDomain) {
    console.log('[LinkHighlighter] Skipping gogetta domain');
    return;
  }
  // Only run inside iframes when we're in the YP Mini iframe
  if (isIframe && !isYourPeerFrame) {
    console.log('[LinkHighlighter] Skipping non-YourPeer iframe');
    return;
  }
  // Check if redirectEnabled setting is true
  chrome.storage.local.get('redirectEnabled', (data) => {
    const redirectEnabled = !!data.redirectEnabled;
    console.log('[LinkHighlighter] redirectEnabled:', redirectEnabled);
    if (!redirectEnabled) {
      console.log('[LinkHighlighter] redirectEnabled is false, not initializing');
      return;
    }
    console.log('[LinkHighlighter] Initializing on', hostname);
    initializeLinkHighlighter();
  });
  function initializeLinkHighlighter() {
    const validationCache = new Map();
    const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
    const shouldRunPhoneOverlay = !isIframe && !isGoGettaDomain && !isYourPeerFrame;
    async function validateLink(url) {
      const cached = validationCache.get(url);
      if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
        return cached.status;
      }
      try {
        const result = await new Promise((resolve, reject) => {
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
        validationCache.set(url, {
          status: result.status,
          timestamp: Date.now()
        });
        return result.status;
      } catch (error) {
        console.error('[LinkHighlighter] Error validating link:', error);
        return 'unknown';
      }
    }
    function applyHighlight(link, status) {
      if (!link.dataset.linkHighlightOriginalOutline) {
        link.dataset.linkHighlightOriginalOutline = link.style.outline || '';
        link.dataset.linkHighlightOriginalOutlineOffset = link.style.outlineOffset || '';
      }
      link.style.outline = link.dataset.linkHighlightOriginalOutline || '';
      link.style.outlineOffset = link.dataset.linkHighlightOriginalOutlineOffset || '';
      link.style.removeProperty('opacity');
      link.removeAttribute('title');
      link.setAttribute('data-link-status', status);
      if (status === 'checking') {
        link.style.outline = '2px dashed #6c757d';
        link.style.outlineOffset = '1px';
        link.title = '�?3 Checking link...';
      } else if (status === 'valid') {
        link.style.outline = '2px solid #28a745';
        link.style.outlineOffset = '1px';
        link.title = '�o. Link is valid';
      } else if (status === 'broken') {
        link.style.outline = '2px solid #dc3545';
        link.style.outlineOffset = '1px';
        link.title = '�?O Link appears broken';
      } else if (status === 'unknown') {
        link.title = '�?" Could not verify link';
      }
    }
    async function highlightWebsiteLinks() {
      const links = document.querySelectorAll('a[href]');
      for (const link of links) {
        const href = link.href;
        if (link.dataset.linkHighlightProcessed === 'true') {
          continue;
        }
        if (!href ||
            !/^https?:\/\//i.test(href) ||
            href.startsWith('tel:') ||
            href.startsWith('mailto:') ||
            href.includes('voice.google.com') ||
            href.includes('mail.google.com')) {
          continue;
        }
        link.dataset.linkHighlightProcessed = 'true';
        console.log('[LinkHighlighter] Processing:', href);
        applyHighlight(link, 'checking');
        validateLink(href).then(status => {
          if (link.isConnected) {
            applyHighlight(link, status);
          }
        }).catch(() => {
          if (link.isConnected) {
            applyHighlight(link, 'unknown');
          }
        });
      }
    }
    // Run once on load
    highlightWebsiteLinks();
    const observer = new MutationObserver((mutations) => {
      let shouldProcess = false;
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType === Node.ELEMENT_NODE) {
            if (node.tagName === 'A' || node.querySelector('a')) {
              shouldProcess = true;
              break;
            }
          }
        }
        if (shouldProcess) break;
      }
      if (shouldProcess) {
        highlightWebsiteLinks();
      }
    });
    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
    console.log('[LinkHighlighter] Loaded and observing');
    if (shouldRunPhoneOverlay) {
      initializePhoneOverlay();
    }
    function initializePhoneOverlay() {
      const PHONE_OVERLAY_ID = 'dnk-phone-overlay';
      const PHONE_HIGHLIGHT_ID = 'dnk-phone-highlight';
      const PHONE_REGEX = /(?:(?:\+?1[\s.\-]*)?)\(?\d{3}\)?[\s.\-]*\d{3}[\s.\-]*\d{4}(?:\s*(?:x|ext\.?|extension|#)\s*\d+)?/gi;
      const MAX_MATCHES = 200;
      let overlayOpen = false;
      let scanTimer = null;
      let entries = [];
      let overlayPosition = { top: 88, left: 20 };
      const DRAG_HOLD_MS = 350;
      const DRAG_MOVE_TOLERANCE_PX = 6;
      const OVERLAY_PADDING_PX = 8;
      const digitsOnly = (value) => String(value || '').replace(/\D/g, '');
      const isOverlayMutation = (mutation) => {
        const target = mutation.target;
        const el = target?.nodeType === Node.TEXT_NODE ? target.parentElement : target;
        return !!el?.closest?.(`#${PHONE_OVERLAY_ID}`);
      };
      const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
      const attachLongPressDrag = (handle, container, onDragStart, onDragEnd) => {
        let holdTimer = null;
        let dragActive = false;
        let startX = 0;
        let startY = 0;
        let originLeft = 0;
        let originTop = 0;
        const clearHold = () => {
          if (holdTimer) {
            clearTimeout(holdTimer);
            holdTimer = null;
          }
        };
        const endDrag = () => {
          clearHold();
          if (!dragActive) return;
          dragActive = false;
          container.style.cursor = '';
          container.style.userSelect = '';
          onDragEnd?.();
        };
        handle.addEventListener('pointerdown', (e) => {
          if (e.button !== 0) return;
          startX = e.clientX;
          startY = e.clientY;
          originLeft = overlayPosition.left;
          originTop = overlayPosition.top;
          clearHold();
          holdTimer = setTimeout(() => {
            dragActive = true;
            container.style.cursor = 'grabbing';
            container.style.userSelect = 'none';
            onDragStart?.();
          }, DRAG_HOLD_MS);
          handle.setPointerCapture?.(e.pointerId);
        });
        handle.addEventListener('pointermove', (e) => {
          if (!holdTimer && !dragActive) return;
          const dx = e.clientX - startX;
          const dy = e.clientY - startY;
          if (!dragActive) {
            if (Math.hypot(dx, dy) > DRAG_MOVE_TOLERANCE_PX) {
              clearHold();
            }
            return;
          }
          e.preventDefault();
          const rect = container.getBoundingClientRect();
          const maxLeft = Math.max(OVERLAY_PADDING_PX, window.innerWidth - rect.width - OVERLAY_PADDING_PX);
          const maxTop = Math.max(OVERLAY_PADDING_PX, window.innerHeight - rect.height - OVERLAY_PADDING_PX);
          const nextLeft = clamp(originLeft + dx, OVERLAY_PADDING_PX, maxLeft);
          const nextTop = clamp(originTop + dy, OVERLAY_PADDING_PX, maxTop);
          overlayPosition = { top: nextTop, left: nextLeft };
          container.style.left = `${nextLeft}px`;
          container.style.top = `${nextTop}px`;
        });
        handle.addEventListener('pointerup', () => endDrag());
        handle.addEventListener('pointercancel', () => endDrag());
        handle.addEventListener('lostpointercapture', () => endDrag());
      };
      const collectPhoneEntries = () => {
        const results = [];
        const index = new Map();
        const walker = document.createTreeWalker(
          document.body,
          NodeFilter.SHOW_TEXT,
          {
            acceptNode(node) {
              if (!node.nodeValue || !/\d/.test(node.nodeValue)) {
                return NodeFilter.FILTER_REJECT;
              }
              const parent = node.parentElement;
              if (!parent) return NodeFilter.FILTER_REJECT;
              if (parent.closest(`script,style,textarea,input,select,code,pre,noscript,#${PHONE_OVERLAY_ID}`)) {
                return NodeFilter.FILTER_REJECT;
              }
              return NodeFilter.FILTER_ACCEPT;
            }
          }
        );
        let count = 0;
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
          const text = node.nodeValue;
          if (!text) continue;
          const regex = new RegExp(PHONE_REGEX.source, 'gi');
          let match;
          while ((match = regex.exec(text))) {
            const raw = match[0].trim();
            const digits = digitsOnly(raw);
            if (digits.length < 10) continue;
            const key = digits || raw;
            let entry = index.get(key);
            if (!entry) {
              entry = { key, display: raw, matches: [] };
              index.set(key, entry);
              results.push(entry);
            }
            entry.matches.push({ node, start: match.index, end: match.index + raw.length });
            count += 1;
            if (count >= MAX_MATCHES) {
              return results;
            }
          }
        }
        return results;
      };
      const removeOverlay = () => {
        document.getElementById(PHONE_OVERLAY_ID)?.remove();
      };
      const highlightMatch = (match) => {
        const existing = document.getElementById(PHONE_HIGHLIGHT_ID);
        if (existing) existing.remove();
        const range = document.createRange();
        range.setStart(match.node, match.start);
        range.setEnd(match.node, match.end);
        const rect = range.getBoundingClientRect();
        if (!rect || rect.width === 0 || rect.height === 0) return;
        const highlight = document.createElement('div');
        highlight.id = PHONE_HIGHLIGHT_ID;
        Object.assign(highlight.style, {
          position: 'absolute',
          top: `${window.scrollY + rect.top - 4}px`,
          left: `${window.scrollX + rect.left - 4}px`,
          width: `${rect.width + 8}px`,
          height: `${rect.height + 8}px`,
          background: 'rgba(255, 230, 80, 0.7)',
          border: '2px solid rgba(255, 185, 0, 0.9)',
          borderRadius: '6px',
          pointerEvents: 'none',
          zIndex: '2147483647',
          boxSizing: 'border-box'
        });
        document.body.appendChild(highlight);
        highlight.animate(
          [
            { opacity: 0, transform: 'scale(0.98)' },
            { opacity: 1, transform: 'scale(1)' },
            { opacity: 0, transform: 'scale(1.02)' }
          ],
          { duration: 1200, easing: 'ease-out' }
        );
        setTimeout(() => highlight.remove(), 1300);
      };
      const focusEntry = (entry) => {
        if (!entry?.matches?.length) return;
        const match = entry.matches.find(m => m.node?.isConnected) || entry.matches[0];
        if (!match?.node?.isConnected) {
          scheduleScan();
          return;
        }
        const range = document.createRange();
        range.setStart(match.node, match.start);
        range.setEnd(match.node, match.end);
        const rect = range.getBoundingClientRect();
        const targetY = rect.top + window.scrollY - Math.max(120, window.innerHeight * 0.3);
        window.scrollTo({ top: Math.max(0, targetY), behavior: 'smooth' });
        setTimeout(() => highlightMatch(match), 350);
      };
      const renderOverlay = () => {
        removeOverlay();
        if (!entries.length) return;
        const container = document.createElement('div');
        container.id = PHONE_OVERLAY_ID;
        container.dataset.open = overlayOpen ? 'true' : 'false';
        Object.assign(container.style, {
          position: 'fixed',
          top: `${overlayPosition.top}px`,
          left: `${overlayPosition.left}px`,
          zIndex: '10000',
          fontFamily: 'Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
          color: '#1f1f1f'
        });
        let suppressToggleClick = false;
        const toggle = document.createElement('button');
        toggle.type = 'button';
        toggle.textContent = overlayOpen ? 'x' : '?';
        Object.assign(toggle.style, {
          width: '28px',
          height: '28px',
          borderRadius: '50%',
          border: '1px solid #c9c9c9',
          background: '#fff',
          fontSize: '16px',
          fontWeight: '700',
          cursor: 'pointer',
          boxShadow: '0 2px 6px rgba(0,0,0,0.15)'
        });
        const panel = document.createElement('div');
        Object.assign(panel.style, {
          marginTop: '8px',
          padding: '12px',
          background: '#ffffff',
          border: '1px solid #dedede',
          borderRadius: '8px',
          boxShadow: '0 6px 18px rgba(0, 0, 0, 0.12)',
          maxWidth: '280px',
          maxHeight: '60vh',
          overflowY: 'auto',
          display: overlayOpen ? 'block' : 'none'
        });
        toggle.addEventListener('click', (e) => {
          if (suppressToggleClick) {
            suppressToggleClick = false;
            e.preventDefault();
            e.stopPropagation();
            return;
          }
          overlayOpen = !overlayOpen;
          panel.style.display = overlayOpen ? 'block' : 'none';
          toggle.textContent = overlayOpen ? 'x' : '?';
        });
        entries.forEach(entry => {
          const row = document.createElement('div');
          row.style.marginBottom = '8px';
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.textContent = entry.display;
          btn.title = entry.display;
          Object.assign(btn.style, {
            background: 'none',
            border: 'none',
            padding: '0',
            color: '#0d6efd',
            fontSize: '12px',
            textAlign: 'left',
            cursor: 'pointer',
            width: '100%'
          });
          btn.addEventListener('click', () => focusEntry(entry));
          row.appendChild(btn);
          panel.appendChild(row);
        });
        container.appendChild(toggle);
        container.appendChild(panel);
        document.body.appendChild(container);
        attachLongPressDrag(
          toggle,
          container,
          () => {
            suppressToggleClick = true;
          },
          () => {
            setTimeout(() => {
              suppressToggleClick = false;
            }, 0);
          }
        );
      };
      const scanAndRender = () => {
        entries = collectPhoneEntries();
        renderOverlay();
      };
      const scheduleScan = () => {
        clearTimeout(scanTimer);
        scanTimer = setTimeout(scanAndRender, 400);
      };
      scanAndRender();
      const phoneObserver = new MutationObserver((mutations) => {
        if (mutations.every(isOverlayMutation)) {
          return;
        }
        scheduleScan();
      });
      phoneObserver.observe(document.body, {
        childList: true,
        subtree: true,
        characterData: true
      });
    }
  }
})();
