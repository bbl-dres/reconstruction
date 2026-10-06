// Gallery (default) and map views of gallery/data/reconstructions.json. Image paths in it are relative to the site root.
// Interface text is in gallery/data/i18n.json; the toolbar, its dropdowns and the language choice are the viewer's.
import { loadLanguages, onLanguageChange, t, translate } from '../../viewer/js/i18n.js?v=i18n-2';
import { wireDropdowns, wireLanguageMenu } from '../../viewer/js/interface.js?v=app-tools-3';
import { inLanguage, make, openLink, previewImage } from './dom.js?v=2';
import { ENGLISH } from './english.js?v=1';

const $ = id => document.getElementById(id);
let items = [];
let mapView = null;
let status = null;

// One status line: a message keeps its key, so it follows the language and its cause can clear it.
function showStatus(key) {
  status = key;
  $('status').textContent = t(key);
  $('status').hidden = false;
}
function clearStatus(key) {
  if (status !== key) return;
  status = null;
  $('status').hidden = true;
}

// The first row loads at once and first: it is what the visitor sees before scrolling.
function card(entry, index) {
  const item = inLanguage(entry);
  const image = previewImage(item.preview, { width: 960, height: 600, loading: index < 3 ? 'eager' : 'lazy', fetchPriority: index === 0 ? 'high' : 'auto' });
  const body = make('div', { className: 'card-body' },
    make('h2', { textContent: item.title }),
    make('p', { className: 'place', textContent: item.place }),
    make('p', { className: 'summary', textContent: item.summary }),
    make('ul', { className: 'tags' }, ...item.tags.map(tag => make('li', { textContent: tag }))));
  return make('li', {}, openLink(item.href, [image, body], { className: 'card' }));
}

// The map module, MapLibre and the basemap load only when the map is first shown. A module that
// failed to load stays failed until the page reloads, which the message says.
function ensureMap() {
  mapView ||= import('./map.js?v=2').then(({ createMap }) => createMap($('map'), items, {
    onError: error => { console.error(error); showStatus('status.mapFailed'); },
    onReady: () => clearStatus('status.mapFailed'),
  })).catch(error => {
    console.error(error);
    showStatus('status.mapFailed');
    throw error;
  });
  return mapView;
}

function setView(view, { remember = true } = {}) {
  for (const button of document.querySelectorAll('[data-view]')) button.setAttribute('aria-pressed', String(button.dataset.view === view));
  $('gallery-view').hidden = view !== 'gallery';
  $('map-view').hidden = view !== 'map';
  if (view === 'map' && items.length) ensureMap().then(map => map.show()).catch(() => {});
  // A hash, not ?view=, because ?view= forwards old links to the Bundeshaus viewer.
  if (remember) history.replaceState(null, '', view === 'map' ? '#map' : location.pathname + location.search);
}

for (const button of document.querySelectorAll('[data-view]')) button.addEventListener('click', () => setView(button.dataset.view));
window.addEventListener('hashchange', () => setView(location.hash === '#map' ? 'map' : 'gallery', { remember: false }));
// The toolbar works at once: a popover opened before the translations arrive is placed correctly.
wireDropdowns();

const [translated, list] = await Promise.all([
  loadLanguages(new URL('../data/i18n.json', import.meta.url), { en: ENGLISH }),
  fetch(new URL('../data/reconstructions.json', import.meta.url)).then(response => {
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  }).catch(error => { console.error(error); return null; }),
]);
if (translated) {
  translate(document);
  wireLanguageMenu();
} else $('language-toggle').hidden = true;  // English only
document.title = t('page.title');
onLanguageChange(() => {
  document.title = t('page.title');
  if (status) showStatus(status);
  if (items.length) $('gallery').replaceChildren(...items.map(card));
});

if (list) {
  items = list.reconstructions;
  $('gallery').replaceChildren(...items.map(card));
} else showStatus('status.listFailed');
setView(location.hash === '#map' ? 'map' : 'gallery', { remember: false });
