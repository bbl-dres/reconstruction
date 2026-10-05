import { popupPlacement } from './view-layout.js?v=mobile-1';

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
    width: viewport?.width || document.documentElement.clientWidth, height: viewport?.height || window.innerHeight,
    // Fixed popups that open upwards are placed from the bottom of the layout viewport.
    layoutHeight: document.documentElement.clientHeight || window.innerHeight };
}

// Phones (the compact layout) present toolbar popups and the model panel as bottom sheets.
const compactLayout = () => document.getElementById('viewer')?.classList.contains('compact');

// A bottom sheet closes when dragged down by its handle, as native sheets do; the CSS
// transition returns it when the drag is too short. A tap without movement calls onTap.
export function wireSheetDrag(sheet, handle, { enabled = () => true, onClose, onTap = () => {} }) {
  let drag = null;
  handle.addEventListener('pointerdown', event => {
    if (!enabled() || drag || event.button !== 0 || event.target.closest('button, a, input')) return;
    drag = { id: event.pointerId, y: event.clientY, distance: 0, moved: false, samples: [{ y: event.clientY, time: event.timeStamp }] };
    handle.setPointerCapture(event.pointerId);
  });
  handle.addEventListener('pointermove', event => {
    if (drag?.id !== event.pointerId) return;
    drag.distance = Math.max(0, event.clientY - drag.y);
    drag.samples.push({ y: event.clientY, time: event.timeStamp });
    if (drag.samples.length > 8) drag.samples.shift();
    if (!drag.moved && drag.distance < 6) return;
    drag.moved = true;
    sheet.style.transition = 'none';
    sheet.style.transform = `translateY(${drag.distance}px)`;
  });
  const end = event => {
    if (drag?.id !== event.pointerId) return;
    const { distance, moved, samples } = drag;
    // Release speed in px/ms over the last 100 ms: a pause before letting go is not a flick.
    const recent = samples.filter(sample => event.timeStamp - sample.time <= 100);
    const speed = recent.length > 1 ? (recent.at(-1).y - recent[0].y) / Math.max(1, recent.at(-1).time - recent[0].time) : 0;
    drag = null;
    sheet.style.removeProperty('transition');
    sheet.style.removeProperty('transform');
    if (event.type !== 'pointerup') return;
    if (!moved) onTap();
    else if (distance > Math.min(120, sheet.offsetHeight * 0.3) || (distance > 24 && speed > 0.5)) onClose();
  };
  for (const type of ['pointerup', 'pointercancel']) handle.addEventListener(type, end);
}

// Arrow keys, Home and End move between a menu's enabled items; one item is in the Tab order.
export function wireMenuKeys(menu) {
  menu.addEventListener('keydown', event => {
    const items = [...menu.querySelectorAll('[role^="menuitem"]:not(:disabled)')];
    const index = items.indexOf(document.activeElement);
    const next = event.key === 'ArrowDown' ? items[(index + 1) % items.length]
      : event.key === 'ArrowUp' ? items[(index - 1 + items.length) % items.length]
        : event.key === 'Home' ? items[0] : event.key === 'End' ? items.at(-1) : null;
    if (!next) return;
    event.preventDefault();
    for (const item of items) item.tabIndex = item === next ? 0 : -1;
    next.focus();
  });
}

// Dropdowns stay inside the 3D stage, clear of the sidebar and the bottom controls.
function panelInsets() {
  const stage = document.getElementById('stage').getBoundingClientRect();
  const toolbar = getComputedStyle(document.querySelector('.toolbar'));
  const edge = parseFloat(toolbar.right) || 16;
  return { left: Math.max(edge, stage.left + edge), right: edge, top: parseFloat(toolbar.top) || 16, bottom: edge };
}

// Popups: [panel id, trigger id, preferred width token, alignment, side]. Toolbar dropdowns
// align with the right edge of their trigger; the level menu opens above the level button.
const DROPDOWNS = [['lighting', 'lighting-toggle', '--dropdown-lighting'], ['surroundings-panel', 'surroundings-toggle', '--dropdown-surroundings'],
  ['help', 'help-toggle', '--dropdown-help'], ['menu', 'menu-toggle', '--dropdown-menu'],
  ['level-menu', 'level-toggle', '--dropdown-level', 'start', 'top']];

