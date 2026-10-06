// No install or build required: node --test tests/modules.test.mjs
// The browser keys an ES module by its full URL, query included: './i18n.js?v=1' and './i18n.js?v=2'
// are two modules with separate state. Every importer of a module must use the same ?v= token.
import { readdir, readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const folders = ['viewer/js', 'gallery/js'];
const sources = [];
for (const folder of folders) {
  for (const name of await readdir(path.join(root, folder))) {
    if (name.endsWith('.js')) sources.push(path.join(folder, name));
  }
}

test('every importer of a module uses the same cache-busting query', async () => {
  const tokens = new Map();
  for (const source of sources) {
    const text = await readFile(path.join(root, source), 'utf8');
    // Static and dynamic imports, and worker URLs.
    for (const [, specifier, query = ''] of text.matchAll(/(?:from\s+|import\(\s*|new URL\(\s*)'(\.{1,2}\/[^'?]+\.js)(\?[^']*)?'/g)) {
      const target = path.normalize(path.join(path.dirname(source), specifier));
      if (!tokens.has(target)) tokens.set(target, new Map());
      tokens.get(target).set(query, [...(tokens.get(target).get(query) || []), source]);
    }
  }
  // The pattern must see the viewer's import graph, or the check below proves nothing.
  assert.ok(tokens.size > 25, `only ${tokens.size} imported modules found`);
  const mismatched = [...tokens].filter(([, queries]) => queries.size > 1)
    .map(([target, queries]) => `${target}: ${[...queries].map(([query, from]) => `"${query}" in ${from.join(', ')}`).join('; ')}`);
  assert.deepEqual(mismatched, []);
});
