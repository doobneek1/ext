// GGHOST_PART_MARKER: gghost.part-4.js
window.__GGHOST_PARTS_LOADED__ = window.__GGHOST_PARTS_LOADED__ || [];
window.__GGHOST_PARTS_LOADED__.push('gghost.part-4.js');
console.log('[gghost] loaded gghost.part-4.js');
/* ===========================
   Taxonomy heart overlay
   =========================== */
const TAXONOMY_HEART_ID = 'gghost-taxonomy-heart';
function removeTaxonomyHeartOverlay() {
  document.getElementById(TAXONOMY_HEART_ID)?.remove();
}
function renderTaxonomyHeartOverlay(services, locationId) {
  removeTaxonomyHeartOverlay();
  if (!Array.isArray(services) || services.length === 0 || !locationId) return;
  const container = document.createElement('div');
  container.id = TAXONOMY_HEART_ID;
  Object.assign(container.style, {
    position: 'fixed',
    top: '88px',
    right: '20px',
    width: '32px',
    height: '32px',
    zIndex: '9999',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: 'Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
  });
  const heartBtn = document.createElement('button');
  heartBtn.type = 'button';
  heartBtn.innerHTML = '&#9829;';
  heartBtn.title = 'Services';
  Object.assign(heartBtn.style, {
    width: '32px',
    height: '32px',
    borderRadius: '50%',
    border: '1px solid #d4c79a',
    background: '#fffef5',
    color: '#b04a4a',
    fontSize: '16px',
    cursor: 'pointer',
    boxShadow: '0 4px 10px rgba(0,0,0,0.12)'
  });
  const hoverPanel = createServiceHoverPanel(services, locationId, null);
  hoverPanel.style.position = 'fixed';
  hoverPanel.style.left = '0';
  hoverPanel.style.top = '0';
  hoverPanel.style.right = 'auto';
  let hoverTimeout = null;
  const positionHoverPanel = () => {
    const padding = 8;
    const availableWidth = Math.max(0, window.innerWidth - padding * 2);
    const maxWidth = Math.min(320, availableWidth);
    const minWidth = Math.min(260, maxWidth);
    const width = Math.min(280, maxWidth);
    if (maxWidth > 0) {
      hoverPanel.style.maxWidth = `${maxWidth}px`;
      hoverPanel.style.minWidth = `${minWidth}px`;
      hoverPanel.style.width = `${width}px`;
    }
    const availableHeight = Math.max(0, window.innerHeight - padding * 2);
    const maxHeight = Math.min(240, availableHeight);
    if (maxHeight > 0) {
      hoverPanel.style.maxHeight = `${maxHeight}px`;
    }
    const anchorRect = container.getBoundingClientRect();
    const panelRect = hoverPanel.getBoundingClientRect();
    let left = anchorRect.right - panelRect.width;
    let top = anchorRect.bottom + 6;
    if (left < padding) left = padding;
    if (left + panelRect.width > window.innerWidth - padding) {
      left = window.innerWidth - padding - panelRect.width;
    }
    if (top + panelRect.height > window.innerHeight - padding) {
      const aboveTop = anchorRect.top - 6 - panelRect.height;
      if (aboveTop >= padding) {
        top = aboveTop;
      } else {
        top = Math.max(padding, window.innerHeight - padding - panelRect.height);
      }
    }
    hoverPanel.style.left = `${Math.round(left)}px`;
    hoverPanel.style.top = `${Math.round(top)}px`;
  };
  const showPanel = () => {
    clearTimeout(hoverTimeout);
    positionHoverPanel();
    hoverPanel.style.opacity = '1';
    hoverPanel.style.pointerEvents = 'auto';
    hoverPanel.style.transform = 'translateY(0)';
  };
  const hidePanel = () => {
    if (hoverPanel && typeof hoverPanel.__gghostCommitActiveEdit === 'function') {
      hoverPanel.__gghostCommitActiveEdit();
    }
    hoverTimeout = setTimeout(() => {
      hoverPanel.style.opacity = '0';
      hoverPanel.style.pointerEvents = 'none';
      hoverPanel.style.transform = 'translateY(6px)';
    }, 120);
  };
  container.addEventListener('mouseenter', showPanel);
  container.addEventListener('mouseleave', hidePanel);
  hoverPanel.addEventListener('mouseenter', showPanel);
  hoverPanel.addEventListener('mouseleave', hidePanel);
  container.appendChild(heartBtn);
  container.appendChild(hoverPanel);
  document.body.appendChild(container);
}
async function showTaxonomyHeartOverlay(locationId) {
  if (!locationId) {
    removeTaxonomyHeartOverlay();
    return;
  }
  const { data: locationData, fromCache } = await fetchFullLocationRecord(locationId, { refresh: false });
  if (!locationData) {
    removeTaxonomyHeartOverlay();
    return;
  }
  const services = normalizeServices(locationData.Services || locationData.services);
  renderTaxonomyHeartOverlay(services, locationId);
  if (fromCache) {
    fetchFullLocationRecord(locationId, { refresh: true })
      .then(({ data: freshData }) => {
        if (!freshData) return;
        const freshServices = normalizeServices(freshData.Services || freshData.services);
        renderTaxonomyHeartOverlay(freshServices, locationId);
      })
      .catch(err => {
        console.error('[Taxonomy Heart] Background refresh failed', err);
      });
  }
}
/* ===========================
   Location contact overlay
   =========================== */
