// export.js — render the chart to a canvas WITHOUT grid lines, sized to the chosen
// paper (landscape). Powers Preview, PNG download, and Print / Save-as-PDF.


const MAX_DIM = 4000;      // cap canvas pixels for memory safety
const CHAIR_SCALE = 0.7;   // a chair's share of its square — furniture, not a desk

/** Which neighbouring square each rotation faces, as [rowStep, colStep]. */
const FACING_STEP = {
  0: [-1, 0], 45: [-1, 1], 90: [0, 1], 135: [1, 1],
  180: [1, 0], 225: [1, -1], 270: [0, -1], 315: [-1, -1],
};

/** Render the current chart onto a fresh canvas. Returns a Promise<canvas>. */
async function renderToCanvas(dpi = 300) {
  const { w: inW, h: inH } = paperInches();
  let pxW = Math.round(inW * dpi);
  let pxH = Math.round(inH * dpi);
  const scaleDown = Math.min(1, MAX_DIM / Math.max(pxW, pxH));
  pxW = Math.round(pxW * scaleDown);
  pxH = Math.round(pxH * scaleDown);

  const canvas = document.createElement('canvas');
  canvas.width = pxW;
  canvas.height = pxH;
  const ctx = canvas.getContext('2d');

  // White page background (grid lines intentionally omitted).
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, pxW, pxH);

  const { cols, rows } = state.grid;
  const margin = Math.round(Math.min(pxW, pxH) * 0.05);
  const title = (state.title || '').trim();
  const titleBand = title ? Math.round(pxH * 0.11) : 0;

  // Content is anchored to the TOP (title band, then grid); any leftover space
  // falls to the bottom. Cells keep their aspect (square when weights are equal)
  // rather than stretching to fill the whole page.
  const areaW = pxW - margin * 2;
  const areaH = pxH - margin * 2 - titleBand;

  // Empty-space sizing: every SEATED square renders at one uniform size, while
  // each EMPTY square (and each chair) shrinks/grows to its column-width ×
  // row-height weights. See js/layout.js — the grid's "true sizes" preview uses
  // the very same rules, so what is shown there is what prints here.
  const rules = layoutRules();
  const { insideAnyFootprint, seatTableOf, footprints } = rules;

  // Fit to the page using the widest row and the tallest column (in units).
  const extent = layoutExtent(rules);
  const unit = Math.min(areaW / extent.w, areaH / extent.h);
  const originX = margin + (areaW - extent.w * unit) / 2; // block centered horizontally
  const originY = margin + titleBand;                     // top-anchored, beneath the title
  const rects = layoutRects(rules, unit, originX, originY);

  // Title at the top, centered.
  if (title) {
    ctx.fillStyle = '#1f2933';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `700 ${Math.round(titleBand * 0.5)}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
    ctx.fillText(fitText(ctx, title, areaW), pxW / 2, margin + titleBand * 0.55);
  }

  const rectOf = (r, c) => rects.get(keyOf(r, c));

  // Classify every enabled square (footprints/ring computed above):
  //  - Any enabled square in the 1-cell ring around a footprint (orthogonal OR
  //    diagonal) is a seat at that table; it renders smaller, pulled toward the
  //    table. An empty (unlabelled, icon-less) seat renders as an empty chair.
  //  - Every other enabled square is an individual desk; adjacent desks render
  //    touching, as one connected block (outer borders only).
  const desks = [];
  const seats = [];
  const covered = []; // seated squares under a table: only their content draws
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const data = peekCell(r, c);
      if (!data || !data.enabled) continue;
      if (insideAnyFootprint(r, c)) { covered.push({ r, c, data }); continue; }
      const st = seatTableOf(r, c);
      if (st) seats.push({ r, c, data, fp: st.fp });
      else desks.push({ r, c, data });
    }
  }
  // Chairs are standalone furniture, so they never merge into a desk block.
  const deskSet = new Set(desks.filter((d) => !isChairCell(d.data)).map((d) => keyOf(d.r, d.c)));

  // Work out where every piece of content will sit BEFORE painting any of it,
  // so one text size and one icon size can be chosen for the whole chart.
  for (const d of desks) {
    if (isChairCell(d.data)) d.geo = chairGeometry(rectOf, d);
    else {
      const { x, y, w, h } = rectOf(d.r, d.c);
      d.geo = { cx: x + w / 2, cy: y + h / 2, w, h };
    }
  }
  for (const s of seats) s.geo = seatGeometry(rectOf, s);
  for (const v of covered) v.geo = coveredGeometry(rectOf, v, footprints);
  const plan = planContent(ctx, [...desks, ...seats, ...covered]);

  // Preload icon images (async), keyed by "id|color" — including a chair for empty seats.
  const imgCache = await preloadIcons(desks, seats, covered);

  // 1) Table shapes (drawn solid; the editing grid shows them semi-transparent).
  for (const table of state.tables) drawTable(ctx, table, rectOf);

  // 2) Connected desks — chairs draw as small furniture instead.
  for (const d of desks) {
    if (isChairCell(d.data)) drawChair(ctx, d, imgCache, plan);
    else drawDesk(ctx, rectOf, d, deskSet, imgCache, plan);
  }

  // 3) Seats gathered around their table.
  for (const s of seats) drawTableSeat(ctx, s, imgCache, plan);

  // 4) Labels and icons of squares the table covers, painted last so they stay
  //    readable on top of the solid table.
  for (const v of covered) {
    drawContent(ctx, v.geo.cx, v.geo.cy, v.geo.w, v.geo.h, v.data, imgCache, false, plan,
                v.geo.clip, v.geo.tableRot);
  }

  return canvas;
}

// ------------------------------------------------------- content sizing
//
// Every square's text is drawn at ONE size and every icon at ONE size, chosen so
// that the tightest square on the chart still shows its labels in full. Shrink
// the text and the icons gain the room they gave up, so a chart of short labels
// gets big icons and a chart of long ones stays readable.

const BASE_LINE = 0.18;      // label line height, as a fraction of the square
const FONT_OF_LINE = 0.82;   // glyph height within that line
const LABEL_WIDTH = 0.92;    // share of the square a label may span
const MIN_TEXT_SCALE = 0.4;  // past this, ellipsize rather than shrink further
const MAX_ICON = 0.62;       // an icon never fills more than this much
const MIN_ICON = 0.3;

function labelsOf(data) {
  return (data.labels || []).filter((l) => l.text);
}

function contentFont(size) {
  return `600 ${size}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
}

