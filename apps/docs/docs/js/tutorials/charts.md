---
handwritten: true
---

# Charts: From a Bar Chart to a Polar Ribbon

Welcome to GoFish! In this tutorial we'll start with a bar chart and gradually
turn it into a polar ribbon chart. Along the way, we'll encounter the pieces that make up a GoFish
chart: shapes, graphical operators, scales, and coordinate transforms.

::: tip Before you start
This tutorial assumes you've been through [Basics](/js/tutorials/basics), which
covers shapes and graphical operators.
:::

::: gofish example:polar-ribbon-chart hidden

To start, duplicate this tab to follow along in the live editor!

<!-- ```ts index.ts
// prettier-ignore
import { StackX, StackY, ConnectX, rect, ref, For, v, color, Frame, polar, groupBy, sumBy, orderBy } from "gofish-graphics";
import { seafood } from "./dataset";

const root = document.getElementById("app");

rect({ x: 0, y: 0, w: 32, h: 300, fill: gf.color.green[5] }).render(root, {
  w: 500,
  h: 300,
});
``` -->

::: gofish-live {template=vanilla-ts rtl lightTheme=aquaBlue darkTheme=atomDark previewHeight=400 coderHeight=500}

```ts index.ts
import * as gf from "gofish-graphics";
import { seafood } from "./dataset";
import * as _ from "lodash";

const root = document.getElementById("app");

gf.chart(seafood, { axes: true })
  .flow(gf.spread({ by: "lake", dir: "x" }))
  .mark(gf.rect({ h: "count", fill: gf.color.green[5] }))
  .render(root, { w: 500, h: 300 });
```

```ts dataset.ts
export type Lakes =
  | "Lake A"
  | "Lake B"
  | "Lake C"
  | "Lake D"
  | "Lake E"
  | "Lake F";

export type SeafoodData = {
  lake: Lakes;
  species: "Bass" | "Trout" | "Catfish" | "Perch" | "Salmon";
  count: number;
};

export const lakeLocations: Record<Lakes, { x: number; y: number }> = {
  "Lake A": { x: 5.26, y: 22.64 },
  "Lake B": { x: 30.87, y: 120.75 },
  "Lake C": { x: 50.01, y: 60.94 },
  "Lake D": { x: 115.13, y: 94.16 },
  "Lake E": { x: 133.05, y: 50.44 },
  "Lake F": { x: 85.99, y: 172.78 },
};

export const seafood: SeafoodData[] = [
  {
    lake: "Lake A",
    species: "Bass",
    count: 23,
  },
  {
    lake: "Lake A",
    species: "Trout",
    count: 31,
  },
  {
    lake: "Lake A",
    species: "Catfish",
    count: 29,
  },
  {
    lake: "Lake A",
    species: "Perch",
    count: 12,
  },
  {
    lake: "Lake A",
    species: "Salmon",
    count: 8,
  },
  {
    lake: "Lake B",
    species: "Bass",
    count: 25,
  },
  {
    lake: "Lake B",
    species: "Trout",
    count: 34,
  },
  {
    lake: "Lake B",
    species: "Catfish",
    count: 41,
  },
  {
    lake: "Lake B",
    species: "Perch",
    count: 21,
  },
  {
    lake: "Lake B",
    species: "Salmon",
    count: 16,
  },
  {
    lake: "Lake C",
    species: "Bass",
    count: 15,
  },
  {
    lake: "Lake C",
    species: "Trout",
    count: 25,
  },
  {
    lake: "Lake C",
    species: "Catfish",
    count: 31,
  },
  {
    lake: "Lake C",
    species: "Perch",
    count: 22,
  },
  {
    lake: "Lake C",
    species: "Salmon",
    count: 31,
  },
  {
    lake: "Lake D",
    species: "Bass",
    count: 12,
  },
  {
    lake: "Lake D",
    species: "Trout",
    count: 17,
  },
  {
    lake: "Lake D",
    species: "Catfish",
    count: 23,
  },
  {
    lake: "Lake D",
    species: "Perch",
    count: 23,
  },
  {
    lake: "Lake D",
    species: "Salmon",
    count: 41,
  },
  {
    lake: "Lake E",
    species: "Bass",
    count: 7,
  },
  {
    lake: "Lake E",
    species: "Trout",
    count: 9,
  },
  {
    lake: "Lake E",
    species: "Catfish",
    count: 13,
  },
  {
    lake: "Lake E",
    species: "Perch",
    count: 20,
  },
  {
    lake: "Lake E",
    species: "Salmon",
    count: 40,
  },
  {
    lake: "Lake F",
    species: "Bass",
    count: 4,
  },
  {
    lake: "Lake F",
    species: "Trout",
    count: 7,
  },
  {
    lake: "Lake F",
    species: "Catfish",
    count: 9,
  },
  {
    lake: "Lake F",
    species: "Perch",
    count: 21,
  },
  {
    lake: "Lake F",
    species: "Salmon",
    count: 47,
  },
];
```