const LOCATION_CONTACT_CONTAINER_ID = 'gghost-location-contact-container';
const LOCATION_CONTACT_PANEL_ID = 'gghost-location-contact-panel';
const LOCATION_CONTACT_TOGGLE_ID = 'gghost-location-contact-toggle';
const LOCATION_CONTACT_STATUS_TTL = 5 * 60 * 1000;
const locationContactStatusCache = new Map();
let locationContactRequestId = 0;
const LOCATION_LINK_RE = /https?:\/\/[^\s"'<>]+/gi;
const LOCATION_EMAIL_RE = /[\w.+-]+@[\w.-]+\.\w{2,}/g;
const LOCATION_PHONE_RE = /(?:(?:\+?1[\s.\-]*)?)\(?\d{3}\)?[\s.\-]*\d{3}[\s.\-]*\d{4}(?:\s*(?:x|ext\.?|extension|#)\s*\d+)?/gi;
function buildLocationQuestionUrl(uuid, question) {
  return `https://gogetta.nyc/team/location/${uuid}/questions/${question}`;
}
function buildLocationQuestionPath(uuid, question) {
  return `/team/location/${uuid}/questions/${question}`;
}
function buildLocationPhonePath(uuid, phoneId) {
  if (!uuid) return '';
  if (!phoneId) return buildLocationQuestionPath(uuid, 'phone-number');
  return `${buildLocationQuestionPath(uuid, 'phone-number')}/${phoneId}`;
}
function buildLocationPhoneEditUrl(uuid, phoneId) {
  if (!uuid || !phoneId) return buildLocationQuestionUrl(uuid, 'phone-number');
  return `https://gogetta.nyc/team/location/${uuid}/questions/phone-number/${phoneId}`;
}
function cleanContactMatch(value) {
  return String(value || '').trim().replace(/[),.;]+$/, '');
}
function normalizeContactUrl(raw) {
  const cleaned = cleanContactMatch(raw);
  if (!cleaned) return '';
  if (!/^https?:\/\//i.test(cleaned)) {
    return `http://${cleaned}`;
  }
  return cleaned;
}
function isFeasibleContactUrl(raw) {
  const normalized = normalizeContactUrl(raw);
  if (!normalized || /\s/.test(normalized)) return false;
  try {
    const url = new URL(normalized);
    return /^https?:$/i.test(url.protocol);
  } catch {
    return false;
  }
}
function collectContactStrings(value, collector, depth = 0, options = {}) {
  if (!value || collector.length > 5000 || depth > 10) return;
  const skipRootKeys = options.skipRootKeys instanceof Set
    ? options.skipRootKeys
    : new Set(options.skipRootKeys || []);
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed) collector.push(trimmed);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach(item => collectContactStrings(item, collector, depth + 1, options));
    return;
  }
  if (typeof value === 'object') {
    Object.entries(value).forEach(([key, item]) => {
      if (depth === 0 && skipRootKeys.has(key)) return;
      collectContactStrings(item, collector, depth + 1, options);
    });
  }
}
async function checkLocationUrlStatus(rawUrl) {
  const normalized = normalizeContactUrl(rawUrl);
  if (!normalized || !isFeasibleContactUrl(normalized)) {
    return { status: 'invalid', isHttps: false, workingUrl: normalized || rawUrl };
  }
  const cached = locationContactStatusCache.get(normalized);
  if (cached && Date.now() - cached.timestamp < LOCATION_CONTACT_STATUS_TTL) {
    return cached;
  }
  if (!chrome?.runtime?.sendMessage) {
    return { status: 'unknown', isHttps: false, workingUrl: normalized };
  }
  try {
    const result = await new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ type: 'CHECK_URL_STATUS', url: normalized }, response => {
        let lastError = null;
        try {
          lastError = chrome?.runtime?.lastError;
        } catch (err) {
          reject(err);
          return;
        }
        if (lastError) {
          reject(new Error(lastError.message || 'Extension error'));
          return;
        }
        resolve(response);
      });
    });
    const payload = {
      status: result?.status || 'unknown',
      isHttps: !!result?.isHttps,
      workingUrl: result?.workingUrl || normalized,
      httpStatus: result?.httpStatus,
      timestamp: Date.now()
    };
    locationContactStatusCache.set(normalized, payload);
    return payload;
  } catch (error) {
    console.warn('[Location Contact] URL status check failed:', error);
    return { status: 'unknown', isHttps: false, workingUrl: normalized };
  }
}
async function showLocationLinkPreview(url, isHttps = true) {
  const normalized = normalizeContactUrl(url);
  if (!normalized) return;
  const needsProxy = !isHttps && window.location.protocol === 'https:';
  let iframeUrl = normalized;
  if (needsProxy && chrome?.runtime?.sendMessage) {
    try {
      const result = await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({ type: 'PROXY_WEBSITE', url: normalized }, response => {
          let lastError = null;
          try {
            lastError = chrome?.runtime?.lastError;
          } catch (err) {
            reject(err);
            return;
          }
          if (lastError) {
            reject(new Error(lastError.message || 'Extension error'));
            return;
          }
          resolve(response);
        });
      });
      if (result?.success) {
        const blob = new Blob([result.html], { type: 'text/html' });
        iframeUrl = URL.createObjectURL(blob);
      }
    } catch (error) {
      console.error('[Location Contact] Preview proxy failed:', error);
    }
  }
  const overlay = document.createElement('div');
  overlay.className = 'link-validator-preview-overlay';
  overlay.style.cssText = `
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.7);
    z-index: 10000;
    display: flex;
    align-items: center;
    justify-content: center;
  `;
  const previewContainer = document.createElement('div');
  previewContainer.style.cssText = `
    background: #fff;
    border-radius: 8px;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
    max-width: 90vw;
    max-height: 90vh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  `;
  const header = document.createElement('div');
  header.style.cssText = `
    padding: 10px 12px;
    background: #f7f7f7;
    border-bottom: 1px solid #e0e0e0;
    display: flex;
    align-items: center;
    gap: 8px;
  `;
  const title = document.createElement('div');
  title.textContent = normalized;
  title.style.cssText = `
    font-weight: 600;
    font-size: 12px;
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  `;
  const openBtn = document.createElement('button');
  openBtn.type = 'button';
  openBtn.textContent = 'Open';
  openBtn.style.cssText = `
    background: #0d6efd;
    color: #fff;
    border: none;
    padding: 4px 10px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 12px;
  `;
  openBtn.addEventListener('click', () => window.open(normalized, '_blank'));
  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.textContent = 'x';
  closeBtn.style.cssText = `
    background: none;
    border: none;
    font-size: 16px;
    cursor: pointer;
    color: #555;
  `;
  closeBtn.addEventListener('click', () => {
    if (needsProxy && iframeUrl.startsWith('blob:')) {
      URL.revokeObjectURL(iframeUrl);
    }
    overlay.remove();
  });
  header.appendChild(title);
  header.appendChild(openBtn);
  header.appendChild(closeBtn);
  const iframe = document.createElement('iframe');
  iframe.src = iframeUrl;
  iframe.style.cssText = `
    width: 420px;
    height: 320px;
    border: none;
  `;
  iframe.onerror = () => {
    const errorMsg = document.createElement('div');
    errorMsg.style.cssText = `
      padding: 20px;
      text-align: center;
      color: #c62828;
      font-size: 13px;
    `;
    errorMsg.textContent = 'Unable to load preview.';
    iframe.replaceWith(errorMsg);
  };
  previewContainer.appendChild(header);
  previewContainer.appendChild(iframe);
  overlay.appendChild(previewContainer);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      if (needsProxy && iframeUrl.startsWith('blob:')) {
        URL.revokeObjectURL(iframeUrl);
      }
      overlay.remove();
    }
  });
  document.body.appendChild(overlay);
}
function buildLocationContactData(locationData, locationId) {
  const linkItems = [];
  const emailItems = [];
  const phoneItems = [];
  const seenLinkKeys = new Set();
  const seenLinkNormalized = new Set();
  const seenEmailKeys = new Set();
  const seenEmailNormalized = new Set();
  const emailIndexByNormalized = new Map();
  const seenPhoneKeys = new Set();
  const addLink = (rawUrl, targetUrl, sourceLabel, options = {}) => {
    const cleaned = cleanContactMatch(rawUrl);
    if (!cleaned) return;
    const normalized = normalizeContactUrl(cleaned);
    if (!normalized) return;
    const key = `${normalized}||${targetUrl || ''}`;
    if (seenLinkKeys.has(key)) return;
    if (options.skipIfSeenNormalized && seenLinkNormalized.has(normalized)) return;
    seenLinkKeys.add(key);
    seenLinkNormalized.add(normalized);
    linkItems.push({
      display: cleaned,
      normalizedUrl: normalized,
      targetUrl,
      sourceLabel
    });
  };
  const addEmail = (rawEmail, sourceLabel, targetUrl) => {
    const cleaned = cleanContactMatch(rawEmail);
    if (!cleaned) return;
    const normalized = cleaned.toLowerCase();
    const existingIndex = emailIndexByNormalized.get(normalized);
    if (existingIndex !== undefined) {
      const existing = emailItems[existingIndex];
      const existingUrl = existing?.targetUrl || '';
      const existingIsGoGetta = /\/team\/location\//i.test(existingUrl);
      const newIsGoGetta = targetUrl && /\/team\/location\//i.test(targetUrl);
      const existingIsGmail = /mail\.google\.com/i.test(existingUrl);
      if (targetUrl && (!existingUrl || existingIsGmail || (!existingIsGoGetta && newIsGoGetta))) {
        existing.targetUrl = targetUrl;
        if (sourceLabel) {
          existing.sourceLabel = sourceLabel;
        }
      }
      return;
    }
    const key = `${normalized}||${targetUrl || ''}`;
    if (seenEmailKeys.has(key)) return;
    if (!targetUrl && seenEmailNormalized.has(normalized)) return;
    seenEmailKeys.add(key);
    seenEmailNormalized.add(normalized);
    emailItems.push({
      display: cleaned,
      targetUrl: targetUrl || buildGmailUrl(cleaned),
      sourceLabel
    });
    emailIndexByNormalized.set(normalized, emailItems.length - 1);
  };
  const addPhone = (rawPhone, targetUrl, sourceLabel) => {
    const cleaned = cleanContactMatch(rawPhone);
    if (!cleaned) return;
    const digits = digitsOnly(cleaned);
    const key = `${digits || cleaned}||${targetUrl || ''}`;
    if (seenPhoneKeys.has(key)) return;
    seenPhoneKeys.add(key);
    phoneItems.push({
      display: cleaned,
      targetUrl,
      sourceLabel
    });
  };
  const services = coerceServicesArray(locationData?.Services || locationData?.services);
  services.forEach(service => {
    const serviceName = service?.name ? truncateText(service.name, 40) : 'Service';
    const serviceId = service?.id;
    if (!serviceId) return;
    const descTarget = buildServiceUrl(locationId, serviceId, 'description');
    const desc = String(service?.description || '').trim();
    if (desc) {
      const links = desc.match(LOCATION_LINK_RE) || [];
      links.forEach(link => addLink(link, descTarget, `Service: ${serviceName} (description)`));
      const emails = desc.match(LOCATION_EMAIL_RE) || [];
      emails.forEach(email => addEmail(email, `Service: ${serviceName} (description)`, descTarget));
      const phones = desc.match(LOCATION_PHONE_RE) || [];
      phones.forEach(phone => addPhone(phone, descTarget, `Service: ${serviceName} (description)`));
    }
    const eventInfos = Array.isArray(service?.EventRelatedInfos) ? service.EventRelatedInfos : [];
    eventInfos.forEach(info => {
      const infoText = String(info?.information || '').trim();
      if (!infoText) return;
      const eventTarget = buildServiceUrl(locationId, serviceId, 'other-info');
      const links = infoText.match(LOCATION_LINK_RE) || [];
      links.forEach(link => addLink(link, eventTarget, `Service: ${serviceName} (event info)`));
      const emails = infoText.match(LOCATION_EMAIL_RE) || [];
      emails.forEach(email => addEmail(email, `Service: ${serviceName} (event info)`, eventTarget));
      const phones = infoText.match(LOCATION_PHONE_RE) || [];
      phones.forEach(phone => addPhone(phone, eventTarget, `Service: ${serviceName} (event info)`));
    });
    const serviceStrings = [];
    collectContactStrings(service, serviceStrings, 0, {
      skipRootKeys: ['EventRelatedInfos', 'Taxonomies', 'RegularSchedules', 'HolidaySchedules', 'Eligibilities']
    });
    const serviceText = serviceStrings.join(' ');
    const serviceEmails = serviceText.match(LOCATION_EMAIL_RE) || [];
    serviceEmails.forEach(email => addEmail(email, `Service: ${serviceName} (details)`, descTarget));
  });
  const locationPhones = Array.isArray(locationData?.Phones) ? locationData.Phones : [];
  const visibleLocationPhoneIndex = locationPhones.length > 1 ? 0 : -1;
  const phoneQuestionUrl = buildLocationQuestionUrl(locationId, 'phone-number');
  locationPhones.forEach((phone, index) => {
    if (phone?.number) {
      const phoneTarget = phone?.id ? buildLocationPhoneEditUrl(locationId, phone.id) : phoneQuestionUrl;
      let label = 'Location phone';
      if (visibleLocationPhoneIndex !== -1) {
        label = index === visibleLocationPhoneIndex ? 'Location phone (visible)' : 'Location phone (invisible)';
      }
      addPhone(phone.number, phoneTarget, label);
    }
  });
  const websiteQuestionUrl = buildLocationQuestionUrl(locationId, 'website');
  const urlFields = [];
  if (locationData?.url) urlFields.push({ value: locationData.url, label: 'Location url' });
  if (locationData?.Organization?.url) urlFields.push({ value: locationData.Organization.url, label: 'Organization url' });
  services.forEach(service => {
    if (service?.url) {
      const serviceName = service?.name ? truncateText(service.name, 40) : 'Service';
      urlFields.push({ value: service.url, label: `Service url: ${serviceName}` });
    }
  });
  urlFields.forEach(entry => addLink(entry.value, websiteQuestionUrl, entry.label));
  const allStrings = [];
  collectContactStrings(locationData, allStrings, 0, { skipRootKeys: ['streetview_url'] });
  const allText = allStrings.join(' ');
  const generalLinks = allText.match(LOCATION_LINK_RE) || [];
  generalLinks.forEach(link => addLink(link, normalizeContactUrl(link), 'Detected link', { skipIfSeenNormalized: true }));
  const generalEmails = allText.match(LOCATION_EMAIL_RE) || [];
  generalEmails.forEach(email => addEmail(email, 'Detected email'));
  return { linkItems, emailItems, phoneItems };
}
function removeLocationContactOverlay() {
  document.getElementById(LOCATION_CONTACT_CONTAINER_ID)?.remove();
}
function renderLocationContactOverlay(locationId, locationData) {
  const existing = document.getElementById(LOCATION_CONTACT_CONTAINER_ID);
  const wasOpen = existing?.dataset?.open === 'true';
  if (existing) existing.remove();
  const { linkItems, emailItems, phoneItems } = buildLocationContactData(locationData, locationId);
  if (!linkItems.length && !emailItems.length && !phoneItems.length) {
    return;
  }
  const container = document.createElement('div');
  container.id = LOCATION_CONTACT_CONTAINER_ID;
  container.dataset.open = wasOpen ? 'true' : 'false';
  Object.assign(container.style, {
    position: 'fixed',
    top: '88px',
    left: '20px',
    zIndex: '10000',
    fontFamily: 'Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    color: '#1f1f1f'
  });
  const toggle = document.createElement('button');
  toggle.id = LOCATION_CONTACT_TOGGLE_ID;
  toggle.type = 'button';
  toggle.textContent = wasOpen ? 'x' : '?';
  Object.assign(toggle.style, {
    width: '28px',
    height: '28px',
    borderRadius: '50%',
    border: '1px solid #c9c9c9',
    background: '#fff',
    fontSize: '16px',
    fontWeight: '700',
    cursor: 'pointer',
    boxShadow: '0 2px 6px rgba(0,0,0,0.15)'
  });
  const panel = document.createElement('div');
  panel.id = LOCATION_CONTACT_PANEL_ID;
  Object.assign(panel.style, {
    marginTop: '8px',
    padding: '12px',
    background: '#ffffff',
    border: '1px solid #dedede',
    borderRadius: '8px',
    boxShadow: '0 6px 18px rgba(0, 0, 0, 0.12)',
    maxWidth: '360px',
    maxHeight: '70vh',
    overflowY: 'auto',
    display: wasOpen ? 'block' : 'none'
  });
  const setOpenState = (open) => {
    container.dataset.open = open ? 'true' : 'false';
    toggle.textContent = open ? 'x' : '?';
    panel.style.display = open ? 'block' : 'none';
  };
  toggle.addEventListener('click', () => {
    const isOpen = container.dataset.open === 'true';
    setOpenState(!isOpen);
  });
  const appendSection = (title, items, renderer) => {
    if (!items.length) return;
    const section = document.createElement('div');
    section.style.marginBottom = '12px';
    const header = document.createElement('div');
    header.textContent = title;
    header.style.cssText = 'font-weight: 600; font-size: 13px; margin-bottom: 6px;';
    section.appendChild(header);
    items.forEach(item => section.appendChild(renderer(item)));
    panel.appendChild(section);
  };
  const createMeta = (text) => {
    const meta = document.createElement('div');
    meta.textContent = text;
    meta.style.cssText = 'font-size: 11px; color: #666; margin-top: 2px;';
    return meta;
  };
  const copyToClipboard = async (text) => {
    const value = String(text || '');
    if (!value) return false;
    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(value);
        return true;
      } catch {
        // fall through to legacy path
      }
    }
    const textarea = document.createElement('textarea');
    textarea.value = value;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    const ok = document.execCommand('copy');
    textarea.remove();
    return ok;
  };
  const createActionButton = (label) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = label;
    Object.assign(btn.style, {
      background: 'none',
      border: 'none',
      padding: '0',
      color: '#0d6efd',
      fontSize: '12px',
      textAlign: 'left',
      cursor: 'pointer',
      flex: '1'
    });
    return btn;
  };
  const createCopyButton = (text) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = 'Copy';
    btn.style.cssText = `
      background: #f1f1f1;
      border: 1px solid #ccc;
      border-radius: 4px;
      padding: 2px 6px;
      font-size: 11px;
      cursor: pointer;
    `;
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const ok = await copyToClipboard(text);
      if (!btn.isConnected) return;
      const original = btn.textContent;
      btn.textContent = ok ? 'Copied' : 'Copy failed';
      setTimeout(() => {
        if (btn.isConnected) btn.textContent = original;
      }, 1200);
    });
    return btn;
  };
  const createLinkEntry = (item) => {
    const entry = document.createElement('div');
    entry.style.marginBottom = '8px';
    const row = document.createElement('div');
    row.style.cssText = 'display: flex; align-items: center; gap: 6px;';
    const actionBtn = createActionButton(truncateText(item.display, 60));
    actionBtn.title = item.display;
    actionBtn.addEventListener('click', () => {
      if (item.targetUrl) {
        window.location.href = item.targetUrl;
      }
    });
    const status = document.createElement('span');
    status.textContent = '...';
    status.style.cssText = 'font-size: 11px; color: #666; min-width: 36px; text-align: right;';
    const previewBtn = document.createElement('button');
    previewBtn.type = 'button';
    previewBtn.textContent = 'Preview';
    previewBtn.disabled = true;
    previewBtn.style.cssText = `
      background: #f1f1f1;
      border: 1px solid #ccc;
      border-radius: 4px;
      padding: 2px 6px;
      font-size: 11px;
      cursor: pointer;
    `;
    previewBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const workingUrl = previewBtn.dataset.workingUrl || item.normalizedUrl;
      const isHttps = previewBtn.dataset.isHttps === 'true';
      showLocationLinkPreview(workingUrl, isHttps);
    });
    row.appendChild(actionBtn);
    row.appendChild(status);
    row.appendChild(previewBtn);
    entry.appendChild(row);
    if (item.sourceLabel) {
      entry.appendChild(createMeta(item.sourceLabel));
    }
    checkLocationUrlStatus(item.normalizedUrl).then(result => {
      if (!status.isConnected) return;
      const statusValue = result?.status || 'unknown';
      if (statusValue === 'valid') {
        status.textContent = 'OK';
        status.style.color = '#2e7d32';
        previewBtn.disabled = false;
        previewBtn.style.background = '#fff';
      } else if (statusValue === 'broken') {
        status.textContent = 'BAD';
        status.style.color = '#c62828';
      } else if (statusValue === 'invalid') {
        status.textContent = 'INVALID';
        status.style.color = '#666';
      } else {
        status.textContent = '??';
        status.style.color = '#666';
      }
      previewBtn.dataset.workingUrl = result?.workingUrl || item.normalizedUrl;
      previewBtn.dataset.isHttps = result?.isHttps ? 'true' : 'false';
    });
    return entry;
  };
  const createEmailEntry = (item) => {
    const entry = document.createElement('div');
    entry.style.marginBottom = '8px';
    const row = document.createElement('div');
    row.style.cssText = 'display: flex; align-items: center; gap: 6px;';
    const actionBtn = createActionButton(truncateText(item.display, 60));
    actionBtn.title = item.display;
    actionBtn.addEventListener('click', () => {
      if (item.targetUrl) {
        if (/\/team\/location\//i.test(item.targetUrl)) {
          window.location.href = item.targetUrl;
        } else {
          window.open(item.targetUrl, '_blank');
        }
      }
    });
    row.appendChild(actionBtn);
    row.appendChild(createCopyButton(item.display));
    entry.appendChild(row);
    if (item.sourceLabel) {
      entry.appendChild(createMeta(item.sourceLabel));
    }
    return entry;
  };
  const createPhoneEntry = (item) => {
    const entry = document.createElement('div');
    entry.style.marginBottom = '8px';
    const row = document.createElement('div');
    row.style.cssText = 'display: flex; align-items: center; gap: 6px;';
    const actionBtn = createActionButton(truncateText(item.display, 60));
    actionBtn.title = item.display;
    actionBtn.addEventListener('click', () => {
      if (item.targetUrl) {
        window.location.href = item.targetUrl;
      }
    });
    row.appendChild(actionBtn);
    row.appendChild(createCopyButton(item.display));
    entry.appendChild(row);
    if (item.sourceLabel) {
      entry.appendChild(createMeta(item.sourceLabel));
    }
    return entry;
  };
  appendSection('Links', linkItems, createLinkEntry);
  appendSection('Emails', emailItems, createEmailEntry);
  appendSection('Phones', phoneItems, createPhoneEntry);
  container.appendChild(toggle);
  container.appendChild(panel);
  document.body.appendChild(container);
}
async function updateLocationContactOverlay(locationId) {
  const isLocationPath = /^\/team\/location\/[a-f0-9-]{12,36}(?:\/|$)/i.test(location.pathname);
  if (!isLocationPath || !locationId) {
    removeLocationContactOverlay();
    return;
  }
  const requestId = ++locationContactRequestId;
  try {
    const { data: locationData, fromCache } = await fetchFullLocationRecord(locationId, { refresh: false });
    if (requestId !== locationContactRequestId) return;
    if (!locationData) {
      removeLocationContactOverlay();
      return;
    }
    renderLocationContactOverlay(locationId, locationData);
    if (fromCache) {
      fetchFullLocationRecord(locationId, { refresh: true })
        .then(({ data: freshData }) => {
          if (!freshData || requestId !== locationContactRequestId) return;
          renderLocationContactOverlay(locationId, freshData);
        })
        .catch(err => {
          console.error('[Location Contact] Background refresh failed', err);
        });
    }
  } catch (err) {
    console.error('[Location Contact] Failed to load overlay', err);
  }
}
/* ==========================================
   Helpers: Google Voice / Gmail link builders
   ========================================== */
