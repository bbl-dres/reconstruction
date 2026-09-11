import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir, stat } from 'node:fs/promises';
import { parseCatalog, chooseModel } from '../public/js/model-catalog.js';

const root = new URL('../public/models/', import.meta.url);
const source = JSON.parse(await readFile(new URL('catalog.json', root), 'utf8'));
const catalog = parseCatalog(source);

test('the public catalog retains five milestones with the latest selected by default', () => {
  assert.deepEqual(catalog.map(entry => entry.version), [27, 20, 10, 3, 1]);
  assert.equal(source.models.length, catalog.length, 'Every published entry must parse');
  assert.equal(source.default, catalog[0].id);
  assert.equal(chooseModel(catalog).id, source.default);
  for (const entry of catalog) assert.equal(chooseModel(catalog, entry.id).id, entry.id);
});

test('all model dependencies and compression records belong to retained milestones', async () => {
  const ids = new Set(catalog.map(entry => entry.id));
  const folders = (await readdir(root, { withFileTypes: true }))
    .filter(entry => entry.isDirectory() && /^bundeshaus-v\d+$/.test(entry.name))
    .map(entry => entry.name);
  assert.deepEqual(new Set(folders), ids, 'Retired model directories must be removed');
  const compression = JSON.parse(await readFile(new URL('compression.json', root), 'utf8'));
  assert.deepEqual(compression.models.map(entry => entry.version), catalog.map(entry => entry.label));
  for (const entry of source.models) {
    for (const field of ['building', 'surroundings', 'metadata', 'bim', 'ifc']) {
      if (!entry[field]) continue;
      assert(ids.has(entry[field].split('/')[1]), `${entry.id} ${field} references a retired folder`);
      const info = await stat(new URL(entry[field], root));
      assert(info.isFile() && info.size > 0, `${entry.id} ${field} must exist`);
    }
    let transferBytes = 0;
    for (const field of ['building', 'surroundings']) {
      const delivery = entry[field].endsWith('.gz') ? entry[field] : entry[field] + '.gz';
      transferBytes += (await stat(new URL(delivery, root))).size;
    }
    assert.equal(compression.models.find(row => row.version === entry.label).transferBytes, transferBytes);
  }
});