/** One text scale and one icon size for the whole chart. */
function planContent(ctx, items) {
  let scale = 1, maxLines = 0;
  for (const { data, geo } of items) {
    const labels = labelsOf(data);
    if (!labels.length) continue;
    maxLines = Math.max(maxLines, labels.length);
    const s = Math.min(geo.w, geo.h);
    ctx.font = contentFont(s * BASE_LINE * FONT_OF_LINE);
    let widest = 0;
    for (const l of labels) widest = Math.max(widest, ctx.measureText(l.text).width);
    if (widest > 0) scale = Math.min(scale, (geo.w * LABEL_WIDTH) / widest);
  }
  const textScale = Math.max(MIN_TEXT_SCALE, Math.min(1, scale));
  const lineFrac = BASE_LINE * textScale;
  // Whatever vertical room the labels no longer need goes to the icon.
  const iconFrac = Math.max(MIN_ICON, Math.min(MAX_ICON, 0.94 - maxLines * lineFrac));
  return { lineFrac, iconFrac };
}

/** An individual desk: fills its whole cell so neighbours touch; borders only on
 *  edges not shared with another desk (so a run of desks reads as one block). */
function drawDesk(ctx, rectOf, { r, c, data }, deskSet, imgCache, plan) {
  const { x, y, w, h } = rectOf(r, c);
  ctx.fillStyle = data.fill || '#dbe7ff';
  ctx.fillRect(x, y, w, h);

  ctx.strokeStyle = data.border || '#2f6feb';
  ctx.lineWidth = Math.max(1, Math.min(w, h) * 0.03);
  const has = (rr, cc) => deskSet.has(keyOf(rr, cc));
  ctx.beginPath();
  if (!has(r - 1, c)) { ctx.moveTo(x, y); ctx.lineTo(x + w, y); }           // top
  if (!has(r, c + 1)) { ctx.moveTo(x + w, y); ctx.lineTo(x + w, y + h); }   // right
  if (!has(r + 1, c)) { ctx.moveTo(x, y + h); ctx.lineTo(x + w, y + h); }   // bottom
  if (!has(r, c - 1)) { ctx.moveTo(x, y); ctx.lineTo(x, y + h); }           // left
  ctx.stroke();

  drawContent(ctx, x + w / 2, y + h / 2, w, h, data, imgCache, false, plan);
}

/** Where a chair sits and how big it is. Split out from drawChair so the layout
 *  can be measured before anything is painted. */
