const levels = new Set(['all', 'entrance', 'lower', 'principal', 'upper']);
function validLevelDefinitions(model) {
  if (model.levelDefinitions === undefined) return model.levels.every(level => levels.has(level));
  const definitions = model.levelDefinitions;
  if (!definitions || typeof definitions !== 'object' || Array.isArray(definitions)) return false;
  return new Set(model.levels).size === model.levels.length && model.levels.every(id => typeof id === 'string' && (id === 'all' || (/^[a-z][a-z0-9-]*$/.test(id) && (() => {
    const d = Object.hasOwn(definitions, id) && definitions[id];
    return d && typeof d.label === 'string' && d.label.trim().length > 0
      && [d.elevation, d.min, d.max].every(Number.isFinite)
      && d.min <= d.elevation && d.elevation < d.max;
  })())));
}
function parseLocation(value) {
  if (!value || !Number.isFinite(value.latitude) || Math.abs(value.latitude) > 90
    || !Number.isFinite(value.longitude) || Math.abs(value.longitude) > 180
    || !Number.isFinite(value.enuToModelDegrees) || Math.abs(value.enuToModelDegrees) > 360
    || typeof value.timeZone !== 'string') return null;
  try { new Intl.DateTimeFormat('en-GB', { timeZone: value.timeZone }); } catch { return null; }
  return value;
}
export function parseCatalog(data) {
  if (data?.schemaVersion !== 1 || !Array.isArray(data.models)) throw new Error('Unsupported model catalog.');
  const seen = new Set();
  // Explicit local paths; URLs and traversal are not model catalog assets.
  const asset = (value, extension) => typeof value === 'string' && /^\.\/[a-zA-Z0-9_/-]+\.[a-z0-9]+(?:\.gz)?$/.test(value)
    && (value.endsWith(extension) || (extension === '.glb' && value.endsWith('.glb.gz')));
  const models = data.models.filter(model => {
    if (!model || typeof model.id !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(model.id) || seen.has(model.id)
      || !Number.isInteger(model.version) || model.version < 1 || typeof model.label !== 'string'
      || !asset(model.building, '.glb') || !asset(model.surroundings, '.glb') || !asset(model.metadata, '.json')
      || (model.bim !== undefined && !asset(model.bim, '.json')) || (model.ifc !== undefined && !asset(model.ifc, '.ifczip'))
      || !Array.isArray(model.levels) || !model.levels.includes('all') || !validLevelDefinitions(model)) return false;
    seen.add(model.id);
    return true;
  });
  if (!models.length) throw new Error('No usable model versions in the catalog.');
  return models.map(model => ({ ...model, location: parseLocation(model.location) })).sort((a, b) => b.version - a.version);
}

export function chooseModel(models, requestedId) {
  return models.find(model => model.id === requestedId) || models[0];
}
