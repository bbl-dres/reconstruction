import { popupPlacement } from './view-layout.js?v=redesign-1';
import { LANGUAGES, language, onLanguageChange, setLanguage, t } from './i18n.js?v=i18n-2';

// Roving keyboard focus with automatic activation for local tabs.
export function wirePanelTabs(tablist, onSelect = () => {}) {
  const tabs = [...tablist.querySelectorAll('[role="tab"]')];
  const select = tab => {
    for (const item of tabs) {
      const active = item === tab;
      item.setAttribute('aria-selected', String(active));
      item.tabIndex = active ? 0 : -1;
      document.getElementById(item.getAttribute('aria-controls')).hidden = !active;
    }
    onSelect(tab);
  };
  for (const tab of tabs) {
    tab.addEventListener('click', () => select(tab));
    tab.addEventListener('keydown', event => {
      const index = tabs.indexOf(tab);
      const next = event.key === 'ArrowRight' ? (index + 1) % tabs.length
        : event.key === 'ArrowLeft' ? (index + tabs.length - 1) % tabs.length
        : event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : -1;
      if (next < 0) return;
      event.preventDefault();
      select(tabs[next]); tabs[next].focus();
    });
  }
  return { select: id => select(tabs.find(tab => tab.id === id)) };
}

export function setRangeDescription(input, text) {
  input.setAttribute('aria-valuetext', text);
}

export function viewportFrame() {
  const viewport = window.visualViewport;
  return { left: viewport?.offsetLeft || 0, top: viewport?.offsetTop || 0,
    width: viewport?.width || document.documentElement.clientWidth, height: viewport?.height || window.innerHeight };
}

// Dropdowns stay inside the 3D stage, clear of the sidebar and the bottom controls.
// Pages without a stage (the gallery) use the whole viewport.
function panelInsets() {
  const stageLeft = document.getElementById('stage')?.getBoundingClientRect().left ?? 0;
  const topbar = getComputedStyle(document.querySelector('.topbar'));
  const edge = parseFloat(topbar.right) || 16;
  return { left: Math.max(edge, stageLeft + edge), right: edge, top: parseFloat(topbar.top) || 16, bottom: edge };
}

// Toolbar dropdowns: [panel id, trigger id, preferred width token].
const DROPDOWNS = [['lighting', 'lighting-toggle', '--dropdown-lighting'], ['surroundings-panel', 'surroundings-toggle', '--dropdown-surroundings'],
  ['language-menu', 'language-toggle', '--dropdown-language'], ['help', 'help-toggle', '--dropdown-help'], ['menu', 'menu-toggle', '--dropdown-menu']];

function closeDropdown(panelId, triggerId) {
  const panel = document.getElementById(panelId);
  if (!panel) return;
  if (typeof panel.hidePopover === 'function') {
    if (panel.matches(':popover-open')) panel.hidePopover();
  } else if (!panel.hidden) {
    panel.hidden = true;
    document.getElementById(triggerId).setAttribute('aria-expanded', 'false');
    // As a native popover would: listeners tidy up on close.
    panel.dispatchEvent(Object.assign(new Event('toggle'), { newState: 'closed' }));
  }
}

export function closeDropdowns() {
  for (const [panel, trigger] of DROPDOWNS) closeDropdown(panel, trigger);
}

export function dropdownOpen() {
  return DROPDOWNS.some(([, trigger]) => document.getElementById(trigger)?.getAttribute('aria-expanded') === 'true');
}

export function openDropdown(panelId) {
  const panel = document.getElementById(panelId);
  const entry = DROPDOWNS.find(([id]) => id === panelId);
  if (typeof panel.showPopover === 'function') { if (!panel.matches(':popover-open')) panel.showPopover(); }
  else if (panel.hidden) document.getElementById(entry[1]).click();
}

export function wireDropdowns() {
  for (const [panel, trigger, width] of DROPDOWNS) wireDropdown(panel, trigger, width);
}

