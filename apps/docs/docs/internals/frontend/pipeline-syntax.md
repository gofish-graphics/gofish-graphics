---
title: Pipeline Syntax
section: Frontend
order: 10
status: draft
---

# Pipeline Syntax & Desugaring

This essay collects the design notes behind the frontend's "forward" pipeline
syntax —
why `chart(data).flow(...).mark(...)` flows the way it does, a catalog of
worked chart examples expressed in it, and the implementation TODO list that
tracked it. It reads like design scratch because it is: the syntax was settled
by writing example after example until one shape felt right.

## Why forward syntax?

Two proposals were on the table — "reverse" syntax and "forward" syntax.
Compare them across a few examples.

### Stacked Bar Chart

**Reverse**

```ts
rect(seafood, { h: "count", fill: "species" })
  .stackY("species")
  .spreadX("lake")
  .render(root, { w: 500, h: 300, axes: true });
```

**Forward**

```ts
data(seafood)
  .flow(spreadBy("lake", { dir: "x" }), stackBy("species", { dir: "y" }))
  .mark(rect({ h: "count", fill: "species" }));
```

### Ribbon Chart

**Reverse**

```ts
rect(seafood, { h: "count", fill: "species" })
  .stackY("species")
  .derive(sort("count"))
  .spreadX("lake", { spacing: 64 })
  .connectX("species", { over: "lake", opacity: 0.8 })
  .render(root, { w: 500, h: 300, axes: true });
```

**Forward** (needed several more examples to figure out — the early sketches
struggled with `connect`):

```ts
data(seafood).layer(
  flow(
    spreadBy("lake", { dir: "x" }), //
    stackBy("species", { dir: "y" })
  ).mark(rect({ h: "count", fill: "species" })),
  flow(
    /* put something here? */
    derive(groupBy("species")), //
    connectBy("lake")
    /* put something here? */
  ).mark(/* ??? */)
);
```

### Waffle Chart (not actually implemented yet)

**Reverse**

```ts
rect(seafood, { w: 8, h: 8, fill: "species" })
  .spreadX({ spacing: 2 })
  .spreadY({ spacing: 2 })
  .derive((d) => flatMap((d) => repeat(d, "count")).chunk(5))
  .spreadX("lake")
  .render(root, { w: 500, h: 300, axes: true });
```

**Forward**

```ts
data(seafood).flow(
  spreadBy("lake", { dir: "x" }),
  derive((d) => flatMap((d) => repeat(d, "count")).chunk(5)),
  spreadBy(/* undefined/index/no arg, */ { spacing: 2, dir: "y" }),
  spreadBy(/* undefined/index/no arg, */ { spacing: 2, dir: "x" }),
  rect({ w: 8, h: 8, fill: "species" })
);
```

### Takeaways

- Reverse syntax is more familiar to GoG users because it starts with the
  mark.
- However, reverse syntax is very confusing in the presence of data
  transformations, especially ones that introduce fields (e.g. in the waffle
  chart example) because the data transforms flow _upwards_ while the rest of
  the spec tricks you into thinking it runs _downwards_. In fact, the flow
  runs from the dataset then _upwards_ through the operators and finally ends
  at the mark at the top. The forward syntax makes this dataflow much clearer.
  The trickiness of this doesn't make sense until you start writing slightly
  more complicated charts like the waffle chart. Upwards flow also messes
  things up when it comes to branching (arguably — it might be ok either way).
- The forward syntax is much easier to make extensible. While dot chaining can
  connote forward or reverse data flow (think data flow in polars for
  forwards and modifiers in SwiftUI for reverse), it is very hard to make a
  reverse flow using the function-arguments approach that is needed for easy
  extensibility. We care A LOT about users being able to define their own
  marks and operators that work like built-in ones, so we will not compromise
  on this.
- One big downside of the forward syntax is that it makes the `connect`
  operator significantly more verbose. This verbosity is something we will
  likely have to reckon with anyway for more complicated use cases like adding
  chart annotations. A question is whether we can defer all of that for our
  current set of examples and just do the simple thing. The current intuition
  is that for layers that are dependent on previous ones, their source is
  still data, but their sink is now a selection instead of a mark. (Of course
  we can think of a selection or ref as a special kind of mark as we do in
  Bluefish.) The other very natural approach is to return a reference to the
  previous layer such that it is a map between data and shapes so that it can
  be selected. For example, a similar idea was sketched for Observable Plot:

