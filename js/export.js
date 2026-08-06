// export.js — render the chart to a canvas WITHOUT grid lines, sized to the chosen
// paper (landscape). Powers Preview, PNG download, and Print / Save-as-PDF.


const MAX_DIM = 4000; // cap canvas pixels for memory safety

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

  // Empty-space sizing (output only): every SEATED square renders at one uniform
  // size, while each EMPTY square shrinks/grows to its column-width × row-height
  // weights. This lets an individual empty square become a small walkway between
  // seats/desks — not just a fully-empty row or column. The output is built cell
  // by cell from the top-left: x accumulates across each row, y down each column,
  // so seats stay uniform and small empty cells offset their neighbours. All
  // weights = 1 reproduces a plain uniform grid. The editing grid is unaffected.
  const wUnits = (r, c) => (isEnabled(r, c) ? 1 : colWeight(c)); // cell width in units
  const hUnits = (r, c) => (isEnabled(r, c) ? 1 : rowWeight(r)); // cell height in units

  // Fit to the page using the widest row and the tallest column (in units).
  let maxRowUnitsW = 1;
  for (let r = 0; r < rows; r++) {
    let s = 0;
    for (let c = 0; c < cols; c++) s += wUnits(r, c);
    maxRowUnitsW = Math.max(maxRowUnitsW, s);
  }
  let maxColUnitsH = 1;
  for (let c = 0; c < cols; c++) {
    let s = 0;
    for (let r = 0; r < rows; r++) s += hUnits(r, c);
    maxColUnitsH = Math.max(maxColUnitsH, s);
  }

  const unit = Math.min(areaW / maxRowUnitsW, areaH / maxColUnitsH);
  const originX = margin + (areaW - maxRowUnitsW * unit) / 2; // block centered horizontally
  const originY = margin + titleBand;                         // top-anchored, beneath the title

  // Cell rectangles: x accumulates left→right within each row; y accumulates
  // top→bottom within each column (independent walks, so a small empty square
  // offsets everything after it in its row and column).
  const rects = new Map(); // "r,c" -> { x, y, w, h }
  for (let r = 0; r < rows; r++) {
    let x = originX;
    for (let c = 0; c < cols; c++) {
      const w = wUnits(r, c) * unit;
      rects.set(keyOf(r, c), { x, y: 0, w, h: 0 });
      x += w;
    }
  }
  for (let c = 0; c < cols; c++) {
    let y = originY;
    for (let r = 0; r < rows; r++) {
      const rect = rects.get(keyOf(r, c));
      rect.y = y;
      rect.h = hUnits(r, c) * unit;
      y += rect.h;
    }
  }

  // Title at the top, centered.
  if (title) {
    ctx.fillStyle = '#1f2933';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `700 ${Math.round(titleBand * 0.5)}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
    ctx.fillText(fitText(ctx, title, areaW), pxW / 2, margin + titleBand * 0.55);
  }

  const rectOf = (r, c) => rects.get(keyOf(r, c));

  // Classify every enabled square: seats gathered around a table vs. connected desks.
  //  - A table's "footprint" is the bounding box of its selected squares.
  //  - Any enabled square in the 1-cell ring around a footprint (orthogonal OR
  //    diagonal) is a seat at that table; it renders smaller, pulled toward the
  //    table. An empty (unlabelled, icon-less) seat renders as an empty chair.
  //  - Every other enabled square is an individual desk; adjacent desks render
  //    touching, as one connected block (outer borders only).
  const footprints = state.tables.map((t) => ({ t, fp: footprintOf(t.cellKeys) }));

  const insideAnyFootprint = (r, c) =>
    footprints.some(({ fp }) => r >= fp.minR && r <= fp.maxR && c >= fp.minC && c <= fp.maxC);

  const seatTableOf = (r, c) => {
    let best = null, bestDist = Infinity;
    for (const f of footprints) {
      const { fp } = f;
      const inRing = r >= fp.minR - 1 && r <= fp.maxR + 1 && c >= fp.minC - 1 && c <= fp.maxC + 1;
      const inside = r >= fp.minR && r <= fp.maxR && c >= fp.minC && c <= fp.maxC;
      if (inRing && !inside) {
        const dr = (fp.minR + fp.maxR) / 2, dc = (fp.minC + fp.maxC) / 2;
        const dist = Math.max(Math.abs(r - dr), Math.abs(c - dc));
        if (dist < bestDist) { bestDist = dist; best = f; }
      }
    }
    return best;
  };

  const desks = [];
  const seats = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const data = peekCell(r, c);
      if (!data || !data.enabled) continue;
      if (insideAnyFootprint(r, c)) continue; // covered by the table shape
      const st = seatTableOf(r, c);
      if (st) seats.push({ r, c, data, fp: st.fp });
      else desks.push({ r, c, data });
    }
  }
  const deskSet = new Set(desks.map((d) => keyOf(d.r, d.c)));

  // Preload icon images (async), keyed by "id|color" — including a chair for empty seats.
  const imgCache = await preloadIcons(desks, seats);

  // 1) Table shapes (transparent inset so they don't touch cell borders).
  for (const table of state.tables) drawTable(ctx, table, rectOf);

  // 2) Connected desks.
  for (const d of desks) drawDesk(ctx, rectOf, d, deskSet, imgCache);

  // 3) Seats gathered around their table.
  for (const s of seats) drawTableSeat(ctx, rectOf, s, imgCache);

  return canvas;
}

/** Bounding box of a set of "r,c" keys. */
function footprintOf(cellKeys) {
  let minR = Infinity, maxR = -Infinity, minC = Infinity, maxC = -Infinity;
  for (const k of cellKeys) {
    const [r, c] = parseKey(k);
    minR = Math.min(minR, r); maxR = Math.max(maxR, r);
    minC = Math.min(minC, c); maxC = Math.max(maxC, c);
  }
  return { minR, maxR, minC, maxC };
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
  const size = base * 0.62;            // smaller than a desk => "closer together"
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

async function preloadIcons(desks, seats) {
  const needed = new Map(); // "id|color" -> dataUrl
  const want = (id, color) => needed.set(`${id}|${color}`, iconDataUrl(id, color));

  for (const { data } of desks) {
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

async function downloadPng() {
  const canvas = await renderToCanvas(300);
  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'seating-chart.png';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, 'image/png');
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
