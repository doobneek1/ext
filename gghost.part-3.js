// GGHOST_PART_MARKER: gghost.part-3.js
window.__GGHOST_PARTS_LOADED__ = window.__GGHOST_PARTS_LOADED__ || [];
window.__GGHOST_PARTS_LOADED__.push('gghost.part-3.js');
console.log('[gghost] loaded gghost.part-3.js');
function createServiceHoverPanel(services, locationId, currentServiceId = null) {
  const panel = document.createElement('div');
  const navDelayMs = 500;
  const servicePageMatch = location.pathname.match(/^\/team\/location\/([a-f0-9-]{12,36})\/services\/([a-f0-9-]{12,36})(?:\/(.*))?$/i);
  const currentServicePage = servicePageMatch ? {
    locationId: servicePageMatch[1],
    serviceId: servicePageMatch[2],
    field: servicePageMatch[3] || ''
  } : null;
  const normalizeServiceSuffix = (value) => String(value || '').replace(/^\/+|\/+$/g, '').toLowerCase();
  const isServicePageForService = (serviceId) => {
    if (!currentServicePage) return false;
    if (!locationId || !serviceId) return false;
    return normalizeId(currentServicePage.locationId) === normalizeId(locationId)
      && normalizeId(currentServicePage.serviceId) === normalizeId(serviceId);
  };
  const isServiceEntryHidden = (serviceId, urlSuffix) => {
    if (!isServicePageForService(serviceId)) return false;
    const pageSuffix = normalizeServiceSuffix(currentServicePage.field);
    const entrySuffix = normalizeServiceSuffix(urlSuffix);
    if (!pageSuffix || !entrySuffix) return false;
    return pageSuffix === entrySuffix || pageSuffix.startsWith(`${entrySuffix}/`);
  };
  let activeEdit = null;
  const commitActiveEdit = () => {
    if (!activeEdit || typeof activeEdit.commit !== 'function') {
      return Promise.resolve();
    }
    const edit = activeEdit;
    activeEdit = null;
    return Promise.resolve(edit.commit());
  };
  panel.__gghostCommitActiveEdit = commitActiveEdit;
  panel.setAttribute('data-gghost-service-quick-panel', 'true');
  Object.assign(panel.style, {
    position: 'absolute',
    top: 'calc(100% + 6px)',
    left: '0',
    width: '280px',
    minWidth: '260px',
    maxWidth: '320px',
    background: '#fff',
    border: '1px solid #d4c79a',
    borderRadius: '8px',
    boxShadow: '0 8px 16px rgba(0, 0, 0, 0.18)',
    padding: '6px',
    maxHeight: '240px',
    overflowY: 'auto',
    opacity: '0',
    pointerEvents: 'none',
    transform: 'translateY(6px)',
    transition: 'opacity 0.15s ease, transform 0.15s ease',
    zIndex: '10000',
    backgroundClip: 'padding-box'
  });
  const svcList = Array.isArray(services) ? services : [];
  const TAXONOMY_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const isValidTaxonomyId = (value) => TAXONOMY_ID_RE.test(String(value || ''));
  const formatEntryText = (entry) => {
    const value = entry.value || entry.emptyLabel || 'Missing';
    return `${entry.label}: ${value}`;
  };
  const applyEntryPalette = (node, palette, withBorder = false) => {
    node.style.background = palette.background;
    node.style.color = palette.color;
    if (withBorder) {
      node.style.border = `1px solid ${palette.border}`;
    }
  };
  const attachCommitOnFocusOut = (node, commit, boundary = node) => {
    let lastPointerDownAt = 0;
    let lastPointerDownTarget = null;
    boundary.addEventListener('pointerdown', (event) => {
      lastPointerDownAt = Date.now();
      lastPointerDownTarget = event.target;
    }, true);
    node.addEventListener('focusout', (event) => {
      const fallbackFocus = event?.target;
      setTimeout(() => {
        const activeEl = document.activeElement;
        const recentPointerInside = lastPointerDownTarget
          && boundary.contains(lastPointerDownTarget)
          && (Date.now() - lastPointerDownAt < 250);
        if (boundary.contains(activeEl) || recentPointerInside) {
          if (recentPointerInside && fallbackFocus && typeof fallbackFocus.focus === 'function') {
            fallbackFocus.focus();
          }
          return;
        }
        commit();
      }, 0);
    });
  };
  let redirectEnabled = false;
  const redirectHandlers = [];
  const extrasWrap = document.createElement('div');
  Object.assign(extrasWrap.style, {
    marginTop: '6px',
    paddingTop: '6px',
    borderTop: '1px solid #efe7c8',
    display: 'flex',
    flexDirection: 'column',
    gap: '6px'
  });
  const setRedirectEnabled = (enabled) => {
    redirectEnabled = !!enabled;
    redirectHandlers.forEach(handler => handler(redirectEnabled));
  };
  const createServiceFromStash = async (item, nameOverride = null) => {
    if (!locationId) {
      window.alert('Missing location id for service creation.');
      return;
    }
    const fallbackTaxonomyId = localStorage.getItem(SERVICE_CREATE_TAXONOMY_KEY);
    let taxonomyId = item?.taxonomyId || fallbackTaxonomyId;
    if (!taxonomyId || !isValidTaxonomyId(taxonomyId)) {
      if (fallbackTaxonomyId && fallbackTaxonomyId === taxonomyId) {
        localStorage.removeItem(SERVICE_CREATE_TAXONOMY_KEY);
      }
      window.alert('Select a taxonomy with a valid ID before creating a service.');
      return;
    }
    const name = String(nameOverride || item?.name || 'New service').trim() || 'New service';
    const payload = { locationId, taxonomyId, name };
    ['description', 'url', 'email', 'additional_info', 'fees', 'interpretation_services'].forEach((key) => {
      const value = item?.[key];
      if (value != null && value !== '') payload[key] = value;
    });
    try {
      const created = await createServiceRecord(payload);
      const newId = created?.id;
      if (newId) {
        localStorage.setItem('gghost-taxonomy-overlay-active', 'true');
        window.location.href = buildServiceUrl(locationId, newId);
      }
    } catch (err) {
      console.warn('[Service Taxonomy] Failed to create service', err);
      window.alert('Failed to create service. Please try again.');
    }
  };
  const buildSectionTitle = (text) => {
    const title = document.createElement('div');
    title.textContent = text;
    Object.assign(title.style, {
      fontSize: '11px',
      fontWeight: '600',
      color: '#6b5200'
    });
    return title;
  };
  const submitLocationUpdate = async (targetLocationId, payload) => {
    if (!targetLocationId) throw new Error('Missing location id.');
    const url = `${LOCATION_API_BASE}/${targetLocationId}`;
    const tokens = (() => {
      const { accessToken, idToken } = getCognitoTokens();
      const list = [];
      if (idToken) list.push(idToken);
      if (accessToken && accessToken !== idToken) list.push(accessToken);
      if (!list.length) list.push(null);
      return list;
    })();
    const attemptRequest = async (token) => {
      const headers = {
        accept: 'application/json, text/plain, */*',
        'Content-Type': 'application/json'
      };
      if (token) headers.Authorization = token;
      const options = {
        method: 'PATCH',
        headers,
        body: JSON.stringify(payload),
        mode: 'cors',
        credentials: 'omit'
      };
      const backgroundRes = typeof fetchViaBackground === 'function'
        ? await fetchViaBackground(url, options)
        : null;
      if (backgroundRes) return backgroundRes;
      return fetch(url, options);
    };
    let res = null;
    for (const token of tokens) {
      res = await attemptRequest(token);
      if (res.ok) break;
      if (res.status !== 401 && res.status !== 403) break;
    }
    if (!res) throw new Error('Location update failed: no response');
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Failed to update location: HTTP ${res.status} ${text}`);
    }
    return res.json().catch(() => null);
  };
  const resolveLocationRoot = (data) => {
    if (!data || typeof data !== 'object') return null;
    if (data.Location && typeof data.Location === 'object') return data.Location;
    if (data.location && typeof data.location === 'object') return data.location;
    return data;
  };
  const buildLocationRevalidatePayload = (data) => {
    const root = resolveLocationRoot(data);
    if (!root) return {};
    const payload = {};
    const baseName = root?.name ?? root?.location_name ?? root?.locationName ?? null;
    if (typeof baseName === 'string') {
      payload.name = baseName.trim();
    }
    const description = root?.description;
    if (typeof description === 'string') {
      payload.description = description.trim();
    }
    const additionalInfo = root?.additionalInfo ?? root?.additional_info;
    if (typeof additionalInfo === 'string') {
      payload.additionalInfo = additionalInfo.trim();
    }
    const orgId = root?.organizationId
      || root?.organization_id
      || root?.Organization?.id
      || root?.organization?.id
      || data?.Organization?.id
      || data?.organization?.id;
    if (typeof orgId === 'string' && orgId.trim()) {
      payload.organizationId = orgId.trim();
    }
    const streetviewUrl = root?.streetview_url || root?.streetViewUrl || root?.street_view_url;
    if (typeof streetviewUrl === 'string' && streetviewUrl.trim()) {
      payload.streetview_url = streetviewUrl.trim();
    }
    const rawAddress = root?.address
      || root?.Address
      || (Array.isArray(root?.PhysicalAddresses) ? root.PhysicalAddresses[0] : null)
      || (Array.isArray(data?.PhysicalAddresses) ? data.PhysicalAddresses[0] : null);
    if (rawAddress && typeof rawAddress === 'object') {
      const addressPayload = {};
      const street = rawAddress.street || rawAddress.address_1 || rawAddress.address1 || rawAddress.address;
      const city = rawAddress.city;
      const state = rawAddress.state || rawAddress.state_province || rawAddress.region;
      const postalCode = rawAddress.postalCode || rawAddress.postal_code || rawAddress.zip || rawAddress.postal;
      const country = rawAddress.country || rawAddress.country_code;
      const region = rawAddress.region;
      if (street) addressPayload.street = String(street).trim();
      if (city) addressPayload.city = String(city).trim();
      if (state) addressPayload.state = String(state).trim();
      if (postalCode) addressPayload.postalCode = String(postalCode).trim();
      if (country) addressPayload.country = String(country).trim();
      if (region && !addressPayload.state) addressPayload.region = String(region).trim();
      if (Object.keys(addressPayload).length) {
        payload.address = addressPayload;
      }
    }
    const coords = Array.isArray(root?.position?.coordinates)
      ? root.position.coordinates
      : (Array.isArray(data?.position?.coordinates) ? data.position.coordinates : null);
    let lat = null;
    let lng = null;
    if (coords && coords.length >= 2) {
      const parsedLng = Number(coords[0]);
      const parsedLat = Number(coords[1]);
      if (Number.isFinite(parsedLat) && Number.isFinite(parsedLng)) {
        lat = parsedLat;
        lng = parsedLng;
      }
    }
    if (lat == null || lng == null) {
      const parsedLat = Number(root?.latitude ?? root?.lat ?? data?.latitude ?? data?.lat);
      const parsedLng = Number(root?.longitude ?? root?.lng ?? data?.longitude ?? data?.lng);
      if (Number.isFinite(parsedLat) && Number.isFinite(parsedLng)) {
        lat = parsedLat;
        lng = parsedLng;
      }
    }
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      payload.latitude = lat;
      payload.longitude = lng;
      payload.position = { type: 'Point', coordinates: [lng, lat] };
    }
    return payload;
  };
  const buildOrganizationRevalidatePayload = (data) => {
    const root = resolveLocationRoot(data);
    if (!root) return null;
    const org = root?.Organization || root?.organization || data?.Organization || data?.organization;
    if (!org || typeof org !== 'object') return null;
    const payload = {};
    if (typeof org.name === 'string') payload.name = org.name.trim();
    if (typeof org.description === 'string') payload.description = org.description.trim();
    if (typeof org.url === 'string') payload.url = org.url.trim();
    if ('email' in org) payload.email = org.email ?? null;
    const orgId = org.id
      || root?.organizationId
      || root?.organization_id
      || data?.organizationId
      || data?.organization_id;
    if (!orgId || typeof orgId !== 'string') return null;
    if (!Object.keys(payload).length) return null;
    return { orgId, payload };
  };
  const buildPhoneRevalidatePayloads = (data) => {
    const root = resolveLocationRoot(data);
    const candidates = []
      .concat(Array.isArray(root?.Phones) ? root.Phones : [])
      .concat(Array.isArray(root?.phones) ? root.phones : [])
      .concat(Array.isArray(data?.Phones) ? data.Phones : [])
      .concat(Array.isArray(data?.phones) ? data.phones : []);
    const seen = new Set();
    return candidates.reduce((acc, phone) => {
      if (!phone || typeof phone !== 'object') return acc;
      const phoneId = phone.id || phone.phoneId || phone.phone_id;
      if (!phoneId || seen.has(phoneId)) return acc;
      const payload = {};
      if (typeof phone.number === 'string' && phone.number.trim()) {
        payload.number = phone.number.trim();
      }
      if ('extension' in phone) payload.extension = phone.extension ?? null;
      if (typeof phone.type === 'string') payload.type = phone.type.trim();
      if (typeof phone.language === 'string') payload.language = phone.language.trim();
      if (typeof phone.description === 'string') payload.description = phone.description.trim();
      if (!Object.keys(payload).length) return acc;
      seen.add(phoneId);
      acc.push({ id: phoneId, payload });
      return acc;
    }, []);
  };
  const getRevalidateTokens = () => {
    if (typeof getCognitoTokens !== 'function') return [null];
    const { accessToken, idToken } = getCognitoTokens();
    const list = [];
    if (idToken) list.push(idToken);
    if (accessToken && accessToken !== idToken) list.push(accessToken);
    if (!list.length) list.push(null);
    return list;
  };
  const getServicePayloadLabel = (payload) => {
    if (!payload || typeof payload !== 'object') return 'unknown';
    if (payload.description != null) return 'description';
    if (payload.eventRelatedInfo != null) return 'other-info';
    if (payload.documents != null) return 'required-docs';
    if (payload.whoDoesItServe != null) return 'age';
    if (payload.irregularHours != null) return 'hours';
    return 'base';
  };
  const patchWithDebug = async (url, payload, label, debugEnabled) => {
    const tokens = getRevalidateTokens();
    const fetcher = typeof fetchViaBackground === 'function' ? fetchViaBackground : fetch;
    let status = 0;
    let responseText = '';
    for (const token of tokens) {
      const headers = {
        accept: 'application/json, text/plain, */*',
        'Content-Type': 'application/json'
      };
      if (token) headers.Authorization = token;
      const res = await fetcher(url, {
        method: 'PATCH',
        headers,
        body: JSON.stringify(payload),
        mode: 'cors',
        credentials: 'omit'
      });
      status = res.status;
      responseText = await res.text().catch(() => '');
      if (debugEnabled) {
        console.warn('[Revalidate] PATCH response', {
          label,
          url,
          status,
          response: responseText
        });
      }
      if (res.ok) {
        return { ok: true, status, label, url, responseText };
      }
      if (res.status !== 401 && res.status !== 403) {
        break;
      }
    }
    return { ok: false, status, label, url, responseText };
  };
  const buildServiceRevalidatePayloads = (service) => {
    if (!service || typeof service !== 'object') return [];
    const payloads = [];
    const basePayload = {};
    const baseFields = [
      'name',
      'url',
      'email',
      'fees',
      'application_process',
      'wait_time',
      'interpretation_services',
      'additional_info',
      'status'
    ];
    baseFields.forEach((key) => {
      const value = service[key];
      if (value == null) return;
      const valueType = typeof value;
      if (valueType === 'string') {
        const trimmed = value.trim();
        if (trimmed) basePayload[key] = trimmed;
        return;
      }
      if (valueType === 'number' && Number.isFinite(value)) {
        basePayload[key] = value;
        return;
      }
      if (valueType === 'boolean') {
        basePayload[key] = value;
      }
    });
    if (Object.keys(basePayload).length) {
      payloads.push(basePayload);
    }
    const rawDesc = typeof service.description === 'string' ? service.description.trim() : '';
    if (rawDesc) {
      payloads.push({ description: rawDesc });
    }
    const eventInfos = Array.isArray(service.EventRelatedInfos) ? service.EventRelatedInfos : [];
    const eventInfo = eventInfos.find(info => info?.event === SERVICE_EDIT_OCCASION) || null;
    const eventText = typeof eventInfo?.information === 'string'
      ? eventInfo.information.trim()
      : '';
    if (eventInfo || eventText) {
      payloads.push({
        eventRelatedInfo: {
          event: SERVICE_EDIT_OCCASION,
          information: eventText || null
        }
      });
    }
    const requiredDocs = Array.isArray(service.RequiredDocuments) ? service.RequiredDocuments : [];
    const docNames = requiredDocs
      .map(doc => (doc?.document || '').trim())
      .filter(name => name && name.toLowerCase() !== 'none');
    if (docNames.length) {
      payloads.push({ documents: { proofs: docNames } });
    }
    const eligibilities = Array.isArray(service.Eligibilities) ? service.Eligibilities : [];
    const ageEligibility = eligibilities.find(e => e?.EligibilityParameter?.name?.toLowerCase?.() === 'age');
    const ageValues = Array.isArray(ageEligibility?.eligible_values) ? ageEligibility.eligible_values : [];
    if (ageValues.length) {
      payloads.push({ whoDoesItServe: ageValues });
    }
    const normalizeScheduleDate = (value) => {
      if (value == null) return null;
      if (typeof value === 'number' && Number.isFinite(value)) return value;
      const text = String(value).trim();
      if (!text) return null;
      if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
      const parsed = Date.parse(text);
      if (Number.isNaN(parsed)) return null;
      return parsed;
    };
    const holidaySchedules = Array.isArray(service.HolidaySchedules) ? service.HolidaySchedules : [];
    if (holidaySchedules.length) {
      const payloadRows = holidaySchedules.map(schedule => {
        const weekdayNum = toWeekdayNumber(schedule.weekday);
        if (!weekdayNum) return null;
        const closed = !!schedule.closed;
        const opensAt = toTimeInputValue(schedule.opens_at || schedule.opensAt);
        const closesAt = toTimeInputValue(schedule.closes_at || schedule.closesAt);
        const row = {
          weekday: toWeekdayName(weekdayNum),
          closed,
          occasion: schedule.occasion || SERVICE_EDIT_OCCASION
        };
        if (closed) {
          row.opensAt = null;
          row.closesAt = null;
        } else {
          if (!opensAt || !closesAt) return null;
          row.opensAt = opensAt;
          row.closesAt = closesAt;
        }
        const startDate = normalizeScheduleDate(schedule.start_date || schedule.startDate);
        const endDate = normalizeScheduleDate(schedule.end_date || schedule.endDate);
        if (startDate !== null) row.startDate = startDate;
        if (endDate !== null) row.endDate = endDate;
        return row;
      }).filter(row => row && row.weekday);
      if (payloadRows.length) {
        payloads.push({ irregularHours: payloadRows });
      }
    }
    return payloads;
  };
  const triggerRevalidateCheckbox = () => {
    const checkbox = document.getElementById('revalidate-checkbox');
    if (checkbox && !checkbox.checked) {
      checkbox.click();
      return true;
    }
    return false;
  };
  const buildRevalidateSection = () => {
    const section = document.createElement('div');
    section.appendChild(buildSectionTitle('Revalidate'));
    const row = document.createElement('div');
    Object.assign(row.style, {
      display: 'flex',
      alignItems: 'center',
      gap: '6px'
    });
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = 'Revalidate all';
    Object.assign(button.style, {
      border: '1px solid #d0d0d0',
      background: '#fff',
      borderRadius: '6px',
      height: '24px',
      padding: '0 8px',
      fontSize: '11px',
      cursor: locationId ? 'pointer' : 'not-allowed'
    });
    button.disabled = !locationId;
    const status = document.createElement('div');
    status.textContent = '';
    Object.assign(status.style, {
      fontSize: '10px',
      color: '#666'
    });
    const setStatus = (text, tone = '#666') => {
      status.textContent = text || '';
      status.style.color = tone;
    };
    let running = false;
    button.addEventListener('click', async (evt) => {
      evt.preventDefault();
      evt.stopPropagation();
      if (running) return;
      if (!locationId) {
        setStatus('Missing location id.', '#b42318');
        return;
      }
      if (typeof fetchFullLocationRecord !== 'function') {
        setStatus('Location fetch unavailable.', '#b42318');
        return;
      }
      if (typeof submitServiceUpdate !== 'function') {
        setStatus('Service update unavailable.', '#b42318');
        return;
      }
      const confirmed = window.confirm(
        'Revalidate entire location? This will PATCH all location + service fields.'
      );
      if (!confirmed) return;
      running = true;
      button.disabled = true;
      button.textContent = 'Working...';
      setStatus('Fetching location...', '#666');
      try {
        if (typeof fetchFullLocationRecord !== 'function') {
          throw new Error('Location fetch unavailable.');
        }
        const debugRevalidate = (() => {
          if (window?.gghost?.DEBUG_REVALIDATE === true) return true;
          try {
            return localStorage.getItem('gghostRevalidateDebug') === 'true';
          } catch (_err) {
            return false;
          }
        })();
        const result = await fetchFullLocationRecord(locationId, { refresh: true });
        const data = result?.data;
        if (!data) throw new Error('Failed to load location data.');
        const rawServices = data?.Services || data?.services || [];
        const servicesList = typeof normalizeServices === 'function'
          ? normalizeServices(rawServices)
          : (Array.isArray(rawServices) ? rawServices : []);
        const locationPayload = buildLocationRevalidatePayload(data);
        const orgPayloadEntry = buildOrganizationRevalidatePayload(data);
        const phonePayloads = buildPhoneRevalidatePayloads(data);
        setStatus('Patching location + org + services...', '#666');
        const tasks = [];
        const locationUrl = `${LOCATION_API_BASE}/${locationId}`;
        if (locationPayload && Object.keys(locationPayload).length) {
          tasks.push(patchWithDebug(locationUrl, locationPayload, 'location', debugRevalidate));
        }
        if (orgPayloadEntry?.orgId && orgPayloadEntry?.payload) {
          const orgBase = (typeof ORGANIZATION_API_BASE !== 'undefined' && ORGANIZATION_API_BASE)
            ? ORGANIZATION_API_BASE
            : 'https://w6pkliozjh.execute-api.us-east-1.amazonaws.com/prod/organizations';
          const orgUrl = `${orgBase}/${orgPayloadEntry.orgId}`;
          tasks.push(patchWithDebug(orgUrl, orgPayloadEntry.payload, 'organization', debugRevalidate));
        }
        const phoneBase = (typeof PHONE_API_BASE !== 'undefined' && PHONE_API_BASE)
          ? PHONE_API_BASE
          : 'https://w6pkliozjh.execute-api.us-east-1.amazonaws.com/prod/phones';
        phonePayloads.forEach((phoneEntry) => {
          const phoneUrl = `${phoneBase}/${phoneEntry.id}`;
          tasks.push(patchWithDebug(phoneUrl, phoneEntry.payload, `phone:${phoneEntry.id}`, debugRevalidate));
        });
        servicesList.forEach((service) => {
          if (!service?.id) return;
          const payloads = buildServiceRevalidatePayloads(service);
          payloads.forEach((payload) => {
            const label = `service:${service.id}:${getServicePayloadLabel(payload)}`;
            const serviceUrl = `${SERVICE_API_BASE}/${service.id}`;
            tasks.push(patchWithDebug(serviceUrl, payload, label, debugRevalidate));
          });
        });
        const results = await Promise.all(tasks);
        const failures = results.filter(r => !r.ok);
        if (failures.length) {
          console.warn('[Revalidate] Failures', failures);
          setStatus(`Done with ${failures.length} failures. See console.`, '#b26a00');
        } else {
          setStatus('Revalidated.', '#2e7d32');
          triggerRevalidateCheckbox();
        }
      } catch (err) {
        setStatus(err?.message || 'Revalidate failed.', '#b42318');
      } finally {
        running = false;
        button.disabled = !locationId;
        button.textContent = 'Revalidate all';
      }
    });
    row.appendChild(button);
    section.appendChild(row);
    section.appendChild(status);
    return section;
  };
  const buildCreateServiceSection = () => {
    const section = document.createElement('div');
    section.appendChild(buildSectionTitle('Create service'));
    const row = document.createElement('div');
    Object.assign(row.style, { display: 'flex', gap: '4px', alignItems: 'center' });
    const options = getTaxonomyOptionsFromServices(svcList)
      .filter(option => isValidTaxonomyId(option?.id));
    const select = document.createElement('select');
    Object.assign(select.style, {
      flex: '1 1 auto',
      fontSize: '11px',
      padding: '3px 4px',
      borderRadius: '4px',
      border: '1px solid #d9d9d9',
      background: '#fff'
    });
    if (!options.length) {
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = 'No taxonomies';
      select.appendChild(opt);
      select.disabled = true;
    } else {
      options.forEach(option => {
        const opt = document.createElement('option');
        opt.value = option.id;
        opt.textContent = option.label;
        select.appendChild(opt);
      });
      const stored = localStorage.getItem(SERVICE_CREATE_TAXONOMY_KEY);
      if (stored && options.some(option => option.id === stored)) {
        select.value = stored;
      }
      select.addEventListener('change', () => {
        localStorage.setItem(SERVICE_CREATE_TAXONOMY_KEY, select.value);
      });
    }
    const saveDraftBtn = document.createElement('button');
    saveDraftBtn.type = 'button';
    saveDraftBtn.textContent = 'save';
    saveDraftBtn.title = 'Save draft';
    Object.assign(saveDraftBtn.style, {
      border: '1px solid #d0d0d0',
      background: '#fff',
      borderRadius: '4px',
      minWidth: '34px',
      height: '22px',
      lineHeight: '18px',
      fontSize: '10px',
      color: '#1f5f9b',
      cursor: options.length ? 'pointer' : 'not-allowed'
    });
    saveDraftBtn.disabled = !options.length;
    saveDraftBtn.addEventListener('click', (evt) => {
      evt.stopPropagation();
      if (!options.length) return;
      const taxonomyId = select.value;
      const taxonomyLabel = select.options[select.selectedIndex]?.textContent || '';
      const stashItem = {
        stashId: typeof uuidv === 'function' ? uuidv() : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        taxonomyId,
        taxonomyLabel: taxonomyLabel || null,
        name: 'New service',
        createdAt: new Date().toISOString()
      };
      upsertServiceStashItem(SERVICE_STASH_SAVED_KEY, stashItem);
      refreshExtras();
    });
    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.textContent = '+';
    Object.assign(addBtn.style, {
      border: '1px solid #d0d0d0',
      background: '#fff',
      borderRadius: '4px',
      width: '24px',
      height: '22px',
      lineHeight: '18px',
      cursor: locationId && options.length ? 'pointer' : 'not-allowed'
    });
    addBtn.disabled = !locationId || !options.length;
    addBtn.addEventListener('click', async (evt) => {
      evt.stopPropagation();
      if (!locationId) return;
      if (!options.length) return;
      addBtn.disabled = true;
      addBtn.textContent = '...';
      const taxonomyId = select.value;
      localStorage.setItem(SERVICE_CREATE_TAXONOMY_KEY, taxonomyId);
      try {
        await createServiceFromStash({ taxonomyId, name: 'New service' });
      } finally {
        addBtn.disabled = false;
        addBtn.textContent = '+';
      }
    });
    row.appendChild(select);
    row.appendChild(saveDraftBtn);
    row.appendChild(addBtn);
    section.appendChild(row);
    return section;
  };
  const buildServiceStashSection = (title, key, { allowEdit = false, showSave = false } = {}) => {
    const stash = readServiceStash(key);
    if (!stash.length) return null;
    const section = document.createElement('div');
    section.appendChild(buildSectionTitle(title));
    const list = document.createElement('div');
    Object.assign(list.style, { display: 'flex', flexDirection: 'column', gap: '4px' });
    const expandOnly = key === SERVICE_STASH_SAVED_KEY;
    const buildDetailRow = (label, value) => {
      const row = document.createElement('div');
      row.textContent = `${label}: ${value}`;
      Object.assign(row.style, {
        fontSize: '10px',
        color: '#6b5a2b',
        lineHeight: '1.2',
        wordBreak: 'break-word',
        overflowWrap: 'anywhere'
      });
      return row;
    };
    stash.forEach(item => {
      const row = document.createElement('div');
      Object.assign(row.style, { display: 'flex', alignItems: 'center', gap: '4px' });
      let details = null;
      const toggleDetails = () => {
        if (!details) {
          details = document.createElement('div');
          Object.assign(details.style, {
            display: 'flex',
            flexDirection: 'column',
            gap: '2px',
            padding: '4px 6px',
            marginTop: '2px',
            border: '1px dashed #e6ddb4',
            borderRadius: '6px',
            background: '#fffdf6'
          });
          const pairs = [
            ['Name', item?.name],
            ['Taxonomy', item?.taxonomyLabel],
            ['Taxonomy ID', item?.taxonomyId],
            ['Description', item?.description],
            ['URL', item?.url],
            ['Email', item?.email],
            ['Additional info', item?.additional_info],
            ['Fees', item?.fees],
            ['Interpretation', item?.interpretation_services],
            ['Created', item?.createdAt]
          ];
          pairs.forEach(([label, value]) => {
            if (!value) return;
            details.appendChild(buildDetailRow(label, value));
          });
          if (!details.children.length) {
            details.appendChild(buildDetailRow('Details', 'No saved details.'));
          }
          list.insertBefore(details, row.nextSibling);
        } else {
          details.style.display = details.style.display === 'none' ? 'flex' : 'none';
        }
      };
      const label = item?.taxonomyLabel
        ? `${item.name} (${item.taxonomyLabel})`
        : item?.name || 'Saved service';
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = label;
      Object.assign(btn.style, {
        flex: '1 1 auto',
        border: '1px solid #d9d9d9',
        background: '#fff',
        borderRadius: '6px',
        padding: '3px 6px',
        fontSize: '11px',
        textAlign: 'left',
        lineHeight: '1.2',
        whiteSpace: 'normal',
        wordBreak: 'break-word',
        overflowWrap: 'anywhere',
        cursor: locationId ? 'pointer' : 'not-allowed'
      });
      let clickTimer = null;
      btn.addEventListener('click', () => {
        if (!locationId) return;
        if (expandOnly) {
          toggleDetails();
          return;
        }
        if (clickTimer) clearTimeout(clickTimer);
        clickTimer = setTimeout(() => {
          clickTimer = null;
          createServiceFromStash(item);
        }, 220);
      });
      if (allowEdit) {
        btn.addEventListener('dblclick', (evt) => {
          evt.preventDefault();
          evt.stopPropagation();
          if (clickTimer) {
            clearTimeout(clickTimer);
            clickTimer = null;
          }
          const nextName = window.prompt('Edit saved service name', item?.name || '');
          if (nextName == null) return;
          const trimmed = String(nextName).trim();
          if (!trimmed) return;
          item.name = trimmed;
          writeServiceStash(key, stash.map(entry => entry?.stashId === item?.stashId ? item : entry));
          refreshExtras();
        });
      }
      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.textContent = 'x';
      removeBtn.title = 'Remove';
      Object.assign(removeBtn.style, {
        border: '1px solid #d0d0d0',
        background: '#fff',
        color: '#b42318',
        borderRadius: '999px',
        width: '18px',
        height: '18px',
        fontSize: '11px',
        lineHeight: '16px',
        padding: '0',
        cursor: 'pointer'
      });
      removeBtn.addEventListener('click', (evt) => {
        evt.stopPropagation();
        removeServiceStashItem(key, item?.stashId);
        refreshExtras();
      });
      row.appendChild(btn);
      if (showSave) {
        const saveBtn = document.createElement('button');
        saveBtn.type = 'button';
        saveBtn.textContent = 'save';
        saveBtn.title = 'Save';
        Object.assign(saveBtn.style, {
          border: '1px solid #d0d0d0',
          background: '#fff',
          color: '#1f5f9b',
          borderRadius: '10px',
          minWidth: '28px',
          height: '18px',
          fontSize: '9px',
          lineHeight: '16px',
          padding: '0 4px',
          cursor: 'pointer'
        });
        saveBtn.addEventListener('click', (evt) => {
          evt.stopPropagation();
          upsertServiceStashItem(SERVICE_STASH_SAVED_KEY, item);
          refreshExtras();
        });
        row.appendChild(saveBtn);
      }
      row.appendChild(removeBtn);
      list.appendChild(row);
    });
    section.appendChild(list);
    return section;
  };
  const refreshExtras = () => {
    extrasWrap.innerHTML = '';
    extrasWrap.style.display = 'flex';
    const createSection = buildCreateServiceSection();
    extrasWrap.appendChild(createSection);
    const revalidateSection = buildRevalidateSection();
    if (revalidateSection) extrasWrap.appendChild(revalidateSection);
    if (redirectEnabled) {
      const savedSection = buildServiceStashSection('Saved services', SERVICE_STASH_SAVED_KEY, { allowEdit: true });
      if (savedSection) extrasWrap.appendChild(savedSection);
      const deletedSection = buildServiceStashSection('Recently deleted', SERVICE_STASH_DELETED_KEY, { showSave: true });
      if (deletedSection) extrasWrap.appendChild(deletedSection);
    }
  };
  redirectHandlers.push((enabled) => {
    extrasWrap.style.display = 'flex';
    refreshExtras();
  });
  void getRedirectEnabledFlag().then(setRedirectEnabled);
  if (!svcList.length) {
    extrasWrap.style.marginTop = '0';
    extrasWrap.style.paddingTop = '0';
    extrasWrap.style.borderTop = 'none';
    const empty = document.createElement('div');
    empty.textContent = 'No services yet.';
    Object.assign(empty.style, {
      fontSize: '12px',
      color: '#7a6b2b'
    });
    panel.appendChild(empty);
  }
  svcList.forEach((service, idx) => {
    const entries = getServiceQuickEntries(service);
    const row = document.createElement('div');
    Object.assign(row.style, {
      position: 'relative',
      display: 'flex',
      flexDirection: 'column',
      gap: '4px',
      padding: '4px 6px',
      paddingRight: '64px',
      borderBottom: idx === svcList.length - 1 ? 'none' : '1px solid #efe7c8',
      background: '#fff',
      borderRadius: '6px'
    });
    row.addEventListener('mouseenter', () => {
      row.style.background = '#fff9e6';
    });
    row.addEventListener('mouseleave', () => {
      row.style.background = '#fff';
    });
    const headerBtn = document.createElement('button');
    headerBtn.type = 'button';
    headerBtn.textContent = service?.name || 'Unnamed service';
    const isCurrent = currentServiceId && service?.id === currentServiceId;
    Object.assign(headerBtn.style, {
      fontSize: '12px',
      fontWeight: '700',
      color: '#2d2400',
      background: 'transparent',
      border: 'none',
      padding: '0',
      textAlign: 'left',
      cursor: isCurrent ? 'default' : 'pointer',
      opacity: isCurrent ? '0.7' : '1',
      whiteSpace: 'normal',
      wordBreak: 'break-word',
      overflowWrap: 'anywhere'
    });
    headerBtn.disabled = !!isCurrent;
    if (!isCurrent) {
      headerBtn.addEventListener('click', (evt) => {
        evt.stopPropagation();
        if (!locationId || !service?.id) return;
        localStorage.setItem('gghost-taxonomy-overlay-active', 'true');
        window.location.href = buildServiceUrl(locationId, service.id);
      });
    }
    row.appendChild(headerBtn);
    const actionWrap = document.createElement('div');
    Object.assign(actionWrap.style, {
      position: 'absolute',
      top: '4px',
      right: '6px',
      display: 'flex',
      alignItems: 'center',
      gap: '4px',
      zIndex: '1'
    });
    const saveBtn = document.createElement('button');
    saveBtn.type = 'button';
    saveBtn.textContent = 'save';
    saveBtn.title = 'Save service';
    Object.assign(saveBtn.style, {
      border: '1px solid #d0d0d0',
      background: '#fff',
      color: '#1f5f9b',
      borderRadius: '10px',
      minWidth: '28px',
      height: '18px',
      fontSize: '9px',
      lineHeight: '16px',
      padding: '0 4px',
      cursor: service?.id ? 'pointer' : 'not-allowed'
    });
    saveBtn.style.display = 'none';
    if (!service?.id) {
      saveBtn.disabled = true;
    } else {
      saveBtn.addEventListener('click', (evt) => {
        evt.stopPropagation();
        evt.preventDefault();
        const stashItem = buildServiceStashItem(service);
        if (!stashItem) return;
        upsertServiceStashItem(SERVICE_STASH_SAVED_KEY, stashItem);
        refreshExtras();
      });
    }
    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.textContent = 'x';
    deleteBtn.title = 'Delete service';
    Object.assign(deleteBtn.style, {
      border: '1px solid #d0d0d0',
      background: '#fff',
      color: '#b42318',
      borderRadius: '999px',
      width: '18px',
      height: '18px',
      fontSize: '11px',
      lineHeight: '16px',
      padding: '0',
      cursor: service?.id ? 'pointer' : 'not-allowed'
    });
    if (!service?.id) {
      deleteBtn.disabled = true;
    } else {
      deleteBtn.addEventListener('click', async (evt) => {
        evt.stopPropagation();
        evt.preventDefault();
        const serviceName = service?.name || 'this service';
        if (!window.confirm(`Delete ${serviceName}?`)) return;
        deleteBtn.disabled = true;
        saveBtn.disabled = true;
        headerBtn.disabled = true;
        row.style.opacity = '0.6';
        deleteBtn.textContent = '...';
        try {
          await deleteServiceRecord(service.id);
          if (redirectEnabled) {
            const stashItem = buildServiceStashItem(service);
            if (stashItem) {
              upsertServiceStashItem(SERVICE_STASH_DELETED_KEY, stashItem);
              refreshExtras();
            }
          }
          const index = svcList.findIndex(item => normalizeId(item?.id) === normalizeId(service.id));
          if (index >= 0) svcList.splice(index, 1);
          row.remove();
          window.location.href = 'https://gogetta.nyc/team/location/1ebd1a5d-c3a1-404d-aaf2-830552e4deea/services/recap';
        } catch (err) {
          console.warn('[Service Taxonomy] Failed to delete service', err);
          deleteBtn.disabled = false;
          saveBtn.disabled = !service?.id;
          headerBtn.disabled = isCurrent;
          row.style.opacity = '1';
          deleteBtn.textContent = 'x';
          window.alert('Failed to delete service. Please try again.');
        }
      });
    }
    const applySaveVisibility = (enabled) => {
      saveBtn.style.display = enabled ? '' : 'none';
    };
    redirectHandlers.push(applySaveVisibility);
    applySaveVisibility(redirectEnabled);
    actionWrap.appendChild(saveBtn);
    actionWrap.appendChild(deleteBtn);
    row.appendChild(actionWrap);
    if (entries.length) {
      const chips = document.createElement('div');
      Object.assign(chips.style, {
        display: 'flex',
        flexWrap: 'wrap',
        gap: '4px'
      });
      entries.forEach(entry => {
        if (entry.urlSuffix && isServiceEntryHidden(service?.id, entry.urlSuffix)) {
          return;
        }
        const palette = getRecencyStyles(entry.updatedAt);
        const entryWrap = document.createElement('div');
        Object.assign(entryWrap.style, {
          width: '100%',
          display: 'flex',
          flexDirection: 'column'
        });
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.textContent = formatEntryText(entry);
        Object.assign(btn.style, {
          border: 'none',
          background: palette.background,
          color: palette.color,
          borderRadius: '4px',
          padding: '4px 6px',
          fontSize: '12px',
          cursor: 'pointer',
          textAlign: 'left',
          lineHeight: '1.3',
          maxWidth: '100%',
          whiteSpace: 'normal',
          wordBreak: 'break-word',
          overflowWrap: 'anywhere',
          width: '100%',
          boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.05)'
        });
        const isEditable = entry.editable && locationId && service?.id;
        if (isEditable) {
          btn.title = 'Double-click to edit';
        }
        let clickTimer = null;
        const navigateToEntry = () => {
          if (!entry.urlSuffix) return;
          if (!locationId || !service?.id) return;
          localStorage.setItem('gghost-taxonomy-overlay-active', 'true');
          window.location.href = buildServiceUrl(locationId, service.id, entry.urlSuffix);
        };
        const navigateAfterCommit = () => {
          commitActiveEdit().then(() => {
            navigateToEntry();
          });
        };
        const beginDescriptionEdit = () => {
          if (entryWrap.dataset.editing === 'true') return;
          if (clickTimer) {
            clearTimeout(clickTimer);
            clickTimer = null;
          }
          entryWrap.dataset.editing = 'true';
          btn.style.display = 'none';
          const textarea = document.createElement('textarea');
          const startingValue = entry.rawValue || '';
          textarea.value = startingValue;
          textarea.placeholder = entry.emptyLabel || '';
          textarea.spellcheck = true;
          Object.assign(textarea.style, {
            width: '100%',
            minHeight: '40px',
            resize: 'vertical',
            borderRadius: '4px',
            padding: '6px',
            fontSize: '12px',
            lineHeight: '1.3',
            fontFamily: 'inherit',
            boxSizing: 'border-box'
          });
          applyEntryPalette(textarea, palette, true);
          const autoResize = () => {
            textarea.style.height = 'auto';
            const nextHeight = textarea.scrollHeight;
            textarea.style.height = `${Math.max(nextHeight, 40)}px`;
          };
          const cleanup = () => {
            entryWrap.dataset.editing = 'false';
            textarea.remove();
            btn.style.display = '';
            if (activeEdit && activeEdit.entryWrap === entryWrap) {
              activeEdit = null;
            }
          };
          let commitInFlight = false;
          const commit = async () => {
            if (commitInFlight) return;
            commitInFlight = true;
            const nextValue = textarea.value.replace(/\r\n/g, '\n').trim();
            const normalizedStart = startingValue.replace(/\r\n/g, '\n').trim();
            if (nextValue === normalizedStart) {
              commitInFlight = false;
              cleanup();
              return;
            }
            textarea.disabled = true;
            textarea.style.opacity = '0.7';
            const descriptionValue = nextValue ? nextValue : null;
            try {
              await submitServiceDescriptionUpdate(locationId, service.id, descriptionValue);
              const updatedAt = new Date().toISOString();
              entry.rawValue = nextValue;
              entry.value = truncateText(nextValue, 120);
              entry.updatedAt = updatedAt;
              service.description = descriptionValue;
              updateCachedServiceDescription(locationId, service.id, descriptionValue, updatedAt);
              const nextPalette = getRecencyStyles(updatedAt);
              applyEntryPalette(btn, nextPalette);
              btn.textContent = formatEntryText(entry);
              void recordServiceEditLog({
                locationId,
                serviceId: service.id,
                field: entry.field,
                label: entry.label,
                urlSuffix: entry.urlSuffix,
                before: normalizedStart,
                after: nextValue
              });
            } catch (err) {
              console.error('[Service Taxonomy] Failed to update description', err);
            } finally {
              commitInFlight = false;
              cleanup();
            }
          };
          activeEdit = { entryWrap, commit };
          textarea.addEventListener('input', autoResize);
          attachCommitOnFocusOut(textarea, commit, entryWrap);
          textarea.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
              e.preventDefault();
              cleanup();
            }
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              textarea.blur();
            }
          });
          entryWrap.appendChild(textarea);
          autoResize();
          setTimeout(() => textarea.focus(), 0);
        };
        const beginEventInfoEdit = () => {
          if (entryWrap.dataset.editing === 'true') return;
          if (clickTimer) {
            clearTimeout(clickTimer);
            clickTimer = null;
          }
          entryWrap.dataset.editing = 'true';
          btn.style.display = 'none';
          const textarea = document.createElement('textarea');
          const startingValue = entry.rawValue || '';
          textarea.value = startingValue;
          textarea.placeholder = entry.emptyLabel || '';
          textarea.spellcheck = true;
          Object.assign(textarea.style, {
            width: '100%',
            minHeight: '40px',
            resize: 'vertical',
            borderRadius: '4px',
            padding: '6px',
            fontSize: '12px',
            lineHeight: '1.3',
            fontFamily: 'inherit',
            boxSizing: 'border-box'
          });
          applyEntryPalette(textarea, palette, true);
          const autoResize = () => {
            textarea.style.height = 'auto';
            const nextHeight = textarea.scrollHeight;
            textarea.style.height = `${Math.max(nextHeight, 40)}px`;
          };
          const cleanup = () => {
            entryWrap.dataset.editing = 'false';
            textarea.remove();
            btn.style.display = '';
            if (activeEdit && activeEdit.entryWrap === entryWrap) {
              activeEdit = null;
            }
          };
          let commitInFlight = false;
          const commit = async () => {
            if (commitInFlight) return;
            commitInFlight = true;
            const nextValue = textarea.value.replace(/\r\n/g, '\n').trim();
            const normalizedStart = startingValue.replace(/\r\n/g, '\n').trim();
            if (nextValue === normalizedStart) {
              commitInFlight = false;
              cleanup();
              return;
            }
            textarea.disabled = true;
            textarea.style.opacity = '0.7';
            const infoValue = nextValue ? nextValue : null;
            try {
              await submitServiceUpdate(locationId, service.id, {
                eventRelatedInfo: { event: SERVICE_EDIT_OCCASION, information: infoValue }
              });
              const updatedAt = new Date().toISOString();
              const existingInfos = Array.isArray(service.EventRelatedInfos) ? service.EventRelatedInfos : [];
              const filteredInfos = existingInfos.filter(info => info?.event !== SERVICE_EDIT_OCCASION);
              if (infoValue) {
                filteredInfos.push({ event: SERVICE_EDIT_OCCASION, information: infoValue, updatedAt });
              }
              service.EventRelatedInfos = filteredInfos;
              entry.rawValue = nextValue;
              entry.value = truncateText(nextValue, 120);
              entry.updatedAt = updatedAt;
              updateCachedServiceEventInfo(locationId, service.id, infoValue, updatedAt);
              const nextPalette = getRecencyStyles(updatedAt);
              applyEntryPalette(btn, nextPalette);
              btn.textContent = formatEntryText(entry);
              void recordServiceEditLog({
                locationId,
                serviceId: service.id,
                field: entry.field,
                label: entry.label,
                urlSuffix: entry.urlSuffix,
                before: normalizedStart,
                after: nextValue
              });
            } catch (err) {
              console.error('[Service Taxonomy] Failed to update event info', err);
            } finally {
              commitInFlight = false;
              cleanup();
            }
          };
          activeEdit = { entryWrap, commit };
          textarea.addEventListener('input', autoResize);
          attachCommitOnFocusOut(textarea, commit, entryWrap);
          textarea.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
              e.preventDefault();
              cleanup();
            }
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              textarea.blur();
            }
          });
          entryWrap.appendChild(textarea);
          autoResize();
          setTimeout(() => textarea.focus(), 0);
        };
        const beginRequiredDocsEdit = () => {
          if (entryWrap.dataset.editing === 'true') return;
          if (clickTimer) {
            clearTimeout(clickTimer);
            clickTimer = null;
          }
          entryWrap.dataset.editing = 'true';
          btn.style.display = 'none';
          const editor = document.createElement('div');
          Object.assign(editor.style, {
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
            padding: '6px',
            borderRadius: '4px',
            boxSizing: 'border-box'
          });
          applyEntryPalette(editor, palette, true);
          const list = document.createElement('div');
          Object.assign(list.style, { display: 'flex', flexDirection: 'column', gap: '4px' });
          const normalizeDocs = (docs) => docs
            .map(doc => String(doc || '').trim())
            .filter(Boolean)
            .filter(doc => doc.toLowerCase() !== 'none');
          const startingDocs = normalizeDocs(Array.isArray(entry.rawValue) ? entry.rawValue : []);
          const startingKey = JSON.stringify(startingDocs);
          const addRow = (value = '') => {
            const row = document.createElement('div');
            Object.assign(row.style, { display: 'flex', gap: '4px', alignItems: 'center' });
            const input = document.createElement('input');
            input.type = 'text';
            input.value = value;
            input.placeholder = 'Document name';
            Object.assign(input.style, {
              flex: '1',
              fontSize: '12px',
              padding: '4px 6px',
              borderRadius: '4px',
              border: '1px solid #d9d9d9'
            });
            const removeBtn = document.createElement('button');
            removeBtn.type = 'button';
            removeBtn.textContent = 'x';
            Object.assign(removeBtn.style, {
              border: '1px solid #d9d9d9',
              background: '#fff',
              borderRadius: '4px',
              padding: '2px 6px',
              cursor: 'pointer'
            });
            removeBtn.addEventListener('click', (e) => {
              e.preventDefault();
              e.stopPropagation();
              row.remove();
            });
            row.appendChild(input);
            row.appendChild(removeBtn);
            list.appendChild(row);
            return input;
          };
          if (startingDocs.length) {
            startingDocs.forEach(doc => addRow(doc));
          } else {
            addRow('');
          }
          const addBtn = document.createElement('button');
          addBtn.type = 'button';
          addBtn.textContent = '+ Add document';
          Object.assign(addBtn.style, {
            alignSelf: 'flex-start',
            border: '1px solid #d9d9d9',
            background: '#fff',
            borderRadius: '4px',
            padding: '3px 6px',
            fontSize: '12px',
            cursor: 'pointer'
          });
          addBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const input = addRow('');
            setTimeout(() => input.focus(), 0);
          });
          const cleanup = () => {
            entryWrap.dataset.editing = 'false';
            editor.remove();
            btn.style.display = '';
            if (activeEdit && activeEdit.entryWrap === entryWrap) {
              activeEdit = null;
            }
          };
          let commitInFlight = false;
          const commit = async () => {
            if (commitInFlight) return;
            commitInFlight = true;
            const inputs = Array.from(list.querySelectorAll('input'));
            const nextDocs = normalizeDocs(inputs.map(input => input.value));
            if (JSON.stringify(nextDocs) === startingKey) {
              commitInFlight = false;
              cleanup();
              return;
            }
            Array.from(editor.querySelectorAll('input, button')).forEach(el => {
              el.disabled = true;
            });
            editor.style.opacity = '0.7';
            try {
              await submitServiceUpdate(locationId, service.id, {
                documents: { proofs: nextDocs }
              });
              const updatedAt = new Date().toISOString();
              entry.rawValue = nextDocs;
              entry.value = formatOxfordList(nextDocs);
              entry.updatedAt = updatedAt;
              service.RequiredDocuments = nextDocs.map(doc => ({ document: doc }));
              updateCachedServiceRequiredDocs(locationId, service.id, nextDocs, updatedAt);
              const nextPalette = getRecencyStyles(updatedAt);
              applyEntryPalette(btn, nextPalette);
              btn.textContent = formatEntryText(entry);
              void recordServiceEditLog({
                locationId,
                serviceId: service.id,
                field: entry.field,
                label: entry.label,
                urlSuffix: entry.urlSuffix,
                before: startingDocs,
                after: nextDocs
              });
            } catch (err) {
              console.error('[Service Taxonomy] Failed to update required documents', err);
            } finally {
              commitInFlight = false;
              cleanup();
            }
          };
          activeEdit = { entryWrap, commit };
          attachCommitOnFocusOut(editor, commit, entryWrap);
          editor.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
              e.preventDefault();
              cleanup();
            }
          });
          editor.appendChild(list);
          editor.appendChild(addBtn);
          entryWrap.appendChild(editor);
          const firstInput = list.querySelector('input');
          if (firstInput) setTimeout(() => firstInput.focus(), 0);
        };
        const beginAgeEdit = () => {
          if (entryWrap.dataset.editing === 'true') return;
          if (clickTimer) {
            clearTimeout(clickTimer);
            clickTimer = null;
          }
          entryWrap.dataset.editing = 'true';
          btn.style.display = 'none';
          const editor = document.createElement('div');
          Object.assign(editor.style, {
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
            padding: '6px',
            borderRadius: '4px',
            boxSizing: 'border-box'
          });
          applyEntryPalette(editor, palette, true);
          const errorText = document.createElement('div');
          Object.assign(errorText.style, { fontSize: '11px', color: '#b42318' });
          const list = document.createElement('div');
          Object.assign(list.style, { display: 'flex', flexDirection: 'column', gap: '6px' });
          const normalizeGroups = (groups) => groups
            .map(group => ({
              all_ages: !!group.all_ages,
              age_min: normalizeAgeNumber(group.age_min),
              age_max: normalizeAgeNumber(group.age_max),
              population_served: String(group.population_served || '').trim() || null
            }))
            .filter(group => group.all_ages || group.age_min != null || group.age_max != null || group.population_served);
          const startingGroups = normalizeGroups(Array.isArray(entry.rawValue) ? entry.rawValue : []);
          const startingKey = JSON.stringify(startingGroups);
          const addRow = (group = {}) => {
            const row = document.createElement('div');
            row.dataset.ageRow = 'true';
            Object.assign(row.style, { display: 'flex', flexWrap: 'wrap', gap: '4px', alignItems: 'center' });
            const labelInput = document.createElement('input');
            labelInput.type = 'text';
            labelInput.placeholder = 'Group';
            labelInput.value = group.population_served || '';
            Object.assign(labelInput.style, {
              flex: '1 1 80px',
              fontSize: '12px',
              padding: '4px 6px',
              borderRadius: '4px',
              border: '1px solid #d9d9d9'
            });
            const allAgesWrap = document.createElement('label');
            Object.assign(allAgesWrap.style, { display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px' });
            const allAgesInput = document.createElement('input');
            allAgesInput.type = 'checkbox';
            allAgesInput.checked = !!group.all_ages;
            allAgesWrap.appendChild(allAgesInput);
            allAgesWrap.appendChild(document.createTextNode('All ages'));
            const minInput = document.createElement('input');
            minInput.type = 'number';
            minInput.min = '0';
            minInput.placeholder = 'Min';
            minInput.value = group.age_min != null ? String(group.age_min) : '';
            Object.assign(minInput.style, {
              width: '58px',
              fontSize: '12px',
              padding: '4px 6px',
              borderRadius: '4px',
              border: '1px solid #d9d9d9'
            });
            const maxInput = document.createElement('input');
            maxInput.type = 'number';
            maxInput.min = '0';
            maxInput.placeholder = 'Max';
            maxInput.value = group.age_max != null ? String(group.age_max) : '';
            Object.assign(maxInput.style, {
              width: '58px',
              fontSize: '12px',
              padding: '4px 6px',
              borderRadius: '4px',
              border: '1px solid #d9d9d9'
            });
            const removeBtn = document.createElement('button');
            removeBtn.type = 'button';
            removeBtn.textContent = 'x';
            Object.assign(removeBtn.style, {
              border: '1px solid #d9d9d9',
              background: '#fff',
              borderRadius: '4px',
              padding: '2px 6px',
              cursor: 'pointer'
            });
            removeBtn.addEventListener('click', (e) => {
              e.preventDefault();
              e.stopPropagation();
              row.remove();
            });
            const syncAllAges = () => {
              const disabled = allAgesInput.checked;
              minInput.disabled = disabled;
              maxInput.disabled = disabled;
              if (disabled) {
                minInput.value = '';
                maxInput.value = '';
              }
            };
            allAgesInput.addEventListener('change', syncAllAges);
            syncAllAges();
            row.appendChild(labelInput);
            row.appendChild(allAgesWrap);
            row.appendChild(minInput);
            row.appendChild(maxInput);
            row.appendChild(removeBtn);
            list.appendChild(row);
            return labelInput;
          };
          if (startingGroups.length) {
            startingGroups.forEach(group => addRow(group));
          } else {
            addRow({ all_ages: true });
          }
          const addBtn = document.createElement('button');
          addBtn.type = 'button';
          addBtn.textContent = '+ Add age range';
          Object.assign(addBtn.style, {
            alignSelf: 'flex-start',
            border: '1px solid #d9d9d9',
            background: '#fff',
            borderRadius: '4px',
            padding: '3px 6px',
            fontSize: '12px',
            cursor: 'pointer'
          });
          addBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const input = addRow({ all_ages: false });
            setTimeout(() => input.focus(), 0);
          });
          const cleanup = () => {
            entryWrap.dataset.editing = 'false';
            editor.remove();
            btn.style.display = '';
            if (activeEdit && activeEdit.entryWrap === entryWrap) {
              activeEdit = null;
            }
          };
          let commitInFlight = false;
          const commit = async () => {
            if (commitInFlight) return;
            commitInFlight = true;
            errorText.textContent = '';
            Array.from(editor.querySelectorAll('input')).forEach(el => {
              el.style.borderColor = '#d9d9d9';
            });
            const rows = Array.from(list.querySelectorAll('[data-age-row="true"]'));
            const nextGroups = [];
            let validationError = null;
            let invalidInputs = [];
            rows.forEach(row => {
              const inputs = row.querySelectorAll('input');
              const labelInput = inputs[0];
              const allAgesInput = inputs[1];
              const minInput = inputs[2];
              const maxInput = inputs[3];
              const label = labelInput.value.trim();
              const allAges = allAgesInput.checked;
              const minVal = normalizeAgeNumber(minInput.value);
              const maxVal = normalizeAgeNumber(maxInput.value);
              if (allAges) {
                nextGroups.push({
                  all_ages: true,
                  age_min: null,
                  age_max: null,
                  population_served: label || null
                });
                return;
              }
              if (minVal == null && maxVal == null) {
                validationError = 'Enter a min/max age or select All ages.';
                invalidInputs = [minInput, maxInput];
                return;
              }
              if (minVal != null && maxVal != null && minVal > maxVal) {
                validationError = 'Min age cannot exceed max age.';
                invalidInputs = [minInput, maxInput];
                return;
              }
              nextGroups.push({
                all_ages: false,
                age_min: minVal,
                age_max: maxVal,
                population_served: label || null
              });
            });
            if (validationError) {
              errorText.textContent = validationError;
              invalidInputs.forEach(input => {
                input.style.borderColor = '#b42318';
              });
              commitInFlight = false;
              return;
            }
            const normalizedNext = normalizeGroups(nextGroups);
            if (JSON.stringify(normalizedNext) === startingKey) {
              commitInFlight = false;
              cleanup();
              return;
            }
            Array.from(editor.querySelectorAll('input, button')).forEach(el => {
              el.disabled = true;
            });
            editor.style.opacity = '0.7';
            try {
              await submitServiceUpdate(locationId, service.id, {
                whoDoesItServe: normalizedNext
              });
              const updatedAt = new Date().toISOString();
              updateCachedServiceAgeRequirement(locationId, service.id, normalizedNext, updatedAt);
              const eligibilities = Array.isArray(service.Eligibilities) ? service.Eligibilities : [];
              const idx = eligibilities.findIndex(e => e?.EligibilityParameter?.name?.toLowerCase?.() === 'age');
              if (normalizedNext.length === 0) {
                if (idx >= 0) eligibilities.splice(idx, 1);
              } else if (idx >= 0) {
                eligibilities[idx] = {
                  ...eligibilities[idx],
                  eligible_values: normalizedNext,
                  updatedAt
                };
              } else {
                eligibilities.push({
                  eligible_values: normalizedNext,
                  updatedAt,
                  EligibilityParameter: { name: 'age' }
                });
              }
              service.Eligibilities = eligibilities;
              entry.rawValue = normalizedNext;
              entry.value = formatAgeGroups(normalizedNext);
              entry.updatedAt = updatedAt;
              const nextPalette = getRecencyStyles(updatedAt);
              applyEntryPalette(btn, nextPalette);
              btn.textContent = formatEntryText(entry);
              void recordServiceEditLog({
                locationId,
                serviceId: service.id,
                field: entry.field,
                label: entry.label,
                urlSuffix: entry.urlSuffix,
                before: startingGroups,
                after: normalizedNext
              });
            } catch (err) {
              console.error('[Service Taxonomy] Failed to update age requirement', err);
            } finally {
              commitInFlight = false;
              cleanup();
            }
          };
          activeEdit = { entryWrap, commit };
          attachCommitOnFocusOut(editor, commit, entryWrap);
          editor.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
              e.preventDefault();
              cleanup();
            }
          });
          editor.appendChild(list);
          editor.appendChild(addBtn);
          editor.appendChild(errorText);
          entryWrap.appendChild(editor);
          const firstInput = list.querySelector('input');
          if (firstInput) setTimeout(() => firstInput.focus(), 0);
        };
        const beginHoursEdit = () => {
          if (entryWrap.dataset.editing === 'true') return;
          if (clickTimer) {
            clearTimeout(clickTimer);
            clickTimer = null;
          }
          entryWrap.dataset.editing = 'true';
          btn.style.display = 'none';
          const editor = document.createElement('div');
          Object.assign(editor.style, {
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
            padding: '6px',
            borderRadius: '4px',
            boxSizing: 'border-box'
          });
          applyEntryPalette(editor, palette, true);
          const errorText = document.createElement('div');
          Object.assign(errorText.style, { fontSize: '11px', color: '#b42318' });
          const list = document.createElement('div');
          Object.assign(list.style, { display: 'flex', flexDirection: 'column', gap: '6px' });
          const scheduleDraftKey = locationId && service?.id
            ? `gghost-schedule-draft:${locationId}:${service.id}`
            : null;
          const readScheduleDraft = () => {
            if (!scheduleDraftKey) return null;
            try {
              return JSON.parse(localStorage.getItem(scheduleDraftKey) || 'null');
            } catch {
              return null;
            }
          };
          const writeScheduleDraft = (payload) => {
            if (!scheduleDraftKey) return;
            try {
              localStorage.setItem(scheduleDraftKey, JSON.stringify(payload));
            } catch {}
          };
          const normalizeSchedule = (schedule) => ({
            weekday: toWeekdayNumber(schedule.weekday),
            opens_at: toScheduleTimeValue(schedule.opens_at || schedule.opensAt),
            closes_at: toScheduleTimeValue(schedule.closes_at || schedule.closesAt),
            closed: !!schedule.closed,
            occasion: schedule.occasion || SERVICE_EDIT_OCCASION,
            start_date: schedule.start_date || schedule.startDate || null,
            end_date: schedule.end_date || schedule.endDate || null
          });
          const rawSchedules = Array.isArray(entry.rawValue) ? entry.rawValue.map(normalizeSchedule) : [];
          const openSchedules = rawSchedules.filter(schedule => !schedule.closed);
          const draft = readScheduleDraft();
          const draftSchedules = Array.isArray(draft?.schedules) ? draft.schedules : null;
          const startingSchedules = draftSchedules ? draftSchedules.map(normalizeSchedule) : openSchedules;
          const startingClosedAll = draft
            ? !!draft.closedAll
            : (rawSchedules.length > 0 && rawSchedules.every(schedule => schedule.closed));
          const startingKey = JSON.stringify(startingSchedules);
          let closedAllInput = null;
          const getDraftRows = () => {
            const rows = Array.from(list.querySelectorAll('[data-schedule-row="true"]'));
            return rows.map(row => {
              const selects = row.querySelectorAll('select');
              const inputs = row.querySelectorAll('input');
              const weekdaySelect = selects[0];
              const openInput = inputs[0];
              const closeInput = inputs[1];
              const weekdayNum = Number(weekdaySelect?.value);
              return {
                weekday: weekdayNum || null,
                opensAt: openInput?.value || null,
                closesAt: closeInput?.value || null,
                occasion: row.dataset.occasion || SERVICE_EDIT_OCCASION,
                startDate: row.dataset.startDate || null,
                endDate: row.dataset.endDate || null
              };
            }).filter(row => row.weekday);
          };
          const persistScheduleDraft = () => {
            writeScheduleDraft({
              closedAll: !!closedAllInput?.checked,
              schedules: getDraftRows()
            });
          };
          const normalizeScheduleDate = (value) => {
            if (value === null || value === undefined || value === '') return null;
            if (typeof value === 'number' && Number.isFinite(value)) return value;
            const str = String(value).trim();
            if (!str) return null;
            if (/^\d+$/.test(str)) return Number(str);
            const parsed = Date.parse(str);
            if (Number.isNaN(parsed)) return null;
            return str;
          };
          const addRow = (schedule = {}) => {
            const row = document.createElement('div');
            row.dataset.scheduleRow = 'true';
            Object.assign(row.style, { display: 'flex', flexWrap: 'wrap', gap: '4px', alignItems: 'center' });
            const weekdaySelect = document.createElement('select');
            Object.assign(weekdaySelect.style, {
              fontSize: '12px',
              padding: '4px 6px',
              borderRadius: '4px',
              border: '1px solid #d9d9d9'
            });
            WEEKDAY_NAMES.forEach((name, index) => {
              const opt = document.createElement('option');
              opt.value = String(index + 1);
              opt.textContent = name.slice(0, 3);
              weekdaySelect.appendChild(opt);
            });
            const weekdayNum = toWeekdayNumber(schedule.weekday) || 1;
            weekdaySelect.value = String(weekdayNum);
            const openInput = document.createElement('input');
            openInput.type = 'time';
            openInput.value = toTimeInputValue(schedule.opens_at || schedule.opensAt);
            Object.assign(openInput.style, {
              width: '88px',
              fontSize: '12px',
              padding: '4px 6px',
              borderRadius: '4px',
              border: '1px solid #d9d9d9'
            });
            const closeInput = document.createElement('input');
            closeInput.type = 'time';
            closeInput.value = toTimeInputValue(schedule.closes_at || schedule.closesAt);
            Object.assign(closeInput.style, {
              width: '88px',
              fontSize: '12px',
              padding: '4px 6px',
              borderRadius: '4px',
              border: '1px solid #d9d9d9'
            });
            const removeBtn = document.createElement('button');
            removeBtn.type = 'button';
            removeBtn.textContent = 'x';
            Object.assign(removeBtn.style, {
              border: '1px solid #d9d9d9',
              background: '#fff',
              borderRadius: '4px',
              padding: '2px 6px',
              cursor: 'pointer'
            });
            removeBtn.addEventListener('click', (e) => {
              e.preventDefault();
              e.stopPropagation();
              row.remove();
              persistScheduleDraft();
            });
            row.dataset.occasion = schedule.occasion || SERVICE_EDIT_OCCASION;
            row.dataset.startDate = schedule.start_date || schedule.startDate || '';
            row.dataset.endDate = schedule.end_date || schedule.endDate || '';
            const handleDraftChange = () => {
              persistScheduleDraft();
            };
            weekdaySelect.addEventListener('change', handleDraftChange);
            openInput.addEventListener('input', handleDraftChange);
            closeInput.addEventListener('input', handleDraftChange);
            row.appendChild(weekdaySelect);
            row.appendChild(openInput);
            row.appendChild(closeInput);
            row.appendChild(removeBtn);
            list.appendChild(row);
            persistScheduleDraft();
          };
          if (startingSchedules.length) {
            startingSchedules.forEach(schedule => addRow(schedule));
          } else {
            addRow({});
          }
          const addBtn = document.createElement('button');
          addBtn.type = 'button';
          addBtn.textContent = '+ Add schedule';
          Object.assign(addBtn.style, {
            alignSelf: 'flex-start',
            border: '1px solid #d9d9d9',
            background: '#fff',
            borderRadius: '4px',
            padding: '3px 6px',
            fontSize: '12px',
            cursor: 'pointer'
          });
          addBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            addRow({});
          });
          const listWrap = document.createElement('div');
          Object.assign(listWrap.style, { display: 'flex', flexDirection: 'column', gap: '6px' });
          listWrap.appendChild(list);
          listWrap.appendChild(addBtn);
          const closedAllWrap = document.createElement('label');
          Object.assign(closedAllWrap.style, { display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px' });
          closedAllInput = document.createElement('input');
          closedAllInput.type = 'checkbox';
          closedAllInput.checked = startingClosedAll;
          closedAllWrap.appendChild(closedAllInput);
          closedAllWrap.appendChild(document.createTextNode('Closed (all days)'));
          const syncClosedAll = () => {
            const isClosedAll = !!closedAllInput.checked;
            listWrap.style.display = isClosedAll ? 'none' : 'flex';
            persistScheduleDraft();
          };
          closedAllInput.addEventListener('change', syncClosedAll);
          syncClosedAll();
          const cleanup = () => {
            entryWrap.dataset.editing = 'false';
            editor.remove();
            btn.style.display = '';
            if (activeEdit && activeEdit.entryWrap === entryWrap) {
              activeEdit = null;
            }
          };
          let commitInFlight = false;
          const commit = async () => {
            if (commitInFlight) return;
            commitInFlight = true;
            errorText.textContent = '';
            Array.from(editor.querySelectorAll('input, select')).forEach(el => {
              el.style.borderColor = '#d9d9d9';
            });
            const rows = Array.from(list.querySelectorAll('[data-schedule-row="true"]'));
            const nextSchedules = [];
            const payloadRows = [];
            let validationError = null;
            let invalidInputs = [];
            const closedAll = !!closedAllInput?.checked;
            persistScheduleDraft();
            if (!closedAll && rows.length === 0) {
              validationError = 'Add at least one schedule or mark closed.';
            }
            if (!validationError && closedAll) {
              const days = [1, 2, 3, 4, 5, 6, 7];
              days.forEach(day => {
                payloadRows.push({
                  weekday: toWeekdayName(day),
                  opensAt: null,
                  closesAt: null,
                  closed: true,
                  occasion: SERVICE_EDIT_OCCASION
                });
                nextSchedules.push({
                  weekday: day,
                  opens_at: null,
                  closes_at: null,
                  closed: true,
                  occasion: SERVICE_EDIT_OCCASION,
                  start_date: null,
                  end_date: null
                });
              });
            }
            if (!validationError && !closedAll) {
              rows.forEach(row => {
                if (validationError) return;
                const selects = row.querySelectorAll('select');
                const inputs = row.querySelectorAll('input');
                const weekdaySelect = selects[0];
                const openInput = inputs[0];
                const closeInput = inputs[1];
                const weekdayNum = Number(weekdaySelect.value);
                if (!weekdayNum) {
                  validationError = 'Select a weekday for each schedule.';
                  invalidInputs = [weekdaySelect];
                  return;
                }
                const opensAt = openInput.value;
                const closesAt = closeInput.value;
                if (!opensAt || !closesAt) {
                  validationError = 'Enter open/close times for each schedule.';
                  invalidInputs = [openInput, closeInput];
                  return;
                }
                const occasion = row.dataset.occasion || SERVICE_EDIT_OCCASION;
                const startDate = normalizeScheduleDate(row.dataset.startDate);
                const endDate = normalizeScheduleDate(row.dataset.endDate);
                const payloadRow = {
                  weekday: toWeekdayName(weekdayNum),
                  opensAt,
                  closesAt,
                  closed: false,
                  occasion
                };
                if (startDate !== null) payloadRow.startDate = startDate;
                if (endDate !== null) payloadRow.endDate = endDate;
                payloadRows.push(payloadRow);
                nextSchedules.push({
                  weekday: weekdayNum,
                  opens_at: toScheduleTimeValue(opensAt),
                  closes_at: toScheduleTimeValue(closesAt),
                  closed: false,
                  occasion,
                  start_date: startDate == null ? null : startDate,
                  end_date: endDate == null ? null : endDate
                });
              });
            }
            if (validationError) {
              errorText.textContent = validationError;
              invalidInputs.forEach(input => {
                input.style.borderColor = '#b42318';
              });
              commitInFlight = false;
              return;
            }
            const normalizedNext = nextSchedules.map(normalizeSchedule);
            const closedStateChanged = closedAll !== startingClosedAll;
            if (!closedStateChanged && JSON.stringify(normalizedNext) === startingKey) {
              commitInFlight = false;
              cleanup();
              return;
            }
            Array.from(editor.querySelectorAll('input, select, button')).forEach(el => {
              el.disabled = true;
            });
            editor.style.opacity = '0.7';
            try {
              await submitServiceUpdate(locationId, service.id, {
                irregularHours: payloadRows
              });
              const updatedAt = new Date().toISOString();
              service.HolidaySchedules = nextSchedules.map(schedule => ({
                ...schedule,
                updatedAt
              }));
              updateCachedServiceHolidaySchedules(locationId, service.id, service.HolidaySchedules, updatedAt);
              const nextEntry = buildHoursEntry(service);
              entry.rawValue = service.HolidaySchedules;
              entry.value = nextEntry.value;
              entry.updatedAt = updatedAt;
              const nextPalette = getRecencyStyles(updatedAt);
              applyEntryPalette(btn, nextPalette);
              btn.textContent = formatEntryText(entry);
              void recordServiceEditLog({
                locationId,
                serviceId: service.id,
                field: entry.field,
                label: entry.label,
                urlSuffix: entry.urlSuffix,
                before: startingSchedules,
                after: service.HolidaySchedules
              });
            } catch (err) {
              console.error('[Service Taxonomy] Failed to update schedules', err);
            } finally {
              commitInFlight = false;
              cleanup();
            }
          };
          activeEdit = { entryWrap, commit };
          attachCommitOnFocusOut(editor, commit, entryWrap);
          editor.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
              e.preventDefault();
              cleanup();
            }
          });
          editor.appendChild(closedAllWrap);
          editor.appendChild(listWrap);
          editor.appendChild(errorText);
          entryWrap.appendChild(editor);
          const firstInput = list.querySelector('input, select');
          if (firstInput && !closedAllInput?.checked) {
            setTimeout(() => firstInput.focus(), 0);
          }
        };
        const beginEdit = () => {
          if (entry.field === 'description') return beginDescriptionEdit();
          if (entry.field === 'additional_info' || entry.field === 'eventInfo') return beginEventInfoEdit();
          if (entry.field === 'requiredDocs') return beginRequiredDocsEdit();
          if (entry.field === 'age') return beginAgeEdit();
          if (entry.field === 'hours') return beginHoursEdit();
        };
        btn.addEventListener('click', (evt) => {
          evt.stopPropagation();
          if (entryWrap.dataset.editing === 'true') return;
          if (isEditable) {
            if (evt.detail > 1) {
              commitActiveEdit().then(beginEdit);
              return;
            }
            if (clickTimer) clearTimeout(clickTimer);
            clickTimer = setTimeout(() => {
              clickTimer = null;
              navigateAfterCommit();
            }, navDelayMs);
            return;
          }
          navigateAfterCommit();
        });
        if (isEditable) {
          btn.addEventListener('dblclick', (evt) => {
            evt.preventDefault();
            evt.stopPropagation();
            commitActiveEdit().then(beginEdit);
          });
        }
        entryWrap.appendChild(btn);
        chips.appendChild(entryWrap);
      });
      row.appendChild(chips);
    } else {
      const empty = document.createElement('div');
      empty.textContent = 'No quick data yet.';
      Object.assign(empty.style, {
        fontSize: '12px',
        color: '#7a6b2b'
      });
      row.appendChild(empty);
    }
    panel.appendChild(row);
  });
  panel.appendChild(extrasWrap);
  return panel;
}
function renderServiceTaxonomyBanner(taxonomies, services = [], locationId = null, currentServiceIndex = 0) {
  if (!Array.isArray(taxonomies) || taxonomies.length === 0) return;
  ensureTaxonomyBannerObserver();
  removeLegacyTaxonomyBanners();
  const navServices = normalizeServices(services).filter(service => {
    const id = normalizeId(service?.id);
    return id && id !== 'null' && id !== 'undefined';
  });
  const showNavigation = !!locationId && navServices.length > 1;
  const safeServiceIndex = navServices.length
    ? Math.max(0, Math.min(currentServiceIndex, navServices.length - 1))
    : 0;
  const activeServiceId = navServices[safeServiceIndex]?.id || null;
  activeTaxonomyBannerKey = buildTaxonomyBannerKey(locationId, activeServiceId);
  const banner = document.createElement('div');
  banner.setAttribute(TAXONOMY_BANNER_ATTR, 'true');
  Object.assign(banner.style, {
    position: 'fixed',
    top: '88px',
    right: '20px',
    background: 'rgba(255, 254, 245, 0.85)',
    border: '1px solid #d4c79a',
    borderRadius: '8px',
    padding: '6px 8px',
    boxShadow: '0 6px 18px rgba(0, 0, 0, 0.12)',
    maxWidth: '320px',
    fontFamily: 'Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    color: '#1f1f1f',
    zIndex: '9999',
    lineHeight: '1.3'
  });
  const headerRow = document.createElement('div');
  Object.assign(headerRow.style, {
    gap: '6px',
    position: 'relative'
  });
  headerRow.style.setProperty('display', 'flex', 'important');
  headerRow.style.setProperty('align-items', 'center', 'important');
  headerRow.style.setProperty('flex-wrap', 'nowrap', 'important');
  headerRow.style.setProperty('flex-direction', 'row', 'important');
  headerRow.style.setProperty('width', '100%', 'important');
  headerRow.style.setProperty('max-width', '100%', 'important');
  headerRow.style.setProperty('min-width', '0', 'important');
  headerRow.style.setProperty('gap', '8px', 'important');
  const canShowHoverPanel = navServices.length > 0 && locationId;
  let hoverPanel = null;
  let showHoverPanel = null;
  let hideHoverPanel = null;
  let wireHoverPanel = null;
  let hoverPanelAttached = false;
  if (canShowHoverPanel) {
    hoverPanel = createServiceHoverPanel(
      navServices,
      locationId,
      navServices[safeServiceIndex]?.id || null
    );
    hoverPanel.style.left = 'auto';
    hoverPanel.style.right = '0';
    let hoverPanelTimeout = null;
    showHoverPanel = () => {
      clearTimeout(hoverPanelTimeout);
      hoverPanel.style.opacity = '1';
      hoverPanel.style.pointerEvents = 'auto';
      hoverPanel.style.transform = 'translateY(0)';
    };
    hideHoverPanel = () => {
      if (hoverPanel && typeof hoverPanel.__gghostCommitActiveEdit === 'function') {
        hoverPanel.__gghostCommitActiveEdit();
      }
      hoverPanelTimeout = setTimeout(() => {
        hoverPanel.style.opacity = '0';
        hoverPanel.style.pointerEvents = 'none';
        hoverPanel.style.transform = 'translateY(6px)';
      }, 120);
    };
    wireHoverPanel = (target) => {
      target.addEventListener('mouseenter', showHoverPanel);
      target.addEventListener('mouseleave', hideHoverPanel);
      hoverPanel.addEventListener('mouseenter', showHoverPanel);
      hoverPanel.addEventListener('mouseleave', hideHoverPanel);
    };
  }
  // Add navigation controls / hover panel if we have multiple services
  if (showNavigation) {
    const navContainer = document.createElement('div');
    Object.assign(navContainer.style, {
      display: 'flex',
      gap: '4px',
      alignItems: 'center',
      position: 'relative',
      flexShrink: '0'
    });
    navContainer.style.setProperty('flex-wrap', 'nowrap', 'important');
    navContainer.style.setProperty('white-space', 'nowrap', 'important');
    navContainer.style.setProperty('flex', '0 0 auto', 'important');
    // Previous button
    const prevBtn = document.createElement('button');
    prevBtn.textContent = '←';
    const prevIndex = (safeServiceIndex - 1 + navServices.length) % navServices.length;
    const prevService = navServices[prevIndex];
    prevBtn.title = `Previous: ${prevService?.name || 'Unknown'}`;
    Object.assign(prevBtn.style, {
      padding: '2px 6px',
      fontSize: '14px',
      border: '1px solid #d4c79a',
      background: '#fff',
      borderRadius: '4px',
      cursor: 'pointer',
      fontWeight: 'bold'
    });
    prevBtn.addEventListener('click', () => {
      const prevServiceId = navServices[prevIndex]?.id;
      if (prevServiceId) {
        // Set flag to keep overlay visible on next page
        localStorage.setItem('gghost-taxonomy-overlay-active', 'true');
        window.location.href = `https://gogetta.nyc/team/location/${locationId}/services/${prevServiceId}`;
      }
    });
    // Next button
    const nextBtn = document.createElement('button');
    nextBtn.textContent = '→';
    const nextIndex = (safeServiceIndex + 1) % navServices.length;
    const nextService = navServices[nextIndex];
    nextBtn.title = `Next: ${nextService?.name || 'Unknown'}`;
    Object.assign(nextBtn.style, {
      padding: '2px 6px',
      fontSize: '14px',
      border: '1px solid #d4c79a',
      background: '#fff',
      borderRadius: '4px',
      cursor: 'pointer',
      fontWeight: 'bold'
    });
    nextBtn.addEventListener('click', () => {
      const nextServiceId = navServices[nextIndex]?.id;
      if (nextServiceId) {
        // Set flag to keep overlay visible on next page
        localStorage.setItem('gghost-taxonomy-overlay-active', 'true');
        window.location.href = `https://gogetta.nyc/team/location/${locationId}/services/${nextServiceId}`;
      }
    });
    navContainer.appendChild(prevBtn);
    navContainer.appendChild(nextBtn);
    if (hoverPanel && wireHoverPanel) {
      headerRow.appendChild(hoverPanel);
      wireHoverPanel(navContainer);
      hoverPanelAttached = true;
    }
    headerRow.appendChild(navContainer);
  }
  const listWrap = document.createElement('div');
  Object.assign(listWrap.style, {
    flex: '1 1 0',
    minWidth: '0',
    maxWidth: '100%',
    overflowX: 'auto',
    overflowY: 'hidden'
  });
  listWrap.style.setProperty('display', 'block', 'important');
  listWrap.style.setProperty('min-width', '0', 'important');
  const list = document.createElement('ul');
  Object.assign(list.style, {
    margin: '0',
    padding: '0',
    listStyle: 'none',
    fontSize: '13px',
    gap: '2px 6px'
  });
  list.style.setProperty('display', 'inline-flex', 'important');
  list.style.setProperty('flex-direction', 'row', 'important');
  list.style.setProperty('flex-wrap', 'nowrap', 'important');
  list.style.setProperty('align-items', 'center', 'important');
  list.style.setProperty('white-space', 'nowrap', 'important');
  taxonomies.forEach(({ parent_name: parentName, name }) => {
    if (!parentName && !name) return;
    const item = document.createElement('li');
    item.style.display = 'inline-flex';
    item.style.alignItems = 'center';
    item.style.gap = '4px';
    item.style.padding = '1px 0';
    item.style.whiteSpace = 'nowrap';
    item.style.flexShrink = '0';
    if (parentName) {
      const parent = document.createElement('span');
      parent.textContent = parentName;
      parent.style.fontWeight = '500';
      parent.style.color = '#5f4b00';
      item.appendChild(parent);
    }
    if (parentName && name) {
      const separator = document.createElement('span');
      separator.textContent = '›';
      separator.style.color = '#a38300';
      separator.style.fontSize = '12px';
      item.appendChild(separator);
    }
    if (name) {
      const child = document.createElement('span');
      child.textContent = name;
      child.style.color = '#2f2f2f';
      item.appendChild(child);
    }
    list.appendChild(item);
  });
  if (!list.children.length) {
    const empty = document.createElement('div');
    empty.textContent = 'No taxonomy data available for this service.';
    empty.style.fontSize = '12px';
    empty.style.color = '#6f6f6f';
    listWrap.appendChild(empty);
  } else {
    listWrap.appendChild(list);
  }
  headerRow.appendChild(listWrap);
  if (hoverPanel && wireHoverPanel && !hoverPanelAttached) {
    headerRow.appendChild(hoverPanel);
    wireHoverPanel(headerRow);
  }
  banner.appendChild(headerRow);
  const actionsRow = document.createElement('div');
  actionsRow.style.display = 'flex';
  actionsRow.style.justifyContent = 'flex-end';
  actionsRow.style.marginTop = '6px';
  const editHistoryBtn = document.createElement('button');
  editHistoryBtn.type = 'button';
  editHistoryBtn.textContent = 'Edit history';
  const canShowEditPlayback = /\/(description|other-info)(?:\/|$)/i.test(location.pathname || '');
  const playbackStateAttr = 'data-gghost-playback-state';
  editHistoryBtn.setAttribute(playbackStateAttr, 'unknown');
  editHistoryBtn.disabled = !canShowEditPlayback;
  editHistoryBtn.title = canShowEditPlayback
    ? 'Play the text edit history'
    : 'Open description or other-info to view edits';
  Object.assign(editHistoryBtn.style, {
    padding: '4px 8px',
    fontSize: '12px',
    border: '1px solid #d4c79a',
    background: '#fff',
    borderRadius: '6px',
    cursor: editHistoryBtn.disabled ? 'default' : 'pointer',
    opacity: editHistoryBtn.disabled ? '0.6' : '1'
  });
  const isPlaybackDebugEnabled = () => {
    if (typeof window.gghost?.isPlaybackDebugEnabled === 'function') {
      return window.gghost.isPlaybackDebugEnabled();
    }
    if (window.gghost?.DEBUG_PLAYBACK === true) return true;
    if (window.gghost?.DEBUG_PLAYBACK === false) return false;
    try {
      const flag = localStorage.getItem('gghostDebugPlayback');
      return flag === '1' || flag === 'true';
    } catch {}
    const path = location?.pathname || '';
    return /^\/team\/location\/[0-9a-f-]+\/services\/[0-9a-f-]+\/(description|other-info)(?:\/|$)/i.test(path);
  };
  const pickPlaybackFieldData = (pageData, fieldKey) => {
    if (!pageData || typeof pageData !== 'object') return null;
    const fields = pageData.fields;
    if (!fields || typeof fields !== 'object') return null;
    const fallbackFieldKey = fieldKey === 'services.additional_info'
      ? 'event_related_info.information'
      : '';
    const fieldKeys = [fieldKey, fallbackFieldKey].filter(Boolean);
    if (Array.isArray(fields)) {
      if (fieldKeys.length) {
        for (const key of fieldKeys) {
          const match = fields.find((item) => item?.fieldKey === key);
          if (match) return match;
        }
      }
      return fields.find((item) => item && typeof item === 'object') || null;
    }
    if (fieldKeys.length) {
      for (const key of fieldKeys) {
        if (fields[key]) return fields[key];
        const encodedKey = encodeURIComponent(String(key)).replace(/\./g, '%2E');
        if (encodedKey && fields[encodedKey]) return fields[encodedKey];
      }
      const match = Object.values(fields).find((item) => item?.fieldKey && fieldKeys.includes(item.fieldKey));
      if (match) return match;
    }
    return Object.values(fields).find((item) => item && typeof item === 'object') || null;
  };
  const normalizePlaybackPath = (value) => {
    if (!value) return '';
    const raw = String(value).trim();
    if (!raw) return '';
    return raw.replace(/\/+$/, '');
  };
  const formatProbeLogUrl = (value) => {
    try {
      const parsed = new URL(value);
      parsed.search = '';
      return parsed.toString();
    } catch {
      return value;
    }
  };
  const buildPlaybackProbeUrl = (pagePath) => {
    const normalized = normalizePlaybackPath(pagePath);
    if (!normalized) return '';
    const apiOverride = window.gghost?.PLAYBACK_INDEX_API;
    const apiBase = typeof apiOverride === 'string' && apiOverride.trim()
      ? apiOverride.trim()
      : 'https://us-central1-streetli.cloudfunctions.net/locationNotesPlayback';
    if (apiBase) {
      try {
        const url = new URL(apiBase);
        url.searchParams.set('pagePath', normalized);
        return url.toString();
      } catch {}
    }
    const base = window.gghost?.baseURL || 'https://streetli-default-rtdb.firebaseio.com/';
    const baseUrl = base.endsWith('/') ? base : `${base}/`;
    const encodedKey = encodeURIComponent(normalized);
    const safeKey = encodeURIComponent(encodedKey);
    const url = `${baseUrl}locationNotesCache/playback/v1/pages/${safeKey}.json`;
    if (typeof window.gghost?.withFirebaseAuth === 'function') {
      return window.gghost.withFirebaseAuth(url);
    }
    return url;
  };
  const probePlaybackPage = async (pagePath) => {
    const url = buildPlaybackProbeUrl(pagePath);
    if (!url) return { ok: false, status: 0, reason: 'no-url' };
    const fetcher = typeof fetchViaBackground === 'function' ? fetchViaBackground : fetch;
    const debug = isPlaybackDebugEnabled();
    const safeUrl = debug ? formatProbeLogUrl(url) : '';
    try {
      const res = await fetcher(url, { cache: 'no-store' });
      const status = res.status;
      if (!res.ok) {
        if (debug) {
          console.warn('[Edit Playback] Playback probe not ok', { url: safeUrl, status });
        }
        return { ok: false, status, reason: 'http-error' };
      }
      let data = null;
      try {
        data = await res.json();
      } catch {}
      return { ok: true, status, data };
    } catch (err) {
      if (debug) {
        console.warn('[Edit Playback] Playback probe failed', {
          url: safeUrl,
          error: err?.message || String(err)
        });
      }
      return {
        ok: false,
        status: 0,
        reason: err?.message || 'fetch-failed'
      };
    }
  };
  const updatePlaybackButtonState = (state, info = {}) => {
    const nextState = state || 'unknown';
    editHistoryBtn.setAttribute(playbackStateAttr, nextState);
    if (nextState === 'missing') {
      editHistoryBtn.style.display = 'none';
    } else {
      editHistoryBtn.style.display = '';
    }
    if (isPlaybackDebugEnabled()) {
      console.log('[Edit Playback] Button state', { state: nextState, ...info });
    }
  };
  const evaluatePlaybackAvailability = async ({ force = false } = {}) => {
    const path = normalizePlaybackPath(location.pathname || '');
    const mode = /\/description(?:\/|$)/i.test(path)
      ? 'description'
      : /\/other-info(?:\/|$)/i.test(path)
        ? 'other-info'
        : '';
    const fieldKey = mode === 'description'
      ? 'services.description'
      : mode === 'other-info'
        ? 'services.additional_info'
        : '';
    if (!fieldKey) return { state: 'unknown', reason: 'no-field' };
    const fetchPlayback = window.gghost?.fetchPlaybackIndexForPage;
    if (typeof fetchPlayback !== 'function') {
      return { state: 'unknown', reason: 'fetch-unavailable' };
    }
    let pageData = null;
    try {
      pageData = await fetchPlayback(path, { force });
    } catch (err) {
      if (isPlaybackDebugEnabled()) {
        console.warn('[Edit Playback] Failed to fetch playback for button check', err);
      }
      return { state: 'unknown', reason: 'fetch-error' };
    }
    if (!pageData || typeof pageData !== 'object') {
      const probe = await probePlaybackPage(path);
      if (probe.ok) {
        if (!probe.data || typeof probe.data !== 'object') {
          return { state: 'missing', reason: 'no-page' };
        }
        pageData = probe.data;
      } else {
        if (probe.status === 404) {
          return { state: 'missing', reason: 'no-page' };
        }
        const statusReason = probe.status ? `http-${probe.status}` : (probe.reason || 'fetch-failed');
        return { state: 'unknown', reason: statusReason };
      }
    }
    const fieldData = pickPlaybackFieldData(pageData, fieldKey);
    if (!fieldData) {
      return { state: 'missing', reason: 'field-missing' };
    }
    const events = Array.isArray(fieldData.events) ? fieldData.events : [];
    const hasInitial = !!(fieldData.initial || fieldData.initialText || fieldData.initialEvent);
    const hasHistory = hasInitial && events.length > 0;
    return {
      state: hasHistory ? 'ready' : 'missing',
      reason: hasHistory ? 'ok' : 'no-edits',
      events: events.length
    };
  };
  const scheduleEditPlaybackCheck = () => {
    if (!canShowEditPlayback) return;
    let attempts = 0;
    const maxAttempts = 8;
    const run = async () => {
      attempts += 1;
      const result = await evaluatePlaybackAvailability({ force: attempts > 1 });
      if (result.state === 'ready' || result.state === 'missing') {
        updatePlaybackButtonState(result.state, result);
        return;
      }
      if (attempts < maxAttempts) {
        setTimeout(run, 500);
      } else if (isPlaybackDebugEnabled()) {
        const details = (() => {
          try {
            return JSON.stringify(result);
          } catch {
            return String(result);
          }
        })();
        console.warn('[Edit Playback] Playback availability check unresolved', details);
      }
    };
    if (window.requestIdleCallback) {
      window.requestIdleCallback(run, { timeout: 2500 });
    } else {
      setTimeout(run, 0);
    }
  };
  scheduleEditPlaybackCheck();
  editHistoryBtn.addEventListener('click', async () => {
    if (!canShowEditPlayback) return;
    const state = editHistoryBtn.getAttribute(playbackStateAttr) || 'unknown';
    if (state !== 'ready') {
      const result = await evaluatePlaybackAvailability({ force: true });
      updatePlaybackButtonState(result.state, result);
      if (result.state !== 'ready') return;
    }
    const runner = window.gghost?.openServiceEditPlaybackOverlay;
    if (typeof runner === 'function') {
      runner();
    } else {
      alert('Edit playback is not ready yet.');
    }
  });
  actionsRow.appendChild(editHistoryBtn);
  banner.appendChild(actionsRow);
  document.body.appendChild(banner);
}
async function showServiceTaxonomy(locationId, serviceId, options = {}) {
  const requestId = ++taxonomyRenderRequestId;
  const normalizedServiceId = normalizeId(serviceId);
  const allowMismatch = options.force === true;
  // Set up timeout to clear the flag after 4 seconds
  const clearFlagTimeout = setTimeout(() => {
    localStorage.removeItem('gghost-taxonomy-overlay-active');
  }, 4000);
  // Fetch data (uses cache if available and fresh)
  const { data: locationData, fromCache } = await fetchFullLocationRecord(locationId, { refresh: false });
  // Clear flag and timeout after fetch
  clearTimeout(clearFlagTimeout);
  localStorage.removeItem('gghost-taxonomy-overlay-active');
  if (!locationData) {
    console.warn('[Service Taxonomy] No location data available for', locationId);
    return;
  }
  const renderWithData = (data) => {
    if (requestId !== taxonomyRenderRequestId) return;
    if (!allowMismatch && !isServiceTaxonomyPath(location.pathname, locationId, normalizedServiceId)) {
      return;
    }
    const service = findServiceRecord(data, normalizedServiceId);
    if (!service) {
      console.warn('[Service Taxonomy] Service not found in location payload', { locationId, serviceId });
      return;
    }
    const taxonomies = Array.isArray(service.Taxonomies)
      ? service.Taxonomies.filter(tax => tax && (tax.parent_name || tax.name))
      : [];
    if (!taxonomies.length) {
      console.log('[Service Taxonomy] No taxonomy entries to display for service', serviceId);
      return;
    }
    // Get all services for navigation
    const allServices = normalizeServices(data.Services || data.services);
    const currentServiceIndex = allServices.findIndex(s => normalizeId(s.id) === normalizedServiceId);
    const safeServiceIndex = currentServiceIndex >= 0 ? currentServiceIndex : 0;
    // Render with data (either cached or freshly fetched)
    removeServiceTaxonomyBanner();
    renderServiceTaxonomyBanner(taxonomies, allServices, locationId, safeServiceIndex);
  };
  if (fromCache) {
    // Avoid flashing different layouts by rendering only once after a refresh attempt.
    fetchFullLocationRecord(locationId, { refresh: true })
      .then(({ data: freshData }) => {
        if (requestId !== taxonomyRenderRequestId) return;
        if (freshData) {
          renderWithData(freshData);
        } else {
          renderWithData(locationData);
        }
      })
      .catch(err => {
        console.error('[Service Taxonomy] Background refresh failed', err);
        if (requestId !== taxonomyRenderRequestId) return;
        renderWithData(locationData);
      });
    return;
  }
  renderWithData(locationData);
}
function installServiceTaxonomyOverlayBridge() {
  if (taxonomyOverlayBridgeInstalled) return;
  taxonomyOverlayBridgeInstalled = true;
  window.addEventListener(SERVICE_TAXONOMY_EVENT, (event) => {
    const detail = event?.detail || {};
    const locationId = detail.locationId;
    const serviceId = detail.serviceId;
    const normalizedLocationId = normalizeId(locationId);
    const normalizedServiceId = normalizeId(serviceId);
    if (!normalizedLocationId || !normalizedServiceId) return;
    removeTaxonomyHeartOverlay();
    showServiceTaxonomy(locationId, serviceId, { force: true }).catch((err) => {
      console.error('[Service Taxonomy] Failed to open overlay from event', err);
    });
  });
}
