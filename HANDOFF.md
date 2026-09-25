# Handoff — table / icon / targeting session

Branch: `claude/table-rework-t0cpjy` (pushed, working tree clean).
Read `CLAUDE.md` first — every finished item below is written up there in full.
This file is only the *live* state: what landed, what is open, and what not to
repeat.

## How to run and test

```bash
python3 -m http.server 8123 &            # background it; foreground sleep is blocked
python3 tools/gen-sources.py             # after editing ANY source file
node tools/tests/targeting.js            # 16 gesture cases — run after touching hit-testing
node tools/tests/piece-labels.js         # 9 cases: does a piece keep its name in? both renderers
node tools/survey/survey.js [outdir]     # every case, grid vs export, as a share of a square
node tools/survey/lineheight.js [outdir] # the line-height picture (grid beside export)
```
Playwright lives at `/opt/node22/lib/node_modules/playwright/index.js`.
Grid: screenshot `#chart`. Export: `(await renderToCanvas(150)).toDataURL()`.
Anything in the scratchpad is wiped by a container reset — commit what matters.

## Landed this session

| Commit | What |
|---|---|
| `e8a1119`…`dbdf7c0` | Fractional table edges: a table stops on a split's seam, and shrinks by the same edge reversed |
| `dc2336a` | Drags work in every mode; a table's body drags what sits on it |
| `eead590` `2823460` | A merged desk (and a centred merged piece) layers like a plain cell, so it sits under a table |
| `01e3f48` `e9ecf26` | A table's reach covers the split pieces it extends over |
| `cc55c12` | A merged server with no names fills its desk instead of shrinking to one square |
| `f428b22` | Thirds splits (1×3 and 3×1) between Stacked and Quarters |
| `cf50119` | The icon/text survey chart + measurement pass (`tools/survey/`) |
| `10b0046` `a6d3507` `865d5bb` | A desk's icon cap follows the desk; an icon declares its shape in its viewBox; the double-monitor glyph rebuilt in both copies |
| `e5afaad` `62a4253` | Icons scale to fit, never stretch — and a size is the glyph's WEIGHT, not an axis |
| `ce3d38c` | A table owns the click over its whole area; walls inside a table are half-weight dividers; clicking a wall from outside walls mode lifts it |
| `8b3c15a` | `targetAt` — one hit test for every gesture |
| (this push) | A piece keeps its names inside until they would be too small to read; two-renderer survey; line-height picture |

## OPEN — the biggest one: the universal icon & text pass

The user asked for a chart of every rendering case, then "determine and eliminate
the differences between them all… a full pass for completion". Where it stands:

**Done**
- Icon SHAPE and WEIGHT (`iconBox`) — single vs double monitor match to 1.000.
- **Piece labels: decided and built.** User's rule: *a piece's name stays inside
  until either the label or the icon gets too small for human readability.*
  `pieceNamesHang` (js/layout.js), grid and export agree on all 9 cases in
  `tools/tests/piece-labels.js`.
- **The survey now measures BOTH renderers** (`node tools/survey/survey.js [out]`),
  every size as a share of one full square so the columns compare directly.
- **Line height is drawn, not just numbered** (`node tools/survey/lineheight.js
  [out]`) — each case's two lines, grid beside export at the same font, line
  boxes outlined. Sent to the user; they wanted to SEE it before deciding.

**What the two-renderer survey found** (grid vs export, share of a square):
- **Text size AGREES** at full size (0.150 vs 0.148). An earlier 8% "difference"
  was the survey dividing the grid by its layout unit, which includes the 8px
  `CELL_GAP` — measure a drawn `.cell`, never `layoutUnit()`.
- **Line height DISAGREES**: export is 1.22× the font everywhere (`BASE_LINE /
  FONT_OF_LINE`). Grid: square & merge 1.15 (`.cell__labels`), piece 1.10
  (`.subcell .cell__label`), chair ~1.23 and rack `normal` — those two sit outside
  `.cell__labels` and inherit the keyword, which is why the old survey read `NaN`.
  **Needs the user's call on the reference** — the picture is what they asked for
  in order to make it. Recommendation: the export's 1.22, since the grid previews
  the export — one variable on `.cell__labels`, `.cell__furniturelabels` and
  `.cell__rackunit` would do it.
