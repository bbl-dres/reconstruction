const MODES = new Set(['orbit', 'dollhouse', 'plan']);
const LEVELS = new Set(['all', 'entrance', 'lower', 'principal', 'upper']);
const BASES = new Set(['authored', 'inferred', 'measured']);
const CONFIDENCES = new Set(['low', 'medium', 'high']);
const text = (value, limit = 1500) => typeof value === 'string' ? value.slice(0, limit) : '';
const vector = value => Array.isArray(value) && value.length === 3 && value.every(number => Number.isFinite(number) && Math.abs(number) <= 1000000);
const validId = id => typeof id === 'string' && /^[a-zA-Z0-9_-]{1,120}$/.test(id);

export function parseMetadata(data, allowedLevels = LEVELS) {
  const levels = new Set(allowedLevels);
  if (data?.schemaVersion !== 1 || data.coordinates !== 'gltf-y-up-meters') throw new Error('Unsupported viewer metadata format.');
  const issues = [];
  const ids = new Set();
  const normalizeView = entry => {
    const camera = entry?.camera;
    if (!validId(entry?.id) || !text(entry.title) || ids.has(entry.id) || !MODES.has(camera?.mode)
      || (camera.level && !levels.has(camera.level))
      || (camera.mode === 'plan' && (!camera.level || camera.level === 'all'))
      || (camera.frame && !['building', 'site', 'level'].includes(camera.frame))
      || (camera.frame === 'site' && camera.mode !== 'orbit')
      || (camera.frame && (camera.position || camera.target))
      || (!camera.frame && (!vector(camera.position) || !vector(camera.target)
        || camera.position.every((value, i) => value === camera.target[i])))
      || (camera.mode === 'plan' && !camera.frame && !(Number.isFinite(camera.height) && camera.height > 0))) {
      issues.push(`Skipped invalid or duplicate view: ${text(entry?.id) || 'unnamed'}`);
      return null;
    }
    ids.add(entry.id);
    return { id: text(entry.id, 120), title: text(entry.title, 120), description: text(entry.description), camera };
  };
  const normalizeList = entries => Array.isArray(entries) ? entries.map(normalizeView).filter(Boolean) : [];
  const views = normalizeList(data.views);
  const pointsOfInterest = normalizeList(data.pointsOfInterest);
  const objects = new Map();
  for (const entry of Array.isArray(data.objects) ? data.objects : []) {
    if (!validId(entry?.id) || objects.has(entry.id)) { issues.push('Skipped object without a unique ID.'); continue; }
    const properties = [];
    for (const p of Array.isArray(entry.properties) ? entry.properties : []) {
      if (!p || !text(p.label) || !text(p.value) || !text(p.source) || !BASES.has(p.basis)
        || (p.basis === 'inferred' && !CONFIDENCES.has(p.confidence))) {
        issues.push(`Skipped a property without valid evidence on ${entry.id}.`);
        continue;
      }
      properties.push({ label: text(p.label, 120), value: text(p.value), basis: p.basis, confidence: p.confidence, source: text(p.source) });
    }
    objects.set(entry.id, { id: text(entry.id, 120), title: text(entry.title, 120), properties });
  }
  return { views, pointsOfInterest, objects, issues };
}

export function describeElement(mesh, metadata) {
  const id = mesh.userData.viewer_id || '';
  const authored = metadata?.objects.get(id);
  const name = mesh.userData.viewer_source_name || mesh.name || 'Building element';
  const patterns = [
    [/door|portal/i, 'Door'], [/window|glaz/i, 'Window'], [/statue|sculpture|bust|figure/i, 'Sculpture'],
    [/chair|seat|desk|table|bench|cabinet|sofa|furniture/i, 'Furniture'],
    [/wall|partition|enclosure/i, 'Wall'], [/floor|parquet|pavement/i, 'Floor'],
    [/stair|landing/i, 'Stair'], [/ceiling|coffer/i, 'Ceiling'], [/roof|dome/i, 'Roof / dome'],
    [/column|pier|beam/i, 'Structure'],
  ];
  const category = patterns.find(([pattern]) => pattern.test(name))?.[1];
  const size = mesh.userData.bounds?.getSize(mesh.position.clone().set(0, 0, 0));
  const properties = [...(authored?.properties || [])];
  const data = mesh.userData;
  const inferred = data.viewer_classification_basis === 'inferred';
  const classificationValid = !inferred || (CONFIDENCES.has(data.viewer_classification_confidence) && text(data.viewer_classification_source));
  if (classificationValid) {
    const supplied = [
      ['Category', text(data.viewer_category).replaceAll('-', ' ')],
      ['Family', data.viewer_family_name || data.viewer_family_id],
      ['Type', data.viewer_type_name || data.viewer_type_id],
      ['Placement', data.viewer_environment],
    ];
    for (const [label, value] of supplied) if (text(value) && !properties.some(property => property.label.toLowerCase() === label.toLowerCase())) {
      properties.push({ label, value: text(value), basis: inferred ? 'inferred' : 'authored',
        confidence: inferred ? data.viewer_classification_confidence : undefined,
        source: text(data.viewer_classification_source) || 'Classification supplied in model custom properties; not independently verified.' });
    }
  }
  if (!properties.some(p => p.label.toLowerCase() === 'category')) properties.unshift({
    label: 'Category', value: category || 'Unclassified element', basis: 'inferred', confidence: category ? 'medium' : 'low', source: 'Estimated from the object name; not a verified BIM classification.',
  });
  if (size) properties.push({ label: 'Model extent · X × Y × Z', value: `${size.x.toFixed(2)} × ${size.y.toFixed(2)} × ${size.z.toFixed(2)} m`, basis: 'measured', source: 'World-aligned bounds of the full mesh. Approximate extent, not a surveyed dimension or the visible cut section.' });
  return { title: authored?.title || name, sourceName: name, id, properties };
}
