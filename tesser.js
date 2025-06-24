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

      replaced = replaced.replace(urlRegex, match => {
        const href = match.startsWith('http') ? match : `https://${match}`;
        return `<a href="${href}" target="_blank" rel="noopener noreferrer">${match}</a>`;
      });

      replaced = replaced.replace(emailRegex, match =>
        `<a href="mailto:${match}">${match}</a>`
      );

      replaced = replaced.replace(phoneRegex, match =>
        `<a href="tel:${match.replace(/\D+/g, '')}">${match}</a>`
      );

      if (replaced !== originalText) {
        const template = document.createElement('template');
        template.innerHTML = replaced;
        node.replaceWith(template.content.cloneNode(true));
      }
    });
  }

  hyperlinkTextNodes(document.body);
})();
