// layout.js — the geometry rules shared by the canvas output and the grid's
// "true sizes" preview, so the two can never drift apart.
//
// EVERY square takes its row/column weight — empty, desk, split, merged. A square
// keeping a name INSIDE only thins as far as that name needs (floorUnits), and only
// where float is on offer to begin with; one whose name floats thins all the way and
// hangs the name outside (see hangingLabelBox in js/export.js).


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
  // `u` is every wall measure's unit — thickness, outline, bevel, the lot. It is a FULL
  // square, not this square: a wall beside a thinned walkway is the same wall as one
  // beside a full row, just a shorter piece of it. Taking it from the shrunken cell
  // scaled the whole bar down, so a wall along a 0.35 row drew a third as thick as its
  // neighbours and read as a different object. The bar's LENGTH still follows the cell,
  // which is the cropping.
  const wallUnit = (cell) => layoutUnit() || Math.min(cell.w, cell.h);
  if (o === 'h') {
    const cell = r < rows ? rectOf(r, c) : rectOf(rows - 1, c);
    const y = (r < rows ? cell.y : cell.y + cell.h) + (r < rows ? -g : g);
    return { o, cross: y, a0: cell.x - g, a1: cell.x + cell.w + g, u: wallUnit(cell) };
  }
  const cell = c < cols ? rectOf(r, c) : rectOf(r, cols - 1);
  const x = (c < cols ? cell.x : cell.x + cell.w) + (c < cols ? -g : g);
  return { o, cross: x, a0: cell.y - g, a1: cell.y + cell.h + g, u: wallUnit(cell) };
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
//
// The export additionally draws everything THINNER (WALL_OUT_SCALE). At full
// reference weight a wall is 0.0909 of a cell, which — sitting centred on a seam
// — is wide enough to bury the 0.03-cell borders of the squares either side of
// it. Scaled down, a wall still reads as a wall but the layout it runs through
// stays visible. Every wall measure scales together, so the proportions (and so
// the look) are unchanged.
/** How far a table is held off its cells' edges, as a fraction of ONE CELL's short
 *  side — so the gap reads the same whatever size the table is, and the grid and the
 *  export agree. It used to be a flat 6px in the grid and 6% of the TABLE's short
 *  side in the export, which gave a big table a gap several times a small one's. */
const TABLE_INSET = 0.03;

const WALL_THICK = 0.0909;
const WALL_STROKE = 0.0295;
const WALL_OUT_SCALE = 0.5;
/** A wall on a seam INSIDE a table is a desk divider — the panel between two seats
 *  of one cubicle run — not a wall of the room. It is drawn at half weight, which
 *  is the railing's shaft: a divider reads as a partition rather than as structure,
 *  and a run of them does not bury the desks it divides. Every measure scales
 *  together, exactly as WALL_OUT_SCALE does, so the proportions are unchanged. */
const WALL_DIVIDER_SCALE = 0.5;

/** Weight multiplier for a set of paint options: the export's thin walls, or the
 *  grid's full-weight ones, halved again for a divider. */
function wallScale(opts) {
  return (opts && opts.out ? WALL_OUT_SCALE : 1) * (opts && opts.divider ? WALL_DIVIDER_SCALE : 1);
}
const WALL_INK = '#000000';
const DOOR_FILL = '#6c4c00';
const DOOR_INK = '#392b00';
const RAIL_INK = '#343434';
// On export a railing is drawn to the WALL's weight, which sets both halves of
// the dumbbell against something real: its end posts come out exactly a wall
// thick, and its slim shaft — half of that — fits inside a wall's footprint. The
// editing grid keeps the railing at full weight, where it has room to read.
const RAIL_OUT_SCALE = WALL_OUT_SCALE;
function railScale(opts) {
  return (opts && opts.out ? RAIL_OUT_SCALE : 1) * (opts && opts.divider ? WALL_DIVIDER_SCALE : 1);
}
// The railing's outline is finer than a wall's — 0.194 of its own thickness,
// measured off the reference, which is what keeps the dumbbell reading as an
// outlined rail rather than a solid bar at this size.
const RAIL_STROKE = WALL_STROKE * 0.6;
const RAIL_POST_R = 1.35;    // corner post's ring radius, as a share of half-thickness
const HINGE_R = 0.0424;      // hinge ring's mid-radius

/** A hex colour at partial strength, for the marks that should read as notation
 *  rather than structure — a door's swing arc, a window's glass hatch. */
function fadeInk(hex, alpha) {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(String(hex || ''));
  if (!m) return hex;
  return `rgba(${parseInt(m[1], 16)}, ${parseInt(m[2], 16)}, ${parseInt(m[3], 16)}, ${alpha})`;
}

/** The swing leaf is drawn faded, so it reads as the door's arc rather than
 *  another wall. Follows the door's own outline colour. */
function doorLeafInk() { return fadeInk(doorInkColor(), 0.46); }

/** The user's wall colours (Walls bar), falling back to the reference values.
 *  A window keeps its own glass tint — that is what makes it read as glass — and
 *  doors and railings keep their own palette. */
function wallFillColor() { return (state.defaults && state.defaults.wallFill) || '#909090'; }
function wallInkColor() { return (state.defaults && state.defaults.wallBorder) || WALL_INK; }
function railFillColor() { return (state.defaults && state.defaults.railFill) || '#909090'; }
/** Glass. The COLOUR is the user's; the half opacity is not — that is what makes
 *  it read as something you can see through rather than a tinted wall. */
const WINDOW_ALPHA = 0.5;
function windowFillColor() {
  return fadeInk((state.defaults && state.defaults.windowFill) || '#d8feff', WINDOW_ALPHA);
}
function railInkColor() { return (state.defaults && state.defaults.railBorder) || RAIL_INK; }
function doorFillColor() { return (state.defaults && state.defaults.doorFill) || DOOR_FILL; }
function doorInkColor() { return (state.defaults && state.defaults.doorBorder) || DOOR_INK; }