:::

## The Dataset

The dataset we'll work with in this tutorial is counts of the number of fish caught in different
lakes.

```ts no-check
type SeafoodData = {
  lake: "Lake A" | "Lake B" | "Lake C" | "Lake D" | "Lake E" | "Lake F";
  species: "Bass" | "Trout" | "Catfish" | "Perch" | "Salmon";
  count: number;
};

const seafood: SeafoodData[] = [
  {
    lake: "Lake A",
    species: "Bass",
    count: 23,
  },
  {
    lake: "Lake A",
    species: "Trout",
    count: 31,
  },
  {
    lake: "Lake A",
    species: "Catfish",
    count: 29,
  },
  ...
];
```

## Anatomy of a GoFish Specification

A basic GoFish spec has four pieces: `chart`, `flow`, `mark`, and `render`.

### `chart`: Data

The `chart` function is how you start your specification. It's where you put your data.

```ts no-check
chart(seafood);
```

### `flow`: Graphical Operators

The `flow` method is where you specify _graphical operators_. Graphical operators transform your
dataset (usually by applying a `groupBy`) and specify layout.

```ts no-check
.flow(spread({ by: "lake",  dir: "x" }))
```

Here we're using the `spread` operator to create one group per `lake` and we arrange them
horizontally thanks the `dir: x` option.

### `mark`: Shapes

Lastly we call the `mark` method to specify the shapes we place in each of the regions created by
the `spread` operator.

```ts no-check
.mark(rect({ h: "count" }))
```

In this case, we created some rectangles whose heights correspond to the `count` values of the
different lakes. Since we didn't define the width of the rectangle, the `spread` operator and
`rect` shape work together to infer it for us!

### Rendering

```ts no-check
chart(seafood, { axes: true }).render(root, { w: 500, h: 300 });
```

The `render` method draws our chart to the screen! We give it a DOM container to render into (`root`
in this case) and some options. We've specified the width and height of our chart with `w` and `h`
(just like on `rect`). We've also told GoFish to create some axes, labels, and legends for us
automatically by passing `axes: true` in the `chart()` options.

Both `w` and `h` are optional, and an omitted dimension is computed during layout
per axis. An axis that scales data into pixels — a positional axis (scatter), or a data-driven size
like bar heights — falls back to a default size. An axis with nothing to scale — a category axis, or
fixed-size marks — keeps the marks at their natural size and shrinks to fit them. So a bar chart with
no width gets default-width bars and a chart only as wide as it needs to be.

## Bar Chart

The first thing we'll do is compare the number of fish in each lake. We can use a bar chart for
that. We'll build it up in a few steps. First, we'll just create one bar for
each lake in the dataset:

:::gofish

```ts
gf.chart(seafood)
  .flow(gf.spread({ by: "lake", dir: "x" }))
  .mark(gf.rect({ w: 32, h: 300, fill: gf.color.green[5] }))
  .render(root, { w: 500, h: 300 });
```

:::

Note that we've added `w: 32` and `h: 300` to the rectangles to set manually set their widths and heights.

### The `spread` operator

We've introduced a `spread` _graphical operator_ in the `.flow()` method that spaces its children apart.
The `spread` operator groups the data by the field we specify (in this case, `lake`) and creates one
shape for each group. Here, we're spreading along the x direction with `dir: "x"`, which will create
six rectangles (one for each lake).

### Data-Driven Fields

To turn this into a bar chart, we'll change the `h` encoding of the `rect` shape to a data-driven
quantity.

