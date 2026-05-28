# Labels

Add text labels to marks using the `.label()` method. Labels automatically position themselves, contrast against fill colors, and hide when space is tight.

## Basic usage

Call `.label(field)` on any mark to display a data field as text.

::: starfish

```js
gf.Chart(seafood)
  .flow(gf.spread({ by: "lake", dir: "x" }))
  .mark(gf.rect({ h: "count" }).label("count"))
  .render(root, { w: 400, h: 250, axes: true });
```

:::

## Positioning

Labels use a `side-edge-align` position system.

::: starfish

```js
gf.Chart(seafood)
  .flow(
    gf.spread({ by: "lake", dir: "x" }),
    gf.stack({ by: "species", dir: "y" })
  )
  .mark(
    gf
      .rect({ h: "count", fill: "species" })
      .label("count", { position: "center", fontSize: 10 })
  )
  .render(root, { w: 400, h: 250, axes: true });
```

:::

### Position strings

The position is built from up to three parts: `side-edge-align` — each part requires the one before it (side just be specified before adding an edge, and an edge before adding an alignment), with `top` and `center` as the defaults for edge and alignment respectively.

| Part      | Values                           | Description                               |
| --------- | -------------------------------- | ----------------------------------------- |
| **side**  | `center`,`inset`, `outset`       | dead center, inside, or outside the shape |
| **edge**  | `top`, `bottom`, `left`, `right` | Which edge to anchor to                   |
| **align** | `start`, `center`, `end`         | Alignment along the perpendicular axis    |

Special values:

- `"center"` — dead center of the shape, never combined with an edge or align value

### Common positions

| Position             | Use case                                |
| -------------------- | --------------------------------------- |
| `"center"`           | Inside shapes — stacked bars, heatmaps  |
| `"outset"`           | Above vertical bars (default shorthand) |
| `"outset-right"`     | End of horizontal bars                  |
| `"outset-bottom"`    | Below shapes                            |
| `"inset-top"`        | Inside, anchored to top edge            |
| `"outset-top-start"` | Above shape, left-aligned               |
| `"outset-top-end"`   | Above shape, right-aligned              |

## Options

| Option     | Type     | Default | Description                              |
| ---------- | -------- | ------- | ---------------------------------------- |
| `position` | `string` | auto    | Label position (see above)               |
| `fontSize` | `number` | —       | Font size in pixels                      |
| `color`    | `string` | auto    | Text color (auto-contrasts against fill) |
| `offset`   | `number` | `10`    | Distance from the shape edge             |
| `rotate`   | `number` | `0`     | Rotation in degrees (clockwise)          |

## Auto-contrast

Labels inside shapes (`center`, `inset-*`) automatically pick white or black text based on the fill color's luminance. Labels outside shapes use a darkened version of the fill color. You can override this with the `color` option.

::: starfish

```js
const heatData = ["Mon", "Tue", "Wed", "Thu", "Fri"].flatMap((day, di) =>
  ["9am", "12pm", "3pm"].map((hour, hi) => ({
    day,
    hour,
    value: [42, 78, 55, 91, 33, 67, 24, 89, 61, 15, 74, 48, 36, 83, 70][
      di * 3 + hi
    ],
  }))
);

gf.Chart(heatData, { color: gf.gradient(["#e0f3ff", "#08519c"]) })
  .flow(gf.table("hour", "day", { spacing: 4 }))
  .mark(
    gf
      .rect({ fill: "value" })
      .label("value", { position: "center", fontSize: 11 })
  )
  .render(root, { w: 350, h: 250, axes: true });
```

:::

## Rotated labels

Use the `rotate` option for angled labels. Positive values rotate clockwise.

::: starfish

```js
gf.Chart(seafood)
  .flow(gf.spread({ by: "lake", dir: "x" }))
  .mark(
    gf
      .rect({ h: "count" })
      .label("lake", { position: "outset", rotate: 45, fontSize: 10 })
  )
  .render(root, { w: 400, h: 280, axes: true });
```

:::

## Custom label text

Pass a function instead of a field name for computed labels.

```ts
// Function accessor — receives the datum, returns display text
.mark(
  rect({ w: "proportion", fill: "sex" })
    .label((d) => d.people.toLocaleString(), { position: "center", color: "white" })
)
```

## Examples

```ts
// Outset labels on a bar chart
.mark(rect({ h: "count" }).label("count"))

// Center labels on stacked bars
.mark(rect({ h: "count", fill: "species" }).label("count", { position: "center" }))

// Right-aligned labels on horizontal bars
.mark(rect({ w: "count" }).label("count", { position: "outset-right", offset: 15 }))

// Heatmap with auto-contrast
.mark(rect({ fill: "value" }).label("value", { position: "center", fontSize: 11 }))

// Rotated labels above bars
.mark(rect({ h: "count" }).label("lake", { position: "outset", rotate: 60 }))
```
