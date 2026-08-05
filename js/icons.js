// icons.js — shared icon registry, reused by the grid, the picker, and the canvas export.
// Each icon's `path` is drawn inside a 24×24 viewBox with `currentColor` stroking.

const ICONS = {
  desktop: { label: 'Desktop', symbol: 'ic-desktop' },
  laptop:  { label: 'Laptop',  symbol: 'ic-laptop' },
  monitor: { label: 'Monitor', symbol: 'ic-monitor' },
  person:  { label: 'Person',  symbol: 'ic-person' },
  chair:   { label: 'Chair',   symbol: 'ic-chair' },
  phone:   { label: 'Phone',   symbol: 'ic-phone' },
  door:    { label: 'Door',    symbol: 'ic-door' },
  star:    { label: 'Star',    symbol: 'ic-star' },
};

const ICON_IDS = Object.keys(ICONS);

/** Inner SVG markup for each symbol, keyed by symbol id. Mirrors the <symbol>s
 *  in index.html so the canvas exporter can rasterize icons without the DOM. */
const SYMBOL_MARKUP = {
  'ic-desktop':
    '<rect x="4" y="3" width="8" height="14" rx="1" fill="none" stroke="COLOR" stroke-width="1.6"/>' +
    '<circle cx="8" cy="14" r="1" fill="COLOR"/>' +
    '<rect x="14" y="5" width="6" height="4" rx="0.5" fill="none" stroke="COLOR" stroke-width="1.6"/>',
  'ic-laptop':
    '<rect x="5" y="5" width="14" height="9" rx="1" fill="none" stroke="COLOR" stroke-width="1.6"/>' +
    '<path d="M3 18h18l-1.5-2H4.5L3 18z" fill="none" stroke="COLOR" stroke-width="1.6" stroke-linejoin="round"/>',
  'ic-monitor':
    '<rect x="3" y="4" width="18" height="12" rx="1" fill="none" stroke="COLOR" stroke-width="1.6"/>' +
    '<path d="M9 20h6m-3-4v4" fill="none" stroke="COLOR" stroke-width="1.6" stroke-linecap="round"/>',
  'ic-person':
    '<circle cx="12" cy="8" r="3.2" fill="none" stroke="COLOR" stroke-width="1.6"/>' +
    '<path d="M5.5 20c0-3.6 2.9-6.5 6.5-6.5s6.5 2.9 6.5 6.5" fill="none" stroke="COLOR" stroke-width="1.6" stroke-linecap="round"/>',
  'ic-chair':
    '<path d="M7 4v8m10-8v8M6 12h12M8 12l-1 8m10-8l1 8" fill="none" stroke="COLOR" stroke-width="1.6" stroke-linecap="round"/>',
  'ic-phone':
    '<rect x="7" y="3" width="10" height="18" rx="2" fill="none" stroke="COLOR" stroke-width="1.6"/>' +
    '<path d="M10.5 18h3" stroke="COLOR" stroke-width="1.6" stroke-linecap="round"/>',
  'ic-door':
    '<path d="M6 21V4a1 1 0 0 1 1-1h8v18M6 21h12M15 12h.01" fill="none" stroke="COLOR" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/>',
  'ic-star':
    '<path d="M12 3l2.5 5.3 5.5.8-4 4 1 5.6L12 16l-5 2.7 1-5.6-4-4 5.5-.8L12 3z" fill="none" stroke="COLOR" stroke-width="1.6" stroke-linejoin="round"/>',
};

/** A `<svg><use>` element referencing an inline symbol — for grid & picker. */
function iconUse(id, className = 'cell__icon') {
  const meta = ICONS[id];
  if (!meta) return null;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', className);
  svg.setAttribute('viewBox', '0 0 24 24');
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  use.setAttribute('href', `#${meta.symbol}`);
  svg.appendChild(use);
  return svg;
}

/** A standalone SVG data-URL for a given icon + color — used by the canvas exporter. */
function iconDataUrl(id, color) {
  const meta = ICONS[id];
  if (!meta) return null;
  const inner = SYMBOL_MARKUP[meta.symbol].replaceAll('COLOR', color);
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">${inner}</svg>`;
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}
