// icons.js — shared icon registry, reused by the grid, the picker, and the canvas export.
// Each icon's `path` is drawn inside a 24×24 viewBox with `currentColor` stroking.

const ICONS = {
  desktop:  { label: 'Desktop',        symbol: 'ic-desktop' },
  laptop:   { label: 'Laptop',         symbol: 'ic-laptop' },
  monitor:  { label: 'Monitor',        symbol: 'ic-monitor' },
  monitor2: { label: 'Double Monitor', symbol: 'ic-monitor-double' },
  kvm:      { label: 'KVM',            symbol: 'ic-kvm' },
  server:   { label: 'Server',         symbol: 'ic-server' },
  person:   { label: 'Person',         symbol: 'ic-person' },
  chair:    { label: 'Chair',          symbol: 'ic-chair' },
  question: { label: 'Question',       symbol: 'ic-question' },
  star:     { label: 'Star',           symbol: 'ic-star' },
};
const ICON_IDS = Object.keys(ICONS);

/** Inner SVG markup for each symbol, keyed by symbol id. Mirrors the <symbol>s
 *  in index.html so the canvas exporter can rasterize icons without the DOM. */
const SYMBOL_MARKUP = {
  'ic-desktop':
    '<rect x="7" y="2.5" width="10" height="19" rx="1.2" fill="FILL" stroke="COLOR" stroke-width="1.6"/>' +
    '<path d="M9.5 6h5M9.5 8.5h5" fill="FILL" stroke="COLOR" stroke-width="1.6" stroke-linecap="round"/>' +
    '<circle cx="12" cy="17.5" r="1.3" fill="COLOR"/>',
  'ic-laptop':
    '<rect x="5" y="5" width="14" height="9" rx="1" fill="FILL" stroke="COLOR" stroke-width="1.6"/>' +
    '<path d="M3 18h18l-1.5-2H4.5L3 18z" fill="FILL" stroke="COLOR" stroke-width="1.6" stroke-linejoin="round"/>',
  'ic-monitor':
    '<rect x="3" y="4" width="18" height="12" rx="1" fill="FILL" stroke="COLOR" stroke-width="1.6"/>' +
    '<path d="M9 20h6m-3-4v4" fill="FILL" stroke="COLOR" stroke-width="1.6" stroke-linecap="round"/>',
  'ic-monitor-double':
    '<rect x="1.5" y="5" width="9.5" height="8" rx="1" fill="FILL" stroke="COLOR" stroke-width="1.6"/>' +
    '<rect x="13" y="5" width="9.5" height="8" rx="1" fill="FILL" stroke="COLOR" stroke-width="1.6"/>' +
    '<path d="M6.25 13v3.5M3.5 18.5h5.5M17.75 13v3.5M15 18.5h5.5" fill="FILL" stroke="COLOR" stroke-width="1.6" stroke-linecap="round"/>',
  'ic-kvm':
    '<rect x="3" y="3.5" width="18" height="12" rx="1" fill="FILL" stroke="COLOR" stroke-width="1.6"/>' +
    '<circle cx="6.6" cy="7.2" r=".85" fill="COLOR"/>' +
    '<circle cx="6.6" cy="11.8" r=".85" fill="COLOR"/>' +
    '<path d="M9.2 7.2h8.2M9.2 11.8h8.2" fill="FILL" stroke="COLOR" stroke-width="1.6" stroke-linecap="round"/>' +
    '<path d="M9 20h6m-3-4.5V20" fill="FILL" stroke="COLOR" stroke-width="1.6" stroke-linecap="round"/>',
  'ic-server':
    '<rect x="3" y="4" width="18" height="6" rx="1.2" fill="FILL" stroke="COLOR" stroke-width="1.6"/>' +
    '<rect x="3" y="14" width="18" height="6" rx="1.2" fill="FILL" stroke="COLOR" stroke-width="1.6"/>' +
    '<circle cx="6.6" cy="7" r=".9" fill="COLOR"/>' +
    '<circle cx="6.6" cy="17" r=".9" fill="COLOR"/>' +
    '<path d="M10 7h7M10 17h7" fill="FILL" stroke="COLOR" stroke-width="1.6" stroke-linecap="round"/>',
  'ic-person':
    '<circle cx="12" cy="8" r="3.2" fill="FILL" stroke="COLOR" stroke-width="1.6"/>' +
    '<path d="M5.5 20c0-3.6 2.9-6.5 6.5-6.5s6.5 2.9 6.5 6.5" fill="FILL" stroke="COLOR" stroke-width="1.6" stroke-linecap="round"/>',
  'ic-chair':
    '<path d="M8 3V20M8 13H17V20M8 8H14" fill="FILL" stroke="COLOR" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>',
  'ic-question':
    '<circle cx="12" cy="12" r="9" fill="FILL" stroke="COLOR" stroke-width="1.6"/>' +
    '<path d="M9.4 9.4a2.7 2.7 0 1 1 3.3 2.7c-.9.25-1.2.85-1.2 1.65v.35" fill="FILL" stroke="COLOR" stroke-width="1.6" stroke-linecap="round"/>' +
    '<circle cx="11.5" cy="17.2" r="1.05" fill="COLOR"/>',
  'ic-star':
    '<path d="M12 3l2.5 5.3 5.5.8-4 4 1 5.6L12 16l-5 2.7 1-5.6-4-4 5.5-.8L12 3z" fill="FILL" stroke="COLOR" stroke-width="1.6" stroke-linejoin="round"/>',
};

/** A `<svg><use>` element referencing an inline symbol — for grid & picker.
 *  `fill` paints the space enclosed by the icon's strokes; leave it out and the
 *  icon stays an outline, which is the default. */
function iconUse(id, className = 'cell__icon', fill = null) {
  const meta = ICONS[id];
  if (!meta) return null;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', className);
  svg.setAttribute('viewBox', '0 0 24 24');
  if (fill) svg.style.setProperty('--icon-fill', fill);
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  use.setAttribute('href', `#${meta.symbol}`);
  svg.appendChild(use);
  return svg;
}

/** A standalone SVG data-URL for a given icon + color — used by the canvas exporter. */
function iconDataUrl(id, color, fill = null) {
  const meta = ICONS[id];
  if (!meta) return null;
  const inner = SYMBOL_MARKUP[meta.symbol]
    .replaceAll('COLOR', color)
    .replaceAll('FILL', fill || 'none');
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">${inner}</svg>`;
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}
