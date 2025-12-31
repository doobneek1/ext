(() => {
  const HOST_RE = /(^|\.)gogetta\.nyc$/i;
  if (!HOST_RE.test(location.hostname)) return;
  if (!chrome?.runtime?.getURL) return;

  const SCRIPT_ATTR = 'data-gghost-team-map-pins';
  if (document.querySelector(`script[${SCRIPT_ATTR}]`)) return;

  const script = document.createElement('script');
  script.async = true;
  script.setAttribute(SCRIPT_ATTR, 'true');
  script.src = chrome.runtime.getURL('teamMapPinsPage.js');
  script.onload = () => {
    document.documentElement.dataset.gghostTeamMapPinsInjected = 'true';
    script.remove();
  };
  script.onerror = () => {
    script.remove();
  };
  (document.head || document.documentElement).appendChild(script);
})();
