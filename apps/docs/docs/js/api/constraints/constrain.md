# constrain

`.constrain()` positions named children of a `Layer` relative to each other using declarative alignment and distribution rules. It is the low-level alternative to `Spread` when you need precise control over how individual elements relate — for example, aligning a label to the edge of a background, or distributing a set of elements with different spacings on different subsets.

## Usage

Name each child you want to position using `.name("key")`, then chain `.constrain()` on the `Layer`. The callback receives a destructured object of `ConstraintRef` handles — one per named child.

```ts
Layer([
  rect({ w: 200, h: 150, fill: "#e2ebf6" }).name("bg"),
  text({ text: "Title", fontSize: 18 }).name("label"),
])
  .constrain(({ bg, label }) => [
    Constraint.align({ x: "middle", y: "end" }, [label, bg]),
  ])
  .render(container, { w: 300, h: 200 });
```

::: starfish

```js
gf.Layer([
  gf.rect({ w: 200, h: 150, fill: gf.color.blue[1] }).name("bg"),
  gf.rect({ w: 60, h: 30, fill: gf.color.blue[4] }).name("label"),
  gf.rect({ w: 60, h: 30, fill: gf.color.red[4] }).name("badge"),
])
  .constrain(({ bg, label, badge }) => [
    gf.Constraint.align({ x: "end", y: "end" }, [label, bg]),
    gf.Constraint.align({ x: "start", y: "start" }, [badge, bg]),
  ])
  .render(root, { w: 300, h: 200 });
```

:::

## Constraint.align

Aligns a set of children to a shared edge or center on one or both axes. At least one of `x` or `y` must be specified.

```ts
Constraint.align({ x?, y? }, [ref1, ref2, ...])
```

| Option | Type                           | Default | Description                                                           |
| ------ | ------------------------------ | ------- | --------------------------------------------------------------------- |
| `x`    | `AlignAnchor \| AlignAnchor[]` | —       | Edge/center/origin to align on the x axis (omit to leave x untouched) |
| `y`    | `AlignAnchor \| AlignAnchor[]` | —       | Edge/center/origin to align on the y axis (omit to leave y untouched) |

`AlignAnchor` is `"start" \| "middle" \| "end" \| "baseline"`. The first three anchor a child by its bounding-box edge or center. `"baseline"` anchors a child by its **origin** (its local 0 point) instead of its box. With no placed sibling the fallback is the **axis origin**: the scale's zero (`posScale(0)`) on a scaled axis, the layer's origin on a pixel-pure one. On a pixel-pure axis, `align({ y: "baseline" })` thus means "stay where you were laid out" — regardless of how far its box overhangs the origin (a bar dipping below zero, axis labels hanging under a chart). For an unconditional origin pin regardless of axis, use `Constraint.position({ x: 0, y: 0, anchor: "baseline" })`. Pass a single value to share one anchor across every child (the common case); pass an array to assign one anchor _per child_ positionally — the array length must equal the number of children.

