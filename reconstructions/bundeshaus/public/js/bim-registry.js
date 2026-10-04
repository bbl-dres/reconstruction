import { Box3, Matrix4, Vector3 } from 'three';

// Rendering batches are deliberately absent from this index. Physical counts
// and identity survive visibility, clipping, material changes and batch rebuilds.
export function parseBimRegistry(data, meshes, catalog) {
  const require = (ok, message) => { if (!ok) throw new Error(`BIM registry: ${message}`); };
  const finite = Number.isFinite;
  const index = (rows, label) => {
    require(Array.isArray(rows), `${label} must be an array`);
    const result = new Map();
    for (const row of rows) {
      require(row && typeof row.id === 'string' && row.id.length > 0 && row.id.length <= 256 && !result.has(row.id), `${label} missing or duplicate ID`);
      result.set(row.id, row);
    }
    return result;
  };
  const matrix = values => {
    require(Array.isArray(values) && values.length === 16 && values.every(finite), 'invalid matrix');
    require([3, 7, 11].every(i => Math.abs(values[i]) < 1e-9) && Math.abs(values[15] - 1) < 1e-9, 'non-affine matrix');
    const m = new Matrix4().fromArray(values);
    require(Math.abs(m.determinant()) > 1e-12, 'singular matrix');
    return m;
  };
  require(data?.schemaVersion === 1 && data.units === 'm' && data.coordinateSystem === 'glTF-Y-up', 'unsupported format');
  require(data.modelId === catalog.id && /^[0-9a-f]{64}$/.test(data.sourceSha256) && data.sourceSha256 === catalog.sourceSha256, 'wrong model revision');
  require(finite(data.conversionTolerance) && data.conversionTolerance > 0 && data.conversionTolerance <= 0.001, 'invalid tolerance');
  const elements = index(data.elements, 'elements'), types = index(data.types, 'types'), families = index(data.families, 'families');
  const storeys = index(data.storeys, 'storeys'), openings = index(data.openings, 'openings');
  const allIds = [...elements.keys(), ...types.keys(), ...families.keys(), ...storeys.keys(), ...openings.keys()];
  require(new Set(allIds).size === allIds.length, 'ID namespace collision');
  require(elements.size && types.size && storeys.size, 'empty registry');
  for (const s of storeys.values()) require(finite(s.elevation), 'invalid storey elevation');
  for (const t of types.values()) require(families.has(t.familyId) && elements.get(t.prototypeElementId)?.typeId === t.id && Number.isInteger(t.revision) && t.revision > 0, 'unresolved type reference');
  const source = new Map();
  for (const mesh of meshes) {
    const id = mesh.userData.viewer_id;
    require(typeof id === 'string' && !source.has(id), 'missing or duplicate source component'); source.set(id, mesh);
  }
  const owners = new Map(), members = new Map(), bounds = new Map();
  const actual = new Matrix4(), a = new Vector3(), b = new Vector3();
  for (const e of elements.values()) {
    const type = types.get(e.typeId);
    require(type && families.get(type.familyId)?.category === e.category, 'unresolved type or category mismatch');
    require(e.membership === 'reviewed' && storeys.has(e.primaryStorey), 'unreviewed membership or unknown storey');
    require(Array.isArray(e.storeyRefs) && new Set(e.storeyRefs).size === e.storeyRefs.length && e.storeyRefs.every(id => id !== e.primaryStorey && storeys.has(id)), 'invalid spatial references');
    require(Array.isArray(e.roomIds) && e.roomIds.every(id => typeof id === 'string'), 'invalid room references');
    require(e.evidence && ['authored', 'inferred'].includes(e.evidence.basis) && ['low', 'medium', 'high'].includes(e.evidence.confidence) && typeof e.evidence.source === 'string', 'missing evidence');
    require(Array.isArray(e.bounds) && e.bounds.length === 2 && e.bounds.every(p => Array.isArray(p) && p.length === 3 && p.every(finite)) && e.bounds[0].every((x, i) => x <= e.bounds[1][i]), 'invalid bounds');
    const root = matrix(e.rootMatrix), list = [], slots = new Set();
    require(Array.isArray(e.components) && e.components.length, 'empty assembly');
    for (const c of e.components) {
      require(!owners.has(c.id) && source.has(c.id), 'missing component or multiple product owners');
      require(Number.isInteger(c.slot) && c.slot >= 0 && !slots.has(c.slot), 'invalid component slot'); slots.add(c.slot);
      const mesh = source.get(c.id); actual.multiplyMatrices(root, matrix(c.localMatrix));
      if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
      const box = mesh.geometry.boundingBox;
      for (let corner = 0; corner < 8; corner++) {
        a.set(corner & 1 ? box.max.x : box.min.x, corner & 2 ? box.max.y : box.min.y, corner & 4 ? box.max.z : box.min.z);
        b.copy(a).applyMatrix4(mesh.matrixWorld); a.applyMatrix4(actual);
        require(a.distanceTo(b) <= data.conversionTolerance, `transform mismatch for ${c.id}`);
      }
      owners.set(c.id, e); list.push(mesh);
    }
    for (const [name, q] of Object.entries(e.quantities || {})) {
      require(['openingArea', 'outerFrameArea', 'netGlazingArea', 'floorArea'].includes(name), 'unknown quantity');
      if (q !== null) require(q && finite(q.value) && q.value >= 0 && q.unit === 'm2' && typeof q.method === 'string' && typeof q.source === 'string', 'invalid typed area');
    }
    let ancestor = e; const chain = new Set([e.id]);
    while (ancestor.parentId) {
      require(elements.has(ancestor.parentId) && !chain.has(ancestor.parentId), 'cyclic or unresolved parent');
      chain.add(ancestor.parentId); ancestor = elements.get(ancestor.parentId);
    }
    members.set(e.id, list); bounds.set(e.id, new Box3(new Vector3().fromArray(e.bounds[0]), new Vector3().fromArray(e.bounds[1])));
  }
  const unresolved = index(data.unresolvedComponents, 'unresolved components');
  require(owners.size + unresolved.size === source.size && [...unresolved.keys()].every(id => source.has(id) && !owners.has(id)), 'incomplete component coverage');
  const fillingIds = new Set();
  for (const o of openings.values()) {
    require(elements.get(o.hostId)?.ifcClass === 'IfcWall' && ['IfcWindow', 'IfcDoor'].includes(elements.get(o.fillingId)?.ifcClass) && elements.get(o.fillingId)?.openingId === o.id && !fillingIds.has(o.fillingId), 'unresolved/ambiguous opening');
    fillingIds.add(o.fillingId); matrix(o.rootMatrix);
    require(finite(o.depth) && o.depth > 0 && Array.isArray(o.profile) && o.profile.length >= 3 && o.profile.every(p => Array.isArray(p) && p.length === 2 && p.every(finite)), 'invalid opening profile');
  }
  for (const e of elements.values()) require(!e.openingId || openings.has(e.openingId), 'unresolved product opening');
  require(Array.isArray(data.coverage), 'missing coverage');
  const coverage = new Map();
  for (const c of data.coverage) {
    require(c && typeof c.category === 'string' && !coverage.has(c.category) && ['partial', 'complete-modeled-category'].includes(c.status) && typeof c.scope === 'string', 'invalid coverage');
    require(c.status !== 'complete-modeled-category' || ![...unresolved.values()].some(u => u.category === c.category), 'complete category still has unresolved components');
    coverage.set(c.category, c);
  }
  for (const e of elements.values()) require(coverage.has(e.category), 'missing category coverage');
  const counts = [...coverage.values()].map(c => {
    const products = [...elements.values()].filter(e => e.category === c.category);
    const areas = {};
    for (const key of ['openingArea', 'outerFrameArea', 'netGlazingArea', 'floorArea']) {
      const known = products.filter(e => e.quantities?.[key] !== null && e.quantities?.[key] !== undefined);
      areas[key] = { value: known.length ? known.reduce((n, e) => n + e.quantities[key].value, 0) : null, unit: 'm2', known: known.length, registered: products.length };
    }
    return { category: c.category, count: products.length, status: c.status, scope: c.scope, areas };
  });
  const representatives = [...elements.values()].map(e => members.get(e.id)[0]).concat([...unresolved.keys()].map(id => source.get(id)));
  return { data, elements, types, families, counts, representatives,
    product: mesh => owners.get(mesh.userData.viewer_id) || null,
    members: mesh => members.get(owners.get(mesh.userData.viewer_id)?.id) || [mesh],
    bounds: mesh => bounds.get(owners.get(mesh.userData.viewer_id)?.id) || mesh.userData.bounds,
  };
}

