# Sankey layout: prototype notes

Prototype half of the sankey-layout proposal. Everything here runs on today's
main with **no core changes**. Stories live in
`packages/gofish-graphics/stories/_proposals/sankey-layout/`; the throwaway
helpers are in `_proto.ts` there, the datasets in `data.ts`. Images are in
`img/`. Render one with
`CAPTURE_ONE_PORT=3217 pnpm capture-one "Sankey Layout/<Approach>/<Story>"`.

**Ribbon spelling used everywhere (A, B, D):** the stacked-ribbons proposal's
"ends table" in refs-bag form: one row per link END, four spread tiers
(layer, node, side, far), ports as `rect`s named `"ports"`, then
`chart(selectAll("ports")).flow(group({ by: "link" })).mark(ribbon(...))`.
C uses `ribbon` / `arrow` / `line` combinators inside `.relate()` over named
marks. The ribbon spelling is not what this proposal is about.

**Datasets:** d3's UK energy graph (`src/data/energy.ts`, 48 nodes, 68
links); a small flow (10 nodes, columns 3 / 2 / 5, a link that skips a
column, an input order that crosses); a package dependency DAG (10 boxes, 12
edges, two edges that skip layers).

**d3 reference:** `img/d3-energy.png`, `img/d3-small.png`,
`img/d3-small-no-relax.png` (d3-sankey 0.12.3, `nodeAlign(sankeyJustify)`,
`nodePadding(10)`, 6 iterations). Script: `d3-reference/render-d3.mjs`
(needs `npm install d3-sankey@0.12.3` in a `pkg/` folder next to it; run
`node render-d3.mjs <repo-root>`).

---

## 0. The shared scale: does GoFish already do d3's `ky`? YES (with px gaps)

Story `Scale Probe/FixedGaps`, image `img/probe-shared-scale-fixed-gaps.png`.

```ts
chart(rows) // col A: 2 nodes of 50; col B: 10 nodes of 10; both total 100
  .flow(
    spread({ by: "col", dir: "x", spacing: 40, alignment: "start" }),
    spread({ by: "node", dir: "y", spacing: 20 })
  )
  .mark(rect({ w: 30, h: "v", fill: "col" }))
  .render(container, { w: 200, h: 300 });
```

d3 picks `ky = min_c (H − (n_c − 1)·py) / Σ_c = min(280/100, 120/100) = 1.2`.
Measured from the DOM: every B node is 12.0 px tall (10 × 1.2), B spans
exactly 0 to 300 (10 × 12 + 9 × 20), A nodes are 60.0 px (50 × 1.2), A spans 140. **Identical to d3.** The scale is solved over sibling columns of the
outer spread; nothing sankey-specific is needed for phase 4.

What does NOT match: d3 then spreads each column's leftover room evenly into
its gaps (and both margins). Trying that with `spacing: fr(1)`
(`Scale Probe/FlexibleGaps`, `img/probe-shared-scale-fr-gaps-fails.png`)
warns "mixes data-driven and flexible sizes ... no one scale fits both" and
draws the nodes at 27.5 px instead of 12. There is no "px minimum, slack
spread" spacing today (CSS `space-evenly` with a floor). Relaxation moves
nodes anyway, so this only matters for the no-relaxation look.

---

## A. Pure composition: data-side graph algorithms + existing operators

Stories `Approach A/{Energy, Small, SmallInputOrder, Dependencies}`.
Images `img/a-energy-tight.png`, `img/a-small-barycenter.png`,
`img/a-small-input-order.png`, `img/a-dependencies.png`.

