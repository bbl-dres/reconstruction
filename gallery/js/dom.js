// Small element builder: text goes through textContent, never HTML.
export function make(tag, props = {}, ...children) {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children.filter(Boolean));
  return node;
}

// Reconstructions open in a new tab; screen readers are told so.
export function openLink(href, label, props = {}) {
  return make('a', { href, target: '_blank', rel: 'noopener', ...props }, ...label, make('span', { className: 'sr-only', textContent: ' (opens in a new tab)' }));
}

// Preview image with an optional fallback, used where the preferred image is
// not published (for example a local-only render).
export function previewImage(preview, props = {}) {
  const image = make('img', { src: preview.src, alt: preview.alt ?? '', ...props });
  if (preview.fallback) image.addEventListener('error', () => { image.src = preview.fallback; }, { once: true });
  return image;
}
