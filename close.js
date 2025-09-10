
// (async function monitorCloseButtonOnLocationPage() {
//   function addRedirectOnCloseButton() {
//     const closeButton = document.querySelector('button.default.font-weight-light');
//     if (closeButton) {
//       closeButton.addEventListener('click', () => {
//         window.location.href = 'https://gogetta.nyc/team';
//       });
//     }
//   }
// function refreshBttn() {
//   setTimeout(() => {
//     const buttons = document.querySelectorAll('button.Button-primary');
//     buttons.forEach(btn => {
//       if (btn.textContent.trim() === 'OK') {
//         btn.addEventListener('click', () => {
//           setTimeout(() => {
//             window.location.reload();
//           }, 3000); // 2 second delay before reloading
//         });
//       }
//     });
//   }, 300);
// }



//   function isLocationPage() {
//     return /\/location$/.test(location.pathname);
//   }

//   let lastPath = location.pathname;

//   const observer = new MutationObserver(() => {
//     const newPath = location.pathname;
//     if (newPath !== lastPath) {
//       lastPath = newPath;
//       if (isLocationPage()) {
//         setTimeout(addRedirectOnCloseButton, 300); // slight delay to allow DOM update
//             setTimeout(refreshBttn, 300);

//       }
//     }
//   });

//   observer.observe(document.body, { childList: true, subtree: true });

//   // Run once initially
//   if (isLocationPage()) {
//     setTimeout(addRedirectOnCloseButton, 300);
//     setTimeout(refreshBttn, 300);
//   }
// })();

(async function monitorCloseButtonOnLocationPage() {
  function addRedirectOnCloseButton() {
    const closeButton = document.querySelector('button.default.font-weight-light');
    if (closeButton) {
      closeButton.addEventListener('click', () => {
        window.location.href = 'https://gogetta.nyc/team';
      });
    }
  }

  // Matches /location/{uuid} (UUID is assumed to be a standard format)
  function isUuidLocationPage() {
    return /\/location\/[a-f0-9-]{36}$/.test(location.pathname);
  }

  function waitForLocationChange(matchingFn, callback, timeout = 3000) {
    const startPath = location.pathname;
    const interval = setInterval(() => {
      if (location.pathname !== startPath && matchingFn()) {
        clearInterval(interval);
        callback();
      }
    }, 100);

    setTimeout(() => clearInterval(interval), timeout);
  }

  function attachOkButtonListener() {
    const buttons = document.querySelectorAll('button.Button-primary');
    buttons.forEach(btn => {
      if (btn.textContent.trim().toUpperCase() === 'OK') {
        btn.addEventListener('click', () => {
          waitForLocationChange(isUuidLocationPage, () => {
            setTimeout(() => {
              window.location.reload();
            }, 3000);
          });
        }, { once: true });
      }
    });
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
        setTimeout(addRedirectOnCloseButton, 300);
        setTimeout(attachOkButtonListener, 300);
      }
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });

  // Initial run
  if (isLocationPage()) {
    setTimeout(addRedirectOnCloseButton, 300);
    setTimeout(attachOkButtonListener, 300);
  }
})();
