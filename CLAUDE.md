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
- `js/editor.js` — edit pane (single / bulk / preset / split-parent / split-piece /
  merged). **Shared builders are the reference — a pane composes them, it does not
  roll its own.** The header is `renderActions(ctx)` for every pane: Cut, Copy,
  Paste, then Unmerge (only when merged) and Delete apart on the right; Delete is
  always present and Copy/Cut grey out for a multi-select.
  **Rule: every pane that shows a Format row also carries the Split column in it**
  (`splitControlsCompact` — four exclusive-toggle shapes, no None; tap the active
  shape to un-split). `squareSplitControls(rerender, merge?)` builds that column
  for the square at `current.r/current.c`, so a SPLIT PIECE can change its parent's
  split without going back up a level, and a MERGED desk divides the desk itself
  (recording `merge.deskSplit`). The one exception is the **preset** pane: a preset
  has no split in its data model, so its Format row has no Split column.
  Section order for a square: Format (Fill / Facing / Colors / Split) → Content
  (Labels, Icon, Special, Browse under Special) → **Size** (row/column weights),
  gated behind `config.showSizeSection` (Settings → General).
  Other shared builders: `piecesGroup(cell, rerender)` (the Pieces list, used by
  the split-parent AND desk-split-merge panes), `mergeSection(merge)` (Shape /
  Centered + the spans note), `splitSection(cell)` (the BIG split picker, with
  None, for the split-parent pane, which has no Format row), `specialSection`,
  `printerSection`, `fillControls` / `facingCompass` / `squareColors`.

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
  **Selectable + mergeable:** a tap on a split piece toggles it only when NOT
  picking; in select mode (or a Ctrl/Shift gesture) the tap selects the whole
  square (fireTap, js/interactions.js), so a split square can be gathered into a
  selection and merged like any other. **Content moves by hand:** dragging a
  piece (mouse) swaps CONTENT with the slot it is dropped on — piece↔piece,
  piece↔square, square↔piece (`swapContentSlots`, js/state.js); the content drag
  lives in js/interactions.js beside the whole-square/table drags. Mobile uses
  cut/paste (`cutSubcell` + `pasteSquareToSubcell`) from the shared pane header.
  **Pieces merge too** (`cell.submerges = [{id, indices, anchor, kind}]`, js/state.js
  — `addSubmerge`/`removeSubmerge`/`updateSubmerge`/`submergeKind`): pick pieces in
  the split-parent pane's Pieces list and merge them. `kind` mirrors a grid-level
  merge — `'poly'` fills the exact shape of the pieces (`buildSubmergeOverlay` /
  `drawSubmerge`), `'unit'` is ONE 1:1 square centred in their bounding box, so it
  straddles the seams between pieces. A unit takes the rect path in both renderers
  whatever shape it fuses, since only the bbox matters; the grid fills the block
  and `sizeUnitSubmerges` (js/grid.js) squares it off after layout (measured, so it
  holds under "true sizes"), and the export centres the square in the block and
  paints unit anchors LAST so a neighbouring piece cannot paint over them. Its
  furniture is sized to the square's short side. Shape / Centered live in the
  merged-piece pane's Unique section, beside Unmerge in the header, and the Pieces
  list offers the same pair beside "Select to merge" to choose the kind BEFORE
  merging (`submergeKindChoice` → `addSubmerge`'s `kind` argument); a Centered merge
  shows there as a centred square too, so the list matches the chart.
  The Pieces list speaks the chart's mouse language: a plain click fills or empties
  the piece, right-click / long-press edits it, and Shift/Ctrl (or an open selection)
  gathers pieces to merge.
  Under a table a split shows only its pieces' content overlaid (no piece boxes),
  like any covered square (js/export.js).
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
  **Grid-level behaviour** (a merge acts as one unit, not just an overlay): a
  select-mode / Ctrl tap gathers the WHOLE merge (`toggleMergeSelection`), not the
  cell under it; `addMerge` refuses cells already in a merge (no stacking);
  deleting any member expands to the whole merge and clears it (the delete menu +
  `deleteMerge`); a plain tap seats/empties the desk like a square
  (`toggleMergeFilled` / `mergeIsEmpty` — an emptied merge renders as one empty
  region in the grid and draws nothing in the export, content kept); hovering any
  member lights the whole desk (`.merge--hot`). A `unit` merge or a rectangular
  `poly` merge (`mergeCanSplit`) can be **split**: the split lives on the anchor
  cell (reuses `splitCell`/`toggleSubcell`/`openSubcellEditor`) and is drawn across
  the whole desk box by `renderMergeSplit` (grid) / the split branch of `drawMerge`
  (export), both reusing `buildSplitGrid` / `drawSplit`. This desk-split render is
  gated on a deliberate `merge.deskSplit` flag (set only by the merge pane's "Split
  this desk" picker), so **merging a square that is ALREADY split does NOT stretch
  its pieces across the desk** — it uses large-square merge rules, showing the
  anchor's content (`mergeContentOf`) as one desk; the split data is kept and
  editable via the split-parent pane. Under a table a desk-split merge overlays
  EVERY piece's content (no boxes); a plain merge overlays its single content.
  A selected merge shows
  ONE outline over the whole object (`.merge--selected`), not a tick per member
  (buildCell skips per-cell selection on merged cells). Walls are refused on a
  merge's interior seams (`seamInsideMerge`, js/grid.js). Under a table a merge
  shows only its content overlaid, no desk box (js/export.js `drawMerge`). The
  **Unmerge** control lives in the shared pane header (`renderActions`), not the
  Merged-square section, so it is reachable from every pane a merge can open. The
  BULK pane offers **Merge** in that same slot (`renderActions` `onMerge`), opening
  the select bar's own `openMergeMenu` — which now takes an `after` callback, so the
  pane lands on the desk it just made; it is withheld when a selected square is
  already merged, since `addMerge` refuses stacking — that selection gets **Unmerge**
  in the same slot instead, clearing every merge it touches.
  **Special/furniture content** (chair/server/rack/stairs) renders as furniture
  over the footprint with NO desk box, in both renderers: a chair stays a ½×½
  piece tucked to its facing (`chairInBox` export / `renderMergeFurniture` grid),
  a server fills the desk as a rack (`drawServerRack` / `buildServerRack`), and
  stairs tile the member cells with the run's start/middle/end variants and seams
  (`drawMergeStairs` / `renderMergeStairsGrid`, variant via `mergeStairVariant`).
  A desk-split merge keeps its Shape/Centered kind buttons and Pieces list in one
  universal pane (render() routes merged cells through the shared pane, `piecesGroup`
  shared with `renderSplitParent`). A **unit** merge is one live object: its member
  cells are inert (`.cell--merged-inert`) and its centred overlay/furniture host is
  the pointer target (`.merge-unit` / `.merge-furniture--live`, carrying the anchor
  key); the empty surround is a no-op. An emptied merge keeps a faded ghost of its
  content in the grid. Pasting onto a merge writes once to the anchor and fills or
  empties the whole desk (`pasteSquareTo`), so it never shatters or de-centres it.
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
  poly/circle/line op sets. **Crossings are their own piece on export**
  (`wallJunctions` / `junctionType` / `junctionRect`, js/export.js): at every grid
  point where two or more edges meet, a wall-thick square is drawn with the bars,
  outline pass then fill pass, and filled LAST so the joint owns itself rather
  than depending on which bar reached across it. Hollow-to-hollow stays hollow and
  glass-to-glass stays glass — but glass only where the point has just TWO arms,
  a run carrying on or a corner turning; a tee or a cross is more than a pane
  carries. Every other meeting — a wall with anything, glass into hollow, glass at
  a tee or cross, anything involving a door — has no piece of its own and takes a
  plain WALL intersection. Glass and doors are not seamless with anything but
  themselves, so `wallEndJoin` stops them at the point's face ('trim') and the
  point's own outline is what the path terminates against; that trim is also what
  shortens a door to fit BETWEEN the points either side of it. A door or a pane
  standing ALONE still ends on a wall point at each side — an end meeting nothing
  is still an end. The one door end that is seamless is an OPENING meeting another
  door's opening in a straight line (a double door): `doorOpenEnd` reads the same
  hinge bit paintDoor does, so turning a door turns which side can be seamless,
  and `doorsMeetOpening` is what drops the piece between the pair. That point is
  COVERED rather than skipped: `junctionType` returns `'doorseam'`, which the
  export leaves out of the outline and fill passes and patches over AFTER the
  doors, in the door's own fill and only across the point's interior. Otherwise
  the two leaves' abutting end strokes draw one line through the middle of an
  opening meant to read as one. Every other meeting keeps the point's stroke.
  A window's glass is `defaults.windowFill` laid at a fixed half opacity
  (`windowFillColor`, `WINDOW_ALPHA`) — the colour is the user's, the translucency
  is not. Being translucent, the export lays the page under a pane before tinting
  it, or the glass would tint the ink of its own outline pass. `junctionType` /
  `junctionAt` (js/state.js) is the one decision both the ends and the piece read. All-railing meetings get none: those are posts
  (`paintRailingPost`). Glass is ruled in ONE pass clipped to every pane at once
  (junction panes included) — ruling pane by pane double-rules the overlap at a
  joint, and two 30% rules that don't line up land as a dark slash across it.
  Walls mode lives in `js/walls.js` (`#btn-walls` +
  `#wall-bar`): pick a type, click a seam to place, click the wall again / Erase
  to remove.
  **Placing is a hover gesture, not a hit layer** (`updateWallHint`, js/grid.js):
  running the pointer near a seam reveals a slim bar (`.wall-hint`) lying exactly
  where the wall would be drawn, with a + through its middle — the insert guides'
  gesture applied to the seams. `wallEdgeNear` resolves the seam from the square
  under the pointer and its own box (exact under "true sizes"), within
  `WALL_REACH`, and offers NOTHING within `WALL_CORNER_PAD` of a crossing — that
  spot is the junction point's, not either seam's. The bar shows outside walls
  mode too, where clicking it lays a plain wall and steps into the mode. It never
  covers an existing wall: hovering one of those brightens the wall itself
  instead (`renderWalls` wraps each wall in a `.wall-piece` `<g>` keyed by its
  edge; `highlightWall` lights it, `.wall-piece--hot` darkens in light theme and
  lifts in dark). Walls mode also stands the insert guides down, so the outer
  border is reachable as a seam, and squares stop answering the pointer
  (`.chart--walls`).
- **Drag a square — DONE.** Press a square and pull (mouse only; touch keeps its
  scroll meaning, so there is no mobile equivalent yet): it lifts off as a ghost,
  the cell under it is ringed, and letting go runs `swapCells` — an empty target
  receives it, an occupied one trades places, so a drag never destroys anything.
  The whole cell travels, a split square and its pieces included. Lives in
  `js/interactions.js` (window-level listeners while dragging, so it keeps
  tracking past the grid's edge). Merged and table-covered squares are skipped.
- **Move a table — DONE.** A table moves like a square: drag its body, or its
  move grip (✥, shown on hover beside the ✕). `moveTable` shifts it by whole cells
  via `shiftCells`, refusing off-grid or occupied destinations; the grip reuses the
  snapped preview (`attachTableMoveDrag`) and the body drag runs through
  `startTableBodyDrag` (js/grid.js) started from js/interactions.js. **Deleting a
  table keeps the data:** `removeTable` (the ✕) empties the covered squares
  (unseats them, content intact) and leaves them selected in select mode, so a
  second delete clears the content.
- **2-column labels** for the KVM and Dual Monitor icons — a per-row optional 2nd
  column, activating when any row has 2nd-column content. Touches the label data
  model, editor, both renderers, and TSV. (Scoped, not started.)
- **Table creation rework (C1–C4):**
  - **C1 shape-based tables — DONE.** A table now takes the exact SHAPE of the
    selection (an L/T/+), not its bounding box. `table.cellKeys` is the shape;
    `tableCoverage` (js/layout.js) returns those cells directly (unrotated) or,
    turned, every square whose centre falls in the turned union of member cells
    (the turned-rectangle test generalised per-cell). `footprintOf` stays the
    bounding box, still driving the ✕ / resize handles / seat ring. `addTable`
    (js/state.js) seats only the shape, so the notch of an L stays a free,
    editable square. Both renderers branch on `keysAreRect`: a full rectangle
    draws as the old ellipse (round) / rounded-rect (square); a notched shape is
    traced into ONE outline by `cellShapeLoops` (js/layout.js — the shared
    boundary tracer) and drawn as a single stroked path (`buildTableShapeSvg` in
    js/grid.js, the non-rect branch of `drawTable` in js/export.js), so the
    border is one even weight all the way round with no per-edge hooks or gaps at
    concave corners. A table is inset from its cells with rounded corners
    (`emitRoundedLoop`). **Merges share the same tracer** (`renderMerges` /
    `drawMerge`) but draw fused edge-to-edge with square corners (inset 0,
    radius 0) — the tracer is shared so both features get a clean, uniform
    border. **Rotate** turns the WHOLE shape rigidly about its bounding-box
    centre (it does not re-grid cells) — the shape overhangs its footprint,
    matching the export.
  - **C3 Merge button — DONE** (see the Merge entry above; `#btn-table-merge`).
  - **C2 diagonal drag — not built.** Would be a new select-mode gesture (there
    is no drag-to-select today) sweeping an angled band via the turned-rectangle
    test. Deferred; angled tables are reachable now via the rotate control.
  - **C4 selection underlay animation — not built.** A 30%-black underlay with
    per-square tiles scaling out (respect `prefers-reduced-motion`).
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
