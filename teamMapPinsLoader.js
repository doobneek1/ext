(() => {
  const HOST_RE = /(^|\.)gogetta\.nyc$/i;
  if (!HOST_RE.test(location.hostname)) return;
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

  injectScriptOnce('data-gghost-service-api-monitor', 'serviceApiMonitor.js');
  injectScriptOnce('data-gghost-team-map-pins', 'teamMapPinsPage.js', 'gghostTeamMapPinsInjected');
})();