function closeDropdown(panelId, triggerId) {
  const panel = document.getElementById(panelId);
  if (!panel) return;
  if (typeof panel.hidePopover === 'function') {
    if (panel.matches(':popover-open')) panel.hidePopover();
  } else {
    panel.hidden = true;
    document.getElementById(triggerId).setAttribute('aria-expanded', 'false');
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
  for (const [panel, trigger, width, align, side] of DROPDOWNS) wireDropdown(panel, trigger, width, align, side);
}

// Native popovers handle light-dismiss and focus. Older browsers keep a usable
// disclosure with explicit outside-click / Escape handling. On phones the toolbar
// dropdowns are bottom sheets (main.css): their header closes them by button or drag.
function wireDropdown(panelId, triggerId, widthToken, align = 'end', side = 'bottom') {
  const panel = document.getElementById(panelId);
  const trigger = document.getElementById(triggerId);
  if (!panel || !trigger) return;
  const close = () => closeDropdown(panelId, triggerId);
  if (typeof panel.showPopover === 'function') panel.hidden = false;
  const position = () => {
    const width = parseFloat(getComputedStyle(document.documentElement).getPropertyValue(widthToken)) || 320;
    // The menu-help item opens Help on phones, where the help button is hidden.
    const anchor = trigger.offsetParent ? trigger : document.getElementById('menu-toggle');
    const placement = popupPlacement(anchor.getBoundingClientRect(), viewportFrame(), width, panelInsets(), align, side);
    for (const [key, value] of Object.entries(placement)) panel.style.setProperty(`--dropdown-${key}`, `${value}px`);
  };
  const head = panel.querySelector('.panel-head');
  if (head) wireSheetDrag(panel, head, { enabled: compactLayout, onClose: close });
  panel.addEventListener('beforetoggle', event => {
    const opening = event.newState === 'open';
    if (opening) position();
    trigger.setAttribute('aria-expanded', String(opening));
  });
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
    document.addEventListener('click', event => { if (outside && !panel.contains(event.target) && !trigger.contains(event.target)) close(); });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && !panel.hidden) { close(); trigger.focus(); }
    });
    // popovertargetaction="hide" closes native popovers; the disclosure needs a handler.
    for (const button of panel.querySelectorAll('.panel-close')) button.addEventListener('click', () => { close(); trigger.focus(); });
  }
  const reposition = () => { if (trigger.getAttribute('aria-expanded') === 'true') position(); };
  window.addEventListener('resize', reposition);
  document.addEventListener('fullscreenchange', reposition);
  window.visualViewport?.addEventListener('resize', reposition);
  window.visualViewport?.addEventListener('scroll', reposition);
}

// The sidebar floats over the stage, as tall as its content, and collapses to its header;
// medium screens start with it collapsed. Phones turn it into a bottom sheet, opened from
// the building name at the top and closed by its close button, Escape, or a tap or
// downward drag on its handle. onChange runs after each change.
export function wireSidebar({ onChange = () => {} } = {}) {
  const viewer = document.getElementById('viewer');
  const overlay = matchMedia('(max-width: 1099px)');
  const compact = matchMedia('(max-width: 760px)');
  const toggle = document.getElementById('sidebar-toggle');
  const sheet = document.getElementById('sheet-toggle');
  const panel = document.getElementById('sidebar');
  let open = !overlay.matches;
  const sync = () => {
    viewer.classList.toggle('compact', compact.matches);
    viewer.classList.toggle('sidebar-collapsed', !open && !compact.matches);
    viewer.classList.toggle('sheet-open', open && compact.matches);
    toggle.setAttribute('aria-expanded', String(open));
    toggle.title = open ? 'Collapse panel' : 'Expand panel';
    sheet.setAttribute('aria-expanded', String(open));
    onChange({ open, compact: compact.matches });
  };
  const set = value => { open = value; sync(); };
  toggle.addEventListener('click', () => set(!open));
  // The whole header is a pointer target; the button carries the state for keyboards.
  document.querySelector('.sidebar-header').addEventListener('click', event => { if (!event.target.closest('button')) set(!open); });
  sheet.addEventListener('click', () => { set(!open); if (open) document.querySelector('.sidebar-tabs [aria-selected="true"]').focus({ preventScroll: true }); });
  const closeSheet = () => { set(false); sheet.focus({ preventScroll: true }); };
  document.getElementById('sheet-close').addEventListener('click', closeSheet);
  wireSheetDrag(panel, document.getElementById('sheet-grabber'), { enabled: () => compact.matches && open, onClose: closeSheet, onTap: closeSheet });
  // Escape closes the sheet, unless it is clearing the filter field first.
  panel.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || !compact.matches || !open || (event.target.matches('input') && event.target.value)) return;
    event.stopPropagation(); // The selection stays; a second Escape closes the element callout.
    closeSheet();
  });
  // Crossing a breakpoint resets to that layout's default.
  const reset = () => set(!overlay.matches);
  overlay.addEventListener('change', reset);
  compact.addEventListener('change', reset);
  sync();
  return {
    isOpen: () => open, isCompact: () => compact.matches,
    open: () => set(true),
    // Overlays and sheets cover the view; close them once the visitor has chosen something to look at.
    dismiss: () => { if (overlay.matches && open) set(false); },
  };
}
