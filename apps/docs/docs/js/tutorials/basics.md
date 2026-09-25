# Basics

GoFish graphics are made of two kinds of things: **marks** that render shapes like circles, lines, and compound shapes, and **operators** that take two or more marks and compose them into a new mark, putting them in a row for instance. Both charts and diagrams are composed with marks and operators. In this tutorial we will get our first taste of these concepts. Afterwards, you can complete the [Charts tutorial](/js/tutorials/charts) or the [Diagrams tutorial](/js/tutorials/diagrams) in either order.

## The `rect` mark

A mark is a function call that takes an object of attributes. For example, the `rect()` mark draws a rectangle. You can give it a width, a height, and a fill color (among other things):

```js
gf.rect({ w: 150, h: 44, fill: "#e2ebf6" });
```

To render it, you can call the `render` method with a root HTML container and the width and height you want for the GoFish graphic:

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

## Layering marks

Just like marks, operators are also function calls. The simplest way to compose two marks is to layer them on top of each other using the `layer()` operator.

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
edge of the blue one and looks like a border. But this is just a coincidence! Nothing in the code above describes the placement of the rectangles relative to each other.

## Placing marks side by side: `spread`

GoFish provides a standard library of operators that lay out child marks. A common operator is `spread()`, which places its children in a row or column. Just like a mark, an operator can take an object of attributes that customize its appearance. The `dir` attribute specifies the direction of the spread, `"x"` for a row and `"y"` for a column. `spacing` is the gap between neighboring children in pixels.

::: gofish

```js
gf.spread({ dir: "x", spacing: 10 }, [
  gf.rect({ w: 40, h: 40, fill: "#e63946" }),
  gf.rect({ w: 40, h: 40, fill: "#457b9d" }),
  gf.rect({ w: 40, h: 40, fill: "#2a9d8f" }),
]).render(root, { w: 220, h: 80 });
```

:::

## Data-driven graphics

Instead of defining all our marks manually, we can specify their properties using some data! To do so, we can define a small dataset and use JavaScript's map function to programmatically generate some rectangles. The `d` variable inside the `map` takes on one value of the `data` array at a time.

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

The `alignment` attribute on `spread()` specifies that its children should be end-aligned, which in this case means to their bottom edges.

(We'll see how to describe a bar chart more simply in the charts tutorial.)

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
