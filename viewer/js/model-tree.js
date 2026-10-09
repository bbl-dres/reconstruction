// Model tree: level → category → type → element. Built from the BIM registry when the
// version publishes one, otherwise from mesh metadata. No DOM; main.js renders the rows.

const collator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });
const byName = (a, b) => collator.compare(a.name, b.name);

export const humanize = slug => {
  const text = String(slug || 'unclassified').replace(/[-_]+/g, ' ').trim();
  return text.charAt(0).toUpperCase() + text.slice(1);
};

// Authoring suffixes (design, variant and window batch tags) mean nothing to visitors.
export const cleanName = name => String(name || '')
  .replace(/\s*·\s*VWIN-[0-9a-f]+/i, '').replace(/\s+design\b/i, '').replace(/\s*—\s*fitted variant/i, ' · variant').trim();

// Nearest level by vertical range; a component inside a range belongs to it.
export function levelForBounds(bounds, order, definitions) {
  if (!bounds) return order[0];
  const y = (bounds.min.y + bounds.max.y) / 2;
  let best = order[0], distance = Infinity;
  for (const level of order) {
    const range = definitions[level];
    if (!range) continue;
    const gap = y < range.min ? range.min - y : y >= range.max ? y - range.max : 0;
    if (gap < distance) { best = level; distance = gap; }
  }
  return best;
}

/**
 * meshes: prepared source meshes. bim: parsed registry or null. levels: level IDs without 'all'.
 * definitions: level ID → { label, elevation, min, max }. category(mesh): fallback category slug.
 */
export function buildModelTree({ meshes, bim = null, levels = [], definitions = {}, category = () => 'unclassified' }) {
  const nodes = new Map(), elementOf = new Map();
  const order = levels.length ? levels : ['all'];
  const roots = order.map(level => ({ id: `s:${level}`, kind: 'storey', level, parent: null, children: [],
    name: definitions[level]?.label || (level === 'all' ? 'Building' : humanize(level)), elevation: definitions[level]?.elevation ?? 0 }));
  for (const root of roots) nodes.set(root.id, root);
  const storeys = new Map(roots.map(root => [root.level, root]));
  // Separate buildings can have overlapping height bands. Authored membership
  // limits the candidates; height chooses within them for spanning components.
  const levelForMesh = (mesh, bounds = mesh?.userData.bounds) => {
    const authored = mesh?.userData.viewer_floor_ids;
    const candidates = Array.isArray(authored) ? authored.filter(id => storeys.has(id)) : [];
    return levelForBounds(bounds, candidates.length ? candidates : order, definitions);
  };
  const child = (parent, id, kind, name) => {
    let node = nodes.get(id);
    if (!node) {
      node = { id, kind, name, parent, children: [], level: parent.level };
      nodes.set(id, node); parent.children.push(node);
    }
    return node;
  };
  const place = ({ id, name, slug, type, typeName, level, members, product = null }) => {
    const storey = storeys.get(level) || storeys.get(levelForMesh(members[0])) || roots[0];
    const group = child(storey, `c:${storey.level}:${slug}`, 'category', humanize(slug));
    const kind = child(group, `t:${storey.level}:${slug}:${type || ''}`, 'type', type ? cleanName(typeName) || 'Unnamed type' : 'Other components');
    kind.anonymous = !type;
    const element = { id, kind: 'element', name: name || 'Unnamed element', parent: kind, children: [], level: storey.level, meshes: members, product };
    nodes.set(id, element); kind.children.push(element);
    for (const mesh of members) elementOf.set(mesh, element);
  };
  const sourceMeshes = meshes.filter(mesh => mesh.userData.viewer_role !== 'collision');
  if (bim) {
    const products = new Map(), unresolved = new Map(bim.data.unresolvedComponents.map(row => [row.id, row.category]));
    for (const mesh of sourceMeshes) {
      const product = bim.product(mesh);
      if (product) {
        if (!products.has(product.id)) products.set(product.id, { product, members: [] });
        products.get(product.id).members.push(mesh);
        continue;
      }
      place({ id: `e:m:${mesh.userData.viewer_id || mesh.uuid}`, name: mesh.name, slug: unresolved.get(mesh.userData.viewer_id) || category(mesh),
        level: levelForMesh(mesh), members: [mesh] });
    }
    for (const { product, members } of products.values()) {
      const type = bim.types.get(product.typeId);
      place({ id: `e:p:${product.id}`, name: product.name, slug: product.category, type: product.typeId, typeName: type?.name,
        level: storeys.has(product.primaryStorey) ? product.primaryStorey : levelForMesh(members[0], bim.bounds(members[0])), members, product });
    }
  } else {
    for (const mesh of sourceMeshes) {
      const data = mesh.userData;
      place({ id: `e:m:${data.viewer_id || mesh.uuid}`, name: mesh.name, slug: data.viewer_category || category(mesh),
        type: data.viewer_type_id, typeName: data.viewer_type_name || data.viewer_type_id,
        level: levelForMesh(mesh), members: [mesh] });
    }
  }
  roots.sort((a, b) => b.elevation - a.elevation);
  for (const root of roots) {
    root.children.sort(byName);
    for (const group of root.children) {
      // A category made only of untyped components lists them directly.
      if (group.children.length === 1 && group.children[0].anonymous) {
        nodes.delete(group.children[0].id);
        group.children = group.children[0].children;
        for (const element of group.children) element.parent = group;
      }
      group.children.sort((a, b) => Number(Boolean(a.anonymous)) - Number(Boolean(b.anonymous)) || byName(a, b));
      for (const kind of group.children) kind.children.sort(byName);
    }
  }
  for (const node of nodes.values()) node.search = node.name.toLowerCase();
  return { roots, nodes, elementOf };
}

export const ancestors = node => {
  const chain = [];
  for (let parent = node.parent; parent; parent = parent.parent) chain.push(parent);
  return chain;
};

export function* elementsUnder(node) {
  if (node.kind === 'element') { yield node; return; }
  for (const child of node.children) yield* elementsUnder(child);
}

// Hidden: the node or an ancestor is hidden, or isolation excludes it. Ancestors of the
// isolated node stay visible because they contain it.
export function hiddenBy(node, hidden, isolated) {
  if (hidden.has(node.id)) return node;
  for (const parent of ancestors(node)) if (hidden.has(parent.id)) return parent;
  if (isolated && node.id !== isolated.id && !ancestors(node).includes(isolated) && !ancestors(isolated).includes(node)) return isolated;
  return null;
}

export function hiddenMeshes(tree, hidden, isolated) {
  const result = new Set();
  if (!tree || (!hidden.size && !isolated)) return result;
  for (const root of tree.roots) for (const element of elementsUnder(root)) {
    if (hiddenBy(element, hidden, isolated)) for (const mesh of element.meshes) result.add(mesh);
  }
  return result;
}

// Every word must appear in the node's path (ancestors and itself), and at least one in the
// node's own name: "principal window" lists the windows of the principal floor, not all of it.
// Returns the matching nodes and the ancestors to expand so that each match is listed.
export function filterTree(tree, query) {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return null;
  const matches = new Set(), open = new Set();
  const visit = (node, path) => {
    const text = `${path} ${node.search}`;
    if (words.every(word => text.includes(word)) && words.some(word => node.search.includes(word))) {
      matches.add(node);
      for (const parent of ancestors(node)) open.add(parent);
    }
    for (const child of node.children) visit(child, text);
  };
  for (const root of tree.roots) visit(root, '');
  return { matches, open };
}
