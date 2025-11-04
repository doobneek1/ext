(() => {
  const hostname = location.hostname.toLowerCase();
  const isGmail = hostname.includes('mail.google.com');
  const isGoogleVoice = hostname.includes('voice.google.com');
  const isYourPeer = hostname.includes('yourpeer.nyc');
  const isGoGetta = hostname.includes('gogetta.nyc');

  // Skip hyperlink functionality entirely on Gmail only
  if (isGmail) {
    return;
  }

  const phoneRegex = /(?:\+?\d{1,3}[-.\s]?)?(?:\(\d{1,4}\)|\d{1,4})[-.\s]?\d{1,4}[-.\s]?\d{1,9}(?:\s?(?:ext|x|extension)\.?\s?\d+)?/gi;
  const emailRegex = /[a-zA-Z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-zA-Z0-9!#$%&'*+/=?^_`{|}~-]+)*@(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?\.)+[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?/gi;
  const urlRegex = /\b(?:(?:https?|ftp):\/\/|www\.)[-a-zA-Z0-9+&@#\/%?=~_|!:,.;]*[-a-zA-Z0-9+&@#\/%=~_|]/gi;

  const AUTO_TEXT_FLAG = '__tesserAutoText';
  const processedNodes = new WeakSet();

  const SKIP_TAGS = new Set([
    'A', 'TEXTAREA', 'CODE', 'PRE', 'SCRIPT', 'STYLE', 'NOSCRIPT', 'OPTION', 'BUTTON',
    'INPUT', 'SELECT', 'LABEL', 'CANVAS', 'SVG', 'TITLE', 'HEAD', 'IFRAME'
  ]);

  const hyperlinkPatterns = [];

  if (!isYourPeer && !isGoGetta) {
    hyperlinkPatterns.push({
      type: 'url',
      getRegex: () => new RegExp(urlRegex.source, 'gi'),
      build(match) {
        const raw = match[0];
        if (!raw) return null;
        const href = /^https?:\/\//i.test(raw) || /^ftp:\/\//i.test(raw) ? raw : `https://${raw}`;
        const anchor = document.createElement('a');
        anchor.href = href;
        anchor.target = '_blank';
        anchor.rel = 'noopener noreferrer';
        anchor.textContent = raw;
        anchor.dataset.ypAutoLink = 'true';
        return anchor;
      }
    });
  }

  hyperlinkPatterns.push({
    type: 'email',
    getRegex: () => new RegExp(emailRegex.source, 'gi'),
    build(match) {
      const address = match[0];
      if (!address || !address.includes('@')) return null;
      const anchor = document.createElement('a');
      anchor.href = `mailto:${address}`;
      anchor.textContent = address;
      anchor.dataset.ypAutoLink = 'true';
      return anchor;
    }
  });

  if (!isGoogleVoice) {
    hyperlinkPatterns.push({
      type: 'phone',
      getRegex: () => new RegExp(phoneRegex.source, 'gi'),
      build(match) {
        const raw = match[0];
        if (!raw || /[a-z]/i.test(raw)) return null;
        const digitsOnly = raw.replace(/\D+/g, '');
        if (digitsOnly.length < 10 || digitsOnly.length > 15) return null;
        const anchor = document.createElement('a');
        anchor.href = `tel:${digitsOnly}`;
        anchor.textContent = raw;
        anchor.dataset.ypAutoLink = 'true';
        return anchor;
      }
    });
  }

  if (!hyperlinkPatterns.length) {
    return;
  }

  function shouldSkipNode(node) {
    let current = node.parentNode;
    while (current) {
      if (current.nodeType === Node.ELEMENT_NODE) {
        const tagName = current.tagName;
        if (SKIP_TAGS.has(tagName)) return true;
        if (current.isContentEditable) return true;
        if (current.id === 'yp-embed-wrapper') return true;
      }
      current = current.parentNode;
    }
    return false;
  }

  function findNextMatch(text, startIndex) {
    let best = null;
    for (const pattern of hyperlinkPatterns) {
      const regex = pattern.getRegex();
      regex.lastIndex = startIndex;
      const match = regex.exec(text);
      if (match && (best === null || match.index < best.index)) {
        best = { pattern, match, index: match.index, value: match[0] };
      }
    }
    return best;
  }

  function createLinkifiedFragment(text) {
    let cursor = 0;
    let changed = false;
    const parts = [];

    while (cursor < text.length) {
      const next = findNextMatch(text, cursor);
      if (!next) break;

      if (next.index > cursor) {
        parts.push({ type: 'text', value: text.slice(cursor, next.index) });
      }

      const anchor = next.pattern.build(next.match);
      if (anchor) {
        parts.push({ type: 'node', value: anchor });
        changed = true;
      } else {
        parts.push({ type: 'text', value: next.value });
      }

      const advanceBy = next.value.length || 1;
      cursor = next.index + advanceBy;
    }

    if (!changed) {
      return null;
    }

    if (cursor < text.length) {
      parts.push({ type: 'text', value: text.slice(cursor) });
    }

    const fragment = document.createDocumentFragment();
    for (const part of parts) {
      if (part.type === 'node') {
        fragment.appendChild(part.value);
      } else if (part.value) {
        const textNode = document.createTextNode(part.value);
        textNode[AUTO_TEXT_FLAG] = true;
        fragment.appendChild(textNode);
      }
    }
    return fragment;
  }

  function hyperlinkTextNodes(root) {
    if (!root) return;

    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null, false);
    const candidates = [];

    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (processedNodes.has(node)) continue;
      if (node[AUTO_TEXT_FLAG]) {
        processedNodes.add(node);
        continue;
      }
      if (!node.nodeValue || !node.nodeValue.trim()) {
        processedNodes.add(node);
        continue;
      }
      if (shouldSkipNode(node)) {
        processedNodes.add(node);
        continue;
      }
      candidates.push(node);
    }

    candidates.forEach(node => {
      const fragment = createLinkifiedFragment(node.nodeValue);
      if (fragment) {
        node.replaceWith(fragment);
      }
      processedNodes.add(node);
    });
  }

  function processNode(rootNode) {
    if (rootNode.nodeType === Node.TEXT_NODE) {
      if (
        rootNode.parentNode &&
        rootNode.parentNode !== document &&
        !shouldSkipNode(rootNode)
      ) {
        hyperlinkTextNodes(rootNode.parentNode);
      }
      return;
    }

    if (rootNode.nodeType === Node.ELEMENT_NODE || rootNode.nodeType === Node.DOCUMENT_FRAGMENT_NODE) {
      hyperlinkTextNodes(rootNode);
    }
  }

  function processNodeAndShadows(rootNode) {
    if (!rootNode) return;

    processNode(rootNode);

    const elementsToScan =
      rootNode.nodeType === Node.ELEMENT_NODE || rootNode.nodeType === Node.DOCUMENT_FRAGMENT_NODE
        ? rootNode.querySelectorAll('*')
        : [];

    elementsToScan.forEach(element => {
      if (element.shadowRoot) {
        processNodeAndShadows(element.shadowRoot);
        if (!element.shadowRoot._tesserObserverAttached) {
          observeMutations(element.shadowRoot);
          element.shadowRoot._tesserObserverAttached = true;
        }
      }
    });
  }

  function observeMutations(targetNode) {
    const observer = new MutationObserver(mutationsList => {
      for (const mutation of mutationsList) {
        if (mutation.type === 'childList') {
          mutation.addedNodes.forEach(addedNode => {
            if (!addedNode) return;
            if (addedNode.nodeName === 'SCRIPT' || addedNode.nodeName === 'STYLE') {
              return;
            }
            if (
              addedNode.nodeType === Node.ELEMENT_NODE &&
              addedNode.closest &&
              addedNode.closest('#yp-embed-wrapper')
            ) {
              return;
            }
            processNodeAndShadows(addedNode);
            if (addedNode.nodeType === Node.ELEMENT_NODE && addedNode.shadowRoot) {
              if (!addedNode.shadowRoot._tesserObserverAttached) {
                observeMutations(addedNode.shadowRoot);
                addedNode.shadowRoot._tesserObserverAttached = true;
              }
            }
          });
        }
      }
    });

    observer.observe(targetNode, { childList: true, subtree: true });
  }

  processNodeAndShadows(document.body);

  if (!document.body._tesserObserverAttached) {
    observeMutations(document.body);
    document.body._tesserObserverAttached = true;
  }
})();
