---
order: 100
---

# Region compositing

Five operators combine the _regions_ (silhouettes) of two children, named
after [Figma's boolean operations](https://help.figma.com/hc/en-us/articles/360039957534-Boolean-operations)
(see issues [#196](https://github.com/joshpoll/gofish/issues/196) /
[#202](https://github.com/joshpoll/gofish/issues/202)). They are the public
primitives the `cut` mark composes from.

Each takes **exactly two children** `[A, B]` — the binary SVG-filter
implementations do not generalize to three or more, so passing any other
number of children throws. The n-ary forms in the table below describe the
_intended_ eventual semantics; today only the binary case is implemented.

| Operator    | Region algebra               | Notes                                                                         |
| ----------- | ---------------------------- | ----------------------------------------------------------------------------- |
| `intersect` | `A ∩ B`                      | Draw only where both regions overlap.                                         |
| `exclude`   | `A ^ B` (odd-overlap parity) | Draw the symmetric difference.                                                |
| `subtract`  | `A − B`                      | Draw A with B's region removed.                                               |
| `paint`     | `A ∪ (B ∩ A)`                | A is a base **surface**; B is painted onto it, clipped to A. Sized to A.      |
| `mask`      | `B ∩ A`, A **not** drawn     | A is a **clip region**; B is painted inside it without drawing A. Sized to A. |

`paint` and `mask` both clip to A but differ in intent: `paint` keeps A as a
visible surface, while `mask` uses A only as a stencil and never draws it.

Union (`A ∪ B`) is intentionally **not** exported — it is conceptually
[`layer`](/js/api/operators/layer) (#196). Use `layer` to overlay regions.

::: gofish

```js
gf.paint([
  gf.rect({ x: 0, y: 0, w: 120, h: 120, fill: gf.color.blue[3] }),
  gf.rect({ x: 40, y: 40, w: 120, h: 120, fill: gf.color.red[3] }),
]).render(root, { w: 160, h: 160 });
```

:::

Here A is the blue square (the surface) and B is the red square; B is only
drawn where it overlaps A, so the result is clipped to the blue square's
bounds.

## Region and paint

The operands give the region. Without `fill` or `stroke`, `intersect` draws
the operands' own paint where they overlap. With either, it draws the overlap
as one shape in its own paint, and the operands' paint is not drawn.

::: gofish

```js
gf.intersect({ fill: "#D1E4F6", stroke: "#467DA8", strokeWidth: 2 }, [
  gf.circle({ cx: 90, cy: 90, r: 70 }),
  gf.rect({ x: 80, y: 30, w: 120, h: 120 }),
]).render(root, { w: 220, h: 180 });
```

:::

A painted `intersect` draws one exact path when both operands trace their
outlines (a `rect` with square corners, a `circle`, an `ellipse`, a `ribbon`,
a `region`) and at least one of them is convex. Curves are flattened. When an
operand has no exact outline (an `image`, a `text`, a rounded `rect`), a fill
is drawn through a mask of the two operands' ink, and a `stroke` throws:

```
intersect: a stroke needs the exact outline of the result, and these operands
give none. ...
```

Two operands that are both not convex also throw on a stroke
([#1201](https://github.com/joshpoll/gofish/issues/1201)). The stroke is
never quietly dropped or drawn around a box. Only `intersect`
takes paint today; `exclude` and `subtract` can leave holes or several pieces.

A [croissant chart](/js/examples/croissant) paints the intersection of a
density curve with each cell of a partition, drawn in by
[`region({ inset })`](/js/api/marks/region).

## Signatures

```ts
intersect(options?, [A, B]);
exclude(options?, [A, B]);
subtract(options?, [A, B]);
paint(options?, [A, B]);
mask([A, B]);
```

Each child may be a mark or an already-built node, such as a `ref(...)`.
Marks are resolved against the incoming data.

## Parameters

::: gofish-ref intersect exclude subtract paint mask
:::

## Arity

All five operators require **exactly two children** and throw
`"Porter-Duff relation operators currently expect exactly two children"`
otherwise. The n-ary forms (`A ∩ B ∩ ...`, `A − B − C − ...`, etc.) are not
yet implemented.
