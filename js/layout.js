// layout.js — the geometry rules shared by the canvas output and the grid's
// "true sizes" preview, so the two can never drift apart.
//
// Desks always claim one full unit. Only EMPTY squares — and chairs, which are
// furniture rather than desks — take their row/column weight. That lets a single
// square be thinned into a walkway without the seats around it shrinking too.


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

/** Per-square sizing rules for the current state. Computes table footprints
 *  once, then exposes the lookups both renderers need. */
function layoutRules() {
  const footprints = state.tables.map((t) => ({ t, fp: footprintOf(t.cellKeys) }));

  const insideAnyFootprint = (r, c) =>
    footprints.some(({ fp }) => r >= fp.minR && r <= fp.maxR && c >= fp.minC && c <= fp.maxC);

  /** The table a square is a seat at: the nearest one whose 1-cell ring
   *  (orthogonal or diagonal) it sits in without being under the table itself. */
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

  // A square counts as a chair when it carries the chair icon, or when it is a
  // bare seat around a table (no icon, no labels) — those already render as an
  // empty chair, so they are furniture too.
  const chairLike = (r, c) => {
    const d = peekCell(r, c);
    if (!d || !d.enabled) return false;
    if (d.icon === 'chair') return true;
    const bare = !d.icon && !(d.labels || []).some((l) => l.text && l.text.trim());
    return bare && !!seatTableOf(r, c);
  };

  const sizedByWeight = (r, c) => !isEnabled(r, c) || chairLike(r, c);
  const wUnits = (r, c) => (sizedByWeight(r, c) ? colWeight(c) : 1); // cell width in units
  const hUnits = (r, c) => (sizedByWeight(r, c) ? rowWeight(r) : 1); // cell height in units

  return { footprints, insideAnyFootprint, seatTableOf, chairLike, sizedByWeight, wUnits, hUnits };
}

/** Overall size of the layout in units: the widest row and the tallest column. */
function layoutExtent({ wUnits, hUnits }) {
  const { rows, cols } = state.grid;
  let w = 1, h = 1;
  for (let r = 0; r < rows; r++) {
    let s = 0;
    for (let c = 0; c < cols; c++) s += wUnits(r, c);
    w = Math.max(w, s);
  }
  for (let c = 0; c < cols; c++) {
    let s = 0;
    for (let r = 0; r < rows; r++) s += hUnits(r, c);
    h = Math.max(h, s);
  }
  return { w, h };
}

/** Rectangle for every square, keyed by "r,c". x accumulates left→right within
 *  each row and y accumulates top→bottom within each column — two independent
 *  walks, so one thinned square offsets its neighbours in both directions. */
function layoutRects({ wUnits, hUnits }, unit, originX, originY) {
  const { rows, cols } = state.grid;
  const rects = new Map();
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
  return rects;
}

/** How far a w x h rectangle must shrink to still fit inside its own footprint
 *  once turned `deg` degrees. A rotated rectangle's bounding box grows, so
 *  without this a turned table would overhang the squares around it. */
function rotationFit(w, h, deg) {
  if (!deg) return 1;
  const rad = (deg * Math.PI) / 180;
  const cos = Math.abs(Math.cos(rad));
  const sin = Math.abs(Math.sin(rad));
  const spanW = w * cos + h * sin;
  const spanH = w * sin + h * cos;
  return Math.min(1, w / spanW, h / spanH);
}
