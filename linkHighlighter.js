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
  }
})();
