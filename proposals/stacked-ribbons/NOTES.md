# Stacked / divided ribbons: prototype notes

Prototype stories for an API proposal on sankey, parallel sets, sankey tree and
chord diagrams. Every picture below was rendered with
`pnpm --filter @gofish/tests capture-one "<story>"` and looked at.

- Stories: `packages/gofish-graphics/stories/_proposals/stacked-ribbons/`
  (titles `Proposals/Stacked Ribbons/...`)
- Images: `proposals/stacked-ribbons/img/`
- Shared plain-JS preprocessing: `stories/_proposals/stacked-ribbons/sankeyPrep.ts`
  (`sankeyDepths`, `orderColumns`, `unpivotLinkEnds`) and `approachA.ts`
  (`rewriteToEnds`, `renderA`).

## Library source changes

Exactly one file, new and throwaway:

- `packages/gofish-graphics/src/ast/graphicalOperators/_proposalChordRibbon.ts`
  (about 120 lines). Not exported from `lib.ts`, not serialized, not tested.
  Imported directly by `Chord.stories.tsx`. Delete it with the proposal. It
  contains two hacks, both recorded in the chord findings below: its node has
  `type: "connect"` and its mark is registered as type `"ribbon"`.

No existing source file was edited.

## Baselines (today's stories, unchanged)

| Story                                      | PNG                          |
| ------------------------------------------ | ---------------------------- |
| Low Level Syntax/Sankey Tree               | `img/sankey-tree-today.png`  |
| Forward Syntax/Ribbon/Basic (Ribbon Chart) | `img/ribbon-chart-today.png` |

The hand-built sankey tree spec is about 137 lines (the `layer([...])` through
`.render`, plus a 6-line color table). It names one rect per link end and lists
every ribbon pairwise in `.relate`.

---

## Approach B: "ends are rows"

A link (or a path) with value v has two (or n) ends. Unpivot the table into
one row per END, place the ends with the ordinary flow (the ends inside a node
are its stacked "port" rects), and draw one ribbon per link/path over the
named ports with `chart(selectAll("ports")).flow(group({ by: "link" })).mark(ribbon())`.

### B1. Parallel sets: titanic class, sex, survived

**PNG:** `img/parallel-sets.png` (story `Parallel Sets/Ranked`).
Failure / diagnostic pictures: `img/parallel-sets-fused-fails.png` (`Fused`),
`img/parallel-sets-fused-no-category.png` (`FusedNoCategory`),
`img/parallel-sets-unranked.png` (`ByPath`, which also shows the stack scale
bug below: the class column is drawn at half the scale of the others).

```ts
const AXES = ["class", "sex", "survived"] as const;
export function unpivotEnds(rows, axes, value) {
  return rows.flatMap((r, path) =>
    axes.map((axis) => ({
      ...r,
      path,
      axis,
      category: String(r[axis]),
      value: r[value],
    }))
  );
}
const sorted = [...titanic].sort(
  (a, b) =>
    a.class.localeCompare(b.class) ||
    a.sex.localeCompare(b.sex) ||
    a.survived.localeCompare(b.survived)
);
const ends0 = unpivotEnds(sorted, AXES, "count");
// per-end sort key: the path's categories on the neighbor axes, nearest first
const ends = ends0.map((e) => {
  const k = AXES.indexOf(e.axis);
  const order = [...AXES.slice(0, k).reverse(), ...AXES.slice(k + 1)];
  return { ...e, rank: order.map((a) => String(e[a])).join("|") };
});

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

- **Works as-is:** yes, with zero core changes, in the refs-bag form.
- **Lines of spec:** about 30 (12 data prep, 13 chart).
- **Workarounds:**
  - The unpivot is hand-written JS.
  - A per-axis sort key (`rank`). The right order of the ends inside a
    category is different on every axis (order by the neighbor axis first),
    so one `by: "path"` cannot express it.
  - `spread({ spacing: 0 })` instead of `stack` for the innermost tier (see
    the stack scale bug).
  - `axes: false` on the rank tier, else every end gets a tick label.
- **Bugs hit:**
  - The fused form `.layer(ribbon({ along: "axis" }))` draws **no ribbons**
    (`Fused`). The default split makes every non-path tier a split key; the
    category tier's key changes along a path (First, then Female, then Yes),
    so every split group holds one end. Removing the category tier
    (`FusedNoCategory`) brings the ribbons back, which confirms the cause. This
    is not #877. It is the #786 rule meeting a flow where a tier's key is not
    constant along the path.
  - **Stack scale bug (new, worth an issue):** a data-sized `stack` nested in
    a `spread` nested in a `spread` gives each outer column its own scale when
    the columns have different numbers of children. Minimal repro:
    `Scale Repro/StackInSpreadInSpread` (`img/bug-stack-scale.png`); two
    columns that both total 100 draw at different heights. The same flow
    with `spread({ spacing: 0 })` in place of `stack`
    (`img/bug-stack-scale-workaround.png`) and the same flow with equal child
    counts (`StackInSpreadSameCount`) are both correct.
  - `spread` and `stack` order their groups in opposite directions on y: a
    y `spread` puts its first group on top, a y `stack` puts its first group
    at the bottom. Mixing them made the ribbons leave each bar upside down
    relative to the next axis until the stack was `.reverse()`d.

### B2. Sankey tree: titanic class, class/sex, class/sex/survived

**PNG:** `img/sankey-tree-rows.png` (story `Sankey Tree Rows/Default`), and
`img/sankey-tree-rows-per-segment.png` (`PerSegment`, ribbons colored per tier).

```ts
export function unpivotTreeEnds(rows) {
  return rows.flatMap((r, path) => [
    { ...r, path, depth: 0, sub: "", leaf: "", value: r.count },
    { ...r, path, depth: 1, sub: r.sex, leaf: "", value: r.count },
    { ...r, path, depth: 2, sub: r.sex, leaf: r.survived, value: r.count },
  ]);
}
const ends = unpivotTreeEnds(titanic).map((e) => ({
  ...e,
  rank: `${e.sex}|${e.survived}`,
}));

