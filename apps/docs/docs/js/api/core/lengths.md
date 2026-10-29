---
title: percent / fr
---

# percent / fr

A length is a size or a gap. It is a number of pixels, a `percent(n)` of the
room it is laid out in, or an `fr(k)` weight that takes k shares of the room
its nearest scope divides.

::: gofish

```js
gf.chart(seafood, { w: 500, h: 200 })
  .flow(
    gf.spread({ by: "lake", dir: "x", spacing: gf.fr(1) }),
    gf.stack({ by: "species", dir: "y" })
  )
  .mark(gf.ribbon({ h: "count", fill: "species", opacity: 0.8 }))
  .render(root);
```

:::

## Signature

```ts
percent(n: number): LengthValue;
fr(k: number): LengthValue;

percent(n).offset(px: number): LengthValue;
```

`n` is any finite number. `k` is a finite number, 0 or more. `.offset(px)`
adds pixels to a percent, like CSS `calc(30% + 10px)`. An `fr` takes no
offset.

```ts
import { percent, fr } from "gofish-graphics";
```

## Where a length goes

| Option                                                   | Pixels | `percent(n)` of                  | `fr(k)` |
| -------------------------------------------------------- | ------ | -------------------------------- | ------- |
| `w`, `h` of `chart`, `layer`, `rect`, `ellipse`, `image` | yes    | the parent's room                | yes     |
| `w`, `h` of `spread`, `stack`, `treemap`, `blank`        | yes    | the parent's room                | yes     |
| `spacing` of `spread` and `stack`                        | yes    | the operator's room              | yes     |
| `spacing` of `table`                                     | yes    | the operator's room              | no      |
| `inset` of `rect`                                        | yes    | the rect's own box, on each side | no      |

Any other option throws on a length. So does `render`'s `w` and `h`, which
must be pixels.

## Rooms

A room is the length a node is given on an axis from outside its content.
There are three kinds:

- the canvas, which is the `render` size, or 400 px on an axis the render
  does not size;
- a node's own size, when it is pixels or a percent;
- a band, which is the share a part gets in its scope. A percent of a band
  is a share of the band.

A node with no size of its own hugs its content, so it has no room. A percent
inside it is of the nearest room above it. For a part of a `spread`, that is
the spread's room, not the part's band. Use `inset` or `fr` spacing to size a
part against its band.

## fr

`fr(k)` claims k shares of its nearest scope, the way a category band claims
one share. The parts and gaps of a scope divide the room left after its
fixed parts, in proportion to their weights. A node sized with `fr` is a
scope for its own content.

A length has no content minimum. When fixed parts and gaps are larger than
their room, the layout warns that they overflow.

The layout also warns when:

- an `fr` gap has no room, as in a chart with no `w`. The gap is 0.
- an `fr` is in a scope whose sizes are data, such as `rect({ w: "sales" })`.
  There a share is a data unit, not a part of the room.

## Examples

Bars at 80% of their band, as paint:

::: gofish

```js
const north = [
  { quarter: "Q1", sales: 32 },
  { quarter: "Q2", sales: 41 },
  { quarter: "Q3", sales: 38 },
  { quarter: "Q4", sales: 52 },
];

gf.chart(north, { w: 400, h: 200 })
  .flow(gf.spread({ by: "quarter", dir: "x", spacing: 0 }))
  .mark(gf.rect({ h: "sales", fill: "#08519c", inset: gf.percent(10) }))
  .render(root);
```

:::

The same bars as layout. Each bar is one share, and each gap is a quarter
share:

::: gofish

```js
const north = [
  { quarter: "Q1", sales: 32 },
  { quarter: "Q2", sales: 41 },
  { quarter: "Q3", sales: 38 },
  { quarter: "Q4", sales: 52 },
];

gf.chart(north, { w: 400, h: 200 })
  .flow(gf.spread({ by: "quarter", dir: "x", spacing: gf.fr(0.25) }))
  .mark(gf.rect({ h: "sales", fill: "#08519c" }))
  .render(root);
```

:::

A fixed sidebar and two panels that divide the rest 2 to 1:

```js
const panel = (dims, fill, label) =>
  layer(dims, [rect({ fill }), text({ text: label })]);

layer({ w: 720, h: 260 }, [
  spread({ dir: "x", spacing: 12, alignment: "start" }, [
    panel({ w: 140, h: 260 }, "#eee", "sidebar"),
    panel({ w: fr(2), h: 260 }, "#dbe9f6", "main"),
    panel({ w: fr(1), h: 260 }, "#fde7d4", "inspector"),
  ]),
]).render(container, {});
```

## Limits

- A percent `w` or `h` inside a facet panel, a table cell, a treemap tile or
  a coordinate transform throws.
- A percent `padding` on `chart` or a coordinate transform throws
  ([#852](https://github.com/gofish-graphics/gofish-graphics/issues/852),
  [#1238](https://github.com/gofish-graphics/gofish-graphics/issues/1238)).
- `treemap`'s `spacing` and `padding` take pixels only.
