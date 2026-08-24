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
    '<rect x="5" y="5" width="14" height="9" rx="1" fill="FILL" stroke="COLOR" stroke-width="1.6"/>' +
    '<path d="M3 18h18l-1.5-2H4.5L3 18z" fill="FILL" stroke="COLOR" stroke-width="1.6" stroke-linejoin="round"/>',
  'ic-monitor':
    '<rect x="3" y="4" width="18" height="12" rx="1" fill="FILL" stroke="COLOR" stroke-width="1.6"/>' +
    '<path d="M9 20h6m-3-4v4" fill="FILL" stroke="COLOR" stroke-width="1.6" stroke-linecap="round"/>',
  'ic-monitor-double':
    '<rect x="0.8" y="5" width="10.4" height="7" rx="1" fill="FILL" stroke="COLOR" stroke-width="1.6"/>' +
    '<path d="M4.2 17h3.6m-1.8-5v5" fill="none" stroke="COLOR" stroke-width="1.6" stroke-linecap="round"/>' +
    '<rect x="12.8" y="5" width="10.4" height="7" rx="1" fill="FILL" stroke="COLOR" stroke-width="1.6"/>' +
    '<path d="M16.2 17h3.6m-1.8-5v5" fill="none" stroke="COLOR" stroke-width="1.6" stroke-linecap="round"/>',
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
    return svg;
  }
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
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">${inner}</svg>`;
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}