/** Rule a window's glass with the `/ / /` hatch that names it as glass at a
 *  glance. `rect` is the pane — the bar's INSIDE, which each renderer already
 *  computes — and `u` its cell size, so the spacing and weight scale with it. */
function paintWindowHatch(rect, u, ops) {
  const sw = WALL_STROKE * u * 0.5;
  // Widely spaced and faint: enough to say "glass" at a glance without the rule
  // competing with the wall it sits in.
  const ink = fadeInk(wallInkColor(), 0.3);
  for (const l of hatchSegments(rect, WALL_THICK * u * 1.7)) {
    ops.line(l.x1, l.y1, l.x2, l.y2, ink, sw);
  }
}

/** The `/ / /` hatch that marks a window as glass. Returns the line segments of
 *  a 45° rule clipped to `rect` — the same geometry for the SVG grid overlay and
 *  the canvas export, so the two hatch identically. */
function hatchSegments(rect, spacing) {
  const x0 = rect.x, y0 = rect.y, x1 = rect.x + rect.w, y1 = rect.y + rect.h;
  const out = [];
  if (!(spacing > 0) || x1 <= x0 || y1 <= y0) return out;
  // Every line is x + y = c; walking c across the box sweeps the whole rule.
  const first = Math.ceil((x0 + y0) / spacing) * spacing;
  for (let c = first; c <= x1 + y1; c += spacing) {
    const ax = Math.max(x0, c - y1), bx = Math.min(x1, c - y0);
    if (ax >= bx) continue;
    out.push({ x1: ax, y1: c - ax, x2: bx, y2: c - bx });
  }
  return out;
}

/** A point `p` along the seam and `q` across it. */
function wallPt(seg, p, q) {
  return seg.o === 'h' ? { x: p, y: seg.cross + q } : { x: seg.cross + q, y: p };
}

/** The outline of a wall bar. A capped end is bevelled to a 45° point when
 *  `bevel` is on (the grid look) and square otherwise (the export look); an
 *  UNcapped end is always square, so the bar butts flush against its neighbour.
 *  Returns the polygon plus the four corners and two tips, so the caller can
 *  stroke the long sides and each cap separately. */
/** How far an end moves for its join mode: a 'through' end bleeds a hair past the
 *  seam so two bars fuse with no hairline; 'extend' claims the corner square;
 *  'trim' gives it up and stops against the perpendicular wall's face. */
function wallSpan(seg, opts = {}) {
  const { endA = 'plain', endB = 'plain' } = opts;
  const u = seg.u * wallScale(opts);
  const h = (WALL_THICK * u) / 2;
  const bleed = WALL_STROKE * u * 0.5;
  const adj = (m) => (m === 'through' ? -bleed : m === 'extend' ? -h : m === 'trim' ? h : 0);
  return {
    h,
    a0: seg.a0 + adj(endA),
    a1: seg.a1 - adj(endB),
    capA: endA !== 'through',
    capB: endB !== 'through',
  };
}

function wallBar(seg, opts = {}) {
  const { bevel = true } = opts;
  const { h, a0, a1, capA, capB } = wallSpan(seg, opts);
  const bevA = bevel && capA, bevB = bevel && capB;
  const P = (p, q) => wallPt(seg, p, q);
  const topA = P(bevA ? a0 + h : a0, -h), topB = P(bevB ? a1 - h : a1, -h);
  const botA = P(bevA ? a0 + h : a0, h),  botB = P(bevB ? a1 - h : a1, h);
  const tipA = bevA ? P(a0, 0) : null,    tipB = bevB ? P(a1, 0) : null;
  const pts = [topA, topB];
  if (tipB) pts.push(tipB);
  pts.push(botB, botA);
  if (tipA) pts.push(tipA);
  return { pts, topA, topB, botA, botB, tipA, tipB, h, a0, a1, capA, capB };
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
  const sw = WALL_STROKE * seg.u * wallScale(opts);
  const bar = wallBar(seg, opts);
  const ink = wallInkColor();
  const fill = type === 'wall' ? wallFillColor() : type === 'window' ? windowFillColor() : 'none';
  if (fill !== 'none') ops.poly(bar.pts, fill, 'none', 0);
  ops.line(bar.topA.x, bar.topA.y, bar.topB.x, bar.topB.y, ink, sw);
  ops.line(bar.botA.x, bar.botA.y, bar.botB.x, bar.botB.y, ink, sw);
  if (bar.capA) strokeWallCap(ops, bar, 'A', ink, sw);
  if (bar.capB) strokeWallCap(ops, bar, 'B', ink, sw);
}

/** A railing: an outlined dumbbell — a full-thickness post at each end, a
 *  half-thickness shaft between them, and a 45° chamfer joining the two. The
 *  posts end in a bevelled point on the grid and square on the export. */
function paintRailing(seg, ops, opts = {}) {
  const { bevel = true, endA = 'post', endB = 'post', clipA = 0, clipB = 0 } = opts;
  const u = seg.u * railScale(opts);
  const h = (WALL_THICK * u) / 2;
  const s = h / 2;                    // shaft half-thickness
  // A shaft stops at the ring's centreline where a railing turns the corner, so
  // the octagonal post covers its cut end. `clipA`/`clipB` shorten it further at
  // an end that runs into a wall or a door, so the two never overlap.
  const a0 = seg.a0 + (endA === 'corner' ? RAIL_POST_R * h : 0) + clipA;
  const a1 = seg.a1 - (endB === 'corner' ? RAIL_POST_R * h : 0) - clipB;
  const lead = bevel ? h : 0;         // the bevel tip's overhang
  const flat = lead + h;              // post's full-thickness run
  const neck = flat + s;              // where the chamfer meets the shaft
  const P = (p, q) => wallPt(seg, p, q);
  const postA = endA === 'post', postB = endB === 'post';

  const pts = [];
  // Leading end: an end post flares to full thickness, otherwise the slim shaft
  // simply runs out to the seam so two railings join without a lump.
  if (postA) {
    if (bevel) pts.push(P(a0 + lead, -h)); else pts.push(P(a0, -h));
    pts.push(P(a0 + flat, -h), P(a0 + neck, -s));
  } else {
    pts.push(P(a0, -s));
  }
  if (postB) {
    pts.push(P(a1 - neck, -s), P(a1 - flat, -h));
    if (bevel) pts.push(P(a1 - lead, -h), P(a1, 0), P(a1 - lead, h));
    else pts.push(P(a1, -h), P(a1, h));
    pts.push(P(a1 - flat, h), P(a1 - neck, s));
  } else {
    pts.push(P(a1, -s), P(a1, s));
  }
  if (postA) {
    pts.push(P(a0 + neck, s), P(a0 + flat, h));
    if (bevel) pts.push(P(a0 + lead, h), P(a0, 0)); else pts.push(P(a0, h));
  } else {
    pts.push(P(a0, s));
  }

  ops.poly(pts, railFillColor(), railInkColor(), RAIL_STROKE * u);
}