// Native popovers handle light-dismiss and focus. Older browsers keep a usable
// disclosure with explicit outside-click / Escape handling.
function wireDropdown(panelId, triggerId, widthToken) {
  const panel = document.getElementById(panelId);
  const trigger = document.getElementById(triggerId);
  if (!panel || !trigger) return;
  const close = () => closeDropdown(panelId, triggerId);
  if (typeof panel.showPopover === 'function') panel.hidden = false;
  const position = () => {
    const width = parseFloat(getComputedStyle(document.documentElement).getPropertyValue(widthToken)) || 320;
    // The menu-help item opens Help on phones, where the help button is hidden.
    const anchor = trigger.offsetParent ? trigger : document.getElementById('menu-toggle');
    const placement = popupPlacement(anchor.getBoundingClientRect(), viewportFrame(), width, panelInsets(), 'end');
    for (const [key, value] of Object.entries(placement)) panel.style.setProperty(`--dropdown-${key}`, `${value}px`);
  };
  panel.addEventListener('beforetoggle', event => {
    const opening = event.newState === 'open';
    if (opening) position();
    trigger.setAttribute('aria-expanded', String(opening));
  });
  // Opened by a click before the page wired it: place it and mark its button now.
  if (typeof panel.showPopover === 'function' && panel.matches(':popover-open')) {
    position();
    trigger.setAttribute('aria-expanded', 'true');
  }
  if (typeof panel.showPopover !== 'function') {
    panel.hidden = true;
    trigger.addEventListener('click', () => {
      if (!panel.hidden) { close(); return; }
      closeDropdowns();
      position(); panel.hidden = false;
      trigger.setAttribute('aria-expanded', 'true');
      (panel.querySelector('[autofocus]') || panel.querySelector('button, input, a'))?.focus({ preventScroll: true });
    });
    let outside = false;
    document.addEventListener('pointerdown', event => { outside = !panel.contains(event.target) && !trigger.contains(event.target); });
    // Other buttons that open this panel (Help in the More menu) are not a click outside it.
    const opener = event => event.target.closest?.(`[popovertarget="${panelId}"]`);
    document.addEventListener('click', event => { if (outside && !panel.contains(event.target) && !trigger.contains(event.target) && !opener(event)) close(); });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && !panel.hidden) { close(); trigger.focus(); }
    });
  }
  const reposition = () => { if (trigger.getAttribute('aria-expanded') === 'true') position(); };
  window.addEventListener('resize', reposition);
  // The viewer never scrolls; on the gallery, an open dropdown follows its button.
  window.addEventListener('scroll', reposition, { passive: true });
  document.addEventListener('fullscreenchange', reposition);
  window.visualViewport?.addEventListener('resize', reposition);
  window.visualViewport?.addEventListener('scroll', reposition);
}

// The sidebar floats over the stage, as tall as its content, and collapses to its header;
// medium screens start with it collapsed. Phones turn it into a bottom sheet. onChange
// runs after each change.
export function wireSidebar({ onChange = () => {} } = {}) {
  const viewer = document.getElementById('viewer');
  const overlay = matchMedia('(max-width: 1099px)');
  const compact = matchMedia('(max-width: 760px)');
  const toggle = document.getElementById('sidebar-toggle');
  const sheet = document.getElementById('sheet-toggle');
  let open = !overlay.matches;
  const sync = () => {
    viewer.classList.toggle('compact', compact.matches);
    viewer.classList.toggle('sidebar-collapsed', !open && !compact.matches);
    viewer.classList.toggle('sheet-open', open && compact.matches);
    toggle.setAttribute('aria-expanded', String(open));
    toggle.title = t(open ? 'sidebar.collapse' : 'sidebar.expand');
    sheet.setAttribute('aria-expanded', String(open));
    onChange({ open, compact: compact.matches });
  };
  const set = value => { open = value; sync(); };
  toggle.addEventListener('click', () => set(!open));
  // The whole header is a pointer target; the button carries the state for keyboards.
  document.querySelector('.sidebar-header').addEventListener('click', event => { if (!event.target.closest('button')) set(!open); });
  sheet.addEventListener('click', () => { set(!open); if (open) document.querySelector('.sidebar-tabs [aria-selected="true"]').focus({ preventScroll: true }); });
  document.getElementById('sheet-close').addEventListener('click', () => { set(false); sheet.focus({ preventScroll: true }); });
  // Crossing a breakpoint resets to that layout's default.
  const reset = () => set(!overlay.matches);
  overlay.addEventListener('change', reset);
  compact.addEventListener('change', reset);
  onLanguageChange(() => { toggle.title = t(open ? 'sidebar.collapse' : 'sidebar.expand'); });
  sync();
  return {
    isOpen: () => open, isCompact: () => compact.matches,
    open: () => set(true),
    // Overlays and sheets cover the view; close them once the visitor has chosen something to look at.
    dismiss: () => { if (overlay.matches && open) set(false); },
  };
}

// The toolbar's language button shows the current code; choosing a language closes the menu.
export function wireLanguageMenu() {
  const toggle = document.getElementById('language-toggle');
  const inputs = [...document.querySelectorAll('input[name="language"]')];
  const sync = () => {
    document.getElementById('language-code').textContent = language().toUpperCase();
    const label = `${t('language.label')}: ${t('language.name')}`;
    toggle.setAttribute('aria-label', label);
    toggle.title = label;
    for (const input of inputs) input.checked = input.value === language();
  };
  for (const input of inputs) input.addEventListener('change', () => {
    if (!LANGUAGES.includes(input.value)) return;
    setLanguage(input.value);
    closeDropdown('language-menu', 'language-toggle');
    toggle.focus({ preventScroll: true });
  });
  onLanguageChange(sync);
  sync();
}

export function wireResponsiveLayout() {
  const root = document.documentElement;
  const sync = () => {
    const viewport = viewportFrame();
    root.style.setProperty('--viewport-top', `${viewport.top}px`);
    root.style.setProperty('--viewport-left', `${viewport.left}px`);
    root.style.setProperty('--viewport-width', `${viewport.width}px`);
    root.style.setProperty('--viewport-height', `${viewport.height}px`);
  };
  window.addEventListener('resize', sync);
  window.visualViewport?.addEventListener('resize', sync);
  window.visualViewport?.addEventListener('scroll', sync);
  sync();
}