```ts
const col = layers(names, links, "justify"); // STAND-IN: derive(layers(...))
const order = barycenterOrder(names, links, col); // STAND-IN: derive(order(...))
const ends = linkEnds(links, col, order); // stacked-ribbons ends table
layer([
  chart(ends)
    .flow(
      spread({
        by: field("layer").sort(),
        dir: "x",
        spacing: fr(1),
        alignment: "end",
        axes: false,
      }),
      spread({
        by: field("node").sort(sortedNames(names, col, order)),
        dir: "y",
        spacing: 10,
        axes: false,
      }),
      // the ribbon half: in-ports | out-ports, each stacked by the far end
      spread({
        by: field("side").sort(["in", "out"]),
        dir: "x",
        spacing: 0,
        alignment: "start",
        axes: false,
      }),
      spread({ by: field("far").sort(), dir: "y", spacing: 0, axes: false })
    )
    .mark(rect({ w: 6, h: "value", fill: "#555" }).name("ports")),
  chart(selectAll("ports"))
    .flow(group({ by: "link" }))
    .mark(ribbon({ opacity: 0.4, fill: "src", curve: Curve.bezier() })),
  chart(selectAll("ports"))
    .flow(group({ by: "node" })) // node labels
    .mark((ports) =>
      spread({ dir: "x", spacing: 3, alignment: "middle" }, [
        ports[0],
        text({ text: String(project(ports[0], "node")), fontSize: 9 }),
      ])
    ),
]).render(container, { w: 960, h: 600, axes: false, legend: false });
```

The DAG (`Dependencies`) uses a nodes table instead of the ends table:

```ts
chart(nodes, { axes: false })
  .flow(
    spread({
      by: field("layer").sort(),
      dir: "x",
      spacing: fr(1),
      alignment: "middle",
    }),
    spread({
      by: field("name").sort(sortedNames(depNames, col, order)),
      dir: "y",
      spacing: 24,
    })
  )
  .mark(
    rect({ w: 56, h: 24, fill: "#f3f3f3", stroke: "#555", strokeWidth: 1 })
      .label("name", { position: "center" })
      .name("box")
  )
  .layer(
    chart(depLinks)
      .flow(resolve(["source", "target"], { from: selectAll("box") }))
      .mark((edges) =>
        layer(
          edges.map((e) =>
            arrow({ stroke: "#777", bow: 0, stretch: 0 }, [e.source, e.target])
          )
        )
      )
  );
```

Proposed syntax it stands in for (helper names avoid `align`, which in
GoFish means the cross axis; the column rule is `layering`):

```js
chart(links)
  .flow(
    derive(
      layers({ from: "source", to: "target", layering: Layering.justify() })
    ), // adds `layer`
    derive(order({ by: "layer", ordering: Ordering.barycenter() })), // adds `order`
    spread({ by: "layer", dir: "x", spacing: fr(1) }),
    spread({ by: field("node").sort("order"), dir: "y", spacing: 10 }),
    ...ribbonEnds // the stacked-ribbons proposal's anchors
  )
  .mark(rect({ w: 6, h: "value" }));
```

```python
chart(links).flow(
    derive(layers(from_="source", to="target", layering=Layering.justify())),
    derive(order(by="layer", ordering=Ordering.barycenter())),
    spread(by="layer", dir="x", spacing=fr(1)),
    spread(by=field("node").sort("order"), dir="y", spacing=10),
).mark(rect(w=6, h="value"))
```

**Stand-ins:** `layers`, `barycenterOrder`, `linkEnds`, `sortedNames`
(`_proto.ts`). Node value = max(Σin, Σout) is NOT a stand-in: the ends table
gives it for free (a node is as tall as its taller port stack).

**Findings:**

- Phases 1 to 5 of d3 (value, layer, x, ky, initial stack) are all expressed
  by data helpers plus two spreads. Phase 4 (`ky`) is exact (section 0).
- Barycenter order matters: input order 72 crossings on energy, barycenter
  17; small 5 vs 1 (`d3-reference/crossings.ts`, node-center count for
  links between the same two columns).
- The DAG shows the limit of the field-only factoring: `ui → utils` and
  `cli → utils` skip layers and are drawn straight through the `http` /
  `ui` boxes. Sugiyama fixes this with **virtual nodes**, which are not data
  rows, so a `derive` helper cannot add them without inventing rows. See C.