/** The octagonal post where railings turn a corner: a regular octagon ring with
 *  its vertices on the axes and the diagonals, centred on the junction. */
function paintRailingPost(cx, cy, cellU, ops, opts = {}) {
  const u = cellU * railScale(opts);
  const h = (WALL_THICK * u) / 2;
  const r = RAIL_POST_R * h;
  const pts = [];
  // Turned an eighth of a turn from vertex-up, so the top, bottom, left and
  // right of the ring are FLAT faces squared to the grid rather than points.
  for (let i = 0; i < 8; i++) {
    const a = (i + 0.5) * (Math.PI / 4);
    pts.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
  }
  ops.poly(pts, railFillColor(), railInkColor(), RAIL_STROKE * u);
}

/** Paint a door: a brown frame filling the opening, a hinge RING at one end, and
 *  a 45° swing leaf — a panel as long as the opening and as wide as the wall —
 *  sweeping into the adjacent cell. `orient` (0..3) picks the hinge end (bit 1)
 *  and the swing side (bit 0), which is its rotate and its flip. */
function paintDoor(seg, orient, ops, opts = {}) {
  const u = seg.u * wallScale(opts);
  const sw = WALL_STROKE * u;
  const bar = wallBar(seg, opts);
  const { a0, a1 } = bar;
  ops.poly(bar.pts, doorFillColor(), doorInkColor(), sw);

  const hingeAtEnd = (orient & 2) !== 0;
  const swing = (orient & 1) ? -1 : 1;
  const r = HINGE_R * u;
  const inset = (opts.bevel === false ? 0 : bar.h) + r;
  const hp = hingeAtEnd ? a1 - inset : a0 + inset;
  const dir = hingeAtEnd ? -1 : 1;                 // the leaf sweeps to the far end
  const hinge = wallPt(seg, hp, 0);
  ops.circle(hinge.x, hinge.y, r, 'none', doorInkColor(), sw);

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
  ], 'none', doorLeafInk(), sw);
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

  // Empty squares take their row/column weight — and so does a square holding
  // NOTHING BUT a special icon (chair, server, stairs). Such a square has no text
  // needing room, so forcing it to a full unit only stopped a walkway row closing
  // up: the empty spaces beside it shrank while it did not, leaving the row ragged.
  // A square with labels still claims a full unit, because the text is what needs
  // the space.
  // EVERY square takes its row/column size — empty, a desk, a split, a member of a
  // merge, anything. It used to be only empties and special icons, on the reasoning
  // that a desk is all text with no piece to shrink around; the effect was that the
  // Size section did nothing at all on the squares people most wanted to resize, and a
  // row could not be thinned wherever a desk sat in it. A desk's text shrinks to fit
  // its square in both renderers, so the weight can simply be the size.
  const sizedByWeight = () => true;

  // ...but a square keeping its names INSIDE only thins as far as those names need, so
  // "Keep inside" extends the row to fit the text instead of forcing a full square.
  // Only where float is on offer: an ordinary desk has nowhere else to put its text, so
  // a floor there would be a floor on every desk and the weight would stop meaning
  // anything. A desk shrinks to its weight and its text shrinks with it.
  const floorUnits = (r, c) => {
    if (!isEnabled(r, c)) return 0;
    const cell = peekCell(r, c);
    if (!furnitureKind(cell)) return 0;
    return labelRoomUnits(cell, true);
  };
  const wUnits = (r, c) => (sizedByWeight(r, c) ? Math.max(colWeight(c), floorUnits(r, c)) : 1);
  const hUnits = (r, c) => (sizedByWeight(r, c) ? Math.max(rowWeight(r), floorUnits(r, c)) : 1);

  // A square is SHRUNK when it takes a weight and that weight is under a full unit —
  // answerable without the rects, which is what the reserve below needs.
  const isShrunk = (r, c) => sizedByWeight(r, c) && (rowWeight(r) < 1 || colWeight(c) < 1);

  // With "hold the space" on, a square whose name hangs below it pushes the next row
  // down by the band that name needs, instead of the name lying over whatever is
  // there. It is the ADVANCE that grows, never the square: the square stays as thin
  // as its weight says.
  const reserveUnits = (r, c) => {
    if (!state.config || !state.config.reserveFloatSpace) return 0;
    return anyLabelFloats(peekCell(r, c), isShrunk(r, c)) ? FLOAT_BAND : 0;
  };

  return { footprints, insideAnyFootprint, seatTableOf, sizedByWeight, wUnits, hUnits, reserveUnits };
}

// The full-square size of the most recent layout, in whatever px the caller asked
// for. Both renderers go through layoutRects, so each pass leaves the figure its own
// drawing code needs to tell a SHRUNKEN square from a full one.
let LAYOUT_UNIT = 0;
function layoutUnit() { return LAYOUT_UNIT; }

/** True when this rect has been cut below a full square by its row/column size — the
 *  test for "there is no room in here for the text", which is what lets a label hang
 *  outside (see floatsOutside). */
function rectIsShrunk(rect) {
  return !!rect && LAYOUT_UNIT > 0 && Math.min(rect.w, rect.h) < LAYOUT_UNIT * 0.995;
}

