// Model tree grouping, visibility and filtering; no browser or WebGL.
import { registerHooks } from 'node:module';
import test from 'node:test';
import assert from 'node:assert/strict';

registerHooks({ resolve(specifier, context, next) {
  if (specifier === 'three') return { url: new URL('../viewer/vendor/three/build/three.module.js', import.meta.url).href, shortCircuit: true };
  return next(specifier, context);
} });
const { Box3, Vector3 } = await import('three');
const { buildModelTree, hiddenMeshes, hiddenBy, filterTree, levelForBounds, cleanName } = await import('../viewer/js/model-tree.js');

const definitions = {
  ground: { label: 'Ground floor', elevation: 0, min: -0.5, max: 4 },
  first: { label: 'First floor', elevation: 4, min: 4, max: 8 },
};
const mesh = (id, name, y, data = {}) => ({ name, uuid: `uuid-${id}`, userData: { viewer_id: id, bounds: new Box3(new Vector3(0, y, 0), new Vector3(1, y + 1, 1)), ...data } });

// The registry surface buildModelTree reads: products, types, unresolved categories and bounds.
function registry(meshes, products) {
  const owner = new Map();
  for (const product of products) for (const id of product.components) owner.set(id, product);
  return {
    data: { unresolvedComponents: meshes.filter(m => !owner.has(m.userData.viewer_id)).map(m => ({ id: m.userData.viewer_id, category: m.userData.unresolved })) },
    types: new Map([['type-chair', { name: 'Council chair design' }], ['type-desk', { name: 'Council desk' }]]),
    product: m => owner.get(m.userData.viewer_id) || null,
    bounds: m => m.userData.bounds,
  };
}

function bundle() {
  const meshes = [
    mesh('c1-seat', 'Chair 1 seat', 4.2), mesh('c1-back', 'Chair 1 back', 4.6), mesh('c2-seat', 'Chair 2 seat', 4.2),
    mesh('d1', 'Desk 1', 4.1), mesh('wall-1', 'North wall', 1, { unresolved: 'interior-wall' }),
    mesh('ceiling-1', 'Hall ceiling', 6.5, { unresolved: 'ceiling' }), mesh('roof-1', 'Roof', 20, { unresolved: 'roof' }),
    mesh('collision', 'Collision proxy', 1, { viewer_role: 'collision' }),
  ];
  const products = [
    { id: 'chair-2', name: 'Chair 2', category: 'chair', typeId: 'type-chair', primaryStorey: 'first', components: ['c2-seat'] },
    { id: 'chair-1', name: 'Chair 1', category: 'chair', typeId: 'type-chair', primaryStorey: 'first', components: ['c1-seat', 'c1-back'] },
    { id: 'desk-1', name: 'Desk 1', category: 'desk', typeId: 'type-desk', primaryStorey: 'unknown-storey', components: ['d1'] },
  ];
  const tree = buildModelTree({ meshes, bim: registry(meshes, products), levels: ['ground', 'first'], definitions });
  return { meshes, tree, byName: name => [...tree.nodes.values()].find(node => node.name === name) };
}

test('registered products group by level, category and type; components without a product follow their height', () => {
  const { meshes, tree, byName } = bundle();
  assert.deepEqual(tree.roots.map(root => root.name), ['First floor', 'Ground floor'], 'upper levels first');
  const first = tree.roots[0];
  assert.deepEqual(first.children.map(node => node.name), ['Ceiling', 'Chair', 'Desk', 'Roof']);
  const chairs = byName('Chair');
  assert.equal(chairs.children.length, 1);
  assert.equal(chairs.children[0].name, 'Council chair', 'authoring suffixes are removed from type names');
  assert.deepEqual(chairs.children[0].children.map(node => node.name), ['Chair 1', 'Chair 2'], 'natural order');
  assert.deepEqual(byName('Chair 1').meshes, [meshes[0], meshes[1]], 'one element owns all of its components');
  assert.equal(tree.elementOf.get(meshes[1]), byName('Chair 1'));
  assert.equal(byName('Desk 1').level, 'first', 'an unknown primary storey falls back to the component height');
  assert.equal(byName('Roof').parent.name, 'First floor', 'components above every level belong to the nearest one');
  // A category made only of untyped components lists its components directly.
  assert.equal(byName('Interior wall').children[0].name, 'North wall');
  assert.equal(byName('Interior wall').children[0].kind, 'element');
  assert.ok(![...tree.elementOf.keys()].some(m => m.name === 'Collision proxy'), 'collision proxies are never listed');
});

test('hiding a group hides its components; isolation keeps only the isolated subtree and its ancestors', () => {
  const { meshes, tree, byName } = bundle();
  const chairs = byName('Chair');
  assert.deepEqual([...hiddenMeshes(tree, new Set([chairs.id]), null)], [meshes[0], meshes[1], meshes[2]]);
  const isolated = hiddenMeshes(tree, new Set(), byName('Desk 1'));
  assert.ok(!isolated.has(meshes[3]));
  assert.equal(isolated.size, 6, 'everything except the desk is hidden');
  assert.equal(hiddenBy(byName('Desk'), new Set(), byName('Desk 1')), null, 'ancestors contain the isolated element');
  assert.equal(hiddenBy(byName('Chair 1'), new Set([chairs.id]), null), chairs, 'reports the hiding ancestor');
  assert.equal(hiddenMeshes(tree, new Set(), null).size, 0);
});

test('filter words must all match the path, and one must match the node itself', () => {
  const { tree, byName } = bundle();
  const result = filterTree(tree, 'first chair');
  assert.ok(result.matches.has(byName('Chair')) && result.matches.has(byName('Chair 2')));
  assert.ok(!result.matches.has(byName('Desk 1')));
  assert.ok(result.open.has(tree.roots[0]) && result.open.has(byName('Council chair')));
  const level = filterTree(tree, 'first');
  assert.deepEqual([...level.matches], [tree.roots[0]], 'a level name does not list everything inside it');
  assert.equal(filterTree(tree, '  '), null);
});

test('without a registry, meshes use their own category and type metadata', () => {
  const meshes = [mesh('a', 'Door A', 1, { viewer_category: 'door', viewer_type_id: 't1', viewer_type_name: 'Panel door design' }), mesh('b', 'Thing', 5)];
  const tree = buildModelTree({ meshes, levels: ['ground', 'first'], definitions, category: () => 'furniture' });
  const ground = tree.roots[1];
  assert.equal(ground.children[0].name, 'Door');
  assert.equal(ground.children[0].children[0].name, 'Panel door');
  assert.equal(tree.roots[0].children[0].name, 'Furniture');
  const flat = buildModelTree({ meshes, levels: [], definitions: {} });
  assert.deepEqual(flat.roots.map(root => [root.level, root.name]), [['all', 'Building']]);
  assert.equal(levelForBounds(null, ['ground'], definitions), 'ground');
  assert.equal(cleanName('Window · VWIN-3fa2 design — fitted variant'), 'Window · variant');
});
