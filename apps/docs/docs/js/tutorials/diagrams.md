---
handwritten: true
---

# Diagrams

In [Basics](/js/tutorials/basics) we drew the four planets closest to the sun in
a row on a dark background. In this tutorial we'll label Mercury, the smallest
one, and point an arrow at it:

::: gofish story:tutorials-diagrams--diagrams hidden
:::

Along the way we'll meet the idea that sets diagrams apart. In Basics, every
mark belonged to exactly one operator. In a diagram, a mark often belongs to
more than one: Mercury is part of the row of planets, and it is also part of
its label.

::: tip Before you start
This tutorial picks up right where [Basics](/js/tutorials/basics) ends. In
each example, the lines that changed since the last step are highlighted.
:::

## Naming a planet

Here is the diagram from the end of Basics, with one new line. To label Mercury
we need a way to point at it, so we give each planet a name with `.name()`. We
also leave the size out of `render()` from now on, so GoFish fits the drawing
to whatever we add.

::: gofish

```js{14,17}
const data = [
  { name: "mercury", r: 15, fill: "#F5E3C8", stroke: "#EFC9A2" },
  { name: "venus", r: 36, fill: "#D2913C", stroke: "#A96F26" },
  { name: "earth", r: 38, fill: "#3E8CCC", stroke: "#2F6FA6" },
  { name: "mars", r: 21, fill: "#F4BC80", stroke: "#E0954C" },
];

gf.background({ padding: 20, fill: "#252150", stroke: "none", rx: 16, ry: 16 }, [
  gf.spread(
    { dir: "x", spacing: 50, alignment: "middle" },
    data.map((d) =>
      gf
        .circle({ r: d.r, fill: d.fill, stroke: d.stroke, strokeWidth: 3 })
        .name(d.name)
    )
  ),
]).render(root);
```

:::

Nothing moved! A name doesn't change the picture. It just lets other parts of
the code refer to the mark.

## Adding a label

`text()` is a mark that draws a string. To put the label next to Mercury, we
need Mercury in a second place. That's what `.relate()` is for. We put the row
in a `layer` and call `.relate()` on it. It hands us the marks inside the layer
by name, and it draws whatever we return on top of the layer. `mercury` is a
**reference**: it stands for the mark named `"mercury"`, so we can use Mercury
in a second place without copying it. We put the label and the reference in a
column with `spread`:

::: gofish

```js{8,19-25}
const data = [
  { name: "mercury", r: 15, fill: "#F5E3C8", stroke: "#EFC9A2" },
  { name: "venus", r: 36, fill: "#D2913C", stroke: "#A96F26" },
  { name: "earth", r: 38, fill: "#3E8CCC", stroke: "#2F6FA6" },
  { name: "mars", r: 21, fill: "#F4BC80", stroke: "#E0954C" },
];

gf.layer([
  gf.background({ padding: 20, fill: "#252150", stroke: "none", rx: 16, ry: 16 }, [
    gf.spread(
      { dir: "x", spacing: 50, alignment: "middle" },
      data.map((d) =>
        gf
          .circle({ r: d.r, fill: d.fill, stroke: d.stroke, strokeWidth: 3 })
          .name(d.name)
      )
    ),
  ]),
])
  .relate(({ mercury }) => [
    gf.spread({ dir: "y", spacing: 20, alignment: "middle" }, [
      gf.text({ text: "Mercury", fill: "#E94560", fontSize: 14 }),
      mercury,
    ]),
  ])
  .render(root);
```

:::

Mercury already has a place in the row, so the column leaves it there and moves
the label instead. The label lands 20 pixels above Mercury, centered on it.

This is the key idea of the tutorial. Mercury is now part of two spreads at
once: the row of planets and the label's column.

## Drawing a box around the label

To show that the label and Mercury go together, we can draw a box around them.
That's another job for `background()`. This time we give it an outline and no
fill:

::: gofish

```js{21-23,28-29}
const data = [
  { name: "mercury", r: 15, fill: "#F5E3C8", stroke: "#EFC9A2" },
  { name: "venus", r: 36, fill: "#D2913C", stroke: "#A96F26" },
  { name: "earth", r: 38, fill: "#3E8CCC", stroke: "#2F6FA6" },
  { name: "mars", r: 21, fill: "#F4BC80", stroke: "#E0954C" },
];

gf.layer([
  gf.background({ padding: 20, fill: "#252150", stroke: "none", rx: 16, ry: 16 }, [
    gf.spread(
      { dir: "x", spacing: 50, alignment: "middle" },
      data.map((d) =>
        gf
          .circle({ r: d.r, fill: d.fill, stroke: d.stroke, strokeWidth: 3 })
          .name(d.name)
      )
    ),
  ]),
])
  .relate(({ mercury }) => [
    gf.background(
      { padding: 10, stroke: "#E94560", strokeWidth: 3, rx: 12, ry: 12 },
      [
        gf.spread({ dir: "y", spacing: 20, alignment: "middle" }, [
          gf.text({ text: "Mercury", fill: "#E94560", fontSize: 14 }),
          mercury,
        ]),
      ]
    ),
  ])
  .render(root);
```