export function describeProduct(mesh, registry) {
  const e = registry?.product(mesh); if (!e) return null;
  const type = registry.types.get(e.typeId), family = registry.families.get(type.familyId);
  const prop = (label, value, basis = 'authored', source = e.evidence.source) => ({ label, value: String(value), basis, source, confidence: e.evidence.confidence });
  const label = key => ({ stationId: 'Station ID', seatNumber: 'Seat number', seatFunction: 'Seat function', openingArea: 'Opening area', outerFrameArea: 'Outer-frame projected area', netGlazingArea: 'Net glazing area', floorArea: 'Modeled floor footprint', leafCount: 'Door leaves' })[key] || key.replace(/([A-Z])/g, ' $1').toLowerCase().replace(/^./, c => c.toUpperCase());
  const size = new Vector3(); registry.bounds(mesh).getSize(size);
  const properties = [prop('Category', e.category), prop('Family', family.name), prop('Type', type.name),
    prop('Product type ID', type.id), prop('Type revision', type.revision), prop('Assembly', `${e.components.length} components · one modeled product`),
    prop('Primary storey', e.primaryStorey), prop('Rooms', e.roomIds.join(', ') || 'Not assigned'),
    prop('Model extent · X × Y × Z', size.toArray().map(n => n.toFixed(2)).join(' × ') + ' m', 'measured', 'Whole-product world bounding box; extent is not opening area')];
  for (const [key, value] of Object.entries(e.properties || {})) properties.push(prop(label(key), value));
  for (const [key, q] of Object.entries(e.quantities || {})) properties.push(prop(label(key), q ? `${q.value.toFixed(3)} m²` : 'Unknown', q ? 'measured' : 'authored', q ? `${q.method}. ${q.source}` : 'No reviewed measurement supplied'));
  return { title: e.name, sourceName: mesh.name, id: e.id, properties };
}