/** Whether a label line hangs OUTSIDE its square rather than being crushed inside it.
 *  Three things must agree: the setting is on, the line is marked to float, and the
 *  square really has no room — shrunk by its weight, or a split piece. A full-size
 *  square always keeps its labels in. */
function floatsOutside(cell, shrunk) {
  // Float is ONE decision per square (or per split piece), not per label line: the
  // names of a square either hang outside together or stay inside together, which is
  // what the single toggle in the pane writes. A square floats unless it has been
  // turned OFF, so a named chair shrinks out of the box by default.
  return !!(shrunk && cellFloats(cell) && state.config && state.config.floatLabels);
}

/** How much room a hung name needs below its square, in units. */
const FLOAT_BAND = 0.5;

/** LABELS follow the editing grid (the user's call): a plain square's
 *  `.cell__labels { line-height: 1.15 }` is the reference, and every label stack in
 *  both renderers uses it. The export used to pitch its lines at 1.22× the font while
 *  the grid ran 1.10–1.23 depending on what kind of thing held the label. The FONT is
 *  unchanged — the two renderers already agreed on it (0.150 vs 0.148 of a square) —
 *  only the gap between lines closes up. */
const LABEL_LINE_HEIGHT = 1.15;
/** A full square's label font, as a share of the square (the grid's 12px on 80). */
const LABEL_FONT_UNITS = 0.1476;
/** A label line's height as a fraction of a full square — BASE_LINE in js/export.js. */
const LABEL_LINE_UNITS = LABEL_FONT_UNITS * LABEL_LINE_HEIGHT;

// ------------------------------------------------------------- icon size
//
// ICONS follow the export (the user's call), and both renderers now size a square's
// or a piece's icon through ONE function, contentIconBox. The rule is option E of the
// limit-break sheet (tools/survey/icon-options.js):
//
//  * With labels, an icon takes the room ITS OWN lines leave, capped at ICON_MAX of
//    the box. It used to be the room left by the MOST-lined square in the whole
//    chart (planContent's maxLines), so one two-line desk anywhere shrank every
//    one-line desk's icon to a two-line desk's — and raising the cap did nothing.
//  * With no labels, an icon fills the box up to ONE EVEN margin on all four sides
//    (ICON_ALONE_PAD), whichever side it reaches first. It was a fixed 0.6 nominal
//    inside a 94% room, so its height stopped at the nominal while a wide glyph ran
//    almost to the edge sideways: a wide top/bottom margin and next to none at the
//    sides.
//  * A merged desk keeps its own rule (mergeIconSize), with ICON_ROOM raised to 0.80.
const ICON_MAX = 0.72;        // an icon with labels never takes more of its box
const ICON_MIN = 0.30;        // …nor less, however many lines (they shrink to fit)
const ICON_ALONE_PAD = 0.08;  // an icon on its own stops this far from every edge
const CONTENT_ROOM = 0.94;    // the share of a box the content stack may fill

/** The drawn box {w, h} of a square's or a piece's icon, in the caller's px.
 *  `w`/`h` the box it sits in; `lines` how many label lines share it; `lineH` one
 *  line's px (struck from a whole cell, so a piece passes the CELL's line); `ratio`
 *  the glyph's own shape; `vertical` when the stack runs across the box (a quarter
 *  turn). The box keeps the glyph's shape — see iconBox. */
function contentIconBox(w, h, lines, lineH, ratio, vertical = false) {
  if (!lines) {
    const k = 1 - 2 * ICON_ALONE_PAD;
    // Ask for more than can fit; iconBox contains it, so the glyph grows until its
    // limiting side meets the margin — the same margin on every side of the box.
    return iconBox(Math.max(w, h) * 4, ratio, w * k, h * k);
  }
  const s = Math.min(w, h);
  const stack = (vertical ? w : h) * CONTENT_ROOM;
  const n = Math.max(ICON_MIN * s, Math.min(ICON_MAX * s, stack - lines * lineH));
  return iconBox(n, ratio, w * CONTENT_ROOM, h * CONTENT_ROOM);
}

/** How much of a square a KEPT-INSIDE name needs: the piece's own half plus its stack.
 *  A square that is not floating its names shrinks only to this, rather than jumping
 *  back to a full unit — the row extends just far enough to hold the text. */
function labelRoomUnits(cell, shrunk) {
  // One decision for the square: either every name is kept inside or none is.
  if (floatsOutside(cell, shrunk)) return 0;
  const kept = (cell.labels || []).filter((l) => l.text && l.text.trim());
  if (!kept.length) return 0;
  return Math.min(1, 0.5 + kept.length * LABEL_LINE_UNITS + 0.06);
}

/** A server RACK lays each of its names in its own slab, so it has no name to float
 *  and no half to free — it is the one special icon floating does not apply to. */
function canFloatLabels(cell) {
  if (!cell) return false;
  const lines = (cell.labels || []).filter((l) => l.text && l.text.trim());
  return !(cell.icon === 'server' && lines.length >= 2);
}

/** Whether the Float control is worth offering for a square at all. Only a special
 *  icon can shrink (sizedByWeight), so only its name has anywhere to go — on an
 *  ordinary desk the toggle would sit there doing nothing whatever it was set to. */
function floatApplies(cell) {
  return !!(cell && furnitureKind(cell) && canFloatLabels(cell));
}

/** True when any of a square's labels would hang outside it. */
function anyLabelFloats(cell, shrunk, isPiece = false) {
  // The renderers use the SAME gate the Float control does, or a square would float a
  // name the pane offers no way to switch off. For a whole square that is floatApplies
  // (a special icon, the only thing with a piece to hang a name beside); a split PIECE
  // always qualifies, because a piece IS a small square. Without this, letting every
  // square take a row/column weight would start a plain desk floating.
  if (!(isPiece ? canFloatLabels(cell) : floatApplies(cell))) return false;
  if (!(cell.labels || []).some((l) => l.text && l.text.trim())) return false;
  return floatsOutside(cell, shrunk);
}