:::gofish

```ts
gf.chart(seafood)
  .flow(gf.spread({ by: "lake", dir: "x" }))
  .mark(gf.rect({ w: 32, h: "count", fill: gf.color.green[5] }))
  .render(root, { w: 500, h: 300 });
```

:::

### Inferred Fields

We remove the `w` field from our spec to have GoFish infer it for us. GoFish uses the overall size
of the chart we gave to `render` (as well as information from the graphical operators) to determine the
width of each rectangle.

:::gofish

```ts
gf.chart(seafood)
  .flow(gf.spread({ by: "lake", dir: "x" }))
  .mark(gf.rect({ h: "count", fill: gf.color.green[5] }))
  .render(root, { w: 500, h: 300 });
```

:::

## Axes

Great! Now let's talk about how to add axes to your chart. GoFish can automatically infer axes from
your spec as long as you pass `axes: true` in the `chart()` options like so:

:::gofish

```ts
gf.chart(seafood, { axes: true })
  .flow(gf.spread({ by: "lake", dir: "x" }))
  .mark(gf.rect({ h: "count", fill: gf.color.green[5] }))
  .render(root, { w: 500, h: 300 });
```

:::

<!-- Awesome. Now we have a y-axis. But what about the x-axis? Since the x-axis is a discrete quantity
not tied to an argument like `h`, we'll need to pass a `key` field to the objects we want to label:

:::gofish

```ts
StackX(
  { spacing: 8, sharedScale: true },
  For(_.groupBy(seafood, "lake"), (lake, key) =>
    rect({ key, w: 32, h: v(_.sumBy(lake, "count")), fill: gf.color.green[5] })
  )
).render(root, { w: 500, h: 300 });
```

::: -->

Voila! Now we have a y-axis and labels for each of the bars.

<!-- Notice also that we've added a `key` field to `rect`. This let's GoFish know the identity of -->
<!-- each -->

## Stacked Bar Chart

Now we have a sense of the number of fish in each lake. It seems like Lake B has the most. What if
we broke this down by species? We can use a stacked bar chart for that. A stacked bar chart is kinda
like a normal bar chart, except instead of a line of rectangles, it's a line of _stacked_ rectangles.

:::gofish

```ts
gf.chart(seafood, { axes: true })
  .flow(
    gf.spread({ by: "lake", dir: "x" }), //
    gf.stack({ by: "species", dir: "y", label: false })
  )
  .mark(gf.rect({ h: "count", fill: gf.color.green[5] }))
  .render(root, { w: 500, h: 300 });
```

:::

We've added the `stack` operator to stack rectangles on top of each other vertically. It's pretty
similar to `spread`, but doesn't put any spacing between the shapes it lays out.

Now we have a rectangle for each species in each lake. But we can't tell the fish apart! Let's add a
color encoding so that each rectangle's color corresponds to the species of fish.

:::gofish

```ts
gf.chart(seafood, { axes: true })
  .flow(
    gf.spread({ by: "lake", dir: "x" }), //
    gf.stack({ by: "species", dir: "y", label: false })
  )
  .mark(gf.rect({ h: "count", fill: "species" }))
  .render(root, { w: 500, h: 300 });
```

:::

Much better! Notice that we also have a color legend telling us what each color represents. This was
created automatically because we passed `axes: true` in the `chart()` options.

<!-- ### The `stack` operator

Notice we've used the `stack` operator to create this stack of bars. `stack` works a lot like
`spread`, but it "glues" shapes tightly together. This lets us keep the continuous y-axis, for example. -->

## Ribbon Chart

### Data Transformation

Now we have a sense of the break down by lake, but these lakes are connected by a river! It's hard
to track how the proportion of fish changes between each lake. Let's first try ordering the bars by
their counts:

:::gofish

```ts
gf.chart(seafood, { axes: true })
  .flow(
    gf.spread({ by: "lake", dir: "x" }),
    gf.derive((d) => _.orderBy(d, "count")),
    gf.stack({ by: "species", dir: "y", label: false })
  )
  .mark(gf.rect({ h: "count", fill: "species" }))
  .render(root, { w: 500, h: 300 });
```

:::

We've used the `derive` operator, which lets us add data transforms into our `flow`!

