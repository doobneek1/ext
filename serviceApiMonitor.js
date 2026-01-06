(() => {
  if (window.__gghostServiceApiMonitorInstalled) return;
  window.__gghostServiceApiMonitorInstalled = true;

  const SERVICE_API_RE = /\/(prod|stage)\/services(\/|$)/i;
  const LOCATION_API_RE = /\/(prod|stage)\/locations(\/|$)/i;
  const PHONE_API_RE = /\/(prod|stage)\/phones\/[a-f0-9-]+/i;
  const TRACKED_METHODS = new Set(["POST", "PATCH", "PUT", "DELETE"]);
  const PHONE_METHODS = new Set(["POST", "PATCH", "PUT"]);
  const PROOFS_REQUIRED_PATH = /\/documents\/proofs-required\/?$/i;
  const PROOFS_OPTION_SELECTOR = 'button.Option, .Option[role="button"]';
  const CHECK_ICON_SELECTOR = 'svg.fa-check, svg[data-icon="check"]';
  const PROOFS_TEXTAREA_CLASS = 'dnk-proofs-textarea';
  const NONE_LABEL = 'none';
  const PROOFS_METHODS = new Set(["PATCH", "PUT"]);
  const NONE_CLEAR_ATTR = 'data-gghost-proofs-none-clear';

  const getApiTarget = (url, method) => {
    if (!url || !method) return null;
    const upper = String(method).toUpperCase();
    if (!TRACKED_METHODS.has(upper)) return null;
    const urlString = String(url);
    if (SERVICE_API_RE.test(urlString)) return "service";
    if (LOCATION_API_RE.test(urlString)) return "location";
    if (PHONE_API_RE.test(urlString)) return "phone";
    return null;
  };

  const shouldSanitizePhone = (url, method) => {
    if (!url || !method) return false;
    const upper = String(method).toUpperCase();
    if (!PHONE_METHODS.has(upper)) return false;
    return PHONE_API_RE.test(String(url));
  };

  const sanitizePhoneValue = (value) => {
    const raw = String(value || "").trim();
    if (!raw) return "";
    const digits = raw.replace(/\D/g, "");
    if (!digits) return "";
    return raw.startsWith("+") ? `+${digits}` : digits;
  };

  const sanitizePhonePayload = (payload) => {
    if (!payload || typeof payload !== "object") return null;
    if (!Object.prototype.hasOwnProperty.call(payload, "number")) return null;
    const sanitizedNumber = sanitizePhoneValue(payload.number);
    if (!sanitizedNumber || sanitizedNumber === payload.number) return null;
    return { ...payload, number: sanitizedNumber };
  };

  const sanitizePhoneBodyText = (text) => {
    if (typeof text !== "string") return null;
    let payload = null;
    try {
      payload = JSON.parse(text);
    } catch {
      return null;
    }
    const sanitized = sanitizePhonePayload(payload);
    if (!sanitized) return null;
    try {
      return JSON.stringify(sanitized);
    } catch {
      return null;
    }
  };

  const sanitizePhoneRequest = (input, init) => {
    const request = input instanceof Request ? input : null;
    const url = request ? request.url : (typeof input === "string" ? input : input?.url);
    const method = (init && init.method) || request?.method || "GET";

    if (!shouldSanitizePhone(url, method)) {
      return Promise.resolve({ input, init });
    }

    if (init && Object.prototype.hasOwnProperty.call(init, "body")) {
      const sanitizedBody = sanitizePhoneBodyText(init.body);
      if (!sanitizedBody) return Promise.resolve({ input, init });
      const nextInit = { ...init, body: sanitizedBody };
      return Promise.resolve({ input, init: nextInit });
    }

    if (request) {
      return request.clone().text().then((text) => {
        const sanitizedBody = sanitizePhoneBodyText(text);
        if (!sanitizedBody) return { input, init };
        const nextInit = init ? { ...init, body: sanitizedBody } : { body: sanitizedBody };
        return { input, init: nextInit };
      }).catch(() => ({ input, init }));
    }

    return Promise.resolve({ input, init });
  };

  const isProofsRequiredPage = () => {
    if (!/(^|\.)gogetta\.nyc$/i.test(location.hostname)) return false;
    return PROOFS_REQUIRED_PATH.test(location.pathname);
  };

  const normalizeLabel = (text) => (text || '').replace(/\s+/g, ' ').trim().toLowerCase();

  const getOptionLabelRaw = (button) => {
    if (!button) return '';
    const labelNode = button.querySelector('.w-100') || button;
    const editor = labelNode.querySelector(`.${PROOFS_TEXTAREA_CLASS}`);
    const raw = editor ? editor.value : labelNode.textContent || '';
    return raw.replace(/\s+/g, ' ').trim();
  };

  const collectProofsOverride = () => {
    if (!isProofsRequiredPage()) return null;
    const overrideRaw = document.documentElement?.getAttribute('data-dnk-proofs-override');
    if (overrideRaw) {
      try {
        const parsed = JSON.parse(overrideRaw);
        document.documentElement.removeAttribute('data-dnk-proofs-override');
        document.documentElement.removeAttribute('data-dnk-proofs-override-at');
        if (Array.isArray(parsed)) return parsed;
      } catch {}
    }
    const options = Array.from(document.querySelectorAll(PROOFS_OPTION_SELECTOR));
    let sawNone = false;
    const labels = [];

    for (const option of options) {
      if (!option.querySelector(CHECK_ICON_SELECTOR)) continue;
      const raw = getOptionLabelRaw(option);
      const normalized = normalizeLabel(raw);
      if (!normalized) continue;
      if (normalized === NONE_LABEL) {
        sawNone = true;
        continue;
      }
      labels.push(raw);
    }

    const shouldClear = document.documentElement.hasAttribute(NONE_CLEAR_ATTR);
    if (!labels.length && (sawNone || shouldClear)) {
      if (shouldClear) document.documentElement.removeAttribute(NONE_CLEAR_ATTR);
      return [null];
    }
    if (labels.length) {
      if (shouldClear) document.documentElement.removeAttribute(NONE_CLEAR_ATTR);
      return labels;
    }
    return null;
  };

  const shouldOverrideProofs = (url, method) => {
    if (!url || !method) return false;
    if (!isProofsRequiredPage()) return false;
    const upper = String(method).toUpperCase();
    if (!PROOFS_METHODS.has(upper)) return false;
    return SERVICE_API_RE.test(String(url));
  };

  const overrideProofsBodyText = (text, proofs) => {
    if (typeof text !== "string") return null;
    let payload = null;
    try {
      payload = JSON.parse(text);
    } catch {
      return null;
    }
    if (!payload || typeof payload !== "object") return null;
    const documents = payload.documents && typeof payload.documents === "object"
      ? payload.documents
      : {};
    payload.documents = { ...documents, proofs };
    try {
      return JSON.stringify(payload);
    } catch {
      return null;
    }
  };

  const withBodyOverride = (input, init, bodyText) => {
    if (input instanceof Request) {
      const nextRequest = new Request(input, { ...(init || {}), body: bodyText });
      return { input: nextRequest, init: undefined };
    }
    const nextInit = { ...(init || {}), body: bodyText };
    return { input, init: nextInit };
  };

  const overrideProofsRequest = (input, init) => {
    const request = input instanceof Request ? input : null;
    const url = request ? request.url : (typeof input === "string" ? input : input?.url);
    const method = (init && init.method) || request?.method || "GET";

    if (!shouldOverrideProofs(url, method)) {
      return Promise.resolve({ input, init });
    }

    const proofsOverride = collectProofsOverride();
    if (!proofsOverride) return Promise.resolve({ input, init });

    const applyOverride = (body) => {
      const bodyText = typeof body === "string" ? body : safeBodyToString(body);
      if (!bodyText) return { input, init };
      const nextBody = overrideProofsBodyText(bodyText, proofsOverride);
      if (!nextBody) return { input, init };
      return withBodyOverride(input, init, nextBody);
    };

    if (init && Object.prototype.hasOwnProperty.call(init, "body")) {
      return Promise.resolve(applyOverride(init.body));
    }

    if (request) {
      return request.clone().text().then((text) => applyOverride(text)).catch(() => ({ input, init }));
    }

    return Promise.resolve({ input, init });
  };

  const safeBodyToString = (body) => {
    if (body == null) return null;
    if (typeof body === "string") return body;
    if (body instanceof URLSearchParams) return body.toString();
    if (body instanceof FormData) return null;
    if (body instanceof Blob) return null;
    if (body instanceof ArrayBuffer) return null;
    try {
      return JSON.stringify(body);
    } catch {
      return null;
    }
  };

  const emitMessage = (source, payload) => {
    try {
      window.postMessage({ source, payload }, "*");
    } catch {}
  };

  const originalFetch = window.fetch.bind(window);
  window.fetch = function(input, init) {
    const startedAt = Date.now();
    return sanitizePhoneRequest(input, init).then(({ input: nextInput, init: nextInit }) => {
      return overrideProofsRequest(nextInput, nextInit);
    }).then(({ input: finalInput, init: finalInit }) => {
      const request = finalInput instanceof Request ? finalInput : null;
      const url = request ? request.url : (typeof finalInput === "string" ? finalInput : finalInput?.url);
      const method = (finalInit && finalInit.method) || request?.method || "GET";
      const trackTarget = getApiTarget(url, method);
      const trackSource = trackTarget === "location"
        ? "gghost-location-api"
        : (trackTarget === "service" ? "gghost-service-api" : "gghost-phone-api");
      let requestBodyPromise = Promise.resolve(null);

      if (trackTarget) {
        if (finalInit && Object.prototype.hasOwnProperty.call(finalInit, "body")) {
          requestBodyPromise = Promise.resolve(safeBodyToString(finalInit.body));
        } else if (request) {
          requestBodyPromise = request.clone().text().catch(() => null);
        }
      }

      return originalFetch(finalInput, finalInit).then((response) => {
        if (trackTarget) {
          const responseClone = response.clone();
          Promise.all([
            requestBodyPromise,
            responseClone.text().catch(() => null)
          ]).then(([requestBody, responseBody]) => {
            emitMessage(trackSource, {
              url,
              method,
              requestBody,
              responseBody,
              status: response.status,
              ok: response.ok,
              startedAt,
              endedAt: Date.now()
            });
          });
        }
        return response;
      }).catch((err) => {
        if (trackTarget) {
          requestBodyPromise.then((requestBody) => {
            emitMessage(trackSource, {
              url,
              method,
              requestBody,
              responseBody: null,
              status: 0,
              ok: false,
              error: String(err),
              startedAt,
              endedAt: Date.now()
            });
          });
        }
        throw err;
      });
    });
  };

  const originalOpen = XMLHttpRequest.prototype.open;
  const originalSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function(method, url) {
    this.__gghostServiceApi = { method, url };
    return originalOpen.apply(this, arguments);
  };

  XMLHttpRequest.prototype.send = function(body) {
    const info = this.__gghostServiceApi;
    if (info && shouldOverrideProofs(info.url, info.method)) {
      const proofsOverride = collectProofsOverride();
      const bodyText = typeof body === "string" ? body : safeBodyToString(body);
      if (proofsOverride && bodyText) {
        const nextBody = overrideProofsBodyText(bodyText, proofsOverride);
        if (nextBody) body = nextBody;
      }
    }
    if (info && shouldSanitizePhone(info.url, info.method)) {
      const sanitizedBody = sanitizePhoneBodyText(body);
      if (sanitizedBody) {
        body = sanitizedBody;
      }
    }
    const trackTarget = info ? getApiTarget(info.url, info.method) : null;
    const trackSource = trackTarget === "location"
      ? "gghost-location-api"
      : (trackTarget === "service" ? "gghost-service-api" : "gghost-phone-api");
    if (trackTarget) {
      const requestBody = safeBodyToString(body);
      const startedAt = Date.now();
      const onDone = () => {
        const status = this.status || 0;
        const ok = status >= 200 && status < 300;
        let responseBody = null;
        try {
          if (this.responseType === "" || this.responseType === "text") {
            responseBody = this.responseText;
          }
        } catch {}
        emitMessage(trackSource, {
          url: info.url,
          method: info.method,
          requestBody,
          responseBody,
          status,
          ok,
          startedAt,
          endedAt: Date.now()
        });
      };
      this.addEventListener("loadend", onDone, { once: true });
    }
    return originalSend.apply(this, arguments);
  };
})();