```ts
// create a reference to the dot marks so they can be drawn first, but also
// referred to later
let dots = Plot.dot(…)

// use Plot.pointer to filter the dots and only add tooltips to those marks
Plot.tip(tooltipData, Plot.pointer(dots))
```

```ts
const dots = data(...).flow(scatter(...)).mark(circle(...))

const selectedDots = data(selectPointer(dots, "x")).mark(circle(..."red"...))

data(selectedDots).mark(tip(...))
```

So selections/data should be able to be used as inputs to other flows.

### Settling on `chart(...).marks([...])`

Driving shifts:

```ts
const dots = data(drivingShifts).flow(scatter(...)).mark(circle(...))

// hmm... no?
const line = data(dots).flow(connect(..."x"...)).mark()
const line = data().flow(connect(..."x"...)).mark(ref(dots))

// ??? join???
const spanAnnots = data(timeSpanAnnotations).mark(label({text, }))
```

Another idea — a single `chart({...})` config object:

```ts
chart({
  data,
  coord,
  flow,
  mark,
  connect,
  render,
});
```

```ts
chart({ data, coord, w, h, axes }).flow().mark().render(root);
```

In this case, `connect` is a separate field since all the basic examples only
do straightforward things with `connect`. It is quite simple and avoids
conceptual baggage like layers and references to make simple charts. On the
other hand, it makes `connect` feel different from the other operators.

```ts
chart(seafood)
  .flow(spread("lake", { dir: "x" }), stack("species", { dir: "y" }))
  .mark(rect({ h: "count", fill: "species" }));
```

```ts
chart(seafood).marks([
  flow(
    spread("lake", { dir: "x" }), //
    stack("species", { dir: "y" })
  )
    .mark(rect({ h: "count", fill: "species" }))
    .as("bars"),
  flow(derive(groupBy("species")), connect(ref("bars"))),
]);
```

```ts
chart(seafood).marks([
  flow(
    spread("lake", { dir: "x", spacing: 64 }),
    derive(sortBy("count")),
    stack("species", { dir: "y" })
  )
    .mark(rect({ w: 16, h: "count", fill: "species" }))
    .as("bars"),
  flow(
    derive(groupBy("species")), //
    connect("lake", { dir: "x", opacity: 0.8 })
  ).mark(join("bars")),
]);
```

You could also start the flow with a `selection` of some data instead of
ending with a `join`, because they are the same — but the selection thing
introduces a bigger can of worms:

```ts
layer([
  data(seafood)
    .flow(
      spread("lake", { dir: "x", spacing: 64 }),
      derive(sortBy("count")),
      stack("species", { dir: "y" })
    )
    .mark(rect({ w: 16, h: "count", fill: "species" }))
    .as("bars"),
  // an array of data with key and mark ref
  data(selectAll("bars"))
    // array is now grouped by species with one mark produced for each one
    .flow(derive(groupBy("species")))
    // species array is passed as children(?) to connect
    .mark(connect({ dir: "x", opacity: 0.8 })),
]);
```

This last shape — `layer([...])` of `chart(...).flow(...).mark(...)`, where
later layers `selectAll` earlier ones — is the one that felt right, and the rest
of the examples below are written against it.

## Worked examples

The following examples assume a final
`.render(container, { w: 500, h: 300, axes: true })` and omit it.

### Basic

**bar chart**

```ts
chart(seafood)
  .flow(spread("lake", { dir: "x" }))
  .mark(rect({ h: "count" }));
```

_horizontal bar chart_

```ts
chart(seafood)
  .flow(spread("lake", { dir: "y" }))
  .mark(rect({ w: "count" }));
```

**scatter plot**

```ts
chart(seafood)
  .flow(scatter({ x: "lakeLocX", y: "lakeLocY" }))
  .mark(circle());
```

**line chart**

```ts
layer([
  chart(seafood)
    .flow(scatter({ x: "lakeLocX" }))
    .mark(blank())
    .as("points"),
  chart(selectAll("points")).mark(line()),
]);
```

```ts
chart(seafood)
  .flow(scatter("lake", { x: "lakeLocX" }), connect())
  .mark(line());
```

```ts
chart(seafood)
  .flow(scatter("lake", { x: "lakeLocX" }))
  .mark(blank())
  .layer(connect(), line());
```

```ts
chart(seafood)
  .flow(scatter("lake", { x: "lakeLocX" }))
  .mark(blank())
  .layer(chart().flow(connect()).mark(line()));
```

