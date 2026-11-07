# Croissant Sampling: removing the hand-sampled grids (#1332)

- Today the croissant stories sample a function by hand (`gridOf`, a hand-written `kde`, `quantileRows`), and every line or area chart needs a `scatter` before its `line` or `ribbon`.
- Proposed, part 1: `line` and `ribbon` take their position, `line({ x: "date", y: "price" })`. On a mark that draws one shape through many rows, the position picks the vertices. It rewrites to a `scatter` right before the mark.
- Proposed, part 2: a stacked area is one area of the total, divided by series, as Mascot builds it. GoFish already has Mascot's divide: `cut`. `ribbon({ x, h }).cut({ by: "c", dir: "y" })` divides the area at each x; `cut({ dir: "x" })` at a Dist's quantiles is the croissant. It reads only the mark's own rows, so it is local, and its rewrite is a stack inside each x slice.
- Proposed, part 3: the flow `stack` stays local. It stacks whole children, so a stack of whole ribbons whose height varies is a loud error that points at `cut` and at `spread`.
- Proposed, part 4: `sweep({ v: [a, b] })` makes a row for every v in an interval, so a density draws with no grid.
- Found along the way: GoFish divides a box by weight in three operators (`stack` with `size`, `treemap` with `Tile.slice`/`Tile.dice`, `cut`), and by scale cells in a fourth (`partition`). Drafted as its own issue.

## Recommendation

Divide wins, and it replaces this round's first recommendation, a `.stack()` modifier. The lead: `chart(params).flow(sweep({ v: [-4, 4] })).mark(ribbon({ x: "v", h: x.density("v"), fill: "series" }).cut({ by: "series", dir: "y" }))`. Josh's objection to round 6 stands: a flow `stack` that reaches into each ribbon's x positions is not local. A `.stack()` modifier on each series' ribbon says that it is not local, but it still reaches across marks. Divide does not reach across anything: the ribbon is one area of the total at each x (its `h` adds, as sizes do), and `cut` divides that one mark by its own rows. This is how Mascot draws its stacked area and streamgraph (densify, then divide), and GoFish already took the operator from Mascot as `cut`, with a function twin (`cut(image(), opts)`) as api-design.md asks of a one-child method. The same `cut` along x is the croissant. The reasons GoFish gave against divide were about where it lives (a mark, not an operator) and what it returns (many pieces); `cut` settled both. The `.stack()` modifier is the runner-up: it reads better for stacked lines, which have no extent to divide. The wall from earlier rounds stays: under `sweep` the slices are laid out on demand, and no prototype does that yet.

## Relation to #980

This applies #980 to the croissant; it does not compete with it. #980 (first-class distributions: the data holds a Dist; draws and quantile levels are rows made by `repeat(n, ...)`; slab and interval are user code, not marks) already says that binning a Dist key by `Bin.quantiles` cuts it at its quantiles. `sweep` is the continuous counterpart of #980's `repeat`, and it takes #980's intervals as arguments (`sweep({ v: x.interval(0.95) })`). B answers #980's open question of curve summaries in channels, as the short form of C. A is #980's `densityCurve` helper, which is C over a finite grid. Nothing adds a mark or reopens a #980 decision, and all three delete `quantileRows` (#1231). The continuous-type section ties into #980's scales tab, which says a density's "per" must name the field it is spread over.

Artifact: https://claude.ai/artifact/Fh12g89z1cChzAqpQZ8mGH. The #980 proposal: https://claude.ai/artifact/QKR9jSHs1LWCtjp25bFuBq.

Renders are real GoFish renders. B uses a throwaway prototype node, `packages/gofish-graphics/src/ast/shapes/_prototypeFnCurve.tsx`, which `stories/proposals/CroissantSamplingB.stories.tsx` drives. `fnCurve({ f, range })` stands in for `ribbon({ h: x.density() })`. In both approaches the cut layer emulates an exact Dist cut with 2000 exact quantile rows.

## Rules

