// Gallery (default) and map views of gallery/data/reconstructions.json. Image paths in it are relative to the site root.
// Interface text is in gallery/data/i18n.json; the toolbar, its dropdowns and the language choice are the viewer's.
import { loadLanguages, onLanguageChange, t, translate } from '../../viewer/js/i18n.js?v=i18n-1';
import { wireDropdowns, wireLanguageMenu } from '../../viewer/js/interface.js?v=app-tools-1';
import { inLanguage, make, openLink, previewImage } from './dom.js';

const $ = id => document.getElementById(id);
let items = [];
let mapView = null;

function showStatus(message) {
  $('status').textContent = message;
  $('status').hidden = false;
}

function card(entry) {
  const item = inLanguage(entry);
  const image = previewImage(item.preview, { width: 960, height: 600, loading: 'lazy' });
  const body = make('div', { className: 'card-body' },
    make('h2', { textContent: item.title }),
    make('p', { className: 'place', textContent: item.place }),
    make('p', { className: 'summary', textContent: item.summary }),
    make('ul', { className: 'tags' }, ...item.tags.map(tag => make('li', { textContent: tag }))));
  return make('li', {}, openLink(item.href, [image, body], { className: 'card' }));
}

// The map module, MapLibre and the basemap load only when the map is first shown.
function ensureMap() {
  mapView ||= import('./map.js').then(({ createMap }) => createMap($('map'), items)).catch(error => {
    console.error(error);
    mapView = null;
    showStatus(t('status.mapFailed'));
    throw error;
  });
  return mapView;
}

function setView(view, { remember = true } = {}) {
  for (const button of document.querySelectorAll('[data-view]')) button.setAttribute('aria-pressed', String(button.dataset.view === view));
  $('gallery-view').hidden = view !== 'gallery';
  $('map-view').hidden = view !== 'map';
  if (view === 'map' && items.length) ensureMap().then(({ map }) => map.resize()).catch(() => {});
  // A hash, not ?view=, because ?view= forwards old links to the Bundeshaus viewer.
  if (remember) history.replaceState(null, '', view === 'map' ? '#map' : location.pathname + location.search);
}

for (const button of document.querySelectorAll('[data-view]')) button.addEventListener('click', () => setView(button.dataset.view));
window.addEventListener('hashchange', () => setView(location.hash === '#map' ? 'map' : 'gallery', { remember: false }));

// Without its interface text the page stays in English and says why; the viewer treats a missing table the same way.
try {
  await loadLanguages(new URL('../data/i18n.json', import.meta.url));
} catch (error) {
  $('language-toggle').hidden = true;
  showStatus(location.protocol === 'file:'
    ? 'Open this page through a web server (for example: python tools/serve.py) to load the reconstructions.'
    : 'This page could not be loaded completely. Please reload it.');
  throw error;
}
translate(document);
document.title = t('page.title');
onLanguageChange(() => {
  document.title = t('page.title');
  if (items.length) $('gallery').replaceChildren(...items.map(card));
});
wireDropdowns();
wireLanguageMenu();

try {
  const response = await fetch(new URL('../data/reconstructions.json', import.meta.url));
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  items = (await response.json()).reconstructions;
  $('gallery').replaceChildren(...items.map(card));
} catch (error) {
  console.error(error);
  showStatus(t('status.listFailed'));
}
setView(location.hash === '#map' ? 'map' : 'gallery', { remember: false });