---

## B. Relaxed coordinate assignment

Stories `Approach B/{Energy, Small, SmallRelaxThenResolve,
EnergyRelaxThenResolve}`. Images `img/b-energy-relaxed.png`,
`img/b-small-relaxed.png`, `img/b-small-relax-then-resolve.png`,
`img/b-energy-relax-then-resolve.png`.

```ts
const col = layers(names, links, "justify");
const { box, ky } = relax(names, links, col, { height: 600, padding: 10 }); // STAND-IN
const ends = linkEnds(links, col, yTop).map((e) => ({
  ...e,
  yMin: (600 - box.get(e.node).y1) / ky, // px -> value units; the y axis points up
  yMax: (600 - box.get(e.node).y0) / ky,
}));
chart(ends)
  .flow(
    spread({
      by: field("layer").sort(),
      dir: "x",
      spacing: fr(1),
      alignment: "start",
      axes: false,
    }),
    scatter({ by: "node", yMin: "yMin", yMax: "yMax", axes: false }), // <- replaces the node spread
    spread({
      by: field("side").sort(["in", "out"]),
      dir: "x",
      spacing: 0,
      alignment: "start",
      axes: false,
    }),
    spread({ by: field("far").sort(), dir: "y", spacing: 0, axes: false })
  )
  .mark(rect({ w: 6, h: "value", fill: "#555" }).name("ports"));
// + the same ribbon and label layers as A
```

`relax` is a port of d3-sankey 0.12.3 `computeNodeBreadths` (initial stack,
then `iterations` rounds of right-to-left and left-to-right sweeps, each
followed by `resolveCollisions`). Against d3's own output: **small dataset
0.00 px max error; energy up to 45 px** (the two runs diverge in the first
right-to-left sweep at column 0, where "Gas imports" and "Gas reserves" end
up in the other order; not resolved). Placing relaxed y as a value-unit
interval with `scatter` works: one y scale serves positions and node sizes.

**The question: can relaxation be a column placement strategy?** No. Evidence:

1. Code: d3's target for a node is `targetTop(source, node)` /
   `sourceTop(node, target)`, which reads the y of nodes in OTHER columns and
   the order of links inside them. A strategy on the inner `spread` sees only
   its own children. The outer operator (the one whose children are the
   columns) must also see the links, which no current operator does.
2. Iteration: column i's position depends on columns i−1 and i+1, which
   depend on column i. It is a fixed point over the whole graph.
3. The tempting split, "relaxation is a `derive`, collision removal is a
   local column strategy", changes the result. `interleave: false` in
   `relax` does exactly that split (sweeps without collision removal, then
   one per-column removal). Small: Export and Losses swap
   (`img/b-small-relax-then-resolve.png`). Energy: value-weighted vertical
   link travel Σ value·|Δy| rises 13% (509 045 → 574 847; d3 510 730),
   visibly more slanted bands (`img/b-energy-relax-then-resolve.png`).
   d3 needs collisions resolved INSIDE every sweep, because the next sweep's
   targets read the resolved positions.
4. Also: GoFish's `Overlap` strategies only move the FREE axis
   (`Overlap.separate` keeps y and moves x, a beeswarm), so there is no
   existing 1D same-axis overlap removal to reuse even for the local part.

So relaxation is a whole-graph pass. It can be (a) a data transform that
emits a y field, as prototyped here (honest, but it computes in px with its
own `ky` and padding, duplicating what the spreads know, and must be told
the chart height), or (b) a strategy of an operator that owns nodes AND
links, which is C.

Surprise: d3's relaxation does NOT minimize crossings. Energy: d3 27
crossings, plain barycenter order (A) 17. Relaxation straightens bands
(less vertical travel); barycenter untangles them. They are different
objectives, which is an argument for making them separate phases.

Proposed syntax it stands in for:

