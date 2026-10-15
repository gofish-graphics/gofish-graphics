# Pictorial Charts

A **pictorial chart** is a chart whose bars are pictures. The numbers do the
same job they do in any chart: they set positions and sizes. The picture is
paint laid over that. Here the picture is a photograph of a wine bottle, and
the number is how full the bottle is.

This is the first tutorial where the two levels of GoFish meet in one picture.
`chart()` and `spread()` decide where each bottle goes and how tall its fill
is. That is the chart level, from the [Charts
tutorial](/js/tutorials/charts). Inside each bottle, the fill, the fill line,
and the percent label are held together by names and constraints. That is the
diagram level, from the [Diagrams tutorial](/js/tutorials/diagrams). A third
idea joins them: **image compositing**, which is how a plain rectangle becomes
the liquid inside a photograph.

::: tip Before you start
This page assumes [Basics](/js/tutorials/basics), then
[Charts](/js/tutorials/charts) for `chart`, `flow` and `mark`, and
[Diagrams](/js/tutorials/diagrams) for `.name()` and `.relate()`.
:::

## The bar chart underneath

Start with an ordinary bar chart. Four categories, one amount each, read as a
percentage.

::: gofish

```js
const data = [
  { category: "a", amount: 30 },
  { category: "d", amount: 60 },
  { category: "b", amount: 75 },
  { category: "c", amount: 100 },
];

gf.chart(data, { axes: false })
  .flow(
    gf.spread({ by: "category", dir: "x", spacing: 20, axes: { x: false } })
  )
  .mark(gf.rect({ h: "amount", w: 60, fill: "#00ff00" }))
  .render(root, {});
```

:::

`axes: false` on the chart turns off the y axis, and `axes: { x: false }` on
the `spread` turns off the category labels it would otherwise draw. A pictorial
chart carries its own labels, so the usual chart furniture is in the way.

Every number in the finished chart is already here. `h: "amount"` reads the
`amount` field and runs it through a scale, so the tallest bar is the full
height of the plot. Nothing after this step changes that.

## The bottle as a bar

`image()` draws a picture and lays out like any other mark. Swap it in for the
rectangle.

::: gofish

```js
const data = [
  { category: "a", amount: 30 },
  { category: "d", amount: 60 },
  { category: "b", amount: 75 },
  { category: "c", amount: 100 },
];

gf.chart(data, { axes: false })
  .flow(
    gf.spread({ by: "category", dir: "x", spacing: 20, axes: { x: false } })
  )
  .mark(gf.image({ href: "/wilsonblanco.png", h: gf.v(100) }))
  .render(root, {});
```

:::

`href` is the URL of the picture. In a project with a bundler you would import
the file and pass the imported value, as in
`import bottlePng from "./wilsonblanco.png"`.

`h: gf.v(100)` needs a word. A mark's size option takes three different kinds
of thing:

- a **string** is a field name, so `h: "amount"` means "this row's amount";
- a **plain number** is pixels, so `h: 100` means one hundred pixels on screen;
- **`v(100)`** is a literal data value, so `h: v(100)` means one hundred of
  whatever `amount` is measured in, put through the same scale.

So every bottle is drawn at the height of a full bar. The width follows from
the picture's own proportions, because only `h` was given.

The bottles are now the bars, but they all look the same. The picture replaced
the data instead of carrying it.

## Filling the bottle

Put the bar back, inside the picture. `paint()` takes exactly two children. The
first is a surface, the second is painted onto it and clipped to its shape.

::: gofish

```js
const data = [
  { category: "a", amount: 30 },
  { category: "d", amount: 60 },
  { category: "b", amount: 75 },
  { category: "c", amount: 100 },
];

gf.chart(data, { axes: false })
  .flow(
    gf.spread({ by: "category", dir: "x", spacing: 20, axes: { x: false } })
  )
  .mark(
    gf.paint({ blendMode: "color" }, [
      gf.image({ href: "/wilsonblanco.png", h: gf.v(100) }),
      gf.rect({ h: "amount", w: 175, fill: "#00ff00" }),
    ])
  )
  .render(root, {});
```

:::

The bottle is the surface and the green rectangle is the paint. The rectangle
is 175 pixels wide, which is wider than the bottle, and that is on purpose: it
is clipped to the bottle's outline anyway, so an over wide rectangle is the
simplest way to guarantee full coverage. Its height is still `"amount"`, so the
paint reaches exactly as high as the bar did in the first step.

`paint` is one of five **region compositing** operators, named after Figma's
boolean operations. They combine the silhouettes of two children:

