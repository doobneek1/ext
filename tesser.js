(() => {
  const isGmail = location.hostname.includes('mail.google.com');
  const isGoogleVoice = location.hostname.includes('voice.google.com');
  const isYourPeer = location.hostname.includes('yourpeer.nyc');
  const isGoGetta = location.hostname.includes('gogetta.nyc');
  
  // Skip hyperlink functionality entirely on Gmail only
  if (isGmail) {
    return;
  }

  const phoneRegex = /(?:\+?\d{1,3}[-.\s]?)?(?:\(\d{1,4}\)|\d{1,4})[-.\s]?\d{1,4}[-.\s]?\d{1,9}(?:\s?(?:ext|x|extension)\.?\s?\d+)?/gi;
  const emailRegex = /[a-zA-Z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-zA-Z0-9!#$%&'*+/=?^_`{|}~-]+)*@(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?\.)+[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?/g;
  const urlRegex = /\b(?:(?:https?|ftp):\/\/|www\.)[-a-zA-Z0-9+&@#\/%?=~_|!:,.;]*[-a-zA-Z0-9+&@#\/%=~_|]/g;

  function isInsideLinkOrEditable(node) {
    let current = node.parentNode;
    while (current) {
      if (
        current.nodeName === 'TEXTAREA' ||
        current.isContentEditable ||
        current.id === 'yp-embed-wrapper'
      ) {
        return true;
      }
      current = current.parentNode;
    }
    return false;
  }

  function hyperlinkTextNodes(root) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null, false);
    const textNodes = [];

    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (isInsideLinkOrEditable(node)) continue;
      textNodes.push(node);
    }

    textNodes.forEach(node => {
      const originalText = node.textContent;
      let replaced = originalText;

      // Only apply URL hyperlinking on domains that aren't yourpeer or gogetta
      if (!isYourPeer && !isGoGetta) {
        replaced = replaced.replace(urlRegex, match => {
          const href = match.startsWith('http') ? match : `https://${match}`;
          return `<a href="${href}" target="_blank" rel="noopener noreferrer">${match}</a>`;
        });
      }

      replaced = replaced.replace(emailRegex, match => {
        return isGmail
          ? `<a href="mailto:${match}">${match}</a>`
          : `<a href="mailto:${match}" target="_blank" rel="noopener noreferrer">${match}</a>`;
      });

if (!isGoogleVoice) {
  replaced = replaced.replace(phoneRegex, match => {
    // Reject matches that contain letters
    if (/[a-z]/i.test(match)) return match;

    const digitsOnly = match.replace(/\D+/g, '');

    // Require at least 10 digits to be a valid phone number
    if (digitsOnly.length < 10) return match;

    return `<a href="tel:${digitsOnly}">${match}</a>`;
  });
}



      if (replaced !== originalText) {
        const template = document.createElement('template');
        template.innerHTML = replaced;
        node.replaceWith(template.content.cloneNode(true));
      }
    });
  }

  // Process a specific root node for hyperlinks
  function processNode(rootNode) {
    // If the rootNode itself is a text node, we need to handle it carefully
    // or ensure hyperlinkTextNodes can handle a single text node as its root.
    // For simplicity, we'll assume hyperlinkTextNodes is robust enough or
    // we primarily care about element nodes being added.
    if (rootNode.nodeType === Node.TEXT_NODE) {
        // If it's a text node, and not inside a link/editable, try to process its parent
        // or the node itself if it's directly added to a place where it should be hyperlinked.
        // This case might need more refinement depending on how text nodes are added.
        // A simple approach: if a text node is added, re-process its parent.
        if (rootNode.parentNode && rootNode.parentNode !== document) {
             // Avoid re-processing the entire document.body for a single text node addition
             // Check if the parent is suitable for processing.
             if (!isInsideLinkOrEditable(rootNode) && rootNode.parentNode.nodeName !== 'SCRIPT' && rootNode.parentNode.nodeName !== 'STYLE') {
                hyperlinkTextNodes(rootNode.parentNode);
             }
        }
    } else if (rootNode.nodeType === Node.ELEMENT_NODE) {
        // If it's an element node, walk its text node descendants
        hyperlinkTextNodes(rootNode);
    }
  }

  // The main processing function, now renamed to reflect it handles shadows.
  function processNodeAndShadows(rootNode, isInitialScan = false) {
    if (!rootNode) return;

    // Determine the actual node to run TreeWalker on.
    // TreeWalker root must be a Node, not a DocumentFragment directly if it's empty.
    let effectiveRoot = rootNode;
    if (rootNode.nodeType === Node.DOCUMENT_FRAGMENT_NODE) { // ShadowRoot
        // Ensure shadow root has children to walk, otherwise TreeWalker can be problematic
        // or simply hyperlinkTextNodes needs to be robust for empty/minimal fragments.
        // hyperlinkTextNodes itself should handle empty roots gracefully.
        effectiveRoot = rootNode;
    } else if (rootNode.nodeType === Node.ELEMENT_NODE) {
        effectiveRoot = rootNode;
    } else if (rootNode.nodeType === Node.TEXT_NODE) {
      // If a single text node is passed, process its parent if appropriate
      if (rootNode.parentNode && rootNode.parentNode !== document &&
          !isInsideLinkOrEditable(rootNode) &&
          rootNode.parentNode.nodeName !== 'SCRIPT' && rootNode.parentNode.nodeName !== 'STYLE') {
        hyperlinkTextNodes(rootNode.parentNode);
      }
      return; // No further recursion needed for a text node by itself
    } else {
        return; // Not an element, shadow root, or text node we can process
    }

    hyperlinkTextNodes(effectiveRoot);

    // Recursively process shadow roots within the current root (if it's an element or shadow DOM)
    // Query all elements that could host a shadow DOM.
    const elementsToScan = effectiveRoot.nodeType === Node.ELEMENT_NODE ? effectiveRoot.querySelectorAll('*') :
                           (effectiveRoot.nodeType === Node.DOCUMENT_FRAGMENT_NODE ? effectiveRoot.querySelectorAll('*') : []);

    for (const element of elementsToScan) {
      if (element.shadowRoot) {
        // Process the shadow DOM
        processNodeAndShadows(element.shadowRoot, isInitialScan);
        // Set up a new observer for this shadow root if it's part of the initial scan
        // or if this shadow root itself was dynamically added (covered by outer observer).
        // We only want to attach an observer once per shadow root.
        // A simple way is to mark the shadow root or its host.
        if (!element.shadowRoot._tesserObserverAttached) {
            observeMutations(element.shadowRoot);
            element.shadowRoot._tesserObserverAttached = true;
        }
      }
    }
  }

  function observeMutations(targetNode) {
    const observer = new MutationObserver(mutationsList => {
      for (const mutation of mutationsList) {
        if (mutation.type === 'childList') {
          mutation.addedNodes.forEach(addedNode => {
            // Basic safety checks
            if (addedNode.nodeName === 'SCRIPT' || addedNode.nodeName === 'STYLE') {
              return;
            }
            let container = addedNode.nodeType === Node.TEXT_NODE ? addedNode.parentNode : addedNode;
            if (container && typeof container.closest === 'function') {
              if (container.closest('a, textarea, [contenteditable="true"]')) {
                return;
              }
            }
            
            // Process the added node and any shadow DOM it might contain or ITS CHILDREN might host
            processNodeAndShadows(addedNode);

            // If the added node is an element and it *itself* hosts a shadow DOM,
            // ensure an observer is attached to that new shadow DOM.
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

  // Initial scan of the document body and its existing shadow DOMs
  processNodeAndShadows(document.body, true);

  // Set up the main observer for the document body (light DOM)
  // Check if body already has observer attached by any chance (e.g. script run multiple times - though IIFE protects)
  if (!document.body._tesserObserverAttached) {
      observeMutations(document.body);
      document.body._tesserObserverAttached = true;
  }


})();
