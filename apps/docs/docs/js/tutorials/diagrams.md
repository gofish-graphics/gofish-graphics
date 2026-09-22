# Diagrams

A diagram is a picture whose parts are named and whose parts point at each
other. There is no dataset to scale and no axis to draw, so there is no
`chart()` here. You build a diagram out of the same marks and operators from
the [Basics tutorial](/js/tutorials/basics), plus three more ideas:
components, names, and arrows.

By the end of this page you will have built a Python Tutor style memory
diagram: a global frame of variables on the left, a heap of tuples on the
right, and arrows from the variables to the objects they point at.

## Components with `createMark`

Here is the labeled box from the Basics tutorial, one more time.

::: gofish

```js
gf.spread(
  { dir: "y", spacing: 8, alignment: "middle" },
  [
    { variable: "x", value: "5" },
    { variable: "y", value: "8" },
  ].map((d) =>
    gf
      .layer([
        gf.rect({ w: 150, h: 44, fill: "#e2ebf6" }).name("box"),
        gf
          .text({ text: `${d.variable} = ${d.value}`, fontSize: 20 })
          .name("label"),
      ])
      .constrain(({ box, label }) => [
        gf.Constraint.align({ x: "middle", y: "middle" }, [box, label]),
      ])
  )
).render(root, { w: 160, h: 120 });
```

:::

The row is written inline, so it cannot be reused and it cannot be referred to
from anywhere else. `createMark` fixes both. It takes a function from props to
a node and gives you back a mark you call like `rect()` or `text()`.

::: gofish

```js
const slot = gf.createMark(({ variable, value }) =>
  gf
    .Layer([
      gf.rect({ w: 150, h: 44, fill: "#e2ebf6" }).name("box"),
      gf.text({ text: `${variable} = ${value}`, fontSize: 20 }).name("label"),
    ])
    .constrain(({ box, label }) => [
      gf.Constraint.align({ x: "middle", y: "middle" }, [box, label]),
    ])
);

gf.Spread({ dir: "y", spacing: 8, alignment: "middle" }, [
  slot({ variable: "x", value: "5" }),
  slot({ variable: "y", value: "8" }),
]).render(root, { w: 160, h: 120 });
```

:::

::: warning Capitalized operators inside `createMark`
The body of a `createMark` function has to return a node, so use the
capitalized operators `Layer`, `Spread` and `Stack` there. The lowercase
`layer`, `spread` and `stack` are the chart flavor: they return a mark, and
`createMark` cannot take one. Shapes like `rect` and `text` have only one
spelling and work in both places.
:::

Two things come with `createMark` for free. A component is a **scope**, which
means the names inside one instance never collide with the names inside
another, so ten slots can all have a child called `box`. And a component can be
given a name of its own by the code that uses it, which is what makes arrows
possible.

[How to create a glyph](/js/api/howto/create-glyph) covers the same territory
from the chart side, including passing a component to `.mark()`.

## Composing components

A component can use other components. A global frame is a title, a background
panel, and a column of slots.

Slots in a real memory diagram have the variable name outside the box and the
value inside it, so here is a slightly richer `slot`. A pointer variable has no
printed value, so its box stays empty and the arrow supplies the meaning.

::: gofish

```js
const mono = "Andale Mono, monospace";

const slot = gf.createMark(({ variable, value }) => {
  const valueTag = gf.createName("value");
  return gf.Spread({ dir: "x", alignment: "middle", spacing: 5 }, [
    gf.text({ text: variable, fontSize: 20, fontFamily: mono }),
    gf
      .Layer([
        gf
          .rect({
            w: 44,
            h: 44,
            fill: "#f7fbff",
            stroke: "#a6b3b6",
            strokeWidth: 1,
          })
          .name("box"),
        value === undefined
          ? gf.text({ text: "", fill: "none", fontSize: 20 }).name(valueTag)
          : gf
              .text({ text: value, fontSize: 20, fontFamily: mono })
              .name(valueTag),
      ])
      .constrain(({ box, value }) => [
        gf.Constraint.align({ x: "middle", y: "middle" }, [box, value]),
      ]),
  ]);
});

const frame = gf.createMark(({ stack }) => {
  const slotsTag = gf.createName("slots");
  return gf
    .Layer([
      gf.rect({ w: 170, h: 180, fill: "#e2ebf6" }).name("frame"),
      gf
        .text({ text: "Global frame", fontSize: 16, fontFamily: mono })
        .name("title"),
      gf
        .Spread(
          { dir: "y", alignment: "end", spacing: 10 },
          stack.map((s) => slot(s))
        )
        .name(slotsTag),
    ])
    .constrain(({ title, frame, slots }) => [
      gf.Constraint.align({ x: "middle", y: "start" }, [title, frame]),
      gf.Constraint.align({ x: "end" }, [slots, title]),
      gf.Constraint.distribute({ dir: "y", spacing: 12 }, [title, slots]),
    ]);
});

frame({
  stack: [{ variable: "c" }, { variable: "x", value: "5" }],
}).render(root, { w: 180, h: 190 });
```

