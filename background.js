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
  url: [
    { hostEquals: "gogetta.nyc", pathPrefix: "/team/location/" },
    { hostEquals: "gogetta.nyc", pathPrefix: "/team/location/" }
  ]
});
chrome.webNavigation.onHistoryStateUpdated.addListener(maybeRedirect, {
  url: [
    { hostEquals: "gogetta.nyc", pathPrefix: "/team/location/" },
    { hostEquals: "gogetta.nyc", pathPrefix: "/team/location/" }
  ]
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

const STREETVIEW_CACHE_MS = 60 * 1000;
const streetViewCache = new Map();
const streetViewInFlight = new Map();

function fetchStreetViewLocation(uuid) {
  if (!uuid) {
    return Promise.reject(new Error("Missing UUID for street view fetch"));
  }

  const now = Date.now();
  const cached = streetViewCache.get(uuid);
  if (cached && now - cached.timestamp < STREETVIEW_CACHE_MS) {
    return Promise.resolve(cached.data);
  }

  const inFlight = streetViewInFlight.get(uuid);
  if (inFlight) {
    return inFlight;
  }

  const apiUrl = `https://w6pkliozjh.execute-api.us-east-1.amazonaws.com/prod/locations/${uuid}`;
  const request = fetch(apiUrl)
    .then(res => {
      if (!res.ok) throw new Error('Failed to fetch location data');
      return res.json();
    })
    .then(data => {
      streetViewCache.set(uuid, { data, timestamp: Date.now() });
      return data;
    })
    .finally(() => {
      streetViewInFlight.delete(uuid);
    });

  streetViewInFlight.set(uuid, request);
  return request;
}

function decodeBasicEntities(text) {
  return text
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

function extractTextFromHtml(html) {
  if (typeof DOMParser !== 'undefined') {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    doc.querySelectorAll('script, style, noscript').forEach(el => el.remove());
    return (doc.body ? doc.body.textContent : doc.textContent || '');
  }
  const withoutScripts = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ');
  const withoutTags = withoutScripts.replace(/<\/?[^>]+>/g, ' ');
  return decodeBasicEntities(withoutTags);
}


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
    console.log('[Background] Fetching Street View data for UUID:', uuid);

    fetchStreetViewLocation(uuid)
      .then(data => {
        console.log('[Background] Location data fetched, injecting Street View script');

        // Inject script with error handling
        chrome.scripting.executeScript({
          target: { tabId: sender.tab.id },
          files: ['streetview.js'],
          world: 'MAIN'
        }).then(() => {
          // Wait a bit for script to load before executing function
          setTimeout(() => {
            chrome.scripting.executeScript({
              target: { tabId: sender.tab.id },
              function: (locationData, apiKey) => {
                if (typeof createStreetViewPicker === 'function') {
                  createStreetViewPicker(locationData, apiKey);
                } else {
                  console.error('createStreetViewPicker function not found');
                }
              },
              args: [data, 'AIzaSyBFIrEjge5TMx-Zz-GAFhwFnrmkECLd28k'],
              world: 'MAIN'
            }).catch(err => {
              console.error('[Background] Street View function execution failed:', err);
            });
          }, 100);
        }).catch(err => {
          console.error('[Background] Street View script injection failed:', err);
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

  // Check URL status for link validator using Cloud Function
  if (msg.type === 'CHECK_URL_STATUS') {
    const url = msg.url;
    console.log('[LinkValidator] Checking URL via Cloud Function:', url);

    // Note: Cloud Run URLs are case-sensitive, use exact URL from deployment
    const CLOUD_FUNCTION_URL = 'https://checkwebsitestatus-iygwucy2fa-uc.a.run.app';

    // Retry logic with progressive timeouts
    const attemptCheck = async (retryCount = 0, timeout = 10000) => {
      const maxRetries = 2;

      try {
        console.log(`[LinkValidator] Attempt ${retryCount + 1}/${maxRetries + 1} with ${timeout}ms timeout for:`, url);

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        const res = await fetch(CLOUD_FUNCTION_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ url, timeout }),
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        // Check if response is JSON
        const contentType = res.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
          const text = await res.text();
          console.error('[LinkValidator] Cloud Function returned non-JSON response:', text.substring(0, 200));
          throw new Error('Cloud Function returned HTML instead of JSON.');
        }

        const data = await res.json();
        console.log('[LinkValidator] URL check result:', data);

        sendResponse({
          status: data.ok ? 'valid' : 'broken',
          isHttps: data.isHttps,
          workingUrl: data.url || url,
          httpStatus: data.status
        });
      } catch (err) {
        console.warn(`[LinkValidator] Attempt ${retryCount + 1} failed:`, err.message);

        // Retry with longer timeout if we haven't exceeded max retries
        if (retryCount < maxRetries) {
          const nextTimeout = timeout + 5000; // Add 5 seconds for each retry
          console.log(`[LinkValidator] Retrying with ${nextTimeout}ms timeout...`);
          await attemptCheck(retryCount + 1, nextTimeout);
        } else {
          console.error('[LinkValidator] All retry attempts failed for:', url);
          sendResponse({ status: 'unknown', isHttps: false, workingUrl: url });
        }
      }
    };

    attemptCheck();
    return true;
  }

  // Proxy website for link validator preview
  if (msg.type === 'PROXY_WEBSITE') {
    const url = msg.url;
    console.log('[LinkValidator] Proxying website:', url);

    // Note: Cloud Run URLs are case-sensitive, use exact URL from deployment
    const PROXY_URL = 'https://proxywebsite-iygwucy2fa-uc.a.run.app';
    const proxyUrl = `${PROXY_URL}?url=${encodeURIComponent(url)}`;

    fetch(proxyUrl)
      .then(async res => {
        if (!res.ok) {
          const text = await res.text();
          console.error('[LinkValidator] Proxy endpoint error:', res.status, text.substring(0, 200));
          throw new Error(`Proxy returned ${res.status}`);
        }

        // Check content type
        const contentType = res.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
          // Error response in JSON format
          const json = await res.json();
          throw new Error(json.error || 'Proxy failed');
        }

        return res.text();
      })
      .then(html => {
        console.log('[LinkValidator] Website proxied successfully');
        sendResponse({ success: true, html });
      })
      .catch(err => {
        console.error('[LinkValidator] Proxy failed:', err);
        sendResponse({ success: false, error: err.toString() });
      });

    return true;
  }


  // AI-powered page content analysis for link validator
  if (msg.type === 'ANALYZE_PAGE_CONTENT') {
    const url = msg.url;
    console.log('[LinkValidator] Analyzing page content with AI:', url);

    fetch(url)
      .then(res => res.text())
      .then(html => {
        const text = extractTextFromHtml(html).toLowerCase();

        // AI-powered analysis using pattern matching
        const analysis = analyzePageText(text, url);

        console.log('[LinkValidator] AI Analysis result:', analysis);
        sendResponse({ success: true, analysis });
      })
      .catch(err => {
        console.error('[LinkValidator] Page analysis failed:', err);
        sendResponse({ success: false, analysis: null });
      });

    return true;
  }

  // Fallback — prevent "port closed" errors if no handler matched
  return false;
});

/**
 * Analyzes page text content to detect if page is invalid/closed
 * Uses pattern matching to identify common phrases
 */
function analyzePageText(text, url) {
  const patterns = {
    closed: [
      /form (is|has been)?\s*(no longer|closed|not)\s*(accepting|available)/i,
      /no longer accepting (responses|applications|submissions)/i,
      /this (form|page|survey) (is|has been)?\s*(closed|disabled|deactivated)/i,
      /applications? (are|is)?\s*(closed|not being accepted)/i,
      /(registration|enrollment|signup)\s*(has|is)?\s*(closed|ended)/i,
      /deadline has passed/i,
      /submissions? (are|is)?\s*closed/i
    ],
    invalid: [
      /page (not found|cannot be found|does not exist)/i,
      /404\s*error/i,
      /(content|page|resource)\s*(was|has been)?\s*(removed|deleted)/i,
      /this page (is|has been)?\s*discontinued/i,
      /link (is|has)?\s*(expired|invalid|broken)/i,
      /(access|permission)\s*denied/i,
      /unauthorized/i
    ],
    unavailable: [
      /temporarily unavailable/i,
      /under maintenance/i,
      /service unavailable/i,
      /site (is|has been)?\s*down/i
    ]
  };

  let matchedType = null;
  let matchedPattern = null;

  // Check for closed forms/pages
  for (const pattern of patterns.closed) {
    if (pattern.test(text)) {
      matchedType = 'closed';
      matchedPattern = pattern.source;
      break;
    }
  }

  // Check for invalid/removed pages
  if (!matchedType) {
    for (const pattern of patterns.invalid) {
      if (pattern.test(text)) {
        matchedType = 'invalid';
        matchedPattern = pattern.source;
        break;
      }
    }
  }

  // Check for temporarily unavailable
  if (!matchedType) {
    for (const pattern of patterns.unavailable) {
      if (pattern.test(text)) {
        matchedType = 'unavailable';
        matchedPattern = pattern.source;
        break;
      }
    }
  }

  if (matchedType) {
    let reason = '';
    let isClosed = false;
    let isInvalid = false;

    if (matchedType === 'closed') {
      reason = 'Form/page is no longer accepting responses';
      isClosed = true;
    } else if (matchedType === 'invalid') {
      reason = 'Page not found or has been removed';
      isInvalid = true;
    } else if (matchedType === 'unavailable') {
      reason = 'Page is temporarily unavailable';
      isInvalid = true;
    }

    return {
      isClosed,
      isInvalid,
      reason,
      confidence: 'high',
      summary: `Detected pattern: ${matchedPattern.substring(0, 50)}...`
    };
  }

  // No problematic patterns found
  return {
    isClosed: false,
    isInvalid: false,
    reason: null,
    confidence: 'medium',
    summary: 'Page appears to be active and accessible'
  };
}
