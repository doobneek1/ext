(() => {
  function redirectTelLinksToGoogleVoice() {
    document.querySelectorAll('a[href^="tel:"]').forEach(link => {
      const tel = link.getAttribute('href').replace('tel:', '');
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
    document.querySelectorAll('a[href^="mailto:"]').forEach(link => {
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

  redirectAllLinks();
  const observer = new MutationObserver(redirectAllLinks);
  observer.observe(document.body, { childList: true, subtree: true });
})();