function digitsOnly(s){ return (s||"").replace(/\D/g, ""); }
function buildGVUrl(raw){
  // Sanitize input - remove any tel: prefixes that might be present
  const sanitized = String(raw).replace(/^tel:/i, '');
  console.log('[buildGVUrl] Processing:', raw, '-> sanitized:', sanitized); // Debug log
  // More robust extension parsing
  const m = sanitized.match(/^\s*(.+?)(?:\s*(?:[,;]|x|ext\.?|extension|#)\s*(\d+))?\s*$/i);
  let main = m ? m[1] : sanitized;
  const ext = m && m[2] ? m[2] : "";
  console.log('[buildGVUrl] Main part before digits extraction:', main); // Debug log
  let digits = digitsOnly(main);
  console.log('[buildGVUrl] Digits extracted:', digits); // Debug log
  // Use last 10 digits for US numbers; adjust if you need intl routing
  if (digits.length > 10) digits = digits.slice(-10);
  if (digits.length !== 10) {
    console.log('[buildGVUrl] Invalid digit count:', digits.length); // Debug log
    return null;
  }
  const extSuffix = ext ? `,${ext}` : "";
  const result = `https://voice.google.com/u/0/calls?a=nc,%2B1${digits}${extSuffix}`;
  console.log('[buildGVUrl] Generated URL:', result); // Debug log
  return result;
}
function buildGmailUrl(email){
  return `https://mail.google.com/mail/?view=cm&to=${encodeURIComponent(email.trim())}`;
}
/* =======================================================
   Linkify plain text + rewrite existing tel:/mailto: links
   ======================================================= */
function linkifyPhonesAndEmails(rootDoc){
  const root = rootDoc || document;
  // 1) Rewrite existing <a href="tel:"> and <a href="mailto:">
  root.querySelectorAll('a[href^="tel:"], a[href^="mailto:"]').forEach(a => {
    if (a.closest(`#${LOCATION_CONTACT_CONTAINER_ID}`)) return;
    const href = a.getAttribute('href') || "";
    if (href.startsWith("tel:")) {
      const url = buildGVUrl(href.slice(4));
      if (url) a.setAttribute('href', url);
    } else {
      const email = href.replace(/^mailto:/, "");
      a.setAttribute('href', buildGmailUrl(email));
    }
    a.setAttribute('target', '_blank');
    a.setAttribute('rel', 'noopener noreferrer');
  });
  // 2) Linkify plain text occurrences
  const walker = document.createTreeWalker(
    root.body || root,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode(node){
        if (!node.nodeValue || !/[A-Za-z0-9@]/.test(node.nodeValue)) return NodeFilter.FILTER_REJECT;
        // skip inside these
        if (node.parentElement?.closest(`a,script,style,textarea,select,code,pre,svg,#yp-embed-wrapper,#${LOCATION_CONTACT_CONTAINER_ID}`)) {
          return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      }
    }
  );
  const emailRe = /[\w.+-]+@[\w.-]+\.\w{2,}/g;
  const phoneRe = /(?:(?:\+?1[\s.\-]*)?)\(?\d{3}\)?[\s.\-]*\d{3}[\s.\-]*\d{4}(?:\s*(?:x|ext\.?|extension|#)\s*\d+)?/gi;
  const combo = new RegExp(`${phoneRe.source}|${emailRe.source}`, 'gi');
  const textNodes = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) textNodes.push(n);
  textNodes.forEach(tn => {
    const text = tn.nodeValue;
    let match, last = 0, changed = false;
    const frag = document.createDocumentFragment();
    while ((match = combo.exec(text))) {
      changed = true;
      const part = text.slice(last, match.index);
      if (part) frag.appendChild(document.createTextNode(part));
      const found = match[0];
      const a = document.createElement('a');
      if (found.includes('@')) {
        a.href = buildGmailUrl(found);
      } else {
        const gv = buildGVUrl(found);
        if (!gv) {
          frag.appendChild(document.createTextNode(found));
          last = combo.lastIndex;
          continue;
        }
        a.href = gv;
      }
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.textContent = found.trim();
      frag.appendChild(a);
      last = combo.lastIndex;
    }
    if (!changed) return;
    const tail = text.slice(last);
    if (tail) frag.appendChild(document.createTextNode(tail));
    tn.parentNode.replaceChild(frag, tn);
  });
}
// Re-run linkification on DOM changes (SPA-friendly)
function installLinkObservers(){
  if (window.top !== window.self) return;
  linkifyPhonesAndEmails(document);
  const mo = new MutationObserver(() => linkifyPhonesAndEmails(document));
  mo.observe(document.body, { childList: true, subtree: true });
}
/* =====================================
   YourPeer embed create/remount function
   ===================================== */
function createYourPeerEmbedWindow(slug, services, onClose = () => {}, positionOverride = null) {
  if (!slug) return;
  const wrapperId = "yp-embed-wrapper";
  const existing = document.getElementById(wrapperId);
  let pos = positionOverride || getCurrentYPPos(existing) || getSavedYPPos();
  existing?.remove();
  const defaultTop = 120;
  const defaultLeft = 360;
  const top = Number.isFinite(pos?.top) ? pos.top : defaultTop;
  const left = Number.isFinite(pos?.left) ? pos.left : defaultLeft;
  // Prefer a service hash if current URL has /services/<id>..., else first service
  const serviceIdFromUrl = getServiceIdFromPath();
  const hash = pickServiceHash(services, serviceIdFromUrl);
  const wrapper = document.createElement("div");
  wrapper.id = wrapperId;
  wrapper.dataset.slug = slug;
  wrapper.dataset.hash = hash || ""; // used by remount
  Object.assign(wrapper.style, {
    position: "fixed",
    top: `${top}px`,
    left: `${left}px`,
    width: "400px",
    height: "500px",
    background: "#fff",
    border: "2px solid #000",
    borderRadius: "8px",
    boxShadow: "0 2px 6px rgba(0,0,0,0.3)",
    zIndex: 99999,
    overflow: "hidden",
    display: "flex",
    flexDirection: "column"
  });
  // Drag bar
  const dragBar = document.createElement("div");
  Object.assign(dragBar.style, {
    background: "#eee",
    padding: "6px 10px",
    cursor: "grab",
    fontWeight: "bold",
    borderBottom: "1px solid #ccc",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center"
  });
  // Copy link button
  const copyBtn = document.createElement("button");
  copyBtn.textContent = "Copy YP Link";
  Object.assign(copyBtn.style, {
    fontSize: "12px",
    padding: "4px 8px",
    cursor: "pointer",
    backgroundColor: "#f0f0f0",
    border: "1px solid #ccc",
    borderRadius: "4px"
  });
  copyBtn.onclick = () => {
    const url = `https://yourpeer.nyc/locations/${slug}${hash}`;
    navigator.clipboard.writeText(url)
      .then(() => { copyBtn.textContent = "Copied!"; setTimeout(() => { copyBtn.textContent = "Copy YP Link"; }, 1200); })
      .catch(() => { copyBtn.textContent = "Failed to copy"; setTimeout(() => { copyBtn.textContent = "Copy YP Link"; }, 1200); });
  };
  const closeBtn = document.createElement("span");
  closeBtn.innerHTML = "&times;";
  Object.assign(closeBtn.style, { cursor: "pointer", fontSize: "18px", padding: "0 6px" });
  closeBtn.onclick = () => {
    saveYPPos(getCurrentYPPos(wrapper));
    wrapper.remove();
    onClose();
  };
  dragBar.appendChild(copyBtn);
  dragBar.appendChild(closeBtn);
  wrapper.appendChild(dragBar);
  // Iframe
  const iframe = document.createElement("iframe");
  iframe.src = `https://yourpeer.nyc/locations/${slug}${hash}`;
  Object.assign(iframe.style, { border: "none", width: "100%", height: "100%" });
  wrapper.appendChild(iframe);
  document.body.appendChild(wrapper);
  // Drag handling (live save)
  let isDragging = false, offsetX = 0, offsetY = 0;
  dragBar.addEventListener("mousedown", (e) => {
    isDragging = true;
    const rect = wrapper.getBoundingClientRect();
    offsetX = e.clientX - rect.left;
    offsetY = e.clientY - rect.top;
    dragBar.style.cursor = "grabbing";
    e.preventDefault();
  });
  document.addEventListener("mousemove", (e) => {
    if (!isDragging) return;
    const maxX = window.innerWidth - wrapper.offsetWidth;
    const maxY = window.innerHeight - wrapper.offsetHeight;
    const newX = Math.min(Math.max(0, e.clientX - offsetX), maxX);
    const newY = Math.min(Math.max(0, e.clientY - offsetY), maxY);
    wrapper.style.left = `${newX}px`;
    wrapper.style.top = `${newY}px`;
    saveYPPos({ left: newX, top: newY });
  });
  document.addEventListener("mouseup", () => {
    isDragging = false;
    dragBar.style.cursor = "grab";
  });
  // Remount after OK / DONE EDITING (fix setTimeout)
  document.addEventListener("click", (e) => {
    const btn = e.target.closest("button.Button-primary");
    if (!btn) return;
    const txt = (btn.textContent || "").trim().toUpperCase();
    if (txt === "OK" || txt === "DONE EDITING") {
      setTimeout(() => remountYourPeerEmbed(), 1000);
    }
  });
}
// Use the stored slug/hash to refresh the iframe src
function remountYourPeerEmbed() {
  const wrapper = document.getElementById("yp-embed-wrapper");
  if (!wrapper) return;
  const slug = wrapper.dataset.slug || "";
  const hash = wrapper.dataset.hash || "";
  const iframe = wrapper.querySelector("iframe");
  if (!iframe || !slug) return;
  const url = `https://yourpeer.nyc/locations/${slug}${hash}`;
  // Force refresh even if same URL
  iframe.src = url;
}
/* Kick off linkifying for host page */
installLinkObservers();
// --- Recreate (preserving coords) ---
function recreateYourPeerEmbed(slug, services = []) {
  // Prefer current live coords if window exists; else saved; else defaults inside create
  const existing = document.getElementById("yp-embed-wrapper");
  const pos = getCurrentYPPos(existing) || getSavedYPPos() || null;
  createYourPeerEmbedWindow(slug, services, () => {}, pos);
}
// Example
document.addEventListener("DOMContentLoaded", function() {
  const signInHeader = document.querySelector('.sign-in-header');
  if (signInHeader) {
    const noteOverlay = document.getElementById('gg-note-overlay');
    const noteWrapper = document.getElementById('gg-note-wrapper');
    if (noteOverlay) {
      noteOverlay.style.display = 'none';  
    }
    if (noteWrapper) {
      noteWrapper.style.display = 'none';  
    }
  }
});
function addMicrophoneButton() {
  const reminderNote = document.getElementById("reminder-note");
  if (!reminderNote) {
    console.warn("🎤 reminder-note element not found.");
    return null;  
  }
  const micButton = document.createElement("button");
  micButton.id = "mic-button";
  micButton.style.marginLeft = "10px";
  micButton.style.padding = "10px";
  micButton.style.background = "#fff";
  micButton.style.border = "2px solid #000";
  micButton.style.borderRadius = "50%";
  micButton.style.cursor = "pointer";
  micButton.innerHTML = "🎤";
  reminderNote.parentElement.appendChild(micButton);
  return micButton;
}
let recognition;
let isRecognizing = false;
function initializeSpeechRecognition() {
  if (!('webkitSpeechRecognition' in window)) {
    alert("Speech recognition is not supported by this browser.");
    return;
  }
  recognition = new webkitSpeechRecognition(); 
  recognition.continuous = true; 
  recognition.interimResults = true; 
  recognition.lang = "en-US"; 
  recognition.maxAlternatives = 1; 
  recognition.onstart = () => {
    isRecognizing = true;
    console.log("Speech recognition started.");
  };
  recognition.onend = () => {
    isRecognizing = false;
    console.log("Speech recognition ended.");
  };
  recognition.onerror = (event) => {
    console.error("Speech recognition error:", event.error);
  };
  recognition.onresult = (event) => {
    let transcript = "";
    for (let i = event.resultIndex; i < event.results.length; i++) {
      transcript += event.results[i][0].transcript;
    }
    const reminderNote = document.getElementById("reminder-note");
    reminderNote.value = transcript; 
  };
}
function attachMicButtonHandler() {
  const micButton = addMicrophoneButton(); 
  if (!micButton) {
    console.warn("Mic button could not be added to the reminder modal.");
    return;
  }
  if (!recognition) {
    console.warn("Speech recognition not initialized. Mic button will not work.");
    return;
  }
  micButton.addEventListener('click', () => {
    const reminderNoteTextarea = document.getElementById("reminder-note");
    if (!reminderNoteTextarea) {
        console.error("reminder-note textarea not found on mic click!");
        return;
    }
    if (isRecognizing) {
      recognition.stop();
      micButton.innerHTML = "Mic"; 
    } else {
      recognition.onresult = (event) => {
        let transcript = "";
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            transcript += event.results[i][0].transcript;
          }
        }
        reminderNoteTextarea.value += (reminderNoteTextarea.value.length > 0 ? " " : "") + transcript;
      };
      recognition.onstart = () => {
        isRecognizing = true;
        micButton.innerHTML = "🛑"; 
        console.log("Reminder speech recognition started.");
      };
      recognition.onend = () => {
        isRecognizing = false;
        micButton.innerHTML = "🎤"; 
        console.log("Reminder speech recognition ended.");
      };
      recognition.onerror = (event) => {
        console.error("Reminder speech recognition error:", event.error);
        if(isRecognizing) {
            isRecognizing = false;
            micButton.innerHTML = "🎤";
        }
      };
      try {
        recognition.start();
      } catch (e) {
        console.error("Error starting recognition:", e);
        alert("Could not start microphone. Please check permissions and try again.");
      }
    }
  });
}
document.addEventListener("DOMContentLoaded", () => {
  initializeSpeechRecognition(); 
});
function isTaxonomyBannerActive(locationId, serviceId) {
  const key = buildTaxonomyBannerKey(locationId, serviceId);
  if (!key) return false;
  if (key !== activeTaxonomyBannerKey) return false;
  return !!document.querySelector('[data-gghost-service-taxonomy]');
}