:::

Mercury now sits inside two boxes: the dark one around the row, and the red one
around its label.

## Moving the label below Mercury

To move the label below Mercury, we swap the two children of the column:

::: gofish

```js{25-26}
const data = [
  { name: "mercury", r: 15, fill: "#F5E3C8", stroke: "#EFC9A2" },
  { name: "venus", r: 36, fill: "#D2913C", stroke: "#A96F26" },
  { name: "earth", r: 38, fill: "#3E8CCC", stroke: "#2F6FA6" },
  { name: "mars", r: 21, fill: "#F4BC80", stroke: "#E0954C" },
];

gf.layer([
  gf.background({ padding: 20, fill: "#252150", stroke: "none", rx: 16, ry: 16 }, [
    gf.spread(
      { dir: "x", spacing: 50, alignment: "middle" },
      data.map((d) =>
        gf
          .circle({ r: d.r, fill: d.fill, stroke: d.stroke, strokeWidth: 3 })
          .name(d.name)
      )
    ),
  ]),
])
  .relate(({ mercury }) => [
    gf.background(
      { padding: 10, stroke: "#E94560", strokeWidth: 3, rx: 12, ry: 12 },
      [
        gf.spread({ dir: "y", spacing: 20, alignment: "middle" }, [
          mercury,
          gf.text({ text: "Mercury", fill: "#E94560", fontSize: 14 }),
        ]),
      ]
    ),
  ])
  .render(root);
```

:::

## Taking the box out of the column

Right now the red box holds the column, and the column holds Mercury and the
label. Let's pull the box out so it stands on its own. We name the label, and
we give `background()` references to Mercury and the label instead of the
column. The label was made inside `.relate()`, so it isn't one of the names
`.relate()` hands us. `gf.ref("label")` refers to it by name instead:

::: gofish

```js{23,25-28}
const data = [
  { name: "mercury", r: 15, fill: "#F5E3C8", stroke: "#EFC9A2" },
  { name: "venus", r: 36, fill: "#D2913C", stroke: "#A96F26" },
  { name: "earth", r: 38, fill: "#3E8CCC", stroke: "#2F6FA6" },
  { name: "mars", r: 21, fill: "#F4BC80", stroke: "#E0954C" },
];

gf.layer([
  gf.background({ padding: 20, fill: "#252150", stroke: "none", rx: 16, ry: 16 }, [
    gf.spread(
      { dir: "x", spacing: 50, alignment: "middle" },
      data.map((d) =>
        gf
          .circle({ r: d.r, fill: d.fill, stroke: d.stroke, strokeWidth: 3 })
          .name(d.name)
      )
    ),
  ]),
])
  .relate(({ mercury }) => [
    gf.spread({ dir: "y", spacing: 20, alignment: "middle" }, [
      mercury,
      gf.text({ text: "Mercury", fill: "#E94560", fontSize: 14 }).name("label"),
    ]),
    gf.background(
      { padding: 10, stroke: "#E94560", strokeWidth: 3, rx: 12, ry: 12 },
      [mercury, gf.ref("label")]
    ),
  ])
  .render(root);
```

:::

The picture didn't change. `background()` doesn't have to hold its children
itself. Given references, it draws a box around marks that were placed
somewhere else.

## Swapping the box for an arrow

Now that the box stands on its own, we can swap it for an arrow. `arrow()` takes
two children and draws an arrow from the first to the second:

::: gofish

```js{25}
const data = [
  { name: "mercury", r: 15, fill: "#F5E3C8", stroke: "#EFC9A2" },
  { name: "venus", r: 36, fill: "#D2913C", stroke: "#A96F26" },
  { name: "earth", r: 38, fill: "#3E8CCC", stroke: "#2F6FA6" },
  { name: "mars", r: 21, fill: "#F4BC80", stroke: "#E0954C" },
];

gf.layer([
  gf.background({ padding: 20, fill: "#252150", stroke: "none", rx: 16, ry: 16 }, [
    gf.spread(
      { dir: "x", spacing: 50, alignment: "middle" },
      data.map((d) =>
        gf
          .circle({ r: d.r, fill: d.fill, stroke: d.stroke, strokeWidth: 3 })
          .name(d.name)
      )
    ),
  ]),
])
  .relate(({ mercury }) => [
    gf.spread({ dir: "y", spacing: 20, alignment: "middle" }, [
      mercury,
      gf.text({ text: "Mercury", fill: "#E94560", fontSize: 14 }).name("label"),
    ]),
    gf.arrow({ stroke: "#E94560" }, [gf.ref("label"), mercury]),
  ])
  .render(root);
```

