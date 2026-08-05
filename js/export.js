// export.js — render the chart to a canvas WITHOUT grid lines, sized to the chosen
// paper (landscape). Powers Preview, PNG download, and Print / Save-as-PDF.

import { state, peekCell, rowWeight, colWeight, keyOf, parseKey } from './state.js';
import { iconDataUrl } from './icons.js';
import { paperInches } from './paper.js';

const MAX_DIM = 4000; // cap canvas pixels for memory safety

/** Render the current chart onto a fresh canvas. Returns a Promise<canvas>. */
export async function renderToCanvas(dpi = 300) {
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
  const margin = Math.round(Math.min(pxW, pxH) * 0.04);
  const areaW = pxW - margin * 2;
  const areaH = pxH - margin * 2;

  const colW = Array.from({ length: cols }, (_, c) => colWeight(c));
  const rowH = Array.from({ length: rows }, (_, r) => rowWeight(r));
  const totalColW = colW.reduce((a, b) => a + b, 0) || 1;
  const totalRowH = rowH.reduce((a, b) => a + b, 0) || 1;

  // Cell edges in canvas coordinates.
  const xEdges = [margin];
  for (let c = 0; c < cols; c++) xEdges.push(xEdges[c] + (colW[c] / totalColW) * areaW);
  const yEdges = [margin];
  for (let r = 0; r < rows; r++) yEdges.push(yEdges[r] + (rowH[r] / totalRowH) * areaH);

  const rectOf = (r, c) => ({
    x: xEdges[c], y: yEdges[r],
    w: xEdges[c + 1] - xEdges[c], h: yEdges[r + 1] - yEdges[r],
  });

  // Preload icon images (async), keyed by "id|color".
  const imgCache = await preloadIcons(rows, cols);

  // 1) Seats (fill + border + content).
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const data = peekCell(r, c);
      if (!data || !data.enabled) continue;
      drawSeat(ctx, rectOf(r, c), data, imgCache);
    }
  }

  // 2) Table shapes on top (with transparent inset so they don't touch borders).
  for (const table of state.tables) {
    drawTable(ctx, table, rectOf);
  }

  return canvas;
}

function drawSeat(ctx, rect, data, imgCache) {
  const pad = Math.min(rect.w, rect.h) * 0.06; // keep seats from touching
  const x = rect.x + pad, y = rect.y + pad;
  const w = rect.w - pad * 2, h = rect.h - pad * 2;
  const radius = Math.min(w, h) * 0.12;

  roundRect(ctx, x, y, w, h, radius);
  ctx.fillStyle = data.fill || '#dbe7ff';
  ctx.fill();
  ctx.lineWidth = Math.max(1, Math.min(w, h) * 0.04);
  ctx.strokeStyle = data.border || '#2f6feb';
  ctx.stroke();

  // Rotated content (icon above labels), centered.
  ctx.save();
  ctx.translate(x + w / 2, y + h / 2);
  ctx.rotate(((data.rotation || 0) * Math.PI) / 180);

  const labels = (data.labels || []).filter((l) => l.text);
  const hasIcon = !!data.icon;
  const iconSize = Math.min(w, h) * (labels.length ? 0.42 : 0.6);
  const lineH = Math.min(w, h) * 0.16;
  const totalContentH = (hasIcon ? iconSize : 0) + labels.length * lineH;
  let cursorY = -totalContentH / 2;

  if (hasIcon) {
    const img = imgCache.get(`${data.icon}|${data.border || '#2f6feb'}`);
    if (img) ctx.drawImage(img, -iconSize / 2, cursorY, iconSize, iconSize);
    cursorY += iconSize;
  }

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const fontPx = lineH * 0.82;
  ctx.font = `600 ${fontPx}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
  for (const line of labels) {
    ctx.fillStyle = line.color || '#1f2933';
    const text = fitText(ctx, line.text, w * 0.92);
    ctx.fillText(text, 0, cursorY + lineH / 2);
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

async function preloadIcons(rows, cols) {
  const needed = new Map(); // "id|color" -> dataUrl
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const data = peekCell(r, c);
      if (data && data.enabled && data.icon) {
        const color = data.border || '#2f6feb';
        needed.set(`${data.icon}|${color}`, iconDataUrl(data.icon, color));
      }
    }
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

export async function downloadPng() {
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

export async function showPreview() {
  const modal = document.getElementById('preview');
  const paper = document.getElementById('preview-paper');
  paper.replaceChildren();
  const canvas = await renderToCanvas(150); // lighter dpi for on-screen preview
  paper.appendChild(canvas);
  modal.hidden = false;
  modal.setAttribute('aria-hidden', 'false');
}

export function closePreview() {
  const modal = document.getElementById('preview');
  modal.hidden = true;
  modal.setAttribute('aria-hidden', 'true');
}

/** Print via the browser (user can "Save as PDF"). Renders to an image, injects a
 *  print-only root and a matching @page size, prints, then cleans up. */
export async function printChart() {
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
