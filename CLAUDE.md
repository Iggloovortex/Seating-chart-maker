# Seating Chart Maker — working notes

A web-based seating/desk-chart maker. **Vanilla HTML/CSS/JS, no build step.** It
runs from `file://` with classic `<script>` tags (never ES modules), and can
export itself as a single self-contained `.html`.

**Before building or restyling any UI, read [`STYLING.md`](STYLING.md)** — the
design-token/theme/component baseline so new work matches the rest of the app.

## Working rules

- **Regenerate `js/sources.js` after editing any source file:**
  `python3 tools/gen-sources.py`. It bundles every source as a string for the
  "Export site" feature; forgetting it ships stale exports. (`js/iconlib.js` is
  deliberately excluded — it's the ~1 MB Bootstrap Icons browse catalog; picked
  icons are copied into `state.config.customIcons` and travel with saves/exports.)
- **Test with Playwright** at `/opt/node22/lib/node_modules/playwright/index.js`
  against `python3 -m http.server 8123`. Foreground `sleep` is blocked — background
  the server. Render the chart in-page with `renderToCanvas(dpi).toDataURL()` for
  export screenshots; screenshot `#chart` for the grid.
- **Commit + push early and often.** The remote container resets periodically and
  reverts the working tree to the pushed branch — anything uncommitted is lost.
- `state.config` (theme, custom papers, presets, favicon/title, custom icons) is
  app config: its own pub/sub (`emitConfig`/`subscribeConfig`), its own
  localStorage key, and it must **never** enter `serialize()` (the .seatchart /
  share-link payload).

## Architecture cheatsheet

- `js/state.js` — state + pub/sub (`emit`/`subscribe`/`batch`); config channel.
- `js/grid.js` — DOM grid. `uniformCellSize()` keeps cells a fixed comfortable
  size (not driven by longest/most labels); `fitCellLabels()` shrinks each
  square's text to fit width AND height, per square. Furniture (chair/server)
  rendering + theme-aware label/icon contrast (`surfaceLabelColor`).
- `js/layout.js` — geometry shared by grid "true sizes" and the export.
- `js/export.js` — canvas render (Preview / PNG / Print). Furniture pieces
  (`drawChair`, `drawServer`, `drawServerRack`), `drawLabelBox` (rotated + edge
  anchor), `contrastLabelColor`/`readableInk` (in `js/icons.js`).
- `js/icons.js` — icon registry, imported-SVG sanitizer (`parseIconSvg`),
  contrast helpers.
- `js/iconbrowser.js` + `js/iconlib.js` — searchable Bootstrap Icons library
  (multi-select → Add). MIT; see `LICENSE-bootstrap-icons`.
- `js/settings.js` — tabbed Settings modal (General / Site & export), theme
  toggle wiring, site export. **Mode-bar position** lives here too: the Select
  and Walls bars sit under the toolbar or at the foot of the window, together or
  each on its own (`config.barPosition` = 'top'|'bottom'|'custom' +
  `config.barPositions`), applied by `applyBarPositions` — a bar is a sibling of
  the stage, so it is just which side of it the bar is inserted on.
- `js/editor.js` — edit pane (single/bulk/preset).

## Branch / state

`main` holds everything (integration was merged in). Develop on a feature branch
and push it; don't stack new work directly on `main`.

## Backlog (planned, not built)

- **Split Square — DONE.** A square can divide into halves (side-by-side or
  stacked), quarters, or ninths (3×3). Model: `cell.split = {rows, cols}` +
  `cell.subcells[]` (each a mini cell via `makeSubcell`), in `js/state.js`
  (`splitCell`/`unsplitCell`/`updateSubcell`/`toggleSubcell`, carried by
  serialize/copy-paste). Rendered by `buildSplitGrid`/`buildSubcell` (grid) and
  `drawSplit` (export); a piece is tapped to fill and long-press/right-click (or
  the Pieces list) to edit via `openSubcellEditor`. TSV is lossy for splits.
  Splitting a square that already holds something keeps it — the content moves
  into the first space. The piece editor has Copy/Paste (`copySubcell` /
  `pasteSquareToSubcell`), which is how content moves between a whole square and
  a split space. **Special icons in a split space** follow `FURNITURE_MIN_SPACE`:
  a chair still draws as furniture down to a ninth (just smaller); a server IS a
  half-slab, so a split space is already that size or less and it renders as the
  plain filled space. Any special icon added later gets an entry — give it the
  space its piece needs, and anything smaller acts like a normal square.
