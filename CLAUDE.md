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
  toggle wiring, site export.
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
- **Merge (planned, next):** two options — (1) polygon table from the *shape* of
  the selection (L/T/+: labels across the widest run, icons in the slimmest); (2)
  a single square centred across N cells, kept 1:1. Wire `#btn-table-merge`.
- **Walls (planned):** edge objects drawn on the seams between squares. Kinds
  from the reference: solid wall (filled black), hollow wall (double outline,
  white interior), railing (line with a smaller inner line of another colour),
  door (a wood/brown panel set in a wall gap with jamb lines), window (a gap
  spanned by thin light-blue double lines). New edge-based model + both renderers
  + editor + serialize.
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
