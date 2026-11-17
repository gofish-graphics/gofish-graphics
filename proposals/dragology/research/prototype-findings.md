# Drag prototypes: findings

These prototypes drive drags on GoFish charts with a small drag engine that
copies the main ideas of Dragology ("Declarative Dragging", UIST 2026). The
engine does not use the `dragology` package, React, or react-dom. It is built
from GoFish's own pieces: `toDisplayList` lays out each state, and GoFish's
display-list painter draws the result.

- Engine: `packages/gofish-graphics/stories/drag/engine.ts` (1,227 lines with
  comments).
- Demos: `packages/gofish-graphics/stories/drag/demos.ts`, shared by the
  stories (`stories/drag/Drag.stories.tsx`, titles "Drag/Reorder Bars",
  "Drag/Reorder Stack", "Drag/Scheduler", "Drag/Treemap Reparent",
  "Drag/Add Note", "Drag/Reference Line") and by the standalone bundle
  (`proposals/dragology/demo/demos.js`).
- The state is any plain object, and the spec is `spec(state)`. The row
  demos use `{ rows, order }`, and the row options (`edit`, `reorder`,
  `states`) edit it. The annotation demos use `{ notes }` and `{ lines }`,
  and say what a grab, an axis region or a palette chip can reach through a
  source: a list of candidates (each a state, or a family `at(t)` with
  continuous corners), the key of the dragged thing in each, and an `away`
  state for outside the plot.
- Measurements: `proposals/dragology/demo/results.json`, written by
  `proposals/dragology/demo/drive.mjs`. That script drives real pointer drags
  through Playwright on the bundle, with no network access.

## What the engine reproduces from Dragology, and in how many lines

| Dragology idea                                                                                         | Engine part                                                                                                                           | Lines                       |
| ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- |
| A view is a function of state; a drag moves between states                                             | `spec(state)` plus `toDisplayList` per state, with a cache keyed by the state                                                         | in mount, about 25          |
| Elements are matched across states by `id`                                                             | Key join over display items: `key(row)` on an item's `datum`; chrome keyed by its text, or by the nearest text for ticks and swatches | 80                          |
| `lerp` of rendered SVG, fading elements that exist in one state only, never blending different strings | `blendValue` and `blendLayouts`: numbers, colors (through culori), path data with the same commands; text content is part of the key  | 153                         |
| `d.closest`, `.withFloating()`, `d.between` (Delaunay weights, projection onto the hull)               | `closestWeights`, floating offset, `betweenWeights`                                                                                   | 102                         |
| The author lists the reachable states                                                                  | `candidates`: derived by `edit` (rows), `reorder` (a domain order), or a `states` function                                            | 84                          |
| `d.vary` for continuous parameters                                                                     | Two layouts per discrete state and an inverse of the affine pixel map (see below)                                                     | in the frame loop, about 30 |
| `.withBranchTransition`                                                                                | Weights ease over 150 ms when `closest` switches state                                                                                | 20                          |
| Drop animation                                                                                         | 200 ms ease-out tween from the preview to the dropped layout                                                                          | 20                          |
| Debug overlay                                                                                          | The targets, the slide segment of a continuous field, and lines from the pointer to the weighted targets                              | 30                          |

The pointer loop, panel, hit test, and the rest of mount make up the remaining
lines.

### What a state is

A state is `{ rows, order }`. `rows` is the data. `order` holds the level order
of each domain the spec declares, and the spec reads it as
`Unit({ domain: Domain.discrete(order.species) })`. `edit` changes fields of
the dragged rows. `reorder: "species"` moves the dragged mark's species to each
index of `order.species` and never touches the rows. Both reorder demos use it:
Reorder Bars reorders the lake domain, and Reorder Stack reorders the species
domain, so every stack and the legend reorder together.

I checked that the picture follows the declared order with a `tsx` script
against `src/lib.ts` (deleted afterwards). With the species levels declared as
Bass to Salmon and then as Salmon first, the stack order bottom to top and the
legend order top to bottom both followed the declared levels, with or without a
lake `Unit`. The colors followed the levels too: the first level always got the
first palette color. So a reorder would recolor every species. Reorder Stack
keeps colors with `color: Color.palette({ Bass: ..., ... })`. The filmstrip
confirms all three: after the drop Bass is on top of every stack, first in the
legend, and still blue.

**Paint order during a drag.** During a drag and its drop tween, the engine
paints the marks that travel with the drag last (`raise` in `engine.ts`): the
dragged rows' marks, or for a reorder every mark of the dragged level, with the
grabbed mark on top. Chrome has no rows and keeps its place, the debug overlay
stays above in its own SVG, and the normal order returns after the drop. In
Reorder Stack this keeps every Bass segment whole while it passes a taller
segment.

