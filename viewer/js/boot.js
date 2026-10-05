// Starts the shared viewer for one building page.
// The page names its configuration with <html data-building="public/building.json">.
import { parseBuilding, setBuilding } from './building-config.js';

const escapeHTML = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const external = '<svg aria-hidden="true"><use href="#i-external"/></svg><span class="sr-only"> (opens in a new tab)</span>';

function linksMarkup(config) {
  const entries = [...config.links, ...(config.downloads ? [{ label: 'Model files & IFC', href: config.downloads }] : [])];
  const links = entries.map(link => `            <a class="link-button" href="${escapeHTML(link.href)}" target="_blank" rel="noopener noreferrer">${escapeHTML(link.label)}${external}</a>`);
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
    text(new URL('../shell.html?v=20261005-mobile-1', import.meta.url)),
  ]);
  const building = parseBuilding(config, configUrl);
  const about = building.about ? await text(new URL(building.about, configUrl)) : '';
  const fill = { name: escapeHTML(building.name), place: escapeHTML(building.place), about, links: linksMarkup(building) };
  const markup = shell.replace(/^<!--.*?-->\n/s, '').replace(/\{\{(\w+)\}\}/g, (match, key) => key in fill ? fill[key] : match);
  document.getElementById('boot-status')?.remove();
  document.body.insertAdjacentHTML('afterbegin', markup);
  setBuilding(building);
  await import('./main.js?v=20261005-mobile-1');
}

start().catch(error => {
  console.error(error);
  const title = document.getElementById('loading-title');
  if (!title) { fail('The viewer could not start', error.message); return; }
  title.textContent = 'The viewer could not start';
  document.getElementById('loading-detail').textContent = 'A required viewer file could not be loaded. Refresh the page and check that the viewer folder is published with the site.';
  document.getElementById('load-progress').hidden = true;
  const retry = document.getElementById('retry');
  retry.hidden = false;
  retry.onclick = () => location.reload();
});