function chairGeometry(rectOf, { r, c, data }) {
  const rect = rectOf(r, c);
  const size = Math.min(rect.w, rect.h) * CHAIR_SCALE;

  // Sit flush against the edge the chair faces, so it tucks up to the desk or
  // table in that direction instead of floating in the middle of its square. A
  // hair of inset keeps the two borders from merging into one thick line.
  const inset = size * 0.04;
  let cx = rect.x + rect.w / 2;
  let cy = rect.y + rect.h / 2;
  const rot = data.rotation || 0;
  // The facing's row/column step says which edges to hug: one for a straight
  // facing, both for a diagonal, which tucks the chair into that corner.
  const [dr, dc] = FACING_STEP[rot] || FACING_STEP[0];
  if (dr < 0) cy = rect.y + size / 2 + inset;
  if (dr > 0) cy = rect.y + rect.h - size / 2 - inset;
  if (dc < 0) cx = rect.x + size / 2 + inset;
  if (dc > 0) cx = rect.x + rect.w - size / 2 - inset;

  // Across the other axis, line the chair up with the square it is pulled up
  // to rather than with its own. Thinning a walkway shifts every square after
  // it along that row or column, so a chair's own cell often no longer sits
  // under the middle of the desk it belongs to.
  const faced = isEnabled(r + dr, c + dc) ? rectOf(r + dr, c + dc) : null;
  if (faced) {
    // Only a straight facing has a free axis to line up on; a diagonal is
    // already pinned to its corner.
    if (dr && !dc) cx = faced.x + faced.w / 2;
    if (dc && !dr) cy = faced.y + faced.h / 2;
  }
  return { cx, cy, w: size, h: size };
}

/** A chair: standalone furniture drawn at a fixed fraction of its square, so a
 *  chair standing in a thinned row/column shrinks with it and stays inside the
 *  walkway. */
function drawChair(ctx, item, imgCache, plan) {
  const { cx, cy, w: size } = item.geo;
  roundRect(ctx, cx - size / 2, cy - size / 2, size, size, size * 0.18);
  ctx.fillStyle = item.data.fill || '#dbe7ff';
  ctx.fill();
  ctx.lineWidth = Math.max(1, size * 0.05);
  ctx.strokeStyle = item.data.border || '#2f6feb';
  ctx.stroke();
  drawContent(ctx, cx, cy, size, size, item.data, imgCache, false, plan);
}

/** Where a seat around a table sits: smaller than a desk and shifted toward the
 *  table centre. Split out from drawTableSeat so it can be measured first. */
function seatGeometry(rectOf, { r, c, data, fp }) {
  const rect = rectOf(r, c);
  const tl = rectOf(fp.minR, fp.minC);
  const br = rectOf(fp.maxR, fp.maxC);
  const tableCx = (tl.x + br.x + br.w) / 2;
  const tableCy = (tl.y + br.y + br.h) / 2;
  const seatCx = rect.x + rect.w / 2;
  const seatCy = rect.y + rect.h / 2;

  let dx = tableCx - seatCx, dy = tableCy - seatCy;
  const len = Math.hypot(dx, dy) || 1;
  dx /= len; dy /= len;

  const base = Math.min(rect.w, rect.h);
  // Chairs — explicit (chair icon) or implicit (a bare ring seat) — draw at the
  // chair size; labelled/iconed seats use the standard gathered size.
  const labelled = (data.labels || []).some((l) => l.text && l.text.trim());
  const isChair = data.icon === 'chair' || (!data.icon && !labelled);
  const size = base * (isChair ? CHAIR_SCALE : 0.62);
  const shift = base * 0.18;           // nudge toward the table
  return { cx: seatCx + dx * shift, cy: seatCy + dy * shift, w: size, h: size };
}

/** Empty seats (no label, no icon) render as an empty chair. */
function drawTableSeat(ctx, item, imgCache, plan) {
  const { cx, cy, w: size } = item.geo;
  roundRect(ctx, cx - size / 2, cy - size / 2, size, size, size * 0.18);
  ctx.fillStyle = item.data.fill || '#dbe7ff';
  ctx.fill();
  ctx.lineWidth = Math.max(1, size * 0.05);
  ctx.strokeStyle = item.data.border || '#2f6feb';
  ctx.stroke();
  drawContent(ctx, cx, cy, size, size, item.data, imgCache, true, plan);
}

