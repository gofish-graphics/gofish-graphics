---
title: treemap
order: 60
---

# treemap

Lays out children into a treemap: a 2D tiling of rectangles whose **areas are proportional to a weight**.

:::: gofish

```js
const items = [
  { name: "Action", value: 120 },
  { name: "Comedy", value: 80 },
  { name: "Drama", value: 160 },
  { name: "Sci-Fi", value: 60 },
  { name: "Horror", value: 40 },
];

// Each child gets its own rectangle; treemap assigns its (x,y,w,h).
// `size` is an explicit per-child weight array (one value per child, in
// child order) that drives each leaf's tile area.
gf.treemap(
  {
    size: items.map((d) => d.value),
    paddingInner: 2,
    paddingOuter: 2,
    round: true,
  },
  gf.For(items, (d) =>
    gf
      .rect({
        fill: gf.v(d.name),
        stroke: "white",
        strokeWidth: 1,
        rx: 3,
        ry: 3,
      })
      .label("name", { position: "center", color: "white", fontSize: 12 })(
      d,
      d.name
    )
  )
).render(root, { w: 520, h: 320 });
```

::::

Inside `.flow(...)` (the fluent chart API), `treemap({ by, size, ... })` partitions the
rows itself, mirroring `spread`/`group`: `by` groups the flow's rows (a field
name or a `field(...)` accessor carrying domain ops, e.g.
`field("genre").dropNulls()`), and `size` — an entry-flagged channel — sums a
field per group (or takes an explicit per-entry array) to weight each tile's
area. See [`spread`](./spread.md) for the `by`/entry-flagged-channel pattern
this mirrors.

## Signature

```ts
treemap(options); // .flow() operator form
treemap(options, children); // combinator form
```

## Parameters

::: gofish-ref treemap
:::

## Notes

- A treemap accepts a **flat list of children**; for multi-level treemaps, compose by nesting `treemap(...)` calls (or add a higher-level wrapper).
- In the combinator form, `size` is an **explicit array**, one weight per child in child order — it does not read back off each child's bound datum.
