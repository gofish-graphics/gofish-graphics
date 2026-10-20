# Stacked and divided ribbons

**Summary.**

1. A sankey is a stacked area chart whose stacks are nodes. Each ribbon end is a data row, the ends stack inside their node with the ordinary `stack` operator, and the ribbon stays one-to-one per link.
2. Prototypes show this already draws parallel sets, a sankey tree, and the full 48-node energy sankey with no core change. What is missing is a little sugar (`unpivot`, `ribbon({ by })`) and, for chord diagrams, a way to say which part of a node a ribbon end attaches to (`ribbon({ at })`).
3. **Recommendation: Approach B, "ends are rows".** The runner-up is Approach A, where the ribbon allocates its own ends on nodes placed by anything (`ribbon({ from, to, size })`). A would win if ribbons over independently placed nodes (tree layouts, flow maps) become a priority.

Advances #47 (Stacked/Divided Ribbons). Related: #290, #745, #786, #877, #738, #701, #631, #540, #974, #1101, #1152, #1160, #1165.

Prototype stories: `packages/gofish-graphics/stories/_proposals/stacked-ribbons/`. Prototype notes, with every spec and workaround: `NOTES.md` next to this file. Images: `img/`.

## Terms

- **Node.** A bar or arc whose length shows a total (a sankey node, a parallel-sets category, a chord group).
- **Link.** One flow between two nodes, with a value.
- **End.** The interval where one link meets one node. ggalluvial calls it a _lode_, d3-chord a _subgroup_, ELK and Graphviz a _port_. This proposal says _end_.
- **Path.** A chain of ends that one ribbon threads through: two ends for a sankey link, one end per axis for a parallel-sets cohort.
- **Part.** A named piece of a mark's outline that the mark declares, such as a rect's `top`, `right`, `bottom`, `left`. The coordinate transform carries parts with it, so a polar rect's `bottom` is its inner arc. The label proposal uses the same word.
- **Unpivot.** Turn columns into rows: a row with columns `source` and `target` becomes two rows with a `side` column. The polars name (`DataFrame.unpivot`, formerly `melt`); dplyr calls it `pivot_longer`.

## What Josh asked, and the answers

