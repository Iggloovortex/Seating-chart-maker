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

## OPEN — the one that matters

**"Tables not overlaying over merge and split … tables should be on top most."**
The user sent two screenshots (grid + export of the same real chart) saying *"this
is what i meant"*, and the session ended before it was resolved. **Ask before
building.**

What the screenshots show, both renderers alike: a large black table with blue
desks around its edge (`CBS-568506`, `CNDGFX-VT01`, two `CBS-` monitor desks, four
chairs, a `Writer` desk at the left). The desks are drawn as **boxes on top of the
table**; only the middle square shows the table's own black fill with its content
(`CBS-565329`) overlaid.

Two readings, and they need opposite work:
1. **The desks are genuinely covered** (inside `table.cellKeys`) and should be
   showing content-only over one continuous table surface — in which case coverage
   is being computed or rendered wrong for merges/splits at the table's edge.
2. **The desks are NOT covered** (they sit beside the table, not on it) and the
   user wants the table's surface to read as continuous *underneath* them anyway —
   which is a design change, not a bug fix.

Get the user's `.seatchart` for that chart, or ask which desks they consider "on"
the table, before touching either renderer.

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
