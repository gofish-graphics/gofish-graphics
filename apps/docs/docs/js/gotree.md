# GoTree

`gofish-gotree` is a declarative grammar for tree visualizations, embedded inside
GoFish. It ships as a separate workspace package — install and import it alongside
`gofish-graphics`:

```ts
import { tree, spread, nest } from "gofish-gotree";
import { gofish, circle } from "gofish-graphics";
```

A single function — `tree(spec, data)` — produces a tree visualization. Varying the
spec yields node-link diagrams, dendrograms, nested-box trees, and (with later
milestones) icicle plots, sunbursts, and treemap slices. The grammar follows the
structure of [GoTree (Li et al., CHI 2020)](https://dl.acm.org/doi/10.1145/3313831.3376297)
but renames concepts to match GoFish conventions and switches to callable helpers
instead of JSON descriptors.

## Quick example — node-link tree

```ts
import { tree, spread } from "gofish-gotree";
import { circle } from "gofish-graphics";

const data = {
  name: "root",
  children: [
    { name: "A", children: [{ name: "A1" }, { name: "A2" }] },
    { name: "B", children: [{ name: "B1" }, { name: "B2" }, { name: "B3" }] },
    { name: "C" },
  ],
};

const chart = tree(
  {
    node: (d) => circle({ r: 10, fill: "steelblue" }),
    link: { curve: "straight", stroke: "#888" },
    parentChild: spread({ dir: "y", spacing: 48, alignment: "middle" }),
    sibling: spread({ dir: "x", spacing: 24, alignment: "start" }),
  },
  data
);

chart.render(container, { w: 600, h: 400 });
```

## Quick example — nested-boxes tree

Same data, different `parentChild` combiner — produces a Russian-doll of nested
rectangles where each parent box wraps its children.

```ts
import { tree, spread, nest } from "gofish-gotree";
import { Layer, Constraint, rect, text } from "gofish-graphics";

const labeledNode = (d) =>
  Layer({ w: 96, h: 22 }, [
    rect({ w: 96, h: 22, rx: 4, fill: "#e3edf7" }).name("box"),
    text({ text: d.data.name, fontSize: 11 }).name("label"),
  ]).constrain(({ box, label }) => [
    Constraint.align({ x: "middle", y: "middle" }, [box, label]),
  ]);

tree(
  {
    node: labeledNode,
    link: "none",
    parentChild: nest({ x: 10, y: 10 }),
    sibling: spread({ dir: "y", spacing: 8, alignment: "middle" }),
  },
  data
).render(container, { w: 720, h: 560 });
```

## The spec

```ts
type GoTreeSpec = {
  node?: (d: HierarchyDatum) => Mark;
  link?: "none" | LinkOptions | ((s, t) => LinkOptions);
  parentChild?: CombinerSpec;
  sibling?: CombinerSpec;
  mode?: "topDown" | "bottomUp";
  sortBy?: (d: HierarchyDatum) => number;
  coord?: CoordTransform;
};

/** A function that takes children and returns a composed GoFish AST. */
type Combiner = (children: any[]) => any;
/** A plain combiner, or a depth-indexed one (see `alternate` / `perDepth`). */
type CombinerSpec = Combiner | { atDepth: (depth: number) => Combiner };
```

The spec slots take **callable values** — you write `spread(...)` or `nest(...)`
directly, the way you write `circle(...)` for `node`. The package exports two
ergonomic helpers (`spread` and `nest`); you can also pass any function with the
combiner shape.

### `node` — the node-mark factory

`node` is a function that returns a GoFish mark for one tree node. It is called once
per hierarchy node with a `HierarchyDatum` (`data`, `depth`, `height`, `value`,
`width`). All node styling — fill, stroke, size, labels — lives in this factory.

```ts
node: (d) => circle({ r: 4 + d.height * 2, fill: colorByDepth(d.depth) });
```

### `link` — the edge encoding

- `"none"` — omit all edges (useful for nested-box / icicle / treemap variants).
- An options object `{ curve, stroke, strokeWidth, opacity }` — applied
  uniformly.
- A function `(source, target) => LinkOptions` — per-edge styling.

```ts
link: { curve: "straight", stroke: "#90a4ae", strokeWidth: 1.5 }
```

`curve` accepts `"straight"` (default), `"bezier"`, `"orthogonal"` (right-angle
elbows), and `"arc"`. The `orthogonal` and `bezier` links fold along the tree's
growth axis — the direction its `parentChild` combiner distributes — so a
vertical tree's elbows bend downward and a horizontal tree's bend sideways. When
the growth axis is ambiguous (a cascade that distributes on both axes), the
orthogonal elbow infers its bend from each edge's geometry.

### `parentChild` and `sibling` — the layout combiners

These slots take a `Combiner = (children: any[]) => any`. `tree()` calls
`parentChild([parentMark, childGroup])` to assemble a single subtree, and
`sibling(kidsArray)` to combine all rendered children of one node into a group.

Two helpers cover the common cases:

#### `spread({ dir, spacing?, alignment? })`

Returns a combiner that distributes the children along an axis. Used as
`parentChild`, the helper places parent and children-group adjacent along `dir`
(with the y-up swap, parent ends at high y / top of screen for `dir: "y"`). Used as
`sibling`, it spreads N children along `dir`.

```ts
parentChild: spread({ dir: "y", spacing: 48, alignment: "middle" }),
sibling: spread({ dir: "x", spacing: 24, alignment: "start" }),
```

#### `nest({ x?, y? })`

Returns a combiner that wraps `[outer, inner]` in a Layer with
`Constraint.nest({x?, y?}, [outer, inner])`. The outer is sized to inner's
intrinsic dims plus `2 * padding` symmetrically per constrained axis; inner is
centered inside outer. Missing axis (e.g. `{x: 8}` only) leaves the other axis
unconstrained.

```ts
parentChild: nest({ x: 10, y: 10 }),   // box-in-box
```

Internally, `nest` injects two reserved names (`__nest-outer` /
`__nest-inner`) on the children it wraps — it does not consult or modify any
name a user has placed on the node mark.

#### `combine({ x?, y? })` — the per-axis primitive

`spread` / `distribute` / `nest` are shorthands for common shapes. `combine` is
the general form: it picks one constraint **per axis** independently, which is
exactly GoTree's `Layout(x, y)` model. Each axis takes `"align"`,
`"distribute"`, or `"nest"` (string shorthand) or the object form with knobs:

```ts
parentChild: combine({
  x: "nest",                                  // outer grows to wrap inner on x
  y: { kind: "distribute", spacing: 40 },     // parent/group stacked on y
}),
sibling: combine({ x: "distribute", y: "align" }),
```

- `align` → `Constraint.align` (overlap on that axis; `{ kind, alignment }`).
- `distribute` → `Constraint.distribute` (lay out along that axis;
  `{ kind, spacing, order, mode }`).
- `nest` → `Constraint.nest` (outer wraps inner on that axis; `{ kind, pad }`).
  Only valid on the 2-child parent ↔ subtree-group relationship — siblings may
  only `align` or `distribute`.

The whole gotree layout space is the product of these choices: `{align,
distribute, nest}²` for `parentChild` × `{align, distribute}²` for `sibling`.
The **GoTree → Constraint Matrix** story enumerates all 36; node-link, indented,
icicle, and nested-box trees are each one point in it.

#### `alternate([...])` / `perDepth(fn)` — depth-varying layout

Some layouts change their template by **depth**: an H-tree swaps the spread axis
every level, and a slice-and-dice treemap alternates slicing vertically vs.
horizontally. A single combiner can't express that, so a `parentChild`/`sibling`
slot also accepts a **depth-indexed** combiner:

- `alternate([a, b, …])` — cycles the combiners by `depth % length`.
- `perDepth(depth => combiner)` — the general form.

`tree()` resolves it at each node's depth, so a level's `parentChild` and its
children's `sibling` grouping stay in sync.

```ts
// Slice-and-dice treemap: parent always wraps its subtree (nest×nest),
// while siblings alternate dicing (side-by-side) and slicing (stacked).
const dice = combine({ x: "distribute", y: "align" });
const slice = combine({ x: "align", y: "distribute" });

tree(
  {
    node: (d) =>
      rect({
        /* leaf sized by d.data.value */
      }),
    parentChild: combine({ x: "nest", y: "nest" }),
    sibling: alternate([dice, slice]),
  },
  data
);
```

```ts
// H-tree: parent centered, children spread on the alternating axis.
const H = combine({ x: "distribute", y: "align" });
const V = combine({ x: "align", y: "distribute" });
tree(
  {
    node,
    parentChild: combine({ x: "align", y: "align" }),
    sibling: alternate([H, V]),
  },
  data
);
```

A plain combiner is still accepted everywhere a depth-indexed one is — depth
selection is opt-in.

#### Custom combiners

Any function with shape `(children: any[]) => any` works. For example, a sibling
combiner that adds a small label below each spread group:

```ts
import { Layer, StackY } from "gofish-graphics";

sibling: (kids) => StackY({ spacing: 8 }, [
  spread({ dir: "x", spacing: 16 })(kids),
  text({ text: `${kids.length} items` }),
]),
```

### `mode` — sizing direction

- `"topDown"` (default) — parent's encoded size partitions among children
  (treemap-style).
- `"bottomUp"` — children's sizes sum into the parent (dendrogram-style).

In the current implementation, `mode` is a documentation hint only — the visual
orientation is handled by the y-up swap inside `spread`, and data-driven sizing is
performed in the user's `node` factory via the existing `value()` channel.

### `coord` — coordinate transform

Pass any GoFish `CoordTransform` (e.g. `polar()` for a radial layout). Defaults to
linear cartesian.

```ts
coord: polar(); // radial node-link
```

**Polar authoring rule**: under `coord: polar()`, nodes render as _points_
in the transform — only their center sweeps through, their bbox does not.
Set `mode: "center"` on the sibling spread (and typically the parentChild
spread too). Center-mode `spread` lays out child centers `spacing` apart
and ignores bbox widths, matching the geometry polar expects. With
`mode: "edge"` (the default), shape bboxes accumulate into the cartesian-x
span and overflow polar's `[0, 2π]` theta domain — making the tree spiral.

```ts
parentChild: spread({ dir: "y", spacing: 40,         mode: "center" }), // r units
sibling:     spread({ dir: "x", spacing: Math.PI/3,  mode: "center" }), // radians
coord:       polar(),
```

Sibling `spacing` is in **radians** (~`π / N` for N siblings per level);
`parentChild` `spacing` is in **radius units**.

This is the right pattern for point-like nodes (circle, small mark used as a
node). When the _shape itself_ needs to sweep through the transform —
filled wedges, ribbons, polar bars — reach for `Value`-typed dims +
`sharedScale: true` instead (the pattern in `polarBar` / `polarRibbon`).

### The 2π budget — content must fit polar's theta domain

Under `coord: polar()`, the inner cartesian content's total x-extent must
be ≤ 2π radians. Overflows wrap around the disc (theta = 2π + ε is rendered
at theta = ε), producing self-intersecting wedges and slivers protruding
past the disc edge.

The library does not yet auto-fit content to 2π — the spread operator's
`sharedScale` / Monotonic-inversion path does fit, but `Constraint.distribute`
and `Constraint.nest` (which the `distribute` and `nest` helpers
build on) don't yet participate in that path. So sizes are hand-budgeted.

For a balanced N-ary tree of depth D under polar, the content width is:

```
contentWidth = (number of leaves) · leafW
             + (sum of sibling gaps at every level) · sibSpacing
             + 2 · (number of nest levels) · xPad
```

Worked example — the `NestedPietree` story uses a balanced 2×2 tree
(4 leaves, 2 nest levels):

```ts
const LEAF_W = Math.PI / 2 - 0.27; // ≈ 1.30 rad
const SIB = 0.08;
const X_PAD = 0.13;

// Budget: 4·LEAF_W + 4·SIB + 6·X_PAD
//       = 4 · 1.30 + 4 · 0.08 + 6 · 0.13
//       = 6.30  ≈ 2π  ✓
```

(The `4·SIB` is the 3 leaf-row gaps plus the 1 inter-subtree gap; the
`6·X_PAD` is 2 nest levels × 2 sides per level = 4 inner nest edges
plus the root nest's 2 outer edges.)

If you change the tree's depth or arity, recompute. Unbalanced trees need
to sum gaps level-by-level. Stay a hair under 2π (~0.02 rad slack) so
floating-point doesn't tip you over.

## Translation from the GoTree paper

The grammar's structure is preserved from the paper; names align with GoFish
conventions and switch from JSON descriptors to callable helpers.

| Paper                             | GoTree-in-GoFish                                   |
| --------------------------------- | -------------------------------------------------- |
| `Element.Node: "rectangle"`       | `node: (d) => rect({...})`                         |
| `Element.Link: "straight"`        | `link: { curve: "straight" }`                      |
| `Element.Color: "depth"`          | inside `node`: `fill: byDepth(d.depth)`            |
| `Element.Width/Height`            | inside `node`: `w` / `h` on the mark               |
| `Element.LinkWidth`               | `link.strokeWidth`                                 |
| `Element.Label`                   | inside `node`: include a `text` mark               |
| `Layout.Mode`                     | `mode`                                             |
| `Layout.X.Root: juxtapose`        | `parentChild: spread({ dir: "x" })`                |
| `Layout.X.Subtree: flatten`       | `sibling: spread({ dir: "x" })`                    |
| `Layout.X.Root: include`/`within` | `parentChild: nest({ x: padding })`                |
| `Padding` / `Margin`              | `spacing` (on spread), `x` / `y` padding (on nest) |
| `Alignment: top / left`           | `alignment: "start"`                               |
| `Alignment: center`               | `alignment: "middle"`                              |
| `Alignment: bottom / right`       | `alignment: "end"`                                 |
| `SortingCriteria`                 | `sortBy: (d) => ...`                               |
| `SubtreeWidth`/`Height`           | inside `node`: `value(d.value, "key")`             |
| `CoordinateSystem.Category`       | `coord: linear()` or `coord: polar()`              |

## Milestone status

All milestones below have shipped:

- **M1** — node-link with `spread` combiner; linear links.
- **M2** — `Constraint.nest` primitive in `gofish-graphics`; `nest` combiner in
  `gofish-gotree`; nested-box trees.
- **M3** — polar coord wrap; sunburst and radial node-link.
- **M4** — `orthogonal`/`bezier`/`arc` links; sort.
- **M5** — `bottomUp` mode for dendrograms via intrinsic-dim wiring.
