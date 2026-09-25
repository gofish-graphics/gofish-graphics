# Basics

GoFish graphics are made of two kinds of things: **marks** that render shapes like circles, lines, and compound shapes, and **operators** that take two or more marks and compose them into a new mark, putting them in a row for instance. Both charts and diagrams are composed with marks and operators. In this tutorial we will get our first taste of these concepts. Afterwards, you can complete the [Charts tutorial](/js/tutorials/charts) or the [Diagrams tutorial](/js/tutorials/diagrams) in either order.

We'll build this diagram of the four planets closest to the sun, one small step at a time:

::: gofish story:tutorials-basics--basics hidden
:::

## The `circle` mark

A mark is a function call that takes an object of attributes. For example, the `circle()` mark draws a circle. You can give it a radius, a fill color, and an outline (among other things):

```js
gf.circle({ r: 15, fill: "#F5E3C8", stroke: "#EFC9A2", strokeWidth: 3 });
```

`r` is the radius in pixels. `stroke` is the color of the outline, and `strokeWidth` is how thick it is.

To render it, you can call the `render` method with a root HTML container and the width and height you want for the GoFish graphic:

::: gofish

```js
gf.circle({ r: 15, fill: "#F5E3C8", stroke: "#EFC9A2", strokeWidth: 3 }).render(
  root,
  { w: 30, h: 30 }
);
```

:::

`root` here is the DOM element the picture is drawn into. In your own code you
would write something like `document.getElementById("chart")`.

The second argument to `.render()` is the size of the drawing surface in
pixels. If you leave `w` or `h` out, GoFish works out a size that fits the
content.

This circle is Mercury. Next we'll add the other three planets.

## Layering marks

Just like marks, operators are also function calls. The simplest way to compose two marks is to layer them on top of each other using the `layer()` operator.

`layer()` takes an array of children and draws them all at the same spot, one
on top of the other, in the order you wrote them. The layer is as big as the
union of its children.

::: gofish

```js
gf.layer([
  gf.circle({ r: 15, fill: "#F5E3C8", stroke: "#EFC9A2", strokeWidth: 3 }),
  gf.circle({ r: 36, fill: "#D2913C", stroke: "#A96F26", strokeWidth: 3 }),
  gf.circle({ r: 38, fill: "#3E8CCC", stroke: "#2F6FA6", strokeWidth: 3 }),
  gf.circle({ r: 21, fill: "#F4BC80", stroke: "#E0954C", strokeWidth: 3 }),
]).render(root, { w: 80, h: 80 });
```

:::

All four circles start at the same corner, so they pile up on top of each other. Earth hides Venus, and Mars hides Mercury. Nothing in the code above describes the placement of the circles relative to each other.

## Placing marks side by side: `spread`

GoFish provides a standard library of operators that lay out child marks. A common operator is `spread()`, which places its children in a row or column. Just like a mark, an operator can take an object of attributes that customize its appearance. The `dir` attribute specifies the direction of the spread, `"x"` for a row and `"y"` for a column. `spacing` is the gap between neighboring children in pixels.

::: gofish

```js
gf.spread({ dir: "x", spacing: 50 }, [
  gf.circle({ r: 15, fill: "#F5E3C8", stroke: "#EFC9A2", strokeWidth: 3 }),
  gf.circle({ r: 36, fill: "#D2913C", stroke: "#A96F26", strokeWidth: 3 }),
  gf.circle({ r: 38, fill: "#3E8CCC", stroke: "#2F6FA6", strokeWidth: 3 }),
  gf.circle({ r: 21, fill: "#F4BC80", stroke: "#E0954C", strokeWidth: 3 }),
]).render(root, { w: 370, h: 76 });
```

:::

Now the planets are in a row, 50 pixels apart. But they are lined up along their top edges, so the small planets hang near the top of the row.

## Aligning marks

To fix that, we can add an `alignment` attribute to the `spread()`:

::: gofish

```js
gf.spread({ dir: "x", spacing: 50, alignment: "middle" }, [
  gf.circle({ r: 15, fill: "#F5E3C8", stroke: "#EFC9A2", strokeWidth: 3 }),
  gf.circle({ r: 36, fill: "#D2913C", stroke: "#A96F26", strokeWidth: 3 }),
  gf.circle({ r: 38, fill: "#3E8CCC", stroke: "#2F6FA6", strokeWidth: 3 }),
  gf.circle({ r: 21, fill: "#F4BC80", stroke: "#E0954C", strokeWidth: 3 }),
]).render(root, { w: 370, h: 76 });
```

:::

The `alignment` attribute on `spread()` specifies that its children should be middle-aligned, which in this case means their centers sit on one horizontal line. You can also use `"start"` to line up their top edges or `"end"` to line up their bottom edges.

## Data-driven graphics

Instead of defining all our marks manually, we can specify their properties using some data! To do so, we can define a small dataset and use JavaScript's map function to programmatically generate some circles. The `d` variable inside the `map` takes on one value of the `data` array at a time.

::: gofish

```js
const data = [
  { name: "mercury", r: 15, fill: "#F5E3C8", stroke: "#EFC9A2" },
  { name: "venus", r: 36, fill: "#D2913C", stroke: "#A96F26" },
  { name: "earth", r: 38, fill: "#3E8CCC", stroke: "#2F6FA6" },
  { name: "mars", r: 21, fill: "#F4BC80", stroke: "#E0954C" },
];

gf.spread(
  { dir: "x", spacing: 50, alignment: "middle" },
  data.map((d) =>
    gf.circle({ r: d.r, fill: d.fill, stroke: d.stroke, strokeWidth: 3 })
  )
).render(root, { w: 370, h: 76 });
```

:::

The picture is the same, but now the sizes and colors of the planets live in one place instead of in four copies of `circle()`.

(We'll see how to turn data into marks more simply in the charts tutorial.)

## Drawing a background

Some operators draw something of their own. `background()` is an operator that draws a box behind its children. The box is as big as the children, plus `padding` pixels on every side. Let's put the planets on a dark background:

::: gofish

```js
const data = [
  { name: "mercury", r: 15, fill: "#F5E3C8", stroke: "#EFC9A2" },
  { name: "venus", r: 36, fill: "#D2913C", stroke: "#A96F26" },
  { name: "earth", r: 38, fill: "#3E8CCC", stroke: "#2F6FA6" },
  { name: "mars", r: 21, fill: "#F4BC80", stroke: "#E0954C" },
];

gf.background(
  { padding: 20, fill: "#252150", stroke: "none", rx: 16, ry: 16 },
  [
    gf.spread(
      { dir: "x", spacing: 50, alignment: "middle" },
      data.map((d) =>
        gf.circle({ r: d.r, fill: d.fill, stroke: d.stroke, strokeWidth: 3 })
      )
    ),
  ]
).render(root, { w: 410, h: 116 });
```

:::

`fill` is the color of the box. The box gets a thin gray outline by default, so `stroke: "none"` turns it off. `rx` and `ry` round its corners.

Notice how the code mirrors the picture. The row of planets is inside the `background()` call, and it is drawn inside the box.

## Where next

This page is the only thing either branch depends on. Take whichever one you
want first.

- [**Charts**](/js/tutorials/charts). Wrap your data in `chart(data)` to get
  scales and axes. The same `spread` you used above becomes a bar chart whose
  bar heights come from the data.
- [**Diagrams**](/js/tutorials/diagrams). Label one of these planets and point
  an arrow at it. You'll see how a single planet can be part of the row and
  part of its label at the same time.
