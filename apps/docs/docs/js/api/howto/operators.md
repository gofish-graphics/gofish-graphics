# How to pick a layout operator

GoFish provides three layout operators for positioning marks: **spread**, **stack**, and **scatter**. Each serves a different purpose.

## Quick reference

| Operator  | Use when...                                            | Typical charts                                 |
| --------- | ------------------------------------------------------ | ---------------------------------------------- |
| `spread`  | Items are independent and need their own regions       | Grouped bars, faceted layouts, small multiples |
| `stack`   | Items are parts of a whole, sharing a continuous scale | Stacked bars, stacked areas, streamgraphs      |
| `scatter` | Marks need x/y coordinate positioning                  | Scatterplots, bubble charts                    |

## Decision guide

```
Do you need to position marks at specific x/y coordinates?
  └─ Yes → scatter
  └─ No  → Are items parts of a whole (additive)?
             └─ Yes → stack
             └─ No  → spread
```

## spread vs stack: the key difference

Both operators divide space along an axis, but they treat that space differently. Consider this data for a single stacked bar with three segments:

```ts
const segments = [
  { category: "A", value: 30 },
  { category: "B", value: 50 },
  { category: "C", value: 20 },
];
```

**Wrong: Using spread** — each segment gets its own independent region:

::: starfish

```js
const segments = [
  { category: "A", value: 30 },
  { category: "B", value: 50 },
  { category: "C", value: 20 },
];

gf.Chart(segments)
  .flow(gf.spread({ by: "category", dir: "y", spacing: 1 }))
  .mark(gf.rect({ h: "value", fill: "category" }))
  .render(root, { w: 100, h: 200, axes: true });
```

:::

This is **not** a stacked bar. The three rectangles are placed in separate slots—each has its own scale. A value of 30 in slot A doesn't relate to a value of 50 in slot B; they're just arranged vertically like small multiples.

**Correct: Using stack** — segments share a continuous scale:

::: starfish

```js
const segments = [
  { category: "A", value: 30 },
  { category: "B", value: 50 },
  { category: "C", value: 20 },
];

gf.Chart(segments)
  .flow(gf.stack({ by: "category", dir: "y" }))
  .mark(gf.rect({ h: "value", fill: "category" }))
  .render(root, { w: 100, h: 200, axes: true });
```

:::

Now the rectangles stack on top of each other: A starts at 0, B starts at 30, C starts at 80. The total height represents the sum (100). This is the correct way to show part-to-whole relationships.

## spread

Divides space into separate regions for each group, with optional gaps between them.

```ts
.flow(spread({ by: "category",  dir: "x", spacing: 8 }))
```

Use `spread` when groups are independent and shouldn't share a scale. The `spacing` parameter controls the gap size (default is 8).

**Example: Grouped bar chart**

```ts
chart(data)
  .flow(
    spread({ by: "category", dir: "x", spacing: 24 }),
    spread({ by: "group", dir: "x", spacing: 0 })
  )
  .mark(rect({ h: "value", fill: "group" }));
```

## stack

Arranges items along a continuous shared scale, with each item starting where the previous one ended.

```ts
.flow(stack({ by: "weather",  dir: "y" }))
```

Use `stack` when building part-to-whole visualizations where values should add up.

**Example: Stacked bar chart**

```ts
chart(data)
  .flow(spread({ by: "month", dir: "x" }), stack({ by: "category", dir: "y" }))
  .mark(rect({ fill: "category" }));
```

## scatter

Groups data by a field and positions each group at the mean x/y coordinates of its members.

```ts
.flow(scatter({ by: "species",  x: "bill_length", y: "flipper_length" }))
```

Use `scatter` when your data has numeric x and y fields and you want marks positioned by those values.

**Example: Scatterplot**

```ts
chart(penguins)
  .flow(scatter({ by: "species", x: "bill_length", y: "flipper_length" }))
  .mark(circle({ r: 4, fill: "species" }));
```

## Combining operators

You can chain multiple operators in `.flow()` to create nested layouts:

```ts
// First spread by category (with gaps), then stack within each category
.flow(
  spread({ by: "category",  dir: "x", spacing: 16 }),
  stack({ by: "subcategory",  dir: "y" })
)
```

The operators apply in order: the first groups and lays out the data, then subsequent operators work within those groups.
