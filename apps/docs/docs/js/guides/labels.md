# Labels

Add text labels to marks using the `.label()` method. Labels automatically position themselves, contrast against fill colors, and hide when space is tight.

## Basic usage

Call `.label(field)` on any mark to display a data field as text.

::: gofish

```js
gf.chart(seafood, { axes: true })
  .flow(gf.spread({ by: "lake", dir: "x" }))
  .mark(gf.rect({ h: "count" }).label("count"))
  .render(root, { w: 400, h: 250 });
```

:::

## Positioning

Labels use a `side-edge-align` position system.

::: gofish

```js
gf.chart(seafood, { axes: true })
  .flow(
    gf.spread({ by: "lake", dir: "x" }),
    gf.stack({ by: "species", dir: "y" })
  )
  .mark(
    gf
      .rect({ h: "count", fill: "species" })
      .label("count", { position: "center", fontSize: 10 })
  )
  .render(root, { w: 400, h: 250 });
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

::: gofish

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

gf.chart(heatData, { color: gf.gradient(["#e0f3ff", "#08519c"]), axes: true })
  .flow(gf.table("hour", "day", { spacing: 4 }))
  .mark(
    gf
      .rect({ fill: "value" })
      .label("value", { position: "center", fontSize: 11 })
  )
  .render(root, { w: 350, h: 250 });
```

:::

## Rotated labels

Use the `rotate` option for angled labels. Positive values rotate clockwise.

::: gofish

```js
gf.chart(seafood, { axes: true })
  .flow(gf.spread({ by: "lake", dir: "x" }))
  .mark(
    gf
      .rect({ h: "count" })
      .label("lake", { position: "outset", rotate: 45, fontSize: 10 })
  )
  .render(root, { w: 400, h: 280 });
```

:::

## Labeling a group instead of a mark instance

`.label()` also chains on an operator returned by `.flow(...)` (`spread`,
`stack`, `group`, `scatter`, `table`, `treemap`), not just on a mark. This
labels each **group** the operator produces — one label per split leaf —
instead of one label per mark instance:

```ts
chart(data)
  .flow(stack({ by: "class", dir: "y" }).label("class", { position: "center" }))
  .mark(rect({ h: "count" }));
```

The accessor you pass here has three forms, and which one you need depends
on what you're labeling:

- **A bare field name** (`"class"` above) must be constant across every row
  in the group — true by construction for a `by` field, since every row in
  the group shares that value. If the field's value actually varies from row
  to row, `.label()` throws a loud error rather than silently picking one
  row's value:

  ```
  [gofish] .label("count"): field is not constant within the group; use an
  aggregate like field("count").mean()
  ```

- **A `field(...)` aggregate** folds the group's rows to one value — this is
  the spelling for a group total or mean, e.g. a stacked bar's segment count:

  ```ts
  chart(data)
    .flow(stack({ by: "class", dir: "y" }).label(field("count").sum()))
    .mark(rect({ h: "count" }));
  ```

  `field(...)` also supports `.mean()`, `.count()`, and `.distinct()` — see
  the [field-expression pipeline](/js/api/operators/spread#field-expression-pipeline).

- **A function accessor** is the raw escape hatch: it receives the group's
  whole row array and returns whatever text it computes, e.g.
  `(rows) => rows.length`.

See [`.label()` on operators](/js/api/core/mark#operator-label) for the full
semantics.

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
// Outset labels on a bar chart, one bar per lake — "count" is a real per-row
// field, so a bare string label needs a group total, not a bare field read
.mark(rect({ h: "count" }).label(field("count").sum()))

// Center labels on stacked bars — one bar per (lake, species) pair, so
// "count" is already constant within each bar's group
.mark(rect({ h: "count", fill: "species" }).label("count", { position: "center" }))

// Right-aligned labels on horizontal bars (group total again)
.mark(rect({ w: "count" }).label(field("count").sum(), { position: "outset-right", offset: 15 }))

// Heatmap with auto-contrast
.mark(rect({ fill: "value" }).label("value", { position: "center", fontSize: 11 }))

// Rotated labels above bars, labeled by the (constant) by-field
.mark(rect({ h: "count" }).label("lake", { position: "outset", rotate: 60 }))
```