```js
derive(
  relax({
    from: "source",
    to: "target",
    by: "layer",
    size: "value",
    padding: 10,
    iterations: 6,
  })
); // adds yMin/yMax
// then scatter({ by: "node", yMin: "yMin", yMax: "yMax" })
```

```python
derive(relax(from_="source", to="target", by="layer", size="value", padding=10, iterations=6))
```

---

## C. A graph-layout operator with the Sugiyama phases as strategies

Stories `Approach C/{EnergyRelax, SmallRelax, SmallStack, Dependencies}`.
Images `img/c-energy-relax.png`, `img/c-small-relax.png`,
`img/c-small-stack.png`, `img/c-dependencies-virtual-nodes.png`.

```ts
// STAND-IN: layeredGeometry() computes everything; layered() emits
// absolutely placed rect / text marks and ribbon / arrow / line in .relate().
layered(
  energyNames,
  energyLinks,
  {
    w: 800,
    h: 600,
    layering: "justify",
    ordering: "barycenter",
    coordinates: "relax",
    spacing: 10,
    nodeSize: "value",
    nodeWidth: 12,
  },
  "sankey"
);

layered(
  depNames,
  depLinks,
  {
    w: 440,
    h: 220,
    layering: "left",
    ordering: "barycenter",
    coordinates: "stack",
    spacing: 24,
    nodeSize: 24,
    nodeWidth: 56,
    virtualNodes: true,
  },
  "graph"
);
```

Proposed syntax it stands in for (family names: `Place` is taken by label
placement and `Coord` by coordinate transforms, so phase 3 needs another
word; `Positioning` here):

```js
layered(
  {
    from: "source",
    to: "target",
    size: "value",
    spacing: 10,
    layering: Layering.justify(),
    ordering: Ordering.barycenter(),
    positioning: Positioning.relax({ iterations: 6 }),
  },
  {
    nodes,
    links,
    node: rect({ w: 12, fill: "#555" }),
    link: ribbon({ opacity: 0.4, fill: "source" }),
  }
);

layered(
  {
    from: "source",
    to: "target",
    spacing: 24,
    layering: Layering.longestPath(),
    ordering: Ordering.barycenter(),
    positioning: Positioning.stack(),
  },
  { nodes, links, node: rect({ w: 56, h: 24 }).label("name"), link: arrow() }
);
```

```python
layered(
    from_="source", to="target", size="value", spacing=10,
    layering=Layering.justify(), ordering=Ordering.barycenter(),
    positioning=Positioning.relax(iterations=6),
    nodes=nodes, links=links,
    node=rect(w=12, fill="#555"), link=ribbon(opacity=0.4, fill="source"),
)
```

**Stand-ins:** all of it (`layeredGeometry` in `_proto.ts`, `layered` in the
story). Marks are placed by literal `x` / `y`, so GoFish does no layout.

**Findings:**

- `c-energy-relax.png` is d3's layout (same `relax`), drawn with GoFish marks.
- **Virtual nodes are the one thing only C can do.** With them on, the two
  long DAG edges get bend points in the skipped layers, take part in the
  barycenter order and the stacking, and route around the boxes
  (`c-dependencies-virtual-nodes.png` vs `a-dependencies.png`). In A the same
  edges run through `http` and `ui`.
- C duplicates what A gets from GoFish: the shared scale, the column spread,
  the port stacking. Inside a real operator those should still BE the
  spread / stack machinery (C's `Positioning.stack()` is literally A's two
  spreads), with only `relax` and virtual nodes as new code.

---

## D. Elaboration macro (GoTree style)

Stories `Approach D/{Energy, Small}`. Images `img/d-energy-template.png`,
`img/d-small-template.png`. **These are pixel-identical to Approach A's
renders** (`cmp` on the PNGs), because the template expands into A's spec.

```ts
// the user's spec
sankey(
  { layering: "justify", spacing: 10 },
  { nodes: energyNames, links: energyLinks }
).render(container, { w: 960, h: 600 });
```

