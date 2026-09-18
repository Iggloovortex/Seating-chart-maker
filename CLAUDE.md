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

**True sizes are always on.** `state.showTrueSizes` starts true and the toolbar's
"True size" toggle is gone, so the editing grid always previews the weighted
row/column layout. The flag stays in state (saved views and history carry it) and
"Reset sizes" stays in the toolbar; Settings → General still gates the edit pane's
Size section (`config.showSizeSection`).

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
  merged-piece pane's Unique section, beside Unmerge in the header, and and in the Pieces
  list's bar, which follows WHAT is picked: loose pieces get **Merge** alone (the kind
  is chosen afterwards, by looking at the result); a picked MERGED piece gets Shape /
  Centered reading and writing that merge's own kind, plus **Unmerge** in Merge's
  place. A Centered merge shows in the list as a centred square too, so it matches
  the chart.
  **The Pieces list is a tile grid, explicitly placed.** Every piece is given its own
  `gridColumn`/`gridRow`, and each ROW carries a hidden tile-shaped spacer
  (`.piece-rowspacer`) in its first column. A row normally takes its height from an
  ordinary tile's `aspect-ratio: 1`, so a row a merge covered end to end had nothing to
  size it and collapsed to the height of its caption — a 1×3 merge came out 388×22
  instead of a tile square. Rows cannot simply be given `var(--piece-tile)`: that is a
  share of the grid's WIDTH, while a row percentage measures the grid's HEIGHT, which is
  the thing being decided. The spacer is measured in the tiles' own units, so a merged
  row lines up with a plain one exactly, gaps included — and the spacers are why the
  placement has to be explicit, since they take a cell and auto-placement would push
  every piece along by one. A merged piece then sits in a `.piece-block` spanning its
  tiles, and **a Shape (poly) merge is traced, not boxed** (`paintPieceShape`, the
  pane's twin of `buildSubmergeOverlay`): a fill per member piece and an outline on the
  edges facing out of the merge, over the bounding box the block occupies. A plain
  button filling the block IS the bounding box, so an L or T covered the free pieces in
  its own notch — they could be neither seen nor clicked, and the list stopped matching
  the chart. The block and the button are `pointer-events: none`; only the traced shape
  and the content answer the pointer, and their clicks bubble to the button, so a free
  piece under the bbox is reachable (hit-tested: an L's three cells answer as the merge,
  the notch as its own piece). A selected poly shows the accent on its outline rather
  than an outline round the bbox.
  **A Centered merge is drawn there too, not boxed.** Its square is centred in the
  BOUNDING BOX, which on a notched shape reaches over a piece the merge does not own —
  the chart is right to draw it there (the surround is bare), but a LIST cannot, because
  the pieces it is listing are the thing being covered. So the list shows the merge's
  real footprint faintly and the centred square solid inside it, clipped to the pieces
  the merge actually holds: the same object, minus the overhang, and the free piece
  stays visible and clickable. A rectangular Centered merge is unaffected — there is
  nothing outside its own footprint to clip — and a 1×3 reads as it does on the chart,
  one tile centred in a faint three-cell run. `.piece-btn--unit` must NOT carry
  `aspect-ratio: 1` any more: the square is drawn in the SVG now, and sizing the button
  square instead forced the whole ROW square (a 1×3 block came out 388×388). **The chart
  and the export are unchanged** — this is a pane-only accommodation, by request.
  The Pieces list speaks the chart's mouse language: a plain click fills or empties
  the piece, right-click / long-press edits it, dragging one onto another swaps their
  content (`attachPieceDrag` → `swapContentSlots`, the pane's twin of the chart's
  content drag), and Shift/Ctrl (or an open selection) gathers pieces to merge.
  **A piece's text and icon are struck from a whole CELL, then shrunk only as far as
  the piece requires** — in BOTH renderers. The grid does it in `fitSubcellLabels`
  (which sizes the icon FIRST, since at its CSS size an icon is a share of the piece's
  WIDTH and on a wide, short piece measured taller than it will be, squeezing the
  labels to the 6px floor); the export passes `drawSplit`'s `cellRef` as `drawContent`'s
  `base`, since sizing off the piece's own short side gave a half-height piece
  half-height text however much room it needed. `renderMerges` re-runs
  `fitSubcellLabels` because a DESK split is built there, after the grid's own pass —
  without it those pieces keep the CSS icon ceiling and the CSS 9px labels.
  `fitText` truncates against the axis the text runs along (height when turned a
  quarter), so a turned label is not cut to the box's width.
  An ICON is the exception: it keeps the share of its own BOX that a square's icon
  takes of the square (`ICON_FRAC`, js/grid.js — `.cell__icon`'s 46% as a number; the
  `s`-based branch of drawContent), so a piece reads like a small square rather than a
  magnified one. Text is struck from the cell, the icon from the piece.
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
  cell under it; `addMerge` ABSORBS any merge the selection reaches into — those merges are
  dissolved and their whole footprints join the new one, so merging a desk with the
  squares beside it is one gesture rather than unmerge-then-merge (a merge is one
  object, so its every cell comes along even when only part of it was picked);
  deleting any member expands to the whole merge and clears it (the delete menu +
  `deleteMerge`); a plain tap seats/empties the desk like a square
  (`toggleMergeFilled` / `mergeIsEmpty` — an emptied merge renders as one empty
  region in the grid and draws nothing in the export, content kept); hovering any
  member lights the whole desk (`.merge--hot`) and never the cell under the pointer:
  `.cell--merged`'s hover has to out-weigh `.cell:not(.cell--on):hover`, which is a
  class heavier, or a unit merge's exposed surround paints itself and reads as a live
  empty square. `setHoverMerge` lights `.merge-furniture` too, since a desk whose
  content is a chair or rack has no `.merge-unit` to light. A `unit` merge or a rectangular
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
  **A notched desk keeps only its own squares.** The `.merge-shape` `<svg>` covers the
  merge's bounding box, so it is `pointer-events: none` and its traced PATH alone
  answers the pointer: an L or T no longer commands a rectangular click box over the
  free square in its notch, while the path still bridges the gaps between member
  cells so a tap on an internal seam lands on the merge. A server RACK is a plain box
  that fills the desk, so it is clipped to the merge's true shape in both renderers
  (`clipHostToMerge` grid / `clipToMergeShape` export, both reusing `cellShapeLoops`)
  — a clipped region is neither painted nor hit-tested. Note the rack is laid across
  the bounding box, so on an L the clip visibly cuts the slabs that reach into the
  notch.
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
  exactly one whole merge and nothing else (there is nothing to grow it with);
  otherwise Merge grows the merge it touches. **Unmerge** appears in the same slot
  whenever the selection contains a merge, so a merge picked with its neighbours
  shows both. A menu raised from the pane must be `.merge-menu`-styled at z-index 70
  like the delete/preset menus, or it opens BEHIND the pane and the button reads as
  doing nothing.
  **Special/furniture content** (chair/server/rack/stairs) renders as furniture
  over the footprint with NO desk box, in both renderers: a chair stays a ½×½
  piece tucked to its facing (`chairInBox` export / `renderMergeFurniture` grid),
  a server fills the desk as a rack (`drawServerRack` / `buildServerRack`), and
  stairs tile the member cells with the run's start/middle/end variants and seams
  (`drawMergeStairs` / `renderMergeStairsGrid`, variant via `mergeStairVariant`).
  A desk-split merge keeps its Shape/Centered kind buttons and Pieces list in one
  universal pane (render() routes merged cells through the shared pane, `piecesGroup`
  shared with `renderSplitParent`). A **unit** merge is one live object: its centred
  overlay/furniture host is the pointer target (`.merge-unit` /
  `.merge-furniture--live`, carrying the anchor key) and a TAP on the empty surround
  is a no-op. The surround is still pointer-ABLE, though (`.cell--merged-inert` no
  longer kills pointer events; `pointer.unitSurround` in js/interactions.js suppresses
  the tap instead), so the whole footprint can be grabbed for a drag or right-clicked
  into the pane — the centred square is only a fraction of a wide desk, and requiring
  the press to land on it is what made a 3-cell-or-wider unit merge impossible to
  pick up. An emptied merge keeps a faded ghost of its
  content in the grid. A merge drags on FILLED-or-content (`!mergeIsEmpty(m) ||
  cellHasAnyContent(anchor)`), matching a plain square's `enabled || content` —
  reading content alone left a blank desk unmovable. Pasting onto a merge writes once to the anchor and fills or
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
  **A wall CROPS to a thinned row or column, it does not shrink into it.** `u` in
  `wallSegment` — the unit every wall measure is struck from (thickness, outline,
  bevel, the lot) — is a FULL square (`layoutUnit()`), not the square beside it. Taking
  it from the shrunken cell scaled the whole bar down, so a wall crossing a 0.35 row
  drew a third as thick as its neighbours and read as a different object. Only the
  bar's LENGTH (`a0..a1`) follows the cell, which is the cropping.
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
  scroll meaning, so there is no mobile equivalent yet). **A mouse does not arm the
  long-press** (js/interactions.js): the hold belongs to the drag — press, hold, then
  pull has to pick the square or desk up, and a timer firing mid-hold would open the
  pane instead and kill it. Right-click is the desktop way into the editor; touch
  keeps long-press, where there is no right-click and no drag. it lifts off as a ghost,
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
- **Floating labels on small squares — DONE.** A square holding a special icon
  (chair / server / stairs) takes its row/column weight like an empty one instead of
  claiming a full unit, and its name hangs in a band BELOW it. Before this, every
  filled square claimed a full unit, so a walkway row could not close up: the empty
  spaces beside a chair shrank while the chair's square did not, leaving the row
  ragged. "Option A" — the icon shrinks with the square, no per-kind floor.
  **The two halves are one feature:** the square may shrink *because* the name has
  somewhere else to go. Splitting them (shrink only when there are no labels) makes
  the whole thing useless for the case that prompted it, a named chair in a walkway.
  Model: `line.float` per label line — **on unless turned off** (`float !== false`), so
  a named chair shrinks out of the box — plus `config.floatLabels` (Settings → General,
  "Labels on small squares") and `config.reserveFloatSpace`.
  `floatsOutside` / `anyLabelFloats` / `canFloatLabels` / `rectIsShrunk` / `layoutUnit`
  / `FLOAT_BAND` (js/layout.js) are the one decision both renderers read: a line hangs
  out only when the setting allows it, the line is not opted out, AND the square really
  has no room. `sizedByWeight` is now simply "is it a special icon" — any of them takes
  its row/column size. **Keeping a name inside does not force a full square:**
  `floorUnits` / `labelRoomUnits` give the square a FLOOR of the room its kept-inside
  text needs (the piece's half plus its stack), so the row extends just far enough to
  hold the text — one line thins to 0.74 of a square, two to 0.92, rather than jumping
  back to 1. A server RACK is excluded from floating (`canFloatLabels`) — its names live
  in its own slabs.
  **Overlap or hold the space** (`config.reserveFloatSpace`, the second toggle): by
  default a hung name lies over whatever is beneath it, which is wanted — the layout is
  spaced by hand. Turned on, `reserveUnits` makes the column's WALK advance by
  `FLOAT_BAND` past a floating square while the square keeps its own height, so the
  next row is pushed down and nothing overlaps. It is the advance that grows, never
  the square.
  Both renderers hang names identically: `hangingLabelBox` (export) collected during
  the draw and painted LAST (step 6 of renderToCanvas) so the next row cannot bury it;
  `hangLabelsBelow` + `.cell--floatlabel` (grid), which lifts the cell's
  `overflow: hidden` and raises it above its neighbours.
  **A hung name is the STANDARD label band reaching past the square's edge** — not a
  placement of its own. `hangingLabelBox` takes the same facing step `chairLabelBox`
  does, starts at the same place (the PIECE's edge, so a floated name sits the same
  distance from its icon as one kept inside — measured 4.3 vs 4.9px) and keeps the same
  edge anchor, so it stays centred on its square. Only its far edge moves outward, and
  only on the axis the square is short of: a side-facing name keeps the standard far
  half beside the piece and grows its run past the top and bottom; an up/down facing one
  steps just outside that edge. `drawLabelBox` truncates against whichever axis the text
  RUNS along, which is why the RUN has to grow rather than the depth.
  **Both bands measure off the PIECE, not an assumed half** (`chairLabelBox`'s `size`,
  `chairPct` in the grid): the piece is capped by its square now, so on a thinned square
  it is MORE than half and a band pinned to the half ran underneath it.
  A hung name also turns with its square's facing, and is contrasted against the PAGE
  rather than the square's fill, because that is where it sits — `labelColorOnBg` in the
  export, `surfaceLabelColor` in the grid.
  In the editor the colour drags from its own SWATCH (`attachLabelDrag`'s `deferred`
  mode, which waits for travel so the picker still opens) and the freed grip is the
  per-line **Float** toggle (`floatToggle`); the printer row drops the grip entirely,
  since its labels draw inside its own overlay.
  **The swatch is not an inert handle.** It carries `bindColorInput`'s input/change/
  **blur** listeners and `enhanceColorInput`'s click-to-open popover, so a drag from it
  has to stand all three down: `input.dataset.dragging` / `dragged`, read by
  `colorInputBusy` (js/editor.js) and by the popover's `open` (js/colorpicker.js).
  Without that, `blur` fires as the drag ends and writes the dragged-FROM colour back
  over the line the reorder just gave it — the source colour survives and another is
  lost.
  **Float is only offered where it can act** (`floatApplies`, js/layout.js): a special
  icon that can shrink. An ordinary desk never shrinks, and a server RACK keeps its
  names in its slabs, so neither shows the control rather than showing a dead one.
  **A DESK SPLIT's pieces float too**, and both renderers had to be let at them: the
  export now passes its deferred `hanging` list through `drawMerge` into `drawSplit`
  (without it a merged desk's names simply stayed inside), and in the grid
  `renderMergeSplit` marks the overlay `.merge-split--floatlabel` when any piece floats
  — the overlay AND the `.cell__split` inside it both clip, so the bands were built and
  then cut off, and the overlay is raised so a name may lie over the squares beside the
  desk. That is `.cell--floatlabel`'s licence, given to a desk.
  **A split PIECE always shows it**, because a piece is already a small square: both
  renderers hang its name outside the PIECE (`buildSubcell`'s float branch + the
  `hanging` pushes in `drawSplit`, for a plain piece and a furniture one alike), so it
  is never shrunk into the piece or laid over its own icon.
  **Float's whole rule is "outside, in the standard place".** A hung name takes the
  SAME band, on the side the facing implies, at a full cell's text — the only thing
  float changes is that the band starts at the piece's own edge and reaches past it. It
  is ALLOWED to lie over the pieces and squares around it; that overlap is the point
  (the layout is spaced by hand), so nothing may move a name somewhere else to avoid
  it. Steering a piece's name by WHERE it sat rather than its facing, narrowing the
  band to the columns beside it, or shrinking it to fit a run were all tried and are
  all wrong — a name in an unexpected place is worse than a name over a neighbour.
  What a PIECE does need is its own edge as the band's start: a plain piece's content
  fills it, so `hangingLabelBox`'s `size` is the box's extent along the facing axis
  (`min(w, h)` put the band mid-piece on an oblong one) and the grid passes
  `startPct = 100`, which is the same thing in percentages. In the grid the band also
  carries `z-index: 6` while `.subcell--floatlabel` carries NONE — a positioned box
  with a z-index opens a stacking context, and the band inside it could then never
  rise above the next piece, which paints later and buried it. The export paints every
  hung name last (step 6) for exactly the same reason.
  **A SERVER's slab is capped the same way** (`slabDepth`): half a full square along the
  axis it faces, never more than the square itself, so a slab in a thinned walkway fills
  its depth. The name then gets whatever the slab LEFT, which is no longer simply the
  other half once the cap has bitten — both renderers compute the remainder rather than
  assuming a half.
  **A chair never shrinks further than its square already has** (`chairSize`,
  js/export.js): half a FULL square, capped by the square it is in. So a chair in a
  0.35 walkway fills the walkway's depth instead of taking half of it, a mild squeeze
  (0.7) leaves it untouched, and a full square is exactly as before. `chairSize` takes
  a `unitOverride` because a full square means different px in each renderer — the grid
  insets every square by `CELL_GAP` and the export does not, so each passes its own
  figure and neither's full-size chair changes. The grid also measures the tile against
  the ELEMENT's box rather than the layout rect (`placeChairTile`): the CSS 50%/50% is
  half of EACH axis, which on a thinned square is not a square at all but a wide bar.
  - **Not built:** stairs tile a whole cell, so a stairs square squashes into a band;
    excluding stairs, or a per-kind floor, is the fix if that reads badly.
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
    (`emitRoundedLoop`). That inset is `TABLE_INSET` (js/layout.js), a fraction of
    ONE CELL's short side — the one dial for how much transparent padding a table
    keeps. Measuring it off a cell is what makes the gap read the same at every
    table size and keeps the two renderers in step: the grid used a flat 6px while
    the export took 6% of the TABLE's short side, so a 2×2 exported with twice a
    1×1's gap and neither matched the grid. **Merges share the same tracer** (`renderMerges` /
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