/** Overall size of the layout in units: the widest row and the tallest column. */
function layoutExtent({ wUnits, hUnits, reserveUnits }) {
  const { rows, cols } = state.grid;
  let w = 1, h = 1;
  for (let r = 0; r < rows; r++) {
    let s = 0;
    for (let c = 0; c < cols; c++) s += wUnits(r, c);
    w = Math.max(w, s);
  }
  for (let c = 0; c < cols; c++) {
    let s = 0;
    for (let r = 0; r < rows; r++) s += hUnits(r, c) + (reserveUnits ? reserveUnits(r, c) : 0);
    h = Math.max(h, s);
  }
  return { w, h };
}

/** Rectangle for every square, keyed by "r,c". x accumulates left→right within
 *  each row and y accumulates top→bottom within each column — two independent
 *  walks, so one thinned square offsets its neighbours in both directions. */
function layoutRects({ wUnits, hUnits, reserveUnits }, unit, originX, originY) {
  LAYOUT_UNIT = unit;
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
      // The square keeps its own height; only the walk moves on further, so the space
      // a hung name needs stays empty instead of the name lying over the next row.
      y += rect.h + (reserveUnits ? reserveUnits(r, c) * unit : 0);
    }
  }
  LAYOUT_RECTS = rects;
  return rects;
}

// The most recent layout's rects, so a square's size in UNITS can be read back by
// code that builds a piece before it is laid out (the grid's buildSubcell).
let LAYOUT_RECTS = null;

/** A square's laid-out size in units of a full square — {w:1,h:1} unless its row or
 *  column is weighted. Unit-free, so either renderer's last layout gives the same. */
function squareUnits(r, c) {
  const b = LAYOUT_RECTS && LAYOUT_RECTS.get(keyOf(r, c));
  if (!b || !(LAYOUT_UNIT > 0)) return { w: 1, h: 1 };
  return { w: b.w / LAYOUT_UNIT, h: b.h / LAYOUT_UNIT };
}

// ------------------------------------------------ a split piece's names: in or out
//
// A piece's names stay INSIDE it until keeping them there would shrink the text, or
// the icon, below what a person can read — only then do they hang outside. (A piece
// used to hang its names out unconditionally, which put a quarter's perfectly
// legible name outside it and over its neighbour for no reason.)
//
// Both renderers strike a piece's text from a whole CELL and shrink it only as far as
// the piece requires; `k` below is that shrink. It is worked out here in UNITS of a
// full square, from the chart alone, so the grid and the export make the same call
// for the same piece — neither renderer's own px measurements are involved.

/** The least a kept-inside name may shrink to, as a share of a full square's text.
 *  Below it the name hangs outside instead. */
const READABLE_TEXT = 0.6;
/** The smallest an icon may be squeezed to by names kept beside it, in squares
 *  (~10px on the editing grid's 80px square). Below it the names hang outside and
 *  give the icon the piece back. */
const READABLE_ICON = 0.12;
const PIECE_ROOM = 0.94;         // the share of a box the content may fill (drawContent)

let TEXT_MEASURE = null;
/** A label's width in units, at a font of `fontU` units — measured with the export's
 *  own content font, so the estimate is the text the export will draw. */
function textRunUnits(text, fontU) {
  if (!TEXT_MEASURE) {
    if (typeof document === 'undefined') return String(text).length * fontU * 0.6;
    TEXT_MEASURE = document.createElement('canvas').getContext('2d');
    TEXT_MEASURE.font = '600 100px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
  }
  return (TEXT_MEASURE.measureText(String(text)).width / 100) * fontU;
}

/** How far keeping a piece's names inside would shrink its content: 1 = not at all.
 *  `wU`/`hU` are the room the content has, in squares. */
function keptInsideScale(cell, wU, hU) {
  const lines = (cell.labels || []).filter((l) => l.text && l.text.trim());
  if (!lines.length) return 1;
  const quarter = ((((Math.round((cell.rotation || 0) / 90) * 90) % 360) + 360) % 360);
  const vertical = quarter === 90 || quarter === 270;
  const stack = (vertical ? wU : hU) * PIECE_ROOM;
  const run = (vertical ? hU : wU) * PIECE_ROOM;
  const lineU = LABEL_LINE_UNITS;
  const fontU = LABEL_FONT_UNITS;
  // The icon the piece would really have: the shared rule, in squares.
  const iconH = cell.icon ? pieceIconBox(cell, wU, hU, lines.length, vertical).h : 0;
  const total = iconH + lines.length * lineU;
  let k = total > stack ? stack / total : 1;
  let widest = 0;
  for (const l of lines) widest = Math.max(widest, textRunUnits(l.text, fontU * k));
  if (widest > run) k *= run / widest;
  return k;
}

/** A piece's icon box in squares, by contentIconBox — what both renderers will draw. */
function pieceIconBox(cell, wU, hU, lines, vertical) {
  const ratio = cell.icon && typeof iconRatio === 'function' ? iconRatio(cell.icon) : 1;
  return contentIconBox(wU, hU, lines, LABEL_LINE_UNITS, ratio, vertical);
}

/** True when a piece's names must hang OUTSIDE it: keeping them in would push the text
 *  below READABLE_TEXT, or squeeze the icon below READABLE_ICON when the icon would be
 *  big enough on its own. A furniture piece's names sit in the half the piece leaves,
 *  so that half is the room they are measured against, with no icon to share it. */
