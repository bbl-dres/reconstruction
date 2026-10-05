import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir, access } from 'node:fs/promises';
import { parseBuilding, setBuilding, building } from '../viewer/js/building-config.js';
import { visibleInMode, collisionCandidate, LEVELS, WALK_STARTS } from '../viewer/js/policy-default.js';

const root = new URL('../', import.meta.url);
const mesh = (userData, name = 'part') => ({ name, userData });

test('every reconstruction with a shared-viewer page has a valid building.json and catalog folder', async () => {
  for (const entry of await readdir(new URL('reconstructions/', root), { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const page = new URL(`reconstructions/${entry.name}/index.html`, root);
    const html = await readFile(page, 'utf8').catch(() => '');
    if (!html.includes('viewer/js/boot.js')) continue;
    const configUrl = new URL(`reconstructions/${entry.name}/public/building.json`, root);
    const config = parseBuilding(JSON.parse(await readFile(configUrl, 'utf8')), configUrl);
    assert.equal(config.id, entry.name, 'building id matches its folder');
    await access(new URL(config.models + 'catalog.json', configUrl));
    if (config.about) await access(new URL(config.about, configUrl));
    assert.match(html, /"building-policy":"[^"]+"/, 'page maps building-policy in its import map');
  }
});

test('the template configuration is valid', async () => {
  const url = new URL('templates/reconstruction/public/building.json', root);
  const config = parseBuilding(JSON.parse(await readFile(url, 'utf8')), url);
  assert.equal(config.models, 'models/');
  assert.ok(config.pipeline.levels.every(level => level.min < level.max));
});

test('building configuration rejects unsafe or incomplete values', () => {
  const base = { schemaVersion: 1, id: 'landgut-lohn', name: 'Landgut Lohn', place: 'Kehrsatz' };
  assert.equal(parseBuilding(base, 'https://example.test/b.json').models, 'models/');
  for (const bad of [{ id: 'Bad Id' }, { name: '' }, { models: '../x/' }, { about: 'https://x.test/a.html' },
    { links: [{ label: 'x', href: 'javascript:alert(1)' }] }, { walkStarts: { hall: { label: 'Hall', position: [0, 1], target: [0, 0, 0] } } }]) {
    assert.throws(() => parseBuilding({ ...base, ...bad }, 'https://example.test/b.json'), /Invalid building configuration/);
  }
  setBuilding(parseBuilding(base, 'https://example.test/b.json'));
  assert.equal(building().name, 'Landgut Lohn');
});

test('default policy follows authored cutaway, floor and role properties only', () => {
  const levels = { ground: { min: -0.5, max: 3.4 }, first: { min: 3.4, max: 7.2 } };
  const wall = mesh({ viewer_role: 'exterior-wall', viewer_cutaway_role: 'enclosure', viewer_floor_ids: ['ground'] });
  const floor = mesh({ viewer_role: 'floor', viewer_cutaway_role: 'interior', viewer_floor_ids: ['first'], bounds: { min: { y: 3.6 }, max: { y: 3.8 } } });
  const roof = mesh({ viewer_role: 'roof' });
  assert.deepEqual(LEVELS, {});
  assert.deepEqual(WALK_STARTS, {});
  assert.equal(visibleInMode(wall, 'orbit'), true);
  assert.equal(visibleInMode(wall, 'dollhouse'), false);
  assert.equal(visibleInMode(roof, 'dollhouse'), false);
  assert.equal(visibleInMode(floor, 'dollhouse', 'first', levels), true);
  assert.equal(visibleInMode(floor, 'plan', 'ground', levels), false);
  assert.equal(visibleInMode(mesh({ viewer_role: 'collision' }), 'walk'), false);
  assert.equal(collisionCandidate(floor), true);
  assert.equal(collisionCandidate(mesh({ viewer_role: 'decoration' })), false);
  assert.equal(collisionCandidate(mesh({ viewer_role: 'stair' }, 'Stair handrail')), false);
});