| Operator            | What you get                                  |
| ------------------- | --------------------------------------------- |
| `paint([A, B])`     | A, with B drawn on top of it and clipped to A |
| `mask([A, B])`      | B clipped to A, with A itself never drawn     |
| `intersect([A, B])` | only where the two overlap                    |
| `subtract([A, B])`  | A with B's shape cut out of it                |
| `exclude([A, B])`   | everywhere exactly one of them covers         |

`blendMode` says how the two colors mix where they meet. `"color"` takes the
hue and the saturation from the paint and keeps the light and shade of the
surface underneath. That is why the filled part of the bottle still has its
highlights, its shadow, and the dark ring at the base: the photograph's shading
survives, only its color is replaced. Above the fill line the rectangle
supplies no color at all, so that part of the bottle falls back to its light
and shade alone and reads as gray glass. The empty part of the bottle is
legible for free.

The other modes are `multiply`, `screen`, `overlay` and `luminosity`, and they
are listed on the [region compositing
page](/js/api/operators/region-compositing).

## The fill line and the label

The chart is readable but it does not say what the numbers are. Add a thin line
at the fill height and a percent label beside it. This is where the diagram
level comes in: name the three parts, then state how they relate.

::: gofish

```js
const data = [
  { category: "a", amount: 30 },
  { category: "d", amount: 60 },
  { category: "b", amount: 75 },
  { category: "c", amount: 100 },
];

gf.chart(data, { axes: false })
  .flow(
    gf.spread({ by: "category", dir: "x", spacing: 20, axes: { x: false } })
  )
  .mark(
    gf
      .layer([
        gf
          .paint({ blendMode: "color" }, [
            gf.image({ href: "/wilsonblanco.png", h: gf.v(100) }),
            gf.rect({ h: "amount", w: 175, fill: "#00ff00" }),
          ])
          .name("bottle"),
        gf.rect({ h: 1, fill: "#666", w: 175, y: "amount" }).name("line"),
        gf
          .text({ fontSize: 35, fill: "#666", text: (d) => `${d.amount}%` })
          .name("label"),
      ])
      .relate(({ line, label, bottle }) => [
        gf.Constraint.align({ x: "start" }, [bottle, line]),
        gf.Constraint.distribute({ dir: "y", spacing: 0 }, [line, label]),
        gf.Constraint.align({ x: "end" }, [label, line]),
      ])
  )
  .render(root, {});
```

:::

Three new marks and three constraints. Take them in turn.

The line is `rect({ h: 1, fill: "#666", w: 175, y: "amount" })`. It is a
rectangle one pixel tall, so it reads as a rule, and `y: "amount"` puts it at
the same data height the fill reaches. It is 175 pixels wide, the same as the
fill rectangle, but nothing clips it this time, so it runs past the right edge
of the bottle and leaves a shelf for the label.

The label is a `text` whose content is a function of the row, so each bottle
prints its own number.

Then the constraints:

- `align({ x: "start" }, [bottle, line])` lines up the left edge of the line
  with the left edge of the bottle. The bottle is already placed, so it is the
  anchor and the line is what moves.
- `distribute({ dir: "y", spacing: 0 }, [line, label])` puts the label flush
  against the line with no gap. The line is already placed by its own
  `y: "amount"`, so again it is the anchor. Inside a chart the y axis counts
  upward, so the label lands just above the line.
- `align({ x: "end" }, [label, line])` lines up the right edge of the label
  with the right end of the line, which is the piece of line sticking out past
  the bottle.

A constraint is the right tool here because the line's position comes from the
data. `y: "amount"` is not a pixel value; it becomes one only after the scale
runs, and the scale depends on the size of the plot. There is no number you
could write for the label's position that would still be right when the data
changes or the chart is drawn at another size. A constraint says what has to be
true and lets layout work out the pixels.

The same reasoning applies on the other axis. The bottle's width is whatever
the photograph's proportions give it, so "left edge of the line, left edge of
the bottle" is a relation you can state but not a number you can look up.

## The finished chart

That last snippet is the whole example. Here it is as the gallery renders it.

::: gofish example:bottle-fill-chart hidden
:::

## Where next

- [**What's in a Bottle of Wine**](/js/examples/what-s-in-a-bottle-of-wine).
  The same photograph, cut up instead of painted over. It uses
  [`cut`](/js/api/operators/cut), which slices one shape into several, so each
  band of the bottle is one ingredient.
- [**`image`**](/js/api/marks/image). How width, height and intrinsic size
  work, and what other options the mark takes.
- [**Region compositing**](/js/api/operators/region-compositing). The other
  four operators and the rest of the blend modes.
- [**`relate`**](/js/api/constraints/relate). Every constraint, including
  `position` for data driven placement and `nest` for padding.