const nodes = () =>
  chart(ends)
    .flow(
      spread({ by: "depth", dir: "x", spacing: 64, alignment: "middle" }),
      spread({ by: "class", dir: "y", spacing: 8, alignment: "middle" }),
      spread({
        by: field("sub").sort(),
        dir: "y",
        spacing: 4,
        alignment: "middle",
        axes: false,
      }),
      spread({
        by: field("leaf").sort(),
        dir: "y",
        spacing: 2,
        alignment: "middle",
        axes: false,
      }),
      spread({ by: field("rank").sort(), dir: "y", spacing: 0, axes: false })
    )
    .mark(rect({ w: 40, h: "value", fill: "class" }).name("ends"));

// Default: one ribbon per path through all three depths
layer([
  nodes(),
  chart(selectAll("ends"))
    .flow(group({ by: "path" }))
    .mark(ribbon({ opacity: 0.6, fill: "class", curve: Curve.bezier() })),
]).render(container, { w: 360, h: 500 });

// PerSegment: one ribbon layer per pair of adjacent depths
layer([
  nodes(),
  chart(selectAll("ends"))
    .flow(
      filter((r) => project(r, "depth") <= 1),
      group({ by: "path" })
    )
    .mark(ribbon({ opacity: 0.6, fill: "class", curve: Curve.bezier() })),
  chart(selectAll("ends"))
    .flow(
      filter((r) => project(r, "depth") >= 1),
      group({ by: "path" })
    )
    .mark(ribbon({ opacity: 0.6, fill: "survived", curve: Curve.bezier() })),
]).render(container, { w: 360, h: 500 });
```

- **Works as-is:** yes, zero core changes.
- **Lines of spec:** about 35 (Default) / 42 (PerSegment), against about 137
  for today's hand-built story. The nested spacing (classes 8, sexes 4,
  leaves 2) is just three nested `spread`s, because each end row carries its
  ancestors' keys.
- **Workarounds:**
  - Hand unpivot; each depth's row must carry blank keys (`sub: ""`,
    `leaf: ""`) for the tiers it does not have.
  - A sort key (`rank`) for the ends inside a node, and the node tiers must be
    sorted to agree with it (`field("leaf").sort()`); with the leaves in data
    order (Yes before No) and the ends sorted No before Yes, every last-tier
    ribbon crossed its sibling.
  - The tree's link from a node to a child is drawn as several adjacent path
    ribbons (one per leaf under it). They look like one band because they are
    adjacent and the same color. A per-link color (like today's story) needs
    one ribbon layer per segment.
- **Bugs / surprises:**
  - `filter` over a refs bag gets `GoFishRef`s whose `.datum` is the BAG of
    rows, so `r.datum.depth` is `undefined` and the filter silently drops
    everything (no ribbons, no error). `project(r, "depth")` works. `group`
    does this projection for you; `filter` does not.

### B3. Energy sankey: the many-to-many case (d3 UK energy, 48 nodes, 69 links)

**PNG:** `img/energy-sankey.png` (story `Energy Sankey/Default`), full data set,
no subset needed. Probe: `img/energy-sankey-fixed-height-fails.png`
(`FixedColumnHeight`).

```ts
// sankeyPrep.ts (plain JS, about 110 lines): sankeyDepths (longest path from a
// source, sinks pushed to the last column = d3 sankeyJustify), orderColumns
// (4 barycenter sweeps, a stand-in for d3's relaxation), unpivotLinkEnds
// (two rows per link: side "out" at the source, "in" at the target; `key`
// = the far node's rank in its column, tie-broken by link index; `src` =
// the link's source for color).
const names = energy.nodes.map((n) => n.name);
const links = energy.links.map((l) => ({
  source: names[l.source],
  target: names[l.target],
  value: l.value,
}));
const depth = sankeyDepths(names, links);
const order = orderColumns(names, links, depth);
const ends = unpivotLinkEnds(order, links, depth);

