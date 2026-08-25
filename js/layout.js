// layout.js — the geometry rules shared by the canvas output and the grid's
// "true sizes" preview, so the two can never drift apart.
//
// Desks, chairs and seats always claim one full unit. Only EMPTY squares take
// their row/column weight. That lets a single square be thinned into a walkway
// without the seats around it shrinking too. (A chair keeps its full square and
// draws a small piece of furniture inside it — see js/export.js.)


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

/** Geometry of a merged square, shared by the grid and the export so the two
 *  agree. `has(r,c)` tests membership; `labelRun` is the widest horizontal run of
 *  cells (where the labels sit); `iconCell` is the slimmest cell (the thinnest
 *  arm, where the icon sits); `isRect` is true when the block is a full rectangle
 *  (then both renderers lay the content out centred, like an ordinary desk). */
function mergePlan(merge) {
  const keys = merge.keys;
  const set = new Set(keys);
  const cells = keys.map((k) => parseKey(k));
  const bbox = footprintOf(keys);
  const has = (r, c) => set.has(keyOf(r, c));

  // The widest horizontal run of contiguous member cells; on a tie, the run
  // nearest the block's vertical centre, so labels land in the body of a T or +.
  const midR = (bbox.minR + bbox.maxR) / 2;
  let labelRun = null;
  for (let r = bbox.minR; r <= bbox.maxR; r++) {
    let start = null;
    for (let c = bbox.minC; c <= bbox.maxC + 1; c++) {
      if (c <= bbox.maxC && has(r, c)) { if (start === null) start = c; continue; }
      if (start !== null) {
        const len = c - start;
        const better = !labelRun || len > labelRun.len ||
          (len === labelRun.len && Math.abs(r - midR) < Math.abs(labelRun.r - midR));
        if (better) labelRun = { r, cStart: start, cEnd: c - 1, len };
        start = null;
      }
    }
  }

  // The slimmest cell: the one whose horizontal + vertical runs are shortest — a
  // tip of an arm. Ties resolve to the topmost/leftmost (cells are pre-sorted).
  const runLen = (r, c, dr, dc) => {
    let n = 1;
    for (let y = r - dr, x = c - dc; has(y, x); y -= dr, x -= dc) n++;
    for (let y = r + dr, x = c + dc; has(y, x); y += dr, x += dc) n++;
    return n;
  };
  let iconCell = null, best = Infinity;
  for (const [r, c] of cells) {
    const score = runLen(r, c, 0, 1) + runLen(r, c, 1, 0);
    if (score < best) { best = score; iconCell = { r, c }; }
  }

  const isRect = keys.length === (bbox.maxR - bbox.minR + 1) * (bbox.maxC - bbox.minC + 1);
  return { set, has, bbox, cells, labelRun, iconCell, isRect };
}

/** Pixel geometry of a wall edge, given a `rectOf(r,c) -> {x,y,w,h}` lookup.
 *  Returns `{ o, cross, a0, a1, u }`: for a horizontal edge `cross` is its y and
 *  a0..a1 its x span; for a vertical edge `cross` is its x and a0..a1 its y span.
 *  `u` is the neighbouring cell size, so wall thickness scales with the grid.
 *  `gap` (the grid's inter-cell gap; 0 in the gapless export) centres the segment
 *  on the true seam and extends its ends to the corner points, so perpendicular
 *  walls meet cleanly at junctions. */
function wallSegment(o, r, c, rectOf, gap = 0) {
  const { rows, cols } = state.grid;
  const g = gap / 2;
  if (o === 'h') {
    const cell = r < rows ? rectOf(r, c) : rectOf(rows - 1, c);
    const y = (r < rows ? cell.y : cell.y + cell.h) + (r < rows ? -g : g);
    return { o, cross: y, a0: cell.x - g, a1: cell.x + cell.w + g, u: Math.min(cell.w, cell.h) };
  }
  const cell = c < cols ? rectOf(r, c) : rectOf(r, cols - 1);
  const x = (c < cols ? cell.x : cell.x + cell.w) + (c < cols ? -g : g);
  return { o, cross: x, a0: cell.y - g, a1: cell.y + cell.h + g, u: Math.min(cell.w, cell.h) };
}

