// Interface language. viewer/data/i18n.json holds every interface string by key in English,
// German, French and Italian. Model content (names, rooms, levels, about pages) stays as authored.
export const LANGUAGES = ['en', 'de', 'fr', 'it'];
const STORAGE_KEY = 'building-viewer:language';
let tables = {};
let current = 'en';
let context = {};
const listeners = new Set();

function storedLanguage() {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return LANGUAGES.includes(value) ? value : 'en';
  } catch { return 'en'; }
}

// With a fallback table, a page that cannot load its translations carries on in it (and returns false).
export async function loadLanguages(url, fallback = null) {
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`${url.pathname} could not be loaded (${response.status}).`);
    tables = await response.json();
  } catch (error) {
    if (!fallback) throw error;
    console.error(error);
    tables = fallback;
  }
  current = tables[storedLanguage()] ? storedLanguage() : 'en';
  document.documentElement.lang = current;
  return tables !== fallback;
}

// Values every string may use, such as the building's {name}.
export function setContext(values) { context = { ...values }; }

export const language = () => current;

// A missing translation falls back to English, then to the key, so a gap stays visible.
export function t(key, params) {
  const text = tables[current]?.[key] ?? tables.en?.[key] ?? key;
  const values = { ...context, ...params };
  return text.replace(/\{(\w+)\}/g, (match, name) => name in values ? String(values[name]) : match);
}

// Decimal separators follow the language: 2.0 m in English, 2,0 m in German, French and Italian.
export function formatNumber(value, digits = 0) {
  return new Intl.NumberFormat(current, { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value);
}

// Static markup: data-i18n="key" sets the text, data-i18n-html="key" sets markup from our own
// strings (for <kbd>), and data-i18n-attr="aria-label:key title:key" sets attributes.
export function translate(root = document) {
  for (const element of root.querySelectorAll('[data-i18n]')) element.textContent = t(element.dataset.i18n);
  for (const element of root.querySelectorAll('[data-i18n-html]')) element.innerHTML = t(element.dataset.i18nHtml);
  for (const element of root.querySelectorAll('[data-i18n-attr]')) {
    for (const pair of element.dataset.i18nAttr.trim().split(/\s+/)) {
      const [attribute, key] = pair.split(':');
      element.setAttribute(attribute, t(key));
    }
  }
}

export function onLanguageChange(listener) { listeners.add(listener); }

export function setLanguage(next) {
  if (!LANGUAGES.includes(next) || next === current) return;
  current = next;
  try { localStorage.setItem(STORAGE_KEY, next); } catch { /* The choice then lasts for this visit. */ }
  document.documentElement.lang = next;
  translate(document);
  for (const listener of listeners) listener(next);
}
