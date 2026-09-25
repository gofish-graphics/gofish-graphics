# Glyphs

A **glyph** is a small picture that stands for one row of data. A plain dot
tells you where a row sits. A glyph can also tell you what kind of thing it is,
how big it is, and what it is called, because it is made of several shapes
instead of one.

Glyphs are usually treated as a feature that needs a grammar of its own, the
same way the other pages in this row of the tutorials index treat pictorial
charts, interaction, and trees. In GoFish there is nothing new to learn. A
glyph is a function that returns a layer. This page writes one and hands it to
a chart.

::: tip Before you start
This page assumes [Basics](/js/tutorials/basics) for marks, operators and
`layer()`, and [Charts](/js/tutorials/charts) for `chart()`, `.flow()` and
`.mark()`.
:::

## A glyph is a function that returns a layer

Here is the glyph this page builds: a ring with a white center and a small
square in the middle of that. Three shapes, all drawn at the same spot by
`layer()`, so they nest inside one another.

::: gofish

```js
const marker = ({ fill }) =>
  gf.layer([
    gf.ellipse({ cx: 0, cy: 0, w: 34, h: 34, fill }),
    gf.ellipse({ cx: 0, cy: 0, w: 18, h: 18, fill: "white" }),
    gf.rect({ cx: 0, cy: 0, w: 8, h: 8, fill }),
  ]);

marker({ fill: "#e63946" }).render(root, { w: 70, h: 70 });
```

:::

Two things are worth naming here.

The shapes are placed with `cx` and `cy`, the center of the shape, rather than
with a corner. Children of a `layer` all sit at the same origin, so centering
every shape on `(0, 0)` is what makes them concentric. A glyph is easiest to
reason about when it is built around its own center, because that center is the
point the chart will later place.

`fill` is a **prop**, an ordinary function argument. Nothing about `marker`
knows about data yet. It is a function from some options to a picture, and it
draws itself with `.render()` like any other mark.

## The same glyph, three times

Because `marker` returns a mark, an operator can arrange several of them. Put
three in a row with `spread()` and you have the makings of a legend.

::: gofish

```js
const marker = ({ fill }) =>
  gf.layer([
    gf.ellipse({ cx: 0, cy: 0, w: 34, h: 34, fill }),
    gf.ellipse({ cx: 0, cy: 0, w: 18, h: 18, fill: "white" }),
    gf.rect({ cx: 0, cy: 0, w: 8, h: 8, fill }),
  ]);

gf.spread({ dir: "x", spacing: 16 }, [
  marker({ fill: "#e63946" }),
  marker({ fill: "#457b9d" }),
  marker({ fill: "#2a9d8f" }),
]).render(root, { w: 220, h: 70 });
```

:::

This is the whole reuse story. A glyph is a mark, so every operator you already
know accepts it, and a glyph can hold operators inside it too.

## Handing the glyph to a chart

Now give the job of placing the markers to a chart. `.mark()` usually takes a
mark, like `rect(...)`. It also takes a **function** that returns a mark, and
that function is called once per position the flow produced.

::: gofish

```js
const marker = ({ fill }) =>
  gf.layer([
    gf.ellipse({ cx: 0, cy: 0, w: 34, h: 34, fill }),
    gf.ellipse({ cx: 0, cy: 0, w: 18, h: 18, fill: "white" }),
    gf.rect({ cx: 0, cy: 0, w: 8, h: 8, fill }),
  ]);

const stations = [
  { id: "AB", x: 12, y: 46, color: "#e63946" },
  { id: "CD", x: 38, y: 22, color: "#457b9d" },
  { id: "EF", x: 55, y: 61, color: "#2a9d8f" },
  { id: "GH", x: 78, y: 35, color: "#e9a13b" },
  { id: "IJ", x: 92, y: 70, color: "#8e6bbf" },
];

gf.chart(stations)
  .flow(gf.scatter({ by: "id", x: "x", y: "y" }))
  .mark((d) => marker({ fill: d[0].color }))
  .render(root, { w: 260, h: 170 });
```

:::

`scatter({ by: "id", x: "x", y: "y" })` splits the data by `id` and gives each
group a position from its `x` and `y` fields. Then the mark function runs for
each of those positions, and whatever it returns is drawn there.

Notice `d[0]` rather than `d`. The argument is the **group of rows** at that
position, not a single row, because a flow is free to leave more than one row
in a group. `scatter({ by: "id" })` splits on a field whose values are unique,
so every group here holds exactly one row, and `d[0]` is that row. If you
grouped by something coarser, like a region, `d` would be every station in the
region and the glyph could draw all of them.

## A label from the data

A glyph can read anything off the row, not just a color. Pass the whole row in
and add a `text()` beside the ring.

::: gofish

```js
const marker = (d) =>
  gf.layer([
    gf.ellipse({ cx: 0, cy: 0, w: 34, h: 34, fill: d.color }),
    gf.ellipse({ cx: 0, cy: 0, w: 18, h: 18, fill: "white" }),
    gf.rect({ cx: 0, cy: 0, w: 8, h: 8, fill: d.color }),
    gf.text({ cx: 32, cy: 0, text: d.id, fontSize: 14, fill: "#333" }),
  ]);

const stations = [
  { id: "AB", x: 12, y: 46, color: "#e63946" },
  { id: "CD", x: 38, y: 22, color: "#457b9d" },
  { id: "EF", x: 55, y: 61, color: "#2a9d8f" },
  { id: "GH", x: 78, y: 35, color: "#e9a13b" },
  { id: "IJ", x: 92, y: 70, color: "#8e6bbf" },
];

gf.chart(stations)
  .flow(gf.scatter({ by: "id", x: "x", y: "y" }))
  .mark((d) => marker(d[0]))
  .render(root, { w: 260, h: 170 });
```

:::

The glyph's signature changed from a props object to a row, which is the usual
shape once a glyph is written for one chart. `text` is measured like any other
mark, so the layer grows to hold it and the whole glyph stays centered on the
ring.

The label sits to the right because `cx: 32` puts its center 32 pixels along
from the ring's center. Fixed offsets like that are fine while the glyph's own
parts are a fixed size. When a part's position comes from the data, you need a
constraint instead, which is what the Pictorial Charts tutorial is about.

## The finished glyph chart

That last snippet is the whole example.

::: gofish story:tutorials-glyphs--glyphs hidden
:::

## Where next

- [**Pictorial Charts**](/js/tutorials/pictorial-charts). A glyph whose parts
  are held together by constraints rather than by fixed offsets, with an image
  and compositing inside the mark.
- [**Diagrams**](/js/tutorials/diagrams). Names, references, and constraints
  tie the parts of a picture together, even parts that live in different places.
