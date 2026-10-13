---
title: "How Axes Work: Datatypes, Chrome, and Chart Boundaries"
section: Speculative Notes
order: 66
status: speculative
---

# How axes work

This note records what we learned about axes while working on
[#1032](https://github.com/gofish-graphics/gofish-graphics/issues/1032) (the size of a
plot with and without its axes),
[#1114](https://github.com/gofish-graphics/gofish-graphics/issues/1114) (where scale
domains are decided), and
[#1115](https://github.com/gofish-graphics/gofish-graphics/issues/1115) (hierarchical
axes). It is a map of the ideas and how they fit together. It does not describe the
machinery. For that, read [Axes](/internals/frontend/axes) (how axes are built from
ordinary shapes), [Underlying Space](/internals/core/underlying-space) (spaces,
measures, and scale scopes), and [Layout and Render Passes](/internals/layout/passes).

The ideas are at different stages. Each one carries one of three labels:

- **Built**: it is on `main` today.
- **Decided**: the maintainer agreed to it in an issue or a design review, and it is
  not built yet.
- **Proposed**: it is a design direction with open questions.

A few terms first. A **domain** is the range of data values a scale covers, e.g. 0 to
120 tons. A **range** is the pixels those values map onto, e.g. 0 to 300 px. A **scale
scope** is the part of the tree that shares one scale on an axis. **Chrome** means
everything drawn around a plot to explain it: axis lines, ticks, tick labels, axis
titles, and legends.

## 1. An axis shows a datatype

