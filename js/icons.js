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
  stairs:   { label: 'Stairs',         symbol: 'ic-stairs-icon' },
};
const ICON_IDS = Object.keys(ICONS);

// ---------------------------------------------------------------- imported icons
//
// The user can import their own SVG icons — e.g. MIT-licensed Bootstrap Icons —
// which are stored in state.config.customIcons and rendered alongside the built
// in set. Imported markup is sanitized down to plain shape elements so nothing
// scriptable ever reaches the DOM.

const CUSTOM_ICON_TAGS = new Set(['g', 'path', 'circle', 'ellipse', 'rect', 'line', 'polyline', 'polygon']);
const CUSTOM_ICON_ATTRS = new Set([
  'd', 'cx', 'cy', 'r', 'rx', 'ry', 'x', 'y', 'width', 'height', 'x1', 'y1', 'x2', 'y2', 'points',
  'fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'stroke-miterlimit',
  'fill-rule', 'clip-rule', 'transform', 'opacity', 'fill-opacity', 'stroke-opacity',
]);

/** Parse an imported <svg> (such as a Bootstrap Icon) into a safe
 *  { viewBox, inner }: `inner` is a sanitized markup string of shape elements and
 *  safe attributes only. Returns null when the text is not a usable <svg>. */
function parseIconSvg(text) {
  let doc;
  try { doc = new DOMParser().parseFromString(String(text).trim(), 'image/svg+xml'); }
  catch { return null; }
  if (doc.querySelector('parsererror')) return null;
  const svg = doc.querySelector('svg');
  if (!svg) return null;

  let viewBox = svg.getAttribute('viewBox');
  if (!viewBox || !/^[-\d.\s]+$/.test(viewBox)) {
    const w = parseFloat(svg.getAttribute('width')) || 16;
    const h = parseFloat(svg.getAttribute('height')) || 16;
    viewBox = `0 0 ${w} ${h}`;
  }

  const clean = (el) => {
    const tag = el.tagName.toLowerCase();
    if (!CUSTOM_ICON_TAGS.has(tag)) return '';
    let attrs = '';
    for (const a of el.attributes) {
      const name = a.name.toLowerCase();
      if (!CUSTOM_ICON_ATTRS.has(name)) continue;
      if (/url\(|javascript:|expression/i.test(a.value)) continue;
      attrs += ` ${name}="${a.value.replace(/"/g, '&quot;')}"`;
    }
    let inner = '';
    for (const child of el.children) inner += clean(child);
    return `<${tag}${attrs}>${inner}</${tag}>`;
  };

  let inner = '';
  for (const child of svg.children) inner += clean(child);
  inner = inner.trim();
  return inner ? { viewBox, inner } : null;
}

/** WCAG relative luminance of an {r,g,b} colour, 0 (black) … 1 (white). */
function relLuminance(rgb) {
  const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  return 0.2126 * f(rgb.r) + 0.7152 * f(rgb.g) + 0.0722 * f(rgb.b);
}

/** A readable version of `color` for text drawn straight on `bgHex`: keep the
 *  chosen colour when it has enough contrast, otherwise swap to black on a light
 *  background or white on a dark one — so white on white AND white on a light
 *  slab both become legible. Shared by the grid and the export. */
function contrastLabelColor(color, bgHex) {
  const c = hexToRgb(color || '#1f2933'), b = hexToRgb(bgHex || '#ffffff');
  if (!c || !b) return color || '#1f2933';
  const lc = relLuminance(c) + 0.05, lb = relLuminance(b) + 0.05;
  const ratio = lc > lb ? lc / lb : lb / lc;
  if (ratio >= 2) return color;               // legible enough — keep the chosen colour
  return relLuminance(b) > 0.4 ? '#000000' : '#ffffff';
}

/** Dark or light ink, whichever reads on `bgHex` — for text that always needs to
 *  stand out (a chart title), not just when it happens to match. */
function readableInk(bgHex) {
  const b = hexToRgb(bgHex || '#ffffff');
  if (!b) return '#1f2933';
  return relLuminance(b) > 0.4 ? '#1f2933' : '#f4f5f7';
}

function customIcon(id) {
  const list = state.config && state.config.customIcons;
  return list ? list.find((c) => c.id === id) : null;
}
function isCustomIcon(id) { return !!customIcon(id); }

/** Human label for any icon id — built-in or imported. */
function iconLabel(id) {
  return (ICONS[id] && ICONS[id].label) || (customIcon(id) && customIcon(id).label) || id;
}
function iconExists(id) { return !!(ICONS[id] || customIcon(id)); }

/** Ids offered in the editor's Icon picker: the built-in non-furniture icons,
 *  then every imported icon. */
function pickableIconIds() {
  const builtin = ICON_IDS.filter((id) => !(typeof FURNITURE_ICONS !== 'undefined' && FURNITURE_ICONS[id]));
  const custom = ((state.config && state.config.customIcons) || []).map((c) => c.id);
  return builtin.concat(custom);
}

/** Inner SVG markup for each symbol, keyed by symbol id. Mirrors the <symbol>s
 *  in index.html so the canvas exporter can rasterize icons without the DOM. */
const SYMBOL_MARKUP = {
  'ic-desktop':
    '<rect x="7" y="2.5" width="10" height="19" rx="1.2" fill="FILL" stroke="COLOR" stroke-width="1.6"/>' +
    '<path d="M9.5 6h5M9.5 8.5h5" fill="FILL" stroke="COLOR" stroke-width="1.6" stroke-linecap="round"/>' +
    '<circle cx="12" cy="17.5" r="1.3" fill="COLOR"/>',
  'ic-laptop':
    '<rect x="5" y="5" width="14" height="9" rx="1" fill="FILL" stroke="COLOR" stroke-width="1.0"/>' +
    '<path d="M3 18h18l-1.5-2H4.5L3 18z" fill="FILL" stroke="COLOR" stroke-width="1.0" stroke-linejoin="round"/>',
  'ic-monitor':
    '<rect x="3" y="4" width="18" height="12" rx="1" fill="FILL" stroke="COLOR" stroke-width="1.6"/>' +
    '<path d="M9 20h6m-3-4v4" fill="FILL" stroke="COLOR" stroke-width="1.6" stroke-linecap="round"/>',
  'ic-monitor-double':
    '<rect x="0.4" y="0.4" width="10.4" height="7" rx="1" fill="FILL" stroke="COLOR" stroke-width="0.8"/>' +
    '<path d="M3.8 10.6h3.6m-1.8-3.2v3.2" fill="none" stroke="COLOR" stroke-width="0.8" stroke-linecap="round"/>' +
    '<rect x="13.2" y="0.4" width="10.4" height="7" rx="1" fill="FILL" stroke="COLOR" stroke-width="0.8"/>' +
    '<path d="M16.6 10.6h3.6m-1.8-3.2v3.2" fill="none" stroke="COLOR" stroke-width="0.8" stroke-linecap="round"/>',
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
    '<path d="M17.45,14.96C17.45,15.55 16.97,16.02 16.36,16.02L7.64,16.02C7.04,16.02 6.55,15.55 6.55,14.96C6.55,14.37 7.04,13.89 7.64,13.89L16.36,13.89C16.97,13.89 17.45,14.37 17.45,14.96Z" fill="FILL" stroke="none"/>' +
    '<path d="M4.54,8.81C4.54,9.4 4.06,9.88 3.46,9.88L2,9.88C1.4,9.88 0.91,9.4 0.91,8.81C0.91,8.22 1.4,7.75 2,7.75L3.46,7.75C4.06,7.75 4.54,8.22 4.54,8.81Z" fill="FILL" stroke="none"/>' +
    '<ellipse cx="21.27" cy="8.81" rx="1.85" ry="1.82" fill="FILL" stroke="none"/>' +
    '<path d="M17.45,2.01C17.62,3.26 17.62,7.41 17.45,8.68C17.43,8.9 17.42,9.31 17.23,9.49C17.05,9.67 16.7,9.62 16.47,9.62C14.78,9.61 9.21,9.62 7.54,9.62C7.32,9.62 6.91,9.67 6.73,9.5C6.54,9.32 6.58,8.91 6.55,8.68C6.38,7.41 6.38,3.26 6.55,2.01C6.6,1.59 7.1,1.21 7.53,1.18C8.36,1.11 10.18,0.97 12,0.97C13.82,0.97 15.65,1.11 16.47,1.18C16.91,1.21 17.4,1.59 17.45,2.01Z" fill="FILL" stroke="none"/>' +
    '<path d="M18.47,3.43C18.64,4.74 18.47,9.1 18.47,9.1C18.47,9.97 17.75,10.69 16.86,10.69L7.14,10.69C6.25,10.69 5.53,9.97 5.53,9.1C5.53,9.1 5.36,4.74 5.53,3.43C5.63,2.65 5.95,1.81 6.53,1.28C7.12,0.73 8.15,0.27 9.07,0.14C10.49,-0.05 13.61,-0.05 15.01,0.14C15.9,0.26 16.89,0.73 17.47,1.28C18.04,1.82 18.37,2.64 18.47,3.43ZM17.39,3.56C17.32,3.01 17.11,2.43 16.71,2.05C16.28,1.64 15.53,1.29 14.86,1.2C13.53,1.02 10.56,1.02 9.22,1.2C8.52,1.29 7.72,1.64 7.28,2.06C6.88,2.43 6.68,3.02 6.61,3.56C6.45,4.83 6.62,9.06 6.62,9.06L6.62,9.1C6.62,9.38 6.85,9.62 7.14,9.62L16.86,9.62C17.15,9.62 17.38,9.38 17.38,9.1L17.38,9.06C17.38,9.06 17.55,4.83 17.39,3.56Z" fill="COLOR" fill-rule="evenodd"/>' +
    '<path d="M24,8.81C24,9.85 23.13,10.68 22.07,10.68L20.48,10.68C19.41,10.68 18.55,9.85 18.55,8.81C18.55,7.78 19.41,6.95 20.48,6.95L22.07,6.95C23.13,6.95 24,7.78 24,8.81ZM23.09,8.81C23.09,8.27 22.63,7.83 22.07,7.83L20.48,7.83C19.92,7.83 19.45,8.27 19.45,8.81C19.45,9.36 19.92,9.79 20.48,9.79L22.07,9.79C22.63,9.79 23.09,9.36 23.09,8.81Z" fill="COLOR" fill-rule="evenodd"/>' +
    '<path d="M5.46,8.81C5.46,9.85 4.59,10.68 3.52,10.68L1.94,10.68C0.87,10.68 0,9.85 0,8.81C0,7.78 0.87,6.95 1.94,6.95L3.52,6.95C4.59,6.95 5.46,7.78 5.46,8.81ZM4.55,8.81C4.55,8.27 4.08,7.83 3.52,7.83L1.94,7.83C1.37,7.83 0.91,8.27 0.91,8.81C0.91,9.36 1.37,9.79 1.94,9.79L3.52,9.79C4.08,9.79 4.55,9.36 4.55,8.81Z" fill="COLOR" fill-rule="evenodd"/>' +
    '<path d="M14.73,9.62L14.73,13.89L9.27,13.89L9.27,9.62L14.73,9.62ZM13.64,10.69L10.36,10.69L10.36,12.82L13.64,12.82L13.64,10.69Z" fill="COLOR" fill-rule="evenodd"/>' +
    '<path d="M18.55,14.96C18.55,16.14 17.57,17.09 16.36,17.09L7.64,17.09C6.43,17.09 5.46,16.14 5.46,14.96C5.46,13.78 6.43,12.82 7.64,12.82L16.36,12.82C17.57,12.82 18.55,13.78 18.55,14.96ZM17.45,14.96C17.45,14.37 16.97,13.89 16.36,13.89L7.64,13.89C7.04,13.89 6.55,14.37 6.55,14.96C6.55,15.55 7.04,16.03 7.64,16.03L16.36,16.03C16.97,16.03 17.45,15.55 17.45,14.96Z" fill="COLOR" fill-rule="evenodd"/>' +
    '<path d="M13.7,16.83L13.03,19.77C13.03,20.21 13.33,19.23 12.88,19.23L11.12,19.23C10.66,19.23 10.85,20.21 10.85,19.77L10.3,16.83C10.3,16.39 10.66,16.03 11.12,16.03L12.88,16.03C13.33,16.03 13.7,16.39 13.7,16.83ZM11.39,17.09L11.66,19.23L12.28,19.23L12.61,17.09L11.39,17.09Z" fill="COLOR" fill-rule="evenodd"/>' +
    '<path d="M2.73,10.69C2.91,10.86 3.27,11.21 3.27,11.75C3.28,12.29 3.27,13.32 3.27,13.89C3.27,14.37 3.96,14.95 4.37,14.96C4.75,14.96 5.46,14.96 5.46,14.96" fill="none" stroke="COLOR" stroke-width="1.06" stroke-linecap="round"/>' +
    '<path d="M21.27,10.69C21.09,10.86 20.73,11.21 20.73,11.75C20.72,12.29 20.73,13.32 20.73,13.89C20.73,14.37 20.04,14.95 19.64,14.96C19.25,14.96 18.55,14.96 18.55,14.96" fill="none" stroke="COLOR" stroke-width="1.06" stroke-linecap="round"/>' +
    '<path d="M6.55,20.3C6.55,20.3 8,20.3 8.73,20.3C9.47,20.3 12,19.23 12,19.23C12,19.23 14.54,20.3 15.27,20.3C16.01,20.3 17.45,20.3 17.45,20.3" fill="none" stroke="COLOR" stroke-width="1.08" stroke-linecap="round"/>' +
    '<path d="M6.55,19.77C7.75,19.77 8.73,20.71 8.73,21.88C8.73,23.05 7.75,24 6.55,24C5.34,24 4.37,23.05 4.37,21.88C4.37,20.71 5.34,19.77 6.55,19.77ZM6.55,20.83C5.95,20.83 5.46,21.3 5.46,21.88C5.46,22.46 5.95,22.93 6.55,22.93C7.14,22.93 7.64,22.46 7.64,21.88C7.64,21.3 7.14,20.83 6.55,20.83Z" fill="COLOR" fill-rule="evenodd"/>' +
    '<path d="M17.45,19.77C18.66,19.77 19.64,20.71 19.64,21.88C19.64,23.05 18.66,24 17.45,24C16.25,24 15.27,23.05 15.27,21.88C15.27,20.71 16.25,19.77 17.45,19.77ZM17.45,20.83C16.86,20.83 16.36,21.3 16.36,21.88C16.36,22.46 16.86,22.93 17.45,22.93C18.05,22.93 18.55,22.46 18.55,21.88C18.55,21.3 18.05,20.83 17.45,20.83Z" fill="COLOR" fill-rule="evenodd"/>' +
    '<path d="M9.82,5.34L14.18,5.34" fill="none" stroke="COLOR" stroke-width="0.98" stroke-linecap="round"/>' +
    '<path d="M8.73,3.21L15.27,3.21" fill="none" stroke="COLOR" stroke-width="1" stroke-linecap="round"/>' +
    '<path d="M8.73,7.48L15.27,7.48" fill="none" stroke="COLOR" stroke-width="1" stroke-linecap="round"/>',
  'ic-question':
    '<circle cx="12" cy="12" r="9" fill="FILL" stroke="COLOR" stroke-width="1.6"/>' +
    '<path d="M9.4 9.4a2.7 2.7 0 1 1 3.3 2.7c-.9.25-1.2.85-1.2 1.65v.35" fill="FILL" stroke="COLOR" stroke-width="1.6" stroke-linecap="round"/>' +
    '<circle cx="11.5" cy="17.2" r="1.05" fill="COLOR"/>',
  'ic-star':
    '<path d="M12 3l2.5 5.3 5.5.8-4 4 1 5.6L12 16l-5 2.7 1-5.6-4-4 5.5-.8L12 3z" fill="FILL" stroke="COLOR" stroke-width="1.6" stroke-linejoin="round"/>',
  'ic-printer':
    '<g transform="matrix(0.5,0,0,1.666667,2,-7)"><rect x="4" y="9" width="8" height="3" style="fill:white;"/></g>' +
    '<g transform="matrix(0.5,0,0,1.666667,6,-7)"><rect x="4" y="9" width="8" height="3" style="fill:rgb(8,6,5);"/></g>' +
    '<g transform="matrix(1,0,0,1,0,-1)"><path d="M2.5,8C2.774,8 3,7.774 3,7.5C3,7.226 2.774,7 2.5,7C2.226,7 2,7.226 2,7.5C2,7.774 2.226,8 2.5,8" style="fill:rgb(175,0,0);fill-rule:nonzero;"/></g>' +
    '<g transform="matrix(1,0,0,1,0,-1)"><path d="M5,1C3.903,1 3,1.903 3,3L3,5L2,5C0.903,5 -0,5.903 0,7L0,10C0,11.097 0.903,12 2,12L3,12L3,13C3,14.097 3.903,15 5,15L11,15C12.097,15 13,14.097 13,13L13,12L14,12C15.097,12 16,11.097 16,10L16,7C16,5.903 15.097,5 14,5L13,5L13,3C13,1.903 12.097,1 11,1L5,1ZM4,3C4,2.451 4.451,2 5,2L11,2C11.549,2 12,2.451 12,3L12,5L4,5L4,3ZM5,8C3.903,8 3,8.903 3,10L3,11L2,11C1.451,11 1,10.549 1,10L1,7C1,6.451 1.451,6 2,6L14,6C14.549,6 15,6.451 15,7L15,10C15,10.549 14.549,11 14,11L13,11L13,10C13,8.903 12.097,8 11,8L5,8ZM12,10L12,13C12,13.549 11.549,14 11,14L5,14C4.451,14 4,13.549 4,13L4,10C4,9.451 4.451,9 5,9L11,9C11.549,9 12,9.451 12,10" style="fill-rule:nonzero;" fill="COLOR"/></g>',
  'ic-printer-fill':
    '<g transform="matrix(0.333333,0,0,1.666667,5.333333,-7)"><rect x="4" y="9" width="8" height="3" style="fill:rgb(236,0,140);"/></g>' +
    '<g transform="matrix(0.333333,0,0,1.666667,2.666667,-7)"><rect x="4" y="9" width="8" height="3" style="fill:rgb(0,174,239);"/></g>' +
    '<g transform="matrix(0.333333,0,0,1.666667,8,-7)"><rect x="4" y="9" width="8" height="3" style="fill:rgb(255,242,0);"/></g>' +
    '<g transform="matrix(1,0,0,1,0,-1)"><path d="M2.5,8C2.774,8 3,7.774 3,7.5C3,7.226 2.774,7 2.5,7C2.226,7 2,7.226 2,7.5C2,7.774 2.226,8 2.5,8" style="fill:rgb(175,0,0);fill-rule:nonzero;"/></g>' +
    '<g transform="matrix(1,0,0,1,0,-1)"><path d="M5,1C3.903,1 3,1.903 3,3L3,5L2,5C0.903,5 -0,5.903 0,7L0,10C0,11.097 0.903,12 2,12L3,12L3,13C3,14.097 3.903,15 5,15L11,15C12.097,15 13,14.097 13,13L13,12L14,12C15.097,12 16,11.097 16,10L16,7C16,5.903 15.097,5 14,5L13,5L13,3C13,1.903 12.097,1 11,1L5,1ZM4,3C4,2.451 4.451,2 5,2L11,2C11.549,2 12,2.451 12,3L12,5L4,5L4,3ZM5,8C3.903,8 3,8.903 3,10L3,11L2,11C1.451,11 1,10.549 1,10L1,7C1,6.451 1.451,6 2,6L14,6C14.549,6 15,6.451 15,7L15,10C15,10.549 14.549,11 14,11L13,11L13,10C13,8.903 12.097,8 11,8L5,8ZM12,10L12,13C12,13.549 11.549,14 11,14L5,14C4.451,14 4,13.549 4,13L4,10C4,9.451 4.451,9 5,9L11,9C11.549,9 12,9.451 12,10" style="fill-rule:nonzero;" fill="COLOR"/></g>',
  // Stairs picker-button icon (side staircase outline), scaled from its 1140
  // space into the 24-unit icon box. Only the Special-row button uses it.
  'ic-stairs-icon':
    '<g transform="scale(0.02105263)"><g transform="matrix(1,0,0,1.235871,12.5,-726.806108)"><path d="M0,1500L0,1319.641L222.886,1319.641L222.886,1139.283L445.773,1139.283L445.773,958.924L668.659,958.924L668.659,778.565L891.546,778.565L891.546,598.207L1114.3,598.207L1114.3,1500L0,1500ZM25,1479.771L1089.3,1479.771L1089.3,618.435L916.546,618.435L916.546,778.565C916.546,789.737 905.353,798.794 891.546,798.794L693.659,798.794L693.659,958.924C693.659,970.096 682.466,979.153 668.659,979.153L470.773,979.153L470.773,1139.283C470.773,1150.455 459.58,1159.511 445.773,1159.511L247.886,1159.511L247.886,1319.641C247.886,1330.813 236.694,1339.87 222.886,1339.87L25,1339.87L25,1479.771Z" fill="COLOR" stroke="COLOR" stroke-width="55"/></g></g>',
  // The four stair variants, exactly as authored (Serif export). Each fills its
  // own square and positions the step bars so a half-bar sits on the connecting
  // edge: two adjacent stairs' half-bars meet on the seam to form one full bar.
  // A start caps the top of a run (full bar at top), an end caps the bottom
  // (full bar + descent arrow), a middle has half-bars at both ends, a single
  // caps both. currentColor so the marks flip black↔white with the theme.
  'ic-stairs-single':
    '<g fill="COLOR">' +
    '<g transform="matrix(1,0,0,1,17.5,392.5)"><rect x="-17.5" y="1107.5" width="1535" height="35"/></g>' +
    '<g transform="matrix(1,0,0,1,17.5,16.74575)"><path d="M750,1290.719L960,1230.625L750,1395.883L540,1230.625L750,1290.719Z"/></g>' +
    '<g transform="matrix(1,0,0,1,17.5,-341.5)"><rect x="-17.5" y="1466.5" width="1535" height="35"/></g>' +
    '<g transform="matrix(1,0,0,1,17.5,17.5)"><rect x="-17.5" y="732.5" width="1535" height="35"/></g>' +
    '<g transform="matrix(1,0,0,1,17.5,-732.5)"><rect x="-17.5" y="1107.5" width="1535" height="35"/></g>' +
    '<g transform="matrix(1,0,0,1,17.5,-164.7105)"><path d="M750,422.293L630,317.128L750,364.452L870,317.128L750,422.293Z"/></g>' +
    '<g transform="matrix(1,0,0,1,17.5,-1107.5)"><rect x="-17.5" y="1107.5" width="1535" height="35"/></g>' +
    '</g>',
  'ic-stairs-start':
    '<g fill="COLOR">' +
    '<g transform="matrix(1,0,0,0.5,17.5,963.75)"><rect x="-17.5" y="1107.5" width="1535" height="35"/></g>' +
    '<g transform="matrix(1,0,0,1,17.5,-341.5)"><rect x="-17.5" y="1466.5" width="1535" height="35"/></g>' +
    '<g transform="matrix(1,0,0,1,17.5,17.5)"><rect x="-17.5" y="732.5" width="1535" height="35"/></g>' +
    '<g transform="matrix(1,0,0,1,17.5,-732.5)"><rect x="-17.5" y="1107.5" width="1535" height="35"/></g>' +
    '<g transform="matrix(1,0,0,1,17.5,-164.7105)"><path d="M750,422.293L630,317.128L750,364.452L870,317.128L750,422.293Z"/></g>' +
    '<g transform="matrix(1,0,0,1,17.5,-357.5)"><rect x="-17.5" y="357.5" width="1535" height="35"/></g>' +
    '</g>',
  'ic-stairs-middle':
    '<g fill="COLOR">' +
    '<g transform="matrix(1,0,0,0.5,17.5,963.75)"><rect x="-17.5" y="1107.5" width="1535" height="35"/></g>' +
    '<g transform="matrix(1,0,0,1,17.5,-332.75)"><rect x="-17.5" y="1466.5" width="1535" height="35"/></g>' +
    '<g transform="matrix(1,0,0,1,17.5,17.5)"><rect x="-17.5" y="732.5" width="1535" height="35"/></g>' +
    '<g transform="matrix(1,0,0,1,17.5,-741.25)"><rect x="-17.5" y="1107.5" width="1535" height="35"/></g>' +
    '<g transform="matrix(1,0,0,0.5,17.5,-553.75)"><rect x="-17.5" y="1107.5" width="1535" height="35"/></g>' +
    '</g>',
  'ic-stairs-end':
    '<g fill="COLOR">' +
    '<g transform="matrix(1,0,0,1,17.5,16)"><rect x="-17.5" y="1466.5" width="1535" height="35"/></g>' +
    '<g transform="matrix(1,0,0,1,17.5,-0.75425)"><path d="M750,1290.719L960,1230.625L750,1395.883L540,1230.625L750,1290.719Z"/></g>' +
    '<g transform="matrix(1,0,0,1,17.5,-359)"><rect x="-17.5" y="1466.5" width="1535" height="35"/></g>' +
    '<g transform="matrix(1,0,0,1,17.5,0)"><rect x="-17.5" y="732.5" width="1535" height="35"/></g>' +
    '<g transform="matrix(1,0,0,1,17.5,-750)"><rect x="-17.5" y="1107.5" width="1535" height="35"/></g>' +
    '<g transform="matrix(1,0,0,0.5,17.5,-553.75)"><rect x="-17.5" y="1107.5" width="1535" height="35"/></g>' +
    '</g>',
  'ic-stairs-corner':
    '<g transform="matrix(1,0,0,1,13.368513,13.39392)" fill="COLOR">' +
    '<g transform="matrix(1,0,0,0.5,17.5,963.75)"><rect x="-17.5" y="1107.5" width="1535" height="35"/></g>' +
    '<g transform="matrix(1.000017,0.41422,-0.381232,0.920375,576.551034,-475.572633)"><path d="M1517.5,1466.5L1517.5,1501.5L-4.132,1501.5L-17.5,1466.5L1517.5,1466.5Z"/></g>' +
    '<g transform="matrix(0.999967,0.999967,-0.707107,0.707107,547.829507,-512.830665)"><path d="M1517.5,750L1505.025,767.5L-5.025,767.5L-17.5,750L-5.025,732.5L1505.025,732.5L1517.5,750Z"/></g>' +
    '<g transform="matrix(0.414214,1,-0.92388,0.382683,1929.627501,-419.715821)"><path d="M1517.5,1107.5L1517.5,1142.5L-17.5,1142.5L-4.106,1107.5L1517.5,1107.5Z"/></g>' +
    '<g transform="matrix(0,1,-0.5,0,2088.75,17.5)"><rect x="-17.5" y="1107.5" width="1535" height="35"/></g>' +
    '</g>',
};

// Diagonal step-bars (authored at facing 45°), shared by diag single/start/end;
// the chevron (start) and arrow (end) are the same shapes the straight art uses,
// pre-rotated into the diagonal. A single carries both, a middle uses the fan.
const DIAG_BARS =
  '<g transform="matrix(-0.325139,-0.325139,0.707107,-0.707107,746.189305,1276.519391)"><path d="M1517.5,1107.5L1441.383,1142.5L58.617,1142.5L-17.5,1107.5L1517.5,1107.5Z"/></g>' +
  '<g transform="matrix(-0.670631,-0.670631,0.707107,-0.707107,486.291862,2054.654703)"><path d="M1517.5,1466.5L1517.5,1501.5L19.404,1501.5L-17.5,1466.5L1517.5,1466.5Z"/></g>' +
  '<g transform="matrix(-1,-1,0.707107,-0.707107,987.169914,2047.830086)"><path d="M1517.5,750L1505.126,767.5L-5.126,767.5L-17.5,750L-5.126,732.5L1505.126,732.5L1517.5,750Z"/></g>' +
  '<g transform="matrix(-0.670631,-0.670631,0.707107,-0.707107,209.813111,2331.133454)"><path d="M1480.596,1107.5L1517.5,1142.5L-17.5,1142.5L19.404,1107.5L1480.596,1107.5Z"/></g>' +
  '<g transform="matrix(-0.325139,-0.325139,0.707107,-0.707107,-314.470867,2337.179563)"><path d="M1441.383,1107.5L1517.5,1142.5L-17.5,1142.5L58.617,1107.5L1441.383,1107.5Z"/></g>';
const DIAG_CHEVRON =
  '<g transform="matrix(-0.707107,-0.707107,0.707107,-0.707107,638.65772,1957.002452)"><path d="M750,422.293L630,317.128L750,364.452L870,317.128L750,422.293Z"/></g>';
const DIAG_ARROW =
  '<g transform="matrix(-0.707107,-0.707107,0.707107,-0.707107,766.966665,1828.693507)"><path d="M750,1290.719L960,1230.625L750,1395.883L540,1230.625L750,1290.719Z"/></g>';
const DIAG_WRAP = (inner) => '<g transform="matrix(1,0,0,1,24.748737,24.748737)" fill="COLOR">' + inner + '</g>';
SYMBOL_MARKUP['ic-stairs-diag-single'] = DIAG_WRAP(DIAG_BARS + DIAG_CHEVRON + DIAG_ARROW);
SYMBOL_MARKUP['ic-stairs-diag-start'] = DIAG_WRAP(DIAG_BARS + DIAG_CHEVRON);
SYMBOL_MARKUP['ic-stairs-diag-end'] = DIAG_WRAP(DIAG_BARS + DIAG_ARROW);

// Straight: end is 1535×1518 (bottom bar flush), the rest 1535×1535. Diagonal
// variants are authored at facing 45° (arrow ↗): the winder-corner fan is the
// diagonal MIDDLE (1561); diag-single/start/end are the diagonal step-bars
// carrying both / chevron / arrow (1585).
const STAIRS_VIEWBOXES = {
  single: '0 0 1535 1535',
  start:  '0 0 1535 1535',
  middle: '0 0 1535 1535',
  end:    '0 0 1535 1518',
  corner: '0 0 1561 1561',
  diagSingle: '0 0 1585 1585',
  diagStart:  '0 0 1585 1585',
  diagEnd:    '0 0 1585 1585',
};
const STAIRS_SYMBOLS = {
  single: 'ic-stairs-single',
  start:  'ic-stairs-start',
  middle: 'ic-stairs-middle',
  end:    'ic-stairs-end',
  corner: 'ic-stairs-corner',
  diagSingle: 'ic-stairs-diag-single',
  diagStart:  'ic-stairs-diag-start',
  diagEnd:    'ic-stairs-diag-end',
};

// The diagonal variant to draw for a resolved stair type (facing is diagonal).
function diagStairSymbol(variant) {
  if (variant === 'middle') return 'corner';
  if (variant === 'start') return 'diagStart';
  if (variant === 'end') return 'diagEnd';
  return 'diagSingle';
}

function stairsDataUrl(variant, color) {
  const symId = STAIRS_SYMBOLS[variant] || STAIRS_SYMBOLS.single;
  const vb = STAIRS_VIEWBOXES[variant] || STAIRS_VIEWBOXES.single;
  const inner = SYMBOL_MARKUP[symId].replaceAll('COLOR', color);
  // preserveAspectRatio=none so the art fills the square edge to edge (the cell
  // IS one 1535-unit square), keeping the half-bars on the cell's own edges.
  return 'data:image/svg+xml;charset=utf-8,' +
    encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" preserveAspectRatio="none">${inner}</svg>`);
}

function stairsUse(variant, className, color) {
  const symId = STAIRS_SYMBOLS[variant] || STAIRS_SYMBOLS.single;
  const vb = STAIRS_VIEWBOXES[variant] || STAIRS_VIEWBOXES.single;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', className);
  svg.setAttribute('viewBox', vb);
  svg.setAttribute('preserveAspectRatio', 'none');
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  use.setAttribute('href', `#${symId}`);
  svg.appendChild(use);
  svg.style.color = color;
  return svg;
}

// ---------------------------------------------------------------- printer overlay
//
// A printer is an ACCESSORY that overlays on a square alongside the primary icon
// (or stands alone). It has its own compass position, labels, and B&W/color mode.

const PRINTER_VIEWBOX = '0 0 16 14';
const PRINTER_SIZE = 0.3; // fraction of square when secondary
const COMPASS_POS = {
  nw: [0, 0],    n: [0.5, 0],   ne: [1, 0],
  w:  [0, 0.5],  c: [0.5, 0.5], e:  [1, 0.5],
  sw: [0, 1],    s: [0.5, 1],   se: [1, 1],
};

function printerSymbolId(p) { return p && p.color ? 'ic-printer-fill' : 'ic-printer'; }

// Icon fill for the printer: two authored shapes (body panel + paper-in tray)
// laid behind the ink, sized to sit exactly inside the outline — no silhouette,
// so nothing bleeds past the strokes. Same pair for B&W and colour.
const PRINTER_FILL_SHAPES =
  '<path d="M15,5.956L15,9.044C15,9.572 14.572,10 14.044,10L1.956,10C1.428,10 1,9.572 1,9.044L1,5.956C1,5.428 1.428,5 1.956,5L14.044,5C14.572,5 15,5.428 15,5.956Z"/>' +
  '<path d="M12,2.002L12,4L4,4L4,2.002C4,1.449 4.449,1 5.002,1L10.998,1C11.551,1 12,1.449 12,2.002Z"/>';
function printerFillLayer(fill) {
  return `<g fill="${fill}" stroke="none">${PRINTER_FILL_SHAPES}</g>`;
}

function printerDataUrl(p, color, iconFill) {
  const symId = printerSymbolId(p);
  const fill = p && p.color ? color : 'none';
  const ink = SYMBOL_MARKUP[symId].replaceAll('COLOR', color).replaceAll('FILL', fill);
  // Icon fill paints the printer body behind the ink (authored fill shapes).
  const inner = (iconFill ? printerFillLayer(iconFill) : '') + ink;
  return 'data:image/svg+xml;charset=utf-8,' +
    encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${PRINTER_VIEWBOX}">${inner}</svg>`);
}

function printerUse(p, className, iconColor, iconFill) {
  const symId = printerSymbolId(p);
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', className);
  svg.setAttribute('viewBox', PRINTER_VIEWBOX);
  // Only the printer body is currentColor (theme-aware); paper bars and the
  // power light carry their own fixed colours.
  if (iconColor) svg.style.color = iconColor;
  // Icon fill paints the printer body behind the ink (authored fill shapes).
  if (iconFill) svg.innerHTML = printerFillLayer(iconFill);
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  use.setAttribute('href', `#${symId}`);
  svg.appendChild(use);
  return svg;
}

// --- imported-icon "fill the open spaces" silhouette --------------------------
//
// Built-in icons are stroke outlines, so their `--icon-fill` naturally paints the
// region enclosed by the strokes. Imported icons (e.g. Bootstrap Icons) instead
// draw their ink as a *filled* shape, where an interior "hole" (a screen, the gap
// in a ring) is a subpath that subtracts from the shape under its winding/evenodd
// rule — so a plain fill of the glyph has no separate interior to colour.
//
// To give them the same behaviour we lay a solid silhouette of the glyph behind
// the ink and paint it with the fill colour: the ink (redrawn on top) keeps the
// icon colour, the holes show the fill colour, and everything outside the glyph
// stays transparent. The silhouette is built by splitting every path into its
// subpaths and filling each one on its own — a hole subpath, filled independently,
// becomes a positive fill instead of a subtraction, so the union is the full body.

/** Numbers consumed per repetition of each path command (0 for Z). */
const PATH_CMD_ARGS = { M: 2, L: 2, T: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, A: 7, Z: 0 };

/** Split a path `d` into standalone subpath strings, each starting with an
 *  absolute moveto, so a later subpath (often a relative `m…` hole) can be filled
 *  on its own. Tracks the current point through every command so relative moves
 *  resolve correctly; unparseable input yields a single verbatim subpath. */
function splitAbsSubpaths(d) {
  const re = /([MmLlHhVvCcSsQqTtAaZz])|(-?(?:\d*\.\d+|\d+\.?)(?:[eE][+-]?\d+)?)/g;
  const cmds = []; // { c, nums:[…] }
  let m, cur = null;
  while ((m = re.exec(d))) {
    if (m[1]) { cur = { c: m[1], nums: [] }; cmds.push(cur); }
    else if (cur) cur.nums.push(parseFloat(m[2]));
    else return [d]; // number before any command — bail out, keep verbatim
  }

  const subpaths = [];
  let out = null, x = 0, y = 0, sx = 0, sy = 0;
  const flush = () => { if (out && out.length) subpaths.push(out.join(' ')); };

  for (const { c, nums } of cmds) {
    const U = c.toUpperCase();
    const rel = c !== U;
    if (U === 'Z') { if (out) out.push('Z'); x = sx; y = sy; continue; }
    const n = PATH_CMD_ARGS[U];
    if (!n) return [d]; // unknown command — don't risk it
    const reps = Math.max(1, Math.floor(nums.length / n));
    for (let i = 0; i < reps; i++) {
      const a = nums.slice(i * n, i * n + n);
      if (a.length < n) break;
      if (U === 'M' && i === 0) {
        // subpath start: resolve to an absolute point and open a new subpath
        x = rel ? x + a[0] : a[0];
        y = rel ? y + a[1] : a[1];
        sx = x; sy = y;
        flush();
        out = [`M ${x} ${y}`];
        continue;
      }
      // an extra M pair is an implicit lineto; keep everything else verbatim
      const letter = (U === 'M') ? (rel ? 'l' : 'L') : c;
      out.push(letter + ' ' + a.join(' '));
      // advance the current point to this segment's endpoint
      if (U === 'H') x = rel ? x + a[0] : a[0];
      else if (U === 'V') y = rel ? y + a[0] : a[0];
      else {
        const ex = a[n - 2], ey = a[n - 1];
        x = rel ? x + ex : ex;
        y = rel ? y + ey : ey;
      }
    }
  }
  flush();
  return subpaths.length ? subpaths : [d];
}

const _iconSilhouetteCache = new Map(); // inner markup → array of shape strings

/** The glyph's shapes rebuilt as a solid, holes-filled silhouette (no fill colour
 *  baked in yet). Cached per icon since it depends only on the geometry. */
function customIconSilhouette(inner) {
  if (_iconSilhouetteCache.has(inner)) return _iconSilhouetteCache.get(inner);
  const parts = [];
  let doc;
  try { doc = new DOMParser().parseFromString(`<svg>${inner}</svg>`, 'image/svg+xml'); }
  catch { doc = null; }
  if (doc && !doc.querySelector('parsererror')) {
    const walk = (el) => {
      for (const node of el.children) {
        const tag = node.tagName.toLowerCase();
        if (tag === 'g') { walk(node); continue; }
        if (tag === 'path') {
          for (const sub of splitAbsSubpaths(node.getAttribute('d') || '')) {
            if (sub.trim()) parts.push(`<path d="${sub}"/>`);
          }
        } else if (tag === 'circle' || tag === 'ellipse' || tag === 'rect' || tag === 'polygon') {
          // already closed positive fills — carry only their geometry attributes
          let attrs = '';
          for (const a of node.attributes) {
            if (/^(fill|stroke|opacity)/i.test(a.name)) continue;
            attrs += ` ${a.name}="${a.value.replace(/"/g, '&quot;')}"`;
          }
          parts.push(`<${tag}${attrs}/>`);
        }
        // line / polyline enclose no area — nothing to fill
      }
    };
    walk(doc.documentElement);
  }
  _iconSilhouetteCache.set(inner, parts);
  return parts;
}

/** A silhouette group painted with `fill` to sit *behind* an imported icon's ink,
 *  colouring only its enclosed open spaces. Empty when there is nothing to fill. */
function customIconFillLayer(inner, fill) {
  const parts = customIconSilhouette(inner);
  if (!parts.length) return '';
  return `<g fill="${fill}" fill-rule="nonzero" stroke="none">${parts.join('')}</g>`;
}

/** A `<svg><use>` element referencing an inline symbol — for grid & picker.
 *  `fill` paints the space enclosed by the icon's strokes; leave it out and the
 *  icon stays an outline, which is the default. */
function iconUse(id, className = 'cell__icon', fill = null) {
  // Set below on whatever svg we return: `.cell__icon` declares `aspect-ratio: 1`, so a
  // wide or tall glyph would be crushed into a square without this.
  const shape = (svg) => { svg.style.aspectRatio = String(iconRatio(id)); return svg; };
  // Imported icons carry their own markup and fill with the icon colour
  // (currentColor), driven by the svg's `color` set by the caller.
  const custom = customIcon(id);
  if (custom) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', className);
    svg.setAttribute('viewBox', custom.viewBox);
    svg.setAttribute('fill', 'currentColor');
    // A fill colour paints the glyph's open spaces (silhouette behind the ink).
    svg.innerHTML = fill
      ? customIconFillLayer(custom.inner, fill) + custom.inner
      : custom.inner; // sanitized shapes only
    return shape(svg);
  }
  const meta = ICONS[id];
  if (!meta) return null;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', className);
  // NO viewBox here on purpose. The <symbol> carries its own, which already maps its
  // art into this svg's viewport; setting one here too applies the transform twice and
  // crops the glyph. The svg's SHAPE comes from the inline aspect-ratio `shape()` sets.
  if (fill) svg.style.setProperty('--icon-fill', fill);
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  use.setAttribute('href', `#${meta.symbol}`);
  svg.appendChild(use);
  return shape(svg);
}

