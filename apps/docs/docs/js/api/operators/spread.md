# spread

Partitions data by the `by` field and lays out one child per partition along an axis. The primary layout operator.

::: starfish

```js
gf.Chart(seafood)
  .flow(gf.spread({ by: "lake", dir: "x" }))
  .mark(gf.rect({ h: "count" }))
  .render(root, { w: 400, h: 250, axes: true });
```

:::

## Signature

```ts
// Operator form (inside .flow):
spread({ by?, dir, spacing?, alignment?, glue?, ... })

// Combinator form (apply n marks to one datum):
spread({ dir, ... }, [m1, m2, ...])
```

## Parameters

| Option        | Type                                         | Default      | Description                                                                                                                                                                |
| ------------- | -------------------------------------------- | ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `by`          | `string`                                     | —            | Field to partition by; omit for per-item spread                                                                                                                            |
| `dir`         | `"x" \| "y"`                                 | —            | **Required.** Layout axis                                                                                                                                                  |
| `spacing`     | `number`                                     | `8`          | Gap between children. Ignored when `glue: true`                                                                                                                            |
| `alignment`   | `"start" \| "middle" \| "end" \| "baseline"` | `"baseline"` | Alignment along the off-axis                                                                                                                                               |
| `mode`        | `"edge" \| "center"`                         | `"edge"`     | Whether `spacing` is measured edge-to-edge or center-to-center                                                                                                             |
| `reverse`     | `boolean`                                    | `false`      | Reverse children order along `dir`                                                                                                                                         |
| `sharedScale` | `boolean`                                    | `false`      | Share scale across all children                                                                                                                                            |
| `glue`        | `boolean`                                    | `false`      | Glue children together: collapse data-driven sizes into a single positional axis at this level (the underlying-space kind becomes POSITION). [`stack`](./stack) sets this. |
| `w`, `h`      | `number \| string`                           | —            | Fixed dimension, or field name to encode size from data                                                                                                                    |

## Examples

```ts
// Horizontal bar chart: one bar per "letter"
.flow(spread({ by: "letter", dir: "x" }))

// Vertical layout with fixed width per group
.flow(spread({ by: "category", dir: "y", w: 40 }))

// Combinator form: apply different marks to the same datum
spread({ dir: "x" }, [rect({ h: "v" }), text({ text: "n" })])
```

## `spacing` vs `glue`

`spacing` controls the visual gap between children. `glue` controls whether
children's data-driven sizes get summed into a positional axis at this level:

- `glue: false` (default): real spread. Each child keeps its data-driven
  size; the underlying-space kind on `dir` is SIZE (or ORDINAL when children
  are categorical).
- `glue: true`: stack semantics. Children are pushed together (regardless
  of `spacing`), and their cumulative size becomes a continuous POSITION
  domain on `dir`. This is what [`stack`](./stack) does.

Use `spread({ spacing: 0 })` if you want children touching but with each
child still treated as its own thing (e.g. discrete-theta polar charts).
Use `stack(...)` if you want a stacked-bar feel (continuous position axis
running through the stack).