- **ICON size DISAGREES, and it is the biggest gap**: the export draws icons
  ~30–40% larger than the grid on squares, pieces and merges alike (square: grid
  0.425 vs export 0.58 labelled / 0.60 alone). The grid is `.cell__icon`'s 46%
  capped at 38px; the export is `plan.iconFrac` (labelled) or 0.6 (alone). Same
  decision needed as line height: which renderer is the reference.
- **Piece text in thirds**: the grid shrinks it to 0.075, the export to 0.124 —
  the grid's `fitSubcellLabels` squeezes about twice as hard.
- **Export-only half-size labels** (0.074) in rows 8 and 10 — row 10 is the known
  "covered split-piece label is small in the export" bug below, now measured.
- **Furniture rows are not yet paired element-for-element**: the survey lumps a
  chair's tile, a rack's corner icon and a stairs tile (which reads 1.000 — it is a
  whole-square image, not an icon) into one "icon" list, so its DIFF % there is not
  meaningful yet. Pair them by element before acting on those rows.

## OPEN — smaller

- **Covered split-piece labels, export only.** In the export a covered piece's
  label renders small in the piece's corner; the grid draws it cell-struck
  (`fitSubcellLabels`). `CLAUDE.md` says text is struck from the CELL in *both*
  renderers, so the export is the wrong one. Pre-existing.
- **A table's own seated square keeps its blue outline ring** showing through the
  80%-opacity table. It matches a plain covered square, so it was left alone —
  worth confirming it does not read wrong on the user's dark charts.
- **Icon art lives in two copies** (`index.html`'s `<symbol>` and `SYMBOL_MARKUP`
  in js/icons.js) and has drifted before. Collapsing them into one source is
  flagged but not started.
- Backlog items in `CLAUDE.md` never started: 2-column labels, C2 diagonal drag,
  C4 selection animation, the tutorial line, the dense-rack corner icon.

## Do not repeat these

- **`targetAt` (js/grid.js) is THE hit test.** A new kind of thing on the chart
  joins its order — walls mode → table → wall → merge → piece → square — it does
  not get a branch inside a gesture. Every "unify the targeting" round of this
  feature came from gestures each deciding for themselves. `tools/tests/targeting.js`
  is the guard; run it.
- **An icon's size is its WEIGHT, not its height or its width** (`iconBox`).
  Taking one axis was wrong in both directions at once: as the height a 2:1 glyph
  drew twice as wide as a square one, as the width half as tall. Verify a change
  by checking the drawn w÷h against the glyph's declared ratio **in both
  renderers** — "it got bigger" is not a check.
- **`elementFromPoint` / `elementsFromPoint` cannot tell you paint order.** They
  skip `pointer-events: none` elements — tables, merge overlays and float bands
  all are. Two hit-tests this session gave confident wrong answers.
- **`.table-shape` is `opacity: .8` on the editing grid, on purpose.** Everything
  under a table shows through it. A faint seam "over" a table is usually *through*
  it. Recolour the suspect element and see if the line follows.
- **Suppressing a box under a table is the wrong fix in the GRID.** It was tried
  and made a covered merge the only thing with no outline ring. The EXPORT is the
  one that drops boxes, because there a table is solid.
- **Never give a merge/split wrapper a `z-index`.** It both ties with the table
  (z 1) and opens a stacking context that traps its own content underneath. Three
  separate bugs came from exactly that. Order by DOM instead.
- **Verify the scene you claim to verify.** A "byte-identical export" check was
  once cited for a case the test scene did not contain.
- **Send the user images, do not describe them.** They have had to ask twice.
- **Test-scene gotchas that read as bugs:** a freshly created merge starts
  **filled** (a tap empties it); an editor pane left open by an earlier case sits
  over the hover point of a later one; `setGrid` takes **(cols, rows)**; and
  tagging a label to make it unique (`Ann#3`) lengthens it and changes the answer
  to any fit question — use distinct names instead.
- **Normalise the grid by a DRAWN square**, not `layoutUnit()` — the unit includes
  the 8px `CELL_GAP`, which read every grid size ~10% small and invented an 8%
  text difference that does not exist.
- **Never chain an edit after a `grep` with `&&`** — a grep with no match exits 1
  and the edit silently never runs; the output then looks like the edit failed.
- **The user's uploaded `.seatchart` holds real workplace data** (room CR47, staff
  role names, CBS asset tags). It stays in the scratchpad — never commit it as a
  repo fixture.
