// No install or build required: node --test tests/i18n.test.mjs
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import test from 'node:test';

const tables = JSON.parse(await readFile(new URL('../viewer/data/i18n.json', import.meta.url), 'utf8'));
const shell = await readFile(new URL('../viewer/shell.html', import.meta.url), 'utf8');
const scripts = await Promise.all(['boot.js', 'interface.js', 'main.js'].map(name => readFile(new URL(`../viewer/js/${name}`, import.meta.url), 'utf8')));
const placeholders = text => [...text.matchAll(/\{(\w+)\}/g)].map(match => match[1]).sort();
const tags = text => [...text.matchAll(/<\/?(\w+)/g)].map(match => match[1]).sort();

test('English, German, French and Italian share every key, placeholder and markup tag', () => {
  assert.deepEqual(Object.keys(tables).sort(), ['de', 'en', 'fr', 'it']);
  const keys = Object.keys(tables.en).sort();
  for (const [language, table] of Object.entries(tables)) {
    assert.deepEqual(Object.keys(table).sort(), keys, language);
    for (const key of keys) {
      assert.ok(table[key].trim(), `${language} ${key} is empty`);
      assert.deepEqual(placeholders(table[key]), placeholders(tables.en[key]), `${language} ${key} placeholders`);
      assert.deepEqual(tags(table[key]), tags(tables.en[key]), `${language} ${key} markup`);
    }
  }
  // Only the keyboard help carries markup, and only <kbd>.
  for (const text of Object.values(tables.en)) assert.ok(tags(text).every(tag => tag === 'kbd'), text);
});

test('German follows Swiss spelling', () => {
  for (const [key, text] of Object.entries(tables.de)) assert.ok(!text.includes('ß'), key);
});

test('every key the shell and the viewer ask for exists, and every key is used', () => {
  const requested = new Set();
  for (const [, key] of shell.matchAll(/data-i18n(?:-html)?="([^"]+)"/g)) requested.add(key);
  for (const [, pairs] of shell.matchAll(/data-i18n-attr="([^"]+)"/g)) for (const pair of pairs.trim().split(/\s+/)) requested.add(pair.split(':')[1]);
  for (const source of scripts) for (const [, key] of source.matchAll(/\b(?:t|say)\(\s*'([^']+)'/g)) requested.add(key);
  for (const key of requested) assert.ok(key in tables.en, `missing key ${key}`);
  // Keys also appear in conditionals, t(open ? 'a' : 'b'), or are built from a value.
  const used = new Set(requested);
  for (const source of scripts) for (const [, key] of source.matchAll(/'([a-z]+\.[A-Za-z]+)'/g)) used.add(key);
  for (const [prefix, values] of Object.entries({ 'mode.': ['orbit', 'dollhouse', 'plan'], 'quality.': ['auto', 'high', 'low'], 'confidence.': ['low', 'medium', 'high'] })) {
    for (const value of values) used.add(prefix + value);
  }
  for (const key of Object.keys(tables.en)) assert.ok(used.has(key), `unused key ${key}`);
});

test('strings fall back to English, then to the key, and numbers follow the language', async () => {
  const saved = { fetch: globalThis.fetch, document: globalThis.document, localStorage: globalThis.localStorage };
  try {
    globalThis.fetch = async () => ({ ok: true, json: async () => ({ en: { ...tables.en, 'only.english': 'Only in English' }, de: tables.de }) });
    globalThis.document = { documentElement: {} };
    globalThis.localStorage = { getItem: () => 'de', setItem() {} };
    const { loadLanguages, setContext, t, formatNumber, language } = await import('../viewer/js/i18n.js');
    await loadLanguages(new URL('http://localhost/i18n.json'));
    assert.equal(language(), 'de'); assert.equal(globalThis.document.documentElement.lang, 'de');
    setContext({ name: 'Bundeshaus' });
    assert.equal(t('loading.opening'), 'Bundeshaus wird geöffnet');
    assert.equal(t('tree.zoomTo', { name: 'Kuppelhalle' }), 'Auf Kuppelhalle zoomen');
    assert.equal(t('only.english'), 'Only in English');
    assert.equal(t('no.such.key'), 'no.such.key');
    assert.equal(formatNumber(2, 1), '2,0');
  } finally {
    Object.assign(globalThis, saved);
  }
});
