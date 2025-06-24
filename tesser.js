(() => {
  const phoneRegex = /(?:\+?\d{1,2}[.\-\s]?)?(?:\(?\d{3}\)?[.\-\s]?)?\d{3}[.\-\s]?\d{4}/g;
  const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
  const urlRegex = /\b(?:https?:\/\/|www\.)[^\s<]+/g;

  function isInsideLinkOrEditable(node) {
    let current = node.parentNode;
    while (current) {
      if (
        current.nodeName === 'A' ||
        current.nodeName === 'TEXTAREA' ||
        current.isContentEditable
      ) return true;
      current = current.parentNode;
    }
    return false;
  }

  function createLink(href, text, type = 'url') {
    const a = document.createElement('a');
    a.href = href;
    a.textContent = text;
    if (type === 'url') {
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
    }
    return a;
  }

  function hyperlinkTextNodes(root) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null, false);
    const nodesToReplace = [];

    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (!node.nodeValue.trim()) continue;
      if (isInsideLinkOrEditable(node)) continue;

      const text = node.nodeValue;
      const matches = [...text.matchAll(new RegExp(`${urlRegex.source}|${emailRegex.source}|${phoneRegex.source}`, 'gi'))];

      if (matches.length === 0) continue;

      const fragment = document.createDocumentFragment();
      let lastIndex = 0;

      for (const match of matches) {
        const index = match.index;
        if (index > lastIndex) {
          fragment.appendChild(document.createTextNode(text.slice(lastIndex, index)));
        }

        const matchedText = match[0];
        if (urlRegex.test(matchedText)) {
          const href = matchedText.startsWith('http') ? matchedText : `https://${matchedText}`;
          fragment.appendChild(createLink(href, matchedText, 'url'));
        } else if (emailRegex.test(matchedText)) {
          fragment.appendChild(createLink(`mailto:${matchedText}`, matchedText, 'email'));
        } else if (phoneRegex.test(matchedText)) {
          const digits = matchedText.replace(/\D+/g, '');
          fragment.appendChild(createLink(`tel:${digits}`, matchedText, 'tel'));
        }

        lastIndex = index + matchedText.length;
      }

      if (lastIndex < text.length) {
        fragment.appendChild(document.createTextNode(text.slice(lastIndex)));
      }

      nodesToReplace.push({ oldNode: node, newNode: fragment });
    }

    // Replace nodes outside of the loop
    nodesToReplace.forEach(({ oldNode, newNode }) => {
      oldNode.parentNode.replaceChild(newNode, oldNode);
    });
  }

  hyperlinkTextNodes(document.body);
})();