Some trends pop out. The salmon population spikes between lakes B and C while catfish appear to
decline. We can make these trends more obvious by connecting rectangles of the same species
together.

### Layering and Selection

:::gofish

```ts
gf.layer({ axes: true }, [
  gf
    .chart(seafood)
    .flow(
      gf.spread({ by: "lake", dir: "x" }),
      gf.derive((d) => _.orderBy(d, "count")),
      gf.stack({ by: "species", dir: "y", label: false })
    )
    .mark(gf.rect({ h: "count", fill: "species" }).name("bars")),
  gf
    .chart(gf.selectAll("bars"))
    .flow(gf.group({ by: "species" }))
    .mark(gf.ribbon({ opacity: 0.8 })),
]).render(root, {
  w: 500,
  h: 300,
});
```

:::

Great! This is already a ribbon chart but it's a little funky. We'll fix the funkiness in a second,
but first let's understand what's going on.

To add some ribbons, we first created a `Layer` so we can add the ribbons as a second layer. Then
we name the marks in the first layer using `.name("bars")` and `selectAll` those marks in the second
layer. `selectAll("bars")` hands us one [`ref`](/js/api/marks/ref) per bar; we group them by species
using `gf.group({ by: "species" })` and finally draw a `ribbon` mark for each group.

<!-- First, we've added a `layer` operator that lets us layer on multiple elements in the same space.
We create the bars with the first `chart` and use `.name("bars")` on the mark to give them a name so we can refer
to them later. Then we use `gf.selectAll("bars")` in a second chart to reference those bars. Finally,
we use `gf.group({ by: "datum.species" })` to group by species and `gf.ribbon()` to connect the bars horizontally. -->

To make this look more like a traditional ribbon chart, all we have to do is change the spacing of
the `spread` operator.

:::gofish

```ts
gf.layer({ axes: true }, [
  gf
    .chart(seafood)
    .flow(
      gf.spread({ by: "lake", dir: "x", spacing: 64 }),
      gf.derive((d) => _.orderBy(d, "count")),
      gf.stack({ by: "species", dir: "y", label: false })
    )
    .mark(gf.rect({ h: "count", fill: "species" }).name("bars")),
  gf
    .chart(gf.selectAll("bars"))
    .flow(gf.group({ by: "species" }))
    .mark(gf.ribbon({ opacity: 0.8 })),
]).render(root, {
  w: 500,
  h: 300,
});
```

:::

<!-- :::gofish

```ts
Frame([
  StackX(
    { spacing: 64, sharedScale: true },
    For(_.groupBy(seafood, "lake"), (lake, key) =>
      StackY(
        { key, spacing: 1 },
        For(_.orderBy(lake, "count", "desc"), (d) =>
          rect({ w: 16, h: v(d.count), fill: v(d.species) }).name(
            `${d.lake}-${d.species}`
          )
        )
      )
    )
  ),
  For(_.groupBy(seafood, "species"), (items) =>
    ConnectX(
      { opacity: 0.8 },
      For(items, (d) => ref(`${d.lake}-${d.species}`))
    )
  ),
]).render(root, { w: 500, h: 300 });
```

::: -->

## Polar Ribbon Chart

Finally it's time to make our polar ribbon chart! To do so, we'll add a `clock` coordinate transform
to the `Layer` and adjust the parameters to `spread`
so that it looks better in polar space.

:::gofish

```ts
gf.layer({ coord: gf.clock(), axes: true }, [
  gf
    .chart(seafood)
    .flow(
      gf.spread({
        by: "lake",
        dir: "x",
        spacing: (2 * Math.PI) / 6,
        anchor: "middle",
        y: 50,
        label: false,
      }),
      gf.derive((d) => _.orderBy(d, "count")),
      gf.stack({ by: "species", dir: "y", label: false })
    )
    .mark(gf.rect({ h: "count", fill: "species" }).name("bars")),
  gf
    .chart(gf.selectAll("bars"))
    .flow(gf.group({ by: "species" }))
    .mark(gf.ribbon({ opacity: 0.8 })),
]).render(root, {
  w: 400,
  h: 400,
});
```

:::

## What's next?

Go check out some of our [examples](/js/examples/index)!