/** A standalone SVG data-URL for a given icon + color — used by the canvas exporter. */
/** An icon's own view box — the frame its art is drawn in. Read from the live
 *  `<symbol>`, so the ONE place an icon declares its shape is that viewBox: tighten a
 *  symbol's box around its ink and both renderers lay it out to that shape. Icons whose
 *  art is wider or taller than it is square (the double monitor, the laptop) therefore
 *  stop being squeezed into a square box. */
function iconViewBox(id) {
  const custom = customIcon(id);
  if (custom) return custom.viewBox;
  const meta = ICONS[id];
  const sym = meta && typeof document !== 'undefined' ? document.getElementById(meta.symbol) : null;
  return (sym && sym.getAttribute('viewBox')) || '0 0 24 24';
}

/** How wide an icon is for its height: >1 is a wide glyph, <1 a tall one, 1 a square. */
function iconRatio(id) {
  const n = String(iconViewBox(id)).split(/[\s,]+/).map(Number);
  const w = n[2], h = n[3];
  return (w > 0 && h > 0) ? w / h : 1;
}

function iconDataUrl(id, color, fill = null) {
  const custom = customIcon(id);
  if (custom) {
    const inner = custom.inner.replaceAll('currentColor', color);
    const bg = fill ? customIconFillLayer(custom.inner, fill) : '';
    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${custom.viewBox}" fill="${color}">${bg}${inner}</svg>`;
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  }
  const meta = ICONS[id];
  if (!meta) return null;
  const inner = SYMBOL_MARKUP[meta.symbol]
    .replaceAll('COLOR', color)
    .replaceAll('FILL', fill || 'none');
  // The symbol's OWN box, not an assumed 24x24 — otherwise a tightened viewBox would
  // reshape the icon in the grid and leave the export drawing the old square crop.
  const box = iconViewBox(id);
  const [, , vbW, vbH] = String(box).split(/[\s,]+/).map(Number);
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${box}" width="${vbW || 24}" height="${vbH || 24}">${inner}</svg>`;
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}