- **Merge — DONE.** Two kinds, from the `#btn-table-merge` menu on a ≥2-square
  selection: `'poly'` fuses the selection into one desk of its exact shape (L/T/+,
  a single outline, labels across the widest run, icon in the slimmest cell) and
  `'unit'` is one 1:1 square centred in the block (straddles seams). The anchor —
  the square whose content the fused desk shows — is the first one that HAS
  content (a split square counts, via `cellHasAnyContent`; `mergeContentOf` then
  reads the piece holding it), falling back to first-in-reading-order when
  several or none do. Model:
  `state.merges = [{id, keys, kind, anchor}]`,
  remapped/pruned alongside tables in insert/delete/move/setGrid and carried by
  serialize. Geometry `mergePlan` (js/layout.js); grid overlay `renderMerges`
  (SVG fill+outline, gaps bridged) and export `drawMerge` keep parity. Tap a
  merged cell to edit the anchor; the pane's Merged-square section switches
  kind / unmerges.
- **Walls — DONE** (branch `claude/walls-tmdavo`). Edge objects on the seams
  between squares and the outer border, styled from user-supplied reference SVGs.
  Every type is a bar one cell long and `WALL_THICK` (0.0909u) thick, outlined at
  `WALL_STROKE` (0.0295u) — proportions measured off the reference SVGs. The
  export draws every wall measure scaled by `WALL_OUT_SCALE` (0.5, opted into
  with `out: true`): at full weight a wall centred on a seam buries the 0.03u
  borders of the squares either side, so the thin version keeps the layout
  readable. It is the one dial for how heavy exported walls look. A RAILING uses
  `RAIL_OUT_SCALE`, which on export equals `WALL_OUT_SCALE`: that makes its end
  posts exactly a wall thick and its slim shaft half of that, so a rail tucks
  inside a wall's footprint. The editing grid keeps railings at full weight,
  where they have room to read.
  Colours are chart-wide (walls are not individually selectable) and serialized
  with the other defaults. The UNIVERSAL pair — `wallFill` / `wallBorder`, used
  by wall, hollow and window — is the 4th section of the toolbar's Default
  Colors; railings (`railFill`/`railBorder`, grey on black) and doors
  (`doorFill`/`doorBorder`) have their own swatches beside their buttons in the
  Walls bar, which is divided into sections: [Wall|Hollow] [Window]
  [Railing+colours] [Door+colours] [Erase|Clear]. Read via `wallFillColor()` /
  `wallInkColor()` / `railFillColor()` / `railInkColor()` / `doorFillColor()` /
  `doorInkColor()`; `fadeInk(hex, a)` makes the faded marks (a door's swing arc,
  a window's hatch). A window keeps its `#d8feff` glass tint AND is ruled with a
  faint 30%-opacity `/ / /` hatch (`paintWindowHatch` + `hatchSegments`, shared
  by both renderers) so it reads as glass at a glance.
  RAILING junctions (`railingJoin`): a straight run meets end post to end post;
  a turn, tee or multi-way meeting gets the octagonal post instead, turned an
  eighth so its top, bottom, left and right are flat faces squared to the grid.
  A railing stops short of anything that is not a railing, so it never runs into
  a wall or a door.
  RIGHT-CLICK crosses the modes: in walls mode it steps back out and edits the
  square under the pointer; on a wall from outside walls mode (hit-tested by
  `wallAtPoint`, since the wall layer is pointer-transparent) it steps in.
  **Two looks, one geometry** (`wallBar`, js/layout.js): the editing grid draws
  45° **bevelled** ends so perpendicular runs miter at corners; the export draws
  **square** ends and, where the neighbouring collinear edge carries the SAME
  type, drops that end cap entirely (`wallNeighbors` → `capA`/`capB`), so a row of
  hollow walls stays hollow end-to-end and solid walls read as one unbroken run.
  Uncapped ends bleed half a stroke past the seam so no hairline shows.
  Types: `wall` (grey `#909090` fill + black outline), `hollow` (outline only),
  `window` (hollow + light-blue `#d8feff` tint), `railing` (`paintRailing` — an
  outlined dumbbell: full-thickness end posts, half-thickness shaft, 45° chamfer
  between, `#343434`), and `door` (`paintDoor` — a brown `#6c4c00` frame, a hinge
  RING of mid-radius 0.0424u, and a 45° swing leaf the length of the opening and
  the width of the wall, outlined at 46% opacity). A door carries an orientation
  (0..3 = hinge end × swing side); clicking a placed door cycles it — its rotate
  and flip. Model: `state.walls` is a map, key `"h:r,c"` (top edge of cell r,c) /
  `"v:r,c"` (left edge); the value is a type string, or `{t:'door',o}` for a door
  (`wallTypeOf`/`wallOrient`/`normalizeWallValue` read either shape). Remapped and
  pruned on insert/delete/setGrid, carried by serialize (Clear Grid keeps walls;
  New clears them). `wallSegment` takes the grid's `gap` (0 in the gapless export)
  so both renderers sit on the true seam. The grid overlay `renderWalls` (SVG) and
  the export `drawWalls` (canvas) share all painting via matching
  poly/circle/line op sets. Walls mode (`js/walls.js`, `#btn-walls` + `#wall-bar`)
  shows an interactive edge layer (`renderWallEdges`); pick a type, click a seam
  to place, click again / Erase to remove.
- **Drag a square — DONE.** Press a square and pull (mouse only; touch keeps its
  scroll meaning, so there is no mobile equivalent yet): it lifts off as a ghost,
  the cell under it is ringed, and letting go runs `swapCells` — an empty target
  receives it, an occupied one trades places, so a drag never destroys anything.
  The whole cell travels, a split square and its pieces included. Lives in
  `js/interactions.js` (window-level listeners while dragging, so it keeps
  tracking past the grid's edge). Merged and table-covered squares are skipped.
- **2-column labels** for the KVM and Dual Monitor icons — a per-row optional 2nd
  column, activating when any row has 2nd-column content. Touches the label data
  model, editor, both renderers, and TSV. (Scoped, not started.)
- **Table creation rework (C1–C4):** build tables from the *shape* of the
  selected squares (`cellKeys` becomes the shape; `footprintOf` stays the bounding
  box for handles/hit-testing); diagonal drag through the same turned-rectangle
  test `tableCoverage` uses; wire the still-inert **Merge** button
  (`#btn-table-merge`) to union picked tables / build from selected squares; a
  30%-black selection underlay beneath the table with per-square tiles scaling
  out (respect `prefers-reduced-motion`). Open question: once a table can be an
  L/T, does "rotate 45°" turn the shape's cells or the bounding box? (Recommend
  the shape's cells.)
- **Tutorial line + cycling shortcut bar** — move the hint top-left under the
  icons plus a cycling bottom bar. **Blocked** on an edited keyboard-shortcut table.
- **Exported background colour in Default Colors** — DONE (it lives at the top of
  the Export window instead).
- **Dense-rack corner icon** — minor: on server racks of 6+ the upright corner
  icon spans ~1.5 slabs; could scale it to sit within the first slab.

## Local-only notes

Keep personal/scratch notes in `CLAUDE.local.md` (git-ignored). Note that the
container reset wipes untracked files, so anything you want to survive a reset
must be committed here instead.
