# scatter

Positions children at per-group means (when `by` is given) or per-item (when `by` is omitted).

::: starfish

```js
const locations = Object.entries(lakeLocations).map(([lake, { x, y }]) => ({
  lake,
  x,
  y,
}));

gf.Chart(locations)
  .flow(gf.scatter({ by: "lake", x: "x", y: "y" }))
  .mark(gf.circle({ r: 8 }))
  .render(root, { w: 400, h: 250, axes: true });
```

:::

## Signature

```ts
scatter({ by?, x?, y?, xMin?, xMax?, yMin?, yMax?, alignment? })
```

## Parameters

| Option                      | Type                                         | Description                                                    |
| --------------------------- | -------------------------------------------- | -------------------------------------------------------------- |
| `by`                        | `string`                                     | Field to group by; omit for per-item scatter                   |
| `x`, `y`                    | `string \| number`                           | Field name for position, or fixed pixel value                  |
| `xMin`/`xMax`/`yMin`/`yMax` | `string`                                     | Range form — children span `[xMin, xMax]` (or y) in data space |
| `alignment`                 | `"start" \| "middle" \| "end" \| "baseline"` | Alignment on axes scatter doesn't position                     |

At least one of `x`, `y`, the `xMin`/`xMax` pair, or the `yMin`/`yMax` pair is required.

## Example

```ts
.flow(scatter({ by: "species", x: "bill_length", y: "flipper_length" }))
.mark(rect({ w: 8, h: 8, rx: 4 }))

// Histogram with range form: each rect spans its bin in data space
.flow(derive(bin("rating")), scatter({ xMin: "start", xMax: "end" }))
.mark(rect({ h: "count" }))
```
