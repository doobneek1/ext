(function () {
  'use strict';

  const TARGET_LABEL = 'proof of income';
  const TARGET_VALUE = 'proof of Income';
  const INPUT_SELECTORS = [
    '#proofs-required-custom-form',
    'input.Input.Input-fluid[placeholder*="proof of" i]',
    'input.Input.Input-fluid[placeholder*="proof" i]'
  ];
  const STANDARD_OPTION_LABELS = new Set([
    'photo id',
    'proof of address',
    'proof of income',
    'birth certificates'
  ]);
  const OPTION_SELECTOR = 'button.Option, .Option[role="button"]';
  const CHECK_ICON_SELECTOR = 'svg.fa-check, svg[data-icon="check"]';
  const ADD_ANOTHER_SELECTOR = '.addAnotherGroup';
  const PROOFS_REQUIRED_PATH = /\/documents\/proofs-required\/?$/i;

  function isProofsRequiredPage() {
    if (!/(^|\.)gogetta\.nyc$/i.test(location.hostname)) return false;
    return PROOFS_REQUIRED_PATH.test(location.pathname);
  }

  function normalizeLabel(text) {
    return (text || '').replace(/\s+/g, ' ').trim().toLowerCase();
  }

  function getOptionLabelRaw(button) {
    const labelNode = button.querySelector('.w-100');
    return (labelNode ? labelNode.textContent : button.textContent).replace(/\s+/g, ' ').trim();
  }

  function hasCheckIcon(button) {
    return Boolean(button.querySelector(CHECK_ICON_SELECTOR));
  }

  function getOptionLabel(button) {
    return normalizeLabel(getOptionLabelRaw(button));
  }

  function getCheckedOptionButtons() {
    const options = Array.from(document.querySelectorAll(OPTION_SELECTOR));
    return options.filter((button) => hasCheckIcon(button));
  }

  function countCheckedOptions() {
    return getCheckedOptionButtons().length;
  }

  function findAddAnotherButton() {
    const label = document.querySelector(ADD_ANOTHER_SELECTOR);
    return label ? label.closest('button') : null;
  }

  function findNoneButton() {
    const options = document.querySelectorAll('button.Option');
    for (const option of options) {
      if (normalizeLabel(option.textContent) === 'none') {
        return option;
      }
    }
    return null;
  }

  function setInputValue(input, value) {
    const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
    if (descriptor && typeof descriptor.set === 'function') {
      descriptor.set.call(input, value);
    } else {
      input.value = value;
    }
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function waitForElement(selector, timeout = 3000) {
    return new Promise((resolve, reject) => {
      const intervalMs = 100;
      let waited = 0;
      const timer = setInterval(() => {
        const el = document.querySelector(selector);
        if (el) {
          clearInterval(timer);
          resolve(el);
          return;
        }
        waited += intervalMs;
        if (waited >= timeout) {
          clearInterval(timer);
          reject(new Error(`Timeout waiting for ${selector}`));
        }
      }, intervalMs);
    });
  }

  function findInput() {
    for (const selector of INPUT_SELECTORS) {
      const input = document.querySelector(selector);
      if (input) return input;
    }
    return null;
  }

  function waitForInput(timeout = 3000) {
    return new Promise((resolve, reject) => {
      const intervalMs = 100;
      let waited = 0;
      const timer = setInterval(() => {
        const input = findInput();
        if (input) {
          clearInterval(timer);
          resolve(input);
          return;
        }
        waited += intervalMs;
        if (waited >= timeout) {
          clearInterval(timer);
          reject(new Error('Timeout waiting for proofs-required input'));
        }
      }, intervalMs);
    });
  }

  async function clickAddAnotherAndFill(value) {
    let addAnotherButton = findAddAnotherButton();
    if (!addAnotherButton) {
      try {
        const addAnotherLabel = await waitForElement(ADD_ANOTHER_SELECTOR, 3000);
        addAnotherButton = addAnotherLabel.closest('button');
      } catch (err) {
        console.warn('[ProofsRequired] "+ Add another" not found:', err);
      }
    }
    if (addAnotherButton) {
      addAnotherButton.click();
    }

    try {
      const input = await waitForInput(3000);
      setInputValue(input, value);
    } catch (err) {
      console.warn('[ProofsRequired] Input not found:', err);
    }
  }

  async function handleProofIncomeClick(checkedCountBefore) {
    await clickAddAnotherAndFill(TARGET_VALUE);

    if (checkedCountBefore === 1) {
      const noneButton = findNoneButton();
      if (noneButton) {
        noneButton.click();
      }
    }
  }

  function matchesProofIncome(button) {
    const label = getOptionLabel(button);
    return label.includes(TARGET_LABEL);
  }

  let lastHandledAt = 0;

  function onCheckedOptionPointerDown(event) {
    if (!isProofsRequiredPage()) return;
    if (event.button !== 0) return;

    const button = event.currentTarget;
    if (!button || !matchesProofIncome(button)) return;
    if (!hasCheckIcon(button)) return;

    const now = Date.now();
    if (now - lastHandledAt < 250) return;
    lastHandledAt = now;

    const checkedCountBefore = countCheckedOptions();

    setTimeout(() => {
      if (!isProofsRequiredPage()) return;
      handleProofIncomeClick(checkedCountBefore);
    }, 100);
  }

  const observedButtons = new WeakSet();
  let lastKnownOptionMap = null;
  let pendingOptionDiff = null;
  const recentlyRestored = new Map();
  const RESTORE_COOLDOWN_MS = 3000;

  function attachCheckedOptionListeners() {
    if (!isProofsRequiredPage()) return;

    const checkedButtons = getCheckedOptionButtons();
    for (const button of checkedButtons) {
      if (observedButtons.has(button)) continue;
      observedButtons.add(button);
      button.addEventListener('pointerdown', onCheckedOptionPointerDown, true);
    }
  }

  function collectOptionLabelMap() {
    const options = Array.from(document.querySelectorAll(OPTION_SELECTOR));
    const map = new Map();
    for (const option of options) {
      const raw = getOptionLabelRaw(option);
      const normalized = normalizeLabel(raw);
      if (!normalized || map.has(normalized)) continue;
      map.set(normalized, raw);
    }
    return map;
  }

  function shouldRestoreLabel(normalized) {
    if (!normalized) return false;
    if (STANDARD_OPTION_LABELS.has(normalized)) return false;
    const lastRestored = recentlyRestored.get(normalized) || 0;
    return Date.now() - lastRestored > RESTORE_COOLDOWN_MS;
  }

  function recordRestoredLabel(normalized) {
    recentlyRestored.set(normalized, Date.now());
  }

  function scheduleOptionDiff() {
    if (!isProofsRequiredPage()) {
      lastKnownOptionMap = null;
      return;
    }
    if (pendingOptionDiff) return;
    pendingOptionDiff = setTimeout(() => {
      pendingOptionDiff = null;
      checkForRemovedOptions();
    }, 150);
  }

  function checkForRemovedOptions() {
    if (!isProofsRequiredPage()) {
      lastKnownOptionMap = null;
      return;
    }

    const currentMap = collectOptionLabelMap();
    if (!lastKnownOptionMap) {
      lastKnownOptionMap = currentMap;
      return;
    }

    for (const [normalized, raw] of lastKnownOptionMap.entries()) {
      if (currentMap.has(normalized)) continue;
      if (!shouldRestoreLabel(normalized)) continue;
      recordRestoredLabel(normalized);
      clickAddAnotherAndFill(raw);
    }

    lastKnownOptionMap = currentMap;
  }

  function startObserver() {
    if (!document.body) return;
    const observer = new MutationObserver(() => {
      attachCheckedOptionListeners();
      scheduleOptionDiff();
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  if (window.__doobneekProofsRequiredClickHandler) return;
  window.__doobneekProofsRequiredClickHandler = true;
  attachCheckedOptionListeners();
  scheduleOptionDiff();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startObserver);
  } else {
    startObserver();
  }
})();
