// Map view: MapLibre GL JS with the CARTO Dark Matter vector basemap.
// Loaded on demand by main.js, so the gallery never pays for it.
import { LngLatBounds, Map, Marker, Popup } from '../vendor/maplibre-gl/maplibre-gl.mjs';
import { make, openLink, previewImage } from './dom.js';

const STYLE = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';
const HOME_ICON = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M4 11 12 4l8 7v9h-5v-6H9v6H4z"/></svg>';

// Zoom in, zoom out and home in one control group. MapLibre's own classes
// supply the zoom icons; home returns to the view of all reconstructions.
class NavigationWithHome {
  constructor(home) { this.home = home; }
  onAdd(map) {
    const button = (className, label, action, icon) => {
      const element = make('button', { type: 'button', className, title: label, ariaLabel: label });
      if (icon) element.innerHTML = icon;  // trusted constant, not data
      else element.append(make('span', { className: 'maplibregl-ctrl-icon', ariaHidden: 'true' }));
      element.addEventListener('click', action);
      return element;
    };
    this.container = make('div', { className: 'maplibregl-ctrl maplibregl-ctrl-group' },
      button('maplibregl-ctrl-zoom-in', 'Zoom in', () => map.zoomIn()),
      button('maplibregl-ctrl-zoom-out', 'Zoom out', () => map.zoomOut()),
      button('map-home', 'Show all reconstructions', this.home, HOME_ICON));
    return this.container;
  }
  onRemove() { this.container.remove(); }
}

export function createMap(container, items) {
  document.head.append(make('link', { rel: 'stylesheet', href: new URL('../vendor/maplibre-gl/maplibre-gl.css', import.meta.url).href }));
  const bounds = new LngLatBounds();
  for (const item of items) bounds.extend([item.location.lon, item.location.lat]);
  // Labels point away from the middle of the group (west of it: left, east: right),
  // so the padding for labels is symmetric and scales with the map width.
  const middle = items.reduce((sum, item) => sum + item.location.lon, 0) / items.length;
  const side = Math.min(200, Math.round(container.clientWidth * 0.28));
  const home = { padding: { top: 64, bottom: 64, left: side, right: side }, maxZoom: 16 };
  const map = new Map({
    container, style: STYLE, bounds, fitBoundsOptions: home,
    attributionControl: { compact: true },  // the CARTO tiles supply the CARTO and OpenStreetMap credit
  });
  map.addControl(new NavigationWithHome(() => map.fitBounds(bounds, home)), 'top-right');

  for (const item of items) {
    const popup = new Popup({ offset: 14, maxWidth: '260px' }).setDOMContent(make('div', { className: 'popup' },
      previewImage({ ...item.preview, alt: '' }),
      make('div', {}, make('strong', { textContent: item.title }), make('p', { textContent: item.location.address }),
        openLink(item.href, ['Open'], { className: 'popup-open' }))));
    const west = items.length > 1 && item.location.lon < middle;
    const label = make('button', { type: 'button', className: west ? 'marker marker-west' : 'marker', ariaLabel: `${item.title}, ${item.location.address}` },
      make('span', { textContent: item.title }));
    new Marker({ element: label, anchor: west ? 'right' : 'left', offset: [west ? 9 : -9, 0] })
      .setLngLat([item.location.lon, item.location.lat]).setPopup(popup).addTo(map);
  }
  return { map };
}
