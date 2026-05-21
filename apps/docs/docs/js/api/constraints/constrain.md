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

| Option | Type                           | Default | Description                                                    |
| ------ | ------------------------------ | ------- | -------------------------------------------------------------- |
| `x`    | `"start" \| "middle" \| "end"` | —       | Edge/center to align on the x axis (omit to leave x untouched) |
| `y`    | `"start" \| "middle" \| "end"` | —       | Edge/center to align on the y axis (omit to leave y untouched) |

The first already-placed child in the list acts as the anchor on each specified axis. Unplaced children are moved to match it. If no child is placed yet, the layer's own edge is used as the baseline (`start` = 0, `middle` = midpoint, `end` = full extent). When both `x` and `y` are given, x is resolved before y.

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

| Option    | Type                     | Default     | Description                                                  |
| --------- | ------------------------ | ----------- | ------------------------------------------------------------ |
| `dir`     | `"x" \| "y"`             | —           | Axis to distribute along                                     |
| `spacing` | `number`                 | `8`         | Gap between each element                                     |
| `mode`    | `"edge" \| "center"`     | `"edge"`    | Whether spacing is measured edge-to-edge or center-to-center |
| `order`   | `"forward" \| "reverse"` | `"forward"` | Order to place elements                                      |

The first already-placed child acts as an anchor. Unplaced children after it are distributed forward (increasing position); unplaced children before it are distributed backward so they stack flush against the anchor's leading edge.

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

## Spread equivalences

Constraints are a lower-level primitive that `Spread` is built on. These pairs are equivalent:

| Spread                                                       | Constraint equivalent                                           |
| ------------------------------------------------------------ | --------------------------------------------------------------- |
| `Spread({ dir: "y", alignment: "start" }, items)`            | `align({ x: "start" })` + `distribute({ dir: "y" })`            |
| `Spread({ dir: "x", alignment: "end", spacing: 10 }, items)` | `align({ y: "end" })` + `distribute({ dir: "x", spacing: 10 })` |
| `Spread({ dir: "x", spacing: 60, mode: "center" }, items)`   | `distribute({ dir: "x", spacing: 60, mode: "center" })`         |
| `Spread({ dir: "y", reverse: true }, items)`                 | `distribute({ dir: "y", order: "reverse" })`                    |

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