1. A mark draws one shape per flow cell, as today. A rect, circle or text is one shape with one position, so its channels are values of the cell's rows (a position is their mean today). A line or ribbon is one shape through many points, so its position channels `x`, `y` and `along` are its vertices: one vertex per `along` value (`x` by default). `.mark(R({ x, y, along, ...rest }))` is `.flow(..., scatter({ by: along ?? x, x, y })).mark(R(rest))`.
2. Which rows join: the rows of one flow cell, as #786 decided. In what order: the `along` key's order.
3. The flow `stack` is local: it lays its children end to end and adds their sizes. Each child must have one size along `dir` that can be added (CanSum, #1311). A child with no single size (a ribbon over many x positions, a `spread` of bars) is an error whose message names the child, `cut` and `spread`.
4. `cut` divides one mark by its own rows (Mascot's divide). By weight: `cut({ by, dir, size })`, the pieces share the mark's extent. By cells: `cut({ by: x.bin(...), dir })`, the pieces are the mark's parts inside each cell. On a ribbon or line, a cut across the path divides the extent at each vertex, and rewrites to `stack({ by })` inside each vertex slice.
5. A cut mark's paint channels are read per piece, so `ribbon({ fill: "c" }).cut({ by: "c" })` gives each piece its color. (Today a paint field that varies inside one ribbon is an error, and today's cut slices do not read paint.)
6. `sweep({ v: [a, b] })` replaces each row with a continuum of rows over [a, b]; `repeat(n)` stays discrete (#980). After `sweep`, `spread`, `sort`, `count` and a mark per row are errors, and `line` or `ribbon` sample the continuum to half a pixel.
7. A channel reads a Dist at the index: `x.density("v")`, `x.cdf("v")`, as #980's `x.quantile("p")` reads a level. `ribbon({ h: x.density() })` with no x is short for the whole spec over `x.range()` (approach B). Dots read the Dist exactly: `x.median()`.

## Line and ribbon take their position

One rewrite, written out. The renders run it: `xy()` in `stories/proposals/LineRibbonXY.stories.tsx` builds the flow the rewrite gives.

```js
// 1. Position on a line or ribbon (R) picks its vertices: one per `along` value (x by default)
chart(data)
  .flow(...ops)
  .mark(R({ x, y, along, ...rest }));
chart(data)
  .flow(...ops, scatter({ by: along ?? x, x, y }))
  .mark(R(rest));

// 2. cut on a ribbon divides its extent at each vertex: a stack inside each vertex slice
chart(data)
  .flow(...ops)
  .mark(ribbon({ x, h, ...rest }).cut({ by: k, dir: "y" }));
chart(data)
  .flow(...ops, scatter({ by: x, x }), stack({ by: k, dir: "y" }))
  .mark(ribbon({ h, ...rest }));
```

### Line chart

![](img/l-line.png)

One line through all the rows, in year order. The gallery Line Chart today.

```js
chart(drivingShifts).mark(line({ x: "year", y: "gas", stroke: "steelblue" }));
```

Python:

```python
chart(driving_shifts).mark(line(x="year", y="gas", stroke="steelblue"))
```

Today:

```js
chart(drivingShifts)
  .flow(scatter({ by: "year", x: "year", y: "gas" }))
  .mark(line({ stroke: "steelblue" }));
```

### One line per stock

![](img/l-multi-line.png)

The grouping stays in the flow, so the rule for which rows join is the one #786 shipped. Only the `scatter` goes. (The gallery Line Chart with End Labels today.)

```js
chart(stocks, { schema: { date: Unit.time() } })
  .flow(group({ by: "symbol" }))
  .mark(
    line({ x: "date", y: "price", stroke: "symbol" }).label("symbol", {
      position: Place.end(),
    })
  );
```

Python:

```python
(
    chart(stocks, schema={"date": Unit.time()})
    .flow(group(by="symbol"))
    .mark(line(x="date", y="price", stroke="symbol").label("symbol", position=Place.end()))
)
```

Today:

```js
chart(stocks, { schema: { date: Unit.time() } })
  .flow(group({ by: "symbol" }), scatter({ by: "date", x: "date", y: "price" }))
  .mark(
    line({ stroke: "symbol" }).label("symbol", {
      position: Place.end(),
    })
  );
```

### Area chart

![](img/l-area.png)

`ribbon` with `x` and `h`. The ribbon's `h` already goes to an invisible anchor today (#748); `x` joins it.

```js
chart(rows).mark(ribbon({ x: "x", h: "y" }));
```

Today:

```js
chart(rows)
  .flow(scatter({ by: "x", x: "x" }))
  .mark(ribbon({ h: "y" }));
```

### Stacked area chart: one area, divided

![](img/l-stacked-area.png)

Without the `cut`, `ribbon({ x, h })` is the total area: one vertex per x, its `h` the sum of the series there. `cut` divides it by c at each x. The render runs the rewrite, a `scatter` by x and a stack inside each slice. The second spelling is the runner-up, a stack modifier on the series ribbons.

```js
// One area of the total at each x, divided by series
chart(rows).mark(
  ribbon({ x: "x", h: "y", fill: "c" }).cut({ by: "c", dir: "y" })
);

// Runner-up: a stack modifier on the series ribbons
chart(rows).mark(
  ribbon({ x: "x", h: "y", fill: "c" }).stack({ by: "c", dir: "y" })
);
```

Python:

```python
chart(rows).mark(ribbon(x="x", h="y", fill="c").cut(by="c", dir="y"))
```

Today:

```js
chart(rows)
  .flow(scatter({ by: "x", x: "x" }), stack({ by: "c", dir: "y" }))
  .mark(ribbon({ h: "y", fill: "c" }));
```

### Streamgraph

![](img/l-streamgraph.png)

The lakes are a `spread` centered on the baseline (`alignment: "middle"`, as Mascot's `vertCellAlignment: "middle"`). The ribbon is each lake's total, divided by species. The rewrite is today's gallery Streamgraph, and the render is it. (The y labels all read 10 here, a bug in today's story.)

```js
chart(seafood)
  .flow(spread({ by: "lake", dir: "x", spacing: 64, alignment: "middle" }))
  .mark(
    ribbon({ h: "count", fill: "species" }).cut({ by: "species", dir: "y" })
  );
```

Today:

```js
chart(seafood)
  .flow(
    spread({ by: "lake", dir: "x", spacing: 64, alignment: "middle" }),
    stack({ by: "species", dir: "y" })
  )
  .mark(ribbon({ h: "count", fill: "species" }));
```

### Stacked lines: where divide falls short

![](img/l-stacked-lines.png)

A line has no extent, so there is nothing to divide. As a cut, stacked lines are the top edges of the divided area, which needs an edge-only paint GoFish does not have. The stack modifier spells it directly. Today it needs `h` on the line's invisible anchors and `source`/`target` pinned to their tops (render).

```js
// Runner-up only: cut divides an extent, and a line has none
chart(rows).mark(
  line({ x: "x", y: "y", stroke: "c" }).stack({ by: "c", dir: "y" })
);

// With cut, the lines are the top edges of the divided area: a gap (no edge-only paint today)
chart(rows).mark(
  ribbon({ x: "x", h: "y", stroke: "c", fill: "none" }).cut({
    by: "c",
    dir: "y",
  })
);
```

Today:

```js
// Today: line runs through the tops of stacked invisible anchors
chart(rows)
  .flow(scatter({ by: "x", x: "x" }), stack({ by: "c", dir: "y" }))
  .mark(
    line({ h: "y", stroke: "c", source: { y: "end" }, target: { y: "end" } })
  );
```

### Error: the stack written in the flow

![](img/l-stack-outer-today.png)

![](img/l-bars-today.png)

The flow `stack` stacks whole children, and a whole ribbon has no single height, so this spec is an error. The renders show what today's engine draws instead: each series as one box as tall as its peak, and for bars, whole rows of bars piled up. No story or test writes `stack` before a `spread`, `scatter` or `group` (combinator forms not searched).

```js
chart(rows)
  .flow(stack({ by: "c", dir: "y" }))
  .mark(ribbon({ x: "x", h: "y", fill: "c" }));

// Error: stack({ by: "c", dir: "y" }) adds the heights of its children, but
// child c = 0 has no single height: it is a ribbon over 10 x positions, with
// a different height at each. To divide the area at each x by c, cut the mark:
//   ribbon({ x: "x", h: "y", fill: "c" }).cut({ by: "c", dir: "y" })
// To give each series its own baseline (a ridgeline), use spread:
//   spread({ by: "c", dir: "y", anchor: "baseline" })
```

```js
chart(seafood)
  .flow(stack({ by: "species", dir: "y" }), spread({ by: "lake", dir: "x" }))
  .mark(rect({ h: "count", fill: "species" }));

// Error: stack({ by: "species", dir: "y" }) adds the heights of its children,
// but child species = "Bass" has no single height: it is a spread of 6 lakes.
// To stack the species in each lake, put the stack after the spread:
//   spread({ by: "lake", dir: "x" }), stack({ by: "species", dir: "y" })
```

### Ridgeline: a spread

![](img/l-ridgeline.png)

Each series keeps its own baseline space, so the ridges overlap where a row is taller than the pitch. Same structure as the gallery Ridgeline Chart (`spread` with `anchor: "baseline"`).

```js
chart(rows)
  .flow(spread({ by: "c", dir: "y", anchor: "baseline", spacing: 36 }))
  .mark(ribbon({ x: "x", h: "y", fill: "c" }));
```

Today:

```js
// the gallery Ridgeline Chart, same structure
chart(rows)
  .flow(
    spread({ by: "c", dir: "y", anchor: "baseline", spacing: 36 }),
    scatter({ by: "x", x: "x", h: 80 })
  )
  .mark(ribbon({ h: "y", fill: "c" }));
```

### History: how line, ribbon and stack got here

- **#511 / #519 (merged)**: Added `.connect(line())` as builder sugar for connecting a chart's marks.
- **#745 (merged)**: Deleted `.connect()` in favor of `.layer()` with relational marks. Rejected: inferring which marks a connector joins from intent. Josh: intent-detection rules "feel spooky". Kept: `by` on the mark, paint under its operands.
- **#748 (merged)**: Fusion sugar: `.mark(R(opts))` is `.mark(blank(anchor(opts))).layer(R(rest))`. The anchor takes only `w`, `h`, `emX`, `emY`; all paint goes to the connector. Stacked area and streamgraph stayed in the two-tier form in the gallery, because the fused "spread + stack then ribbon" was hard to read.
- **#786 (merged)**: A fused connector takes its grouping from the flow: the path tier threads as one path, every other tier splits. `along` names the path tier. `by` was removed from `line` and `ribbon`; an array `along` and `by: null` were rejected. A paint field that varies inside one path is a loud error.
- **#290 (open)**: Stack as a mark method. Josh's 07-10 note: for connectors a mark-side `.stack()` can only mean stacking the rows (stacking whole ribbons draws a ridgeline), so it is a spelling of the flow `stack`, not a new operation; ggplot's position adjustments mark the boundary of what could go mark-side. The waffle case was later solved by `wrap`, so `stack` keeps one meaning, a hard seam, at every level.
- **#47 (open)**: Stacked ribbons. Its approach C, `ribbon().stack()` (including `ribbon({ h }).stack({ by: "series" })` for a stacked area), was rejected as a second route to the flow `stack`. Its current direction is anchors: `.anchor({ name, position: "x-max", slots: data().flow(stack(...)) })`, a flow along a mark's side, with ribbon widths from the slot sizes and references like `nodes.out`.
- **Josh, 11-06**: A ridgeline is not a stack, because the subregions do not add up. `stack` glues spaces into one by adding them (CanSum, #1197 and #1311); `spread` keeps them separate.
- **Josh, 11-06, on round 6**: A flow `stack` that draws a stacked area "just doesn't work like any other operator"; a stack modifier says it "does something non-operator-like the same way labels do", something "not completely local". And: `stack` "fights the typical hierarchy" and overlaps with spread, partition and treemap.
- **api-design.md**: A method chain reads or branches on the caller's state; an option is a local adjective. A method has a function twin only for a one-child operator. `stack` and `spread` differ in spaces (stack glues children into one space), not in spacing.
- **memory note**: `.connect()` as the canonical line form is out of date: #745 deleted it. The canonical form today is a `scatter` in the flow and a fused `line` in `.mark()`.

### Does this answer the past objections?

- **"Which rows join" (#745, #786)**: Unchanged: rows join within one flow cell. A divided ribbon's pieces join by the cut's `by` key, which is written.
- **"In what order"**: The `along` key's order, `x` when `along` is absent. Sorting by x (ggplot's `geom_line`) is a decision.
- **"Spooky action" in fusion (#748)**: `x`, `y` and `along` become a `scatter`, the same kind of written rewrite #748 already does for `h`.
- **Josh on round 6: not local**: Answered by divide: `cut` reads only its own mark's rows. Round 7's first answer, a `.stack()` modifier, made the non-locality visible; divide removes it.
- **Stack as a mark method (#290)**: Not needed. #290's note said a mark-side stack on a connector can only mean stacking the rows; the divide does that work from the parent's side.
- **#47, approach C**: C was `ribbon().stack()`, rejected as a second route to the flow `stack`. The lead no longer uses it, so #47's decision stands; picking the runner-up would reverse it. `ribbon().cut()` divides one ribbon, and that fits #47's title, "Stacked/Divided Ribbons": a sankey link divided lengthwise into strands is the same `cut`.
- **The methods rule (api-design.md)**: `cut` is the rule's own example of a method with a function twin: `image(...).cut(opts)` is `cut(image(...), opts)`. On a ribbon it is still one child.
- **`ChartBuilder.stack()`**: `chart(d).stack(s)` is sugar for `.flow(stack(s))`, the local operator, so `chart(d).stack(s).mark(ribbon({ x, h }))` is the error case. Keep it or remove it is a decision.

### Why line and ribbon, but not rect

![rect today](img/l-rect-today.png)

```js
// Today: one rect for the whole chart, at the mean year and mean gas
chart(drivingShifts).mark(rect({ x: "year", y: "gas", w: 6, h: 6 }));

// One rect per year needs the flow to make one cell per year
chart(drivingShifts)
  .flow(scatter({ by: "year", x: "year", y: "gas" }))
  .mark(rect({ w: 6, h: 6 }));

// One line for the whole chart; x and y are its vertices
chart(drivingShifts).mark(line({ x: "year", y: "gas" }));
```

Today `chart(drivingShifts).mark(rect({ x: "year", y: "gas" }))` draws one rect, at the mean year and mean gas (render). A rect is one shape with one position, so its position channel aggregates its cell's rows (positions average, sizes add, #1197). To get one rect per year, the flow makes one cell per year. Which cells, and how they are arranged (`scatter`, `spread`, `stack`), is a real choice, and it belongs in the flow.

A line or ribbon is one shape with many positions. Its `x` cannot be one mean value; the only reading is a list, one vertex per row group. So the sugar adds no choice: the cells of a path are always one per `along` value, placed at x, which is `scatter`. The rule a user can predict: a mark's channels describe one shape per cell; for a shape with one position they are values of the cell, for a shape through many points they are its vertices.

The same split explains the divide. A rect's `h` over its rows is their sum, so a rect with a `cut` is a bar divided. A ribbon's `h` at each vertex is the sum of that vertex's rows, so a ribbon with a `cut` is an area divided at each x. Where it stops: a line through the tops of a bar chart's bars has no data x, so it keeps the flow form.


### A twin mark (`area`, `path`) instead?

```js
// A twin mark (not recommended): stacking would live in the mark
chart(rows).mark(area({ x: "x", y: "y", fill: "c" })); // stacks by fill
chart(rows).mark(ribbon({ x: "x", h: "y", fill: "c" })); // does not

// and the line would need one too, for its order
chart(rows).mark(line({ x: "x", y: "y" })); // sorted by x
chart(rows).mark(path({ x: "x", y: "y" })); // data order
```

An `area` mark with stacking built in would be `ribbon` plus a default division. Two names for one shape that differ only in a default is the overlap the repo rules forbid (one concept, one operator; consolidate on the current name). ggplot's `geom_area` is a `geom_ribbon` with a default position, and GoFish has no default positions. Josh's point holds too: `line` would need a twin, and no name tells them apart.

The line twin is about order, not stacking. ggplot's `path` is the precedent name, and clearer than `link`. But the difference is one choice, sort or keep data order, which fits an option of `line` better than a second mark.

- **ggplot2**: `geom_area` stacks by default (`position = "stack"`); `geom_ribbon` does not and takes `ymin`/`ymax`. `geom_line` sorts by x; `geom_path` keeps data order.
- **Vega-Lite**: `area` stacks by default when a non-position channel maps a field; `line` connects in x order unless an `order` channel is given; `trail` is a separate mark.
- **Observable Plot**: `areaY` does not stack by itself; a `stackY` transform does it. `line` keeps data order (from memory).

## What is stack?

![stack with size](img/s-mosaic-stack.png)

![treemap dice then slice](img/s-mosaic-treemap.png)

```js
// stack with `size`: the box is given, and the children divide it by weight
chart(seafood)
  .flow(
    stack({ by: "lake", dir: "x", size: "count" }),
    stack({ by: "species", dir: "y", size: field("count").normalize() })
  )
  .mark(rect({ fill: "species" }));

// treemap with Tile.dice, then Tile.slice: the same division
chart(seafood)
  .flow(
    treemap({ by: "lake", size: "count", tile: Tile.dice }),
    treemap({ by: "species", size: "count", tile: Tile.slice })
  )
  .mark(rect({ fill: "species" }));
```

- **Two jobs share one name: yes**: (a) Lay whole children end to end so their sizes add up to the whole (bars, a mosaic's segments). Local, and it needs CanSum. (b) A running sum per position for a collective mark: at each x, the heights of the series below. (b) is a computation across marks along a key, which is why it fights the mark hierarchy when it is spelled on the series.
- **Two directions, one rule**: The rule: the whole's size is the sum of its parts along one axis. Bottom-up, the parts are given and the whole is their sum: `stack`. Top-down, the whole is given and the parts divide it: by weight (`stack` with `size`, `treemap` with `Tile.slice` or `Tile.dice`, `cut` with `size`), or by cells of a scale (`partition`, `cut` by a binned key). Job (b) read top-down is a divide of the total, which is local. That is why divide fits it.
- **Is `partition` the twin of `stack`? No**: `partition` places each group in the cell of a binned key at its true place on one continuous scale (descriptors.ts). Its sizes come from the scale, not from siblings. The weight-divider is `stack`'s own `size` mode.
- **Overlap regime: a large partial overlap**: Dividing a box by weight along one axis is spelled three ways: `stack({ size })`, `treemap({ tile: Tile.slice })` and `cut({ size })`. The mosaic renders show the first two drawing the same picture (treemap also sorts by size). That is a design smell, separate from this proposal; drafted as `issues/stack-divide-family.md`. `stack`'s descriptor doc also still says "`spread({ glue: true })`", the framing Josh rejected on 11-05.
- **(b) as a data transform?**: d3.stack and the Vega-Lite stack transform write the offsets into the rows (`y0`, `y1`), and the mark places each vertex by its span (code below). Nothing reaches across marks, and the offsets are visible columns. But it repeats the summing next to the layout `stack` (a partial overlap), and loses px sizes, CanSum checks and centered stacks. Divide gets the same locality with no second sum. The transform is third.
- **Where `spread` sits**: `spread` keeps each child's space separate, with gaps: a ridgeline, small multiples. Nothing adds up, so it is outside the rule.
- **Recommendation**: `stack` stays an operator for job (a). Job (b) is a divide of the total, spelled `cut` on the collective mark. The family overlap goes to its own issue.

```js
// Job (b) as a data transform (d3.stack, the Vega-Lite stack transform):
// write the offsets into the rows, then place each vertex by its span
chart(rows)
  .flow(
    derive(stackOffsets({ by: "c", along: "x", value: "y" })), // adds y0, y1
    group({ by: "c" }),
    scatter({ by: "x", x: "x", yMin: "y0", yMax: "y1" })
  )
  .mark(ribbon({ fill: "c" }));
```

## Divide: Mascot's operator, GoFish's cut

```js
// Mascot.js, docs/demos/static/stackedAreaChart.js (verbatim, trimmed)
let rect = scene.mark("rect", { top: 60, left: 100, width: 800, height: 450 });
let anyArea = msc.densify(rect, data, {
  orientation: "horizontal",
  attribute: "date",
});
let { newMark: area, collection: areas } = msc.divide(anyArea, data, {
  orientation: "vertical",
  attribute: "industry",
});
msc.update(areas.layout, { vertCellAlignment: "bottom" }); // "middle" in streamGraph.js
msc.encode(area, "height", "unemployments");
msc.encode(area.anyVertex, "x", "date");
```

- **What Mascot has**: Six generative operations that join graphics with data (Liu et al., MSC, VIS 2024, section 4.2): repeat, divide, densify, classify, repopulate and stratify. Divide "splits a mark into a collection of smaller marks": a rect into rects (horizontal or vertical), a circle into a pie or rings, a line into lines, a pie or ring into arcs. Densify "transforms a rectangle into an area mark, a circle into a polygon, and a line into a polyline" by adding one vertex per value. Stratify layers a mark by a tree (icicle, sunburst). Both divide and densify give each new mark or vertex the rows that share a value as its data scope.
- **How Mascot draws a stacked area**: `stackedAreaChart.js` in the Mascot gallery: densify a rect by date (one area with a vertex per date), then divide that area by industry, then set the collection layout's `vertCellAlignment` to `bottom`. `streamGraph.js` is the same with `middle`. A stacked bar is repeat then divide (paper, section 4.6). So in Mascot a stacked area is literally a divided area, and the parent area exists before its pieces.
- **Is a croissant a divided density?**: Yes: the density area divided across x at its quantiles. That is a divide by cells, not by weight.
- **Is divide partition applied to one mark?**: Half of it. Divide by cells (the croissant) is `partition` applied to one mark: the cells come from a binned key on the mark's scale. Divide by weight (the stacked area, the 100% bar) is `stack`'s top-down mode (`size`) applied to one mark.

### The croissant: a density divided along x

![](img/c-normal.png)

The same `cut`, across x and by cells: the pieces are the parts of the density inside each quantile cell, with a gap. Today the croissant hides a density layer and intersects it with one region per cell; `cut` is defined as exactly that (`mask(window, source)`, #404).

```js
// The croissant: a density divided along x at its quantiles (absolute cells)
chart(days).mark(
  ribbon({ x: "v", h: x.density("v") }).cut({
    by: x.bin(Bin.quantiles(10)),
    dir: "x",
    inset: 2,
  })
);
```

Today:

```js
// Today: a hidden density layer, a grid, and an intersect layer per cell
chart(densityCurve(d))
  .flow(scatter({ x: "v" }))
  .mark(ribbon({ h: "density" }).name("density").hidden())
  .layer(
    chart(quantileRows(d, 10))
      .flow(partition({ by: field("v").bin(Bin.quantiles(10)) }))
      .mark(intersect([region(), ref("density")]))
  );
```

### 100% bars: a rect divided by weight

![](img/d-hundred-cut.png)

Today's `cut` already divides each lake's fixed-height rect by species weight (render). Two gaps show: the slices do not read `fill` per piece (they render black), and today the pieces are laid out by a `stack` in the flow above the mark, which is the hierarchy fight in another form.

```js
// 100% bars: a fixed-height rect per lake, divided by species weight
chart(seafood)
  .flow(spread({ by: "lake", dir: "x" }))
  .mark(
    rect({ w: 40, h: 200, fill: "species" }).cut({
      by: "species",
      dir: "y",
      size: "count",
    })
  );
```

Today:

```js
// Today (render): cut returns one slice per row, and a stack lays them out.
// The slices do not read fill per piece yet (they render black).
chart(seafood)
  .flow(spread({ by: "lake", dir: "x" }), stack({ dir: "y" }))
  .mark(
    rect({ w: 40, h: 200, fill: "species" }).cut({ dir: "y", size: "count" })
  );

// Today, with stack's top-down mode
chart(seafood)
  .flow(
    spread({ by: "lake", dir: "x" }),
    stack({ by: "species", dir: "y", size: field("count").normalize() })
  )
  .mark(rect({ fill: "species" }));
```

### Why GoFish set divide aside, and whether the reasons hold

- **"Coupled to marks in those systems, whereas I think they should be pure operators" (#48)**: Not a good reason any more. Dividing empty space does want an operator (`partition`, `bin`). But when the pieces take their shape from a mark (an image, an area, a circle into a pie), the coupling is the point. GoFish conceded this in #208 ("probably best exposed as a modifier", goal syntax `image().cut()`) and shipped `cut` that way in #404.
- **"It returns an array of children; operators return one element" (#208)**: Was a real constraint, now solved: `cut` is an expand mark. What is left is its syntax, which Josh wanted to revisit (#404): today a flow operator above the mark lays out the pieces. For a divided area the pieces would stay inside the cut mark, which is cleaner.
- **A second route to stacked bars**: Real, but at the edge. `spread, stack, rect` and `spread, rect.cut(...)` draw the same stacked bar. Overlap at a degenerate case (a rect divided is rects stacked) is allowed if `cut` on a rect is defined by that rewrite, `stack({ size })` inside the rect's box. The bigger overlap is in the family below.
- **Mascot links attach at a node's middle (#47)**: A criticism of Mascot's sankey links, not of divide.
- **Sizes are relative in cut, absolute in stack (#47 anchors notes)**: Still true and still matters for sankey slots, which need absolute sizes and slack. For a divided area it does not matter: the parent's `h` is the sum, so relative and absolute agree.

## Relation to stacked ribbons (#47)

### Parallel sets: positions are axes

![](img/j-parallel-sets.png)

#47's prototype render, today's engine. The structure of a stacked area: positions along x, ends stacked at each, ribbons threading a key (`path`). The categories are separated with `spread`, so the ends inside a category stack and the categories keep gaps.

```js
// #47 (today's working form): axes are positions, ends stack inside categories
chart(ends) // one row per (cohort, axis)
  .flow(
    spread({ by: "axis", dir: "x", spacing: 120 }),
    spread({ by: "category", dir: "y", spacing: 12 }),
    spread({ by: "rank", dir: "y", spacing: 0 }) // a stack; spacing 0 works around a stack scale bug
  )
  .mark(rect({ w: 12, h: "value", fill: "class" }).name("ends"))
  .layer(
    chart(selectAll("ends"))
      .flow(group({ by: "path" }))
      .mark(ribbon())
  );
```

```js
// the stacked area in the same shape: x positions, series ends stacked in each
chart(rows)
  .flow(scatter({ by: "x", x: "x" }), stack({ by: "c", dir: "y" }))
  .mark(ribbon({ h: "y", fill: "c" }));
```

### Sankey: the slots live on a placed node

![](img/j-energy.png)

#47's anchor prototype render (emulated anchors). The same `stack` runs on each node's sides. What the stacked area does not need: a node size with slack, two sides with their own order, and links joined by name.

```js
// #47 (anchors): the slots live on a placed node's side
chart(nodes)
  .flow(spread({ by: "depth", dir: "x" }), spread({ by: "name", dir: "y" }))
  .mark(
    rect({ w: 12, h: "value" })
      .anchor({ name: "in", position: "x-min", slots: data().flow(stack()) })
      .anchor({ name: "out", position: "x-max", slots: data().flow(stack()) })
      .name("nodes")
  )
  .layer(ribbon({ from: "nodes.out", to: "nodes.in" }));
```

- **Is a stacked area the same idea?**: Same structure, different place. #47's own summary: "a sankey is a stacked area chart whose stacks are nodes". In a stacked area each x is a position, the series ends stack at it, and a ribbon threads the ends that share a key. Parallel sets are the same structure with discrete axes (render). The divided ribbon's rewrite builds exactly that: an invisible anchor per (x, series), stacked inside each x slice.
- **Where they differ**: Where the 1D space comes from. A stacked area's slices are positions the flow made, with no mark of their own: no size, no slack, no second side, and the end order is the series key's order. A sankey's ends live on a side of a placed node, which brings node size and slack, in and out sides with their own orders, ends ordered by the far node, and links joined by row or by name (`nodes.out`).
- **Anchors are a divide of a side**: An anchor's slots divide one part of a mark (its side) into intervals. That is Mascot's divide applied to a part, with absolute sizes and slack. So the family is: `cut` divides a mark's extent, `.anchor()` divides a part of its outline, and both are local to their host mark.
- **No reversal of #47**: An earlier draft of this round brought back `ribbon().stack()` and reversed #47's approach C. With divide as the lead, that reversal is withdrawn: #47's decision stands. It comes back only if Josh picks the runner-up.
- **Other #47 decisions**: "Ribbon width from anchor sizes" agrees: the fused `h` goes to an invisible anchor (#748). References by anchor name do not come up. #47's open item about moving the join to `resolve` is not touched.

| System | Stacking and grouping | Checked |
| --- | --- | --- |
| ggplot2 | `geom_area(position = "stack")`; `geom_density(position = "stack")` stacks densities on a shared grid. The stack is an option of the layer, computed on the rows. `geom_line` connects in x order; `geom_path` in data order. `group` defaults to the interaction of the discrete variables. | verified (aes_group_order, geom_path pages) |
| Vega-Lite | `stack` is a property of the x or y encoding (`zero`, `normalize`, `center`, `null`), on by default for bar, area and arc when a non-position channel maps another field. Non-position channels set the series; the `order` channel sets the stack order. | verified (stack page) |
| Observable Plot | `Plot.areaY(data, Plot.stackY({ x, y, fill }))`: the stack is a transform on the mark's options; `z`, `fill` or `stroke` set the series. | from memory: the docs page refused the fetch (HTTP 429) |
| matplotlib | `ax.stackplot(x, y1, y2, ...)`: a separate function over shared x. | from memory |

## Rows over a continuous index

Renders use the real `scatter`, `stack`, `ribbon` and `line` on an emulated continuum (`continuumIndex` in `stories/proposals/croissantDist.ts` picks the v values adaptively before layout).

### Normal croissant, curve from a continuum

**Works: rendered with the real ribbon.**

![](img/c-normal.png)

The curve layer: one ribbon over the continuum. The cuts and dots still come from the Dist, as in every approach. B, at the bottom of the code, is shorter still.

```js
chart(params)
  .flow(sweep({ v: x.range() }))
  .mark(
    ribbon({ x: "v", h: x.density("v") })
      .name("density")
      .hidden()
  );

// B is short for exactly that
chart(params).mark(ribbon({ h: x.density() }).name("density").hidden());
```

Rewrites to (runs today):

```js
// What it rewrites to: the mark's x is a scatter right before the mark
chart(params)
  .flow(sweep({ v: x.range() }), scatter({ by: "v", x: "v" }))
  .mark(
    ribbon({ h: x.density("v") })
      .name("density")
      .hidden()
  );
```

Python:

```python
(
    chart(params)
    .flow(sweep(v=x.range()))
    .mark(ribbon(x="v", h=x.density("v")).name("density").hidden())
)
```

### Two densities, stacked at each x

**Works: the stack runs inside each slice.**

![](img/c-stack.png)

Josh's picture, divided. `sweep` crosses each params row (one per series) with v. The ribbon is the total density at each v (sizes add), and `cut` divides it by series, so g sits on f at every v. The rewrite is a stack inside each v slice, which the render runs on an emulated continuum. In the render g is scaled by 0.6.

```js
// one row per curve: { series, mean, sd }; x = dist.normal({ mean: "mean", sd: "sd" })
// The ribbon is the total density at each v; cut divides it by series
chart(params)
  .flow(sweep({ v: [-4, 4] }))
  .mark(
    ribbon({ x: "v", h: x.density("v"), fill: "series" }).cut({
      by: "series",
      dir: "y",
    })
  );
```

Rewrites to (runs today):

```js
// What it rewrites to: x is a scatter by v, and the division is a stack inside each v slice
chart(params)
  .flow(
    sweep({ v: [-4, 4] }),
    scatter({ by: "v", x: "v" }),
    stack({ by: "series", dir: "y" })
  )
  .mark(ribbon({ h: x.density("v"), fill: "series" }));
```

Python:

```python
(
    chart(params)
    .flow(sweep(v=[-4, 4]))
    .mark(ribbon(x="v", h=x.density("v"), fill="series").cut(by="series", dir="y"))
)
```

### A plain function

**Works.**

![](img/c-sin.png)

No Dist, so the interval is written as a pair. The row accessor `(d) => wave(d.v)` is a tentative spelling; in Python a lambda over a row needs the callback bridge.

```js
const wave = (v) => Math.sin(v) + 0.3 * Math.sin(7 * v);

chart([{}])
  .flow(sweep({ v: [0, 4 * Math.PI] }))
  .mark(line({ x: "v", y: (d) => wave(d.v) }));
```

Rewrites to (runs today):

```js
// What it rewrites to
chart([{}])
  .flow(
    sweep({ v: [0, 4 * Math.PI] }),
    scatter({ by: "v", x: "v", y: (d) => wave(d.v) })
  )
  .mark(line());
```

Python:

```python
def wave(v):
    return math.sin(v) + 0.3 * math.sin(7 * v)


chart([{}]).flow(sweep(v=[0, 4 * math.pi])).mark(line(x="v", y=lambda d: wave(d["v"])))
```

### A parametric curve

**Works.**

![](img/c-spiral.png)

The index t is neither x nor y, so the path names it with `along: "t"`, the option #786 added. A continuous `scatter`, which uses its index set as the x axis, has no spelling for this curve.

```js
// The path follows t; x and y are both functions of it
chart([{}])
  .flow(sweep({ t: [0, 6 * Math.PI] }))
  .mark(
    line({
      along: "t",
      x: (d) => d.t * Math.cos(d.t),
      y: (d) => d.t * Math.sin(d.t),
    })
  );
```

Rewrites to (runs today):

```js
// What it rewrites to
chart([{}])
  .flow(
    sweep({ t: [0, 6 * Math.PI] }),
    scatter({
      by: "t",
      x: (d) => d.t * Math.cos(d.t),
      y: (d) => d.t * Math.sin(d.t),
    })
  )
  .mark(line());
```

Python:

```python
(
    chart([{}])
    .flow(sweep(t=[0, 6 * math.pi]))
    .mark(
        line(
            along="t",
            x=lambda d: d["t"] * math.cos(d["t"]),
            y=lambda d: d["t"] * math.sin(d["t"]),
        )
    )
)
```

### Which operator makes the continuum

- **A new operator, `sweep({ v: [a, b] })` (recommended)**: A count and an interval make rows of different types. After `repeat(n)`, `spread`, `sort`, counting and a mark per row are legal. After `sweep`, they are errors, and a connector samples the rows instead. So the two differ in what may follow them, not just in their argument. Two operators is the honest factoring, and they share no case worth building through one mechanism: a zero-width interval is one point, which nobody would write as a sweep.
- **Extend `repeat`: `repeat(interval, "v")` (runner-up)**: One name and Mathematica's precedent: `Table[expr, {i, imin, imax}]` steps by 1, and `Plot[f, {x, xmin, xmax}]` samples the same iterator form continuously. But then the type of what `repeat` returns depends on its argument, and an error after it (a `spread` after a continuum) points at a later step. `repeat` should feel discrete.
- **Continuous `scatter`: `scatter({ x: interval })` (rejected)**: Makes the rows and places them in one step. `scatter` today only places rows it is given. So the continuous form would overlap `sweep` + `scatter` over most of its range, which api-design.md calls the wrong factoring. It also cannot spell a parametric curve, and its stack needs an implicit `by`.

```js
// Rejected: a continuous scatter makes rows and places them in one step
chart(params)
  .flow(scatter({ x: x.range() }))
  .mark(ribbon({ h: x.density() }));

// Runner-up: one operator, repeat, over a count or an interval
derive(repeat(1000, "draw")); // rows 0 to 999
derive(repeat(interval(0, 1), "p")); // a row for every p in [0, 1]

// Recommended: two operators, because their outputs allow different operators after them
derive(repeat(1000, "draw")); // a list: spread, sort, count, per-row marks are legal
sweep({ p: [0, 1] }); // a continuum: those are errors; connectors sample it
```

```js
// The same step under each candidate name
sweep({ v: x.range() }); // recommended
continuum({ v: x.range() }); // runner-up name
interval({ v: x.range() }); // clashes with #980's interval
domain({ v: x.range() }); // clashes with Domain and every scale domain
span({ v: x.range() }); // clashes with a channel's { min, max } span

// It reads well with #980's own interval: sweep the central 95%
sweep({ v: x.interval(0.95) });
```

| Name | What it is | Note |
| --- | --- | --- |
| `sweep` (recommended) | No GoFish export or option uses it, on main or on the #980 branch. It appears only as local variables in arc code and in prose: `centralAngle` is the polar "total angular sweep", and the animation clock input documents "one sweep of the domain", the same meaning. A verb that says the index moves over the whole interval. Python: `sweep(v=[a, b])`. | no clash; no visualization precedent checked |
| `continuum` | Free everywhere. A noun, and long; it names the result, not the step. | no clash; runner-up name |
| `interval` (Josh's suggestion) | Clashes in the uncertainty vocabulary. On the #980 branch `x.interval(0.95)` is a central interval of a Dist (25 uses in its proposal docs and stories), `interval({ x, levels })` is the user function that draws one, after ggdist's interval geom, and `centralIntervals` is a helper. Main already calls a `dims` entry `{ min, max }` an interval. The operator could take the value constructor's place (`interval({ v: [0, 2 * Math.PI] })`), but then `interval(...)` would make rows in a flow and a span everywhere else. Better: interval is the type of `sweep`'s argument, so `sweep({ v: x.interval(0.95) })` reads well. | serious clash |
| `domain` | TikZ's `domain=a:b` and Mathematica's `{x, a, b}` iterator are the precedent. But GoFish already has the `Domain` family (`Domain.discrete(levels)`, with `Domain.continuous` planned as the type of an interval of numbers), plus every scale domain and the domain-inference pass. | serious clash |
| `span` | Main uses span for a channel's `{ min, max }` extent (`xMin`/`xMax` in scatter's `dims`). | clash |
| `sample`, `range`, `along` | Taken: #980's `value.sample`, `x.range()`, and the `along` option of `line` and `ribbon`. | rule out |
| Precedent for a continuous index step | Mathematica's `{x, xmin, xmax}` iterator. TikZ `domain` (initially -5:5) with `samples` (initially 25). Vega-Lite `sequence` (`step` defaults to 1, `stop` exclusive) and polars `linear_space` (requires `num_samples`) are discrete. Wilkinson's GPL puts a density in a channel instead: `line(position(density.normal(x)))`. | verified |

## The croissants in the short form (B)

### Croissant of the standard normal

![](img/b-normal.png)

The front-page chart under B. There is no grid and no comment about [-3, 3]. The curve comes from `x.density()`, drawn while laying out. The cells end at the normal's quintiles, and the dots sit at its 0.1, 0.3, 0.5, 0.7 and 0.9 quantiles.

```js
const params = [{ mean: 0, sd: 1 }];
const x = dist.normal({ mean: "mean", sd: "sd" });

croissant(params, x, { n: 5, fill: PAPER_FILL, stroke: PAPER_STROKE }).render(
  container,
  {
    w: 480,
    h: 200,
    axes: { x: true, y: false },
  }
);
```

Today:

```js
// The standard normal on [-4, 4]: wide enough that the outer quantile rows
// are accurate (on [-3, 3] the missing tails move the outer cells' medians).
const normalGrid = gridOf((x) => normPdf(x), -4, 4, 401);

croissant(normalGrid, { n: 5, fill: PAPER_FILL, stroke: PAPER_STROKE }).render(
  container,
  {
    w: 480,
    h: 200,
    axes: { x: true, y: false },
  }
);
```

### Penguin body mass, a kernel density estimate

![](img/b-penguin-body-mass.png)

`field(x).kde()` is #980's smoothed sample: one Dist from the group's rows. Its cdf is exact (a sum of normal cdfs), so the ten cuts need no grid either.

```js
croissant(penguins, field("Body Mass (g)").kde()).render(container, {
  w: 520,
  h: 220,
  axes: { x: { title: "Body mass (g)" }, y: false },
});
```

Today:

```js
const masses = penguins.map((p) => p["Body Mass (g)"]).filter((v) => v != null);
const massGrid = gridOf(kde(masses).f, 2200, 6800, 461);

croissant(massGrid).render(container, {
  w: 520,
  h: 220,
  axes: { x: { title: "Body mass (g)" }, y: false },
});
```

### Ridgeline of Seattle highs by month

![](img/b-ridgeline.png)

The `flatMap` that built 12 grids by hand is gone. `temp` is one smoothed Dist per month, because `kde()` folds the rows of the group it runs in. Each month's curve is drawn from its own Dist.

```js
const temp = field("temp_max").kde(); // one smoothed Dist per month, from its days

chart(weather, { w: 520, axes: { x: { title: "Daily high (°C)" }, y: false } })
  .flow(
    spread({
      by: field("month").sort(months),
      dir: "y",
      anchor: "baseline",
      spacing: 36,
    })
  )
  .mark(
    layer({ h: 34 }, [
      chart().mark(ribbon({ h: temp.density() }).name("density").hidden()),
    ]).relate(({ density }) => [
      chart()
        .flow(partition({ by: temp.bin(Bin.quantiles(5)), dir: "x" }))
        .mark(
          layer([
            intersect({ fill: FILL, stroke: STROKE, strokeWidth: 1.5 }, [
              density,
              region({ inset: 2 }),
            ]),
            circle({ cx: temp.median(), cy: 5, r: 2.25, fill: STROKE }),
          ])
        ),
    ])
  )
  .render(container);
```

Today:

```js
// One density per month of Seattle's daily highs, each on its own grid from
// three bandwidths below the month's lowest high to three above its highest.
const monthlyDensity = months.flatMap((month, m) => {
  const highs = seattleWeather
    .filter((d) => new Date(d.date).getUTCMonth() === m)
    .map((d) => d.temp_max);
  const { f, bw } = kde(highs);
  const lo = Math.min(...highs) - 3 * bw;
  const hi = Math.max(...highs) + 3 * bw;
  return gridOf(f, lo, hi, 161).map(({ x, pdf }) => ({
    month,
    temp_max: x,
    pdf,
  }));
});

chart(monthlyDensity, {
  w: 520,
  axes: { x: { title: "Daily high (°C)" }, y: false },
})
  .flow(
    spread({
      by: field("month").sort(months),
      dir: "y",
      anchor: "baseline",
      spacing: 36,
    })
  )
  .mark(
    layer({ h: 34 }, [
      chart()
        .flow(scatter({ x: "temp_max" }))
        .mark(ribbon({ h: "pdf" }).name("density").hidden()),
    ]).relate(({ density }) => [
      chart()
        .flow(
          derive((rows) =>
            quantileRows(rows, { x: "temp_max", density: "pdf", n: 1000 })
          ),
          partition({ by: field("temp_max").bin(Bin.quantiles(5)), dir: "x" })
        )
        .mark(
          layer([
            intersect({ fill: FILL, stroke: STROKE, strokeWidth: 1.5 }, [
              density,
              region({ inset: 2 }),
            ]),
            circle({
              cx: field("temp_max").median(),
              cy: 5,
              r: 2.25,
              fill: STROKE,
            }),
          ])
        ),
    ])
  )
  .render(container);
```

### The croissant helper the three stories share

The helper takes the rows and the Dist. The grid, `normPdf`, `kde`, `quantileRows` and the `scatter` that placed grid rows all leave user code.

```js
// The croissant of a Dist x over the rows of data: the density, unseen, then in each of its
// n equal-probability cells the density's area cut to the cell, and a dot at the cell's median.
const croissant = (data, x, { n = 10, fill = FILL, stroke = STROKE } = {}) =>
  layer([
    chart(data).mark(ribbon({ h: x.density() }).name("density").hidden()),
  ]).relate(({ density }) => [
    chart(data)
      .flow(partition({ by: x.bin(Bin.quantiles(n)), dir: "x" }))
      .mark(
        layer([
          intersect({ fill, stroke, strokeWidth: 2 }, [
            density,
            region({ inset: 3 }),
          ]),
          circle({ cx: x.median(), cy: 6, r: 3, fill: stroke }),
        ])
      ),
  ]);
```

Python:

```python
def croissant(data, x, n=10, fill=FILL, stroke=STROKE):
    return layer([chart(data).mark(ribbon(h=x.density()).name("density").hidden())]).relate(
        lambda density: [
            chart(data)
            .flow(partition(by=x.bin(Bin.quantiles(n)), dir="x"))
            .mark(
                layer(
                    [
                        intersect([density, region(inset=3)], fill=fill, stroke=stroke, stroke_width=2),
                        circle(cx=x.median(), cy=6, r=3, fill=stroke),
                    ]
                )
            )
        ]
    )


x = dist.normal(mean="mean", sd="sd")
croissant([{"mean": 0, "sd": 1}], x, n=5, fill=PAPER_FILL, stroke=PAPER_STROKE)

croissant(penguins, field("Body Mass (g)").kde())
```

Today:

```js
const normPdf = (x, mu = 0, sd = 1) =>
  Math.exp(-0.5 * ((x - mu) / sd) ** 2) / (sd * Math.sqrt(2 * Math.PI));

// n evenly spaced grid rows { x, pdf } of f over [lo, hi].
const gridOf = (f, lo, hi, n) =>
  Array.from({ length: n }, (_, i) => {
    const x = lo + ((hi - lo) * i) / (n - 1);
    return { x, pdf: f(x) };
  });

// A Gaussian kernel density estimate of values, with Silverman's bandwidth.
const kde = (values) => {
  const n = values.length;
  const mean = values.reduce((s, v) => s + v, 0) / n;
  const sd = Math.sqrt(
    values.reduce((s, v) => s + (v - mean) ** 2, 0) / (n - 1)
  );
  const bw = 1.06 * sd * n ** -0.2;
  return {
    bw,
    f: (x) => values.reduce((s, v) => s + normPdf(x, v, bw), 0) / n,
  };
};

const croissant = (grid, { n = 10, fill = FILL, stroke = STROKE } = {}) =>
  layer([
    chart(grid)
      .flow(scatter({ x: "x" }))
      .mark(ribbon({ h: "pdf" }).name("density").hidden()),
  ]).relate(({ density }) => [
    chart(grid)
      .flow(
        derive((rows) =>
          quantileRows(rows, { x: "x", density: "pdf", n: 1000 })
        ),
        partition({ by: field("x").bin(Bin.quantiles(n)), dir: "x" })
      )
      .mark(
        layer([
          intersect({ fill, stroke, strokeWidth: 2 }, [
            density,
            region({ inset: 3 }),
          ]),
          circle({ cx: field("x").median(), cy: 6, r: 3, fill: stroke }),
        ])
      ),
  ]);
```

## Stress tests for the short form

### Coordinates: a density in polar

**Works in B.**

![](img/b-polar.png)

The same single pass maps x ↦ (x, f(x)), then the coordinate transform, so the curve bends with no extra code. The prototype draws a sum of two von Mises bumps. It found one bug in the existing resampler: like d3's, it never splits a segment whose two ends land on the same pixel, and a closed curve from 0 to 2π starts and ends at the same point. Starting from 16 segments instead of 1 fixes it.

```js
// Wind directions as a density in polar: the same resampler bends it.
const direction = dist.mixture(
  [
    dist.vonMises({ mu: Math.PI / 3, kappa: 4 }),
    dist.vonMises({ mu: (4 * Math.PI) / 3, kappa: 8 }),
  ],
  { weights: [0.7, 0.3] }
);

chart([{}], { coord: Coord.polar(), w: 300, h: 300 }).mark(
  ribbon({ h: direction.density(), fill: FILL, stroke: STROKE })
);
```

### A plain function over a given domain

**Works in B.**

![](img/b-sin.png)

No Dist, so no default range: `fn` takes its domain. The y domain (−1.3 to 1.3) is found before layout by sampling in data space, invisibly.

```js
// A plain function: no Dist, so its domain is given.
const wave = fn((x) => Math.sin(x) + 0.3 * Math.sin(7 * x), {
  x: [0, 4 * Math.PI],
});

chart([{}], { w: 420, h: 160 }).mark(line({ y: wave }));
```

### A parametric curve

**Works in B.**

![](img/b-parametric.png)

A graph is the special case x(t) = t, so the prototype is written for t ↦ (x(t), y(t)) and draws a spiral with the same resampler. The spelling, one `fn` read by two channels, is tentative.

```js
// A parametric curve: one function of t gives both channels.
const spiral = fn((t) => ({ x: t * Math.cos(t), y: t * Math.sin(t) }), {
  t: [0, 6 * Math.PI],
});

chart([{}], { w: 300, h: 300 }).mark(line({ x: spiral.x, y: spiral.y }));
```

### A narrow kernel, where sampling shows

**Works in B.**

![](img/b-narrow-bandwidth.png)

A 25 g bandwidth. B picks about 250 points along the curve, packed where it bends. A fixed 101 points (ggplot2's default) visibly flattens these peaks; 512 matches B (see approach A below).

```js
const mass = field("Body Mass (g)").kde({ smoothing: 25 });

chart(penguins, { w: 520, h: 60 }).mark(ribbon({ h: mass.density() }));
```

### Stacking two curves

**B alone: wall; as C: works.**

![](img/b-stack.png)

![](img/b-stack-from-rows.png)

Top: B alone under `stack`, with a function node per curve. `stack` moves each child's whole box, so the second curve sits on the first one's baseline, not on its curve. Bottom: the same two curves as rows, stacked at each x. C keeps the rows, so its stacked card above works. B is safe as the short form of C, not as a separate node.

```js
// B: stack moves whole boxes, so g sits on f's box, not on f's curve
stack({ dir: "y" }, [ribbon({ h: f.density() }), ribbon({ h: g.density() })]);
```

```js
// Rows (approach A): stack adds at each x
chart(rows) // { x, series, y }: f and g sampled on one grid
  .flow(scatter({ by: "x", x: "x" }), stack({ by: "series", dir: "y" }))
  .mark(ribbon({ h: "y", fill: "series" }));
```

## Answers for the short form

**Spelling.** `ribbon({ h: x.density() })` for an area, `line({ y: x.cdf() })` for a CDF, and `line({ y: fn(f, { x: [lo, hi] }) })` for a plain function. A function in one channel sets the mark's extent on the other axis. It sits beside #980's rule because `x.density()` is a function, not a Dist. A bare `x` in a position channel still means the blurred limit.

**Extent.** With no rows, the function's own domain sets the x span: a Dist's default range (the 0.001 to 0.999 quantiles of a normal, as ggdist; a smoothed sample's data plus 3 bandwidths, as seaborn), or `fn`'s given domain. The prototype uses this. ggplot2 uses the axis range instead, which can only work when another layer sets the axis first. Whether to union the two, and whether any override is needed, are open decisions.

**Domain before pixels.** The y scale needs the curve's maximum before layout knows pixels. Where the Dist knows its mode (a normal's peak is at its mean), it is exact. Otherwise the prototype samples 512 points in data space and refines the best one by golden-section search. This is invisible. A spike narrower than 1/512 of the range could be missed. The mark sees the true peak while drawing, so it could warn instead of drawing past the axis.

**The resampler claim.** It holds, with three caveats. `adaptiveResamplePath` takes any `{ transform }`, so x ↦ coord(scale(x, f(x))) is just a composed transform. (1) Its source must be in pixels, since it forces a split above 10 source units. The prototype passes the curve's parameter scaled to its length on screen. (2) It never splits a segment whose ends coincide, so a closed curve must start as several segments (fixed, see the polar card). (3) It tests one midpoint per segment, so a feature narrower than about 10 px can fall between samples, as in d3. For `intersect`, the mark also needs its outline before coordinates, so the prototype samples once for the outline and once, composed with the coordinates, for paint. In linear coordinates the two passes are the same.

**What is lost without rows.** The hover datum is the mark's own row (the Dist's parameters), not a sample point. `selectAll` finds one curve, not its sample points, which are only how it was drawn. Operators that need rows (`stack`, a label at the peak) have nothing to read. Under C the rows are back. Hover is the slice at the pointer. `selectAll` finds the curve, which is the continuum's connector. `stack` works inside each slice. `partition` cuts the index interval into sub-intervals. A cell's median follows the half-weight rule, given a weight (see the decisions).

## A: a finite grid

### A: the same spec over a finite grid

![](img/normal.png)

![](img/narrow.png)

Same picture, from #980's `densityCurve` helper with written-out defaults (`n: 512`, `range: x.range()`). Rows keep every row operator working, `stack` included. But a data step runs before the pixel scale exists, so it cannot be screen-aware, and `n` and `range` are part of the spec. This is the general pattern for sampling a function in a data step: a parameter grid plus an expression (matplotlib's `linspace`, ggplot2's `stat_function`, pgfplots' `domain`/`samples`, #980's `repeat(n, { level: "p" })` + `value.quantile("p")`). Under C, A is just `repeat` over a finite grid, so it needs no helper of its own.

A's resolution on the narrow kernel: 101 evenly spaced points (top), 512 (middle), and screen-adaptive (bottom).

```js
// A: the density as rows, made by #980's data helper; n and range default from the Dist
chart(data)
  .flow(
    derive((rows) => densityCurve(rows, x)),
    scatter({ x: "v" })
  )
  .mark(ribbon({ h: "density" }).name("density").hidden());

// written out
densityCurve(rows, x, { n: 512, range: x.range() });
```

### Why the cuts must come from the Dist (both approaches)

![](img/drift.png)

Today's spelling over a short grid, [-2.2, 2.2]. The brown dots are today's medians from `quantileRows`; the red dots are the exact ones. The outer brown dots sit at ±1.22, not ±1.28, because the cut-off tails are missing. The story's [-3, 3] warning is the same error, smaller (±1.275). A grid sets both the look and the cuts, so picking a range for looks moves the cuts.

```js
// Proposed: the cuts and dots come from the Dist, so no grid can move them.
croissant(params, dist.normal({ mean: "mean", sd: "sd" }), { n: 5 });
// cells end at x.quantile(0.2), x.quantile(0.4), ...; dots at x.quantile(0.1), x.quantile(0.3), ...
```

Today:

```js
// Today: the cuts and dots come from the grid, so a short grid moves them.
const grid = gridOf((x) => normPdf(x), -2.2, 2.2, 45);
croissant(grid, { n: 5, fill: PAPER_FILL, stroke: PAPER_STROKE });
```

## A continuous value type?

C is rows over a continuous type: a continuum is the interval with uniform weight, rows are point masses, and a Dist is a weight that totals 1. Everything B loses without rows is an ordinary operation on a continuous value. chebfun ("computing with functions") is the closest precedent: it stores a function adaptively, to about machine precision, and overloads MATLAB's vector commands, so `sum` is a definite integral and `max`, `roots` and `cumsum` work on the function. GoFish would need far less, only what the table below lists.

| Lost without rows | Operation | Field | Measure | Rows |
| --- | --- | --- | --- | --- |
| Hover datum | evaluate at a point | f(x₀) | density and cdf at x₀ | the row at x₀ |
| `selectAll` | the value itself | one curve | one Dist | the rows |
| `partition` | restrict to an interval | f on [a, b] | the measure cut to [a, b] (mass = its probability) | the rows in the cell |
| `stack` | pointwise add | f + g (same unit) | the sum of the measures (a weighted mixture) | add per x |
| sum | integrate | ∫f dx, in a new unit (degree-days) | the total weight (1 for a Dist) | Σ weights |
| median | where half the weight is | not defined: a field has no weight | the 0.5 quantile | the median row |
| y domain | max | max f | max density | max value |

```js
const mass = field("Body Mass (g)").kde(); // a measure: weight spread over x
const pdf = mass.density(); // a function of x: probability per gram

pdf.at(4200); // evaluate: the hover datum at the pointer
mass.bin(Bin.quantiles(5)); // restrict: partition cuts it into five measures
mass.median(); // half the weight
mass.total(); // integrate: 1 for a Dist, the count for rows
pdf.max(); // the y domain
pdf.plus(otherPdf); // pointwise add: what stack needs
```

Two kinds of continuous value behave differently. A **field** has a value at each x: temperature over a day, `sin`, or a pdf drawn as a height. It adds pointwise, and its median means nothing. A **measure** is an amount spread over x: a Dist, a population density. Its sum is an integral, and its median is where half the weight lies. Rows of plain numbers are a discrete measure, a point mass of weight 1 at each value. That is the "weight spread over x" rule for medians from the chat, so rows and continuous values can share `partition`, sum and median. A Dist is a measure whose total is 1. (Field here is the GIS sense of the word. GoFish's `field()` is the column accessor, so the API would need another name.)

One type or two? Probably one: a function of x whose unit decides. A density's unit is "per unit of x" (probability per gram), so integrating it over x gives an amount, and sum and median are legal. A field's unit has no "per x", so its median is an error and its integral changes unit. This is #980's scales tab again: "per" must name the field the amount is spread over, and the same unit tells a warp to scale a density by the inverse slope. The CF conventions for climate data draw the same line with their `cell_methods`. `point` is the default for an intensive quantity and `sum` for an extensive one. A measure is the density of a field times dx, so one representation carries both, and the unit says which.

Precedent:

- **chebfun**: Adaptive Chebyshev approximation of a function, to about machine precision. Overloads MATLAB's vector commands: `sum` is a definite integral, plus `max`, `roots`, `cumsum`, `mean` (checked on the chebfun site).
- **Mathematica `InterpolatingFunction`**: What `NDSolve` returns: a function object that is evaluated, differentiated and integrated like a formula (from memory; not re-checked for this page).
- **GIS: field and object views**: Rasters model a field (a value everywhere), and vector features model objects. The two have different operations, as field and measure do here (from memory; not re-checked for this page).
- **CF conventions, `cell_methods`**: Each value says what it stands for over its cell: `point` (the default for an intensive quantity), `sum` (for an extensive one), `mean`, `maximum`, `median` and more (checked in Appendix E).
- **sympy `Piecewise`**: A symbolic piecewise function, which `integrate` handles piece by piece: the restricted pieces a partition would make (from memory; not re-checked for this page).

## Precedent: a function as a mark input

| System | What the user writes | Range | Resolution | Screen-aware | Checked |
| --- | --- | --- | --- | --- | --- |
| Mathematica `Plot` | `Plot[f[x], {x, lo, hi}]` | user | `PlotPoints` (initial even samples) then up to `MaxRecursion` adaptive subdivisions; both `Automatic` by default | no: adapts in its own space | verified, reference page |
| Plots.jl | `plot(f, xmin, xmax)` | user | `PlotUtils.adapted_grid`: 31 even points, refined up to 7 times where curvature is large; applied after the axis scale functions | no: data space | verified, source |
| Makie | `lines(0..10, sin)` | the interval | `convert_arguments(::AbstractInterval, ::Function)` calls the same `adapted_grid` | no: data space | verified, source |
| ggplot2 `geom_function` | `geom_function(fun = dnorm)` | the scale (`xlim` to override) | `n = 101`, even | no | verified, reference page |
| function-plot | `{ fn: "x^2" }` | the viewport | interval arithmetic picks where to sample; re-evaluated whenever the scale changes | yes | verified, docs page |
| d3-geo resample | `projection.precision(...)` | n/a | adaptive to a pixel tolerance; the model for `adaptive-resampling.ts` | yes | GoFish source |
| seaborn `kdeplot` | `kdeplot(x=...)` | data ± `cut=3` bandwidths | `gridsize=200` | no | round 1 survey |
| ggdist `stat_slab` | `aes(xdist = dist_normal(0, 1))` | 0.001 to 0.999 quantiles (`p_limits`) | `n = 501` | no; intervals exact from the dist | round 1 survey |
| Vega-Lite `density` | `{ density: "x", extent, steps }` | data extent, or `extent` | adaptive, 25 to 200 steps | partly | round 1 survey |
| Desmos | type `y = sin(x)` | the viewport | adaptive, redone on pan and zoom | yes | not verified: no public docs |

Taking a function as a mark input is common (Mathematica, Plots.jl, Makie), and all of them sample adaptively without a knob in the usual case. But they adapt in data space at conversion time. Only the viewport systems (function-plot, Desmos) and d3-geo adapt on the screen. B does both: the function is in the spec, and it is sampled in pixels through the coordinate transform.

## Similar warts

- `stories/forwardsyntax/Croissant.stories.tsx`: three stories with `gridOf`, `kde` and `quantileRows`, and the Python port `tests/python-stories/forward-syntax/test_croissant.py`.
- `stories/lowlevel/NameScope.stories.tsx`: `NestedCallout` and `MedianTrend` sample normal pdfs on hand-written 81-point grids.
- `stories/lowlevel/ViolinPlot.stories.tsx` (gallery) uses `fast-kde`, and its Python port uses `scipy.stats.gaussian_kde`, so the two curves differ. A library `kde()` fixes that parity gap too.
- `apps/docs/docs/{js,python}/api/operators/derive.md` list `quantileRows`; both go with #1231.
- Not this wart: `RidgelineChart.stories.tsx` bins counts by hand (a histogram), and the `Math.sin` generators in other stories are made-up datasets.

## Issues cited

- #1332: this issue: remove the `gridOf` sampling wart from the croissant
- #980: distributions as first-class data; this proposal fits its design
- #1231: replace `quantileRows` with first-class distributions
- #544: croissant charts, merged in #1229
- #830: interaction as data: hover and zoom, where evaluating a function matters

## Open decisions

1. Divide or modifier: `ribbon({ x, h }).cut({ by: "c", dir: "y" })` (the lead), or `ribbon(...).stack({ by: "c" })` on the series ribbons (runner-up)?
2. Is the name `cut` right for dividing an area, or should `cut` be renamed `divide` (Mascot's word), with the image story as one use?
3. Should a divided ribbon's pieces stay inside the cut mark, so no flow operator lays them out? (Today's cut needs a `stack` above it, the syntax #404 left to revisit.)
4. Stacked lines have no extent to divide. Accept the flow `stack` inside a `scatter` for them, or add an edge-only paint so they are a cut's top edges?
5. Should `line` and `ribbon` take `x`, `y` and `along`, as sugar for a `scatter` right before the mark?
6. Is the error text for a flow `stack` of whole ribbons right, and should it name both `cut` and `spread`?
7. Keep `ChartBuilder.stack()` (sugar for the local flow `stack`), or remove it?
8. Streamgraph centering: keep `alignment: "middle"` on the outer `spread`, or put it on the cut?
9. In a divided ribbon, is a series missing at one x a 0 or an error?
10. Should a cut mark read `fill` and `stroke` per piece?
11. Should `line({ x })` sort by x, or keep data order?
12. #47 approach C stays rejected (no reversal). Agree?
13. File `issues/stack-divide-family.md` (stack with `size`, treemap slice/dice and cut all divide a box by weight)?
14. Name of the continuous operator: `sweep`, `continuum`, or `interval`? Which operators may run one slice at a time on it?
15. Keep B, `ribbon({ h: x.density() })`, as the shortest form?
16. The earlier open items stand: stack extent over Dists, cell weight, ridgeline quantiles, field vs measure, default range, infinite cells, peak warning.
