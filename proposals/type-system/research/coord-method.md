# Where does a coord go: a `.coord()` method, or the `coord` option?

A draft of the type-system document sketched a chart-builder method that
GoFish does not have:

```js
chart(inv)
  .flow(spread("month"), stack("warehouse"))
  .mark(rect({ h: "sold" }))
  .coord(log("y"));

chart(inv)
  .flow(spread("month"))
  .mark(rect({ h: "sold" }))
  .coord(polar());
```

Josh likes the idea and asks two questions. Should `.coord()` go at the
beginning or at the end of the chain? And how does it work with layers that
share one coord, or that each need a different one?

This page lays out the design space. Section 6 answers the layer question with
rules that hold under every spelling. Section 7 compares the spellings on real
stories. Section 9 gives a recommendation, and section 10 lists the decisions.

Note on renders: every candidate below draws exactly the same picture as the
story it rewrites. The choice is about spelling and meaning, not output, so
each example points at its existing gallery story for the render.

## 1. Terms

- **Coord** (coordinate transform): a value from the `Coord` family
  (`Coord.polar()`, `Coord.clock()`, `Coord.wavy()`, `Coord.geo(...)`, and the
  proposed `Coord.log()`). It maps positions in a space to the screen.
- **Space** (coordinate space): the region a coord governs. Inside it, layout
  happens in the space's own coordinates (angle and radius in polar, degrees
  in geo), and the coord maps the finished positions to pixels.
- **Boundary**: a node that opens a space. Today there are exactly two:
  `chart(data, { coord })` and `layer({ coord }, [...])`. A chart's box is
  itself a `layer` built with the chart's options (`frameChart` in
  `packages/gofish-graphics/src/ast/marks/chartBuilder.ts`).
- **Frame**: the box a chart draws in, with its size, padding, axes and
  coord.
- **Tier**: one step of a `.layer(...)` chain. Each tier is offered the
  previous tier's marks.
- **Nested space**: a boundary inside another boundary. Its box is placed by
  the outer space as one glyph.
- **Composed coord**: one space whose map is several transforms in a row,
  such as a log radius inside polar.
- **Synthesized type**: the facts the chart body produces bottom up, such as
  "this axis has a meaningful zero" (made by `stack`) or "these marks are
  embedded geometry" (made by `spread`). A coord's type rule checks them.
- **Inherited fact**: a fact that flows top down from the coord into its body,
  such as the axis names `theta` and `r`.

## 2. How a coord works today

These facts come from the code. Each one constrains the design.

1. **Two boundaries take one key.** `ChartOptions.coord` and
   `LayerOptions.coord` are the same option. A chart's frame is
   `Layer(options, [content])`, so a chart's options are layer options
   (`frameChart`, `chartBuilder.ts`; `layer.tsx` around line 204). The
   descriptor table documents both (`packages/gofish-ir/src/frontend/descriptors.ts`,
   `ChartOptions.coord` near line 1157 and `layer.coord` near line 2362).
2. **A `.layer()` chain shares the root chart's space.** `LayerBuilder.resolve`
   does not frame the root tier on its own. It puts every tier's nodes into
   the root chart's one frame, so the coord in the first `chart(...)` covers
   every later tier. The comment says why: "a basemap under `geo(...)` and the
   paths layered over it must share one projection". So an option written on
   the first chart already scopes over things written after it.
3. **A nested boundary is a new space, placed as a glyph.** A coord is a bake
   boundary (`coord-flattening.md`): the outer space places the inner box, and
   never warps its interior. Axis names follow the innermost space only:
   "Every space establishes its own names, so the innermost one wins and an
   outer space's names are not visible inside it" (`axisScopeFor` in
   `src/ast/dims.ts`). A pie inside a polar chart is a pie at a point, not a
   pie bent by the outer polar map. `NestedOrientation.stories.tsx` locks in
   that a parent's orientation "places the pie's box, it never re-interprets
   its interior" (#629).
4. **Operators read names the coord declares.** `spread`, `stack`, `scatter`,
   `partition` and `treemap` take `dir` or `dims` keyed by "x, y, or an axis
   name the enclosing coordinate space declares (polar theta/r, geo lon/lat)".
   That name is resolved after the tree is built, against the enclosing space.
