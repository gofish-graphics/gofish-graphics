# Treemap

Lays out children into a treemap: a 2D tiling of rectangles whose **areas are proportional to a weight**.

This is currently a **low-level** operator (use `Treemap(...)` directly), not a `chart(...).flow(...)` operator.

:::: starfish

```js
const items = [
  { name: "Action", value: 120 },
  { name: "Comedy", value: 80 },
  { name: "Drama", value: 160 },
  { name: "Sci-Fi", value: 60 },
  { name: "Horror", value: 40 },
];

// Each child gets its own rectangle; Treemap assigns its (x,y,w,h).
// `valueField` reads weights from each child's datum.
gf.Treemap(
  { valueField: "value", paddingInner: 2, paddingOuter: 2, round: true },
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

## Signature

```ts
Treemap(options?, children)
```

## Parameters

| Option         | Type                              | Description                                                                               |
| -------------- | --------------------------------- | ----------------------------------------------------------------------------------------- |
| `valueField`   | `string`                          | Reads weights from `(childNode as any).datum[valueField]` (or sums if datum is an array). |
| `value`        | `(node: GoFishNode) => number`    | Custom weight accessor (overrides `valueField`).                                          |
| `paddingInner` | `number`                          | Padding between sibling rectangles.                                                       |
| `paddingOuter` | `number`                          | Padding around the outer edge of the treemap.                                             |
| `round`        | `boolean`                         | Round pixel positions/sizes.                                                              |
| `tile`         | `"squarify" \| "slice" \| "dice"` | Tiling strategy (`"squarify"` default).                                                   |
| `sort`         | `"asc" \| "desc" \| "none"`       | Sort leaves by weight before layout (`"desc"` default).                                   |
| `x`, `y`       | `number \| Value<number>`         | Optional position offset for the treemap container.                                       |
| `w`, `h`       | `number \| Value<number>`         | Optional explicit size override for the treemap container.                                |

## Notes

- Treemap accepts a **flat list of children**; for multi-level treemaps, compose by nesting `Treemap(...)` calls (or add a higher-level wrapper).
