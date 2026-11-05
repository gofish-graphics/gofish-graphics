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
