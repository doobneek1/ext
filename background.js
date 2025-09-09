function maybeRedirect(details) {
  chrome.storage.local.get("redirectEnabled", (data) => {
    const redirectEnabled = data.redirectEnabled;
    const url = details.url;
    const match = url.match(/^https:\/\/gogetta\.nyc\/team\/location\/([a-f0-9-]+)\/recap$/);
    if (match) {
      let newUrl;
      if (redirectEnabled) {
        newUrl = `https://gogetta.nyc/team/location/${match[1]}/services/recap`;
        console.log(`[Redirect] Redirecting to: ${newUrl}`);
      } else {
        newUrl = `https://gogetta.nyc/team/location/${match[1]}`;
        console.log(`[Redirect] Redirecting to: ${newUrl}`);
      }
      chrome.tabs.update(details.tabId, { url: newUrl });
    }
  });
}


chrome.webNavigation.onBeforeNavigate.addListener(maybeRedirect, {
  url: [{ hostEquals: "gogetta.nyc", pathPrefix: "/team/location/" }]
});
chrome.webNavigation.onHistoryStateUpdated.addListener(maybeRedirect, {
  url: [{ hostEquals: "gogetta.nyc", pathPrefix: "/team/location/" }]
});
// chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
//   if (msg.type === 'fetchFindHtml') {
//     const url = `https://gogetta.nyc/find/location/${msg.uuid}`;
//     fetch(url, { credentials: 'include' })
//       .then(res => res.text())
//       .then(html => sendResponse({ success: true, html }))
//       .catch(err => {
//         console.error('[Background] Fetch Find failed:', err);
//         sendResponse({ success: false });
//       });
//     return true;
//   }
//   if (msg.type === 'fetchYourPeerSearch') {
//     const name = encodeURIComponent(msg.name);
//     const page = msg.page || 1;
//     const url = `https://yourpeer.nyc/locations?search=${name}${page > 1 ? `&page=${page}` : ''}`;
//     fetch(url)
//       .then(res => res.text())
//       .then(html => sendResponse({ success: true, html }))
//       .catch(err => {
//         console.error('[Background] YP fetch failed:', err);
//         sendResponse({ success: false, error: err.toString() });
//       });
//     return true;
//   }
//   if (msg.type === 'verifyYourPeerUrl') {
//     fetch(msg.url, { credentials: 'include' })
//       .then(res => res.text())
//       .then(html => {
//         const isValid = !html.includes('Oops!') && !html.includes("We can’t seem to find");
//         sendResponse({ success: true, valid: isValid });
//       })
//       .catch(err => {
//         console.error('[Background] YP verify failed:', err);
//         sendResponse({ success: false, error: err.toString() });
//       });
//     return true;
//   }
// });

// chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
//   if (request.type === "setBadge") {
//     const text = request.count > 0 ? String(request.count) : "";
//     chrome.action.setBadgeText({ text });
//     chrome.action.setBadgeBackgroundColor({ color: "#f44336" });
//   }
// });
// chrome.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
//   if (message.type === 'getAddressSuggestions') {
//     const input = message.input;
//     const API_KEY = 'AIzaSyDZ56RnPItToFUoQugwXWO_3sLIcSX5508';

//     const url = `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(input)}&types=address&location=40.7128,-74.0060&radius=30000&key=${API_KEY}`;

//     try {
//       const res = await fetch(url);
//       const data = await res.json();
//       console.log('[YP] ✅ Responding with:', data.predictions);
//       sendResponse({ predictions: data.predictions || [] });
//     } catch (err) {
//       console.warn('[YP] ❌ Fetch error:', err);
//       sendResponse({ predictions: [] });
//     }

//     return true; // ✅ THIS LINE IS CRITICAL
//   }
// });


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

  if (msg.type === 'setBadge') {
    const text = msg.count > 0 ? String(msg.count) : "";
    chrome.action.setBadgeText({ text });
    chrome.action.setBadgeBackgroundColor({ color: "#f44336" });
    // No async, so no need for return true
  }

if (msg.type === 'getAddressSuggestions') {
  const input = encodeURIComponent(msg.input);
  const proxyUrl = `https://placesproxy-iygwucy2fa-uc.a.run.app?input=${input}`;

  fetch(proxyUrl)
    .then(res => res.json())
    .then(data => {
      console.log('[YP] ✅ Responding with:', data.predictions);
      sendResponse({ predictions: data.predictions || [] });
    })
    .catch(err => {
      console.warn('[YP] ❌ Proxy fetch error:', err);
      sendResponse({ predictions: [] });
    });

  return true;
}

if (msg.type === 'showStreetView') {
    const uuid = msg.uuid;
    const apiUrl = `https://w6pkliozjh.execute-api.us-east-1.amazonaws.com/prod/locations/${uuid}`;
    
    fetch(apiUrl)
      .then(res => {
        if (!res.ok) throw new Error('Failed to fetch location data');
        return res.json();
      })
      .then(data => {
        chrome.scripting.executeScript({
          target: { tabId: sender.tab.id },
          files: ['streetview.js'],
          world: 'MAIN'
        }, () => {
          chrome.scripting.executeScript({
            target: { tabId: sender.tab.id },
            function: (locationData, apiKey) => {
              createStreetViewPicker(locationData, apiKey);
            },
            args: [data, 'AIzaSyBFIrEjge5TMx-Zz-GAFhwFnrmkECLd28k'],
            world: 'MAIN'
          });
        });
      })
      .catch(err => {
        console.error('[Background] Street View fetch failed:', err);
      });
    return true;
  }

if (msg.type === 'getPlaceDetails') {
  const placeId = encodeURIComponent(msg.placeId);
  const proxyUrl = `https://placesproxy-iygwucy2fa-uc.a.run.app?placeId=${placeId}`;

  fetch(proxyUrl)
    .then(res => res.json())
    .then(data => {
      const location = data.result?.geometry?.location;
      if (location) {
        sendResponse({ success: true, location });
      } else {
        sendResponse({ success: false, error: 'No location found' });
      }
    })
    .catch(err => {
      console.error('[Background] Place details fetch failed:', err);
      sendResponse({ success: false, error: err.toString() });
    });

  return true;
}


  // Fallback — prevent "port closed" errors if no handler matched
  return false;
});
