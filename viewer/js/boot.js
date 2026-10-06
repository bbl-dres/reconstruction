// Starts the shared viewer for one building page.
// The page names its configuration with <html data-building="public/building.json">.
import { parseBuilding, setBuilding } from './building-config.js';
import { loadLanguages, setContext, t, translate } from './i18n.js?v=i18n-2';

const escapeHTML = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const external = '<svg aria-hidden="true"><use href="#i-external"/></svg><span class="sr-only" data-i18n="link.newTab"></span>';

// Building links keep their authored labels; the generated download link is interface text.
function linksMarkup(config) {
  const entries = [...config.links.map(link => ({ ...link, label: escapeHTML(link.label) })),
    ...(config.downloads ? [{ label: `<span data-i18n="about.downloads">${escapeHTML(t('about.downloads'))}</span>`, href: config.downloads }] : [])];
  const links = entries.map(link => `            <a class="link-button" href="${escapeHTML(link.href)}" target="_blank" rel="noopener noreferrer">${link.label}${external}</a>`);
  return links.length ? `<div class="project-links">\n${links.join('\n')}\n          </div>` : '';
}

function fail(title, detail) {
  const box = document.getElementById('boot-status') || document.body.appendChild(document.createElement('p'));
  box.id = 'boot-status';
  box.hidden = false;
  box.innerHTML = `<strong>${escapeHTML(title)}</strong><br>${escapeHTML(detail)}`;
}

async function text(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url.pathname} could not be loaded (${response.status}).`);
  return response.text();
}

async function start() {
  if (location.protocol === 'file:') {
    fail('Open with a local server', 'Run “python tools/serve.py” from the repository root and open the address it prints. No build is needed.');
    return;
  }
  const configUrl = new URL(document.documentElement.dataset.building || 'public/building.json', location.href);
  const [config, shell] = await Promise.all([
    fetch(configUrl).then(r => { if (!r.ok) throw new Error('The building configuration could not be loaded.'); return r.json(); }),
    text(new URL('../shell.html?v=20261006-plan', import.meta.url)),
    loadLanguages(new URL('../data/i18n.json?v=20261006-plan', import.meta.url)),
  ]);
  const building = parseBuilding(config, configUrl);
  // The about page is optional content: without it the viewer still opens.
  const about = building.about ? await text(new URL(building.about, configUrl)).catch(error => { console.warn('About page unavailable:', error); return ''; }) : '';
  const fill = { name: escapeHTML(building.name), place: escapeHTML(building.place), about, links: linksMarkup(building) };
  const markup = shell.replace(/^<!--.*?-->\n/s, '').replace(/\{\{(\w+)\}\}/g, (match, key) => key in fill ? fill[key] : match);
  document.getElementById('boot-status')?.remove();
  setContext({ name: building.name });
  document.body.insertAdjacentHTML('afterbegin', markup);
  translate(document.body);
  setBuilding(building);
  await import('./main.js?v=20261006-plan-2');
}

// In the visitor's language once the interface text has loaded, in English before.
const say = (key, english) => t(key) === key ? english : t(key);

start().catch(error => {
  console.error(error);
  const title = document.getElementById('loading-title');
  if (!title) { fail(say('error.title', 'The viewer could not start'), error.message); return; }
  title.textContent = say('error.title', 'The viewer could not start');
  document.getElementById('loading-detail').textContent = say('error.viewerFile', 'A required viewer file could not be loaded. Refresh the page and check that the viewer folder is published with the site.');
  document.getElementById('load-progress').hidden = true;
  const retry = document.getElementById('retry');
  retry.hidden = false;
  retry.onclick = () => location.reload();
});
