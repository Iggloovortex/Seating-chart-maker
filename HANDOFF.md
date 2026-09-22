# Handoff — table rework session

Branch: `claude/table-rework-t0cpjy` (pushed, working tree clean).
Read `CLAUDE.md` first — every finished item below is written up there in detail.
This file is only the *live* state: what landed, what is open, and what not to
repeat.

## How to run and test

```bash
python3 -m http.server 8123 &            # background it; foreground sleep is blocked
python3 tools/gen-sources.py             # after editing ANY source file
node <script>.js                         # Playwright at /opt/node22/lib/node_modules/playwright
```
Grid: screenshot `#chart`. Export: `(await renderToCanvas(150)).toDataURL()`.

## Landed this session

| Commit | What |
|---|---|
| `e8a1119` | Tables can stop on a split square's seam (fractional `table.edges`) |
| `276225c` | That edge is anchored on the neighbour's box, so grid and export agree |
| `c97c9d4` | Fixed the west/north resize handles (they did nothing at all) |
| `dbdf7c0` | A table can shrink to 1/2, 1/3 or 2/3 of a square (same edge, negative) |
| `74b70fd` | *(superseded by `eead590`)* covered merge suppressed its desk box |
| `dc2336a` | Drags work in every mode; a table's body drags what sits on it |
| `eead590` | A merged desk layers like a plain cell, so it sits under a table |
| `2823460` | A centred merged piece no longer paints over a table |
| `e9f3cab` | Wall bar's window swatch matches its neighbours |

## RESOLVED after the handoff was written

The screenshots meant: **the table was extended 1/2 in three directions onto the
seams, and the split pieces it reached over drew their desk boxes on top of the
extension**, so the table read as a slab with desks stacked on it. Reproduced
exactly (`reach.js` in the scratchpad), fixed in `01e3f48` + follow-up: a piece
whose CENTRE falls inside the table's drawn box is covered — no box, content
overlaid, text inked against the table. `tableUnderBox` (js/layout.js) is the
shared decision; `drawSplit` reads it in the export, `markPiecesOnTables` in the
grid. Membership is untouched.

Still worth a look: the table's own seated square keeps its blue outline ring
showing through the 80%-opacity table. That matches a plain covered square, so it
was left alone — confirm with the user if it reads wrong on their dark charts.

## OPEN — smaller

- **Covered split piece labels, export only.** In the export a covered split
  piece's label renders small in the piece's corner; the grid draws it at
  cell-struck size (`fitSubcellLabels`). `CLAUDE.md` says text is struck from the
  CELL in *both* renderers, so the export looks wrong. Pre-existing — nothing in
  this session touched `js/export.js`. Reproduce with `sm.js` in the scratchpad
  (cases C and D).
- Backlog items in `CLAUDE.md` that were never started: 2-column labels, C2
  diagonal drag, C4 selection animation, tutorial line, dense-rack corner icon.

## Do not repeat these

- **`elementFromPoint` / `elementsFromPoint` cannot tell you paint order.** They
  skip `pointer-events: none` elements — which is what tables (`.table-shape`),
  merge overlays and float bands all are. Two hit-tests in this session gave
  confident wrong answers. Use pixels, or compare computed geometry.
- **`.table-shape` is `opacity: .8` on the editing grid, on purpose.** Everything
  under a table shows through it. A faint seam or fill visible "over" a table is
  usually *through* it and is not a bug. Recolour the suspect element and see if
  the line follows before concluding anything.
- **Suppressing a box under a table is the wrong fix in the GRID.** It was tried
  (`74b70fd`) and made a covered merge the only thing with no outline ring. The
  grid layers: box under the table, `.cell__content` (z 2) above it. The EXPORT is
  the one that drops boxes, because there a table is solid.
- **Never give a merge/split wrapper a `z-index`.** It both ties with the table
  (z 1) and opens a stacking context that traps its own content underneath. Three
  separate bugs in this session came from exactly that (`.merge-*`,
  `.merge-split--floatlabel`, `.subcell--unit`). Order by DOM instead.
- **Verify the scene you claim to verify.** A "byte-identical export" check was
  cited for a case the test scene did not contain.