function pieceNamesHang(cell, wU, hU, furniture = false) {
  if (!cell || !(cell.labels || []).some((l) => l.text && l.text.trim())) return false;
  if (furniture) {
    const n = ((Math.round((cell.rotation || 0) / 45) * 45) % 360 + 360) % 360;
    const [dr, dc] = (typeof FACING_STEP !== 'undefined' && FACING_STEP[n]) || [-1, 0];
    const room = { ...cell, icon: null };
    return keptInsideScale(room, dc && !dr ? wU / 2 : wU, dr ? hU / 2 : hU) < READABLE_TEXT;
  }
  const k = keptInsideScale(cell, wU, hU);
  if (k < READABLE_TEXT) return true;
  if (!cell.icon) return false;
  // Squeezed by the names kept beside it — measured against the icon it would have
  // with the piece to itself, so hanging the names only counts when it would help.
  const lines = cell.labels.filter((l) => l.text && l.text.trim()).length;
  const kept = Math.sqrt(pieceIconBox(cell, wU, hU, lines, false).w * pieceIconBox(cell, wU, hU, lines, false).h);
  const alone = Math.sqrt(pieceIconBox(cell, wU, hU, 0, false).w * pieceIconBox(cell, wU, hU, 0, false).h);
  return alone >= READABLE_ICON && kept * k < READABLE_ICON;
}

/** Where each of a table's edges sits, as a signed fraction of ONE square. 0 is flush
 *  with its own squares — the ordinary whole-square table. POSITIVE reaches that much
 *  PAST them, into the square beyond. NEGATIVE pulls that much back INTO the table's own
 *  edge square, which is how a table becomes half a square (or a third, or two thirds)
 *  rather than never being smaller than the one square it sits on. Both directions stop
 *  on the seams of a split, so it is one gesture with one set of stops. */
function tableEdges(table) {
  const e = (table && table.edges) || {};
  const f = (v) => (typeof v === 'number' && v > -1 && v < 1 ? v : 0);
  return { n: f(e.n), e: f(e.e), s: f(e.s), w: f(e.w) };
}

/** The one place an edge's drawn position is worked out, for either direction and either
 *  renderer. `own` is the table's own edge square and `beyond` the one past it; a
 *  positive fraction is measured into `beyond` and a negative one back into `own`, both
 *  from the seam the two share. Each renderer hands in its own boxes (measured cells in
 *  the grid, layout rects in the export), so the edge lands in the same place in both. */
function tableEdgePos(side, f, own, beyond) {
  const sq = f > 0 ? beyond : own;
  if (!sq) return null;
  // Distance from the shared seam, always into whichever square this is.
  const into = f > 0 ? f : -f;
  if (side === 'e') return f > 0 ? sq.x + into * sq.w : sq.x + sq.w - into * sq.w;
  if (side === 'w') return f > 0 ? sq.x + sq.w - into * sq.w : sq.x + into * sq.w;
  if (side === 's') return f > 0 ? sq.y + into * sq.h : sq.y + sq.h - into * sq.h;
  return f > 0 ? sq.y + sq.h - into * sq.h : sq.y + into * sq.h;   // 'n'
}

/** The fractions a table's edge may stop on, on one side: 0 (flush with the square) plus
 *  the seams of any SPLIT square lying just beyond that side. A neighbour split in two
 *  offers a half, one split in three offers a third and two thirds. The stops come from
 *  the squares that are actually there, so "thirds and halves when present" is literal —
 *  with no split beside it, a table still moves a whole square at a time.
 *
 *  Several squares run along one side and they need not agree; every seam any of them
 *  offers is a stop, since the table's edge is one straight line and the user is picking
 *  where to put it. */
function tableEdgeStops(table, side, fpOverride = null) {
  // Only a rectangular table has a box to grow: a notched L/T/+ is traced from its
  // own squares by cellShapeLoops, so there is nothing for a fraction to mean there.
  if (!keysAreRect(table.cellKeys)) return [0];
  const fp = fpOverride || footprintOf(table.cellKeys);
  const stops = new Set([0]);
  const axis = (side === 'n' || side === 's') ? 'rows' : 'cols';
  const scan = [];
  if (side === 'n' && fp.minR > 0) for (let c = fp.minC; c <= fp.maxC; c++) scan.push([fp.minR - 1, c]);
  if (side === 's' && fp.maxR < state.grid.rows - 1) for (let c = fp.minC; c <= fp.maxC; c++) scan.push([fp.maxR + 1, c]);
  if (side === 'w' && fp.minC > 0) for (let r = fp.minR; r <= fp.maxR; r++) scan.push([r, fp.minC - 1]);
  if (side === 'e' && fp.maxC < state.grid.cols - 1) for (let r = fp.minR; r <= fp.maxR; r++) scan.push([r, fp.maxC + 1]);
  for (const [r, c] of scan) {
    const cell = peekCell(r, c);
    const n = cell && cell.split && cell.split[axis];
    if (!n || n < 2) continue;
    for (let i = 1; i < n; i++) stops.add(i / n);
  }
  return [...stops].sort((a, b) => a - b);
}

/** The table's drawn box: its squares' bounding box, grown by whatever each edge
 *  reaches into the square beyond it. `rectOf(r,c)` gives a square's box, so both
 *  renderers expand by the SAME measure — the real size of the square being eaten into,
 *  not an assumed one, which matters the moment rows and columns carry weights. */