The template (~25 lines in the story) mirrors `packages/gofish-gotree`:
`tree(spec, data)` normalizes data, recursively emits `spread` / `layer`
combinators, and adds edges as `.relate()` clauses. `sankey(spec, data)`
runs the two data helpers and emits A's `layer([chart(ends).flow(4 spreads),
ribbon layer, label layer])`. It adds nothing a user could not write; it is
sugar, and it inherits A's limits (no relaxation, no virtual nodes) unless
it expands into C instead.

```python
sankey(nodes=nodes, links=links, layering=Layering.justify(), spacing=10)
```

---

## GoFish bugs and gaps hit

1. **A label layer flips what `alignment` means on y.** Story pair
   `Repro/AlignStartNoLabels` vs `Repro/AlignStartWithLabels`
   (`img/bug-align-no-labels.png`, `img/bug-align-with-labels.png`). Two
   columns via `spread({ dir: "x", alignment: "start" })` over a y spread.
   Without labels the short column sits at the top (rect y = 0). Adding
   `chart(selectAll("bars")).flow(group({ by: "node" })).mark((refs) =>
spread({ dir: "x" }, [refs[0], text(...)]))` as a sibling puts it at the
   bottom (rect y = 105). A and D use `alignment: "end"` to get top-aligned
   columns WITH labels; this is a declared workaround in the stories.
2. **Same story without `axes: false` on the render** throws
   `layer: axis 1 has a continuous type but no size claim`.
3. **`spacing: fr(1)` with data-sized children** cannot express d3's
   "px minimum, slack spread into the gaps" (section 0).
4. **No same-axis 1D overlap removal.** `Overlap.*` moves only the free axis.
5. **Labeling a non-leaf tier has no spelling.** A flow's leaf is a port;
   to label a node (a group of ports) the stories select the ports again,
   group by node and put the text beside the first port, so the label is
   centered on that port, not on the node.
6. **`line` through a box ref hid the box's label** (C, `Dependencies`): a
   `line` whose first point was the named box made the `text` drawn over
   that box disappear; starting the line at a 1 px helper rect fixed it. Not
   reduced to a minimal repro.
7. **`ref("name")` inside a `layer([...])` child list is rejected** with a
   clear message pointing to `.relate()`. Fine, but it means an operator
   that emits marks and edges must use `.relate()`.
8. **Two y conventions.** A literal `rect({ x, y })` in a `layer` measures y
   from the top (d3's px dropped in unchanged in C), while `scatter`'s `y` /
   `yMin` is a data axis that points up (B had to flip d3's px).
9. Long right-column labels run past the canvas (energy, 960 px): the label
   width is not part of the column spread's room.

---

# Round 2

Josh's questions: why does barycenter have fewer crossings than d3; can
column spacing fix the overlap; can tidy tree layout teach us something.
New stories: `Round 2 Spacing/*` and `Round 2 Tree/*`. New helpers at the
bottom of `_proto.ts` (`gapsFromLinks`, `ribbonMetrics`, `flatTree`,
`boxTree`, `contourTree`, `clusterTree`). The C wrapper moved to
`_layered.ts` so both C and Round 2 use it (C's renders are unchanged).
Numbers: `d3-reference/r2-metrics.ts` (run from `packages/gofish-graphics`
with `pnpm exec tsx ../../proposals/sankey-layout/d3-reference/r2-metrics.ts`).
d3 tree references: `d3-reference/r2-render-d3-tree.mjs` (d3-hierarchy 3).

## R2.1 Column spacing from the links

**The curve's slope.** `Curve.bezier()` puts both control points at the
main-axis midpoint (d3.linkHorizontal), so x is not linear in t:
x(t) = g·(1.5·t(1−t) + t³), y(t) = Δy·(3t² − 2t³). The steepest point is
t = ½ with slope **2Δy/g** (not 1.5Δy/g, which is smoothstep over a linear
x). So a slope cap s needs g ≥ 2Δy/s. A different curve gives a different
constant (linear: Δy/g; orthogonal: a vertical segment, so no cap helps),
which is why the strategy has to know the link mark's curve.

**Stand-in.** `gapsFromLinks(geometry, { w, nodeWidth, minGap, rule })`
runs after y placement. `need_i` = the steepest link crossing gap i
(2Δy/span; a link spanning k gaps charges Δy/k to each). Gaps get
`minGap` plus the rest of the fixed width in proportion to need, which
equalizes every gap's steepest slope and so minimizes the largest slope
(like an `fr` weight per gap). Rule `"sum"` instead minimizes total
thinning, Σ t·m² over all links, which gives g_i ∝ (Σ t·Δy²)^(1/3).

```ts
let o = opts(960, 600, "relax");
const { colX } = gapsFromLinks(layeredGeometry(names, links, o), {
  w: o.w,
  nodeWidth: 12,
  minGap: 30,
});
layered(names, links, { ...o, colX }, "sankey");
```

Renders (same canvas width, same y, only column x moves):
`img/r2-energy-barycenter-even.png` / `r2-energy-barycenter-link-gaps.png`,
`img/r2-energy-relax-even.png` / `r2-energy-relax-link-gaps.png`,
`img/r2-small-*-even.png` / `r2-small-*-link-gaps.png`.

**Metrics** (sampled every px along x):

- _overplot_: area where ribbons lie on top of each other,
  Σ_x (Σ band heights − union of band heights), as % of ribbon area. A
  crossing at a shallow angle overlaps over a long run, a steep one briefly,
  so this weighs crossings by how much they cover;
- _behind_: ribbon area passing behind other nodes;
- _max slope_; _thinning_: how much thinner bands look at their steepest
  point, thickness-weighted (t·(1 − 1/√(1+m²))).

| Layout                           | overplot (even → link gaps) | max slope   | thinning      |
| -------------------------------- | --------------------------- | ----------- | ------------- |
| energy barycenter, steepest rule | 21.3% → 20.9%               | 3.67 → 2.37 | 20.9% → 19.7% |
| energy barycenter, sum rule      | 21.3% → 21.3%               | 3.67 → 3.41 | 20.9% → 18.7% |
| energy relaxed, steepest rule    | 3.7% → 3.4%                 | 5.58 → 2.70 | 9.1% → 9.9%   |
| energy relaxed, sum rule         | 3.7% → 4.0%                 | 5.58 → 5.78 | 9.1% → 8.4%   |
| small barycenter, steepest       | 2.2% → 2.2%                 | 0.65 → 0.59 | 6.0% → 6.3%   |
| small relaxed, steepest          | 8.5% → 8.6%                 | 1.70 → 1.46 | 10.0% → 11.2% |

**Finding: column spacing cannot remove overlap.** Stretching one gap
horizontally is an affine map, so the overlap area inside it scales with the
gap's width exactly like the ribbon area does: the overlapped fraction is a
property of the y placement and the order. Redistributing width only moves
weight between gaps (≤ 7% either way). What spacing does change is slope:
the steepest rule halves the worst slope on energy (5.58 → 2.70 relaxed),
which reads as less "tangle" around the steep bands, at the cost of
crowding other gaps (energy relaxed: gap 1 shrinks from 101 to 61 px and
the labels there collide with ribbons). Steeper crossings are also nearer
right angles, which crossing-angle studies find easier to read, so flatter
is not purely better.

**Finding: overlap is decided by y, and relaxation wins it on energy.**
Overplot by y placement alone (even columns):

|        | data order | barycenter (tight, centered) | relaxed  |
| ------ | ---------- | ---------------------------- | -------- |
| energy | 25.0%      | 21.3%                        | **3.7%** |
| small  | 15.5%      | **2.2%**                     | 8.5%     |

So on energy, barycenter's "17 crossings vs d3's 27" hides a 6× larger
overlapped area: d3's relaxation lets thin links cross to keep thick bands
straight, and an unweighted crossing count misses that. d3 runs no
crossing-reduction phase at all; its order is a side effect of re-sorting
by y after each relaxation step. This corrects round 1's "the relaxed look
is mostly aesthetic": on the big graph it is most of the legibility.

**How a user would say it.** It must run after y placement (it reads node
y and link ends), and it reads the links and the link curve.

1. Spacing as a function, `spread({ by: "layer", dir: "x", spacing: (left, right) => px })`:
   the two neighbors are columns, but the function needs the links between
   them and their curve, so it would close over the links table and refs.
   Possible, but it is the user writing `gapsFromLinks` by hand.
2. x as a derived field (a helper, then `scatter({ x })`): the same costs as
   approach B (pixels outside the layout, fixed canvas width).
3. **A spacing strategy that knows the links** (placeholder spelling):
   ```js
   spread({
     by: "layer",
     dir: "x",
     spacing: Gaps.fromLinks(links, { min: 30, curve: Curve.bezier() }),
   });
   ```
   ```python
   spread(by="layer", dir="x", spacing=Gaps.from_links(links, min=30, curve=Curve.bezier()))
   ```
   Or, more naturally, an option of the C operator, which already owns the
   links and the link mark: `columnSpacing: "links"`.

**Does x depending on y break the per-axis model?** No cycle: the columns'
y never reads x (relaxation weighs links by layer distance, not px), so it
is a one-way y → x dependency. Bottom-up layout already places a spread's
children (each column, with its nodes' y) before the spread places them on
x. What it does need is the resolved px y (after the shared scale σ is
solved) to be visible to the x allocation, and the link geometry, which in
approach A lives in a different layer (the ribbons). That second part is
why it fits C better than A.

## R2.2 Tidy trees under the same factoring

Data: a 44-node flare subset (`data.ts`, 32 leaves, depth 3, depth-2
leaves next to depth-3 subtrees). All renders: 8 px nodes, 6 px min gap,
128 px per layer, separation 1 (d3's default of 2 between cousins is
turned off on both sides). Canvas height = the layout's breadth, so image
heights compare directly.

| Layout                                                    | breadth                             | image                         |
| --------------------------------------------------------- | ----------------------------------- | ----------------------------- |
| A as is: each column its own centered spread              | 288                                 | `r2-tree-flat-a.png`          |
| Nested spreads, each subtree a box (gotree `distribute`)  | 442                                 | `r2-tree-nested.png`          |
| Contour packing (RT stand-in), placed by spread + scatter | **386** (13% less than nested)      | `r2-tree-contour.png`         |
| d3.tree reference                                         | 386; stand-in matches it to 0.00 px | `r2-d3-tree.png`              |
| Cluster rule (leaves last, parent at children's mean)     | 442                                 | `r2-tree-cluster.png`         |
| d3.cluster reference                                      | 442; stand-in matches it to 0.00 px | `r2-d3-cluster.png`           |
| Cluster y with `Layering.justify`                         | 442                                 | `r2-tree-cluster-justify.png` |

Code (contour and cluster are placed the same way, approach A's x plus a
`scatter` on y; the y comes from the stand-in):

```ts
chart(rows) // rows: { name, layer, y }
  .flow(
    spread({
      by: field("layer").sort(),
      dir: "x",
      spacing: 120,
      alignment: "start",
    }),
    scatter({ by: "name", y: "y" })
  )
  .mark(rect({ w: 8, h: 8 }).label("name", { position: "right" }).name("n"))
  .layer(
    chart(links)
      .flow(resolve(["source", "target"], { from: selectAll("n") }))
      .mark((es) =>
        layer(
          es.map((e) =>
            line({ curve: Curve.bezier(), dir: "x" }, [e.source, e.target])
          )
        )
      )
  );

// Nested (today, combinators): a subtree is [parent | children]
const sub = (n) =>
  kids(n).length
    ? spread({ dir: "x", spacing: 120, alignment: "middle" }, [
        box(n),
        spread({ dir: "y", spacing: 6 }, kids(n).map(sub)),
      ])
    : box(n);
```

**Does tidy tree fit A's factoring?** Half. Layer = depth is exactly
`Layering.longestPath()` and order = DFS order is a sort key, so A's two
helpers apply unchanged. But A's y placement (one flat spread per column)
gives the narrowest picture (288) with parents far from their children: a
tree's y is a nesting, not a per-column stack. Tidy tree = **nested
spreads** (the gotree factoring) **plus two changes to the sibling spread**:

1. _Spacing measured on outlines instead of boxes_ (contour packing).
   That alone takes 442 → 386 here. It is not tree-specific: it is "spread
   children as close as their per-band outlines allow", like kerning.
   Placeholder: `spread({ dir: "y", spacing: 6, measure: Outline.contour() })`.
2. _Center the parent on its first and last child's root, not on the
   children's whole outline._ With contour spacing, centering on the
   outline (what `alignment: "middle"` does) moves 3 nodes by up to 26 px
   versus RT (same breadth here). In GoFish terms it is aligning to the
   children's anchors (each subtree's anchor = its root), not their box.
   Placeholder: `alignment: "anchor"`.

Proposed (placeholders marked):

```js
tree(
  {
    parentChild: distribute({ dir: "x", spacing: 120, alignment: "anchor" }), // placeholder
    sibling: distribute({ dir: "y", spacing: 6, measure: Outline.contour() }), // placeholder
  },
  flare
);
```

```python
tree(
    parent_child=distribute(dir="x", spacing=120, alignment="anchor"),
    sibling=distribute(dir="y", spacing=6, measure=Outline.contour()),
    data=flare,
)
```

**Cluster (dendrogram) layering is NOT `Layering.justify`.** d3.cluster's
layer is tree height − node height, which is exactly
`Layering.longestPath({ from: "sinks" })` (d3-sankey's `right`): 0 nodes
differ. Justify differs at display, flex and physics (they stay at depth 1,
their links span two layers; `r2-tree-cluster-justify.png`). Cluster's y is
"leaves evenly in DFS order, parent at the mean of its children".

**Does contour spacing help sankey / DAG layouts?** Not for the sankey
tree: the SankeyTree story's titanic tree has every path the same depth, so
contour = box = 218 (0% gain). It helps only when stacked groups span
different layer ranges: subtrees of different depth, or a DAG's components
/ subgraphs that occupy different columns. Flat per-column spreads (A) are
the limit case: contour packing with no grouping constraint at all, which is
why A is the tightest and loses parent-child coherence.

**Is "parent centered over children" coordinate assignment?** Yes, it is
the tree case of Sugiyama phase 4. In a tree each node has one parent, so
the "align to neighbors" constraints form a tree and one bottom-up pass
solves them: no iteration. d3.cluster is literally one right-to-left sweep
of "move to the mean of your out-neighbors" over fixed leaves. In a DAG,
nodes have several parents and children, the constraints conflict, and
there are two answers:

- Brandes–Köpf aligns each node with its _median_ neighbor into vertical
  blocks, resolves conflicts, compacts, in four directions, and averages:
  linear time, no iteration.
- d3's relaxation: alternate one-sided sweeps (move toward in-neighbors,
  then out-neighbors), resolving collisions inside each column step.

**What that suggests for a compositional relaxation.** Each one-sided
sweep is a fold over the columns: column i reads column i−1's final
positions, aligns to them, resolves its own collisions, and hands on. That
is acyclic, like nesting. Only the repetition (6 rounds, both directions)
is a loop. So relaxation could be written as a pipeline of named sweeps
rather than an opaque iteration count (placeholders):

```js
positioning: [
  Positioning.stack(),
  Positioning.sweep("in"),
  Positioning.sweep("out"),
].repeat(6);
```

and cluster is the single step `Positioning.sweep("out", { rule: "mean" })`
from evenly placed leaves. RT does not fit this pattern (it moves whole
subtrees, not columns): it is nesting + outline spacing + anchor alignment.