/** A square the table covers. Its content is centred on the part of the square
 *  the table shape actually reaches, and `clip` holds that shape's bounds so the
 *  label stack can be kept inside it — text spilling past a dark table onto the
 *  white page reads as though it had been cut off. */
function coveredGeometry(rectOf, { r, c }, footprints) {
  const cell = rectOf(r, c);
  const owner = footprints.find(({ fp }) =>
    r >= fp.minR && r <= fp.maxR && c >= fp.minC && c <= fp.maxC);
  const geo = { cx: cell.x + cell.w / 2, cy: cell.y + cell.h / 2, w: cell.w, h: cell.h,
                tableRot: owner ? (owner.t.rotation || 0) : 0 };
  if (!owner) return geo;

  const t = tableRect(owner.t, rectOf);
  const clip = {
    left: Math.max(cell.x, t.x), right: Math.min(cell.x + cell.w, t.x + t.w),
    top: Math.max(cell.y, t.y), bottom: Math.min(cell.y + cell.h, t.y + t.h),
  };
  if (clip.right <= clip.left || clip.bottom <= clip.top) return geo;
  geo.cx = (clip.left + clip.right) / 2;
  geo.cy = (clip.top + clip.bottom) / 2;
  geo.clip = clip;
  return geo;
}

/** Draw a seat's icon (above) and label lines (each its own color), rotated.
 *  When `forceChair` and the seat is otherwise empty, draw a chair icon. */
function drawContent(ctx, cx, cy, w, h, data, imgCache, forceChair, plan, clip, extraRot = 0) {
  const labels = labelsOf(data);
  let iconId = data.icon;
  if (!iconId && labels.length === 0 && forceChair) iconId = 'chair';
  const hasIcon = !!iconId;

  const s = Math.min(w, h);
  // Labelled squares share the chart-wide sizes; an icon on its own has the
  // whole square to itself and keeps its generous size.
  const iconSize = s * (labels.length ? plan.iconFrac : 0.6);
  const lineH = s * plan.lineFrac;
  const totalH = (hasIcon ? iconSize : 0) + labels.length * lineH;

  // Keep the stack inside `clip` when one is given (a table's drawn shape). The
  // stack runs down the square, or across it once rotated a quarter turn.
  const rot = (data.rotation || 0) + extraRot;   // a table's angle carries through
  if (clip) {
    const half = totalH / 2;
    if (rot === 90 || rot === 270) cx = within(cx, clip.left + half, clip.right - half);
    else                          cy = within(cy, clip.top + half, clip.bottom - half);
  }

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate((rot * Math.PI) / 180);

  let cursorY = -totalH / 2;
  if (hasIcon) {
    const img = imgCache.get(`${iconId}|${iconColorOf(data)}`);
    if (img) ctx.drawImage(img, -iconSize / 2, cursorY, iconSize, iconSize);
    cursorY += iconSize;
  }

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = contentFont(lineH * FONT_OF_LINE);
  for (const line of labels) {
    ctx.fillStyle = line.color || '#1f2933';
    ctx.fillText(fitText(ctx, line.text, w * LABEL_WIDTH), 0, cursorY + lineH / 2);
    cursorY += lineH;
  }

  ctx.restore();
}

/** Clamp into [lo, hi]; when the band is narrower than what has to go in it,
 *  centre on the band instead of jamming against one side. */
function within(v, lo, hi) {
  if (lo > hi) return (lo + hi) / 2;
  return Math.min(hi, Math.max(lo, v));
}

/** The rectangle a table's shape is actually drawn in — inset from its cells so
 *  the shape never touches the squares around it. */
function tableRect(table, rectOf) {
  const rects = table.cellKeys.map((k) => { const [r, c] = parseKey(k); return rectOf(r, c); });
  if (!rects.length) return null;
  const left = Math.min(...rects.map((b) => b.x));
  const top = Math.min(...rects.map((b) => b.y));
  const right = Math.max(...rects.map((b) => b.x + b.w));
  const bottom = Math.max(...rects.map((b) => b.y + b.h));
  const inset = Math.min(right - left, bottom - top) * 0.06;
  return { x: left + inset, y: top + inset,
           w: right - left - inset * 2, h: bottom - top - inset * 2 };
}

