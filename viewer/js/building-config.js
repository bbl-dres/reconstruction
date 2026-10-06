// The building configuration loaded by boot.js. Shared by the viewer and the default policy.
let current = null;

export function setBuilding(config) { current = Object.freeze(config); }

export function building() {
  if (!current) throw new Error('The building configuration has not been loaded.');
  return current;
}

const idPattern = /^[a-z][a-z0-9-]*$/;
// Inside the configuration's own folder. The path is resolved and compared, not pattern-matched,
// so backslashes, encoded dots or a protocol cannot point elsewhere.
function isLocal(path, base) {
  if (typeof path !== 'string' || !path || /[\\%]/.test(path) || /^[a-z][a-z0-9+.-]*:/i.test(path) || path.startsWith('/')
    || /(^|\/)\.\.(\/|$)/.test(path)) return false;
  try {
    const folder = new URL('.', base), url = new URL(path, base);
    return url.origin === folder.origin && url.pathname.startsWith(folder.pathname);
  } catch { return false; }
}
const isHttps = value => typeof value === 'string' && /^https:\/\//.test(value);
const isPoint = value => Array.isArray(value) && value.length === 3 && value.every(Number.isFinite);

// Validates public/building.json. Returns a normalized copy or throws with all problems listed.
export function parseBuilding(data, baseUrl) {
  const issues = [];
  if (data?.schemaVersion !== 1) issues.push('schemaVersion must be 1');
  if (!idPattern.test(data?.id || '')) issues.push('id must be a lowercase slug');
  for (const key of ['name', 'place']) if (typeof data?.[key] !== 'string' || !data[key].trim()) issues.push(`${key} is required`);
  for (const key of ['models', 'about']) if (data?.[key] !== undefined && !isLocal(data[key], baseUrl)) issues.push(`${key} must be a path inside the building folder`);
  const links = data?.links ?? [];
  if (!Array.isArray(links) || links.some(link => typeof link?.label !== 'string' || !isHttps(link?.href))) issues.push('links must be {label, href} with https URLs');
  if (data?.downloads !== undefined && !isHttps(data.downloads)) issues.push('downloads must be an https URL');
  const walkStarts = data?.walkStarts ?? {};
  for (const [id, start] of Object.entries(walkStarts)) {
    if (!idPattern.test(id) || !isPoint(start?.position) || !isPoint(start?.target) || typeof start?.label !== 'string') issues.push(`walkStarts.${id} needs label, position and target`);
  }
  if (issues.length) throw new Error(`Invalid building configuration: ${issues.join('; ')}`);
  return { ...data, links, walkStarts, models: data.models || 'models/', baseUrl: String(baseUrl) };
}