The first already-placed child in the list acts as the anchor on each specified axis (read at _that child's_ anchor). Unplaced children are moved to match it (placed at _their own_ anchor). If no child is placed yet, the fallback depends on the axis's underlying space: a scaled axis uses the scale origin `posScale(0)`, a pixel-pure axis uses the layer's own edge (`start` = 0, `middle` = midpoint, `end` = full extent, `baseline` = layer origin). When both `x` and `y` are given, x is resolved before y.

### Per-child anchors

```ts
// "A's center aligns with B's start" — useful for shared-edge layouts
// where two children overlap by a known fraction of their bbox.
Constraint.align({ x: ["middle", "start"] }, [A, B]);

// "B's end touches C's start" — adjacent placement.
Constraint.align({ x: ["end", "start"] }, [B, C]);
```

This is the per-child generalization of the single-anchor form. It expresses
"edges share" relations directly, instead of through a `distribute` with a
negative `spacing`.

::: starfish

```js
gf.Layer([
  gf.rect({ w: 80, h: 40, fill: gf.color.blue[3] }).name("a"),
  gf.rect({ w: 120, h: 40, fill: gf.color.red[3] }).name("b"),
  gf.rect({ w: 60, h: 40, fill: gf.color.green[3] }).name("c"),
])
  .constrain(({ a, b, c }) => [
    gf.Constraint.align({ x: "end" }, [a, b, c]),
    gf.Constraint.distribute({ dir: "y" }, [a, b, c]),
  ])
  .render(root, { w: 300, h: 200 });
```

:::

## Constraint.distribute

Stacks a set of children end-to-end along an axis, with optional spacing.

```ts
Constraint.distribute({ dir, spacing, mode, order }, [ref1, ref2, ...])
```

| Option    | Type                     | Default     | Description                                                                                            |
| --------- | ------------------------ | ----------- | ------------------------------------------------------------------------------------------------------ |
| `dir`     | `"x" \| "y"`             | —           | Axis to distribute along                                                                               |
| `spacing` | `number`                 | `8`         | Gap between each element (forced to `0` when `glue` is set)                                            |
| `mode`    | `"edge" \| "center"`     | `"edge"`    | Whether spacing is measured edge-to-edge or center-to-center                                           |
| `order`   | `"forward" \| "reverse"` | `"forward"` | Order to place elements                                                                                |
| `glue`    | `boolean`                | `false`     | Stack semantics: children touch, and their data-driven extents commit to one positional axis           |
| `weights` | `number[]`               | —           | Per-child budget weights (one per child, positional) — how fill children share the layer's slice space |

The first already-placed child acts as an anchor. Unplaced children after it are distributed forward (increasing position); unplaced children before it are distributed backward so they stack flush against the anchor's leading edge.

### Space resolution and auto-fit

`distribute` (and `align`) don't just position children after layout — they
participate in **underlying-space resolution**, exactly like the operators
built on them. A `distribute` over data-sized children composes their size
claims (sum + spacing) into the layer's claim on that axis; when the layer is
then given a size (an explicit `w`/`h`, or an allotted budget from its parent
or a coordinate transform), it solves for the scale factor that makes the
children fit, and proposes budget slices (equal, or per `weights`) to children
with no size claim of their own. With `glue: true` the composed extents commit
to an anchored positional axis instead — that's a stacked bar chart. In other
words: a constraint-assembled layer auto-fits the same way a `Spread`/`Stack`
does.

::: starfish

```js
gf.Layer([
  gf.rect({ w: 80, h: 40, fill: gf.color.blue[3] }).name("a"),
  gf.rect({ w: 80, h: 60, fill: gf.color.red[3] }).name("b"),
  gf.rect({ w: 80, h: 30, fill: gf.color.green[3] }).name("c"),
])
  .constrain(({ a, b, c }) => [
    gf.Constraint.align({ x: "start" }, [a, b, c]),
    gf.Constraint.distribute({ dir: "y", spacing: 8 }, [a, b, c]),
  ])
  .render(root, { w: 300, h: 200 });
```

:::

## Constraint.position

Places a child at an `x` and/or `y` coordinate — the data-driven counterpart to
`align`/`distribute`, which only relate children to each other. It mirrors how
you position a shape: each coordinate is either a **literal** pixel value or a
**`datum`** (`datum(n)`). A literal is placed as-is; a datum is mapped through a
scale the `Layer` infers from the datum coordinates of its `position`
constraints (their union is the layer's domain on that axis, mapped onto the
layer's pixel size). This is how a hand-drawn continuous axis places each tick
at its value rather than assuming uniform spacing.

```ts
Constraint.position({ x?, y?, anchor? }, [ref]);
```

| Option   | Type              | Default    | Description                                         |
| -------- | ----------------- | ---------- | --------------------------------------------------- |
| `x`      | `number \| Value` | —          | x coordinate — literal pixel or `datum(n)` (scaled) |
| `y`      | `number \| Value` | —          | y coordinate — literal pixel or `datum(n)` (scaled) |
| `anchor` | `Alignment`       | `"middle"` | Which anchor of the ref lands on the coordinate     |

At least one of `x` / `y` is required. Only `datum` coordinates feed the layer's
inferred scale; literal pixels are placed directly and don't define the domain.

A datum coordinate can carry a **pixel offset** applied after the scale
mapping — "this data position, plus pixels":

```ts
// Seat a line 6px outside the y = 0 grid position, wherever 0 lands.
Constraint.position({ y: datum(0).offset(-6), anchor: "end" }, [line]);
```

The offset shifts the resolved position without affecting the inferred domain
(`datum(0).offset(-6)` still contributes `0` to the scale). It works anywhere a
`Value` is accepted — shape coordinates too, not just constraints. In Python
the same thing is written with plain arithmetic: `datum(0) - 6`.

```ts
// A continuous y-axis: each tick centered at its data value. Passing `datum(v)`
// maps it through the y-scale the Layer derives from these constraints (domain
// [0, 300] → plot height). A bare number would be a raw pixel instead.
Layer([
  rect({ w: 1, h: 300 }).name("axis"),
  ...tickValues.map((v, i) => tick(v).name(`t${i}`)),
]).constrain((g) => [
  Constraint.align({ y: "start" }, [g.axis]),
  ...tickValues.map((v, i) =>
    Constraint.position({ y: datum(v) }, [g[`t${i}`]])
  ),
]);
```

## Constraint.zAbove / Constraint.zBelow

Declare a partial-order relation between two named children for **paint order**
(z-order) only. They do not affect position.

```ts
Constraint.zAbove(a, b); // a paints in front of b (on top in z)
Constraint.zBelow(a, b); // a paints behind b (under in z)
```

`zBelow(a, b)` is equivalent to `zAbove(b, a)`; both are provided so the spec
reads naturally either way.

When a `Layer` carries any z-order constraint, the render flattens the
(non-component) subtree into a single paint list and **topologically sorts**
it. Within the order constraints don't pin, the existing default order is
preserved (`.zOrder(n)` hints first, then declaration order). A cycle
(`zAbove(a, b) + zAbove(b, a)`) throws an error at render time.

```ts
Layer([
  rect({ w: 80, h: 40, fill: "lightgray" }).name("bg"),
  rect({ w: 60, h: 60, fill: "steelblue" }).name("box"),
  text({ text: "label", fontSize: 14 }).name("label"),
]).constrain(({ bg, box, label }) => [
  // box paints over bg; label paints over both.
  Constraint.zAbove(box, bg),
  Constraint.zAbove(label, box),
]);
```

### Cross-tier references

Z-order refs can reach into the layer's _direct_ children and into any
**plain (non-component) nested `Layer`** below — the same descent rule
`ref()` uses inside `createMark` composites. This makes patterns like
"rope on the outer layer slots in z between two pulleys in the inner layer"
expressible without restructuring the AST.

```ts
Layer([
  Layer([
    PulleyCircle({ r: 25 }).name(A),
    PulleyCircle({ r: 25 }).name(B),
  ]).constrain(/* … */),
  Connect({ ... }, [ref(A), ref(B)]).name("rope"),
]).constrain((c) => [
  Constraint.zAbove(c.rope, c.A),  // rope paints over A …
  Constraint.zBelow(c.rope, c.B),  // … but is covered by B
]);
```

### When to use this vs `.zOrder(n)`

- Use `.zOrder(n)` when you want a _global tier_ (e.g. "all ropes go behind
  all wheels").
- Use `Constraint.zAbove` / `zBelow` when you want a _relational_ exception
  (e.g. "this specific rope sits between these two specific wheels").

The two compose: `.zOrder(n)` sets the default order; z-order constraints
override it for the pairs they name.

## Spread equivalences

Constraints are the primitive `Spread` and `Stack` are built on — literally:
the operators delegate their space resolution, budget slicing, and placement
walks to the same machinery the constraint path uses. These pairs are
equivalent, **including** scale solving and auto-fit, not just placement:

| Spread                                                       | Constraint equivalent                                           |
| ------------------------------------------------------------ | --------------------------------------------------------------- |
| `Spread({ dir: "y", alignment: "start" }, items)`            | `align({ x: "start" })` + `distribute({ dir: "y" })`            |
| `Spread({ dir: "x", alignment: "end", spacing: 10 }, items)` | `align({ y: "end" })` + `distribute({ dir: "x", spacing: 10 })` |
| `Spread({ dir: "x", spacing: 60, mode: "center" }, items)`   | `distribute({ dir: "x", spacing: 60, mode: "center" })`         |
| `Spread({ dir: "y", reverse: true }, items)`                 | `distribute({ dir: "y", order: "reverse" })`                    |
| `Stack({ dir: "y" }, items)`                                 | `distribute({ dir: "y", glue: true })`                          |
| `Spread({ dir: "x", stackWeights: [2, 1] }, items)`          | `distribute({ dir: "x", weights: [2, 1] })`                     |

When **no child is pre-placed**, the cross-axis alignment fallback depends on
the **axis**, not the API — `Spread` and the `align` constraint resolve the
same fallback, so the pairs above are exact. A scaled (POSITION) axis falls
back to the scale origin `posScale(0)` (so SIZE-derived bars hang from the zero
line); a pixel-pure axis falls back to the layer-box edge (`start` → 0,
`middle` → midpoint, `end` → full extent).

## Partial placement

Constraints only apply to the axes you specify. Unmentioned axes fall back to 0. This lets you mix manually-positioned children with constraint-placed ones:

```ts
Layer([
  rect({ w: 80, h: 40, y: 20 }).name("a"), // y manually set
  rect({ w: 120, h: 40 }).name("b"),
  rect({ w: 60, h: 40 }).name("c"),
]).constrain(({ a, b, c }) => [
  // Only constrain x — each element keeps its own y
  Constraint.align({ x: "end" }, [a, b, c]),
]);
```

## Subset selection

A single `Layer` can have multiple constraints that each target different subsets of children:

```ts
Layer([
  rect({ w: 100, h: 50 }).name("a"),
  rect({ w: 80, h: 50 }).name("b"),
  rect({ w: 120, h: 50 }).name("c"),
  rect({ w: 60, h: 50 }).name("d"),
]).constrain(({ a, b, c, d }) => [
  Constraint.align({ x: "end" }, [a, b, c, d]),
  Constraint.distribute({ dir: "y", spacing: 5 }, [a, b]), // tight grouping
  Constraint.distribute({ dir: "y", spacing: 30 }, [c, d]), // loose grouping
]);
```
