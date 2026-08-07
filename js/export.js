// export.js — render the chart to a canvas WITHOUT grid lines, sized to the chosen
// paper (landscape). Powers Preview, PNG download, and Print / Save-as-PDF.


const MAX_DIM = 4000;      // cap canvas pixels for memory safety
const CHAIR_SCALE = 0.7;   // a chair's share of its square — furniture, not a desk

/** Which neighbouring square each rotation faces, as [rowStep, colStep]. */
const FACING_STEP = { 0: [-1, 0], 90: [0, 1], 180: [1, 0], 270: [0, -1] };

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
  const { insideAnyFootprint, seatTableOf } = rules;

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

  // Preload icon images (async), keyed by "id|color" — including a chair for empty seats.
  const imgCache = await preloadIcons(desks, seats, covered);

  // 1) Table shapes (drawn solid; the editing grid shows them semi-transparent).
  for (const table of state.tables) drawTable(ctx, table, rectOf);

  // 2) Connected desks — chairs draw as small furniture instead.
  for (const d of desks) {
    if (isChairCell(d.data)) drawChair(ctx, rectOf, d, imgCache);
    else drawDesk(ctx, rectOf, d, deskSet, imgCache);
  }

  // 3) Seats gathered around their table.
  for (const s of seats) drawTableSeat(ctx, rectOf, s, imgCache);

  // 4) Labels and icons of squares the table covers, painted last so they stay
  //    readable on top of the solid table.
  for (const { r, c, data } of covered) {
    const { x, y, w, h } = rectOf(r, c);
    drawContent(ctx, x + w / 2, y + h / 2, w, h, data, imgCache, false);
  }

  return canvas;
}

/** An individual desk: fills its whole cell so neighbours touch; borders only on
 *  edges not shared with another desk (so a run of desks reads as one block). */
function drawDesk(ctx, rectOf, { r, c, data }, deskSet, imgCache) {
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

  drawContent(ctx, x + w / 2, y + h / 2, w, h, data, imgCache, false);
}

/** A chair: standalone furniture drawn at a fixed fraction of its square. It is
 *  scaled rather than filling the cell, so a chair standing in a thinned
 *  row/column shrinks with it and stays inside the walkway. */
function drawChair(ctx, rectOf, { r, c, data }, imgCache) {
  const rect = rectOf(r, c);
  const size = Math.min(rect.w, rect.h) * CHAIR_SCALE;

  // Sit flush against the edge the chair faces, so it tucks up to the desk or
  // table in that direction instead of floating in the middle of its square. A
  // hair of inset keeps the two borders from merging into one thick line.
  const inset = size * 0.04;
  let cx = rect.x + rect.w / 2;
  let cy = rect.y + rect.h / 2;
  const rot = data.rotation || 0;
  switch (rot) {
    case 0:   cy = rect.y + size / 2 + inset; break;              // faces up
    case 90:  cx = rect.x + rect.w - size / 2 - inset; break;     // faces right
    case 180: cy = rect.y + rect.h - size / 2 - inset; break;     // faces down
    case 270: cx = rect.x + size / 2 + inset; break;              // faces left
  }

  // Across the other axis, line the chair up with the square it is pulled up
  // to rather than with its own. Thinning a walkway shifts every square after
  // it along that row or column, so a chair's own cell often no longer sits
  // under the middle of the desk it belongs to.
  const [dr, dc] = FACING_STEP[rot] || FACING_STEP[0];
  const faced = isEnabled(r + dr, c + dc) ? rectOf(r + dr, c + dc) : null;
  if (faced) {
    if (dr) cx = faced.x + faced.w / 2;   // facing up/down → align horizontally
    else    cy = faced.y + faced.h / 2;   // facing left/right → align vertically
  }
  const x = cx - size / 2, y = cy - size / 2;

  roundRect(ctx, x, y, size, size, size * 0.18);
  ctx.fillStyle = data.fill || '#dbe7ff';
  ctx.fill();
  ctx.lineWidth = Math.max(1, size * 0.05);
  ctx.strokeStyle = data.border || '#2f6feb';
  ctx.stroke();

  drawContent(ctx, cx, cy, size, size, data, imgCache, false);
}

/** A seat around a table: smaller and shifted toward the table centre. Empty
 *  seats (no label, no icon) render as an empty chair. */
function drawTableSeat(ctx, rectOf, { r, c, data, fp }, imgCache) {
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
  const cx = seatCx + dx * shift, cy = seatCy + dy * shift;
  const x = cx - size / 2, y = cy - size / 2;

  roundRect(ctx, x, y, size, size, size * 0.18);
  ctx.fillStyle = data.fill || '#dbe7ff';
  ctx.fill();
  ctx.lineWidth = Math.max(1, size * 0.05);
  ctx.strokeStyle = data.border || '#2f6feb';
  ctx.stroke();

  drawContent(ctx, cx, cy, size, size, data, imgCache, true);
}

/** Draw a seat's icon (above) and label lines (each its own color), rotated.
 *  When `forceChair` and the seat is otherwise empty, draw a chair icon. */
function drawContent(ctx, cx, cy, w, h, data, imgCache, forceChair) {
  const labels = (data.labels || []).filter((l) => l.text);
  let iconId = data.icon;
  if (!iconId && labels.length === 0 && forceChair) iconId = 'chair';
  const hasIcon = !!iconId;

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(((data.rotation || 0) * Math.PI) / 180);

  const iconSize = Math.min(w, h) * (labels.length ? 0.42 : 0.6);
  const lineH = Math.min(w, h) * 0.18;
  const totalH = (hasIcon ? iconSize : 0) + labels.length * lineH;
  let cursorY = -totalH / 2;

  if (hasIcon) {
    const img = imgCache.get(`${iconId}|${iconColorOf(data)}`);
    if (img) ctx.drawImage(img, -iconSize / 2, cursorY, iconSize, iconSize);
    cursorY += iconSize;
  }

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `600 ${lineH * 0.82}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
  for (const line of labels) {
    ctx.fillStyle = line.color || '#1f2933';
    ctx.fillText(fitText(ctx, line.text, w * 0.92), 0, cursorY + lineH / 2);
    cursorY += lineH;
  }

  ctx.restore();
}

function drawTable(ctx, table, rectOf) {
  const rects = table.cellKeys.map((k) => { const [r, c] = parseKey(k); return rectOf(r, c); });
  if (!rects.length) return;
  const left = Math.min(...rects.map((b) => b.x));
  const top = Math.min(...rects.map((b) => b.y));
  const right = Math.max(...rects.map((b) => b.x + b.w));
  const bottom = Math.max(...rects.map((b) => b.y + b.h));
  const inset = Math.min(right - left, bottom - top) * 0.06;
  const x = left + inset, y = top + inset;
  const w = right - left - inset * 2, h = bottom - top - inset * 2;

  ctx.fillStyle = table.color || '#8d6e63';
  if (table.shape === 'round') {
    ctx.beginPath();
    ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
    ctx.fill();
  } else {
    roundRect(ctx, x, y, w, h, Math.min(w, h) * 0.08);
    ctx.fill();
  }
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
