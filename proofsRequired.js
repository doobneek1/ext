(function () {
  'use strict';

  const OPTION_SELECTOR = 'button.Option, .Option[role="button"]';
  const CHECK_ICON_SELECTOR = 'svg.fa-check, svg[data-icon="check"]';
  const PROOFS_REQUIRED_PATH = /\/documents\/proofs-required\/?$/i;
  const HOST_RE = /(^|\.)gogetta\.nyc$/i;
  const NONE_LABEL = 'none';
  const STYLE_ID = 'dnk-proofs-required-style';
  const LABEL_CLASS = 'dnk-proofs-label';
  const ICONS_CLASS = 'dnk-proofs-icons';
  const PEN_CLASS = 'dnk-proofs-pen';
  const TEXTAREA_CLASS = 'dnk-proofs-textarea';
  const EDITING_CLASS = 'dnk-proofs-editing';
  const NONE_CLEAR_ATTR = 'data-gghost-proofs-none-clear';
  const NONE_CLEARED_ATTR = 'data-dnk-none-cleared';

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
button.Option .${ICONS_CLASS} {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-left: 8px;
  flex: 0 0 auto;
}
button.Option .${PEN_CLASS} {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  cursor: pointer;
  opacity: 0.7;
}
button.Option .${PEN_CLASS}:hover {
  opacity: 1;
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
button.Option.${EDITING_CLASS} .${PEN_CLASS} {
  display: none;
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

  function ensureIconContainer(button) {
    if (!button) return null;
    let container = button.querySelector(`.${ICONS_CLASS}`);
    if (!container) {
      container = document.createElement('div');
      container.className = ICONS_CLASS;
      button.appendChild(container);
    }
    return container;
  }

  function buildPenIcon() {
    const wrapper = document.createElement('span');
    wrapper.className = PEN_CLASS;
    wrapper.setAttribute('aria-hidden', 'true');
    wrapper.innerHTML = `
<svg aria-hidden="true" focusable="false" data-prefix="fas" data-icon="pen" class="svg-inline--fa fa-pen Icon" role="img" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <path fill="currentColor" d="M373.1 32.9c-25.5-25.5-66.8-25.5-92.3 0L80 233.7V432h198.3L479.1 231.1c25.5-25.5 25.5-66.8 0-92.2L373.1 32.9zM112 400v-90.7L302.8 118.6l90.6 90.6L202.6 400H112z"></path>
</svg>`;
    return wrapper;
  }

  function ensurePenIcon(button, container) {
    if (!button || !container) return;
    if (isNoneButton(button) || isAddAnotherButton(button)) {
      const existing = container.querySelector(`.${PEN_CLASS}`);
      if (existing) existing.remove();
      return;
    }
    if (container.querySelector(`.${PEN_CLASS}`)) return;
    const pen = buildPenIcon();
    pen.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      startEditing(button);
    });
    container.prepend(pen);
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
  }

  function startEditing(button) {
    if (!button || button.classList.contains(EDITING_CLASS)) return;
    if (!isProofsRequiredPage()) return;
    if (isNoneButton(button)) return;

    const labelNode = ensureLabelClass(button);
    if (!labelNode) return;
    const currentText = (labelNode.textContent || '').replace(/\s+/g, ' ').trim();

    const textarea = document.createElement('textarea');
    textarea.className = TEXTAREA_CLASS;
    textarea.value = currentText;
    textarea.rows = 1;
    textarea.dataset.originalLabel = currentText;

    textarea.addEventListener('input', () => adjustTextareaSize(textarea, labelNode));
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

  function commitActiveEditsFromClick(event) {
    const editors = Array.from(document.querySelectorAll(`.${TEXTAREA_CLASS}`));
    if (!editors.length) return false;
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

    clearNoneClear();
  }

  const observedButtons = new WeakSet();
  const observedOkButtons = new WeakSet();

  function attachOption(button) {
    ensureLabelClass(button);
    const container = ensureIconContainer(button);
    ensurePenIcon(button, container);
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
  }

  function attachOkButton() {
    if (!isProofsRequiredPage()) return;
    const buttons = Array.from(document.querySelectorAll('button'));
    const okButton = buttons.find((btn) => btn.classList.contains('Button-primary') && btn.textContent.trim() === 'OK');
    if (!okButton || observedOkButtons.has(okButton)) return;
    observedOkButtons.add(okButton);
    okButton.addEventListener('click', () => {
      commitAllEdits();
    }, true);
  }

  function syncOptions() {
    if (!isProofsRequiredPage()) return;
    ensureStyles();
    const options = document.querySelectorAll(OPTION_SELECTOR);
    options.forEach(attachOption);
    attachOkButton();
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