function tableBox(table, rectOf) {
  const fp = footprintOf(table.cellKeys);
  const tl = rectOf(fp.minR, fp.minC), br = rectOf(fp.maxR, fp.maxC);
  if (!tl || !br) return null;
  const box = { x: tl.x, y: tl.y, w: br.x + br.w - tl.x, h: br.y + br.h - tl.y };
  const ed = keysAreRect(table.cellKeys) ? tableEdges(table) : { n: 0, e: 0, s: 0, w: 0 };
  // The edge lands inside a real square — the one beyond when it reaches out, its own
  // when it pulls in — so it is measured from THAT square's box, not as a distance from
  // the table's edge. In the grid a CELL_GAP sits between squares, so the neighbour does
  // not begin where the table's cells end, and offsetting from the wrong origin put the
  // grid a whole gap short of the seam while the gapless export sat right on it.
  const edgeAt = (side, own, beyond) => {
    const f = ed[side];
    if (!f) return null;
    return tableEdgePos(side, f, rectOf(own[0], own[1]), rectOf(beyond[0], beyond[1]));
  };
  const top = edgeAt('n', [fp.minR, fp.minC], [fp.minR - 1, fp.minC]);
  const bottom = edgeAt('s', [fp.maxR, fp.minC], [fp.maxR + 1, fp.minC]);
  const leftX = edgeAt('w', [fp.minR, fp.minC], [fp.minR, fp.minC - 1]);
  const rightX = edgeAt('e', [fp.minR, fp.maxC], [fp.minR, fp.maxC + 1]);
  const x0 = leftX === null ? box.x : leftX;
  const y0 = top === null ? box.y : top;
  const x1 = rightX === null ? box.x + box.w : rightX;
  const y1 = bottom === null ? box.y + box.h : bottom;
  // Two edges pulled in can never meet: a table that has eaten itself is not a table,
  // so an axis that came out non-positive keeps its plain, unpulled extent.
  if (x1 - x0 <= 0) return { x: box.x, y: y0, w: box.w, h: Math.max(y1 - y0, box.h) };
  if (y1 - y0 <= 0) return { x: x0, y: box.y, w: x1 - x0, h: box.h };
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** How big a merged desk's ICON may be. A square's icon is a share of its cell, capped
 *  so it never dominates — but a DESK is not a cell: on a 2x1 the fixed cap left the
 *  icon the size it would be on a single square, marooned in twice the room, and a wide
 *  glyph (the double monitor) read as scrunched beside a single one.
 *
 *  So the cap follows the desk: the icon may grow until it hits either ICON_SHARE of
 *  the LONG side or ICON_ROOM of the SHORT side, whichever comes first. On a 1x1 the
 *  short side binds and the answer is what a plain square already gets, so an ordinary
 *  desk is unchanged; the longer or taller the desk, the more the long side allows,
 *  until the short side caps it. Both renderers call this, so a desk's icon is the same
 *  size in the editing grid and in the export. */
const ICON_SHARE = 0.46;   // of the long side — the share a square's icon takes
const ICON_ROOM = 0.80;    // of the short side — how much of the depth an icon may fill (E)
function mergeIconSize(w, h) {
  const long = Math.max(w, h), short = Math.min(w, h);
  return Math.max(8, Math.min(long * ICON_SHARE, short * ICON_ROOM));
}

/** A glyph's drawn box: `n` is the nominal size — what a SQUARE icon would measure
 *  either way — and the answer is that much icon, in this glyph's own shape.
 *
 *  A nominal size cannot simply be the height or the width, because a wide glyph then
 *  reads as a different amount of icon than a square one. Taking it as the HEIGHT drew
 *  the double monitor twice as wide as the single monitor beside it (too big on a desk);
 *  taking it as the WIDTH, which is what `.cell__icon`'s flat 46% did in the grid, drew
 *  it half as tall (too small on a square) — and the two renderers disagreed, each
 *  wrong in its own direction.
 *
 *  So the nominal size is the box's WEIGHT: `n x n` worth of area, laid out in the
 *  glyph's ratio (w = n*sqrt(r), h = n/sqrt(r)). A 2:1 glyph is then wider and shorter
 *  than a square one rather than double or half of it, and a square glyph is exactly
 *  `n` as before. The box is then CONTAINED in the room it has — scaled whole, so the
 *  glyph is only ever enlarged or reduced, never stretched. Pass 0 for a free axis. */
function iconWeightK(ratio) {
  return Math.sqrt(ratio > 0 ? ratio : 1);
}
function iconBox(n, ratio, roomW, roomH) {
  const k = iconWeightK(ratio);
  // Only negatives are guarded: callers measure in px AND in squares (pieceNamesHang),
  // and a floor of 1 inflated a 0.23-square icon to a whole square.
  const m = n > 0 ? n : 0;
  const w = m * k, h = m / k;
  const sw = roomW > 0 ? Math.min(1, roomW / w) : 1;
  const sh = roomH > 0 ? Math.min(1, roomH / h) : 1;
  const s = Math.min(sw, sh);
  return { w: w * s, h: h * s };
}

/** True when a box is sitting ON a table: its CENTRE falls inside the table's drawn
 *  box. This is the same centre-in-shape test `tableCoverage` uses for a turned table.
 *  A square the table merely REACHES INTO keeps its own pieces (membership is still
 *  `cellKeys`) — but a piece the reach actually covers is covered like anything else:
 *  its box is not drawn, only its content overlays the table, so a table extended onto
 *  the seams around it reads as ONE continuous surface instead of a slab with desk
 *  boxes stacked on top of it. An unsplit neighbour is unaffected: a half-square reach
 *  never contains that square's centre. */
function tableUnderBox(box, tables) {
  if (!box || !tables || !tables.length) return null;
  const cx = box.x + box.w / 2, cy = box.y + box.h / 2;
  return tables.find(({ box: t }) =>
    t && cx > t.x && cx < t.x + t.w && cy > t.y && cy < t.y + t.h) || null;
}
function boxOnTable(box, tables) { return !!tableUnderBox(box, tables); }

/** True when a set of "r,c" keys exactly fills its bounding box — i.e. the shape
 *  is a plain rectangle, not an L/T/+ with a notch. Both renderers use this to
 *  pick the simple ellipse/rounded-rect path over the drawn-outline one. */
function keysAreRect(cellKeys) {
  const fp = footprintOf(cellKeys);
  return cellKeys.length === (fp.maxR - fp.minR + 1) * (fp.maxC - fp.minC + 1);
}

/** Trace the outer boundary of a set of "r,c" cells into ordered loops of pixel
 *  points, inset inward from the cell edges by `inset`. `rectOf(r,c)` gives each
 *  cell's {x,y,w,h}. Interior seams are skipped, so the loop runs straight across
 *  the gaps between member cells — the shape reads as one connected block. Shared
 *  by the table and merge renderers so an L/T/+ is outlined the same way in the
 *  grid and the export. */
function cellShapeLoops(cells, rectOf, inset = 0) {
  const S = new Set(cells);
  const has = (r, c) => S.has(keyOf(r, c));
  const colX0 = {}, colX1 = {}, rowY0 = {}, rowY1 = {};
  for (const k of cells) {
    const [r, c] = parseKey(k); const b = rectOf(r, c);
    if (!b) continue;
    colX0[c] = b.x; colX1[c] = b.x + b.w; rowY0[r] = b.y; rowY1[r] = b.y + b.h;
  }
  // Directed boundary edges, walked clockwise around each cell; an edge shared by
  // two members appears in both directions and cancels, leaving only the outline.
  const edges = new Map();
  const addOrCancel = (i, j, i2, j2) => {
    const rev = `${i2},${j2}|${i},${j}`;
    if (edges.has(rev)) edges.delete(rev);
    else edges.set(`${i},${j}|${i2},${j2}`, [i2, j2]);
  };
  for (const k of cells) {
    const [r, c] = parseKey(k);
    addOrCancel(r, c, r, c + 1);
    addOrCancel(r, c + 1, r + 1, c + 1);
    addOrCancel(r + 1, c + 1, r + 1, c);
    addOrCancel(r + 1, c, r, c);
  }
  const nextOf = new Map();
  for (const [from, to] of edges) nextOf.set(from.split('|')[0], to);
  // x of a vertical boundary at lattice column j (member to its right → a left
  // edge, inset right; else a right edge, inset left); y likewise for a row.
  const toX = (cellRow, j) => (has(cellRow, j) ? colX0[j] + inset : colX1[j - 1] - inset);
  const toY = (i, cellCol) => (has(i, cellCol) ? rowY0[i] + inset : rowY1[i - 1] - inset);

  const loops = [];
  const seen = new Set();
  for (const startKey of nextOf.keys()) {
    if (seen.has(startKey)) continue;
    let lat = [];
    let key = startKey;
    while (key && !seen.has(key)) {
      seen.add(key);
      lat.push(key.split(',').map(Number));
      const nx = nextOf.get(key);
      key = nx ? `${nx[0]},${nx[1]}` : null;
    }
    if (lat.length < 4) continue;
    // Drop collinear lattice points, leaving only true 90° corners — each then
    // has exactly one horizontal and one vertical incident edge.
    lat = lat.filter(([i, j], idx) => {
      const [pi, pj] = lat[(idx - 1 + lat.length) % lat.length];
      const [ni, nj] = lat[(idx + 1) % lat.length];
      return !((pi === i && ni === i) || (pj === j && nj === j));
    });
    const L = lat.length;
    if (L < 4) continue;
    const pts = lat.map(([i, j], idx) => {
      const [pi, pj] = lat[(idx - 1 + L) % L];
      const [ni, nj] = lat[(idx + 1) % L];
      let x, y;
      for (const [ai, aj] of [[pi, pj], [ni, nj]]) {
        if (aj === j) x = toX(Math.min(ai, i), j);       // vertical edge → x
        else y = toY(i, Math.min(aj, j));                // horizontal edge → y
      }
      return { x, y };
    });
    loops.push(pts);
  }
  return loops;
}

/** Emit a closed loop of points as a rounded path through `sink`
 *  (move/line/quad/close), cutting each corner to radius `rad` (clamped to half
 *  the shorter adjacent edge). Rounds convex and concave corners alike, so a
 *  shaped desk reads like the rounded rectangle a plain one already is. */
function emitRoundedLoop(pts, rad, sink) {
  const n = pts.length;
  if (n < 3) return;
  const D = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const lerp = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n];
    const d01 = D(p0, p1) || 1, d12 = D(p1, p2) || 1;
    const r = Math.min(rad, d01 / 2, d12 / 2);
    const A = lerp(p1, p0, r / d01), B = lerp(p1, p2, r / d12);
    if (i === 0) sink.move(A.x, A.y); else sink.line(A.x, A.y);
    sink.quad(p1.x, p1.y, B.x, B.y);
  }
  sink.close();
}

