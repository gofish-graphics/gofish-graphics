---
order: 100
---

# Region compositing

Five operators combine the _regions_ (silhouettes) of their children. Four are
named after [Figma's boolean operations](https://help.figma.com/hc/en-us/articles/360039957534-Boolean-operations);
the fifth, `atop`, is the Porter-Duff operator of that name. The
[`cut`](/js/api/operators/cut) mark composes from `intersect`.

| Operator    | Region                          | Children  | Sized to         |
| ----------- | ------------------------------- | --------- | ---------------- |
| `union`     | `A ∪ B ∪ ...`                   | 2 or more | all the children |
| `intersect` | `A ∩ B ∩ ...`                   | 2 or more | their overlap    |
| `subtract`  | `A − B − ...`                   | 2 or more | A                |
| `exclude`   | `(A − B) ∪ (B − A)`             | exactly 2 | both children    |
| `atop`      | `A`, with `B ∩ A` drawn over it | 2 or more | A                |

An operator reads its children and draws its result. It never draws a child as
the child itself.

::: gofish

```js
gf.atop([
  gf.rect({ x: 0, y: 0, w: 120, h: 120, fill: gf.color.blue[3] }),
  gf.rect({ x: 40, y: 40, w: 120, h: 120, fill: gf.color.red[3] }),
]).render(root, { w: 160, h: 160 });
```

:::

Here A is the blue square and B is the red square. B is drawn only where it
overlaps A, and the result is sized to A.

## Region and paint

A child's region is its alpha as drawn: its fill, its stroke and its opacity.
A child with [`.hidden()`](/js/api/core/mark#hidden) gives its region and draws
no paint.

Without `fill` or `stroke`, the operator draws the children's own paint where
it keeps them. Where two kept children overlap, `union`, `intersect` and
`atop` draw the later child over the earlier one with `blendMode`.

With `fill` or `stroke`, the result is one new shape in that paint, and the
children give their regions only. `atop` takes no `fill`.

::: gofish

```js
gf.intersect({ fill: "#D1E4F6", stroke: "#467DA8", strokeWidth: 2 }, [
  gf.circle({ cx: 90, cy: 90, r: 70 }),
  gf.rect({ x: 80, y: 30, w: 120, h: 120 }),
]).render(root, { w: 220, h: 180 });
```

:::

A painted `intersect` of two children draws one exact path when both trace
their outlines in opaque paint (a `rect` with square corners, a `circle`, an
`ellipse`, a `ribbon`, a `region`) and at least one of them is convex. Curves
are flattened. Otherwise a fill is drawn over the overlap of the children's
regions, and a `stroke` throws:

```
intersect: a stroke needs the exact outline of the result, and these operands
give none. ...
```

`union`, `subtract` and `exclude` have no exact outline yet, so a `stroke` on
them throws too ([#1201](https://github.com/joshpoll/gofish/issues/1201)).
The stroke is never quietly dropped or drawn around a box.

A [croissant chart](/js/examples/croissant) paints the intersection of a
density curve with each cell of a partition, drawn in by
[`region({ inset })`](/js/api/marks/region).

## Masks

A hidden child clips the others to its region. A
[`Filter.luminanceToAlpha()`](/js/api/filter) child gives its
luminance as its region, so a hidden one is a luminance mask.

::: gofish

```js
gf.intersect([
  gf.ellipse({ cx: 80, cy: 60, w: 160, h: 120, fill: "white" }).hidden(),
  gf.rect({ x: 0, y: 0, w: 160, h: 120, fill: gf.color.blue[3] }),
]).render(root, { w: 160, h: 120 });
```

:::

## Signatures

```ts
union(options?, [A, B, ...]);
intersect(options?, [A, B, ...]);
subtract(options?, [A, B, ...]);
exclude(options?, [A, B]);
atop(options?, [A, B, ...]);
```

Each child may be a mark or an already-built node, such as a `ref(...)`.
Marks are resolved against the incoming data.

## Parameters

::: gofish-ref union intersect subtract exclude atop
:::

## Arity

`exclude` throws unless it has exactly two children. The other four throw
with fewer than two.