function drawTable(ctx, table, rectOf) {
  const box = tableRect(table, rectOf);
  if (!box) return;
  const { x, y, w, h } = box;
  const rot = table.rotation || 0;

  ctx.save();
  if (rot) {
    // Spin about the table's own centre at full size — a 2x8 table turned 45
    // degrees is still a 2x8 table, so it overhangs its footprint rather than
    // shrinking to fit inside it.
    ctx.translate(x + w / 2, y + h / 2);
    ctx.rotate((rot * Math.PI) / 180);
    ctx.translate(-(x + w / 2), -(y + h / 2));
  }
  ctx.fillStyle = table.color || '#8d6e63';
  ctx.lineWidth = Math.max(1, Math.min(w, h) * 0.02);
  ctx.strokeStyle = table.border || state.defaults.tableBorder;
  if (table.shape === 'round') {
    ctx.beginPath();
    ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  } else {
    roundRect(ctx, x, y, w, h, Math.min(w, h) * 0.08);
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}

/** Icon color for a cell: its dedicated iconColor, falling back to border. */
function iconColorOf(data) {
  return data.iconColor || data.border || '#2f6feb';
}

async function preloadIcons(desks, seats, covered = []) {
  const needed = new Map(); // "id|color" -> dataUrl
  const want = (id, color) => needed.set(`${id}|${color}`, iconDataUrl(id, color));

  for (const { data } of [...desks, ...covered]) {
    if (data.icon) want(data.icon, iconColorOf(data));
  }
  for (const { data } of seats) {
    const color = iconColorOf(data);
    if (data.icon) want(data.icon, color);
    else if ((data.labels || []).filter((l) => l.text).length === 0) want('chair', color); // empty chair
  }

  const cache = new Map();
  await Promise.all([...needed.entries()].map(([key, url]) =>
    loadImage(url).then((img) => cache.set(key, img)).catch(() => {})
  ));
  return cache;
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function roundRect(ctx, x, y, w, h, r) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function fitText(ctx, text, maxW) {
  if (ctx.measureText(text).width <= maxW) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(t + '…').width > maxW) t = t.slice(0, -1);
  return t + '…';
}

// ---------------------------------------------------------------- actions

// A pasteable data: URL has to carry the whole image inline, so it is rendered
// at screen resolution rather than print resolution to stay a sane length.
const IMAGE_LINK_DPI = 150;

/** The chart as a PNG blob. */
async function chartPngBlob(dpi = 300) {
  const canvas = await renderToCanvas(dpi);
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
}

async function downloadPng() {
  const blob = await chartPngBlob(300);
  if (!blob) return false;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'seating-chart.png';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return true;
}

/** Put the rendered chart on the clipboard as an image. Needs a secure context,
 *  so it fails over file:// — the caller offers Download instead. */
async function copyPngToClipboard() {
  try {
    const blob = await chartPngBlob(300);
    if (!blob || !navigator.clipboard?.write) return false;
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
    return true;
  } catch {
    return false;
  }
}

/** Copy a data: URL of the rendered chart — a link that opens the image itself,
 *  with nothing hosted anywhere. */
async function copyPngLink() {
  const canvas = await renderToCanvas(IMAGE_LINK_DPI);
  return copyText(canvas.toDataURL('image/png'));
}

async function showPreview() {
  const modal = document.getElementById('preview');
  const paper = document.getElementById('preview-paper');
  paper.replaceChildren();
  const canvas = await renderToCanvas(150); // lighter dpi for on-screen preview
  paper.appendChild(canvas);
  modal.hidden = false;
  modal.setAttribute('aria-hidden', 'false');
}

function closePreview() {
  const modal = document.getElementById('preview');
  modal.hidden = true;
  modal.setAttribute('aria-hidden', 'true');
}

/** Print via the browser (user can "Save as PDF"). Renders to an image, injects a
 *  print-only root and a matching @page size, prints, then cleans up. */
async function printChart() {
  const { w, h } = paperInches();
  const canvas = await renderToCanvas(300);
  const dataUrl = canvas.toDataURL('image/png');

  const root = document.createElement('div');
  root.className = 'print-root';
  const img = document.createElement('img');
  img.src = dataUrl;
  img.style.width = '100%';
  img.style.height = 'auto';
  img.style.display = 'block';
  root.appendChild(img);

  const style = document.createElement('style');
  style.id = 'print-page-style';
  style.textContent = `@media print { @page { size: ${w}in ${h}in; margin: 0; } }`;

  document.head.appendChild(style);
  document.body.appendChild(root);

  const cleanup = () => {
    root.remove();
    style.remove();
    window.removeEventListener('afterprint', cleanup);
  };
  window.addEventListener('afterprint', cleanup);

  if (img.complete) window.print();
  else img.onload = () => window.print();
}