### Feels per demo

- Reorder Bars: `floating`. The bar follows the pointer, and the other bars
  snap to the nearest index with a 150 ms tween.
- Reorder Stack: `between`. The targets (one per index) lie on one vertical
  line, so the engine uses its one-dimensional weights and the segment blends
  along the stack. Mid-blend, segments of different heights overlap or leave
  thin gaps, because each segment's position is blended on its own. Dragology's
  `between` does the same.
- Scheduler: `between`, with the continuous `start` field.
- Treemap Reparent: `floating` (free dragging). The tile follows the pointer
  anywhere and is drawn on top. Its size is the blended size, which eases to
  the size in the nearest state over the 150 ms branch tween. The rest of the
  picture snaps to the state whose target (the tile's center in that state) is
  nearest the pointer. I chose nearest target over "pointer inside a group's
  box": the group boxes change from state to state, so the box test needs its
  own rule for which state's boxes to use, and nearest target already picked
  the group under the pointer in every drag I tried. On release the tile tweens
  into its slot.

### Continuous fields (the scheduler's `start`)

The engine needs no optimizer. For each discrete state (each room), it lays out
two corner states: `start` at its minimum and at its maximum. While the axis
domain stays fixed, layout is affine in `start`. So the two layouts give the
field's pixel map. The engine projects the pointer onto the segment between the
two dragged-mark positions, which gives `t`, and blends the two layouts with
weights `1 - t` and `t`. With k continuous fields there are 2^k corners and the
weights are multilinear. Only k = 1 was tested.

I checked the affine claim at every continuous drop. The engine compares the
blended preview with a real layout of the dropped rows, box by box, over every
item. The largest gap was **0 px** (`blendErrPx` in `results.json`).

**Axis domain.** It is held fixed, by the data and not by the engine. Each room
has a `day` row (9 to 17) that draws the track, and those rows set the time
axis to the whole day. While dragging, `start` is clamped to
`[9, 17 - length]`, so the domain never changes during or after a drag. If a
drag could widen the domain, layout would no longer be affine in the field, and
the two-layout blend would be wrong. In that case the engine would need a real
layout per frame. That costs about 10 to 20 ms each (see below), which is close to
a 16 ms frame and has to run asynchronously. I did not build that path.

I did not use `src/interaction/frameScales.ts` either. Its `posScales` and
`toPixel` come from the interaction runtime's published frame, which
`toDisplayList` does not return. The two-layout method reads the same affine
map straight from layout output, with no internal access.

## GoFish internals used

| What                                                     | Where                                    | Public?                               |
| -------------------------------------------------------- | ---------------------------------------- | ------------------------------------- |
| `toDisplayList` (through `ChartBuilder`)                 | `src/lib.ts:82`, `src/ast/_node.ts:3495` | yes                                   |
| `paintDocument`, the display-list to SolidJS SVG painter | `src/ast/displayList/paintSVG.tsx:64`    | **no**, imported by path from a story |
| Display-list types                                       | `gofish-ir` `DisplayList`                | yes                                   |
| `render` from `solid-js/web`, `d3-delaunay`, `culori`    | existing dependencies                    | n/a                                   |

The repository changes outside the prototype folders add the built bundle to
`.prettierignore` and to the ESLint ignores, so the pre-commit hook does not
reformat 830 KB of minified code, and make one library change.

### Library changes

- **`attachedTo` on label display items.** A display item may now carry
  `attachedTo?: string` (`packages/gofish-ir/src/display-list/schema.ts`, and
  the JSON schema next to it). Every item a label lowers sets it to the uid of
  the mark the label is attached to (`src/ast/labels/labelNode.tsx`, from the
  existing `_attachedTo` link that `INTERNAL_attach` records). The mark's own
  items already carry that uid as their `id`. It is metadata only: the painter
  never reads it, so no rendered output changes. Three tests that compare two
  renders with node ids stripped now strip `attachedTo` too, since it is a
  node id (`serialize.test.ts`, `buildInTower.test.ts`,
  `labelPlacement.test.ts`). The wiki essays on labels and rendering say so.
  I did not put the mark's `datum` on the label, as first suggested: a datum
  makes an item `role: "node"`, a hit target, and labels are meant to stay
  `"overlay"` chrome. That would have changed behavior, not just metadata.
- **`attachedTo` through a ref.** A note in Add Note is a label on
  `layer([bar])`, where `bar` is a ref from `selectAll("bars")`. That layer
  emits no item, so its uid named nothing in the display list. A label on a
  node whose only child is a ref now names the ref's target instead
  (`labelNode.tsx`, next to the first change). This is a declared shortcut:
  a label on a layer of several children still names the layer, which no
  item carries. The right fix is for the display list to carry the subject
  (a group item per layer, or a list of the items a node drew).

I looked at the key join on branch `worktree-animation-grammar-proposal`
(`src/animation/identity.ts`). I did not borrow it, because it works on the
resolved node tree and not on display items, and its own header says that
chrome added after resolve (axes, legends) has no identity. A drag needs
exactly that chrome to blend. I did not use `tween.tsx` or `interpolate.ts`
either: they interpolate geometry channels of nodes, not display items.

## What Dragology does that this engine does not

- Natural-neighbor interpolation (`between` with `interpolation:
"natural-neighbor"`). The engine has only Delaunay barycentric weights and
  hull projection.
- `.whenFar`, `.withSnapRadius`, `.withDropTransition` options, `.onDrop`,
  `.during`, `.withOverlay`, and chaining specs into a tree
  (`d.closest([d.vary(...), ...])`). The engine has one fixed shape: a list of
  candidates, each a discrete state or a family with continuous corners, plus
  an optional `away` state outside the plot and one snap radius (`snap`, the
  closest discrete target within it wins). The feel is per source.
- `d.vary` with COBYLA constraints over arbitrary parameters. The engine only
  handles fields whose layout is affine with a fixed domain, and clamps them to
  a `[min, max]` range.
- `d.dropTarget`, `d.custom`, user operators, and the spec tree view.
- Coincident targets: Dragology throws. The engine merges targets closer than
  0.5 px into the first one.
- Layering control (`dragologyZIndex`). The engine always lifts the dragged
  mark to the top.
- Drags on `path` items. They have no box in the display list. Text items get
  a box estimated from the font size (0.6 em per character), so a note or a
  line's label can be grabbed.
- Several marks per row. The hit test picks the topmost box.

## Measured numbers

These come from Playwright in headless Chromium on an Apple Silicon Mac, one
drag per demo. "Lazy" lays out the candidates at pointer-down. "Eager" lays out
every candidate of every draggable mark after mount and after each drop.

| Demo             | Candidates per drag     | Lazy: ms per layout | Lazy: pointer-down latency | Eager: layouts | Eager: precompute per drop | Blend + paint per frame (avg / max) |
| ---------------- | ----------------------- | ------------------- | -------------------------- | -------------- | -------------------------- | ----------------------------------- |
| Reorder Bars     | 6                       | 13.0                | 39 ms                      | 46             | 132 ms, then 88 ms         | 0.7 / 1.4 ms                        |
| Reorder Stack    | 5                       | 18.0                | 44 ms                      | 29             | 134 ms, then 79 ms         | 1.4 / 2.1 ms                        |
| Scheduler        | 8 (4 rooms x 2 corners) | 5.7                 | 47 ms                      | 130            | 212 ms, then 138 ms        | 0.8 / 1.8 ms                        |
| Treemap Reparent | 4                       | 12.1                | 15 ms                      | 70             | 107 ms, then 75 ms         | 0.5 / 1.5 ms                        |
| Add Note         | 6 (chip), 9 (note)      | 9.7                 | 55 ms, then 20 and 31 ms   | 25             | 65 ms, then 55 to 65 ms    | 0.7 / 1.3 ms                        |
| Reference Line   | 9 (2 corners + 7 snaps) | 7.0                 | 77 ms, then cached         | 55             | 81 ms, then 0 to 51 ms     | 0.7 / 2.8 ms                        |

Add Note and Reference Line run three drags each (add, move, remove; pull,
remove, pull above the tallest bar). Their later drags reuse cached layouts.
During a continuous drag, Reference Line also lays out the drop state in the
background for the label's text, so its layout count includes those.

The eager runs report 3.0 to 8.9 ms per layout, because the JIT warms up over
many layouts. The prototypes use **lazy** mode. Pointer-down latency stays
under 80 ms, and eager mode spends up to 0.21 s after every drop laying out
states the user never visits. Eager mode remains an option
(`precompute: "eager"`).

"Per frame" covers blending the cached layouts and building the SVG through
`paintDocument` with a fresh Solid `render`. It does not cover the browser's
own style, layout, and raster work.

The standalone bundle (`proposals/dragology/demo/demos.js`, one IIFE with
GoFish, solid-js, d3-delaunay, culori, the engine, and the data) is **843,140
bytes** (300 KB gzipped). It contains no React and no dragology code. It ran
from `test.html` through a plain `<script>`, with every non-`file:` request
aborted, and logged no errors. The bundle keeps one dead `import("node:fs/promises")`
from GoFish's file-save helper. It is never called in a browser.

## Line count against Dragology's scheduler

I counted only the comparable part of Dragology's `src/demos/scheduler.tsx`:
the types and initial data, the constants those parts use, the tracks with room
labels, and the bars with the drag between rooms. I left out the imports, the
demo wrapper, the endpoint dots with their `d.vary` resize, and the conflict
graph. Blank lines and JSX comments are not counted. That comes to **70
lines**: 17 lines of types, data, and constants, and 53 lines of rendering and
drag spec.

The GoFish scheduler in `demos.ts` is **57 lines**, formatted by Prettier
without blank or comment lines. Of those, 28 are data (7 meetings, 4 day rows,
and a color list that Prettier spreads over 9 lines), and **29 are the spec and
the drag**, against Dragology's 53.

The two do not draw the same thing. The GoFish version also slides meetings
along time, and it gets a time axis and room labels from GoFish. Dragology's
bar only changes rooms (its dots resize), and it also draws a conflict graph,
which I left out. This version has no resize and no conflict graph.

## Walls and shortcuts, declared

1. **Category order comes from the data, so editing data reorders scales.**
   GoFish orders categories by first appearance. When a drag edits the first
   row of a group (Treemap), that category moves in every candidate layout,
   and the dragged mark lands in slot 0 in every state. The fix is in the
   spec, not the engine: Treemap declares a group `Unit` with
   `Domain.discrete`. A drag engine needs every categorical domain pinned. A
   proposal could make `edit: [field]` require (or infer) a pinned domain.
   The reorder demos pin their domain by construction, since the domain order
   is the state.
2. **GoFish bug: the color scale ignores a `Unit`'s declared levels unless
   the same field splits the marks.** With
   `schema: { species: Unit({ domain: Domain.discrete(SP) }) }` and
   `stack({ by: "species" })`, the colors follow `SP`. With
   `stack({ by: "id" })` and the same schema, `fill: "species"` follows first
   appearance instead. My earlier note blamed declaring a lake `Unit`; a
   recheck with a `tsx` script against `src/lib.ts` showed that the lake unit
   makes no difference and the split field does. The check is in
   `resolveColorScale` (`src/ast/_node.ts:1234-1258`, the `oneOrder` test over
   the collected `orders`). It no longer affects any demo. This should be
   filed as a GoFish issue.
3. **Moving a stacked segment to another lake was the wrong drag, so it is
   gone.** The earlier Move Segment demo edited a row's `lake`. Under
   `stack({ by: "species" })` that merges the moved row with the target lake's
   own segment of that species, so it had to stack by row id, which draws a
   stacked bar with two segments of one species. Reorder Stack replaces it:
   the drag edits the species domain order, and the chart stays correct in
   every state.
4. **Treemap tiling sorts by weight.** With the default sort, a moved leaf
   always lands in the top-left of the largest group. The targets nearly
   coincide. The demo uses `sort: "none"` on both treemap levels. Blending
   between tilings made tiles overlap and leave gaps, so the treemap now uses
   free dragging (`floating`) instead of `between`.
5. **Labels carried no link to their mark (fixed).** `.label("id")` text has
   no `datum`, so it was keyed as chrome by its text and stayed in the
   dragged tile's destination slot. With `attachedTo` (see Library changes),
   the engine gives a label its mark's rows and a key in its mark's group
   (`m:<rows>:label-text`). The label now blends, is raised and floats with
   its tile, and nothing is left in the slot. Attached labels are no longer
   used as anchors for keying ticks and swatches, and they are never grab
   targets. A label on a group node with no item of its own still has no
   item to point to, so it falls back to being keyed by its text.
6. **Chrome has no stable identity.** Tick labels and legend labels are keyed
   by their text. Ticks, swatches, and axis lines are keyed by the nearest
   text item. That is a heuristic. It is fine here, but a tick whose label
   disappears is re-paired with a neighbor. GoFish should give chrome items a
   stable id (for example, the tick value and axis).
7. **Collinear targets.** d3-delaunay jitters collinear points into sliver
   triangles, and barycentric weights in a sliver land on the far ends of the
   line. In the scheduler the pointer sat on Room 3 while the weights went to
   Rooms 1 and 4. The engine now treats targets within 0.5 px of one line as a
   line, with piecewise-linear weights. This is a numeric tolerance, not a
   special case. Reorder Stack depends on it: its targets share one x. Targets
   that are only near a line would still give sliver triangles that mix three
   states.
8. **Overlapping meetings.** A meeting dropped on top of another is painted in
   data order, so it can be hidden. The scheduler has no conflict handling.
9. **Treemap panel.** At `h: 300` the treemap fills about 220 px and leaves
   empty space below. I did not investigate this.
10. **Engine bug, fixed: fading mutated the layout cache.** `blendLayouts`
    set the faded opacity on the item it got back from `blendValue`, which
    is the cached item itself when only one layout has it. A note that faded
    in during a chip drag stayed at opacity 0.001 after the drop. The fade
    now copies the item.
11. **Text does not blend.** A free reference line's label shows its value,
    but the corner layouts hold "0" and "96". During a continuous drag the
    engine lays out the drop state in the background (about 7 ms) and takes
    the text of labels from it, keeping the blended geometry. The label lags
    the line by a frame or two.
12. **The axis is pinned while dragging, then settles.** The free line's two
    corners (0 and 96) sit inside the bars' domain, so their axis is the
    same and the blend is exact. Past 96 the pixel map extrapolates, so a
    line above the tallest bar (137) goes past the top tick. On drop at 141
    the real layout grows the axis from 0 to 140 to 0 to 160, and the 200 ms
    drop tween moves the bars and ticks there (the "blend error" for that
    drop is 206 px, all of it the settle). Showing the new axis during the
    drag needs the pixel map from GoFish (see below), not more corners.
13. **The plot has no name in the display list.** "Outside the plot" (where
    a drop removes a note or a line, or adds nothing) is the box of the data
    marks, from the canvas top down. The y axis region is the 40 px left of
    it. Both are read off the marks, not off the chart.
14. **Previews pick the nearest target, not the column.** A chip drag
    previews the bar whose note would be nearest the pointer, the same rule
    as every other `closest` drag. A pointer low in a column can pick a
    shorter neighbor's note. A line snaps to a target within 8 px of its
    rule (distance to the target's box, so only height counts).

## What the annotation API on main could not express

The natural spelling of a note is a label on the selected bar:
`chart(selectAll("bars")).flow(filter(...)).mark(([bar]) => bar.label(...))`.
On main:

- **A ref has no `.label`.** `bar.label` fails with "d[0].label is not a
  function", and `ref(bar).label(...)` with "ref(...).label is not a
  function". The nearest public spelling wraps the ref:
  `layer([bar]).label(...)`.
- **The layer over a ref has no datum.** `layer([bar]).label("count")` draws
  nothing, and a function accessor gets `undefined`. The demo computes the
  text from the ref instead: `.label(() => String(project(bar, "count")))`.
- **Marks over a selection do not sit on the selected mark.**
  `rect({ fill: "none" }).label(...)` and `blank().label(...)` over the
  filtered selection lay out on their own: the label landed at the top of the
  canvas or near the origin, not on the bar.
- **Reference lines have no rule mark.** A line is `rect({ y: "count", h: 2
})` over a chart of one row, layered over the bars, and it shares their
  `count` scale. A snapped line is a `derive` over the same data, which
  keeps it a data-driven value. No leader lines: they are not implemented,
  and the demos do not draw one.
- **Function labels do not serialize.** Every `.label(fn)` logs that it is
  left out of the emitted IR, so these specs do not cross to Python as
  written.

## What GoFish would need to expose to make this trivial

- **Stable keys on display items.** Today `id` is a per-resolve uid
  (`node-17`). A `key` taken from the datum through a user key function, and a
  structural id for chrome (axis, tick value, legend entry), would remove the
  whole key-join section and its heuristic.
- **Labels tied to their mark.** Done in this branch with `attachedTo` (see
  Library changes).
- **A public painter.** `paintDocument` (or a `paintDisplayList(items, svg)`)
  exported from `lib.ts`, so a host can paint a blended display list.
- **Boxes for every item.** `itemBox` and `walkItems` in
  `src/interaction/runtime.ts` are private, and text and path items have no box.
  A name or datum to box index on the display list would make hit-testing and
  target lookup one call.
- **The pixel map with the display list.** Returning each axis's data to pixel
  map (the `posScales` legs from `frameScales.ts`) with `toDisplayList` would
  make continuous drags exact without the second corner layout, and would show
  when a drag would change the domain.
- **Pinned categorical domains by default for interactive charts,** and the
  color-scale bug above fixed.
- **Faster or synchronous layout.** At 10 to 20 ms per layout, lazy precompute
  is fine for up to about 10 candidates. A synchronous layout path would let the
  engine lay out per frame when a domain must change.