:::

`arrow()` has a lot in common with `background()`. Both are operators that draw a
shape worked out from other marks. `background()` draws a box around its children,
and `arrow()` draws an arrow from one child to the other.

## Splitting the column into two rules

What if we want the label below the whole dark background? We could raise the
`spacing` until the label clears it, but then we'd have to fix that number
whenever the planets or the background changed size.

Instead, we'll split the column into the two jobs it does. A `spread` **aligns**
its children, which here centers the label on Mercury. It also **distributes**
them, which here puts the label 20 pixels below Mercury. We can write these two
jobs as two separate **constraints**. A constraint is a rule that ties marks
together during layout.

::: gofish

```js{19,21-24}
const data = [
  { name: "mercury", r: 15, fill: "#F5E3C8", stroke: "#EFC9A2" },
  { name: "venus", r: 36, fill: "#D2913C", stroke: "#A96F26" },
  { name: "earth", r: 38, fill: "#3E8CCC", stroke: "#2F6FA6" },
  { name: "mars", r: 21, fill: "#F4BC80", stroke: "#E0954C" },
];

gf.layer([
  gf.background({ padding: 20, fill: "#252150", stroke: "none", rx: 16, ry: 16 }, [
    gf.spread(
      { dir: "x", spacing: 50, alignment: "middle" },
      data.map((d) =>
        gf
          .circle({ r: d.r, fill: d.fill, stroke: d.stroke, strokeWidth: 3 })
          .name(d.name)
      )
    ),
  ]),
  gf.text({ text: "Mercury", fill: "#E94560", fontSize: 14 }).name("label"),
])
  .relate(({ mercury, label }) => [
    gf.Constraint.align({ x: "middle" }, [mercury, label]),
    gf.Constraint.distribute({ dir: "y", spacing: 20 }, [mercury, label]),
    gf.arrow({ stroke: "#E94560" }, [label, mercury]),
  ])
  .render(root);
```

:::

The picture is the same again. The label is now a mark of the layer, so
`.relate()` hands it to us as `label`, next to `mercury`. We return two
constraints and the arrow. `Constraint.align` lines up the centers of Mercury
and the label from left to right, and `Constraint.distribute` puts the label 20
pixels below Mercury.

The layer places the label with the constraints first, and draws the arrow
after that, so the arrow starts from wherever the label ends up.

## Spacing the label off the whole background

Now each rule can point at a different mark. We name the dark background
`"planets"` and distribute the label from the background instead of from
Mercury:

::: gofish

```js{20,23,25}
const data = [
  { name: "mercury", r: 15, fill: "#F5E3C8", stroke: "#EFC9A2" },
  { name: "venus", r: 36, fill: "#D2913C", stroke: "#A96F26" },
  { name: "earth", r: 38, fill: "#3E8CCC", stroke: "#2F6FA6" },
  { name: "mars", r: 21, fill: "#F4BC80", stroke: "#E0954C" },
];

gf.layer([
  gf
    .background({ padding: 20, fill: "#252150", stroke: "none", rx: 16, ry: 16 }, [
      gf.spread(
        { dir: "x", spacing: 50, alignment: "middle" },
        data.map((d) =>
          gf
            .circle({ r: d.r, fill: d.fill, stroke: d.stroke, strokeWidth: 3 })
            .name(d.name)
        )
      ),
    ])
    .name("planets"),
  gf.text({ text: "Mercury", fill: "#E94560", fontSize: 14 }).name("label"),
])
  .relate(({ mercury, planets, label }) => [
    gf.Constraint.align({ x: "middle" }, [mercury, label]),
    gf.Constraint.distribute({ dir: "y", spacing: 20 }, [planets, label]),
    gf.arrow({ stroke: "#E94560" }, [label, mercury]),
  ])
  .render(root);
```

:::

The label is still centered on Mercury, but now it sits below the whole
background, and the arrow crosses the edge of the background to reach Mercury.
A single `spread` can't do this, because it aligns and distributes the same
marks. With two constraints, the label lines up with one mark and keeps its
distance from another.

## Where next

- [**Pictorial Charts**](/js/tutorials/pictorial-charts) uses names and
  constraints inside a chart.
- [**`relate`**](/js/api/constraints/relate) lists every constraint and
  what else `.relate()` can draw.
- [**How to name and scope**](/js/api/howto/naming-and-scoping) explains how
  names work once you build reusable marks of your own.
- The [**Python Tutor memory diagram**](/js/examples/python-tutor-memory-diagram)
  is a bigger diagram built from the same pieces.