**Decided.** The principle comes from
[#984](https://github.com/gofish-graphics/gofish-graphics/issues/984) and the
signed-extent work in
[#773](https://github.com/gofish-graphics/gofish-graphics/issues/773).

An axis is a picture of a datatype. It is not a fixed ruler that every chart shares.
The axis gets its shape from the structure of the type it shows. A number with a true
zero gets a ruler that starts at 0. A response scale with a middle gets a center
point. A date gets nested calendar units. So there are about as many kinds of axis as
there are kinds of data.

This follows from the expressiveness principle (Mackinlay): a graphic should show the
facts in the data and no more. An axis that shows a 0 for data with no meaningful
zero, or a single ruler for data that has several units, claims something the data
does not say.

The cases we have met so far, from #1115:

| Chart                  | What the axis has to show                                        | Status                                                                           |
| ---------------------- | ---------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Diverging stacked bars | A center point, with positive labels on both sides of it         | Built: a mirrored axis labels each tick by its distance from 0                   |
| Time                   | Nested calendar units, e.g. days inside months inside years      | Built: one row of labels per calendar partition (#1066)                          |
| Binning                | Bin edges, not points                                            | Proposed                                                                         |
| Streamgraph            | A layout with no meaningful zero                                 | Built: a centered layout gets a difference axis that labels steps, not positions |
| Grouped bars           | Nested categories, with the groups outside and the series inside | Built: nested rows of category labels                                            |
| Mosaic plot            | Nested conditional shares                                        | Proposed (see [section 5](#_5-the-mosaic-plot))                                  |

The built rows each read their shape off the column's type. The diverging case is a
good example. The schema says the response column has an order with a midpoint, and
the stack puts its 0 there. Nothing on the axis is set by hand:

```ts
// stories/forwardsyntax/Bar/Diverging.stories.tsx (Likert)
chart(survey, {
  schema: { response: Schema.ordered(LEVELS).diverging() },
  color: likertColors,
  axes: { x: { title: "Respondents" }, y: true },
})
  .flow(
    spread({ by: "question", dir: "y" }),
    stack({ by: "response", dir: "x" })
  )
  .mark(rect({ w: "count", fill: "response" }));
```

The time axis works the same way. A `Schema.time()` column gives a calendar, and the
axis draws one row per calendar level:

```ts
// stories/forwardsyntax/Time.stories.tsx
chart(prices, { schema: { date: Schema.time() }, axes: true })
  .flow(scatter({ by: "date", x: "date", y: "price" }))
  .mark(line({ stroke: "steelblue", strokeWidth: 2 }));
```

The design rule that follows: the origin, the center, and the units belong to the
datatype. They are not axis options with a default of 0 and an override. Where the
code still hard-codes an origin of 0 (`measureOrigin` in `domain.ts`), that is a
known gap tracked by #984.

## 2. Chrome and size

**Built** today: a node's `w`/`h` and the render `w`/`h` both mean the plot. Chrome
hangs outside the plot, and the SVG grows to fit it (see "Chrome Reservation" in
[Layout and Render Passes](/internals/layout/passes)).

**Decided** in the design review of #1032, not built yet: the split below.

The question is what `w` and `h` mean when a node has chrome. There are two boxes. The
**plot** is the area the data is drawn in. The **whole graphic** is the plot plus its
chrome. The rule gives each box to a different knob:

- **A node's `w`/`h` is its plot, without chrome.** This is what you want when you
  set a size by hand. You get round numbers (five 24 px bars in a 200 px plot) and
  exact aspect ratios, whatever the tick labels turn out to be. It works at any depth,
  including inside facets.
- **The space a parent gives a node is the whole graphic.** That space may be a
  spread slice, a grid cell, or, at the root, `render({ w, h })`. The node's chrome
  must fit inside it.
- **The canvas does not know what chrome is.** The root takes its slot from the
  canvas, subtracts its own chrome, and gives what is left to its content. This is
  the same step every node takes with the slot its parent gives it, so the root is
  not a special case.

The layout engine already keeps these apart. An **allocation** is the box a parent
gives a child. A **claim** is the size a node asks for. A literal `w`/`h` is a claim,
and it overflows when the allocation is too small. So the render size and a node's
`w`/`h` are not two meanings of one word. They are two different things that already
exist.

At the root this gives three cases:

1. Only the render size is set. The plot gets what is left after the chrome.
2. Only the plot's `w`/`h` is set. The plot has exactly that size, and the graphic is
   the plot plus its chrome. This case needs intrinsic size inference (#494).
3. Both are set. They may conflict, and a conflict is handled like any other
   over-constrained layout.

### Precedent

Other systems split the same way, but each picks a different default:

| System              | What `width`/`height` means | How you size the other box                                                  |
| ------------------- | --------------------------- | --------------------------------------------------------------------------- |
| CSS                 | the content box by default  | `box-sizing: border-box` makes `width` include padding and border           |
| Vega-Lite           | the plot area by default    | `autosize: { type: "fit", contains: "padding" }` makes it the whole graphic |
| ggplot2, matplotlib | the whole figure            | a separate tool, e.g. `ggh4x::force_panelsizes`                             |
| Observable Plot     | the whole SVG               | explicit `marginLeft` and similar options; the plot is what is left         |

GoFish ends up closest to CSS with `box-sizing: content-box`: chrome sits outside the
node it belongs to, like a border. If people later want a node's own `w` to mean its
outer box, an opt-in object form such as `w: { outer: 300 }` would follow CSS's path,
which kept `content-box` as the default and added `border-box` later.

## 3. Chrome lives at chart boundaries

**Built:** chrome belongs to a node. Since #1040 (#681), chrome is built per node, as
rings of ordinary shapes around that node's content, not once at the root.

**Decided** (#1114, rule 4): axes are drawn only at `chart()` boundaries. An axis is
drawn at the chart where its domain is decided (see section 4).

**Proposed**, in draft PR #1110: `axes: true` becomes the default for `chart()`. A
bare node rendered without a chart still draws no axes.

Facets fall out of this rule with no special case. In a faceted chart, the outer
chart decides the shared domain, so it draws the shared axis and the panel labels.
Each inner chart that decides its own domain draws its own axes. Here is the faceted
scatter as it is written today:

```ts
// stories/forwardsyntax/FacetedChart.stories.tsx (FacetedScatterDriving)
chart(drivingShifts, { axes: true })
  .flow(
    spread({ by: "side", dir: "x", spacing: 50 }),
    scatter({ x: "year", y: "miles", axes: { x: true, y: false } })
  )
  .mark(circle({ r: 3, fill: "#4682b4" }));
```

The `axes: { x: true, y: false }` on the inner `scatter` is there today to ask for an
x axis under each panel. Under the chart-boundary rule, where each axis is drawn
follows from where its domain is decided.

## 4. Domains at chart boundaries, ranges at every node

**Decided** in #1114. Not built yet.

### The problem

A scale scope does two jobs today. It decides the **domain**, and it decides the
**range**. Several things start a new scope: spread panels along the spread's
direction, a fixed `w` or `h` on a node (a "self-scaled" region, see
[Underlying Space](/internals/core/underlying-space#self-scaling-regions-an-explicit-or-data-valued-size-absorbs-an-axis)),
and a coordinate transform. Because one scope bundles both jobs, setting a size can
split a domain by accident. Three cases:

- **Faceted scatter.** In `FacetedScatterDriving` above, the "top" panel's x runs
  from 1955 to 2000 while the other panels run from 1955 to 2010. The panels look
  aligned, but they are not.
- **Grouped bars.** Put `h: 150` on the inner groups of a grouped bar chart, and each
  group scales its own data. A's 0.9, B's 1.1 and C's 0.6 all draw 150 px tall, and
  the y axis disappears:

  ```ts
  chart(seafood, { axes: true })
    .flow(
      spread({ by: "lake", dir: "x" }),
      stack({ by: "species", dir: "x", h: 150 }) // splits the y domain today
    )
    .mark(rect({ h: "count", fill: "species" }));
  ```

- **Chart size.** `chart(data, { w, h })` loses its y axis, because the chart becomes
  a self-scaled region.

### The rule

1. **Domains are decided only at `chart()` boundaries, separately for each axis.** A
   coordinate transform also decides domains, because it changes the space. In the
   fluent API a coordinate transform already comes through `chart({ coord })`. The
   render root is always a boundary.
2. **Every node maps its domain into its own size.** That size is its slot or its
   fixed `w`/`h`. A size never splits a domain.
3. **Nested charts share; separate charts do not.** A chart used as the mark of
   another chart is repeated once per partition of the data. It uses the same fields,
   so it shares its parent's domains, like a Vega-Lite facet. Separate `chart()`
   calls placed side by side are different specs, so their domains are independent,
   like Vega-Lite concat. There is no syntax yet to override either default. We will
   add it when a story needs it.
4. **Axes are drawn at the chart where their domain is decided** (section 3).

Under this rule the grouped bar above keeps one y domain, so 1.1 maps to 150 px in
every group. The facet panels share one x domain. `chart(data, { w, h })` keeps its
axis. A marginal histogram still works: its x is shared with the scatter, and its
count y is a separate chart with its own domain.

### The census

An instrumented run over all 440 stories found 391 that solve scales only at the
render root. The other 49 start a scope lower down:

| Outcome                                      | Stories | Examples                                                                           |
| -------------------------------------------- | ------: | ---------------------------------------------------------------------------------- |
| Render the same                              |      39 | coordinate transforms, the colorbar legend, charts nested in a `frame`             |
| Change in a neutral or better way            |       7 | facet panels end up on one domain; low-level bars beside data-free content rescale |
| Look broken if a chart had one bundled scale |       3 | `NestedCharts`, `Flower Chart`, `Nested Mosaic`                                    |

Under rule 2 none of the 3 break. `NestedCharts` becomes an honest grouped bar chart
with one shared y axis, which fixes it. `Flower Chart` keeps one circle per flower,
because each flower is a `chart({ coord })` (#1113). `Nested Mosaic` keeps its
layout, for the reason in the next section.

## 5. The mosaic plot

**Built:** the mosaic layout. **Proposed:** an axis that reads correctly.

Here is the mosaic story:

```ts
// stories/lowlevel/NestedMosaicChart.stories.tsx
chart(titanic, { axes: true })
  .flow(
    stack({ by: "class", dir: "y", size: field("count").normalize() }),
    stack({ by: "sex", dir: "x", size: field("count").normalize() }),
    stack({ by: "survived", dir: "y", size: field("count").normalize() })
  )
  .mark(
    rect({ fill: (d) => (d.survived === "No" ? gray : classColor[d.class]) })
  );
```

Each `normalize()` turns the counts at its level into shares, so each box is a share
of its parent box. The layout works today only because each level silently becomes
its own scale scope (the "space-filling spine" in
[Underlying Space](/internals/core/underlying-space#space-filling-spines-normalize-self-scales-a-stacking-axis)).
Under the #1114 rule it keeps working for a cleaner reason: every level's shares
cover the same 0 to 1 domain, and every box maps that domain into its own size.

The axis is wrong, and it stays wrong after #1114. The y axis reads "count share by
class" from 0 to 1. That reading is right only at the class boundaries. The survived
split inside each column is a share of that column, drawn into the row's height. So
Crew men look like 9% survived, but the true figure is 192 of 862, or 22%.

The reason is that the levels are **different measures**. In GoFish a measure is a
type (see "Measures: units are types" in
[Underlying Space](/internals/core/underlying-space#measures-units-are-types)): a
share of all passengers by class and a share of one column by survival do not have
the same unit. One ruler cannot show two units. This is the same lesson as section 1,
seen from the other side.

The mosaic literature already has the answer. It labels each level along the margins
instead of drawing one ruler (Hofmann, "Mosaic Plots and Their Variants", in the
_Handbook of Data Visualization_). The proposal in #1115:

- A chart's axis can be **hierarchical**. One axis can carry nested groupings or
  nested measures, and it draws them as nested levels.
- This builds on an earlier idea, **measure-keyed spaces per axis**: each axis holds a
  set of spaces keyed by measure, instead of one space. A hierarchical axis is how to
  draw such a set when its keys are nested.
- Grouped bars already draw nested category rows, and the time axis already draws
  nested calendar rows. These would become two instances of the same mechanism, and
  the mosaic would be a third.

## 6. Open questions

From #1115:

- How does a child declare its measure key? It could reuse `Measure`.
- How does the axis decide how levels nest? It could follow the nesting of the
  operators, or the nesting of the measures.
- What does a hierarchical axis look like for each case in the table in section 1? A
  mosaic might show category labels at each level, a share ruler, or both.

## Related

- [#493](https://github.com/gofish-graphics/gofish-graphics/issues/493): the axis
  region should take part in space allocation. #1032 is the rule that came out of it.
- [#494](https://github.com/gofish-graphics/gofish-graphics/issues/494): inferring the
  graphic's size when no size is given.
- [#984](https://github.com/gofish-graphics/gofish-graphics/issues/984): rebuild the
  space kinds from capabilities, so a type states which structures it has.
- [#256](https://github.com/gofish-graphics/gofish-graphics/issues/256): the time
  datatype.
- [#985](https://github.com/gofish-graphics/gofish-graphics/pull/985): signed `h`/`w`
  grows from the axis's 0, and free extents carry an ascent and a descent.
