// 🌐 Add "Powered by doobneek.org" attribution with only the domain hyperlinked
(function injectDoobneekAttribution() {
  if (document.querySelector('[data-doobneek-container]')) return;

  const container = document.createElement('div');
  container.setAttribute('data-doobneek-container', 'true');
  container.style.position = 'fixed';
  container.style.bottom = '8px';
  container.style.right = '12px';
  container.style.zIndex = '9999';
  container.style.fontSize = '11px';
  container.style.opacity = '0.6';
  container.style.color = '#333';
  container.style.fontFamily = 'sans-serif';
  container.style.pointerEvents = 'auto';

  container.innerHTML = `Powered by <a href="http://localhost:3210" target="_blank" rel="noopener noreferrer" style="color: #0066cc; text-decoration: underline;">doobneek.org</a>`;

  container.addEventListener('mouseover', () => container.style.opacity = '1');
  container.addEventListener('mouseout', () => container.style.opacity = '0.6');

  document.body.appendChild(container);
})();
