# Treemap

Lays out children into a treemap: a 2D tiling of rectangles whose **areas are proportional to a weight**.

<!-- This is currently a **low-level** operator (use `Treemap(...)` directly), not a `chart(...).flow(...)` operator. -->

:::: gofish

```js
const items = [
  { name: "Action", value: 120 },
  { name: "Comedy", value: 80 },
  { name: "Drama", value: 160 },
  { name: "Sci-Fi", value: 60 },
  { name: "Horror", value: 40 },
];

// Each child gets its own rectangle; Treemap assigns its (x,y,w,h).
// `size` is an explicit per-child weight array (one value per child, in
// child order) that drives each leaf's tile area.
gf.Treemap(
  {
    size: items.map((d) => d.value),
    paddingInner: 2,
    paddingOuter: 2,
    round: true,
  },
  gf.For(items, (d) =>
    gf.rect({
      // Setting fill to the label string makes rect's built-in label show it.
      fill: gf.v(d.name),
      stroke: "white",
      strokeWidth: 1,
      rx: 3,
      ry: 3,
      label: true,
    })(d, d.name)
  )
).render(root, { w: 520, h: 320 });
```

::::

Inside `.flow(...)` (the v3 API), `treemap({ by, size, ... })` partitions the
rows itself, mirroring `spread`/`group`: `by` groups the flow's rows (a field
name or a `field(...)` accessor carrying domain ops, e.g.
`field("genre").dropNulls()`), and `size` — an entry-flagged channel — sums a
field per group (or takes an explicit per-entry array) to weight each tile's
area. See [`spread`](./spread.md) for the `by`/entry-flagged-channel pattern
this mirrors.

## Signature

```ts
Treemap(options?, children)
treemap(options) // .flow() operator form
```

## Parameters

| Option                     | Type                                                                             | Description                                                                                                                                                                                                                                                                                                                                                                                     |
| -------------------------- | -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `by`                       | `string \| FieldAccessor`                                                        | **Operator form only** (`.flow()`): field to partition rows by; also accepts a `field(...)` accessor carrying domain ops (`sort`/`reverse`/`bin`/`dropNulls`). Without `by`, one leaf is emitted per row.                                                                                                                                                                                       |
| `size`                     | `string \| FieldAccessor \| (number \| Value<number>)[]`                         | Per-leaf weight driving tile area — entry-flagged (one value per split entry): a field name (summed by default), a `field(...)` accessor, or an explicit per-child array (combinator form).                                                                                                                                                                                                     |
| `paddingInner`             | `number`                                                                         | Padding between sibling rectangles.                                                                                                                                                                                                                                                                                                                                                             |
| `paddingOuter`             | `number`                                                                         | Padding around the outer edge of the treemap.                                                                                                                                                                                                                                                                                                                                                   |
| `round`                    | `boolean`                                                                        | Round pixel positions/sizes.                                                                                                                                                                                                                                                                                                                                                                    |
| `tile`                     | `"squarify" \| "slice" \| "dice" \| "binary" \| "slicedice" \| "squarifyCircle"` | Tiling strategy (`"squarify"` default).                                                                                                                                                                                                                                                                                                                                                         |
| `sort`                     | `"asc" \| "desc" \| "none"`                                                      | Sort leaves by weight before layout (`"desc"` default).                                                                                                                                                                                                                                                                                                                                         |
| `flipY`                    | `boolean`                                                                        | When `true`, mirror the layout top-to-bottom inside the treemap box (default `false`).                                                                                                                                                                                                                                                                                                          |
| `leafIntrinsicRadiusField` | `string`                                                                         | Optional datum key for **radius** (pixels in treemap space): each leaf is laid out in a square `min(leafW, leafH, 2×radius)` so the same value can match across separate treemaps.                                                                                                                                                                                                              |
| `x`, `y`                   | `number \| Value<number>`                                                        | Optional position offset for the treemap container.                                                                                                                                                                                                                                                                                                                                             |
| `w`, `h`                   | `number \| Value<number>`                                                        | Optional size for the treemap container (the box d3 tiles into). A `number` is an explicit pixel size; a `Value` (e.g. a data-driven `size` channel that sums a field) scales the box through the layout's scale system — and when several treemaps are faceted side by side, they share one scale so their boxes are proportional. When omitted, the treemap fills the slot its parent allots. |

## Notes

- Treemap accepts a **flat list of children**; for multi-level treemaps, compose by nesting `Treemap(...)` calls (or add a higher-level wrapper).
- In the combinator form, `size` is an **explicit array**, one weight per child in child order — it does not read back off each child's bound datum.