| Question in the notes                                                    | Answer                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Extend the existing ribbon API?                                          | Yes, by two options: `by` (which rows form one ribbon) and `at` (which part each end attaches to). The span allocation does not live on the ribbon.                                                                                                                                                                                                                                                                                                                                                                                             |
| Is it the `stack` operator or a `stack` method, e.g. `ribbon().stack()`? | The `stack` operator, applied to the ends inside each node. `ribbon().stack()` is Approach C below. It would duplicate the flow's `stack` (a large partial overlap), which matches the #290 note that a mark-side stack on a connector can only respell a row stack.                                                                                                                                                                                                                                                                            |
| What do enclose, line, ribbon, cut and labels contribute?                | **ribbon:** unchanged one-to-one band between ends. **line:** the same model gives parallel coordinates and stringlines (lines through stacked ends). **enclose:** draws a node box when a node's in-sum and out-sum differ (`Shape.box()`, padding 0). **cut:** an alternative way to make ends when the node is one drawn shape (an image cut into slices), a degenerate overlap with stacking ends. **labels:** node labels are `.label()` on the node tier; ribbon labels are `Place.along`; and `at` uses the label proposal's part names. |
| One-to-many, many-to-many?                                               | Ribbons stay one-to-one per link (#745). Splits and merges come from several ends stacking in one node. The energy sankey (many-to-many, 69 links) renders this way.                                                                                                                                                                                                                                                                                                                                                                            |

## Related issues

- **#47** Stacked/Divided Ribbons. The design issue: sankey-like graphics need a stack of ribbons; framed as a join between source and target sets.
- **#745** (merged) Deleted `.connect()`. Recorded the direction "keep ribbons one-to-one at flow-row granularity and add per-edge span allocation."
- **#290** `.stack()` as a mark method. Undecided. For connectors it can only respell a row stack; `wrap` resolved the waffle case.
- **#786 / #752** (merged) Fused relational marks inherit the flow grouping; `along` names the path tier and every other tier splits.
- **#877** A refs-bag ribbon ignores `group({ by })` in one case; the fused form threads the wrong tier.
- **#738** Hierarchy layouts (icicle, sankey tree) still need hand-rolled `groupBy`.
- **#701 / #631** Modular layout note: d3-sankey with node and link order given is closed-form stacking; ordering is the one non-constraint step.
- **#540** Angular and radial `dir` for `cut`.
- **#974** Boundary geometry query; the label proposal's `Outline` with named parts supersedes it.
- **#1101** One extensibility model for strategy families.
- **#1152** (merged) `enclose` as a relational mark with `Shape.*`.
- **#1160** `enclose({ members })`, a ref-column option like `ribbon({ from, to })`.
- **#1165** Ribbon and area charts cannot fill a given width; gap that grows to fill.

## Prior work

Every system that draws sankeys correctly stacks link values inside each node, then joins two intervals.

| System               | Model                                                                                                                                                                                    | Names                                                                        |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| d3-sankey            | One layout computes columns, node y (relaxation), and each link's `y0`/`y1` on both node edges.                                                                                          | `nodeAlign`, `nodePadding`, `nodeSort`, `linkSort` (`null` = input order)    |
| d3-chord             | Matrix row = group arc; cell = subgroup stacked in the arc; chord pairs subgroup (i,j) with (j,i). `ribbon()` joins two angle intervals through the center.                              | `padAngle`, `sortGroups`, `sortSubgroups`, `ribbon.padAngle`                 |
| ggalluvial           | Long "lodes form" data: one row per (cohort, axis). Lodes stack inside strata. `geom_alluvium` keeps a cohort's order through every axis; `geom_flow` reorders on each side of each gap. | axis, stratum, lode, alluvium, flow; `lode.guidance`, `aes.bind`, `knot.pos` |
| ggforce              | `gather_set_data` makes long data; one gap and one curvature.                                                                                                                            | `sep`, `strength`                                                            |
| ggsankey             | `make_long` gives one row per edge; sankey vs alluvial differ by gap and baseline.                                                                                                       | `space`, `geom_alluvial`                                                     |
| Vega (Kibana sankey) | Hand-built: `stack` the slot rows, `lookup` the target, `linkpath` a thick stroke. Node stack and slot stack are kept in sync only by a shared sort key.                                 | `stack`, `linkpath`                                                          |
| circlize             | Sectors sized by total; links stacked in sectors; data-frame row order is slot order.                                                                                                    | `gap.after`, `link.sort`, `directional`                                      |
| TikZ `sankey`        | Manual. `\sankeyfork{a}{25/b,10/c}` divides a cross-section into ordered sub-intervals whose quantities must sum to the parent.                                                          | fork, `anchor=left/center/right`                                             |
| ELK                  | Port constraints from `FREE` to `FIXED_POS`: who owns end order.                                                                                                                         | `portConstraints`, `portAlignment`                                           |
| Mascot               | A general grammar without ends: every link attaches at the node's middle. The result is a node-link diagram with thick edges, not a sankey.                                              | `sourceAnchor`                                                               |

Lessons for GoFish:

- Ends are a stack inside the node, and the data is long (one row per end), as in ggalluvial's lodes form and TikZ forks.
- A ribbon joins two intervals, not two points; a thick stroke cannot do chords.
- End order has two scopes: per node (alluvium) or per side of each gap (flow).
- The order default is crossing reduction; the escape hatch is input order.
- Two gaps: between nodes and between ends.
- Sankey and chord share one model. The coordinate system is the only difference (Highcharts' dependency wheel, d3-chord), so in GoFish it is `Coord.polar()`, not a new mark.
- Precedent for a fixed chart type (`geom_sankey`, `go.Sankey`, `nodeAlign`) is a foil here: it lists arrangements instead of composing them.

## What exists today

A ribbon spans the full facing edge of each operand's box (`connect.tsx`, edge mode). No option attaches it to part of an edge. Every divided-end example today makes one node per end and lists ribbons by name. The gallery Sankey Tree story is about 137 lines for this reason.

Images: `img/sankey-tree-today.png`, `img/ribbon-chart-today.png`.

## Approach A: the ribbon allocates its own ends

The user writes a nodes table and a links table, the d3-sankey inputs. Nodes are placed by any chart. The ribbon takes a `size` channel; ends with sizes stack along the node's facing part, ordered by where the far end was placed.

```js
layer([
  chart(nodes)
    .flow(
      spread({ by: "depth", dir: "x", spacing: 100 }),
      spread({ by: "name", dir: "y", spacing: 10 })
    )
    .mark(rect({ w: 12, h: "value" }).name("nodes")),
  chart(links)
    .flow(resolve(["source", "target"], { from: selectAll("nodes") }))
    .mark(
      ribbon({ from: "source", to: "target", size: "value", opacity: 0.5 })
    ),
]).render(container, { w: 960, h: 600 });
```

```python
layer([
    chart(nodes).flow(spread(by="depth", dir="x", spacing=100), spread(by="name", dir="y", spacing=10))
        .mark(rect(w=12, h="value").name("nodes")),
    chart(links).flow(resolve(["source", "target"], from_=select_all("nodes")))
        .mark(ribbon(from_="source", to="target", size="value", opacity=0.5)),
]).render(w=960, h=600)
```

Pictures: `img/approach-a-energy.png`, `img/approach-a-sankey-tree.png`, `img/approach-a-mismatch.png`. The prototype defines A by rewrite into B, so the energy picture is identical to B's.

**Desugars into:** for each (node, part), a fresh stack of ends placed on that part with `relate()` and `Constraint.align` ("span"), then one-to-one ribbons. Order needs the far end's placed position, so it is a sort done after the nodes are placed.

**New pieces:** a `size` channel on a connector that must share the node's scale (the same measure type, `value`); a post-layout sort; a rule for when ribbon sizes exceed the node (prototype: the node grows and warns; real A should be a loud error); `at` for the part.

**Overlap check:** exact composition of `stack` + `relate` + `ribbon` if defined by that rewrite. Implemented any other way, it is a second stacking mechanism next to `stack`: a large partial overlap.

**Trade-offs.**

- Easy: d3-shaped data as-is; nodes from any layout (gotree, scatter, a map); exact crossing-reducing end order with no user sort key.
- Awkward: two tables that must agree (node value vs. sum of ribbon sizes); a connector that owns a data channel and a scale; parallel sets need one link per gap, losing the cohort identity that B keeps.

## Approach B: ends are rows (recommended)

Unpivot links into end rows. The flow places nodes and stacks the ends inside them. The ribbon joins the ends of one link (or one path) one to one. This is today's stacked area and Ribbon Chart, generalized: there the "nodes" are x positions and the ends are series.

### Parallel sets (titanic: class, sex, survived)

Picture: `img/parallel-sets.png` (rendered from today's working spelling).

Today (works, zero core changes):

```js
const ends = unpivotEnds(sorted, ["class", "sex", "survived"], "count"); // hand-written JS, plus a `rank` sort key
layer([
  chart(ends)
    .flow(
      spread({ by: "axis", dir: "x", spacing: 120 }),
      spread({ by: field("category").sort(), dir: "y", spacing: 12 }),
      spread({ by: field("rank").sort(), dir: "y", spacing: 0, axes: false })
    )
    .mark(rect({ w: 12, h: "value", fill: "class" }).name("ends")),
  chart(selectAll("ends"))
    .flow(group({ by: "path" }))
    .mark(ribbon({ opacity: 0.6, fill: "class" })),
]).render(container, { w: 500, h: 400 });
```

Proposed:

```js
chart(titanic)
  .flow(
    derive(
      unpivot({
        on: ["class", "sex", "survived"],
        variable: "axis",
        value: "category",
        id: "path",
      })
    ),
    spread({ by: "axis", dir: "x", spacing: 120 }),
    spread({ by: field("category").sort(), dir: "y", spacing: 12 }),
    stack({ by: field("rank").sort(), dir: "y" }) // end order: decision 4
  )
  .mark(rect({ w: 12, h: "count", fill: "class" }))
  .layer(ribbon({ by: "path", opacity: 0.6 }))
  .render(container, { w: 500, h: 400 });
```

```python
(chart(titanic)
    .flow(
        derive(unpivot(on=["class", "sex", "survived"], variable="axis", value="category", id="path")),
        spread(by="axis", dir="x", spacing=120),
        spread(by=field("category").sort(), dir="y", spacing=12),
        stack(by=field("rank").sort(), dir="y"),
    )
    .mark(rect(w=12, h="count", fill="class"))
    .layer(ribbon(by="path", opacity=0.6))
    .render(w=500, h=400))
```

Why `by` is needed: with today's fused `.layer(ribbon())`, the #786 rule splits by every tier except the path tier. Here the category tier's key changes along a path (First, then Female, then Yes), so each group holds one end and no ribbon draws (`img/parallel-sets-fused-fails.png`). `by: "path"` names the ribbon's identity directly; the travel order is the outermost tier (`axis`).

### Energy sankey (many-to-many, 48 nodes, 69 links)

Picture: `img/energy-sankey.png`. Node columns and in-column order are precomputed (about 100 lines of layout in `sankeyPrep.ts`); see "Out of scope". Columns are top-aligned and gaps do not fill the height (#1165).

Proposed:

```js
chart(links) // { source, target, value, depth: { source, target } precomputed }
  .flow(
    derive(
      unpivot({
        on: ["source", "target"],
        variable: "side",
        value: "node",
        id: "link",
      })
    ),
    spread({ by: field("depth").sort(), dir: "x", spacing: 100 }),
    spread({ by: field("node").sort(order), dir: "y", spacing: 10 }),
    spread({
      by: field("side").sort(["target", "source"]),
      dir: "x",
      spacing: 0,
    }), // in-ends left, out-ends right
    stack({ by: field("key").sort(), dir: "y" }) // key = far node's rank: decision 4
  )
  .mark(rect({ w: 6, h: "value", fill: "#555" }))
  .layer(ribbon({ by: "link", opacity: 0.4, fill: "source" }))
  .render(container, { w: 960, h: 600 });
```

A node is its two end stacks side by side, so its height is the larger of its in-sum and out-sum. Where they differ, the side spread's `alignment` places the slack (TikZ's `left/center/right` anchor), and a box can be drawn with `enclose({ shape: Shape.box(), padding: 0 })` over each node's ends.

### Sankey tree (titanic tree)

Pictures: `img/sankey-tree-rows.png`, `img/sankey-tree-rows-per-segment.png`. About 35 lines against 137 today. Nested gaps (classes 8, sexes 4, leaves 2) are three nested `spread`s, because each end row carries its ancestors' keys. A tree needs one end row per depth with blank keys for the missing levels; `unpivot` does not produce that shape, so a tree-ends helper is open (#738, decision 8).

### Chord diagram (Bostock hair-color matrix)

Pictures: today `img/chord-today-dir-x.png` (fails: bands hug the ring); target `img/chord-prototype.png` (throwaway prototype file `_proposalChordRibbon.ts`).

Each matrix cell is already an end: cell (i, j) is the end of chord {i, j} at group i.

```js
layer({ coord: Coord.clock() }, [
  chart(cells) // { group, other, value, chord: sorted pair, color }
    .flow(
      spread({
        by: field("group").sort(names),
        dir: "x",
        spacing: 0.04,
        y: 160,
        h: 16,
      }),
      stack({ by: field("other").sort(names), dir: "x" })
    )
    .mark(rect({ w: "value", fill: "group" }))
    .layer(ribbon({ by: "chord", at: "bottom", fill: "color", opacity: 0.67 })),
]).render(container, { w: 420, h: 420 });
```

```python
layer([
    chart(cells)
        .flow(spread(by=field("group").sort(names), dir="x", spacing=0.04, y=160, h=16),
              stack(by=field("other").sort(names), dir="x"))
        .mark(rect(w="value", fill="group"))
        .layer(ribbon(by="chord", at="bottom", fill="color", opacity=0.67)),
], coord=Coord.clock()).render(w=420, h=420)
```

`at: "bottom"` attaches both ends to their inner arc. The band leaves each end along that part's outward normal, computed in screen space. That one rule also describes today's sankey bezier (out of the `right` part along +x, into the `left` part along −x), so chords need no new curve. In Cartesian coordinates the same spelling gives thick arc-diagram bands below a baseline.

### How B composes

- **Core:** `unpivot` is a `derive` data helper; `by` and `at` are ribbon options. Layout, scales, and stacking are unchanged. Span allocation is the `stack` operator. Node and ribbon share one scale by construction, because the ends are the node.
- **Coordinates:** works in polar (chord) once `at` exists; parts are carried through the transform as in the label proposal.
- **Animation:** ends are rows with keys, so transitions match ends by key like any mark.
- **Lines:** `line({ by })` over the same ends gives parallel coordinates and stringlines.
- **Labels:** node labels are `.label()` on the category/node tier; ribbon labels use `Place.along`.

**Overlap check.**

- With `stack`: exact composition, the end stack _is_ a `stack`.
- With `cut`: degenerate overlap. For a rect node, cutting the node by link values equals stacking the ends. `cut` is still the tool when the node is one shape you cannot rebuild from parts (an image).
- With `enclose`: none; it draws node boxes.
- With the #786 default split: `by` replaces the inferred split when the user names it; the default stays for the ribbon charts it already handles.

**Trade-offs.**

- Easy: no new layout; the hard cases (many-to-many, parallel sets, chords) all reduce to stacking rows; cohort identity through several axes is free.
- Awkward: users must think of ends as rows (an unpivot); end order needs a sort key that agrees with where the far node sits; ribbons cannot attach to nodes the flow did not lay out (gotree, scatter).
- New terms: `unpivot` (existing word), `by` on ribbon (existing key), `at` (shared with labels).

## Approach C: `ribbon().stack()` as a position adjustment

Josh's floated spelling, read as ggplot's `position = "stack"`: ribbons that share a node stack their ends there.

```js
chart(links)
  .flow(resolve(["source", "target"], { from: selectAll("nodes") }))
  .mark(ribbon({ from: "source", to: "target" }).stack({ size: "value" }));
```

It also reads naturally for stacked area: `.mark(ribbon({ h: "value" }).stack({ by: "series" }))`.

**Overlap check:** a large partial overlap with the flow's `stack`. Stacked area already has a spelling (`spread(x), stack(series)` then `ribbon`), and C adds a second route to the same picture. Its sankey semantics are exactly A's, so C is A with a method spelling. By the calls/methods/options rule, a method reads the caller's state; this one reads every _other_ ribbon at the same node, which is a set-level operation, not the caller's. Not recommended.

No separate pictures: the outputs are A's and today's stacked area.

## Recommendation

**Approach B, ends are rows**, with three user-facing additions: `unpivot`, `ribbon({ by })`, `ribbon({ at })`.

- **It desugars into the existing core** (principles, "Why keep the core small"). The prototypes drew parallel sets, the sankey tree, and the energy sankey with zero core changes. Only chords need a core change, and that change (attaching to a part) is shared with labels.
- **One concept, one operator** (api-design, "Operators and marks"). Span allocation is `stack`. A and C add a second stacking mechanism unless defined by rewrite.
- **Data flows as lists.** An end is a row, like ggalluvial's lodes form and circlize's "row order is slot order".
- **It realizes #745's direction.** Ribbons stay one-to-one per row; the "per-edge span allocation" turned out to be the flow's stack.
- **Names from precedent.** `unpivot` is polars; `by` is the family key; `at` and part names come from the label proposal.
- **Same shape in JS and Python.**

**What would change the pick to A:** ribbons over nodes placed by something other than the flow (gotree trees, node-link diagrams, flow maps) becoming a priority, or crossing-reducing end order turning out to be impossible to state as a data sort. A can later be added as sugar defined by rewrite into B's pieces (`relate` + `stack` + `ribbon`), so choosing B does not close it off.

## Out of scope (separate work)

- **Sankey node layout.** Column assignment (longest path, justify) and in-column order (relaxation, barycenter) are layout algorithms. They are about 100 lines of the energy prototype. See #701 and #631.
- **Fill-the-height gaps.** Giving a node tier `h:` rescales values instead of growing the gaps (`img/energy-sankey-fixed-height-fails.png`); see #1165.

## Bugs found while prototyping (not filed)

1. A data-sized `stack` under two `spread`s gets its own scale per column when columns have different child counts (`img/bug-stack-scale.png`; workaround `spread({ spacing: 0 })`).
2. A y `spread` orders groups top-down; a y `stack` orders them bottom-up.
3. `filter` over a refs bag sees `ref.datum` as a bag, so `r.datum.depth` is undefined and the filter silently drops everything; `project(r, "depth")` works.
4. In polar, `spread` with `spacing` stops near 225° instead of closing the circle (`img/chord-ring-spread-fails.png`).
5. `chart(..., { legend: false })` on a non-root layer is ignored.
6. The polar bake treats only `connect` and `tween` as relational leaves (`coordinateTransforms/bake.ts`, a hard-coded type list); a new relational node is never drawn.
7. `resolveGroupPaint` resolves `fill: "<field>"` only for registered types.

## Decisions for Josh

1. Is "ends are rows" the model, with span allocation done by the flow's `stack` (B), rather than by the ribbon (A)?
2. Bring `by` back on `ribbon` and `line` as the ribbon's identity (`ribbon({ by: "link" })`), with the travel order taken from the outermost tier?
3. `unpivot({ on, variable, value, id })` in `derive`: keep the polars name, and create the row id in the same call (`id`) instead of a separate `withRowIndex` step?
4. End order: ship with a user sort key (a declared shortcut) and add a far-end order strategy later? And should the default be per node (alluvium) or per side of each gap (flow)?
5. `ribbon({ at: "bottom" })` with the label proposal's part names, plus the rule that a ribbon leaves each end along that part's outward normal in screen space?
6. Slack when a node's in-sum and out-sum differ: default `alignment` `start` (d3) or `middle`?
7. Keep sankey node layout (columns, in-column order, fill-the-height gaps) out of this design, as separate issues?
8. A tree-ends helper for sankey trees: here, or with #738?

## Syntax changes to review

- New data helper `unpivot({ on, variable, value, id })`, used inside `derive(...)`; Python `unpivot(on=..., variable=..., value=..., id=...)`.
- `ribbon({ by })` and `line({ by })`: explicit ribbon identity on the fused form (removed in #786; returns with a narrower meaning).
- `ribbon({ at })`: part name for both ends, or `{ from, to }` for each end; default is today's facing edges along `dir`.
