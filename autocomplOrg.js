async function loadOrgList() {
  if (!chrome?.runtime?.getURL) return [];
  try {
    const res = await fetch(chrome.runtime.getURL('org_names.txt'));
    if (!res.ok) {
      console.warn('[Org Autocomplete] Org list fetch failed:', res.status);
      return [];
    }
    const text = await res.text();
    return text.split('\n').map(line => line.trim()).filter(Boolean);
  } catch (err) {
    console.warn('[Org Autocomplete] Org list fetch failed:', err);
    return [];
  }
}
(function () {
  function waitForInput(selector, timeout = 8000) {
    return new Promise((resolve) => {
      const existing = document.querySelector(selector);
      if (existing) return resolve(existing);
      let settled = false;
      const observer = new MutationObserver(() => {
        const input = document.querySelector(selector);
        if (!input || settled) return;
        settled = true;
        observer.disconnect();
        clearTimeout(timer);
        resolve(input);
      });
      observer.observe(document.body, { childList: true, subtree: true });
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        observer.disconnect();
        resolve(null);
      }, timeout);
    });
  }
  function createSuggestionBox(inputEl, suggestions) {
    document.querySelectorAll('.org-suggest-box').forEach(b => b.remove());
    const box = document.createElement('div');
    box.classList.add('org-suggest-box');
    Object.assign(box.style, {
      position: 'absolute',
      border: '1px solid #ccc',
      background: '#fff',
      zIndex: 10000,
      width: inputEl.offsetWidth + 'px',
      maxHeight: '150px',
      overflowY: 'auto',
      fontSize: '14px',
      cursor: 'pointer',
      boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
      marginTop: '2px'
    });
    suggestions.forEach(org => {
      const item = document.createElement('div');
      item.textContent = org;
      item.style.padding = '4px 8px';
      item.addEventListener('click', () => {
        inputEl.value = org;
        inputEl.dispatchEvent(new Event('input', { bubbles: true }));
        box.remove();
      });
      box.appendChild(item);
    });
    const rect = inputEl.getBoundingClientRect();
    box.style.left = rect.left + window.scrollX + 'px';
    box.style.top = rect.bottom + window.scrollY + 'px';
    document.body.appendChild(box);
  }
  async function setupOrgAutocomplete() {
    try {
      const orgList = await loadOrgList();
      if (!orgList.length) return;
      const input = await waitForInput('input.Input.Input-fluid');
      if (!input) return;
      input.addEventListener('input', (e) => {
        const value = e.target.value.toLowerCase();
        cleanupOrgAutocomplete();
        if (!value) return;
        const matched = orgList.filter(org => org.toLowerCase().includes(value)).slice(0, 10);
        if (matched.length > 0) {
          createSuggestionBox(input, matched);
        }
      });
      input.addEventListener('blur', () => {
        setTimeout(() => {
          cleanupOrgAutocomplete();
        }, 200);
      });
      // Also cleanup on window blur (when switching tabs/apps) and beforeunload
      window.addEventListener('blur', cleanupOrgAutocomplete);
      window.addEventListener('beforeunload', cleanupOrgAutocomplete);
    } catch (err) {
      console.warn('[Org Autocomplete] Error:', err);
    }
  }
  function cleanupOrgAutocomplete() {
    document.querySelectorAll('.org-suggest-box').forEach(b => b.remove());
  }
  function monitorOrgPageRoute() {
    let lastPath = location.pathname;
    const observer = new MutationObserver(() => {
      const newPath = location.pathname;
      if (newPath !== lastPath) {
        cleanupOrgAutocomplete();
        lastPath = newPath;
        if (/\/questions\/organization-name$/.test(newPath)|| /\/location$/.test(newPath)) {
          setupOrgAutocomplete();
        }
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    // Run once initially
    if (/\/questions\/organization-name$/.test(location.pathname)) {
      setupOrgAutocomplete();
    }
  }
  monitorOrgPageRoute();
})();
