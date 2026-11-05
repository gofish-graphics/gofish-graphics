# Sankey node layout

d3-sankey does two kinds of work. Discrete graph decisions (which column a node goes in, and the order inside each column) read the whole link table and produce fields. Continuous placement, given those fields, is already GoFish: a spread of columns, a gapped spread of nodes, and one shared scale that equals d3's.
What is left over is relaxation and virtual nodes. Both are global and iterative, and neither is a strategy on a single column.

**Recommendation: A now, C later.** Add the two graph decisions as `derive` helpers with strategy families (`Layering`, `Ordering`) that feed the existing `spread`. Relaxation and virtual nodes are a declared follow-up whose home is a `layered(...)` operator (C), built on A's helpers and on `spread`.

The review page is `index.html` in this folder. It has the same sections, with every render next to its code. Ribbons and link ends belong to the stacked-ribbons proposal ([proposal](https://claude.ai/artifact/QnDyewZaCKrvpFo9r8QYXE), [design space](https://claude.ai/artifact/2dHLhTeiQwpdHmkDjbw6oU)). All renders come from prototype stories in `packages/gofish-graphics/stories/_proposals/sankey-layout/` with no core changes.

## Rules

- **Columns and order are data.** They are fields (`layer`, `order`) that a helper computes or a user writes, like Lupton's editable ordering.
- **Geometry is composition.** Columns are `spread({ by: "layer", dir: "x" })`, nodes are a gapped `spread` on y, and the shared scale is the existing σ fit.
- **One phase, one strategy family.** `Layering.*` for columns and `Ordering.*` for crossing reduction, like `Tile.*` for treemaps.
- **Iteration never enters the layout engine.** Relaxation lives in a helper or a layout node that sees nodes and links.
- **Ribbons are not decided here.**
- **A template is sugar.** A `sankey()` template may expand into A. It cannot replace A.

## Terms

- **Layer (column):** the discrete x slot a node sits in.
- **Order:** a node's rank from the top inside its layer.
- **Layer assignment:** choosing each node's layer. d3 uses the longest path from any source, then a rule for where sources and sinks go (`nodeAlign`).
- **Crossing reduction:** choosing the order inside each layer so few links cross. The best order is NP-hard to find, so tools use heuristics.
- **Barycenter:** the weighted mean position of a node's neighbors. Sorting each layer by it, sweeping back and forth, is the classic heuristic.
- **Coordinate assignment:** given layers and orders, choosing exact y positions.
- **Relaxation:** d3's coordinate assignment. It moves each node part way toward the y that would level its links, pushes overlapping nodes apart, and repeats.
- **Virtual node:** a placeholder put in each layer a long edge skips, so the edge can bend around boxes and take part in ordering.
- **Sugiyama framework:** the standard four-phase layered graph layout: cycle removal, layer assignment, crossing reduction, coordinate assignment.
- **ky, σ:** pixels per data unit. d3 calls it `ky`. The GoFish layout engine calls it σ.

## d3-sankey, phase by phase

| Phase           | Math                                                | GoFish counterpart                              | Status           |
| --------------- | --------------------------------------------------- | ----------------------------------------------- | ---------------- |
| Link lists      | join links to nodes                                 | `resolve` / anchors                             | ribbons proposal |
| Node value      | max(Σ in, Σ out)                                    | taller port stack                               | ribbons proposal |
| Depth, height   | longest path (a fold over the whole graph)          | none                                            | A: `layers`      |
| Column rule     | `nodeAlign` left, right, center, justify            | none                                            | A: `Layering.*`  |
| Column x        | layer · (W − node width) / (n − 1)                  | `spread({ dir: "x", spacing: fr(1) })`, exact   | today            |
| Padding cap     | min(padding, H / (max column size − 1))             | keeps px gaps, warns                            | fine             |
| Shared scale    | ky = min over columns of (H − (n − 1)·py) / Σ value | σ fit over sibling columns, same number         | today            |
| Initial stack   | stack with gap py                                   | `spread({ dir: "y", spacing: 10 })`             | today            |
| Leftover height | spread evenly (space-evenly)                        | short column aligned as a block; `fr` gaps warn | gap, #1165       |
| Order           | re-sort by y after every move                       | `field("order").sort()`                         | A: `Ordering.*`  |
| Relaxation      | move toward neighbors, damped, 6 rounds             | none                                            | C follow-up      |
| Collisions      | push apart along y                                  | `Overlap` moves only the other axis             | C follow-up      |
| Link ends       | stack ends by far node's y                          | anchors                                         | ribbons proposal |

![Shared scale probe](img/probe-shared-scale-fixed-gaps.png)

The probe: column A has 2 nodes of 50, column B has 10 nodes of 10, 20 px gaps, height 300. d3 gives ky = min(280/100, 120/100) = 1.2. GoFish draws B nodes 12.0 px tall spanning exactly 300, and A nodes 60.0 px.

## Strategy grid

Crossings count pairs of links between the same two columns whose ends swap order.

| Layout                             | Small flow | UK energy | Images                                        |
| ---------------------------------- | ---------- | --------- | --------------------------------------------- |
| Data order, tight (A, no `order`)  | 5          | 72        | `a-small-input-order`, `a-energy-input-order` |
| `Ordering.barycenter()`, tight (A) | 1          | 17        | `a-small-barycenter`, `a-energy-tight`        |
| Relaxed (C, a port of d3's loop)   | 3          | 26        | `c-small-relax`, `c-energy-relax`             |
| d3-sankey reference                | 3          | 27        | `d3-small`, `d3-energy`                       |
| d3-sankey, `iterations(0)`         | 5          | 72        | `d3-small-no-relax`, `d3-energy-no-relax`     |

d3's relaxation does not minimize crossings. Barycenter ordering beats it. Relaxation straightens bands and uses the leftover height. These are different goals, which is one reason to keep ordering and coordinate assignment apart. The port matches d3 to 0.00 px on the small flow. On energy it differs by up to 45 px because two tied nodes swap in the first sweep.

## Approaches

### A. Graph phases as data helpers, placement by existing operators

![Energy, A](img/a-energy-tight.png)

```js
chart(nodes)
  .flow(
    derive(layers(links, { key: "name", layering: Layering.justify() })),
    derive(
      order(links, {
        key: "name",
        by: "layer",
        ordering: Ordering.barycenter(),
      })
    ),
    spread({ by: "layer", dir: "x", spacing: fr(1) }),
    spread({ by: field("order").sort(), dir: "y", spacing: 10 })
  )
  .mark(rect({ w: 12, h: "value" }).name("nodes"));
```

```python
chart(nodes).flow(
    derive(layers(links, key="name", layering=Layering.justify())),
    derive(order(links, key="name", by="layer", ordering=Ordering.barycenter())),
    spread(by="layer", dir="x", spacing=fr(1)),
    spread(by=field("order").sort(), dir="y", spacing=10),
).mark(rect(w=12, h="value").name("nodes"))
```

Today the story computes `layers`, `barycenterOrder` and `linkEnds` in plain JS (`_proto.ts`) and sorts by a hand-built name list. The dependency graph (`img/a-dependencies.png`) uses the same two spreads with fixed-size boxes and arrows. Its two long edges run through boxes, which only virtual nodes fix.

- **Composes with:** any later flow tier, `Coord.polar()`, and the ribbons anchors. It desugars to `derive` plus `spread`.
- **Overlap check:** none, since A does no placement. `Ordering.*` reads the links table, so it is not a sort over the rows.
- **Trade-offs:** easy to explain and override. Two helpers and two families. No relaxed look, no bent edges. A helper over nodes takes a second table, which today's `derive` helpers do not do.

### B. Relaxed y as a precomputed field, placed by scatter

![Energy, B](img/b-energy-relaxed.png)

```js
chart(nodes)
  .flow(
    derive(layers(links, { key: "name", layering: Layering.justify() })),
    derive(
      relax(links, {
        key: "name",
        by: "layer",
        size: "value",
        padding: 10,
        height: 600,
      })
    ),
    spread({ by: "layer", dir: "x", spacing: fr(1) }),
    scatter({ by: "name", yMin: "yMin", yMax: "yMax" })
  )
  .mark(rect({ w: 12, h: "value" }));
```

Relaxation cannot be a strategy on a column's spread. It reads other columns, it is a fixed point, and it cannot be split: d3 removes overlaps inside every sweep. Relaxing first and removing overlaps once per column (`img/b-energy-relax-then-resolve.png`) raises the bands' total vertical travel by 13% (574,847 vs 509,045; d3 510,730). It also happens to cut crossings (17 vs 26), so it is a different layout, not uniformly worse. Even that one local step has no home: `Overlap` strategies move only the free axis.

- **Overlap check:** large partial overlap. The helper recomputes ky, padding and the height in pixels, which the spreads and the σ fit already own.
- **Trade-offs:** works today and matches d3, but duplicates the scale, breaks when resized or nested, and needs a y flip.

### C. One `layered` operator, phases as strategies

![Dependencies with virtual nodes](img/c-dependencies-virtual-nodes.png)

```js
layered(
  {
    size: "value",
    spacing: 10,
    layering: Layering.justify(),
    ordering: Ordering.barycenter(),
    positioning: Positioning.relax({ iterations: 6 }), // or Positioning.stack()
    virtualNodes: true,
  },
  { nodes, links, node: rect({ w: 12 }), link: ribbon({ opacity: 0.4 }) }
);
```

The model is d3-dag's `sugiyama().layering().decross().coord()` and ELK Layered. Seeing edges lets it add virtual nodes and run relaxation. The prototype computes positions in JS and emits placed marks (`c-energy-relax`, `c-small-relax`, `c-small-stack`).

- **Overlap check:** large partial overlap unless built on A. `Positioning.stack()` is exactly A's two spreads (`img/c-small-stack.png`). C must desugar into A's helpers and `spread`, and add only virtual nodes and `Positioning.relax()`.
- **Trade-offs:** serves DAGs and flowcharts. Three families and one operator. Hides the flow tiers.

### D. A GoTree-style template

![Energy, D](img/d-energy-template.png)

```js
sankey({ layering: Layering.justify(), spacing: 10 }, { nodes, links });
```

It expands into A's spec, and its render is byte-identical to A's. GoTree elaborates local relations (parent to child) into combinators because a tree's structure is the data's nesting. A sankey's missing pieces are whole-graph folds: longest paths and crossing sweeps. A template can only express those by calling A's helpers. So it is sugar over A, and the "geom_sankey" pattern GoFish avoids.

## Prior work

- **d3-sankey:** monolithic. Order falls out of relaxation. `sankey().nodeAlign(sankeyJustify).iterations(6)`.
- **d3-dag:** one builder slot per Sugiyama phase. The model for C.
- **ELK Layered:** every phase is a strategy option, and "keep the user's order" is one of them.
- **dagre / Graphviz dot:** monolithic with knobs. dagre exposes `ranker`; dot takes constraints like `rank=same`.
- **Lupton, d3-sankey-diagram / floweaver:** order is data the user writes. When it is given, no algorithm runs. The model for A.
- **PiCCL:** the column is a data field, nodes and columns are stacks. A without helpers.
- **ggalluvial:** axes and stratum order come from factor levels. No crossing reduction.
- **Plotly / ECharts:** d3-sankey behind options (`arrangement`, `layoutIterations`, per-node `depth`).

## Gaps and bugs

| Item                                                                                                                                  | Kind                 |
| ------------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| A sibling label layer flips what `alignment` means on y (`Repro/AlignStartNoLabels` vs `AlignStartWithLabels`; `img/bug-align-*.png`) | bug to file          |
| The same repro without `axes: false` throws "axis 1 has a continuous type but no size claim"                                          | bug to file          |
| A `line` from a box ref hid that box's label (not reduced)                                                                            | bug                  |
| No spacing that has a pixel minimum and spreads leftover height (`Scale Probe/FlexibleGaps`)                                          | design, #1165        |
| Labeling a node when the flow's leaf is a port                                                                                        | design               |
| No 1D overlap removal along the placed axis                                                                                           | design, C follow-up  |
| Two y conventions: `rect({ y })` counts down, `scatter` y points up                                                                   | design               |
| Long right-column labels run past the canvas                                                                                          | design (chrome room) |

## Recommendation

**A now.** It desugars into the existing core: two `derive` helpers and the spread composition GoFish has, with the shared scale coming free. The families follow `Tile` and `Curve` and cross to Python as IR. A user can always replace a helper with their own field.

**Runner-up: C, as the follow-up.** It should desugar into A's helpers and `spread` and add only `Positioning.relax()` and virtual nodes.

**What would flip the pick to C now:** if d3's relaxed look should be the default sankey, or if layered DAG diagrams with bent edges are wanted soon. Barycenter already has fewer crossings than d3, so the relaxed look is mainly straighter bands and fuller columns.

## Decisions for Josh

1. A now and C later, or C now?
2. Where do the graph phases live: `derive` helpers over nodes that take the links table, or a flow operator over the links?
3. Family names: `Layering`, `Ordering`, and `Positioning` for C? (`Place`, `Coord` and `align` are taken.)
4. Default column rule: `justify` or `longestPath` (left)?
5. Is fill-the-height spacing part of this effort, or does it stay with #1165?
6. Is a `sankey()` template wanted at all?

## Rationale and related issues

- Desugar into the core; no geom_sankey; no fixpoint iteration in the engine; overlap only at the edges; data flows as lists; accepting an order is the zero-engine path (`notes/design/modular-layout-algorithms.md`).
- Correction to earlier notes: d3 with a fixed `nodeSort` is closed-form only with `iterations(0)`.
- #47 stacked ribbons (the link-end half). #631 modular layout algorithms, and #701 its design note. #355 decompose treemap, tidy tree and Sugiyama into primitives. #485 solvers that emit discrete commitments. #610 a layout-program IR. #1165 fill the frame without pixel spacing. #1013 strategy family namespaces. #1003 scatter overlap strategies. #1163 extension packages crossing to Python. #46 composite examples, including a FrankenSankey.
