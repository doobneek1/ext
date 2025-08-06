
(async function monitorCloseButtonOnLocationPage() {
  function addRedirectOnCloseButton() {
    const closeButton = document.querySelector('button.default.font-weight-light');
    if (closeButton) {
      closeButton.addEventListener('click', () => {
        window.location.href = 'https://gogetta.nyc/team';
      });
    }
  }
function refreshBttn() {
  setTimeout(() => {
    const buttons = document.querySelectorAll('button.Button-primary');
    buttons.forEach(btn => {
      if (btn.textContent.trim() === 'OK') {
        btn.addEventListener('click', () => {
          setTimeout(() => {
            window.location.reload();
          }, 1000); // 2 second delay before reloading
        });
      }
    });
  }, 300);
}



  function isLocationPage() {
    return /\/location$/.test(location.pathname);
  }

  let lastPath = location.pathname;

  const observer = new MutationObserver(() => {
    const newPath = location.pathname;
    if (newPath !== lastPath) {
      lastPath = newPath;
      if (isLocationPage()) {
        setTimeout(addRedirectOnCloseButton, 300); // slight delay to allow DOM update
            setTimeout(refreshBttn, 300);

      }
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });

  // Run once initially
  if (isLocationPage()) {
    setTimeout(addRedirectOnCloseButton, 300);
    setTimeout(refreshBttn, 300);
  }
})();
