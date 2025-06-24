// function maybeRedirect(details) {
//   const tabId = details.tabId;
//   const url = details.url;
//   const match = url.match(/^https:\/\/gogetta\.nyc\/team\/location\/([a-f0-9-]+)\/recap$/);

//   if (!match) return;

//   // Step 1: Ask the tab if it wants to skip
//   chrome.scripting.executeScript({
//     target: { tabId },
//     func: () => sessionStorage.getItem('ypSkipBackgroundRedirect')
//   }, (results) => {
//     const skip = results?.[0]?.result === 'true';

//     if (skip) {
//       console.log(`[Redirect] 🛑 Skipping redirect due to sessionStorage flag`);
//       return;
//     }

//     // Step 2: Check extension storage
//     chrome.storage.local.get("redirectEnabled", (data) => {
//       const redirectEnabled = data.redirectEnabled;

//       const uuid = match[1];
//       let newUrl;

//       if (redirectEnabled) {
//         newUrl = `https://gogetta.nyc/team/location/${uuid}/services/recap`;
//         console.log(`[Redirect] ✅ redirectEnabled is true, going to: ${newUrl}`);
//       } else {
//         newUrl = `https://gogetta.nyc/team/location/${uuid}`;
//         console.log(`[Redirect] 🔁 redirectEnabled is false, going to: ${newUrl}`);
//       }

//       chrome.tabs.update(tabId, { url: newUrl });
//     });
//   });
// }


function maybeRedirect(details) {
  chrome.storage.local.get("redirectEnabled", (data) => {
    const redirectEnabled = data.redirectEnabled;

    const url = details.url;
    const match = url.match(/^https:\/\/gogetta\.nyc\/team\/location\/([a-f0-9-]+)\/recap$/);

    if (match) {
      let newUrl;
      
      if (redirectEnabled) {
        // Redirect to `/services/recap` if `redirectEnabled` is on
        newUrl = `https://gogetta.nyc/team/location/${match[1]}/services/recap`;
        console.log(`[Redirect] Redirecting to: ${newUrl}`);
      } else {
        // Otherwise, remove `/recap` and go to `/location/{id}`
        newUrl = `https://gogetta.nyc/team/location/${match[1]}`;
        console.log(`[Redirect] Redirecting to: ${newUrl}`);
      }
      
      chrome.tabs.update(details.tabId, { url: newUrl });
    }
  });
}

// Listen for navigation to URLs like https://gogetta.nyc/team/location/{id}/recap
chrome.webNavigation.onBeforeNavigate.addListener(maybeRedirect, {
  url: [{ hostEquals: "gogetta.nyc", pathPrefix: "/team/location/" }]
});

// Listen for state updates in the URL and apply the same logic
chrome.webNavigation.onHistoryStateUpdated.addListener(maybeRedirect, {
  url: [{ hostEquals: "gogetta.nyc", pathPrefix: "/team/location/" }]
});
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'fetchFindHtml') {
    const url = `https://gogetta.nyc/find/location/${msg.uuid}`;
    fetch(url, { credentials: 'include' })
      .then(res => res.text())
      .then(html => sendResponse({ success: true, html }))
      .catch(err => {
        console.error('[Background] Fetch Find failed:', err);
        sendResponse({ success: false });
      });
    return true;
  }

  if (msg.type === 'fetchYourPeerSearch') {
    const name = encodeURIComponent(msg.name);
    const page = msg.page || 1;
    const url = `https://yourpeer.nyc/locations?search=${name}${page > 1 ? `&page=${page}` : ''}`;

    fetch(url)
      .then(res => res.text())
      .then(html => sendResponse({ success: true, html }))
      .catch(err => {
        console.error('[Background] YP fetch failed:', err);
        sendResponse({ success: false, error: err.toString() });
      });

    return true;
  }

  if (msg.type === 'verifyYourPeerUrl') {
    fetch(msg.url, { credentials: 'include' })
      .then(res => res.text())
      .then(html => {
        const isValid = !html.includes('Oops!') && !html.includes("We can’t seem to find");
        sendResponse({ success: true, valid: isValid });
      })
      .catch(err => {
        console.error('[Background] YP verify failed:', err);
        sendResponse({ success: false, error: err.toString() });
      });

    return true;
  }
});
