# Basics

Everything in GoFish is built out of two kinds of things: **marks** and
**operators**. A mark is a shape, like a rectangle or a piece of text. An
operator arranges other things, like putting them in a row or stacking them.

Marks and operators are shared by every kind of picture GoFish can draw. Charts
use them. Diagrams use them. This page teaches the shared part. When you finish
it you can go on to the [Charts tutorial](/js/tutorials/charts) or the
[Diagrams tutorial](/js/tutorials/diagrams), in either order.

You do not need a dataset, a scale, or an axis to draw something. You do not
even need `chart()`. Every mark and every operator can draw itself with
`.render(container, { w, h })`.

## One shape

`rect()` makes a rectangle. Give it a width, a height, and a fill color, then
render it into a DOM element.

::: gofish

```js
gf.rect({ w: 150, h: 44, fill: "#e2ebf6" }).render(root, { w: 200, h: 80 });
```

:::

`root` here is the DOM element the picture is drawn into. In your own code you
would write something like `document.getElementById("chart")`.

The second argument to `.render()` is the size of the drawing surface in
pixels. If you leave `w` or `h` out, GoFish works out a size that fits the
content.

## Two shapes at the same place

`layer()` takes an array of children and draws them all at the same spot, one
on top of the other, in the order you wrote them. The layer is as big as the
union of its children.

::: gofish

```js
gf.layer([
  gf.rect({ w: 150, h: 44, fill: "#e2ebf6" }),
  gf.rect({ w: 150, h: 4, fill: "#a6b3b6" }),
]).render(root, { w: 200, h: 80 });
```

:::

Both rectangles start at the same corner, so the thin gray one lands on the top
edge of the blue one and reads as a border.

## Side by side: `spread` and `stack`

`spread()` puts its children in a row. `dir` picks the direction, `"x"` for a
row and `"y"` for a column, and `spacing` is the gap between neighbors in
pixels.

::: gofish

```js
gf.spread({ dir: "x", spacing: 10 }, [
  gf.rect({ w: 40, h: 40, fill: "#e63946" }),
  gf.rect({ w: 40, h: 40, fill: "#457b9d" }),
  gf.rect({ w: 40, h: 40, fill: "#2a9d8f" }),
]).render(root, { w: 220, h: 80 });
```

:::

`stack()` does the same thing with no gap. The children touch, which is what
you want for a stacked bar or a row of table cells.

::: gofish

```js
gf.stack({ dir: "x" }, [
  gf.rect({ w: 40, h: 40, fill: "#e63946" }),
  gf.rect({ w: 40, h: 40, fill: "#457b9d" }),
  gf.rect({ w: 40, h: 40, fill: "#2a9d8f" }),
]).render(root, { w: 220, h: 80 });
```

:::

That is the whole difference: `spread` leaves space between children, `stack`
glues them together.

Both also take an `alignment` option, which says how to line the children up on
the other axis. `"start"` is the top edge of a row, `"end"` is the bottom edge,
and `"middle"` is the center.

## Data

Nothing so far knew about data. An operator takes a plain array of children, so
you can build that array with `Array.prototype.map` and read whatever you like
off your own objects.

::: gofish

```js
const data = [
  { label: "x", value: 5 },
  { label: "y", value: 8 },
  { label: "z", value: 3 },
];

gf.spread(
  { dir: "x", spacing: 10, alignment: "end" },
  data.map((d) => gf.rect({ w: 30, h: d.value * 12, fill: "#4c78a8" }))
).render(root, { w: 200, h: 120 });
```

:::

This is already a bar chart in every way except one: the heights are in pixels,
because we multiplied by 12 ourselves. Handing that job to a scale is exactly
what `chart()` does, and that is the subject of the Charts tutorial.

## Text

`text()` draws a string. It measures the string, so the operator around it
knows how wide it is and can lay it out like any other mark.

::: gofish

```js
const data = [
  { label: "x", value: 5 },
  { label: "y", value: 8 },
  { label: "z", value: 3 },
];

gf.spread(
  { dir: "x", spacing: 10, alignment: "end" },
  data.map((d) =>
    gf.spread({ dir: "y", spacing: 4, alignment: "middle" }, [
      gf.text({ text: d.label, fontSize: 14 }),
      gf.rect({ w: 30, h: d.value * 12, fill: "#4c78a8" }),
    ])
  )
).render(root, { w: 200, h: 140 });
```

:::

Operators nest. Each bar here is its own little column of a label and a
rectangle, and the outer `spread` arranges those columns.

## Putting a label inside a box

Children of a `layer` all sit at the same corner, so a label dropped into a box
lands in the top left, not the middle. To center it, name the two children and
add an **alignment constraint**, which is a rule that ties two nodes together
during layout.

::: gofish

```js
const data = [
  { label: "x", value: 5 },
  { label: "y", value: 8 },
  { label: "z", value: 3 },
];

const labeledBox = (d) =>
  gf
    .layer([
      gf.rect({ w: 150, h: 44, fill: "#e2ebf6" }).name("box"),
      gf
        .text({
          text: `${d.label} = ${d.value}`,
          fontSize: 20,
          fontFamily: "Andale Mono, monospace",
        })
        .name("label"),
    ])
    .constrain(({ box, label }) => [
      gf.Constraint.align({ x: "middle", y: "middle" }, [box, label]),
    ]);

gf.spread(
  { dir: "y", spacing: 8, alignment: "middle" },
  data.map(labeledBox)
).render(root, { w: 150, h: 160 });
```

:::

`.name("box")` gives a child a name that its own layer can see. `.constrain()`
receives those names and returns a list of constraints. Here
`Constraint.align({ x: "middle", y: "middle" }, [box, label])` says the two
nodes share a center point.

Names and constraints are the backbone of hand made diagrams, and the Diagrams
tutorial builds on them.

## Where next

This page is the only thing either branch depends on. Take whichever one you
want first.

- [**Charts**](/js/tutorials/charts). Wrap it in `chart(data)` to get scales and
  axes. The same `spread` and `rect` you used above become a bar chart whose
  heights come from the data instead of from a magic number.
- [**Diagrams**](/js/tutorials/diagrams). Wrap it in `createMark` and add refs
  and arrows. The labeled box above becomes a reusable component, and arrows
  connect one component to another.
