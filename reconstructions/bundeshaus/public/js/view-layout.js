// CSS-pixel viewport geometry, including the area left by a software keyboard.
export function popupPlacement(anchor, viewport, preferredWidth = 330, margin = 16) {
  const edge = typeof margin === 'number' ? { left: margin, right: margin, top: margin, bottom: margin } : margin;
  const width = Math.max(1, Math.min(preferredWidth, viewport.width - edge.left - edge.right));
  const left = Math.max(viewport.left + edge.left, Math.min(anchor.left, viewport.left + viewport.width - width - edge.right));
  // On phones and short landscape screens, use the available height like a sheet.
  // Keeping the desktop anchor here would waste a third of a small viewport.
  const compact = viewport.width <= 420 || viewport.height <= 500;
  const top = compact ? viewport.top + edge.top
    : Math.max(viewport.top + edge.top, Math.min(anchor.bottom + 10, viewport.top + viewport.height - edge.bottom - 104));
  return { left, top, width, maxHeight: Math.max(1, viewport.top + viewport.height - top - edge.bottom) };
}

export function renderBudget({ width, height, dpr = 1, touch = false, quality = 'auto' }) {
  const pixels = quality === 'low' ? 2_000_000 : quality === 'high' ? 8_000_000 : touch ? 3_000_000 : 5_000_000;
  const cap = quality === 'low' ? 1 : quality === 'high' ? 2 : touch ? 1.25 : 1.5;
  return { pixelRatio: Math.min(Math.max(0.1, dpr), cap, Math.sqrt(pixels / Math.max(1, width * height))),
    shadowSize: quality === 'low' || (quality === 'auto' && touch) ? 1024 : 2048,
    transmissionScale: quality === 'low' || (quality === 'auto' && touch) ? 0.5 : 1 };
}
