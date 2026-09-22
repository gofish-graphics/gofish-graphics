# Charts and Diagrams

Most visualization libraries are built for charts, and most diagramming
libraries are built for diagrams. GoFish draws both, and it does so without
having two engines inside it. There is one substrate and there are two ways in.

The substrate is marks and operators. A **mark** is a shape that can draw
itself: a rectangle, an ellipse, a piece of text, an image. An **operator**
arranges a family of children: put them in a row, stack them flush, lay them
one on top of another. Every picture on this site is made of those two things,
and both kinds of thing can draw themselves on their own with
`.render(container, { w, h })`. No dataset is required, and no chart is
required.

The two ways in are `chart()` and `createMark`. Neither is a different
language. Each adds one layer of machinery on top of the substrate, and the
two layers solve different problems.

## The same construction, twice

Here is a row of rectangles whose heights come from a dataset, written with no
chart at all. The array of children is built with `map`, and the height of each
rectangle is a number the author worked out.

::: gofish

```js
const fruit = [
  { name: "apple", count: 12 },
  { name: "pear", count: 7 },
  { name: "plum", count: 19 },
  { name: "fig", count: 4 },
];

gf.spread(
  { dir: "x", spacing: 10, alignment: "end" },
  fruit.map((d) => gf.rect({ w: 30, h: d.count * 8, fill: "#a8b8d8" }))
).render(root, { w: 220, h: 180 });
```

:::

It is a bar chart in every respect except one. The factor of eight is a magic
number. It was chosen so the bars fit, and it stops being right the moment the
data changes or the drawing surface does.

Now the same picture through `chart()`.

::: gofish

```js
const fruit = [
  { name: "apple", count: 12 },
  { name: "pear", count: 7 },
  { name: "plum", count: 19 },
  { name: "fig", count: 4 },
];

gf.chart(fruit)
  .flow(gf.spread({ by: "name", dir: "x", spacing: 10 }))
  .mark(gf.rect({ w: 30, h: "count", fill: "#a8b8d8" }))
  .render(root, { w: 260, h: 200, axes: true });
```

:::

Nothing structural changed. It is the same `spread` and the same `rect`. What
changed is that the number is gone. `h: "count"` names a field instead of
computing pixels, the factor of eight is now a scale that the layout solves
for, and because a scale exists there is something to draw an axis from.

## What `chart()` adds

Three things, all about data.

**Scales.** A mark channel can name a field, and the pixels come out of a solve
rather than out of your arithmetic. This is the part that makes a chart resize
honestly.

**Axes and legends.** These are not decoration bolted on at the end. They are
the drawn form of a scale that exists, which is why turning a scale off turns
its axis off with it.

**The field pipeline.** `.flow()` is where the data is grouped, sorted, binned,
derived and partitioned before any mark sees it. Operators inside a flow take a
`by` field and split the stream, so the same `spread` that took an array of
children above now takes a field name and makes the array itself.

## What `createMark` adds

One thing, and it is about structure: a component boundary.

A function that returns a node is already reusable. Wrapping it in
`createMark` makes it a **scope**, which is what lets ten copies of a component
each have a child called `box` without colliding, and what lets the caller give
an instance a handle it can point an arrow at. That is the subject of
[Names and Scope](/js/concepts/names-and-scope).

With scopes in hand, constraints and refs become usable at scale. A constraint
relates two named siblings. A ref reaches a named node from somewhere else in
the picture. Both need names that mean something specific, and a component
boundary is what makes a name specific.

One practical seam is worth knowing. The body of a `createMark` function has to
return a node, so it uses the capitalized operators `Layer`, `Spread` and
`Stack`. The lowercase `layer`, `spread` and `stack` are the chart-side
spelling and return a mark. Shapes like `rect` and `text` have one spelling and
work in both places.

## Neither is a layer on top of the other

It would be tidy to say that diagrams are the low level and charts are built on
them, or the reverse. Neither is true, and the tutorials are the demonstration.

The [Charts](/js/tutorials/charts) tutorial and the
[Diagrams](/js/tutorials/diagrams) tutorial both start from
[Basics](/js/tutorials/basics) and neither depends on the other. You can read
them in either order. A bar chart and a memory diagram are the same
construction, a family of boxes arranged by an operator, right up to the point
where one of them adds a scale and the other adds an arrow.

The diagram examples in the repository make the point from the other side.
The Python Tutor memory diagram, and the rest of the ported Bluefish figures,
do not call `chart()` anywhere. They are marks, operators, components,
constraints and refs, and nothing is missing.

## Why there is no separate charts package

A reasonable person looks at this and proposes splitting the library: a small
graphics core, and a charting package on top of it that people who only want
charts can depend on.

The proposal does not survive contact with the boundary. Draw the line and ask
what ends up on the charting side. Marks are shared. Operators are shared.
Names, constraints, refs, coordinate transforms, layout and rendering are all
shared. What is left over is `chart()` itself, the field pipeline it carries,
and whatever chart templates get written. That is a thin slice, and every one
of its pieces is defined in terms of the substrate underneath it.

Meanwhile the cost of the split is not thin. A boundary has to be maintained in
both directions, kept stable as a public interface, and versioned. It would
also make the interesting cases, the ones where a chart contains a hand-built
glyph, into a cross-package dependency, which is exactly the arrangement that
discourages people from trying it.

So the split is not drawn. The judgment is that the shared part is nearly
everything, and a boundary that separates almost nothing is not worth what it
costs.

## Which one to reach for

Start with `chart()` when the picture is driven by a table and the numbers set
positions or sizes. Scales, axes and the flow pipeline are the work you would
otherwise do by hand, and doing it by hand goes stale.

Start with `createMark` when the picture is driven by structure and the parts
point at each other. Nodes, cells, frames, boxes and arrows are relations, not
measurements, and constraints say relations directly.

Many real pictures are both, and mixing them is not a special mode. A
`createMark` component can be a chart's mark, and a chart can appear inside a
hand-built composition. [Pictorial Charts](/js/tutorials/pictorial-charts)
works through one: `chart()` and `spread()` decide where each bottle goes and
how full it is, while inside each bottle a set of names and constraints holds
the fill, the fill line and the label together. Neither half knows the other
half is unusual, because neither half is.

## Where next

- [Basics](/js/tutorials/basics) for the shared substrate from scratch.
- [Charts](/js/tutorials/charts) and [Diagrams](/js/tutorials/diagrams) for the
  two branches, in either order.
- [chart](/js/api/core/chart) and [mark](/js/api/core/mark) for the builder
  signatures, and [how to name and scope](/js/api/howto/naming-and-scoping) for
  `createMark`.
