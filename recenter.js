(function () {
  const BUTTON_ID = 'yp-feedback-test-btn';

  function normalizeUrl(url) {
    return url.replace(/\/$/, ''); // remove trailing slash
  }

  function isTargetPage(url) {
    return normalizeUrl(url) === 'https://gogetta.nyc/team';
  }

  function checkAndInjectButton() {
    const currentUrl = window.location.href;
    if (!isTargetPage(currentUrl)) return;
    if (document.getElementById(BUTTON_ID)) return;

    
    const button = document.createElement('button');
    button.id = BUTTON_ID;
    button.textContent = 'Re-center';

    Object.assign(button.style, {
      position: 'fixed',
      bottom: '20px',
      right: '20px',
      zIndex: 9999,
      padding: '10px 14px',
      backgroundColor: '#0066cc',
      color: '#fff',
      border: 'none',
      borderRadius: '5px',
      cursor: 'pointer',
      boxShadow: '0 2px 6px rgba(0,0,0,0.3)'
    });

    button.addEventListener('click', () => {
      
      try {
        const input = document.querySelector('input.form-control[placeholder*="organization name"]');
        if (!input) {
                    return;
        }

        input.focus();
        input.value = 'TEST FOR FEEDBACK';
        input.dispatchEvent(new Event('input', { bubbles: true }));

        const maxWaitTime = 3000;
        const interval = 100;
        let waited = 0;

        const checkDropdown = setInterval(() => {
          const item = Array.from(document.querySelectorAll('li.Dropdown-item.list-group-item'))
            .find(el => el.textContent.trim() === 'TEST FOR FEEDBACK');

          if (item) {
            item.click();
                        clearInterval(checkDropdown);

            const checkCloseBtn = setInterval(() => {
              const closeBtn = document.querySelector('button.gm-ui-hover-effect[aria-label="Close"]');
              if (closeBtn && closeBtn.offsetParent !== null) {
                closeBtn.click();
                                clearInterval(checkCloseBtn);
              }
            }, 100);

          } else if (waited >= maxWaitTime) {
                        clearInterval(checkDropdown);
          } else {
            waited += interval;
          }
        }, interval);

      } catch (err) {
        console.error('[YP] ❌ Error during TEST FOR FEEDBACK trigger:', err);
      }
    });

    document.body.appendChild(button);
  }

  // Run once initially
  checkAndInjectButton();

  // Monitor for URL changes (SPA routing)
  let lastUrl = location.href;
  const observer = new MutationObserver(() => {
    const currentUrl = location.href;
    if (currentUrl !== lastUrl) {
      lastUrl = currentUrl;
      setTimeout(checkAndInjectButton, 100); // Delay for render
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });
})();
