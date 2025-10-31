/**
 * Link Validator - Checks website URLs in input fields and provides visual feedback
 * Shows red highlight for broken links, green for valid links
 */

(function() {
  'use strict';

  const CONFIG = {
    checkDelay: 1000, // Wait 1s after user stops typing before checking
    cacheExpiry: 5 * 60 * 1000, // Cache results for 5 minutes
    previewWidth: 400,
    previewHeight: 300
  };

  const GOGETTA_WEBSITE_PATH_REGEX = /^\/team\/location\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/questions\/website\/?$/i;

  /**
   * Determines if the current page matches the GoGetta website question URL shape
   */
  function isGoGettaWebsitePage() {
    try {
      const { hostname, pathname } = new URL(window.location.href);
      const normalizedHost = hostname.toLowerCase();
      const isGoGettaHost =
        normalizedHost === 'gogetta.nyc' ||
        normalizedHost === 'www.gogetta.nyc';

      if (!isGoGettaHost) {
        return false;
      }

      return GOGETTA_WEBSITE_PATH_REGEX.test(pathname);
    } catch {
      return false;
    }
  }

  // Cache to avoid redundant checks
  const linkStatusCache = new Map();

  // Track which inputs we've already set up
  let processedInputs = new WeakSet();
  let domObserver = null;
  let validatorActive = false;
  let routeWatcherInitialized = false;
  let lastKnownUrl = window.location.href;
  let locationPoller = null;
  let pendingRouteCheck = null;
  let stylesInjected = false;

  function ensureStylesInjected() {
    if (stylesInjected) return;

    if (document.querySelector('#link-validator-styles')) {
      stylesInjected = true;
      return;
    }

    const style = document.createElement('style');
    style.id = 'link-validator-styles';
    style.textContent = `
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        .link-validator-preview-btn:hover {
          background: #f8f9fa !important;
        }
      `;
    document.head.appendChild(style);
    stylesInjected = true;
  }

  function removeAllValidationUI() {
    document.querySelectorAll('.link-validator-preview-overlay').forEach(el => el.remove());
    document.querySelectorAll('.link-validator-container').forEach(container => {
      const parent = container.parentElement;
      const input = container.querySelector('input, textarea');
      if (parent && input) {
        parent.insertBefore(input, container);
      }
      container.remove();
    });
  }

  function activateValidator() {
    if (validatorActive) return;
    validatorActive = true;

    console.log('[LinkValidator] Activating on', window.location.href);

    // Reset caches so we fetch fresh data for each activation
    linkStatusCache.clear();
    processedInputs = new WeakSet();

    ensureStylesInjected();
    findAndProcessInputs();

    if (!domObserver) {
      domObserver = new MutationObserver(() => {
        if (!isGoGettaWebsitePage()) {
          deactivateValidator();
          return;
        }
        findAndProcessInputs();
      });
    }

    domObserver.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  function deactivateValidator() {
    if (!validatorActive) return;
    validatorActive = false;

    console.log('[LinkValidator] Deactivating on', window.location.href);

    if (domObserver) {
      domObserver.disconnect();
    }

    removeAllValidationUI();
    processedInputs = new WeakSet();
  }

  function scheduleRouteCheck() {
    if (pendingRouteCheck !== null) return;

    pendingRouteCheck = requestAnimationFrame(() => {
      pendingRouteCheck = null;
      handleRouteChange();
    });
  }

  function handleRouteChange() {
    lastKnownUrl = window.location.href;
    if (isGoGettaWebsitePage()) {
      activateValidator();
    } else {
      deactivateValidator();
    }
  }

  function setupRouteWatcher() {
    if (routeWatcherInitialized) return;
    routeWatcherInitialized = true;

    const wrapHistory = (method) => {
      const original = history[method];
      if (typeof original !== 'function' || original.__linkValidatorPatched) {
        return;
      }

      const wrapped = function(...args) {
        const result = original.apply(this, args);
        scheduleRouteCheck();
        return result;
      };

      Object.defineProperty(wrapped, '__linkValidatorPatched', {
        value: true
      });

      history[method] = wrapped;
    };

    wrapHistory('pushState');
    wrapHistory('replaceState');

    window.addEventListener('popstate', scheduleRouteCheck);
    window.addEventListener('hashchange', scheduleRouteCheck);

    locationPoller = setInterval(() => {
      const currentHref = window.location.href;
      if (currentHref !== lastKnownUrl) {
        lastKnownUrl = currentHref;
        scheduleRouteCheck();
      }
    }, 1000);

    window.addEventListener('beforeunload', () => {
      if (locationPoller) {
        clearInterval(locationPoller);
        locationPoller = null;
      }
    });

    scheduleRouteCheck();
  }

  /**
   * Checks if a string is a valid URL
   */
  function isValidUrl(str) {
    if (!str || typeof str !== 'string') return false;

    // Remove common protocol prefixes if missing
    const urlStr = str.trim();
    if (!/^https?:\/\//i.test(urlStr)) {
      str = 'http://' + urlStr;
    }

    try {
      const url = new URL(str);
      return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
      return false;
    }
  }

  /**
   * Normalizes URL by adding protocol if missing
   */
  function normalizeUrl(url) {
    url = url.trim();
    if (!/^https?:\/\//i.test(url)) {
      return 'http://' + url;
    }
    return url;
  }

  /**
   * Checks if a URL is accessible via background script (avoids CORS)
   */
  async function checkUrlStatus(url) {
    const normalizedUrl = normalizeUrl(url);

    // Check cache first
    const cached = linkStatusCache.get(normalizedUrl);
    if (cached && Date.now() - cached.timestamp < CONFIG.cacheExpiry) {
      return cached;
    }

    try {
      // Use background script to check URL status (avoids CORS issues)
      const result = await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage(
          { type: 'CHECK_URL_STATUS', url: normalizedUrl },
          (response) => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
            } else {
              resolve(response);
            }
          }
        );
      });

      // Cache the result
      linkStatusCache.set(normalizedUrl, {
        ...result,
        timestamp: Date.now()
      });

      return result;
    } catch (error) {
      console.warn('[LinkValidator] Error checking URL:', error);
      return { status: 'unknown', isHttps: false, workingUrl: normalizedUrl };
    }
  }

  /**
   * Creates the validation indicator elements
   */
  function createValidationUI(input) {
    // Create container for the indicator
    const container = document.createElement('div');
    container.className = 'link-validator-container';
    container.style.cssText = `
      position: relative;
      display: inline-block;
      width: 100%;
    `;

    // Create indicator icon
    const indicator = document.createElement('div');
    indicator.className = 'link-validator-indicator';
    indicator.style.cssText = `
      position: absolute;
      right: 8px;
      top: 50%;
      transform: translateY(-50%);
      display: none;
      cursor: pointer;
      z-index: 10;
      font-size: 18px;
      pointer-events: auto;
    `;

    // Create preview button
    const previewBtn = document.createElement('button');
    previewBtn.className = 'link-validator-preview-btn';
    previewBtn.innerHTML = '🔍';
    previewBtn.title = 'Preview website';
    previewBtn.style.cssText = `
      position: absolute;
      right: 35px;
      top: 50%;
      transform: translateY(-50%);
      display: none;
      background: #fff;
      border: 1px solid #ccc;
      border-radius: 3px;
      padding: 2px 6px;
      cursor: pointer;
      z-index: 10;
      font-size: 14px;
    `;

    previewBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const workingUrl = previewBtn.dataset.workingUrl || input.value;
      const isHttps = previewBtn.dataset.isHttps === 'true';
      showPreview(workingUrl, isHttps);
    });

    // Wrap input if not already wrapped
    if (input.parentElement.className !== 'link-validator-container') {
      const parent = input.parentElement;
      parent.insertBefore(container, input);
      container.appendChild(input);
      container.appendChild(indicator);
      container.appendChild(previewBtn);
    }

    return { indicator, previewBtn };
  }

  /**
   * Updates the visual state of the input based on link status
   */
  function updateInputStatus(input, indicator, previewBtn, result) {
    // Clear existing classes
    input.classList.remove('link-valid', 'link-broken', 'link-checking');

    // Handle string status for backward compatibility
    const status = typeof result === 'string' ? result : result?.status;
    const isHttps = result?.isHttps;
    const workingUrl = result?.workingUrl;

    if (status === 'checking') {
      indicator.innerHTML = '⏳';
      indicator.style.display = 'block';
      indicator.title = 'Checking link...';
      input.classList.add('link-checking');
      input.style.borderColor = '#ffa500';
      input.style.borderWidth = '2px';
      previewBtn.style.display = 'none';
      removeWarningMessage(input);
    } else if (status === 'valid') {
      indicator.innerHTML = '✅';
      indicator.style.display = 'block';

      // Show different message for HTTP vs HTTPS
      if (isHttps) {
        indicator.title = 'Link is accessible (HTTPS)';
      } else {
        indicator.title = 'Link is accessible (HTTP only - may have limited preview)';
      }

      input.classList.add('link-valid');
      input.style.borderColor = '#28a745';
      input.style.borderWidth = '2px';
      input.style.boxShadow = '0 0 0 0.2rem rgba(40, 167, 69, 0.25)';
      previewBtn.style.display = 'block';

      // Store working URL on the preview button for later use
      previewBtn.dataset.workingUrl = workingUrl || input.value;
      previewBtn.dataset.isHttps = isHttps ? 'true' : 'false';

      removeWarningMessage(input);

      // Add HTTPS suggestion if working URL uses HTTPS but input doesn't
      if (workingUrl && workingUrl !== input.value && isHttps) {
        addHttpsSuggestion(input, workingUrl);
      }
    } else if (status === 'broken') {
      indicator.innerHTML = '❌';
      indicator.style.display = 'block';
      indicator.title = 'Link appears to be broken (404 or unreachable)';
      input.classList.add('link-broken');
      input.style.borderColor = '#dc3545';
      input.style.borderWidth = '2px';
      input.style.boxShadow = '0 0 0 0.2rem rgba(220, 53, 69, 0.25)';
      previewBtn.style.display = 'none';

      // Add warning text below input if not already present
      addWarningMessage(input);
    } else {
      // Unknown or no URL
      indicator.style.display = 'none';
      previewBtn.style.display = 'none';
      input.style.borderColor = '';
      input.style.borderWidth = '';
      input.style.boxShadow = '';
      removeWarningMessage(input);
      removeHttpsSuggestion(input);
    }
  }

  /**
   * Adds a warning message below the input
   */
  function addWarningMessage(input) {
    const existingWarning = input.parentElement.querySelector('.link-validator-warning');
    if (existingWarning) return;

    const warning = document.createElement('div');
    warning.className = 'link-validator-warning';
    warning.style.cssText = `
      color: #dc3545;
      font-size: 12px;
      margin-top: 4px;
      display: flex;
      align-items: center;
      gap: 4px;
    `;
    warning.innerHTML = '⚠️ This link appears to be broken or unreachable. Please verify the URL.';

    input.parentElement.appendChild(warning);
  }

  /**
   * Removes the warning message
   */
  function removeWarningMessage(input) {
    const warning = input.parentElement?.querySelector('.link-validator-warning');
    if (warning) {
      warning.remove();
    }
  }

  /**
   * Adds an HTTPS suggestion message
   */
  function addHttpsSuggestion(input, httpsUrl) {
    const existingSuggestion = input.parentElement.querySelector('.link-validator-https-suggestion');
    if (existingSuggestion) return;

    const suggestion = document.createElement('div');
    suggestion.className = 'link-validator-https-suggestion';
    suggestion.style.cssText = `
      color: #007bff;
      font-size: 12px;
      margin-top: 4px;
      display: flex;
      align-items: center;
      gap: 8px;
    `;

    const message = document.createElement('span');
    message.innerHTML = '🔒 HTTPS version available';

    const useButton = document.createElement('button');
    useButton.textContent = 'Use HTTPS';
    useButton.style.cssText = `
      background: #007bff;
      color: white;
      border: none;
      padding: 2px 8px;
      border-radius: 3px;
      cursor: pointer;
      font-size: 11px;
    `;

    useButton.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      input.value = httpsUrl.replace(/^https?:\/\//, ''); // Remove protocol for cleaner display
      input.dispatchEvent(new Event('input', { bubbles: true }));
      suggestion.remove();
    });

    suggestion.appendChild(message);
    suggestion.appendChild(useButton);
    input.parentElement.appendChild(suggestion);
  }

  /**
   * Removes the HTTPS suggestion message
   */
  function removeHttpsSuggestion(input) {
    const suggestion = input.parentElement?.querySelector('.link-validator-https-suggestion');
    if (suggestion) {
      suggestion.remove();
    }
  }

  /**
   * Shows a preview popup of the website
   */
  async function showPreview(url, isHttps = true) {
    const normalizedUrl = normalizeUrl(url);

    // Determine if we need to use proxy
    const needsProxy = !isHttps && window.location.protocol === 'https:';

    let iframeUrl = normalizedUrl;

    // If we need proxy, fetch HTML via background script to avoid CORS
    if (needsProxy) {
      try {
        const result = await new Promise((resolve, reject) => {
          chrome.runtime.sendMessage(
            { type: 'PROXY_WEBSITE', url: normalizedUrl },
            (response) => {
              if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
              } else {
                resolve(response);
              }
            }
          );
        });

        if (result.success) {
          // Create a blob URL from the proxied HTML
          const blob = new Blob([result.html], { type: 'text/html' });
          iframeUrl = URL.createObjectURL(blob);
        } else {
          console.error('[LinkValidator] Proxy failed:', result.error);
          // Fall back to direct URL
        }
      } catch (error) {
        console.error('[LinkValidator] Error proxying website:', error);
        // Fall back to direct URL
      }
    }

    // Create overlay
    const overlay = document.createElement('div');
    overlay.className = 'link-validator-preview-overlay';
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.7);
      z-index: 10000;
      display: flex;
      align-items: center;
      justify-content: center;
      animation: fadeIn 0.2s;
    `;

    // Create preview container
    const previewContainer = document.createElement('div');
    previewContainer.style.cssText = `
      background: white;
      border-radius: 8px;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
      max-width: 90vw;
      max-height: 90vh;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    `;

    // Create header
    const header = document.createElement('div');
    header.style.cssText = `
      padding: 12px 16px;
      background: #f8f9fa;
      border-bottom: 1px solid #dee2e6;
      display: flex;
      justify-content: space-between;
      align-items: center;
    `;

    const title = document.createElement('div');
    title.style.cssText = `
      font-weight: 600;
      font-size: 14px;
      flex: 1;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    `;
    title.textContent = normalizedUrl;

    // Add proxy indicator if needed
    if (needsProxy) {
      const proxyBadge = document.createElement('span');
      proxyBadge.textContent = 'Proxied';
      proxyBadge.style.cssText = `
        background: #ffc107;
        color: #000;
        padding: 2px 6px;
        border-radius: 3px;
        font-size: 10px;
        margin-left: 8px;
        font-weight: normal;
      `;
      proxyBadge.title = 'This HTTP site is being proxied to view on HTTPS';
      title.appendChild(proxyBadge);
    }

    const closeBtn = document.createElement('button');
    closeBtn.innerHTML = '✕';
    closeBtn.style.cssText = `
      background: none;
      border: none;
      font-size: 20px;
      cursor: pointer;
      padding: 0 8px;
      color: #6c757d;
    `;
    closeBtn.onclick = () => {
      // Revoke blob URL if created to prevent memory leaks
      if (needsProxy && iframeUrl.startsWith('blob:')) {
        URL.revokeObjectURL(iframeUrl);
      }
      overlay.remove();
    };

    const openBtn = document.createElement('button');
    openBtn.innerHTML = '🔗 Open';
    openBtn.style.cssText = `
      background: #007bff;
      color: white;
      border: none;
      padding: 4px 12px;
      border-radius: 4px;
      cursor: pointer;
      margin-left: 8px;
      font-size: 12px;
    `;
    openBtn.onclick = () => window.open(normalizedUrl, '_blank');

    header.appendChild(title);
    header.appendChild(openBtn);
    header.appendChild(closeBtn);

    // Create iframe
    const iframe = document.createElement('iframe');
    iframe.src = iframeUrl;
    iframe.style.cssText = `
      width: ${CONFIG.previewWidth}px;
      height: ${CONFIG.previewHeight}px;
      border: none;
    `;

    // Add error handling for iframe
    iframe.onerror = () => {
      const errorMsg = document.createElement('div');
      errorMsg.style.cssText = `
        padding: 20px;
        text-align: center;
        color: #dc3545;
      `;
      errorMsg.innerHTML = `
        <p>Unable to load preview</p>
        <button onclick="window.open('${normalizedUrl}', '_blank')"
                style="background: #007bff; color: white; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer;">
          Open in New Tab
        </button>
      `;
      iframe.replaceWith(errorMsg);
    };

    previewContainer.appendChild(header);
    previewContainer.appendChild(iframe);
    overlay.appendChild(previewContainer);

    // Close on overlay click
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        // Revoke blob URL if created to prevent memory leaks
        if (needsProxy && iframeUrl.startsWith('blob:')) {
          URL.revokeObjectURL(iframeUrl);
        }
        overlay.remove();
      }
    });

    document.body.appendChild(overlay);
  }

  /**
   * Sets up validation for an input field
   */
  function setupInputValidation(input) {
    if (processedInputs.has(input)) return;
    processedInputs.add(input);

    const { indicator, previewBtn } = createValidationUI(input);
    let timeoutId = null;

    // Function to validate the current value
    async function validateInput() {
      const value = input.value.trim();

      if (!value) {
        updateInputStatus(input, indicator, previewBtn, 'none');
        return;
      }

      if (!isValidUrl(value)) {
        updateInputStatus(input, indicator, previewBtn, 'none');
        return;
      }

      updateInputStatus(input, indicator, previewBtn, 'checking');

      const result = await checkUrlStatus(value);
      updateInputStatus(input, indicator, previewBtn, result);
    }

    // Listen for input changes
    input.addEventListener('input', () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(validateInput, CONFIG.checkDelay);
    });

    // Validate on blur
    input.addEventListener('blur', validateInput);

    // Initial validation if there's already a value
    if (input.value.trim()) {
      setTimeout(validateInput, 500);
    }
  }

  /**
   * Finds and processes relevant input fields
   */
  function findAndProcessInputs() {
    if (!validatorActive || !isGoGettaWebsitePage()) {
      return;
    }

    // Look for inputs that might contain website URLs
    const selectors = [
      'input[type="text"][placeholder*="website" i]',
      'input[type="text"][placeholder*="web address" i]',
      'input[type="url"]',
      'input.Input[type="text"]' // Generic inputs on the questions page
    ];

    selectors.forEach(selector => {
      const inputs = document.querySelectorAll(selector);
      inputs.forEach(input => {
        // Additional check: only process if placeholder or value suggests it's for URLs
        const placeholder = (input.placeholder || '').toLowerCase();
        const value = (input.value || '').toLowerCase();

        if (placeholder.includes('website') ||
            placeholder.includes('web') ||
            placeholder.includes('url') ||
            input.type === 'url' ||
            isValidUrl(input.value)) {
          setupInputValidation(input);
        }
      });
    });
  }

  /**
   * Initialize the link validator
   */
  function init() {
    setupRouteWatcher();
    handleRouteChange();
  }

  // Start when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
