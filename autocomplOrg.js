async function loadOrgList() {
  const res = await fetch(chrome.runtime.getURL('org_names.txt'));
  const text = await res.text();
  return text.split('\n').map(line => line.trim()).filter(Boolean);
}

(function () {
  async function waitForInput(selector, timeout = 3000) {
    return new Promise((resolve, reject) => {
      const interval = 100;
      let waited = 0;
      const timer = setInterval(() => {
        const input = document.querySelector(selector);
        if (input) {
          clearInterval(timer);
          resolve(input);
        } else if ((waited += interval) >= timeout) {
          clearInterval(timer);
          reject(new Error('Input not found'));
        }
      }, interval);
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
      const input = await waitForInput('input.Input.Input-fluid');

      input.addEventListener('input', (e) => {
        const value = e.target.value.toLowerCase();
        document.querySelectorAll('.org-suggest-box').forEach(b => b.remove());
        if (!value) return;

        const matched = orgList.filter(org => org.toLowerCase().includes(value)).slice(0, 10);
        if (matched.length > 0) {
          createSuggestionBox(input, matched);
        }
      });

      input.addEventListener('blur', () => {
        setTimeout(() => {
          document.querySelectorAll('.org-suggest-box').forEach(b => b.remove());
        }, 200);
      });

    } catch (err) {
      console.warn('[Org Autocomplete] Error:', err);
    }
  }

  function monitorOrgPageRoute() {
    let lastPath = location.pathname;

    const observer = new MutationObserver(() => {
      const newPath = location.pathname;
      if (newPath !== lastPath) {
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
