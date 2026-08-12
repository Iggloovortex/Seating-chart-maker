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

  // What each table actually sits on, turned or not.
  const covers = new Map(state.tables.map((t) => [t.id, new Set(tableCoverage(t))]));
  const insideAnyFootprint = (r, c) => {
    const k = keyOf(r, c);
    return state.tables.some((t) => covers.get(t.id).has(k));
  };

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

/** The squares a table covers. Sitting square on the grid that is simply its
 *  footprint; turned, it is every square whose centre falls inside the turned
 *  shape — the rough outline the table now occupies.
 *
 *  `cellKeys` stays the table's BASE rectangle, which is what the shape is drawn
 *  from. Coverage is derived, never stored, so rotating cannot feed its own
 *  result back in and grow the table each time. */
function tableCoverage(table) {
  const fp = footprintOf(table.cellKeys);
  const rot = ((table.rotation || 0) % 360 + 360) % 360;
  const keys = [];
  if (!rot) {
    for (let r = fp.minR; r <= fp.maxR; r++)
      for (let c = fp.minC; c <= fp.maxC; c++) keys.push(keyOf(r, c));
    return keys;
  }

  // Work in cell units: the rectangle spans [minC, maxC+1] x [minR, maxR+1].
  const cx = (fp.minC + fp.maxC + 1) / 2, cy = (fp.minR + fp.maxR + 1) / 2;
  const hw = (fp.maxC + 1 - fp.minC) / 2, hh = (fp.maxR + 1 - fp.minR) / 2;
  // Turn each square's centre BACK into the rectangle's own frame, where the
  // test is just a pair of comparisons.
  const rad = (-rot * Math.PI) / 180;
  const cos = Math.cos(rad), sin = Math.sin(rad);

  // Only squares inside the turned rectangle's bounding box can qualify.
  const ac = Math.abs(Math.cos((rot * Math.PI) / 180));
  const as = Math.abs(Math.sin((rot * Math.PI) / 180));
  const spanX = hw * ac + hh * as, spanY = hw * as + hh * ac;
  const lo = (v) => Math.max(0, Math.floor(v));
  for (let r = lo(cy - spanY); r <= Math.ceil(cy + spanY) && r < state.grid.rows; r++) {
    for (let c = lo(cx - spanX); c <= Math.ceil(cx + spanX) && c < state.grid.cols; c++) {
      const px = c + 0.5 - cx, py = r + 0.5 - cy;
      if (Math.abs(px * cos - py * sin) <= hw && Math.abs(px * sin + py * cos) <= hh) {
        keys.push(keyOf(r, c));
      }
    }
  }
  return keys;
}