// Wall proportions, measured from the reference SVGs (where a bar spans one cell
// of 2578 units): the bar is 0.0909 of a cell thick and its outline 0.0295.
//
// A bar has TWO looks, and they are the same geometry with different ends:
//   grid   — 45° bevelled ends (a hexagon), so perpendicular runs miter at corners
//   export — plain square ends, drawn seamlessly: where the next edge carries the
//            same wall, that end's cap is left off entirely, so a row of hollow
//            walls reads as one continuous hollow run (see the 3-hollow-walls
//            reference, whose middle segment has no caps at all).
const WALL_THICK = 0.0909;
const WALL_STROKE = 0.0295;
const WALL_INK = '#000000';
const DOOR_FILL = '#6c4c00';
const DOOR_INK = '#392b00';
const RAIL_INK = '#343434';
const HINGE_R = 0.0424;      // hinge ring's mid-radius

/** A point `p` along the seam and `q` across it. */
function wallPt(seg, p, q) {
  return seg.o === 'h' ? { x: p, y: seg.cross + q } : { x: seg.cross + q, y: p };
}

/** The outline of a wall bar. A capped end is bevelled to a 45° point when
 *  `bevel` is on (the grid look) and square otherwise (the export look); an
 *  UNcapped end is always square, so the bar butts flush against its neighbour.
 *  Returns the polygon plus the four corners and two tips, so the caller can
 *  stroke the long sides and each cap separately. */
function wallBar(seg, { bevel = true, capA = true, capB = true } = {}) {
  const { u } = seg;
  const h = (WALL_THICK * u) / 2;
  // An uncapped end runs a hair past the seam so it overlaps the wall continuing
  // there, leaving no hairline where the two fills meet.
  const bleed = WALL_STROKE * u * 0.5;
  const a0 = seg.a0 - (capA ? 0 : bleed);
  const a1 = seg.a1 + (capB ? 0 : bleed);
  const bevA = bevel && capA, bevB = bevel && capB;
  const P = (p, q) => wallPt(seg, p, q);
  const topA = P(bevA ? a0 + h : a0, -h), topB = P(bevB ? a1 - h : a1, -h);
  const botA = P(bevA ? a0 + h : a0, h),  botB = P(bevB ? a1 - h : a1, h);
  const tipA = bevA ? P(a0, 0) : null,    tipB = bevB ? P(a1, 0) : null;
  const pts = [topA, topB];
  if (tipB) pts.push(tipB);
  pts.push(botB, botA);
  if (tipA) pts.push(tipA);
  return { pts, topA, topB, botA, botB, tipA, tipB, h };
}

/** Stroke one end of a bar: a 45° "V" when bevelled, otherwise a straight cap. */
function strokeWallCap(ops, bar, end, ink, sw) {
  const top = end === 'A' ? bar.topA : bar.topB;
  const bot = end === 'A' ? bar.botA : bar.botB;
  const tip = end === 'A' ? bar.tipA : bar.tipB;
  if (tip) {
    ops.line(top.x, top.y, tip.x, tip.y, ink, sw);
    ops.line(tip.x, tip.y, bot.x, bot.y, ink, sw);
  } else {
    ops.line(top.x, top.y, bot.x, bot.y, ink, sw);
  }
}

/** Paint one non-door wall through `ops` — `poly(points, fill, stroke, sw)`,
 *  `line(x1,y1,x2,y2, stroke, sw)` and `circle(...)`. Wall is a grey-filled bar,
 *  hollow is the bare outline, window is that outline with a light-blue glass
 *  tint, and railing is a dumbbell (see paintRailing). The long sides are always
 *  stroked; each end cap only when `opts` asks for it. */
function paintWall(seg, type, ops, opts = {}) {
  if (type === 'railing') return paintRailing(seg, ops, opts);
  const sw = WALL_STROKE * seg.u;
  const bar = wallBar(seg, opts);
  const fill = type === 'wall' ? '#909090' : type === 'window' ? '#d8feff' : 'none';
  if (fill !== 'none') ops.poly(bar.pts, fill, 'none', 0);
  ops.line(bar.topA.x, bar.topA.y, bar.topB.x, bar.topB.y, WALL_INK, sw);
  ops.line(bar.botA.x, bar.botA.y, bar.botB.x, bar.botB.y, WALL_INK, sw);
  if (opts.capA !== false) strokeWallCap(ops, bar, 'A', WALL_INK, sw);
  if (opts.capB !== false) strokeWallCap(ops, bar, 'B', WALL_INK, sw);
}