**area chart**

```ts
layer([
  chart(seafood)
    .flow(scatter({ x: "lakeLocX" }))
    .mark(blank({ h: "count" }))
    .as("points"),
  chart(selectAll("points")).mark(connect()),
]);
```

**pie chart**

```ts
chart(seafood, { coord: clock() })
  .flow(stack("species", { dir: "theta" }))
  .mark(rect({ "theta-size": "count", fill: "species" }));
```

### Still basic

**stacked bar chart**

```ts
chart(seafood)
  .flow(spread("lake", { dir: "x" }), stack("species", { dir: "y" }))
  .mark(rect({ h: "count", fill: "species" }));
```

**grouped bar chart**

```ts
chart(seafood)
  .flow(spread("lake", { dir: "x" }), stack("species", { dir: "x" }))
  .mark(rect({ h: "count", fill: "species" }));
```

**stacked area chart**

```ts
layer([
  chart(seafood)
    .flow(scatter({ x: "lakeLocX" }), stack("species", { dir: "y" }))
    .mark(blank({ h: "count" }))
    .as("points"),
  chart(selectAll("points")).mark(group("species"), connect()),
]);
```

**donut chart**

```ts
chart(seafood, { coord: clock() })
  .flow(stack("species", { dir: "theta", r: 50, "r-size": 50 }))
  .mark(rect({ "theta-size": "count", fill: "species" }));
```

**rose chart**

```ts
// TODO: the R direction should be sqrt'd I guess?
chart(nightingale, { coord: clock() })
  .flow(stack("Month", { dir: "theta" }), stack("Type", { dir: "r" }))
  .mark(rect({ "r-size": "Death", fill: "Type" }));
```

### Slightly more complex

**streamgraph**

```ts
layer([
  chart(seafood)
    .flow(
      scatter({ x: "lakeLocX", alignment: "middle" }),
      stack("species", { dir: "y" })
    )
    .mark(blank({ h: "count" }))
    .as("points"),
  chart(selectAll("points")).mark(group("species"), connect()),
]);
```

**mosaic**

```ts
chart(cars)
  .flow(
    spread("origin", { dir: "x", spacing: 4 }),
    stack("cylinders", { w: "count" }),
    // TODO: not really sure if this is in the right spot...
    // however I think this is also where something like sorting will go, too...
    derive(norm("count"))
  )
  .mark(rect({ h: "count", fill: "origin" }));
```

**waffle**

```ts
chart(seafood)
  .flow(
    spread("lake", { spacing: 8, dir: "x" }),
    derive((d) => d.repeat("count").chunk(5)),
    spread({ spacing: 2, dir: "y" }),
    spread({ spacing: 2, dir: "x" })
  )
  .mark(rect({ w: 8, h: 8, fill: "species" }));
```

**ribbon**

```ts
layer([
  chart(seafood)
    .flow(
      spread("lake", { dir: "x", spacing: 64 }),
      derive(sortBy("count")),
      stack("species", { dir: "y" })
    )
    .mark(rect({ w: 16, h: "count", fill: "species" }))
    .as("bars"),
  // an array of data with key and mark ref
  chart(selectAll("bars")) // pair up data values?
    // array is now grouped by species with one mark produced for each one
    .flow(group("species"))
    // species array is passed as children(?) to connect
    .mark(connect({ dir: "x", opacity: 0.8 })),
]);
```

**polar ribbon**

```ts
plot({ coord: clock() }).mark([
  plot(seafood)
    .flow(
      spread("lake", { dir: "theta", r: 50, spacing: 60, mode: "center" }),
      derive(sortBy("count")),
      stack("species", { dir: "y" })
    )
    .mark(rect({ w: 16, h: "count", fill: "species" }))
    .as("bars"),
  // an array of data with key and mark ref
  plot(selectAll("bars"))
    // array is now grouped by species with one mark produced for each one
    .flow(group("species"))
    // species array is passed as children(?) to connect
    .mark(connect({ dir: "x", opacity: 0.8 })),
]);
```

**ridgeline**

```ts
const area = createMark((data, { x, y }) =>
  layer([
    chart(data)
      .flow(scatter({ x }))
      .mark(blank({ h: y }))
      .as("points"),
    chart(selectAll("points")).mark(connect()),
  ])
);

chart(seafood)
  .flow(spread("species", { dir: "y", spacing: -16 }))
  .mark(area({ x: "lakeLocX", y: "count" }));
```

