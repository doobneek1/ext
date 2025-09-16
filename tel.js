(() => {
  if (window.top !== window.self) return; // 🚫 don’t run inside iframes at all

  const EMBED_WRAPPER_ID = "yp-embed-wrapper";

  function redirectTelLinksToGoogleVoice() {
    if (location.hostname.includes("voice.google.com")) return;
    document.querySelectorAll('a[href^="tel:"]').forEach(link => {
      if (link.closest(`#${EMBED_WRAPPER_ID}`)) return; // 🚫 skip inside embed

      const tel = link.getAttribute('href').replace(/^tel:/, ''); // Remove tel: prefix safely
      const [mainPart, extension] = tel.split(/[,;]/);
      let digits = mainPart.replace(/\D/g, '').slice(-10);
      if (digits.length !== 10) return;
      const ext = extension?.replace(/\D/g, '');
      const extSuffix = ext ? `,${ext}` : '';
      const voiceUrl = `https://voice.google.com/u/0/calls?a=nc,%2B1${digits}${extSuffix}`;
      link.href = voiceUrl;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
    });
  }

  function redirectMailtoLinksToGmail() {
    if (location.hostname.includes("mail.google.com")) return;
    document.querySelectorAll('a[href^="mailto:"]').forEach(link => {
      if (link.closest(`#${EMBED_WRAPPER_ID}`)) return; // 🚫 skip inside embed

      const email = link.getAttribute('href').replace(/^mailto:/, '').trim();
      if (!email || !email.includes('@')) return;
      const gmailUrl = `https://mail.google.com/mail/?view=cm&to=${encodeURIComponent(email)}`;
      link.href = gmailUrl;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
    });
  }

  function redirectAllLinks() {
    redirectTelLinksToGoogleVoice();
    redirectMailtoLinksToGmail();
  }

  // Run once now
  redirectAllLinks();

  // Watch DOM changes, but ignore mutations inside the embed wrapper
  const observer = new MutationObserver(muts => {
    if (muts.some(m => m.target.closest && m.target.closest(`#${EMBED_WRAPPER_ID}`))) {
      return; // skip changes that only happen inside embed
    }
    redirectAllLinks();
  });
  observer.observe(document.body, { childList: true, subtree: true });
})();