/** A railing: an outlined dumbbell — a full-thickness post at each end, a
 *  half-thickness shaft between them, and a 45° chamfer joining the two. The
 *  posts end in a bevelled point on the grid and square on the export. */
function paintRailing(seg, ops, { bevel = true } = {}) {
  const { a0, a1, u } = seg;
  const h = (WALL_THICK * u) / 2;
  const s = h / 2;                    // shaft half-thickness
  const lead = bevel ? h : 0;         // the bevel tip's overhang
  const flat = lead + h;              // post's full-thickness run
  const neck = flat + s;              // where the chamfer meets the shaft
  const P = (p, q) => wallPt(seg, p, q);

  const pts = [];
  if (bevel) pts.push(P(a0 + lead, -h)); else pts.push(P(a0, -h));
  pts.push(P(a0 + flat, -h), P(a0 + neck, -s), P(a1 - neck, -s), P(a1 - flat, -h));
  if (bevel) pts.push(P(a1 - lead, -h), P(a1, 0), P(a1 - lead, h));
  else pts.push(P(a1, -h), P(a1, h));
  pts.push(P(a1 - flat, h), P(a1 - neck, s), P(a0 + neck, s), P(a0 + flat, h));
  if (bevel) pts.push(P(a0 + lead, h), P(a0, 0)); else pts.push(P(a0, h));

  ops.poly(pts, 'none', RAIL_INK, WALL_STROKE * u * 0.8);
}

/** Paint a door: a brown frame filling the opening, a hinge RING at one end, and
 *  a 45° swing leaf — a panel as long as the opening and as wide as the wall —
 *  sweeping into the adjacent cell. `orient` (0..3) picks the hinge end (bit 1)
 *  and the swing side (bit 0), which is its rotate and its flip. */
function paintDoor(seg, orient, ops, opts = {}) {
  const { a0, a1, u } = seg;
  const sw = WALL_STROKE * u;
  const bar = wallBar(seg, opts);
  ops.poly(bar.pts, DOOR_FILL, DOOR_INK, sw);

  const hingeAtEnd = (orient & 2) !== 0;
  const swing = (orient & 1) ? -1 : 1;
  const r = HINGE_R * u;
  const inset = (opts.bevel === false ? 0 : bar.h) + r;
  const hp = hingeAtEnd ? a1 - inset : a0 + inset;
  const dir = hingeAtEnd ? -1 : 1;                 // the leaf sweeps to the far end
  const hinge = wallPt(seg, hp, 0);
  ops.circle(hinge.x, hinge.y, r, 'none', DOOR_INK, sw);

  // The panel is the opening's length (less the wall's own thickness), laid at
  // 45°, and is drawn as an outline so the floor shows through it.
  const leaf = (a1 - a0) - bar.h * 2;
  const comp = leaf / Math.SQRT2;
  const tip = wallPt(seg, hp + dir * comp, swing * comp);
  const dx = tip.x - hinge.x, dy = tip.y - hinge.y, len = Math.hypot(dx, dy) || 1;
  const nx = (-dy / len) * bar.h, ny = (dx / len) * bar.h;
  ops.poly([
    { x: hinge.x + nx, y: hinge.y + ny }, { x: tip.x + nx, y: tip.y + ny },
    { x: tip.x - nx, y: tip.y - ny }, { x: hinge.x - nx, y: hinge.y - ny },
  ], 'none', 'rgba(57,43,0,0.46)', sw);
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

  // Only empty squares take their row/column weight. A filled square — desk,
  // chair or seat — always claims one full unit; a chair simply draws a small
  // piece of furniture inside its full square rather than shrinking the square.
  const sizedByWeight = (r, c) => !isEnabled(r, c);
  const wUnits = (r, c) => (sizedByWeight(r, c) ? colWeight(c) : 1); // cell width in units
  const hUnits = (r, c) => (sizedByWeight(r, c) ? rowWeight(r) : 1); // cell height in units

  return { footprints, insideAnyFootprint, seatTableOf, sizedByWeight, wUnits, hUnits };
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
