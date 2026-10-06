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

// The gallery and the splat viewers carry the same toolbar and language menu, each with its own table.
const pages = {
  gallery: {
    tables: JSON.parse(await readFile(new URL('../gallery/data/i18n.json', import.meta.url), 'utf8')),
    sources: await Promise.all(['../index.html', '../gallery/js/main.js', '../gallery/js/dom.js', '../gallery/js/map.js']
      .map(path => readFile(new URL(path, import.meta.url), 'utf8'))),
    markup: ['a'],  // the footer credits link their sources
    shared: ['language.label', 'language.name'],  // the viewer's language menu (interface.js) labels its button with these
  },
  splat: {
    tables: JSON.parse(await readFile(new URL('../reconstructions/von-wattenwyl-haus/viewer/i18n.json', import.meta.url), 'utf8')),
    sources: [await readFile(new URL('../reconstructions/von-wattenwyl-haus/viewer/overlay.html', import.meta.url), 'utf8')],
    markup: ['kbd'],
  },
};

for (const [page, { tables: table, sources, markup, shared = [] }] of Object.entries(pages)) {
  test(`${page}: every language shares the keys, placeholders and markup, in Swiss German spelling`, () => {
    assert.deepEqual(Object.keys(table).sort(), ['de', 'en', 'fr', 'it']);
    const keys = Object.keys(table.en).sort();
    for (const [language, strings] of Object.entries(table)) {
      assert.deepEqual(Object.keys(strings).sort(), keys, language);
      for (const key of keys) {
        assert.ok(strings[key].trim(), `${language} ${key} is empty`);
        assert.deepEqual(placeholders(strings[key]), placeholders(table.en[key]), `${language} ${key} placeholders`);
        assert.deepEqual(tags(strings[key]), tags(table.en[key]), `${language} ${key} markup`);
        assert.ok(tags(strings[key]).every(tag => markup.includes(tag)), `${language} ${key} markup`);
      }
    }
    for (const [key, text] of Object.entries(table.de)) assert.ok(!text.includes('ß'), key);
  });

  test(`${page}: every key the page asks for exists, and every key is used`, () => {
    // Markup attributes, and keys in quotes in code: t('key'), say('key'), button(…, 'key', …), dataset: { i18n: 'key' }.
    const requested = new Set(shared);
    for (const source of sources) {
      for (const [, key] of source.matchAll(/data-i18n(?:-html)?="([^"]+)"/g)) requested.add(key);
      for (const [, pairs] of source.matchAll(/data-i18n-attr="([^"]+)"/g)) for (const pair of pairs.trim().split(/\s+/)) requested.add(pair.split(':')[1]);
      for (const [, key] of source.matchAll(/'([a-z]+\.[A-Za-z]+)'/g)) requested.add(key);
    }
    for (const key of requested) assert.ok(key in table.en, `missing key ${key}`);
    for (const key of Object.keys(table.en)) assert.ok(requested.has(key), `unused key ${key}`);
  });
}

test('gallery entries translate title, place, summary and tags into German, French and Italian', async () => {
  const { reconstructions } = JSON.parse(await readFile(new URL('../gallery/data/reconstructions.json', import.meta.url), 'utf8'));
  for (const entry of reconstructions) {
    assert.deepEqual(Object.keys(entry.translations).sort(), ['de', 'fr', 'it'], entry.id);
    for (const [language, fields] of Object.entries(entry.translations)) {
      for (const [field, value] of Object.entries(fields)) {
        assert.ok(['title', 'place', 'summary', 'tags'].includes(field), `${entry.id} ${language}: ${field} is not translatable`);
        assert.equal(typeof value, typeof entry[field], `${entry.id} ${language} ${field}`);
      }
      // Summaries and tags are always translated; names and places only where the language has its own.
      assert.ok(fields.summary && fields.tags, `${entry.id} ${language}`);
      assert.equal(fields.tags.length, entry.tags.length, `${entry.id} ${language} tags`);
      if (language === 'de') assert.ok(!fields.summary.includes('ß'), entry.id);
    }
  }
});
