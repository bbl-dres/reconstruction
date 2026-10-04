// Gallery (default) and map views of data/reconstructions.json.
import { make, openLink, previewImage } from './dom.js';

const $ = id => document.getElementById(id);
let items = [];
let mapView = null;

function showStatus(message) {
  $('status').textContent = message;
  $('status').hidden = false;
}

function card(item) {
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
    showStatus('The map could not be loaded. Check the connection to the basemap service, or use the gallery.');
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

try {
  const response = await fetch('data/reconstructions.json');
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  items = (await response.json()).reconstructions;
  $('gallery').replaceChildren(...items.map(card));
} catch (error) {
  console.error(error);
  showStatus(location.protocol === 'file:'
    ? 'Open this page through a web server (for example: python -m http.server) to load the reconstructions.'
    : 'The list of reconstructions could not be loaded. Please reload the page.');
}
setView(location.hash === '#map' ? 'map' : 'gallery', { remember: false });
