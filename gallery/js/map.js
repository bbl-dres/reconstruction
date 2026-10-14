// Map view: MapLibre GL JS with the CARTO Dark Matter vector basemap.
// Loaded on demand by main.js, so the gallery never pays for it.
import { LngLatBounds, Map, Marker, Popup } from '../vendor/maplibre-gl/maplibre-gl.mjs';
import { onLanguageChange, t } from '../../viewer/js/i18n.js?v=i18n-2';
import { inLanguage, make, openLink, previewImage } from './dom.js?v=2';

const STYLE = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';
const HOME_ICON = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M4 11 12 4l8 7v9h-5v-6H9v6H4z"/></svg>';

// Zoom in, zoom out and home in one control group. MapLibre's own classes
// supply the zoom icons; home returns to the view of all reconstructions.
// Labels follow the language: translate() updates them through data-i18n-attr.
class NavigationWithHome {
  constructor(home) { this.home = home; }
  onAdd(map) {
    const button = (className, key, action, icon) => {
      const element = make('button', { type: 'button', className, title: t(key), ariaLabel: t(key), dataset: { i18nAttr: `title:${key} aria-label:${key}` } });
      if (icon) element.innerHTML = icon;  // trusted constant, not data
      else element.append(make('span', { className: 'maplibregl-ctrl-icon', ariaHidden: 'true' }));
      element.addEventListener('click', action);
      return element;
    };
    this.container = make('div', { className: 'maplibregl-ctrl maplibregl-ctrl-group' },
      button('maplibregl-ctrl-zoom-in', 'map.zoomIn', () => map.zoomIn()),
      button('maplibregl-ctrl-zoom-out', 'map.zoomOut', () => map.zoomOut()),
      button('map-home', 'map.home', this.home, HOME_ICON));
    return this.container;
  }
  onRemove() { this.container.remove(); }
}

// Each label points away from its nearest neighbour, so close markers never cover each other.
function labelsWest(items) {
  const distance = (a, b) => Math.hypot((a.lon - b.lon) * Math.cos(a.lat * Math.PI / 180), a.lat - b.lat);
  return items.map(item => {
    const others = items.filter(other => other !== item);
    if (!others.length) return false;
    const nearest = others.reduce((best, other) => distance(item.location, other.location) < distance(item.location, best.location) ? other : best);
    return item.location.lon < nearest.location.lon;
  });
}

// onError reports a map that cannot show its basemap. The returned show() fits the view the first
// time the map is visible: created while hidden, it has no size to fit.
export function createMap(container, items, { onError = () => {}, onReady = () => {} } = {}) {
  document.head.append(make('link', { rel: 'stylesheet', href: new URL('../vendor/maplibre-gl/maplibre-gl.css', import.meta.url).href }));
  const bounds = new LngLatBounds();
  for (const item of items) bounds.extend([item.location.lon, item.location.lat]);
  // Room for the labels on both sides, scaled to the map's current width.
  const home = () => {
    const side = Math.min(200, Math.round(container.clientWidth * 0.28));
    return { padding: { top: 64, bottom: 64, left: side, right: side }, maxZoom: 16 };
  };
  const map = new Map({
    container, style: STYLE, bounds, fitBoundsOptions: home(),
    attributionControl: { compact: true },  // the CARTO tiles supply the CARTO and OpenStreetMap credit
    locale: { 'Popup.Close': t('map.close'), 'Map.Title': t('view.map') },
  });
  map.addControl(new NavigationWithHome(() => map.fitBounds(bounds, home())), 'top-right');
  // Tile and style failures arrive as error events; before the style has loaded, there is no map.
  map.on('error', event => { if (!map.isStyleLoaded()) onError(event.error); });
  map.once('load', onReady);
  let fitted = container.clientWidth > 0;

  const west = labelsWest(items);
  const markers = items.map((item, index) => {
    const popup = new Popup({ offset: 14, maxWidth: '260px' });
    const title = make('strong'), open = make('span'), openTitle = make('span', { className: 'sr-only' });
    popup.setDOMContent(make('div', { className: 'popup' },
      previewImage({ ...item.preview, alt: '' }),
      make('div', {}, title, make('p', { textContent: item.location.address }),
        openLink(item.href, [open, openTitle], { className: 'popup-open' }))));
    const label = make('button', { type: 'button', className: west[index] ? 'marker marker-west' : 'marker' }, make('span'));
    const closeButton = () => popup.getElement()?.querySelector('.maplibregl-popup-close-button');
    popup.on('open', () => {
      closeButton()?.setAttribute('aria-label', t('map.close'));
      popup.getElement().addEventListener('keydown', event => { if (event.key === 'Escape') popup.remove(); });
    });
    // Closed from inside, focus would fall to the page: it returns to the marker.
    popup.on('close', () => { if (!document.activeElement || document.activeElement === document.body) label.focus({ preventScroll: true }); });
    new Marker({ element: label, anchor: west[index] ? 'right' : 'left', offset: [west[index] ? 9 : -9, 0] })
      .setLngLat([item.location.lon, item.location.lat]).setPopup(popup).addTo(map);
    return { item, label, title, open, openTitle, closeButton };
  });
  // Labels and popups show each reconstruction in the current language, updated in place.
  const relabel = () => {
    map.getCanvas().setAttribute('aria-label', t('view.map'));
    for (const { item, label, title, open, openTitle, closeButton } of markers) {
      const local = inLanguage(item);
      label.ariaLabel = `${local.title}, ${item.location.address}`;
      label.firstChild.textContent = local.title;
      title.textContent = local.title;
      open.textContent = t('map.open');
      openTitle.textContent = ` ${local.title}`;
      closeButton()?.setAttribute('aria-label', t('map.close'));
    }
  };
  relabel();
  onLanguageChange(relabel);
  return {
    map,
    show() {
      map.resize();
      if (!fitted && container.clientWidth > 0) { fitted = true; map.fitBounds(bounds, { ...home(), animate: false }); }
    },
  };
}