:::

Three constraints hold the frame together. The first centers the title on the
panel and pins it to the panel's top edge. The second puts the right edge of
the column of slots where the right edge of the title is. The third places the
column 12 pixels below the title. `Constraint.distribute` is the sibling of
`Constraint.align`: align matches an edge or a center, distribute sets the gap
along a direction.

::: tip Which way is "start"?
GoFish's free space runs downward, the way SVG does, so on the y axis `"start"`
is the top edge and `"end"` is the bottom edge.
:::

The heap side is the same shape of code. A cell is an index label and a value
in a yellow box, and a heap object is a row of cells under a type label.

::: gofish

```js
const mono = "Andale Mono, monospace";

const cell = gf.createMark(({ index, value }) => {
  const valTag = gf.createName("val");
  return gf
    .Layer([
      gf
        .rect({
          w: 60,
          h: 50,
          fill: "#ffffc6",
          stroke: "gray",
          strokeWidth: 1,
        })
        .name("box"),
      gf
        .text({ text: String(index), fontSize: 12, fill: "gray" })
        .name("index"),
      gf
        .text({ text: value ?? "", fontSize: 20, fontFamily: mono })
        .name(valTag),
    ])
    .constrain(({ box, index, val }) => [
      gf.Constraint.align({ x: "middle", y: "middle" }, [val, box]),
      gf.Constraint.align({ x: "start", y: "start" }, [index, box]),
    ]);
});

const heapObject = gf.createMark(({ values }) => {
  const cellsTag = gf.createName("cells");
  return gf.Spread({ dir: "y", alignment: "start", spacing: 6 }, [
    gf.text({ text: "tuple", fontSize: 14, fill: "gray" }),
    gf
      .Spread(
        { dir: "x", spacing: 0 },
        values.map((value, index) => cell({ index, value }))
      )
      .name(cellsTag),
  ]);
});

heapObject({ values: ["12", undefined, "1"] }).render(root, { w: 200, h: 100 });
```

:::

The cells are laid out with `Spread` at zero spacing so their borders meet.
`Stack` would do the same job.

## Names you can reach from outside

Both components above use two kinds of name, and the difference matters as soon
as you draw an arrow.

- `.name("box")` with a **string** is local to the enclosing `Layer`. Its only
  job is to show up in that layer's `.constrain()` callback.
- `.name(tag)` with a **token** from `createName("value")` is addressable from
  outside. The node registers under that tag in the nearest enclosing
  component, so code elsewhere can walk down to it.

That is why `slot` tags its value text with `createName("value")` while its
`box` is a plain string: only the value text is ever pointed at from outside.

[How to name and scope](/js/api/howto/naming-and-scoping) has the full rules,
including the reserved property names and the array form of a path.

## Arrows

`ref()` starts a path, and `Arrow` takes two of them. Property access walks
down by tag and index access picks a positional child, so
`ref(frameName).slots[0].value` reads as "the `value` of the first thing in
`slots`, inside the component called `frameName`".

The arrow goes in a `Layer` beside the thing it annotates, not inside it,
because it needs to see both endpoints.

::: gofish

