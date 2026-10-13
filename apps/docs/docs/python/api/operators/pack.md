---
title: pack
order: 65
---

# pack

Places its children so that their enclosing circles touch and do not overlap.
This is circle packing. With a `by`, `pack` makes one child per group. Without a
`by`, it makes one child per row, from the one-row group `[row]` (see
[spread](./spread#without-by)). Two `pack` operators in a row give a nested
packing.

```python
from gofish import chart, circle, pack

chart(seafood).flow(
    pack(by="lake"),
    pack(),
).mark(circle(r=12, fill="species")).render(w=420, h=420)
```

## Signature

```python
pack(*, by=None, **options) -> Operator
pack(children, **options) -> Mark
```

## Combinator form

Given a list of marks, `pack` packs those marks instead of rows of data. It
returns a mark, so a `pack` can hold another `pack`. It takes no `by`.

```python
from gofish import circle, ellipse, pack

pack([
    circle(r=60),
    ellipse(w=90, h=44),
    pack([circle(r=26), circle(r=18), circle(r=14)]),
]).render(w=420, h=420)
```

## Parameters

::: gofish-ref pack
:::

## Packing

`pack` packs each child's enclosing circle with d3's front-chain algorithm
(`packSiblings`). It has no option to choose another way to pack, because there
is no other way yet.

Each child is packed by its enclosing circle, which depends on its shape.

- A circle is its own enclosing circle.
- An ellipse uses the circle of its larger radius.
- A polygon uses the smallest circle through its vertices.
- A rect or text uses the circle through the corners of its box.
- A nested `pack` uses the smallest circle around its own children.

## Limits

- Children keep the pixel size they are laid out at. The pack does not scale
  itself to fit the space it is given, and it cannot yet size a child from data.
  So give each child a size in pixels, e.g., `circle(r=12)`, not
  `circle(r="count")`. See
  [#967](https://github.com/gofish-graphics/gofish-graphics/issues/967).
- There is no padding between circles yet.
