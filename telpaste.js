(function sanitizePhonePasteAndTriggerButton() {
  function extractTenDigitNumber(input) {
    const digits = input.replace(/\D/g, '');
    const result = digits.length >= 10 ? digits.slice(-10) : '';
    console.log('Sanitized:', result);
    return result;
  }
  function onPasteSanitize(event) {
    const input = event.target;
    if (!input.matches('input[type="tel"]')) return;
    event.preventDefault();
    const pastedData = (event.clipboardData || window.clipboardData).getData('text');
    console.log('Pasted:', pastedData);
    const sanitized = extractTenDigitNumber(pastedData);
    if (!sanitized) return;
    input.value = sanitized;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    console.log('Value inserted:', sanitized);
  }
  function onRightClickPaste(event) {
    const input = event.target;
    if (!input.matches('input[type="tel"]')) return;
    navigator.clipboard.readText().then((text) => {
      const sanitized = extractTenDigitNumber(text);
      if (!sanitized) return;
      input.value = sanitized;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      console.log('Right-click pasted and inserted:', sanitized);
    }).catch((err) => {
      console.error('Clipboard read failed:', err);
    });
  }
function onEnterPress(event) {
  const input = event.target;
  if (!input.matches('input[type="tel"]')) return;
  if (event.key === 'Enter') {
    const button = document.querySelector('input[type="submit"].Button-primary');
    if (button) {
      button.click();
      console.log('Submit button clicked on Enter');
    } else {
      console.warn('Submit button not found');
    }
  }
}
  function attachToInput(input) {
    if (!input.dataset.sanitizeAttached) {
      input.addEventListener('paste', onPasteSanitize);
      input.addEventListener('contextmenu', onRightClickPaste);
      input.addEventListener('keydown', onEnterPress);
      input.dataset.sanitizeAttached = 'true';
      console.log('Attached handlers to', input);
    }
  }
  function checkAndAttachInputs() {
    const inputs = document.querySelectorAll('input[type="tel"]');
    inputs.forEach(attachToInput);
    if (inputs.length) console.log('Found tel inputs:', inputs.length);
  }
  const targetRoutePattern = /\/questions\/phone-number$/;
  let lastUrl = location.href;
  setInterval(() => {
    const currentUrl = location.href;
    if (currentUrl !== lastUrl) {
      lastUrl = currentUrl;
      console.log('URL changed:', currentUrl);
    }
    if (targetRoutePattern.test(currentUrl)) {
      checkAndAttachInputs();
    }
  }, 500);
  const observer = new MutationObserver(checkAndAttachInputs);
  observer.observe(document.body, { childList: true, subtree: true });
  checkAndAttachInputs();
})();
