---
title: "Design Note: Measure-Keyed Domains and Axis Sharing"
section: Speculative Notes
order: 67
status: speculative
---

# Measure-keyed domains and axis sharing

This note is the design for
[#1114](https://github.com/gofish-graphics/gofish-graphics/issues/1114) as the
issue was revised after its first implementation attempt stopped at a wall. The
maintainer signed off on this note on 2026-10-09, and section 8 records the
decisions made then. It builds on three other pieces of work:

- the measure design on the branch `worktree-measure-inference-955`
  (`measure-types-design.md`, sections 3b, 4 and 5), which treats a bare column
  name as an unknown unit, in the style of F# unit variables;
- [#1115](https://github.com/gofish-graphics/gofish-graphics/issues/1115), which
  proposes hierarchical axes;
- [#1032](https://github.com/gofish-graphics/gofish-graphics/issues/1032), which
  needs each axis to belong to one node.

The machinery this note changes is described in
[Underlying Space](/internals/core/underlying-space) (σ-scopes, measures, the
self-scaling regions), [Layout and Render Passes](/internals/layout/passes) and
[Axes](/internals/frontend/axes). The note "How Axes Work" (PR #1117) maps the
ideas around it.

## 1. The decided direction

The maintainer approved each of these points. This note does not reopen them.

1. **Domains are keyed by measure.** Values of the same measure share a domain,
   and values of different measures never merge. Measure typing is gradual, as
   in TypeScript. A bare column name is an unknown unit that can unify with
   anything. A declared unit is fixed.
2. **The constraints decide whether two children share an axis,** in the same
   way the rest of the underlying space type is inferred.
3. **Axes are drawn only at `chart()` boundaries.**
4. **A coordinate transform starts a new space.**
5. **Every node maps its keyed domain into its own size.** That size is its slot
   or its fixed `w`/`h`. A size never splits a domain.
6. **Keyed domains are read through one accessor,** the space's merged unit. The
   #955 rewrite of `mergeMeasures`, `mergeCalendars` and `forgetOnConflict` and
   this work meet in one function.
7. **Hierarchical axes (#1115) draw nested keyed domains on one axis.**

## 2. Terms

- A **domain** is the range of data values a scale covers, e.g. 0 to 120 tons.
- A **unit** is what a value measures, e.g. millimeters or a count. Today GoFish
  calls this a measure (`Measure` in `data.ts`).
- A **declared unit** is a unit the program states. These are the declared
  units:
  - `Schema.unit("mm")` in a chart's schema (proposed in the measure design,
    not built yet);
  - `field(name, measure)` and `datum(v, measure)`, which exist today;
  - `.count()` and `.distinct()`, which give `"count"`;
  - `.normalize()`, which gives `"<unit> share by <field>"`;
  - `Schema.time()`, whose unit is "instant";
  - `bin()` provenance, where `count` is declared `"count"`.
- An **unknown unit** is a unit nobody stated. A column read by its bare name
  has an unknown unit, and the column name identifies it across the whole
  figure. So two uses of `"count"` are one unknown, and `bin("Beak Length
(mm)")` gives its `start`, `end` and `size` columns the unknown of
  `"Beak Length (mm)"`. A literal value with no column, e.g. `v(30)`, gets an
  unknown of its own with no name.
- To **unify** two units is to record that they are the same unit. Unifying an
  unknown with a declared unit binds the unknown to that unit.
- A **keyed domain** is the domain of one unit on one axis of one space. Its key
  is the axis and the unit after unification.
- A **space root** is a node that starts a new space. The render root is one,
  and every coordinate transform node (`coord`, or a `frame` with a `coord`
  option) is one. Keyed domains are collected per space root.
- A **sized node** is a node whose size on an axis is given to it rather than
  computed from σ. Section 5 lists them.
- **σ** (sigma) is the number of pixels per data unit, as in the underlying
  space essay.

## 3. The sharing fact

### What it is

For each node and each axis, the node's children fall into **sharing sets**.
Two children in one set share that axis. That means their data values on the
axis are read in one frame, so the same value lands at the same pixel, and
their unknown units unify. One of the sets is the node's **own set**. The own
set is what the node reports upward on that axis. A child in any other set is
**detached** on that axis. A detached child does not flow into its parent's
type on that axis.

The name comes from the maintainer's own word, "share". The code should call it
`sharing` rather than `shared`, because `GoFishNode.shared` already exists with
a different meaning (it marks a node as a σ-scope root, set by `sharedScale`).
That field is deleted by this work (section 7), but the two would be confused
while both exist.

### Derived, not stored

The sharing sets are derived. They are not a new field on the space type. They
are a fact about a node's composition, and they read only the constraints and
the child nodes, never a type or a claim. That is the same input
`planConstraintComposition` reads (`constraints/compose.ts:307`), so the sharing
sets belong next to it, as a new function in `compose.ts`:

```ts
// constraints/compose.ts (proposed)
type SharingPlan = {
  // Per axis: each child's set index. Set 0 is the node's own set.
  sets: [number[], number[]];
  // Per axis: children whose own extent sits in a frame of its own (a datum
  // placement, a data-valued size, a spread slot). Today `datumPlacedChildren`.
  nested: [Set<number>, Set<number>];
};
export function planSharing(
  constraints: ConstraintSpec[],
  childNodes: GoFishAST[]
): SharingPlan;
```

It cannot live inside `planConstraintComposition` as that function is written.
That function returns `undefined` for any layer with a point `position` or a
z-order (`compose.ts:333`), and the marginal histogram is exactly such a layer.
So `planSharing` runs for every layer, and `planConstraintComposition` keeps its
job of planning the folds. `datumPlacedChildren` (`compose.ts:117`) becomes the
`nested` half of the plan.

The space type changes in one place. `CONTINUOUS_TYPE.measure` becomes the
space's merged unit (section 4), and a node's type on an axis can hold more
than one continuous part when two different declared units share it (section
4). The sharing sets themselves are never stored on a space.

The type hook reads the plan. `resolveLayerBaseSpaces` (`compose.ts:210`) and
`composePlanSpaces` union only the own set into the layer's type, and they
unify units within each set. The layer is in `graphicalOperators/layer.tsx`
(`composeLayerTypes`, line 275).

### How the sets are built

Start with every child in the own set. Then apply the constraints in two steps:

1. Each constraint that detaches a child moves it into a set of its own on that
   axis.
2. Each constraint that joins children merges their sets. If any of them is in
   the own set, the merged set is the own set.

Joins run after detaches, so an `align` wins over a `position` on the same axis.
The marginal histogram needs this order (section 6).

### What each construct contributes

| Construct                                            | Contribution on the axis it names                                                                                                                                                                                               |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `layer` with no constraints                          | All children share both axes.                                                                                                                                                                                                   |
| `Constraint.position` with a literal pixel value     | Detaches the child.                                                                                                                                                                                                             |
| `Constraint.position` with a datum (point, interval) | The datum joins the own set. The child's own extent is nested at the datum, as `datumPlacedChildren` does today.                                                                                                                |
| `Constraint.align` with a point anchor               | Joins the listed children. `"span"` and `"size"` write an unbound target, so they contribute nothing.                                                                                                                           |
| `Constraint.distribute` with `glue: true` (stack)    | Joins the parts, because a stack adds its parts on one axis.                                                                                                                                                                    |
| `Constraint.distribute` with `glue: false` (spread)  | Detaches the parts from each other. Each part is nested in its slot, and the node's own type is the ordinal of the keys, as today. The parts' units still match when they are provably equal (section 4).                       |
| `Constraint.nest`                                    | Outer and inner share. Padding is pixels.                                                                                                                                                                                       |
| grid (`table`)                                       | Both axes act as spread directions.                                                                                                                                                                                             |
| z-order, `overlap`                                   | Nothing. They move no data.                                                                                                                                                                                                     |
| `spread`, `stack`                                    | What they elaborate to (`spread.tsx`), which is `align` on the cross axis and `distribute` on the direction.                                                                                                                    |
| `scatter`, `group`                                   | What they elaborate to, which is a layer with datum positions, or a plain layer.                                                                                                                                                |
| a literal `w`/`h` on a node                          | Nothing. A literal size carries no data, so the node reports its content's type.                                                                                                                                                |
| a data-valued `w`/`h` on a node                      | Nests the node's content. The node reports its own size as a magnitude in the parent's unit, and its content's domain is mapped into that size. This is the mosaic case.                                                        |
| `treemap`                                            | Nests each child on both axes, because the treemap sizes each child from data.                                                                                                                                                  |
| the `position` operator (`positionNode.tsx`)         | Nothing. The child stays shared. A datum offset moves the child in data, so the offset and the child are one unit. A pixel offset moves only paint, like `.translate()`, so the child's data still reads in its parent's frame. |
| `offset`                                             | Nothing. It moves pixels at paint time and passes the bounds through.                                                                                                                                                           |
| `ref`                                                | The target's type takes part where the ref sits.                                                                                                                                                                                |
| relate drawing clauses (`arrow`, `background`)       | Nothing. They read positions and carry no data.                                                                                                                                                                                 |
| Porter-Duff operators, `enclose`                     | Like a layer.                                                                                                                                                                                                                   |
| `coord`, `frame({ coord })`                          | A space root. It reports nothing upward, as today, and each instance starts its own space, so repeated instances of one spec do not share.                                                                                      |
| `chart()`                                            | Nothing. A chart is a frame with one child. A chart draws axes (section 5), and its `w`/`h` is a literal size.                                                                                                                  |
| render root                                          | A space root and a sized node.                                                                                                                                                                                                  |

Two rows are rules of a node rather than constraints of a layer: a
data-valued `w`/`h` and `treemap`. Each node type has a sharing rule next to its
type hook, and `planSharing` is the layer's rule. A node with no rule of its own,
such as the `position` operator, shares every child on both axes.

The data-valued size row is an inherent special case, not a patch. A
data-valued size is a value in the parent's unit, so the node already has a
type on that axis, and its content is a second coordinate inside the box. A
literal size is pixels, so the node has no type of its own and its content's
type is its type.

A detached child is either placed elsewhere (a literal `position`) or nested in
a slot (a spread part, a data-valued size, a datum placement). The difference
matters only for axes. A nested level is drawn inside its parent's axis as a
hierarchical level (#1115). A child placed elsewhere is not drawn by its
parent's axis at all, and if it is a chart it draws its own.

## 4. Units: unification and joins

### The join table

Two units meet when two children are in one sharing set, or when two children
detached from each other hold the same key. The result depends on whether the
axis is shared between them.

| Meeting                | Shared axis                                                       | Not shared                                |
| ---------------------- | ----------------------------------------------------------------- | ----------------------------------------- |
| declared A, declared A | One unit A, one domain.                                           | One unit A, one domain (the same key).    |
| declared A, declared B | Two keys on the axis. They never merge, and this is not an error. | Two separate domains.                     |
| declared A, unknown x  | x is bound to A. One domain.                                      | Forget. x stays unknown, and two domains. |
| unknown x, unknown x   | One unit, one domain (the same column).                           | One unit, one domain (the same column).   |
| unknown x, unknown y   | x and y unify. One domain.                                        | Forget. Two domains.                      |

"Forget" means the join records nothing and raises nothing. Each side keeps its
own unit and its own domain.

The not shared column is what the decided direction calls "provably equal". Two
detached children share a domain only when their units are the same declared
unit or the same column. Detached children never cause a binding.

### Where unification runs

The unknowns live in one union-find structure on the `RenderSession`, so a
binding made in one part of the figure holds everywhere. A binding is made at
the moment two units meet in one sharing set during the bottom-up type walk.
Union-find gives the same final sets in any order of meetings.

Two parts of one node's type on one axis are therefore always two different
declared units. An unknown that meets a declared unit in one set is bound at
once, so it can never sit beside it as a separate part.

Two errors remain. Both are inherent and both are rare:

- A stack whose parts have two different declared units. A stack adds its
  parts, and a count plus a length has no meaning. This is the #984 rule that a
  stack needs a sum.
- One unknown bound to two different declared units, e.g. a column that meets
  `"count"` on one shared axis and `"mm"` on another. The column cannot be both.
  Open question 4 asks whether this should forget instead.

`MeasureClash` stops being the default outcome of two different units on one
axis once the per-key scale carrier (#528) lands. Until then, two declared units
on one shared axis keep raising `MeasureClash` (question 2 in section 8).

### The one merge function and the one accessor

The measure design proposes one record per unit, `{ unit?, calendar?, titles }`:

- `unit` is a declared unit or an unknown;
- `calendar` is the time zone of a time unit, today's `HasCalendar`;
- `titles` is the set of column names, which titles the axis.

One function joins two records. It takes the sharing fact as an argument:

```ts
// underlyingSpace.ts (proposed)
joinUnits(a: UnitRecord, b: UnitRecord, shared: boolean, site: MeasureSite): UnitRecord
```

It follows the join table for `unit`, joins `calendar` by equal zone, and
unions `titles`. It replaces these three functions:

- `mergeMeasures` (`underlyingSpace.ts:442`), whose callers are `alignment.ts`,
  `distribute.ts:303`, `compose.ts:185`, `constraints/index.ts` (lines 260 to
  337), `shapes/rect.tsx:117`, `cut.tsx` and `fieldExpr.ts:453`;
- `mergeCalendars` (`underlyingSpace.ts:369`), which is called beside it at
  `rect.tsx:122`, `compose.ts:194`, `constraints/index.ts:332` and
  `positionNode.tsx:41`;
- `forgetOnConflict` (`underlyingSpace.ts:513`), used for ordinal axes. An
  ordinal axis's measure is the grouping field. It is a title, not a unit, so
  under the record it lives in `titles` and the special rule goes away.

One accessor reads a space's unit, `spaceUnit(space)`. It returns the record
with `unit` replaced by its representative in the union-find. Every reader that
asks "which domain is this" goes through it:

```ts
keyedDomain(spaceRoot, axis, spaceUnit(space).unit);
```

The readers are the σ solve, nicing, the axis elaboration, and the embedding
gate (`baseEmbedded` in `data.ts`).

## 5. Where domains are decided and where σ is solved

Sizes no longer split domains, so domains and σ are decided at different places.

### Domains are decided per space root, after the type walk

After the type walk, one pass at each space root builds the keyed domain table.
For each axis and each unit (after unification), the domain is the union of the
intervals at the top of every sharing set with that unit in the space. The top
of a set is the node where the set stops, which is the child its parent
detaches, or the space root. A free top is seated at data 0, as the render root
seats a free space today (`placeBaseline`).

The intervals below a top are not added, because a free part of a stack is
measured from its own baseline, not in the stack's frame.

Nicing becomes a per-key operation. A keyed domain is niced if and only if some
chart draws an axis for that key. Today the demand is found by walking a
"space-flow region" (`GoFishNode.scopeAxisTicks`, `_node.ts:1372`). The walk is
not needed once demand is per key.

### σ is solved at sized nodes, top-down, during layout

These are the sized nodes on an axis:

- the render root, sized by the canvas;
- each coordinate transform, sized by its box;
- a node with a literal `w`/`h`;
- a node with a data-valued `w`/`h`, sized by its parent's σ, which then maps its
  content into that size;
- each part of a spread on the spread's direction when the parts are pinned
  frames (facet panels), sized by its slot.

A sized node solves its σ once, through the one solve site,
`ScopeRegistry.solveScope` (`solver/scopes.ts`). Before the solve, its claim is
widened from its own data interval to its keyed domain. This is the same
arithmetic `niceScope` (`extent.ts:105`) uses to widen a claim to a niced
domain. Then the claim is niced. Every other node inherits σ, as it does today.

A spread of magnitudes along its direction is not a sized node. Its parts are
parts of one chain claim, as today, and the enclosing sized node solves σ
against the chain.

A node with two keys on one axis would need one σ per key. That is the
multi-scale carrier of #528. Section 9 puts it in the last step.

### Axes

An axis is drawn at a chart boundary. A chart's axis shows the keys of its own
set on that axis, read through `keyedDomain`, and it maps them with the chart's
own σ. Nested levels below it are drawn as hierarchical levels once #1115 lands.

Chrome is elaborated after the domains are decided, and it reads them. Chrome
rings must not decide domains. This matters because each ring pins its content
with a literal `position({ x: 0, y: 0, anchor: "baseline" })`, which under the
table in section 3 would detach the content.

One keyed domain can be mapped at several sizes, but a chart draws one axis
with its own σ. The axis is correct only for content mapped at the same σ.
Question 5 in section 8 records the decision.

### The scope dump

`GOFISH_DUMP_SCOPES` keeps its one line per solve. The scope kinds shrink to
`root`, `coord`, `sized` and `grid` (and `recenter`). A new dump line per keyed
domain prints the key, the domain, and the charts that view it.

## 6. The cases

The census in #1114 ran all 440 stories. 391 solve scales only at the render
root. 49 start a scope lower down. Of those, 39 should render the same (mostly
coordinate transforms, the colorbar legend, and charts nested in a `frame`), 7
change in a neutral or better way, and 3 are the stories below that would break
under one bundled scale (`NestedCharts`, `Flower Chart`, `Nested Mosaic`).

### Marginal histogram

```ts
// stories/seaborn/MarginalHistogram.stories.tsx:74-80
await layer([sc, topHist, rightHist]).relate(
  ({ scatter, topHist, rightHist }) => [
    Constraint.position({ x: 0, y: 0, anchor: "baseline" }, [scatter]),
    Constraint.align({ x: "baseline" }, [scatter, topHist]),
    Constraint.align({ y: "baseline" }, [scatter, rightHist]),
    Constraint.position({ y: args.h + GAP, anchor: "start" }, [topHist]),
    Constraint.position({ x: args.w + GAP, anchor: "start" }, [rightHist]),
  ]
);
```

`topHist` is `chart(data, { h: 80 })` over `bin("Beak Length (mm)")` with
`rect({ h: "count" })`. `rightHist` is the same with `w: 80` over beak depth.

The sharing sets are built in two steps. First the literal positions detach the
scatter on both axes, `topHist` on y and `rightHist` on x. Then the aligns join
the scatter with `topHist` on x and with `rightHist` on y.

| Axis | Own set              | Detached    |
| ---- | -------------------- | ----------- |
| x    | scatter, `topHist`   | `rightHist` |
| y    | scatter, `rightHist` | `topHist`   |

On x, the scatter's `"Beak Length (mm)"` and `topHist`'s bin edges are the same
column through bin provenance, so they share one domain. On y, the scatter's
`"Beak Depth (mm)"` and `rightHist`'s bin edges share one domain. `topHist`'s y
is declared `"count"` and is detached, so it keeps its own domain, and it maps
that domain into its 80 px. `rightHist`'s x count does the same.

Expected result: the render is unchanged. Today this works because `h: 80`
makes `topHist` a self-scaled region. After the change the `position`
constraint does that job, and `h: 80` only sets the size.

### The #955 overlays

These are unconstrained `.layer` tiers, so they share both axes.

```ts
// llm-bench reference create/hexbin (branch worktree-llm-benchmark-design)
chart(cells, { color: ORANGES })
  .flow(group({ by: "key" }))
  .mark(polygon({ points: "ring", fill: "count" }))
  .layer(
    chart(frame)
      .flow(scatter({ by: "x", x: "x", y: "y" }))
      .mark(blank())
  );
```

The polygon carries no measure on either axis today, so its units are unnamed
unknowns. They unify with `"x"` on x and with `"y"` on y. Expected result: one
domain per axis, as the reference intends.

```ts
// stories/forwardsyntax/TimeBenchmarkPorts.stories.tsx (SurplusDeficitLine)
chart(area, { schema, axes: true })
  .flow(group({ by: "side" }), scatter({ by: "date", x: "date" }))
  .mark(ribbon({ h: "balance", fill: "side", curve: Curve.linear() }))
  .layer(
    chart(rows, { schema })
      .flow(scatter({ by: "date", x: "date", y: "balance" }))
      .mark(blank())
  )
  .layer(line({ stroke: "#222", strokeWidth: 1.5, curve: Curve.linear() }));
```

x is `"date"`, declared "instant" by `Schema.time()`, in every tier. y is the
column `"balance"` in both tiers, so it is one unknown. Expected result:
unchanged.

The ridgeline references (the story `RidgelineChart.stories.tsx` and the
benchmark's `create/ridgeline`) add a tier of month labels at literal
coordinates. The tier carries no data, so it takes part in no join. Expected
result: unchanged. The ridges themselves are covered with the facets below.

The #955 failures that this fixes are the ones where two different unknown
columns meet on a shared axis, e.g. a box plot's `lo`, `q1`, `q3` and `hi`
columns computed in user code. Today each is a `MeasureClash`.

### Faceted scatter

```ts
// stories/forwardsyntax/FacetedChart.stories.tsx (FacetedScatterDriving)
chart(drivingShifts, { axes: true })
  .flow(
    spread({ by: "side", dir: "x", spacing: 50 }),
    scatter({ x: "year", y: "miles", axes: { x: true, y: false } })
  )
  .mark(circle({ r: 3, fill: "#4682b4" }));
```

The spread joins the panels on y through its cross-axis align, so `"miles"` has
one domain and flows up to the chart. On x the panels are detached and nested
in their slots. Each panel's x is the column `"year"`, so the keys are equal and
the panels share one domain. Each panel maps the domain into its slot.

Expected result: every panel runs from 1955 to 2010. Today the "top" panel runs
from 1955 to 2000. `FacetedScatterY` is the same with the directions swapped,
and its panels share one `"gas"` domain on y.

The ridgeline is the same shape. Its rows are a spread on y, each row a
`scatter({ x: "temp_max", w: args.w })` of `ribbon({ h: "count" })`. The rows
share x through the align, and the `"count"` key is equal along y, so every
ridge uses one count σ. Today the same picture comes from each row being
self-scaled over the same domain, plus the axis code that notices the rows agree
(`sharedSelfScaledChildSpace`). Expected result: unchanged.

The panels' per-panel x axes come from the operator option
`axes: { x: true, y: false }`, which is not a chart boundary. Open question 6
covers this.

### Grouped bars with an inner `h: 150`

```ts
chart(seafood, { axes: true })
  .flow(
    spread({ by: "lake", dir: "x" }),
    stack({ by: "species", dir: "x", h: 150 })
  )
  .mark(rect({ h: "count", fill: "species" }));
```

y is the cross axis of both operators, so every bar is in one set and `"count"`
has one domain, 0 to 1.1. Each inner stack is a sized node on y. It widens its
claim to the keyed domain and solves 1.1σ = 150.

Expected result: 1.1 maps to 150 px in every group. Today each group fills
150 px with its own maximum, and the y axis disappears. The chart's y axis is
correct if the chart's own height is also 150 px. Every group has the same
size, so the chart's axis lines up with them (question 5 in section 8).

### NestedCharts

```ts
// stories/lowlevel/NestedOrientation.stories.tsx:22-37
const miniChart = (bars: number[], key: string) =>
  spreadX(
    { key, spacing: 4, alignment: "start", h: 160 },
    map(bars, (b, i) => rect({ key: `${key}-${i}`, w: 12, h: v(b) }))
  );
spreadX(
  { spacing: 40, alignment: "start" },
  map(groups, (g) => miniChart(g.bars, g.name))
).render(container, { axes: true });
```

The values are literals with no column, so each is an unnamed unknown. The outer
spread's cross axis is y, so all the bars share y and the unknowns unify. The
domain is 0 to 95, and each mini chart maps it into 160 px.

Expected result: an honest grouped bar chart with one y axis. This story moves.
It is a y-up orientation test, so the move is a fix.

### Nested mosaic

```ts
// stories/lowlevel/NestedMosaicChart.stories.tsx:41-54
chart(titanic, { axes: true })
  .flow(
    stack({ by: "class", dir: "y", size: field("count").normalize() }),
    stack({ by: "sex", dir: "x", size: field("count").normalize() }),
    stack({ by: "survived", dir: "y", size: field("count").normalize() })
  )
  .mark(
    rect({ fill: (d) => (d.survived === "No" ? gray : classColor[d.class]) })
  );
```

Each `size` wraps each child in a layer with a data-valued size, so each level
nests its content. On y the class stack's domain is "count share by class", 0 to
1, and each class row maps the nested "count share by survived" domain, also 0
to 1, into its own height. On x every row's sex stack is joined by the class
stack's cross-axis align, so "count share by sex" has one domain, 0 to 1, and
each row maps it into the full width.

Expected result: the render is unchanged. The y axis still reads "count share
by class" from 0 to 1. It is wrong inside the rows, as #1114's declared shortcut
says, and #1115 draws the nested survived level.

### Flower chart

The spec is the fluent one from PR #1113, not yet on `main`:

```ts
const flower = chart({ coord: Coord.polar(), axes: false })
  .flow(stack({ by: "species", dir: "x", h: 40 }))
  .mark(petal({ w: "count", fill: "species" }));

chart(stemData, { axes: false })
  .flow(scatter({ by: "lake", x: "x" }))
  .mark(
    layer([
      rect({ w: 4, h: "count", fill: "green" }).name("stem"),
      flower.name("flower"),
    ]).relate(({ stem, flower }) => [
      Constraint.align({ x: "middle", y: ["end", "middle"] }, [stem, flower]),
    ])
  );
```

Each flower is a coordinate transform, so each flower is its own space, and its
angle domain is that flower's total count. The stems are nested at their datum
x and share y, so all stems use one `"count"` domain. The stems' `"count"` and
the petals' `"count"` are one unit, but they are in different spaces, so they
are different domains.

Expected result: the render is unchanged, with one full circle per flower. On
`main` the low-level version gives the same result for the same reason.

### Gapminder kinematics rows

```ts
// stories/animated-vega-lite/Gapminder.stories.tsx:556-562, 590-620
const sparkSamples = (samples: Sample[]) =>
  chart(samples, { axes: false, padding: 0 })
    .flow(
      spread({ by: "method", dir: "x", spacing: SPARK_GAP, axes: false }),
      scatter({ by: "t", x: "t", y: "value", axes: false })
    )
    .mark(circle({ r: 2.5, opacity: 0 }));

const sparkRow = (samples, clock, w) =>
  frame({ w, h: SPARK_H_PX, coord: Coord.linear(), padding: 0 }, [
    frame({ w, h: SPARK_H_PX }, [sparkSamples(samples).layer(line({ ... }))]),
    frame({ w, h: SPARK_H_PX }, [sparkSamples(samples).layer(time.transition({ ... }))]),
  ]);
```

Every row plots the same column, `"value"`, whether it holds position, velocity
or acceleration. The rows are not separated by their columns. Each `sparkRow` is
a `frame` with `coord: Coord.linear()`, which is a coordinate transform, so each
row is its own space. The step column is a separate `sparkRow`, so it is its own
space too. Inside a row the two overlaid frames share both axes and read the
same rows, so they get one domain.

Expected result: unchanged. Without the `Coord.linear()` frame the decided rules
would share the rows. The rows are a spread on y of charts with the same column,
so their keys are equal, and the step column sits beside the others on the
shared cross axis.

The frame stays for now. It separates the rows by putting them in different
spaces, not by saying that their units differ. A unit that comes from a key
column, e.g. a `quantity` column that names what each `value` row measures, is
[#1122](https://github.com/gofish-graphics/gofish-graphics/issues/1122).

### `chart(data, { w, h })`

A literal size no longer detaches or self-scales anything. The chart is a sized
node. It maps its keyed domains into its `w` and `h`, reports its types upward,
and draws its axes.

Expected result: the chart keeps its y axis.

## 7. What gets deleted

- **The self-scaled stash** in `layer.tsx` (the type hook around line 387, the
  claim hook around line 479), with `GoFishNode.selfScaledSpace`
  (`_node.ts:584`). A literal size no longer reports `UNDEFINED`.
- **The axis hoist for agreeing self-scaled siblings**:
  `selfScaledAxisSignature`, `sharedSelfScaledChildSpace` (`_node.ts:376` to
  `433`), `GoFishNode.hoistedAxisSpace`, and the two branches of `resolveAxes`
  that use them. The section "Unifying duplicate axes across self-scaled
  siblings" in the Axes essay goes with them.
- **Four scope roots**: `self-scaled`, `datum-position`
  (`buildPositionScalePlan`, `proposalPlan.ts:357`), `shared` and
  `constraint-budget` (both in `buildChildScalePlan`, `proposalPlan.ts:194`).
  They become one rule, which is that a sized node solves.
- **The `sharedScale` option** on `spread` and `stack` (`spread.tsx:208`), the
  `shared` field and `setShared`, and the chart's `setShared([true, true])`
  (`chartBuilder.ts:999`). About 54 stories and test charts pass `sharedScale`,
  and the handwritten pages `js/gotree.md` and `js/tutorials/charts.md` mention
  it, so their code blocks change in the same work.
- **The space-flow region walk** in `scopeAxisTicks` (`_node.ts:1372`), replaced
  by per-key nicing demand.
- **`MeasureClash` as the default outcome** of two units on one axis. The class
  stays for the two errors in section 4. Its message changes, because "give the
  inner chart its own w and h so it scales on its own" is no longer a remedy.
- **`mergeMeasures`, `mergeCalendars`, `forgetOnConflict`**, and the array forms
  `mergeAllMeasures` and `forgetAllMeasures`, replaced by `joinUnits`.

## 8. Open questions and decisions

The maintainer decided questions 2, 5 and 7 at sign-off, and the Gapminder case
under question 1. Each decision is marked **Decided**. The others stay open.

1. **Opting out of a shared domain.** Two charts with the same column now share
   a domain wherever they sit, e.g. two count histograms placed apart with
   `position`. Is there syntax to keep them independent? A `frame` with
   `coord: Coord.linear()` already does it, because it starts a new space, and
   the Gapminder kinematics rows rely on that. Is that the opt-out, or is a
   named one needed?

   **Decided** for long-format data: the Gapminder kinematics rows plot one
   `value` column for several quantities, and they keep the
   `frame({ coord: Coord.linear() })` for now. A unit that comes from a key
   column is
   [#1122](https://github.com/gofish-graphics/gofish-graphics/issues/1122).

2. **Which keyed domain an axis draws when a chart holds several.** Before #1115
   and #528, a chart's axis can show one key. For nested keys (the mosaic) this
   note proposes the outermost key, which is what the mosaic shows today. For
   two declared keys side by side on a shared axis (a count overlaid on
   millimeters), the options are to draw the first, to draw neither, or to keep
   that case an error until the dual axis lands.

   **Decided:** two declared units on one shared axis keep raising
   `MeasureClash` until the per-key scale carrier (#528) lands. This is the
   declared shortcut of step 7 in section 9.

3. **Strict mode.** Should there be a mode where two different declared units on
   a shared axis are an error, and unknowns do not unify? Where would it be set,
   per chart or per render?
4. **One unknown bound to two declared units.** Section 4 makes this an error.
   The other choice is to forget, so the column keeps the first binding in each
   place. The error is more honest, and the case looks rare.
5. **One domain at two sizes.** Rule 5 lets one keyed domain be mapped at
   several sizes, e.g. inner groups with `h: 150` and `h: 100` in one chart. A
   chart's axis has one σ, so it can match only one of them. Two decisions are
   needed:
   - whether a node whose content has a fixed size takes that size, so the
     grouped bar chart's axis matches its 150 px groups;
   - what the axis does when the sizes differ, e.g. draw one axis per sized
     node, or draw none.

   **Decided:** equal sizes are fine, and the chart's axis lines up with them,
   e.g. grouped bars with `h: 150` on every group. When one shared keyed domain
   is mapped at unequal sizes, the layout is over-constrained, and it is handled
   like any other over-constrained layout.

6. **Operator `axes` options.** `spread({ axes })` and `scatter({ axes })` draw
   axes at nodes that are not charts. Twelve stories use them, including
   `FacetedScatterDriving` and the ridgeline. Rule 3 removes them. Until #1115
   can draw a ruler inside each facet slot, should they stay as a declared
   shortcut, or go now with a known loss of per-panel axes?
7. **Equal-measure recentering (#582).** When x and y have the same unit, the
   root gives them the same σ (`recenterEqualMeasure`, `gofish.tsx:528`).
   Unification can now make x and y one unit through a chain of overlays, e.g.
   one tier with `x: "a", y: "b"` and another with `x: "b", y: "c"`. Should the
   recentering fire only for declared units?

   **Decided:** the recentering fires only when x and y have the same declared
   unit. Unknowns unified through overlays never trigger it.

8. **`field(name, measure)`.** The measure design suggests removing it in favor
   of `Schema.unit`. This note treats it as a declared unit and leaves that
   choice to #994.

## 9. Implementation order and verification

Each step lands on its own. Steps 1 to 3 must be pixel-equal on every story.
Steps 1, 2 and 4 belong to the measure inference session (#994 and its
"Sketch 3"). This work does steps 3 and 5, and step 6 through #1032.
`capture-diff` against the previous step is the inner check, and the CI visual
baselines are the outer check.

1. **Units in the column type (#994).** Move measure provenance into
   `ColumnType` and add `Schema.unit`. No render changes.
2. **One merge function and one accessor.** Add `joinUnits` and `spaceUnit` with
   today's strict rule, so every axis acts as shared and every unknown acts as
   declared. Replace the three merge functions at every call site. No render
   changes. This is the step where the #955 rewrite and this work meet.
3. **The sharing plan.** Add `planSharing` and its unit tests, one per row of
   the table in section 3. Nothing reads it yet except a debug dump. No render
   changes.
4. **Gradual units.** `joinUnits` follows the join table, and unknowns unify
   through the union-find. Expected render changes are none, except stories
   where #582 recentering newly fires. Since it fires only for declared equal
   units (question 7 in section 8), unification alone moves none. `capture-diff`
   must show which, if any. Add stories or tests for the #955 cases that now pass: the
   box plot from user code, the hexbin overlay, and the bullet chart.
5. **Keyed domains and sized nodes.** Build the keyed domain table per space
   root, solve σ at sized nodes, and make the deletions in section 7. Expected
   moves:
   - `NestedCharts` and the 7 neutral or better stories from the census, which
     include the faceted scatters;
   - no other story.

   Expected to stay pixel-equal: the other 39 of the 49, the 391 root-only
   stories, `MarginalHistogram`, `Nested Mosaic`, `Flower Chart`, the
   ridgeline and the Gapminder stories. Read each moved story before explaining
   its diff.

6. **Axes at chart boundaries.** This depends on open question 6 and on #1032.
7. **More than one key per node.** The per-key scale carrier and the dual axis
   (#528), and hierarchical axes (#1115). Until this step, a node that holds two
   declared keys on one axis keeps raising `MeasureClash`. This is a declared
   shortcut inside the order, because the carrier is its own design.

Acceptance tests, from #1114 and from this note:

- `Nested Mosaic` and `Flower Chart` render identically to today.
- In `FacetedScatterDriving` and `FacetedScatterY`, all panels share one domain.
- Grouped bars with `h: 150` on the inner groups share the y domain, and 1.1
  maps to 150 px in every group. This needs a new story.
- `chart(data, { w, h })` keeps its y axis. This needs a new story.
- In the marginal histogram, x stays shared and y stays separate.
- In the Gapminder kinematics rows, each row keeps its own y domain.
- Unit tests for `joinUnits` cover every cell of the join table.
- A `capture-diff` of every story moves only the stories listed in step 5.

## 10. Alternatives considered

Two alternatives inform the open questions.

- **Decide domains at every `chart()` boundary.** This was the first form of
  #1114. It cuts the marginal histogram's x axis, because the scatter and the
  top histogram are separate charts, so their x axes line up only by chance.
  It is the reason open question 1 asks for an opt-out rather than a default
  split.
- **Join domains by axis only, with no keys.** The y axis of the marginal
  histogram then puts a count and a beak depth in one domain, which today is a
  `MeasureClash`. It is the reason open question 2 exists, because a key per
  unit means an axis can hold more than one.

## Related

- [#1114](https://github.com/gofish-graphics/gofish-graphics/issues/1114),
  [#1115](https://github.com/gofish-graphics/gofish-graphics/issues/1115),
  [#1032](https://github.com/gofish-graphics/gofish-graphics/issues/1032)
- [#955](https://github.com/gofish-graphics/gofish-graphics/issues/955) and
  [#994](https://github.com/gofish-graphics/gofish-graphics/issues/994), measure
  inference and units in the column type
- [#984](https://github.com/gofish-graphics/gofish-graphics/issues/984), space
  kinds from capabilities
- [#528](https://github.com/gofish-graphics/gofish-graphics/issues/528), dual
  axes
- [#582](https://github.com/gofish-graphics/gofish-graphics/issues/582),
  equal-measure recentering
