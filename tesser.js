(() => {
  // Dynamically load Tesseract.js from CDN
  const loadOCR = new Promise(resolve => {
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.0.1/dist/tesseract.min.js';
    script.onload = resolve;
    document.head.appendChild(script);
  });

  loadOCR.then(() => {
    // === 1. Auto-link plain text ===
    const phoneRegex = /(?:\+?\d{1,2}[.\-\s]?)?(?:\(?\d{3}\)?[.\-\s]?)?\d{3}[.\-\s]?\d{4}/g;
    const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
    const urlRegex = /\b(?:https?:\/\/|www\.)[^\s<]+/g;

    function hyperlinkTextNodes(root) {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null, false);
      const textNodes = [];

      while (walker.nextNode()) {
        const node = walker.currentNode;
        if (node.parentNode && node.parentNode.nodeName !== 'A') {
          textNodes.push(node);
        }
      }

      textNodes.forEach(node => {
        let replaced = node.textContent;

        replaced = replaced.replace(urlRegex, match => {
          const href = match.startsWith('http') ? match : `https://${match}`;
          return `<a href="${href}" target="_blank">${match}</a>`;
        });

        replaced = replaced.replace(emailRegex, match =>
          `<a href="mailto:${match}">${match}</a>`
        );

        replaced = replaced.replace(phoneRegex, match =>
          `<a href="tel:${match.replace(/\D+/g, '')}">${match}</a>`
        );

        if (replaced !== node.textContent) {
          const span = document.createElement('span');
          span.innerHTML = replaced;
          node.replaceWith(span);
        }
      });
    }

    // === 2. OCR all images and overlay detected text ===
    async function overlayOCRTextOnImages() {
      const images = document.querySelectorAll('img');
      for (const img of images) {
        try {
          const result = await Tesseract.recognize(img.src, 'eng');
          const overlay = document.createElement('div');
          overlay.textContent = result.data.text.trim();
          if (!overlay.textContent) continue;

          Object.assign(overlay.style, {
            position: 'absolute',
            top: img.offsetTop + 'px',
            left: img.offsetLeft + 'px',
            width: img.width + 'px',
            height: img.height + 'px',
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            color: 'white',
            fontSize: '12px',
            overflow: 'auto',
            zIndex: 9999,
            pointerEvents: 'none',
            padding: '4px',
            whiteSpace: 'pre-wrap'
          });

          img.parentNode.style.position = 'relative';
          img.parentNode.appendChild(overlay);
        } catch (err) {
          console.warn('[OCR] Failed on image:', img.src, err);
        }
      }
    }

    hyperlinkTextNodes(document.body);
    overlayOCRTextOnImages();
  });
})();
