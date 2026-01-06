(function () {
  'use strict';

  const OPTION_SELECTOR = 'button.Option, .Option[role="button"]';
  const CHECK_ICON_SELECTOR = 'svg.fa-check, svg[data-icon="check"]';
  const PROOFS_REQUIRED_PATH = /\/documents\/proofs-required\/?$/i;
  const HOST_RE = /(^|\.)gogetta\.nyc$/i;
  const NONE_LABEL = 'none';
  const STYLE_ID = 'dnk-proofs-required-style';
  const LABEL_CLASS = 'dnk-proofs-label';
  const TEXTAREA_CLASS = 'dnk-proofs-textarea';
  const EDITING_CLASS = 'dnk-proofs-editing';
  const NONE_CLEAR_ATTR = 'data-gghost-proofs-none-clear';
  const NONE_CLEARED_ATTR = 'data-dnk-none-cleared';
  const CUSTOM_PROOF_INPUT_ID = 'proofs-required-custom-form';

  const textMeasureCanvas = document.createElement('canvas');
  const textMeasureContext = textMeasureCanvas.getContext('2d');

  function isProofsRequiredPage() {
    if (!HOST_RE.test(location.hostname)) return false;
    return PROOFS_REQUIRED_PATH.test(location.pathname);
  }

  function normalizeLabel(text) {
    return (text || '').replace(/\s+/g, ' ').trim().toLowerCase();
  }

  function getLabelNode(button) {
    return button ? button.querySelector('.w-100') : null;
  }

  function getOptionLabelRaw(button) {
    const labelNode = getLabelNode(button);
    if (labelNode) {
      const editor = labelNode.querySelector(`.${TEXTAREA_CLASS}`);
      if (editor) return editor.value;
      return (labelNode.textContent || '').replace(/\s+/g, ' ').trim();
    }
    return (button?.textContent || '').replace(/\s+/g, ' ').trim();
  }

  function hasCheckIcon(button) {
    return Boolean(button && button.querySelector(CHECK_ICON_SELECTOR));
  }

  function isOptionChecked(button) {
    if (!button) return false;
    const ariaPressed = button.getAttribute('aria-pressed');
    if (ariaPressed === 'true') return true;
    if (ariaPressed === 'false') return false;
    if (button.classList.contains('Option-active')) return true;
    return hasCheckIcon(button);
  }

  function isNoneButton(button) {
    return normalizeLabel(getOptionLabelRaw(button)) === NONE_LABEL;
  }

  function isAddAnotherButton(button) {
    const label = normalizeLabel(getOptionLabelRaw(button));
    return label.includes('add another');
  }

  function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
.${LABEL_CLASS} {
  display: flex;
  align-items: center;
  flex: 1 1 auto;
  min-width: 0;
  width: auto !important;
}
button.Option .${TEXTAREA_CLASS} {
  font: inherit;
  color: inherit;
  background: transparent;
  border: 1px solid rgba(0, 0, 0, 0.25);
  border-radius: 4px;
  padding: 2px 4px;
  resize: none;
  overflow: hidden;
  min-height: 1.6em;
  line-height: 1.2;
  max-width: 100%;
}
button.Option[${NONE_CLEARED_ATTR}="true"] svg.fa-check,
button.Option[${NONE_CLEARED_ATTR}="true"] svg[data-icon="check"] {
  display: none !important;
}
`;
    (document.head || document.documentElement).appendChild(style);
  }

  function ensureLabelClass(button) {
    const labelNode = getLabelNode(button);
    if (!labelNode) return null;
    if (!labelNode.classList.contains(LABEL_CLASS)) {
      labelNode.classList.add(LABEL_CLASS);
    }
    return labelNode;
  }

  function removePenIcons() {
    const pens = document.querySelectorAll('.dnk-proofs-pen');
    pens.forEach((pen) => pen.remove());
  }

  function markNoneClear() {
    document.documentElement.setAttribute(NONE_CLEAR_ATTR, 'true');
  }

  function clearNoneClear() {
    document.documentElement.removeAttribute(NONE_CLEAR_ATTR);
    const noneButton = findNoneButton();
    if (noneButton) setNoneCleared(noneButton, false);
  }

  function setNoneCleared(button, cleared) {
    if (!button) return;
    if (cleared) {
      button.setAttribute(NONE_CLEARED_ATTR, 'true');
      button.classList.remove('Option-active');
    } else {
      button.removeAttribute(NONE_CLEARED_ATTR);
    }
  }

  function findNoneButton() {
    const options = Array.from(document.querySelectorAll(OPTION_SELECTOR));
    return options.find((button) => isNoneButton(button)) || null;
  }

  function measureTextWidth(text, font) {
    if (!textMeasureContext) return (text || '').length * 8;
    textMeasureContext.font = font;
    const lines = String(text || '').split(/\r?\n/);
    let max = 0;
    for (const line of lines) {
      max = Math.max(max, textMeasureContext.measureText(line).width);
    }
    return max;
  }

  function adjustTextareaSize(textarea, labelNode) {
    if (!textarea || !labelNode) return;
    const computed = getComputedStyle(textarea);
    const font = computed.font || `${computed.fontSize} ${computed.fontFamily}`;
    const textWidth = measureTextWidth(textarea.value || textarea.placeholder || '', font);
    const paddingLeft = parseFloat(computed.paddingLeft) || 0;
    const paddingRight = parseFloat(computed.paddingRight) || 0;
    const paddingTop = parseFloat(computed.paddingTop) || 0;
    const paddingBottom = parseFloat(computed.paddingBottom) || 0;
    const minWidth = 40;
    const containerWidth = labelNode.getBoundingClientRect().width || labelNode.clientWidth || textWidth;
    const desiredWidth = Math.min(containerWidth, Math.max(minWidth, textWidth + paddingLeft + paddingRight + 8));
    textarea.style.width = `${desiredWidth}px`;
    textarea.style.height = 'auto';
    const lineHeight = parseFloat(computed.lineHeight) || (parseFloat(computed.fontSize) * 1.2);
    const maxHeight = (lineHeight * 2) + paddingTop + paddingBottom;
    const scrollHeight = textarea.scrollHeight;
    textarea.style.height = `${Math.min(scrollHeight, maxHeight)}px`;
    textarea.style.overflowY = scrollHeight > maxHeight ? 'auto' : 'hidden';
  }

  function finalizeEdit(button, labelNode, textarea) {
    if (!labelNode || !textarea) return;
    const original = textarea.dataset.originalLabel || '';
    const nextValue = (textarea.value || '').replace(/\s+/g, ' ').trim();
    labelNode.textContent = nextValue || original;
    if (button) button.classList.remove(EDITING_CLASS);
    queueProofsOverrideRefresh();
  }

  function startEditing(button) {
    if (!button || button.classList.contains(EDITING_CLASS)) return;
    if (!isProofsRequiredPage()) return;
    if (isNoneButton(button)) return;

    commitAllEdits();

    const labelNode = ensureLabelClass(button);
    if (!labelNode) return;
    const currentText = (labelNode.textContent || '').replace(/\s+/g, ' ').trim();

    const textarea = document.createElement('textarea');
    textarea.className = TEXTAREA_CLASS;
    textarea.value = currentText;
    textarea.rows = 1;
    textarea.dataset.originalLabel = currentText;

    textarea.addEventListener('input', () => adjustTextareaSize(textarea, labelNode));
    textarea.addEventListener('mousedown', (event) => event.stopPropagation());
    textarea.addEventListener('click', (event) => event.stopPropagation());
    textarea.addEventListener('blur', () => finalizeEdit(button, labelNode, textarea));
    textarea.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        textarea.blur();
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        textarea.value = textarea.dataset.originalLabel || currentText;
        textarea.blur();
      }
    });

    labelNode.textContent = '';
    labelNode.appendChild(textarea);
    button.classList.add(EDITING_CLASS);

    requestAnimationFrame(() => {
      adjustTextareaSize(textarea, labelNode);
      textarea.focus();
      textarea.select();
    });
  }

  function commitAllEdits() {
    const editors = Array.from(document.querySelectorAll(`.${TEXTAREA_CLASS}`));
    for (const editor of editors) {
      const button = editor.closest(OPTION_SELECTOR);
      const labelNode = editor.parentElement;
      finalizeEdit(button, labelNode, editor);
    }
  }

  function writeProofsOverride(labels) {
    const payload = Array.isArray(labels) ? labels : [];
    try {
      document.documentElement.setAttribute('data-dnk-proofs-override', JSON.stringify(payload));
      document.documentElement.setAttribute('data-dnk-proofs-override-at', String(Date.now()));
    } catch {}
  }

  let proofsOverrideQueued = false;

  function updateProofsOverrideFromDom() {
    const labels = collectCheckedLabels();
    writeProofsOverride(labels ?? []);
  }

  function queueProofsOverrideRefresh() {
    if (proofsOverrideQueued) return;
    proofsOverrideQueued = true;
    requestAnimationFrame(() => {
      proofsOverrideQueued = false;
      updateProofsOverrideFromDom();
    });
  }

  function isElementVisible(element) {
    if (!element) return false;
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function collectCheckedLabels() {
    const options = Array.from(document.querySelectorAll(OPTION_SELECTOR));
    let sawNone = false;
    const labels = [];

    for (const option of options) {
      if (!isElementVisible(option)) continue;
      if (!hasCheckIcon(option)) continue;
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
  }

  function commitActiveEditsFromClick(event) {
    const editors = Array.from(document.querySelectorAll(`.${TEXTAREA_CLASS}`));
    if (!editors.length) return false;
    if (event?.target?.closest?.(`.${TEXTAREA_CLASS}`)) return false;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    for (const editor of editors) {
      if (document.activeElement === editor) {
        editor.blur();
      } else {
        const button = editor.closest(OPTION_SELECTOR);
        const labelNode = editor.parentElement;
        finalizeEdit(button, labelNode, editor);
      }
    }
    return true;
  }

  function onOptionClick(event) {
    if (!isProofsRequiredPage()) return;
    if (event.button !== 0) return;
    const button = event.currentTarget;
    if (!button) return;
    const editingButton = document.querySelector(`${OPTION_SELECTOR}.${EDITING_CLASS}`);
    const clickedCheckIcon = event?.target?.closest?.(CHECK_ICON_SELECTOR);
    const isChecked = isOptionChecked(button);
    if (editingButton && !clickedCheckIcon && !isAddAnotherButton(button)) {
      if (isChecked) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        return;
      }
    }
    if (isChecked && !clickedCheckIcon && !isAddAnotherButton(button)) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      return;
    }
    if (event?.target?.closest?.(`.${TEXTAREA_CLASS}`)) return;
    if (commitActiveEditsFromClick(event)) return;

    if (isNoneButton(button)) {
      if (hasCheckIcon(button)) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        markNoneClear();
        setNoneCleared(button, true);
        return;
      }
      clearNoneClear();
      setNoneCleared(button, false);
      return;
    }

    if (!isAddAnotherButton(button)) {
      const label = getOptionLabelRaw(button);
      const prompt = isChecked ? `Remove "${label}"?` : `Select "${label}"?`;
      const ok = window.confirm(prompt);
      if (!ok) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        return;
      }
    }

    clearNoneClear();
    queueProofsOverrideRefresh();
  }

  const observedButtons = new WeakSet();
  const observedOkButtons = new WeakSet();

  function attachOption(button) {
    ensureLabelClass(button);
    removePenIcons();
    if (isNoneButton(button)) {
      if (document.documentElement.hasAttribute(NONE_CLEAR_ATTR)) {
        setNoneCleared(button, true);
      } else {
        setNoneCleared(button, false);
      }
    }
    if (observedButtons.has(button)) return;
    observedButtons.add(button);
    button.addEventListener('click', onOptionClick, true);
    button.addEventListener('dblclick', (event) => {
      if (!isProofsRequiredPage()) return;
      if (event.button !== 0) return;
      if (isNoneButton(button) || isAddAnotherButton(button)) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      startEditing(button);
    }, true);
  }

  function attachOkButton() {
    if (!isProofsRequiredPage()) return;
    const buttons = Array.from(document.querySelectorAll('button'));
    const okButton = buttons.find((btn) => btn.classList.contains('Button-primary') && btn.textContent.trim() === 'OK');
    if (!okButton || observedOkButtons.has(okButton)) return;
    observedOkButtons.add(okButton);
    okButton.addEventListener('click', () => {
      commitAllEdits();
      updateProofsOverrideFromDom();
    }, true);
    okButton.addEventListener('pointerdown', () => {
      commitAllEdits();
      updateProofsOverrideFromDom();
    }, true);
  }

  function attachCustomProofInput() {
    if (!isProofsRequiredPage()) return;
    const input = document.getElementById(CUSTOM_PROOF_INPUT_ID);
    if (!input || input.dataset.dnkProofsBound) return;
    input.dataset.dnkProofsBound = 'true';
    input.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter') return;
      const value = (input.value || '').trim();
      if (value.length >= 3) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
    }, true);
  }

  function syncOptions() {
    if (!isProofsRequiredPage()) return;
    ensureStyles();
    removePenIcons();
    const options = document.querySelectorAll(OPTION_SELECTOR);
    options.forEach(attachOption);
    attachOkButton();
    attachCustomProofInput();
  }

  function startObserver() {
    if (!document.body) return;
    const observer = new MutationObserver(() => {
      syncOptions();
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  if (window.__doobneekProofsRequiredClickHandler) return;
  window.__doobneekProofsRequiredClickHandler = true;
  syncOptions();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startObserver);
  } else {
    startObserver();
  }
})();
