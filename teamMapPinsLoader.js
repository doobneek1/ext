(() => {
  const HOST_RE = /(^|\.)gogetta\.nyc$/i;
  if (!HOST_RE.test(location.hostname)) return;
  const path = location.pathname || "/";
  if (path !== "/team" && path !== "/team/") return;
  if (!chrome?.runtime?.getURL) return;
  const injectScriptOnce = (attr, filename, onloadTag) => {
    if (document.querySelector(`script[${attr}]`)) return;
    const script = document.createElement('script');
    script.async = true;
    script.setAttribute(attr, 'true');
    script.src = chrome.runtime.getURL(filename);
    script.onload = () => {
      if (onloadTag) {
        document.documentElement.dataset[onloadTag] = 'true';
      }
      script.remove();
    };
    script.onerror = () => {
      script.remove();
    };
    (document.head || document.documentElement).appendChild(script);
  };
  const deferInject = (fn) => {
    if (document.readyState === "complete") {
      if (window.requestIdleCallback) {
        window.requestIdleCallback(fn, { timeout: 3000 });
      } else {
        setTimeout(fn, 1000);
      }
      return;
    }
    window.addEventListener(
      "load",
      () => {
        if (window.requestIdleCallback) {
          window.requestIdleCallback(fn, { timeout: 3000 });
        } else {
          setTimeout(fn, 1000);
        }
      },
      { once: true }
    );
  };
  deferInject(() => injectScriptOnce('data-gghost-service-api-monitor', 'serviceApiMonitor.js'));
  deferInject(() => injectScriptOnce('data-gghost-team-map-pins', 'teamMapPinsPage.js', 'gghostTeamMapPinsInjected'));
})();
