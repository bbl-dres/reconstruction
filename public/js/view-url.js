// No DOM or Three.js dependency: links are validated before touching a camera.
const modes = { '3d': 'orbit', orbit: 'orbit', dollhouse: 'dollhouse', floorplan: 'plan', plan: 'plan', walk: 'walk' };
const names = { orbit: '3d', dollhouse: 'dollhouse', plan: 'floorplan', walk: 'walk' };
const keys = ['view', 'floor', 'pos', 'target', 'zoom', 'height', 'orbit', 'cut', 'surroundings', 'muted'];
const vector = value => {
  if (!value) return null;
  const parts = value.split(',');
  if (parts.length !== 3 || parts.some(part => !part.trim())) return null;
  const numbers = parts.map(Number);
  return numbers.every(n => Number.isFinite(n) && Math.abs(n) <= 10000) ? numbers : null;
};
const number = (value, min, max, fallback) => value !== null && value.trim() !== '' && Number.isFinite(Number(value)) && Number(value) >= min && Number(value) <= max ? Number(value) : fallback;

export function readViewURL(url, levels = ['all', 'entrance', 'lower', 'principal', 'upper']) {
  const p = new URL(url).searchParams;
  if (!keys.some(key => p.has(key))) return null;
  const mode = modes[p.get('view')] || 'dollhouse';
  const floor = levels.includes(p.get('floor')) ? p.get('floor') : 'all';
  const position = vector(p.get('pos')), target = vector(p.get('target'));
  const distance = position && target ? Math.hypot(...position.map((n, i) => n - target[i])) : 0;
  const height = number(p.get('height'), 0.01, 20000, null);
  const orbit = vector(p.get('orbit'));
  return { mode, level: mode === 'plan' && floor === 'all' ? (levels.includes('principal') ? 'principal' : levels.find(level => level !== 'all')) : floor,
    snapshot: distance >= 0.01 && (mode !== 'plan' || height !== null) ? {
      position, target, zoom: number(p.get('zoom'), mode === 'plan' ? 0.4 : 0.05, mode === 'plan' ? 12 : 20, 1), halfHeight: height === null ? null : height / 2,
    } : null,
    orbit: orbit && Math.hypot(...orbit) > 0.001 ? orbit : null,
    cut: number(p.get('cut'), 0.5, 8, 2),
    surroundings: p.has('surroundings') ? p.get('surroundings') !== '0' : undefined,
    muted: p.has('muted') ? p.get('muted') !== '0' : undefined,
  };
}

export function writeViewURL(url, view) {
  const result = new URL(url), p = result.searchParams;
  const rounded = n => Number(n.toFixed(5)).toString();
  const vec = values => values.map(rounded).join(',');
  p.set('version', view.version);
  p.set('view', names[view.mode]);
  p.set('floor', view.level);
  p.set('pos', vec(view.position)); p.set('target', vec(view.target));
  p.set('zoom', rounded(view.zoom));
  if (view.mode === 'plan') { p.set('height', rounded(view.halfHeight * 2)); p.set('orbit', vec(view.orbit)); }
  else { p.delete('height'); p.delete('orbit'); }
  p.set('cut', rounded(view.cut));
  p.set('surroundings', view.surroundings ? '1' : '0'); p.set('muted', view.muted ? '1' : '0');
  return result;
}
