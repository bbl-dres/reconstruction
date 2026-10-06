import { language, t } from '../../viewer/js/i18n.js?v=i18n-1';

// A reconstruction in the current language: its translations override the English title, place, summary and tags.
export function inLanguage(item) {
  return { ...item, ...item.translations?.[language()] };
}

// Small element builder: text goes through textContent, never HTML. dataset sets data-* attributes.
export function make(tag, { dataset, ...props } = {}, ...children) {
  const node = Object.assign(document.createElement(tag), props);
  Object.assign(node.dataset, dataset);
  node.append(...children.filter(Boolean));
  return node;
}

// Reconstructions open in a new tab; screen readers are told so, in the current language.
export function openLink(href, label, props = {}) {
  return make('a', { href, target: '_blank', rel: 'noopener', ...props }, ...label,
    make('span', { className: 'sr-only', textContent: t('link.newTab'), dataset: { i18n: 'link.newTab' } }));
}

// Preview image with an optional fallback, used where the preferred image is
// not published (for example a local-only render).
export function previewImage(preview, props = {}) {
  const image = make('img', { src: preview.src, alt: preview.alt ?? '', ...props });
  if (preview.fallback) image.addEventListener('error', () => { image.src = preview.fallback; }, { once: true });
  return image;
}