layer([
  chart(ends)
    .flow(
      spread({
        by: field("depth").sort(),
        dir: "x",
        spacing: 100,
        alignment: "start",
        axes: false,
      }),
      spread({
        by: field("node").sort(order),
        dir: "y",
        spacing: 10,
        axes: false,
      }),
      spread({
        by: field("side").sort(["in", "out"]),
        dir: "x",
        spacing: 0,
        alignment: "start",
        axes: false,
      }),
      spread({ by: field("key").sort(), dir: "y", spacing: 0, axes: false })
    )
    .mark(rect({ w: 6, h: "value", fill: "#555" }).name("ports")),
  chart(selectAll("ports"), { legend: false })
    .flow(group({ by: "link" }))
    .mark(ribbon({ opacity: 0.4, fill: "src", curve: Curve.bezier() })),
]).render(container, { w: 960, h: 600, legend: false });
```

- **Works as-is:** yes, zero core changes. It reads as the classic energy
  sankey, top-aligned instead of relaxed.
- **Lines of spec:** 18 for the chart, plus about 110 lines of precompute
  (most of it `orderColumns`, which is a layout algorithm, not data prep).
- **Workarounds:**
  - Node depth is precomputed (d3 `sankeyJustify`-like).
  - Node order inside a column is precomputed (barycenter sweeps). Data order
    alone gave many more crossings.
  - The end sort key is the far node's rank in its column, a guess made
    before layout. It is exact only when the far nodes' columns line up.
  - A node is drawn as two half-width port stacks side by side (in on the
    left, out on the right). Node height is whichever side is taller, so a
    node whose in and out sums differ shows a notch. There is no node box;
    `enclose({ shape: Shape.box(), padding: 0 })` over `group({ by: "node" })`
    would add one, but was not needed for the picture.
  - Every tier needs an explicit sort (`field("depth").sort()` too: with
    first-appearance order the columns came out shuffled).
  - Labels are turned off. With them on, the node names sit as y-axis tick
    labels left of every column and the chart outgrows the frame. Real sankey
    labels belong to the label proposal (`.label()` / `Place`).
- **Bugs / surprises:**
  - `render({ w: 960 })` is not a hard width: the spread chain is as wide as
    its spacings and labels make it (it overflowed the viewport with labels on).
  - d3 makes every column fill the full height by growing the gaps. Giving the
    node tier `h: 560` instead RESCALES each column's values to fill 560 px
    (`FixedColumnHeight`), which breaks the shared value scale. There is no
    "distribute the slack into the gaps" spacing today.
  - `chart(..., { legend: false })` on the ribbon layer did not hide the
    37-entry legend; `render(..., { legend: false })` did (passed `as any`).

### B4. Alluvial over time

Skipped: the existing Ribbon Chart (`img/ribbon-chart-today.png`) already is
the alluvial case, and its fused `.layer(ribbon())` works there because its
inner tier (`species`) is constant along each path.

---

## Approach A: "the ribbon allocates its own ends", defined by rewrite into B

Hypothetical spelling:

```ts
layer([
  chart(nodes)
    .flow(
      spread({ by: "depth", dir: "x", spacing: 100 }),
      spread({ by: "name", dir: "y", spacing: 10 })
    )
    .mark(rect({ w: 12, h: "value" }).name("nodes")),
  chart(links)
    .flow(resolve(["source", "target"], { from: selectAll("nodes") })) // real signature: resolve(cols, { from, key? })
    .mark(
      ribbon({ from: "source", to: "target", size: "value", opacity: 0.5 })
    ),
]);
```

`approachA.ts` implements it as a rewrite: `rewriteToEnds(nodes, links)` turns
a nodes table (`name`, `depth`, optional `value`, in column order) and a links
table into the B ends table, adding one SLACK port per node side to pad the side
up to the node's `value`; `renderA` renders that with the B pipeline (slack
ports are drawn as node body and filtered out of the ribbon layer).

| Story                           | PNG                              |
| ------------------------------- | -------------------------------- |
| `Approach A/EnergySankey`       | `img/approach-a-energy.png`      |
| `Approach A/SankeyTree`         | `img/approach-a-sankey-tree.png` |
| `Approach A/SankeyTreeMismatch` | `img/approach-a-mismatch.png`    |

```ts
// Energy through A: the d3-sankey inputs plus a column and column order.
const eNodes = orderColumns(names, eLinks, depth).map((name) => ({
  name,
  depth: depth.get(name),
}));
renderA(container, eNodes, eLinks);

