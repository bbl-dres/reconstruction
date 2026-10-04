import { popupPlacement } from './view-layout.js?v=lighting-sheet-2';

// Native dialogs supply focus containment and Escape dismissal, including in fullscreen.
export function openDialog(dialog, invoker = document.activeElement) {
  closeLighting();
  dialog.returnFocus = invoker;
  dialog.showModal();
}

export function wireDialogs() {
  for (const dialog of document.querySelectorAll('dialog')) {
    const trigger = document.querySelector(`[aria-controls="${dialog.id}"]`);
    trigger?.addEventListener('click', () => openDialog(dialog, trigger));
    dialog.querySelector('[data-close]').addEventListener('click', () => dialog.close());
    dialog.addEventListener('close', () => {
      // Switching from results to details must not steal focus from the new dialog.
      if (!document.querySelector('dialog[open]')) (dialog.returnFocus || trigger)?.focus({ preventScroll: true });
    });
    // A backdrop click dismisses; dragging a slider beyond the panel does not.
    let startedOutside = false;
    const outside = event => {
      const rect = dialog.getBoundingClientRect();
      return event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom;
    };
    dialog.addEventListener('pointerdown', event => { startedOutside = event.target === dialog && outside(event); });
    dialog.addEventListener('click', event => {
      if (startedOutside && event.target === dialog && outside(event)) dialog.close();
      startedOutside = false;
    });
  }
}

// Roving keyboard focus with automatic activation for the two local tabs.
export function wirePanelTabs(tablist) {
  const tabs = [...tablist.querySelectorAll('[role="tab"]')];
  const select = tab => {
    for (const item of tabs) {
      const active = item === tab;
      item.setAttribute('aria-selected', String(active));
      item.tabIndex = active ? 0 : -1;
      document.getElementById(item.getAttribute('aria-controls')).hidden = !active;
    }
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
}

export function setRangeDescription(input, text) {
  input.setAttribute('aria-valuetext', text);
}

export function viewportFrame() {
  const viewport = window.visualViewport;
  return { left: viewport?.offsetLeft || 0, top: viewport?.offsetTop || 0,
    width: viewport?.width || document.documentElement.clientWidth, height: viewport?.height || window.innerHeight };
}

function panelInsets() {
  const header = getComputedStyle(document.getElementById('viewer-header'));
  const footer = getComputedStyle(document.querySelector('.bottom-bar'));
  return { left: parseFloat(header.left), right: parseFloat(header.right), top: parseFloat(header.top), bottom: parseFloat(footer.bottom) };
}

export function closeLighting() {
  const panel = document.getElementById('lighting');
  if (typeof panel.hidePopover === 'function') {
    if (panel.matches(':popover-open')) panel.hidePopover();
  } else {
    panel.hidden = true;
    document.getElementById('lighting-toggle').setAttribute('aria-expanded', 'false');
  }
}

// Native popovers handle light-dismiss and focus. Older browsers keep a usable
// disclosure with explicit outside-click / Escape handling.
export function wireLightingDropdown() {
  const panel = document.getElementById('lighting');
  const trigger = document.getElementById('lighting-toggle');
  if (typeof panel.showPopover === 'function') panel.hidden = false;
  const position = () => {
    const width = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--panel-width'));
    const placement = popupPlacement(trigger.getBoundingClientRect(), viewportFrame(), width, panelInsets());
    for (const [key, value] of Object.entries(placement)) panel.style.setProperty(`--dropdown-${key}`, `${value}px`);
  };
  panel.addEventListener('beforetoggle', event => {
    const opening = event.newState === 'open';
    if (opening) position();
    trigger.setAttribute('aria-expanded', String(opening));
  });
  if (typeof panel.showPopover !== 'function') {
    panel.hidden = true;
    trigger.addEventListener('click', () => {
      if (!panel.hidden) { closeLighting(); return; }
      position(); panel.hidden = false;
      trigger.setAttribute('aria-expanded', 'true');
      panel.querySelector('[autofocus]').focus({ preventScroll: true });
    });
    panel.querySelector('[popovertargetaction="hide"]').addEventListener('click', () => { closeLighting(); trigger.focus(); });
    let outside = false;
    document.addEventListener('pointerdown', event => { outside = !panel.contains(event.target) && !trigger.contains(event.target); });
    document.addEventListener('click', event => { if (outside && !panel.contains(event.target) && !trigger.contains(event.target)) closeLighting(); });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && !panel.hidden) { closeLighting(); trigger.focus(); }
    });
  }
  const reposition = () => { if (trigger.getAttribute('aria-expanded') === 'true') position(); };
  window.addEventListener('resize', reposition);
  document.addEventListener('fullscreenchange', reposition);
  window.visualViewport?.addEventListener('resize', reposition);
  window.visualViewport?.addEventListener('scroll', reposition);
}

export function wireResponsiveLayout() {
  const root = document.documentElement;
  const header = document.getElementById('viewer-header');
  const tools = document.getElementById('model-tools');
  const modes = document.querySelector('.mode-bar');
  const compact = matchMedia('(max-width: 760px), (max-height: 500px)');
  const syncTools = () => { tools.open = !compact.matches; };
  syncTools();
  compact.addEventListener('change', syncTools);
  const sync = () => {
    const viewport = viewportFrame();
    const bottom = header.getBoundingClientRect().bottom;
    root.style.setProperty('--mode-height', `${modes.getBoundingClientRect().height}px`);
    root.style.setProperty('--tools-top', `${bottom + 12}px`);
    root.style.setProperty('--viewport-top', `${viewport.top}px`);
    root.style.setProperty('--viewport-left', `${viewport.left}px`);
    root.style.setProperty('--viewport-width', `${viewport.width}px`);
    root.style.setProperty('--viewport-height', `${viewport.height}px`);
    const edge = panelInsets();
    const panelTop = viewport.top + Math.max(edge.top, Math.min(bottom + 10 - viewport.top, viewport.height * 0.16));
    root.style.setProperty('--panel-top', `${panelTop}px`);
    root.style.setProperty('--panel-height', `${Math.max(1, viewport.top + viewport.height - panelTop - edge.bottom)}px`);
  };
  const observer = new ResizeObserver(sync);
  observer.observe(header);
  observer.observe(modes);
  window.addEventListener('resize', sync);
  window.visualViewport?.addEventListener('resize', sync);
  window.visualViewport?.addEventListener('scroll', sync);
  sync();
}