**layered area**

```ts
const area = createMark((data, { x, y }) =>
  layer([
    chart(data)
      .flow(scatter({ x }))
      .mark(blank({ h: y }))
      .as("points"),
    chart(selectAll("points")).mark(connect()),
  ])
);

chart(seafood)
  .flow(group("species"))
  .mark(area({ x: "lakeLocX", y: "count" }));
```

**scatter pie**

```ts
const pie = createMark((data, { category, value }) =>
  chart(data, { coord: clock() })
    .flow(stack(category, { dir: "theta" }))
    .mark(rect({ "theta-size": value, fill: category }))
);

chart(seafood)
  .flow(scatter({ x: "lakeLocX", y: "lakeLocY" }))
  .mark(pie({ category: "species", value: "count" }));
```

**connected scatter plot**

```ts
layer([
  chart(seafood)
    .flow(scatter({ x: "lakeLocX" }))
    .mark(circle())
    .as("points"),
  chart(selectAll("points")).mark(line(/* { z: -1 } */)).zIndex(-1),
]);
```

**flower chart** (doable) — TODO

**balloon** (doable) — TODO

### Even more complicated

**bump chart**

```ts
layer([
  chart(newCarColors)
    .flow(
      scatter({ x: "Year" }),
      derive(sortBy("Rank")),
      spread("Color", { dir: "y" })
    )
    .mark(circle({ fill: (d) => d.Color }))
    .as("points"),
  chart(selectAll("points"), group("Color"))
    .mark(line(/* { z: -1 } */))
    .zIndex(-1),
]);
```

**box and whisker**

```ts
const boxAndWhisker = createMark((data, { q0, q25, q50, q75, q100, fill }) => [
  segment({ y: q0, stroke: "gray + 1px" }).as("min"),
  segment({ y: q100, stroke: "gray + 1px" }).as("max"),
  connect({ from: ref("min"), to: ref("max") }),
  segment({ "y-min": q1, "y-max": q3, fill }),
  segment({ y: q50, stroke: "white + 1px" }),
]);

plot(genderPayGap)
  .flow(spread("Pay Grade", { dir: "x" }), stack("Gender", { dir: "x" }))
  .mark(
    boxAndWhisker({
      q0: "Min",
      q25: "25-Percentile",
      q50: "Median",
      q75: "75-Percentile",
      q100: "Max",
      fill: "Gender",
    })
  );
```

**violin plot**

```ts
import { density1d } from "fast-kde";

/* TODO: this is really a variation of area... */
const violin = createMark((data, { x, fill }) => {
  const densityData = density1d(
    data.map((p) => p[x]).filter((w) => w !== null)
  );

  layer([
    chart(densityData)
      .flow(scatter({ y: "y", alignment: "middle" }))
      .mark(blank({ w: "x", fill }))
      .as("points"),
    chart(selectAll("points")).mark(connect()),
  ]);
});

plot(penguins)
  .flow(spread("Species"))
  .mark(violin({ x: "Body Mass (g)", fill: "Species" }));
```

**stringline**, **icicle chart**, **sankey tree**, **nested waffle**,
**nested mosaic** — TODO.

## Implementation TODO

The status snapshot from when the syntax was being built out:

### Eventually TODO

- [ ] Fast next-layer for when you are just selecting the previous layer
- [ ] control over scatter pie radii
- [ ] z-indexing
- [ ] position using center?

### Basic Charts

- [x] bar chart
- [x] horizontal bar chart
- [x] scatter plot
- [x] line chart
- [ ] area chart
- [x] pie chart

### Still Basic

- [x] stacked bar chart
- [x] grouped bar chart
- [ ] stacked area chart
- [x] donut chart
- [x] rose chart

### Slightly More Complex

- [x] streamgraph
- [x] mosaic
- [x] waffle
- [x] ribbon
- [x] polar ribbon
- [ ] ridgeline
- [ ] layered area
- [-] scatter pie (needs more control over variable radii)
- [-] connected scatter plot (needs z-index control; also a bug when
  replacing circle w/ blank that seems like it's not getting placed in the
  center but at some other place)
- [ ] flower chart
- [ ] balloon

### Even More Complicated

- [ ] bump chart
- [ ] box and whisker
- [ ] violin plot
- [ ] stringline
- [ ] icicle chart
- [ ] sankey tree
- [ ] nested waffle
- [ ] nested mosaic