// Sankey tree through A: nodes = tree nodes with value = subtotal,
// links = parent -> child with value = child subtotal.
renderA(container, tNodes, tLinks, {
  nodeW: 40,
  colSpacing: 64,
  nodeSpacing: 6,
  w: 400,
  h: 500,
  opacity: 0.6,
});
```

- **Works:** yes for both (the energy picture is identical to B3, as it should
  be). The tree loses B2's nested spacing: the nodes table has one flat order
  per column, so siblings are not grouped closer than cousins.
- **What the rewrite needs that A's spelling does not say:**
  1. **Each node's column and order**, because the rewrite must lay out the
     ports where the nodes would be. In real A the node chart already places
     the nodes, so this is free; the rewrite has to be told.
  2. **The far end's position, to order the ends at a node edge.** The B
     rewrite only has it BEFORE layout (a column-rank proxy). Real A can sort
     after the nodes are placed, by the far end's actual y. This is A's one
     real advantage over B: exact end order with no user sort key.
  3. **One scale for node `h` and ribbon `size`.** In B this holds by
     construction (the ends ARE the node). In A, `size` is a data channel on a
     connector; it must use the y scale (σ) of the node's `h`, which a
     connector does not get today (`connect` lays its operands out with σ but
     owns no channel of its own).
  4. **A rule for node value vs. ribbon sizes.** `SankeyTreeMismatch` gives
     "Third" 1.5x its true total and "Crew/Male" half of it. Too large: the
     slack port shows as uncovered node body, which is reasonable (d3 does the
     same). Too small: the ribbons cannot fit, the node simply grows to the
     ribbon total and the declared value is ignored; the rewrite can only
     report it (`Crew/Male: value 431 < ribbon sizes (in 862, out 862)`,
     printed above the picture). Real A must pick: error, overflow, or grow.
  5. **Which side each end uses.** The rewrite assumes source = right face,
     target = left face (a left-to-right sankey). That is the same "part"
     question the chord raises.

---

## Chord diagram (hard case)

Data: Bostock's hair-color matrix (in the story). Ends rows: group i's arc is
split into one sub-arc per j with value `matrix[i][j]`; chord `{i, j}` groups
sub-arc (i, j) with sub-arc (j, i); a self chord has one end. Chord color is
its larger end (d3's rule), precomputed as `color`.

| Story                   | PNG                               | Result                                                |
| ----------------------- | --------------------------------- | ----------------------------------------------------- |
| `Chord/TodayDirX`       | `img/chord-today-dir-x.png`       | FAILS: ribbons hug the ring                           |
| `Chord/TodayDirY`       | `img/chord-today-dir-y.png`       | FAILS: ribbons hug the ring                           |
| `Chord/ProbeRingSpread` | `img/chord-ring-spread-fails.png` | polar `spread` with spacing does not close the circle |
| `Chord/Prototype`       | `img/chord-prototype.png`         | THROWAWAY prototype, the target picture               |

Today's best attempt (`TodayDirX`; `TodayDirY` is the same with `dir: "y"`,
`Curve.bezier()`; the arcs are drawn at 35% opacity so the ribbons under them
show):

```ts
const arcs = (spacing) =>
  chart(chordEnds)
    .flow(
      spread({
        by: field("group").sort(names),
        dir: "x",
        spacing,
        w: 2 * Math.PI,
        y: 160,
        h: 16,
        axes: false,
      }),
      stack({ by: field("subOrder").sort(), dir: "x", axes: false })
    )
    .mark(
      rect({
        w: "value",
        fill: "group",
        opacity: 0.35,
        stroke: "white",
        strokeWidth: 0.5,
      }).name("ends")
    );