/** The squares a table covers. Sitting square on the grid it is simply the
 *  table's own SHAPE — the exact squares selected (an L/T/+ keeps its notch, so
 *  a gap stays a free square rather than being swallowed). Turned, it is every
 *  square whose centre falls inside the turned shape — the rough outline the
 *  table now occupies.
 *
 *  `cellKeys` stays the table's BASE shape, which is what the outline is drawn
 *  from. Coverage is derived, never stored, so rotating cannot feed its own
 *  result back in and grow the table each time. */
function tableCoverage(table) {
  const rot = ((table.rotation || 0) % 360 + 360) % 360;
  if (!rot) return [...table.cellKeys];

  const fp = footprintOf(table.cellKeys);
  const members = new Set(table.cellKeys);
  const keys = [];
  // Work in cell units: the base shape lives on the grid at integer cells, its
  // bounding box spanning [minC, maxC+1] x [minR, maxR+1].
  const cx = (fp.minC + fp.maxC + 1) / 2, cy = (fp.minR + fp.maxR + 1) / 2;
  const hw = (fp.maxC + 1 - fp.minC) / 2, hh = (fp.maxR + 1 - fp.minR) / 2;
  // Turn each square's centre BACK into the base shape's own frame, then ask
  // which base cell it lands in — so the test is the union of the member cells,
  // not just their bounding rectangle.
  const rad = (-rot * Math.PI) / 180;
  const cos = Math.cos(rad), sin = Math.sin(rad);

  // Only squares inside the turned bounding box can qualify.
  const ac = Math.abs(Math.cos((rot * Math.PI) / 180));
  const as = Math.abs(Math.sin((rot * Math.PI) / 180));
  const spanX = hw * ac + hh * as, spanY = hw * as + hh * ac;
  const lo = (v) => Math.max(0, Math.floor(v));
  for (let r = lo(cy - spanY); r <= Math.ceil(cy + spanY) && r < state.grid.rows; r++) {
    for (let c = lo(cx - spanX); c <= Math.ceil(cx + spanX) && c < state.grid.cols; c++) {
      const px = c + 0.5 - cx, py = r + 0.5 - cy;
      const bx = (px * cos - py * sin) + cx, by = (px * sin + py * cos) + cy;
      if (members.has(keyOf(Math.floor(by), Math.floor(bx)))) keys.push(keyOf(r, c));
    }
  }
  return keys;
}