5. **The coord is the scale root of its body.** It sums the data-driven
   extents of everything inside it and fits them to its budget
   (`coordConfluence.test.ts`, #618). Domain inference sees every tier at
   once (fact 2).
6. **Layout never runs in warped space.** Operators lay out in the space's own
   coordinates. The coord maps the final positions afterwards. There is no
   stage where a flow operator sees screen positions inside a curved space;
   pieces that need screen geometry, like a `Place` label strategy, are an
   error there.
7. **The IR stores it as an option.** `ChartIR.options.coord`, the layer
   combinator's options, and for a `.layer()` chain, the root tier's options.
   Python spells it `chart(data, coord=Coord.clock())` and
   `layer([...], coord=Coord.clock())`.

Facts 4 and 6 matter most for the ordering question. A coord is not a
display step that runs after layout. It names the axes the layout uses, sets
the traits the layout must keep (`HasZero`, `HasCycle` in `coord.tsx`), and
fits the layout's sizes. The layout happens inside it.

## 3. The hard stories

All paths are under `packages/gofish-graphics/stories/` unless noted.

| #   | Story                                                                     | What makes it hard                                                                                   |
| --- | ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| 1   | Pie Chart, Donut, Nightingale Rose (`forwardsyntax/Pie.stories.tsx`)      | the plain case; the rose also carries `axes`, `padding`, and a hand-written sqrt the coord could own |
| 2   | Small Multiple Pie Charts (`Pie.stories.tsx`, `SmallMultiples`)           | each lake is its own polar space, nested in a linear chart                                           |
| 3   | Scatter Plot with Pie Glyphs (`forwardsyntax/Scatter.stories.tsx`)        | polar glyphs at scatter points, with a `join` inside the glyph                                       |
| 4   | Bird Migration (`animated-vega-lite/BirdMigrationStatic.stories.tsx`)     | geo basemap plus overlaid lines in one projection, through a `.layer()` chain                        |
| 5   | Polar Ribbon Chart (`forwardsyntax/Ribbon.stories.tsx`, `Polar`)          | bars and ribbons share one polar space; the ribbons read the bars by `selectAll("bars")`             |
| 6   | Flower Chart (`forwardsyntax/FlowerChart.stories.tsx`)                    | siblings in one layer in different coords: a linear stem and a polar head                            |
| 7   | Polar in chart (`lowlevel/NestedOrientation.stories.tsx`)                 | low-level combinator: `layer({ coord }, [stackX(...)])` beside linear bars, no `chart()`             |
| 8   | Balloon chart, spread under wavy (`lowlevel/BalloonChart`, `Constraints`) | low-level `layer({ coord: Coord.wavy() }, ...)`                                                      |
| 9   | Polar text (`shapes/TextMarks.stories.tsx`)                               | a bare mark in a coord, no data at all                                                               |
| 10  | GoTree radial trees (`packages/gofish-gotree/stories/gallery/`)           | `tree.tsx` wraps its result in `layer({ coord }, [composed])`                                        |
| 11  | Gapminder sparklines (`animated-vega-lite/Gapminder.stories.tsx`)         | borrows the internal `linear()` coord just to open a separate space (a known workaround, #1115)      |
| 12  | A log-y scatter (hypothetical, from the scale-transforms proposal)        | a one-axis coord; composing it with polar                                                            |

## 4. Precedent

How other systems spell a coordinate system, where it sits, and how layers
share it.

| System          | Spelling                                                                   | Where it sits                                                                     | Layers and nesting                                                                                                                                                                                                               |
| --------------- | -------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ggplot2         | `ggplot(df) + geom_col() + coord_polar()`                                  | added with `+`; position does not matter                                          | one coord per plot; every layer and facet panel shares it. A second `coord_*` replaces the first with the message "Coordinate system already present". No composition of `coord_trans` with `coord_polar`.                       |
| Vega-Lite       | `"projection": {...}` beside `"encoding"`                                  | a property of a unit spec; a layer spec can carry one shared by its layers        | no polar coord: `arc` marks with `theta` and `radius` channels instead. Geo layers share one projection.                                                                                                                         |
| Observable Plot | `Plot.plot({ projection: "albers", marks: [...] })`                        | a top-level plot option                                                           | one projection per plot, shared by every mark and facet; no polar.                                                                                                                                                               |
| D3              | `d3.geoPath(projection)`, `d3.lineRadial()`                                | chosen per path generator, at the point of use                                    | no shared space; each mark brings its own map.                                                                                                                                                                                   |
| matplotlib      | `fig.add_subplot(projection="polar")`; `ax.set_yscale("log")`              | the projection is fixed when the Axes is created (start); scales are set any time | different coords means different Axes. Cartopy adds a per-artist `transform=ccrs.PlateCarree()`, which names the data's coordinate system, not the display's.                                                                    |
| Plotly          | `layout.polar2 = {...}`; trace `{type: "scatterpolar", subplot: "polar2"}` | a named coordinate component in the layout                                        | each trace points at a component by id; several polar or geo components can coexist.                                                                                                                                             |
| ECharts         | `polar: [{...}]`; series `coordinateSystem: "polar", polarIndex: 1`        | named components; each series picks one                                           | same as Plotly. `yAxis: { type: "log" }` is an axis property.                                                                                                                                                                    |
| SwiftUI Charts  | `Chart { ... }.chartYScale(type: .log)`; `SectorMark` for pies             | a modifier at the end                                                             | no polar coordinate system; pies are a mark. Modifiers wrap the view, and in SwiftUI modifier order can matter.                                                                                                                  |
| Typst / CeTZ    | `rotate(45deg)`, `scale(2)` inside a `group({ ... })`                      | a prefix statement that affects what follows in its group                         | groups nest, and inner transforms compose with outer ones. Order matters.                                                                                                                                                        |
| G2 (AntV, v5)   | `{ type: "view", coordinate: { type: "polar" }, children: [...] }`         | a property of a view, or of a mark                                                | "Each view can only have one coordinate system." A mark's coordinate bubbles up and merges with the view's; the first mark's wins. Extra transforms (`transpose`, `fisheye`) go in a `transform` list inside the one coordinate. |
| CSS / SVG       | `<g transform="rotate(30) translate(10 0)">`                               | an attribute on the group that opens the subtree                                  | nested groups compose: the child's transform runs inside the parent's. The order inside one transform list matters.                                                                                                              |

What the survey shows:

- **The dominant pattern is a property of the container**, not a step in the
  mark pipeline: ggplot2's plot, Vega-Lite's unit or layer, Plot's plot, G2's
  view, matplotlib's Axes, Plotly and ECharts's named components, SVG's `<g>`.
  The pipeline (`geom`, marks, series) runs inside it.
- **End-of-chain spellings exist** (ggplot2's `+ coord_polar()`, SwiftUI's
  modifiers), but in ggplot2 the position is meaningless (it is a set of
  components, not a pipeline), and in ggplot2 the coord really is a stage
  after the statistics and position adjustments. That is the model the
  scale-transforms work rejected for GoFish (see `feedback_name_transform_after_target`:
  `scale_y_log10` is the anti-pattern).
- **Start-of-chain spellings exist** where the space is created first and
  things are drawn into it: matplotlib's `projection=` at Axes creation, CeTZ's
  prefix transforms, SVG's opening tag.
- **Nobody composes two polar spaces by nesting.** Where nesting exists (SVG,
  CeTZ), it composes affine transforms. For nonlinear coords, systems either
  forbid a second one (ggplot2, G2's one per view) or put the extra transforms
  inside the one coordinate value (G2's `transform` list).
- **Several spaces side by side** are handled either by several containers
  (matplotlib Axes, ggplot2 cannot), or by named components that marks point
  to (Plotly, ECharts). GoFish's nested boundary is the container approach.

## 5. Decisions already made that constrain the answer

- **Coords live at an explicit `chart()` or `layer` boundary, never on a flow
  operator** (`feedback_coord_at_chart_boundary`, PR #1278). Small multiples
  in another space are a nested chart with a coord. So `.coord()` cannot be
  an operator inside `.flow(...)`, and a `.coord()` method on every node
  (`rect(...).coord(...)`) would break this.
- **Calls, methods and options** (`api-design.md`, Naming): a call joins
  independent parts; a method chain is a universal interface that reads the
  caller's state or turns it into a new object; an option is a local
  adjective of one thing.
- **Log and sqrt positions are coords**, with a `Transform` family behind them,
  and geometry is named after the axis: `coord: { y: Coord.log() }`, keyed
  sugar for one-dimensional coords (`feedback_name_transform_after_target`,
  `project_scale_transforms_proposal`). A warp sets the space's traits; log
  has no zero, so bars from zero on a log axis are a type error.
- **Chrome is elaboration**: a chart is a layer of its plot plus chrome
  children (#1257). The chart's frame is a layer.
- **Consolidate on today's name** and **break cleanly**: the option is named
  `coord` today; whatever we pick, there is one spelling and no shim.
- **One `by` key**, no `xBy`/`yBy`: keyed per-axis values go inside one key.
- **Python uses kwargs** for options; values can still be mappings (Python
  stories already pass `axes={"x": ..., "y": True}`).

## 6. Layer rules that hold under every spelling

The layer question has the same answer whichever spelling wins, because it is
about boundaries, not syntax. These rules describe today's behavior, made
explicit, plus one new rule for composition.

**R1. One coord per boundary, covering everything inside it.** A boundary's
coord covers its flow, its mark, every tier of its `.layer()` chain, and
every child of `layer([...])`. Today the chain case works by hoisting the
root chart's option (fact 2). It should be documented as the rule, not an
accident of `LayerBuilder.resolve`.

**R2. A boundary with no coord is in its parent's space.** A nested chart
without a coord is warped by the enclosing coord and shares its scale root.
This is how a stacked bar in polar becomes rings.

**R3. A boundary with its own coord inside another one is a nested space.**
Its box is placed by the outer space as one glyph. Its interior is not warped
by the outer coord, and its axis names hide the outer ones. This is neither
composition nor override; it is "a picture placed in a picture". Small
multiples (story 2), pie glyphs (3) and the flower head (6) all need exactly
this. Override would be wrong (the outer chart must stay linear around the
pies), and composition would be wrong (a pie at a scatter point must not be
bent by a curved outer space).

**R4. Composition is a property of one coord value, never of nesting or
repetition.** A log radius in polar is one space with a composite map, so it
is one value: `Coord.polar({ r: Coord.log() })` (spelling open, see decision
5). Two boundaries mean two spaces (R3), so nesting cannot also mean
composition. Two `.coord()` calls on one chart, under any method spelling, are
an error that names both and points at the composed form. G2 makes the same
cut: one coordinate per view, with extra transforms inside it.

**R5. Siblings in different coords are separate spaces.** In
`layer([stem, polarHead])` each child is its own box. They share no domains
and no scale. To lay them over each other in the same pixels, align their
boxes with `.relate(...)`, as the flower does. Two sibling charts with the
same coord kind (two `Coord.geo(...)` charts) do not share a projection: each
fits its own window, so their points would not line up. To overlay marks on
a map, put them in the map's boundary (a `.layer()` tier or a child of
`layer({ coord }, ...)`). No automatic merging of same-kind siblings, since
that is a heuristic users would have to model.

**R6. `selectAll` reads placed marks wherever they are; a connector draws in
its own space.** In the polar ribbon story the ribbon and the bars are in one
space, so the ribbons bend with the polar map. A connector in an outer space
that reads marks inside a nested space sees each nested space as the box the
outer space placed. (This is what R3 implies. I did not verify the current
code path for a ref that crosses a coord boundary; it may need a test before
we document it.)

**R7. The coord checks what its whole region synthesizes.** The type rule
reads every tier and child inside the boundary, since all of them are laid
out in the space (fact 5). `stack` gives the y axis a meaningful zero, so
`Coord.log()` on that axis is an error that names both the `stack` and the
coord. Facts flow both ways: the coord passes axis names and traits down, and
the body passes its facts up. Neither is "first", so the type rule does not
by itself pick a position in the chain.

One consequence of fact 6 for the ordering question: **the position of
`.coord()` in a chain can never change what the flow computes**, because the
flow always runs in the space's own coordinates. A spelling where order looks
like it matters suggests a meaning that does not exist.

## 7. The options

Each option is shown on the hard stories, JS first, then Python. Option A is
today's code, copied from the stories (with `clock()` written as
`Coord.clock()`).

### Option A: keep the `coord` option, no method

**Story 1, pie.**

```js
chart(seafood, {
  coord: Coord.clock(),
  axes: true,
  padding: 60,
  w: 400,
  h: 400,
})
  .flow(stack({ by: "species", dir: "x" }))
  .mark(rect({ w: "count", fill: "species" }));
```

```python
(
    chart(SEAFOOD, coord=Coord.clock(), axes=True, padding=60, w=400, h=400)
    .flow(stack(by="species", dir="x"))
    .mark(rect(w="count", fill="species"))
)
```

**Story 2, small multiple pies.**

```js
chart(seafood, { w: 700, h: 140 })
  .flow(spread({ by: "lake", dir: "x", spacing: 20 }))
  .mark(
    chart({ coord: Coord.clock(), w: 100, h: 100, padding: 0 })
      .flow(stack({ by: "species", dir: "x" }))
      .mark(rect({ w: "count", fill: "species" }))
  );
```

```python
(
    chart(SEAFOOD, w=700, h=140)
    .flow(spread(by="lake", dir="x", spacing=20))
    .mark(
        chart(coord=Coord.clock(), w=100, h=100, padding=0)
        .flow(stack(by="species", dir="x"))
        .mark(rect(w="count", fill="species"))
    )
)
```

**Story 4, bird migration.**

```js
chart(world110m, {
  coord: Coord.geo("equalEarth", { lon: [-180, -58.7], lat: [-60, 84] }),
  legend: false,
  w: 800,
  h: 600,
})
  .mark(polygon({ points: "ring", fill: "#f7f7f7", stroke: "#aaa" }))
  .layer(
    chart(birds)
      .flow(
        group({ by: "species" }),
        scatter({ by: "day", x: "lon", y: "lat" })
      )
      .mark(line({ stroke: "species", strokeWidth: 1, opacity: 0.5 }))
  );
```

```python
(
    chart(
        WORLD_110M,
        coord=Coord.geo("equalEarth", lon=(-180, -58.7), lat=(-60, 84)),
        legend=False,
        w=800,
        h=600,
    )
    .mark(polygon(points="ring", fill="#f7f7f7", stroke="#aaa"))
    .layer(
        chart(BIRDS)
        .flow(group(by="species"), scatter(by="day", x="lon", y="lat"))
        .mark(line(stroke="species", stroke_width=1, opacity=0.5))
    )
)
```

**Story 5, polar ribbons.** The combinator form, as in the story:

```js
layer({ coord: Coord.clock(), w: 500, h: 500 }, [
  chart(seafood)
    .flow(
      scatter({ by: "lake", x: "lake", w: 2 * Math.PI }).translate({ y: 50 }),
      stack({ by: field("species").sort("count"), dir: "y" })
    )
    .mark(rect({ w: 0.1, h: "count", fill: "species" }).name("bars")),
  chart(selectAll("bars"))
    .flow(group({ by: "species" }))
    .mark(ribbon({ opacity: 0.8 })),
]);
```

```python
layer(
    [
        chart(SEAFOOD)
        .flow(
            scatter(by="lake", x="lake", w=2 * math.pi).translate(y=50),
            stack(by=field("species").sort("count"), dir="y"),
        )
        .mark(rect(w=0.1, h="count", fill="species").name("bars")),
        chart(select_all("bars"))
        .flow(group(by="species"))
        .mark(ribbon(opacity=0.8)),
    ],
    coord=Coord.clock(),
    w=500,
    h=500,
)
```

The same picture as a chain, where the empty `chart()` takes the previous
tier's marks and no name is needed:

```js
chart(seafood, { coord: Coord.clock(), w: 500, h: 500 })
  .flow(
    scatter({ by: "lake", x: "lake", w: 2 * Math.PI }).translate({ y: 50 }),
    stack({ by: field("species").sort("count"), dir: "y" })
  )
  .mark(rect({ w: 0.1, h: "count", fill: "species" }))
  .layer(
    chart()
      .flow(group({ by: "species" }))
      .mark(ribbon({ opacity: 0.8 }))
  );
```

**Story 6, flower** (siblings in different coords):

```js
const flower = chart({ coord: Coord.polar(), axes: false })
  .flow(stack({ by: "species", dir: "x", h: 40 }))
  .mark(petal({ w: "count", fill: "species" }));

layer([
  rect({ w: 4, h: "count", fill: color.green[5] }).name("stem"),
  flower.name("flower"),
]).relate(({ stem, flower }) => [
  Constraint.align({ x: "middle", y: ["end", "middle"] }, [stem, flower]),
]);
```

```python
flower = (
    chart(coord=Coord.polar(), axes=False)
    .flow(stack(by="species", dir="x", h=40))
    .mark(petal(w="count", fill="species"))
)

layer([
    rect(w=4, h="count", fill=COLORS["colorGreen5"]).name("stem"),
    flower.name("flower"),
]).relate(lambda stem, flower: [
    Constraint.align([stem, flower], x="middle", y=["end", "middle"]),
])
```

**Story 12, log y** (proposed `Coord.log`, keyed per axis):

```js
chart(cities, { coord: { y: Coord.log() } })
  .flow(scatter({ x: "gdp", y: "population" }))
  .mark(circle({ r: 3 }));
```

```python
(
    chart(CITIES, coord={"y": Coord.log()})
    .flow(scatter(x="gdp", y="population"))
    .mark(circle(r=3))
)
```

The low-level stories (7, 8, 9, 10) are unchanged under every option, since
they have no chart: `layer({ coord: Coord.clock() }, [stackX(...)])`.

How A answers the layer questions: the option is on the boundary, so R1 to R7
read directly. A `.layer()` chain is covered by the first chart's option; this
is fact 2, and it is the one place where A reads oddly, since the option sits
on the first tier but frames the whole chain.

Fit with the rules: `coord` is an adjective of the frame, set beside the other
frame adjectives (`w`, `h`, `padding`, `axes`). `padding` only does anything
with a nonlinear coord, so keeping them in one bag keeps them together. One
key on both boundaries, so the builder and combinator surfaces match. IR and
Python do not change. The keyed log form is a dict in Python, which matches
how `axes` is passed today but reads worse than kwargs.

### Option B: `.coord(...)` at the end of the chain

**Story 1.**

```js
chart(seafood, { axes: true, padding: 60, w: 400, h: 400 })
  .flow(stack({ by: "species", dir: "x" }))
  .mark(rect({ w: "count", fill: "species" }))
  .coord(Coord.clock());
```

```python
(
    chart(SEAFOOD, axes=True, padding=60, w=400, h=400)
    .flow(stack(by="species", dir="x"))
    .mark(rect(w="count", fill="species"))
    .coord(Coord.clock())
)
```

**Story 2.**

```js
chart(seafood, { w: 700, h: 140 })
  .flow(spread({ by: "lake", dir: "x", spacing: 20 }))
  .mark(
    chart({ w: 100, h: 100, padding: 0 })
      .flow(stack({ by: "species", dir: "x" }))
      .mark(rect({ w: "count", fill: "species" }))
      .coord(Coord.clock())
  );
```

```python
(
    chart(SEAFOOD, w=700, h=140)
    .flow(spread(by="lake", dir="x", spacing=20))
    .mark(
        chart(w=100, h=100, padding=0)
        .flow(stack(by="species", dir="x"))
        .mark(rect(w="count", fill="species"))
        .coord(Coord.clock())
    )
)
```

Move one closing parenthesis and the coord attaches to the outer chart:

```js
chart(seafood, { w: 700, h: 140 })
  .flow(spread({ by: "lake", dir: "x", spacing: 20 }))
  .mark(
    chart({ w: 100, h: 100, padding: 0 })
      .flow(stack({ by: "species", dir: "x" }))
      .mark(rect({ w: "count", fill: "species" }))
  )
  .coord(Coord.clock());
```

This is valid code with a very different picture: one polar space, with the
lakes spread around the circle and the species stacked inside each lake's
wedge. Nothing errors.

**Story 4.**

```js
chart(world110m, { legend: false, w: 800, h: 600 })
  .mark(polygon({ points: "ring", fill: "#f7f7f7", stroke: "#aaa" }))
  .layer(
    chart(birds)
      .flow(
        group({ by: "species" }),
        scatter({ by: "day", x: "lon", y: "lat" })
      )
      .mark(line({ stroke: "species", strokeWidth: 1, opacity: 0.5 }))
  )
  .coord(Coord.geo("equalEarth", { lon: [-180, -58.7], lat: [-60, 84] }));
```

```python
(
    chart(WORLD_110M, legend=False, w=800, h=600)
    .mark(polygon(points="ring", fill="#f7f7f7", stroke="#aaa"))
    .layer(
        chart(BIRDS)
        .flow(group(by="species"), scatter(by="day", x="lon", y="lat"))
        .mark(line(stroke="species", stroke_width=1, opacity=0.5))
    )
    .coord(Coord.geo("equalEarth", lon=(-180, -58.7), lat=(-60, 84)))
)
```

Here B reads well: "draw the land and the birds, in this projection", and
the coord sits on the whole chain, not on the first tier, which fixes A's one
oddity. But the same parenthesis trap applies, and it is worse here: put the
`.coord(...)` inside the `.layer(...)` and the birds become their own geo
space, fitted to their own window, drawn over a basemap they no longer line
up with (R5). And `chart(world).mark(...).coord(geo).layer(birds)` must also
mean something: either the whole chain (then position is meaningless, which
is option D) or the first tier only (then the birds are outside the map), or
an error ("call `.coord()` last").

**Story 5.** The chain form:

```js
chart(seafood, { w: 500, h: 500 })
  .flow(
    scatter({ by: "lake", x: "lake", w: 2 * Math.PI }).translate({ y: 50 }),
    stack({ by: field("species").sort("count"), dir: "y" })
  )
  .mark(rect({ w: 0.1, h: "count", fill: "species" }))
  .layer(
    chart()
      .flow(group({ by: "species" }))
      .mark(ribbon({ opacity: 0.8 }))
  )
  .coord(Coord.clock());
```

```python
(
    chart(SEAFOOD, w=500, h=500)
    .flow(
        scatter(by="lake", x="lake", w=2 * math.pi).translate(y=50),
        stack(by=field("species").sort("count"), dir="y"),
    )
    .mark(rect(w=0.1, h="count", fill="species"))
    .layer(chart().flow(group(by="species")).mark(ribbon(opacity=0.8)))
    .coord(Coord.clock())
)
```

The combinator form keeps `layer({ coord: Coord.clock(), w: 500, h: 500 }, [...])`,
unless `layer(...)` also gets a `.coord()` method, which would put a coord
method on a mark (`layer` returns a mark) and invite `rect(...).coord(...)`.
So B has two spellings of one thing: a method on the builder and an option on
the combinator.

**Story 6.**

```js
const flower = chart({ axes: false })
  .flow(stack({ by: "species", dir: "x", h: 40 }))
  .mark(petal({ w: "count", fill: "species" }))
  .coord(Coord.polar());
```

```python
flower = (
    chart(axes=False)
    .flow(stack(by="species", dir="x", h=40))
    .mark(petal(w="count", fill="species"))
    .coord(Coord.polar())
)
```

**Story 12.**

```js
chart(cities)
  .flow(scatter({ x: "gdp", y: "population" }))
  .mark(circle({ r: 3 }))
  .coord({ y: Coord.log() });
```

```python
(
    chart(CITIES)
    .flow(scatter(x="gdp", y="population"))
    .mark(circle(r=3))
    .coord(y=Coord.log())
)
```

In Python the method takes the keyed form as kwargs, which reads better than
A's dict.

Fit with the rules: B reads like ggplot2's `+ coord_polar()`, and like a type
checker that synthesizes the body first and then checks it. But it teaches
the model GoFish rejected: "lay out, then view in polar". In GoFish the
layout runs inside the space (facts 4 to 6). `stack({ dir: "theta" })` uses a
name that only the coord introduces, and in B that name is used several lines
before the reader learns where it comes from. B also needs a new IR field on
the `.layer()` chain node, since the coord would no longer belong to the root
tier.

### Option C: `.coord(...)` at the start, right after `chart(...)`

**Story 1.**

```js
chart(seafood, { axes: true, padding: 60, w: 400, h: 400 })
  .coord(Coord.clock())
  .flow(stack({ by: "species", dir: "theta" }))
  .mark(rect({ w: "count", fill: "species" }));
```

```python
(
    chart(SEAFOOD, axes=True, padding=60, w=400, h=400)
    .coord(Coord.clock())
    .flow(stack(by="species", dir="theta"))
    .mark(rect(w="count", fill="species"))
)
```

(`dir: "theta"` is legal today; the stories write `"x"`. Reading the space
first makes the polar names the natural choice.)

**Story 2.**

```js
chart(seafood, { w: 700, h: 140 })
  .flow(spread({ by: "lake", dir: "x", spacing: 20 }))
  .mark(
    chart({ w: 100, h: 100, padding: 0 })
      .coord(Coord.clock())
      .flow(stack({ by: "species", dir: "theta" }))
      .mark(rect({ w: "count", fill: "species" }))
  );
```

```python
(
    chart(SEAFOOD, w=700, h=140)
    .flow(spread(by="lake", dir="x", spacing=20))
    .mark(
        chart(w=100, h=100, padding=0)
        .coord(Coord.clock())
        .flow(stack(by="species", dir="theta"))
        .mark(rect(w="count", fill="species"))
    )
)
```

The coord sits right after the `chart(...)` it belongs to. Attaching it to the
outer chart takes writing it after the outer `chart(...)`, not moving a
parenthesis.

**Story 4.**

```js
chart(world110m, { legend: false, w: 800, h: 600 })
  .coord(Coord.geo("equalEarth", { lon: [-180, -58.7], lat: [-60, 84] }))
  .mark(polygon({ points: "ring", fill: "#f7f7f7", stroke: "#aaa" }))
  .layer(
    chart(birds)
      .flow(
        group({ by: "species" }),
        scatter({ by: "day", x: "lon", y: "lat" })
      )
      .mark(line({ stroke: "species", strokeWidth: 1, opacity: 0.5 }))
  );
```

```python
(
    chart(WORLD_110M, legend=False, w=800, h=600)
    .coord(Coord.geo("equalEarth", lon=(-180, -58.7), lat=(-60, 84)))
    .mark(polygon(points="ring", fill="#f7f7f7", stroke="#aaa"))
    .layer(
        chart(BIRDS)
        .flow(group(by="species"), scatter(by="day", x="lon", y="lat"))
        .mark(line(stroke="species", stroke_width=1, opacity=0.5))
    )
)
```

"This chart is a map; draw the land, then layer the birds on it." The tiers
are added to a chart that is already in the projection, so R1 reads off the
spelling, with no hidden hoisting.

**Story 5.**

```js
chart(seafood, { w: 500, h: 500 })
  .coord(Coord.clock())
  .flow(
    scatter({ by: "lake", x: "lake", w: 2 * Math.PI }).translate({ y: 50 }),
    stack({ by: field("species").sort("count"), dir: "r" })
  )
  .mark(rect({ w: 0.1, h: "count", fill: "species" }))
  .layer(
    chart()
      .flow(group({ by: "species" }))
      .mark(ribbon({ opacity: 0.8 }))
  );
```

```python
(
    chart(SEAFOOD, w=500, h=500)
    .coord(Coord.clock())
    .flow(
        scatter(by="lake", x="lake", w=2 * math.pi).translate(y=50),
        stack(by=field("species").sort("count"), dir="r"),
    )
    .mark(rect(w=0.1, h="count", fill="species"))
    .layer(chart().flow(group(by="species")).mark(ribbon(opacity=0.8)))
)
```

The combinator form keeps the option, as in B.

**Story 6.**

```js
const flower = chart({ axes: false })
  .coord(Coord.polar())
  .flow(stack({ by: "species", dir: "theta", h: 40 }))
  .mark(petal({ w: "count", fill: "species" }));
```

```python
flower = (
    chart(axes=False)
    .coord(Coord.polar())
    .flow(stack(by="species", dir="theta", h=40))
    .mark(petal(w="count", fill="species"))
)
```

**Story 12.**

```js
chart(cities)
  .coord({ y: Coord.log() })
  .flow(scatter({ x: "gdp", y: "population" }))
  .mark(circle({ r: 3 }));
```

```python
(
    chart(CITIES)
    .coord(y=Coord.log())
    .flow(scatter(x="gdp", y="population"))
    .mark(circle(r=3))
)
```

Rules for C: `.coord()` is allowed only before `.flow`, `.mark` and `.layer`,
and at most once. In TypeScript the builder type can enforce that (the method
is missing after `.flow`). In Python it is a runtime error. It sets the same
field the option sets today, so the IR does not change.

Fit with the rules: C reads as lexical scope. The space is declared first,
then the names it declares (`theta`, `r`, `lon`, `lat`) are used. It matches
matplotlib's projection at Axes creation, CeTZ's prefix transforms and SVG's
opening tag. Like B, it leaves the combinator with an option, so there are two
spellings of one setting. And it pulls `coord` out of the bag that keeps its
companions (`padding`, `axes`, `w`, `h`), so the frame is configured in two
places. Against A, the gain is readability and Python kwargs for the keyed
form, not meaning: `chart(data).coord(c)` and `chart(data, { coord: c })` are
the same node.

On the methods-versus-options rule: the case for a method is that the coord
reads its body's synthesized types. But so do `axes` (they show the spaces'
types), `legend` (it reads the color scale), and `w`/`h` (they fit the body's
extents), and those are options. The coord is not a universal interface in the
way `.name`, `.zOrder`, `.hidden` and `.label` are; it exists only on a
boundary. By the rule as written, `coord` is an adjective of the frame, which
argues for A. If chrome later moves to methods (`.axes()`, `.legend()`), the
frame becomes a set of methods and `.coord()` should join them.

### Option D: `.coord(...)` anywhere in the chain, one meaning

`.coord(c)` sets the coord of the chain's frame, wherever it is written:
after `chart(...)`, after `.mark`, after `.layer`. All of these are the same
chart:

```js
chart(seafood)
  .coord(Coord.clock())
  .flow(stack({ by: "species", dir: "theta" }))
  .mark(rect({ w: "count" }));
chart(seafood)
  .flow(stack({ by: "species", dir: "theta" }))
  .coord(Coord.clock())
  .mark(rect({ w: "count" }));
chart(seafood)
  .flow(stack({ by: "species", dir: "theta" }))
  .mark(rect({ w: "count" }))
  .coord(Coord.clock());
```

This matches fact 6 (order cannot change what the flow computes) and
ggplot2's order-free `+`, and it needs no ordering error. But it gives three
spellings of one chart, and readers will read the middle one as "stack in
linear space, then the mark in polar", which is not a thing GoFish can do. It
also keeps B's parenthesis trap for nested charts and `.layer()` tiers, since
"anywhere in this chain" still depends on which chain the call lands on.
Python and IR as in C.

### Option E: a wrapping form

```js
Coord.clock(
  chart(seafood)
    .flow(stack({ by: "species", dir: "theta" }))
    .mark(rect({ w: "count", fill: "species" }))
);
```

```python
Coord.clock(
    chart(SEAFOOD)
    .flow(stack(by="species", dir="theta"))
    .mark(rect(w="count", fill="species"))
)
```

GoFish already has the wrapping form: `layer({ coord: Coord.clock() }, [chart(...)])`.
E would make every `Coord` member both a strategy value (what the `coord`
option takes) and a combinator, which the strategy-family rule does not allow
(a family member is a value; calling it sets options). With a body as its
argument, `Coord.geo("equalEarth", { lon }, chart(...))` also has no room for
the frame's `w`, `h` and `padding`. E adds nothing that `layer({ coord }, ...)`
does not already say.

## 8. Composing coords

The draft's `.coord(log("y"))` and the scale-transforms work raise one more
case: a log radius inside polar, or a log y in a plain chart.

Three spellings are possible:

1. **One composed value** (recommended under every option above):

   ```js
   chart(cities, { coord: { y: Coord.log() } });
   chart(sales, { coord: Coord.clock({ r: Coord.log() }) });
   ```

   ```python
   chart(CITIES, coord={"y": Coord.log()})
   chart(SALES, coord=Coord.clock(r=Coord.log()))
   ```

   A space is a set of one-axis warps (log, and later sqrt-area, which is the
   proposed `Coord.clock({ radius: "area" })`) followed by one two-axis map
   (identity, polar, geo, wavy). The per-axis warps are keyed by the axis
   names of the map they feed (`r`, `theta` for polar; `x`, `y` for the
   identity map). This shape has only one meaningful order: a log of the
   polar output would be a log of pixels, which means nothing. So no order
   needs to be written. This matches G2, where extra transforms live inside
   the one coordinate.

2. **Repeated calls**, `.coord(Coord.log("y")).coord(Coord.clock())`:
   ambiguous between composition, override and nesting, and order-sensitive
   in a way the reader cannot check. Reject, and make the second call an
   error that suggests the composed value.

3. **A list**, `coord: [Coord.log("y"), Coord.clock()]`, like SVG's transform
   list: general function composition, but it has to say which way the list
   applies, and most orders are meaningless (log after geo). Reject until a
   real example needs a general chain.

Nesting two boundaries never composes (R3). That keeps one meaning for
nesting, the one small multiples need.

The type rule reads naturally with the composed value: the space's traits are
the warp's traits (log y: no zero, identity 1), so a `stack` on y inside
`{ y: Coord.log() }` is the error the scale-transforms proposal describes, and
the same `stack` along `theta` inside `Coord.clock({ r: Coord.log() })` is
fine.

## 9. Comparison and recommendation

| Question                                         | A option                 | B end                       | C start  | D anywhere | E wrapper            |
| ------------------------------------------------ | ------------------------ | --------------------------- | -------- | ---------- | -------------------- |
| Order can mislead about what the flow computes   | no                       | yes ("then view in polar")  | no       | yes        | no                   |
| Misplaced parenthesis silently changes the space | no                       | yes (nested charts, tiers)  | rarely   | yes        | no                   |
| Names (`theta`, `lon`) declared before use       | yes                      | no                          | yes      | sometimes  | no                   |
| Chain covered by the coord, visible in spelling  | no (hoisted from tier 1) | yes                         | yes      | depends    | yes                  |
| Same spelling on chart and `layer([...])`        | yes                      | no                          | no       | no         | no (new third form)  |
| Frame settings kept together (`padding`, `axes`) | yes                      | no                          | no       | no         | no                   |
| IR change                                        | none                     | new field on the chain node | none     | none       | new node or sugar    |
| Python keyed form (`y=Coord.log()`)              | dict value               | kwargs                      | kwargs   | kwargs     | n/a                  |
| Matches methods-vs-options rule as written       | yes (frame adjective)    | arguable                    | arguable | arguable   | no (family = values) |

**Recommendation: A, keep `coord` as the boundary's option, with the rules of
section 6 written down and the composed value of section 8.** Reasons:

- The chart's frame is a `layer` with the chart's options (fact 1). One
  `coord` key on both boundaries is one concept with one spelling across both
  surfaces.
- The coord sits at the head of the chart it opens, beside `padding`, `axes`,
  `w` and `h`, which are its companions. No parenthesis can carry it to the
  wrong chart.
- It says what GoFish does: the space comes first and the layout runs inside
  it. Nothing about the coord depends on chain order, so the spelling has no
  order.
- Nothing changes in the IR, in Python, or in any story.

What A leaves to fix: its one oddity is that the first chart's option frames
the whole `.layer()` chain (fact 2). That is right in meaning (R1) and should
be documented in the `chart` and `.layer()` reference pages. If Josh finds it
too hidden, C fixes it with no change in meaning.

**Runner-up: C, `chart(data).coord(c)` at the start**, allowed once and only
before `.flow`, `.mark` and `.layer`. It keeps A's meaning and its safety from
misplaced parentheses, reads as a scope ("in this space, do ..."), declares
`theta` and `lon` before they are used, and gives Python
`.coord(y=Coord.log())`. Its costs are two spellings (method on the builder,
option on the combinator) and splitting the frame's settings across a bag and
a method.

**Not recommended: B (end of chain).** It reads like ggplot2, and it fits the
geo-plus-overlay chain well, but it teaches "lay out, then view in polar",
which is not how GoFish works, and a misplaced parenthesis silently turns a
nested space into a whole-chart space or splits a map from its overlay. D
inherits both problems; E duplicates `layer({ coord })`.

**What would change my mind:**

- If chrome becomes methods (`.axes(...)`, `.legend(...)`) as part of the
  chrome-as-elaboration work, the frame becomes a set of methods, and C is
  then the consistent choice for `.coord()`.
- If Josh weighs a chain that reads as one sentence above one spelling across
  both surfaces, C wins.
- If the type rule's error messages turn out much clearer when the coord
  comes after the body (a checker that reports "this `stack` makes a zero,
  and the coord below has none"), that is a small point for B, though the
  error can name both places under any spelling.
- If a real example needs a different coord per `.layer()` tier in the same
  pixels (not as glyphs), none of these options handle it, and we would need
  to revisit R5.

## 10. Decisions for Josh

1. Keep `coord` as an option on `chart(...)` and `layer(...)` (A), or add a
   `chart(data).coord(c)` method at the start of the chain (C)? End of chain
   (B) is not recommended for the reasons in section 9.
2. If C: does the combinator keep `layer({ coord }, [...])` as an option (two
   spellings of one setting), or does `layer` move too, and how, given that
   `layer(...)` returns a mark?
3. Are the layer rules R1 to R7 right? In particular: a nested boundary with
   its own coord is a glyph-placed space, never composed and never
   overridden (R3); and sibling charts with the same coord kind do not share
   a projection (R5).
4. Should a second coord on one boundary (two `.coord()` calls, or a coord
   both in the options and in a method) be an error that points at the
   composed value?
5. Composition spelling: per-axis warps inside the one coord value, keyed by
   that coord's axis names (`{ y: Coord.log() }`, `Coord.clock({ r: Coord.log() })`)?
   And is `Coord.clock({ radius: "area" })` then `Coord.clock({ r: Coord.area() })`,
   so area and log are the same kind of thing?
6. Should `padding` move into the coord value (`Coord.clock({ padding: 40 })`),
   since it only applies to a nonlinear space? This matters more if the coord
   leaves the option bag (C).
7. Should the reference pages document that a `.layer()` chain shares the
   first chart's space (R1), and should the stories write polar and geo axis
   names (`dir: "theta"`) instead of `"x"`/`"y"` inside a coord?
