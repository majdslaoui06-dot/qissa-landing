/* Charger ce script avec defer, après app.js, sur chaque page du site. */
(() => {
  const base = new URL('.', document.currentScript.src);
  const style = document.createElement('style');
  style.textContent = '.qissa-animated-logo{display:block;width:130px;height:59px;border:0;pointer-events:none;flex-shrink:0}footer .qissa-animated-logo{width:150px;height:68px}';
  document.head.append(style);
  for (const image of document.querySelectorAll('img[src*="logo-qissa.png"]')) {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      image.src = new URL('logo-qissa-blanc.png', base).href;
      image.style.objectFit = 'contain';
      continue;
    }
    const frame = document.createElement('iframe');
    frame.src = new URL('qissa-logo-anime.html', base).href;
    frame.title = 'Qissa';
    frame.className = 'qissa-animated-logo';
    if (image.closest('footer')) frame.loading = 'lazy';
    frame.tabIndex = -1;
    frame.setAttribute('aria-hidden', 'true');
    frame.setAttribute('scrolling', 'no');
    image.replaceWith(frame);
  }
})();