```js
const mono = "Andale Mono, monospace";

const slot = gf.createMark(({ variable, value }) => {
  const valueTag = gf.createName("value");
  return gf.Spread({ dir: "x", alignment: "middle", spacing: 5 }, [
    gf.text({ text: variable, fontSize: 20, fontFamily: mono }),
    gf
      .Layer([
        gf
          .rect({
            w: 44,
            h: 44,
            fill: "#f7fbff",
            stroke: "#a6b3b6",
            strokeWidth: 1,
          })
          .name("box"),
        value === undefined
          ? gf.text({ text: "", fill: "none", fontSize: 20 }).name(valueTag)
          : gf
              .text({ text: value, fontSize: 20, fontFamily: mono })
              .name(valueTag),
      ])
      .constrain(({ box, value }) => [
        gf.Constraint.align({ x: "middle", y: "middle" }, [box, value]),
      ]),
  ]);
});

const frame = gf.createMark(({ stack }) => {
  const slotsTag = gf.createName("slots");
  return gf
    .Layer([
      gf.rect({ w: 170, h: 180, fill: "#e2ebf6" }).name("frame"),
      gf
        .text({ text: "Global frame", fontSize: 16, fontFamily: mono })
        .name("title"),
      gf
        .Spread(
          { dir: "y", alignment: "end", spacing: 10 },
          stack.map((s) => slot(s))
        )
        .name(slotsTag),
    ])
    .constrain(({ title, frame, slots }) => [
      gf.Constraint.align({ x: "middle", y: "start" }, [title, frame]),
      gf.Constraint.align({ x: "end" }, [slots, title]),
      gf.Constraint.distribute({ dir: "y", spacing: 12 }, [title, slots]),
    ]);
});

const cell = gf.createMark(({ index, value }) => {
  const valTag = gf.createName("val");
  return gf
    .Layer([
      gf
        .rect({ w: 60, h: 50, fill: "#ffffc6", stroke: "gray", strokeWidth: 1 })
        .name("box"),
      gf
        .text({ text: String(index), fontSize: 12, fill: "gray" })
        .name("index"),
      gf
        .text({ text: value ?? "", fontSize: 20, fontFamily: mono })
        .name(valTag),
    ])
    .constrain(({ box, index, val }) => [
      gf.Constraint.align({ x: "middle", y: "middle" }, [val, box]),
      gf.Constraint.align({ x: "start", y: "start" }, [index, box]),
    ]);
});

const heapObject = gf.createMark(({ values }) => {
  const cellsTag = gf.createName("cells");
  return gf.Spread({ dir: "y", alignment: "start", spacing: 6 }, [
    gf.text({ text: "tuple", fontSize: 14, fill: "gray" }),
    gf
      .Spread(
        { dir: "x", spacing: 0 },
        values.map((value, index) => cell({ index, value }))
      )
      .name(cellsTag),
  ]);
});

const frameName = gf.createName("frame");
const heapName = gf.createName("heap");

gf.Layer([
  gf.Spread({ dir: "x", alignment: "start", spacing: 90 }, [
    frame({
      stack: [{ variable: "c" }, { variable: "x", value: "5" }],
    }).name(frameName),
    heapObject({ values: ["12", "7", "1"] }).name(heapName),
  ]),
  gf.Arrow({ bow: 0, stretch: 0, flip: true, padStart: 0, stroke: "#1a5683" }, [
    gf.ref(frameName).slots[0].value,
    gf.ref(heapName).cells[0],
  ]),
]).render(root, { w: 460, h: 220 });
```

:::

`createName` is called here at the top level, by the code that uses the
components, rather than inside them. That is the pattern for a handle: the
caller makes the token, hands it to the instance with `.name(token)`, and then
uses it as the first segment of every path into that instance.

The arrow options are all about shape. `bow: 0` and `stretch: 0` make it a
straight line instead of a curve, `flip: true` puts the curve on the other
side, and `padStart: 0` lets the tail touch its source instead of standing off
from it.

## The whole diagram

Scale that up and you get the real thing. The finished example uses a list of
bindings and a grid of heap addresses instead of hand written arguments, and
it generates one arrow per pointer, but every piece is something from this
page.

::: gofish story:bluefish-python-tutor-python-tutor--pythontutor hidden
:::

The source lives in
`packages/gofish-graphics/stories/bluefish/PythonTutor/`, one file per
component. Two things there are worth a look once you have read this page. The
heap is a grid, so its arrow paths use `ref(heapName).path(row, col)`, the
variadic form of a path. And every arrow is derived from the data, by mapping
over the bindings and keeping only the pointers, so the picture and the memory
state can never drift apart.

## Where next

- [How to name and scope](/js/api/howto/naming-and-scoping) for the full rules
  on strings, tokens and paths.
- [How to create a glyph](/js/api/howto/create-glyph) for using a component as
  a chart mark.
- [Charts](/js/tutorials/charts) if you have not read it yet. It depends only
  on [Basics](/js/tutorials/basics), same as this page.
