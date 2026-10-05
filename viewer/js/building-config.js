// The building configuration loaded by boot.js. Shared by the viewer and the default policy.
let current = null;

export function setBuilding(config) { current = Object.freeze(config); }

export function building() {
  if (!current) throw new Error('The building configuration has not been loaded.');
  return current;
}

const idPattern = /^[a-z][a-z0-9-]*$/;
const isLocal = path => typeof path === 'string' && !/^[a-z]+:|^\/|(^|\/)\.\.(\/|$)/i.test(path);
const isPoint = value => Array.isArray(value) && value.length === 3 && value.every(Number.isFinite);

// Validates public/building.json. Returns a normalized copy or throws with all problems listed.
export function parseBuilding(data, baseUrl) {
  const issues = [];
  if (data?.schemaVersion !== 1) issues.push('schemaVersion must be 1');
  if (!idPattern.test(data?.id || '')) issues.push('id must be a lowercase slug');
  for (const key of ['name', 'place']) if (typeof data?.[key] !== 'string' || !data[key].trim()) issues.push(`${key} is required`);
  for (const key of ['models', 'about']) if (data?.[key] !== undefined && !isLocal(data[key])) issues.push(`${key} must be a local relative path`);
  const links = data?.links ?? [];
  if (!Array.isArray(links) || links.some(link => typeof link?.label !== 'string' || !/^https:\/\//.test(link?.href || ''))) issues.push('links must be {label, href} with https URLs');
  if (data?.downloads !== undefined && !/^https:\/\//.test(data.downloads)) issues.push('downloads must be an https URL');
  const walkStarts = data?.walkStarts ?? {};
  for (const [id, start] of Object.entries(walkStarts)) {
    if (!idPattern.test(id) || !isPoint(start?.position) || !isPoint(start?.target) || typeof start?.label !== 'string') issues.push(`walkStarts.${id} needs label, position and target`);
  }
  if (issues.length) throw new Error(`Invalid building configuration: ${issues.join('; ')}`);
  return { ...data, links, walkStarts, models: data.models || 'models/', baseUrl: String(baseUrl) };
}