layer({ coord: clock() }, [
  arcs(0.04),
  chart(selectAll("ends"))
    .flow(group({ by: "chord" }))
    .mark(ribbon({ opacity: 0.6, fill: "color", dir: "x" })),
]).render(container, { w: 420, h: 420 });
```

Prototype (target picture):

```ts
const total = matrix.flat().reduce((a, b) => a + b, 0);
const withGaps = [
  ...chordEnds.map((e) => ({ ...e, gap: false })),
  ...names.map((g) => ({
    group: g,
    sub: "gap",
    value: total * 0.012,
    chord: "gap-" + g,
    subOrder: 99,
    color: g,
    gap: true,
  })),
];
layer({ coord: clock() }, [
  chart(withGaps)
    .flow(
      stack({
        by: field("group").sort(names),
        dir: "x",
        y: 160,
        h: 16,
        axes: false,
      }),
      stack({ by: field("subOrder").sort(), dir: "x", axes: false })
    )
    .mark(
      rect({ w: "value", h: (d) => (d.gap ? 0 : 16), fill: "group" }).name(
        "ends"
      )
    ),
  chart(selectAll("ends"))
    .flow(
      filter((r) => project(r, "gap") === false),
      group({ by: "chord" })
    )
    .mark(chordRibbon({ fill: "color", opacity: 0.67 })), // THROWAWAY
]).render(container, { w: 420, h: 420 });
```

- **Works as-is:** no. With today's edge-mode ribbon each chord joins the
  facing edges of its two ends along `dir`. In polar, `dir: "x"` (theta) joins
  radial edges and the band runs around the ring; `dir: "y"` (r) joins an outer
  face to an inner face, which also stays on the ring. Neither passes through
  the interior.
- **Lines of spec:** about 25 (prototype), plus a 12-line ends table.
- **Workarounds:**
  - Gaps between groups (d3 `padAngle`) are invisible data rows inside the
    stack, hidden with `h: 0` through an accessor. A polar `spread` with
    `spacing` does not fill 2π: the ring stops around 225 degrees
    (`ProbeRingSpread`), while the same flow with `stack` closes. An `opacity`
    accessor did not hide the gap rows; an `h` accessor did.
  - The chord color is precomputed (`color` = the larger end).
- **The throwaway prototype** (`_proposalChordRibbon.ts`): a relational mark
  whose node lays out its operands like `connect`, keeps each end's inner face
  `[theta.min, theta.max, r.min]`, and at `lower` emits one path: the inner arc
  of end A (sampled in coordinate space, then warped), a quadratic curve to end
  B whose control point is the circle's center in SCREEN space, B's inner arc,
  and a quadratic back. Two hacks made it render, and both are core findings:
  1. Its node must have `type: "connect"`. The polar bake
     (`coordinateTransforms/bake.ts`, `RELATIONAL_TYPES = {"connect", "tween"}`)
     flattens through any other node with children, so a new relational node
     type is never lowered. The file's own TODO calls this a hack.
  2. Its mark must be registered as type `"ribbon"`, because group paint
     resolution (`resolveGroupPaint` reads `paintChannelsOf(type)`) only
     resolves `fill: "<field>"` for registered types; under its own name the
     fill stayed a raw field name and painted black.
- **What a real chord needs in core:**
  1. **Ends attach to a named part of the operand, not to "the facing edge
     along dir".** For a chord both ends use the `bottom` part, where a polar
     rect's `bottom` is its inner arc (r.min). This is the same vocabulary as
     the label proposal's rect parts `top / bottom / left / right`; in a
     sankey the parts are `right` (out) and `left` (in), which is today's
     edge mode as a special case.
  2. **A band curve with control points in screen space.** Today's ribbon
     curves are built in coordinate space and warped (`transformPath` with
     resample), which is right for bands along the ring and wrong for a chord,
     whose interior curve must be straight-ish in the plane and pass near the
     center. Either a curve option evaluated after the coordinate warp, or a
     chord curve in the Curve family that knows its control point is the
     space's origin.
  3. Each end is an interval, not a point: the band is "arc of A, curve, arc
     of B, curve". The arcs are along the part (warped like any edge), the
     joins are the screen-space curves.
  4. Relational node types must be leaves of the bake by a property of the
     node, not by a hard-coded type list.

---

## Findings

### 1. Can Approach B do parallel sets, sankey tree and many-to-many sankey with zero core changes?

Yes, all three, in the refs-bag form
`chart(selectAll("ports")).flow(group({ by: "<path or link>" })).mark(ribbon())`.
The fused `.layer(ribbon())` form does NOT work for parallel sets (and would
not for the sankeys): its split is "every non-path tier", and in an ends table
the node/category tier's key changes along a path. It works only when every
inner tier's key is the same at every step (the Ribbon Chart).

Spec size drops sharply: sankey tree 137 lines today vs about 35.

### 2. What is genuinely missing

- **A data helper for the unpivot.** Polars calls it `unpivot` (formerly
  `melt`), dplyr `pivot_longer`, pandas `melt`. Two shapes are needed:
  - wide-to-long over columns, for parallel sets: one row per (row, axis),
    keeping the row id (`path`) and the value (`unpivot(on: [...axes],
index: [...])`);
  - links-to-ends, for sankeys: one row per (link, side), source end and
    target end (an unpivot of `[source, target]` with `variable` renamed to
    `side`).
    `derive(...)` can express both today, since it is a function from rows to
    rows: `derive((rows) => rows.flatMap(...))`. A named helper is still worth it
    because the ROW ID (`path`/`link`) must be created and kept, which is the
    part users get wrong.
- **An end sort key.** The order of the ends inside a node must agree with
  the order of the nodes at the other end, per axis (parallel sets), per
  column (sankey). Users had to precompute it every time, and get it
  consistent with the node tier's sort; getting it wrong is the main source of
  ugly crossings. This is layout knowledge (where is the far node?), which is
  why Approach A can do it exactly and B can only approximate it.
- **Node order and depth for sankeys.** Columns (longest path, justify) and
  in-column order (relaxation / barycenter) are layout algorithms, not data
  prep. They are about 100 of the energy story's lines.
- **Fill-the-height spacing.** d3 columns fill the extent by growing gaps;
  `h:` on a spread rescales values instead.
- **Node box.** Ports are the node only when in and out agree; otherwise a
  real node box (enclose, or a rect behind) is needed. Not exercised hard here.
- **Chord:** part-based attachment (inner arc = polar `bottom`), a screen-space
  band curve, and bake/paint plumbing for new relational types (above).

### 3. What Approach A's rewrite needs

The node's column and order (free in real A), the far end's placed position
for end order (only exact after layout), one shared y scale for node `h` and
ribbon `size`, a rule for node value vs. ribbon-size mismatch (slack is easy,
overflow is not), and which part of the node each end attaches to. A is the
better user spelling for node-link-shaped data (nodes table + links table, the
d3 inputs as-is), and it is what makes the end order automatic. B is the
better mechanism: A is cleanly definable as "ribbon size allocates ports, then
B", so A needs no new layout of its own beyond the end sort.

### 4. Surprises

- The stack scale bug (`Scale Repro/StackInSpreadInSpread`): a data-sized
  `stack` under two `spread`s gets a per-column scale when column child counts
  differ. Silent and easy to miss, since ribbons still connect the edges.
- A y `spread` orders groups top-down; a y `stack` orders them bottom-up.
- `filter` on refs sees `ref.datum` as a bag; `r.datum.field` is undefined and
  the filter silently drops everything. `project(r, field)` works.
- Every grouping tier needs an explicit `field(...).sort()`; first-appearance
  order shuffled the energy columns.
- `chart(..., { legend: false })` on a non-root layer does nothing; the
  render option does.
- A polar `spread` with `spacing` does not span 2π; `stack` does.
- The energy sankey worked on the full 48-node data set with no subset.
