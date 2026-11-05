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
| Time                   | Nested calendar units, e.g. days inside months inside years      | Built: one row of labels per calendar partition (#1066), set with `levels`       |
| Binning                | Bin edges, not points                                            | Built: cells label between their edges (#1133)                                   |
| Streamgraph            | A layout with no meaningful zero                                 | Built: a centered layout gets a difference axis that labels steps, not positions |
| Grouped bars           | Nested categories, with the groups outside and the series inside | Built: nested rows of category labels, set with `levels`                         |
| Mosaic plot            | Nested conditional shares                                        | Proposed (see [section 5](#_5-the-mosaic-plot))                                  |

The built rows each read their shape off the column's type. The diverging case is a
good example. The schema says the response column has an order with a midpoint, and
the stack puts its 0 there. Nothing on the axis is set by hand:

```ts
// stories/forwardsyntax/Bar/Diverging.stories.tsx (Likert)
chart(survey, {
  schema: {
    response: Unit({
      domain: Domain.ordered(LEVELS),
      traits: [Trait.diverging()],
    }),
  },
  color: likertColors,
  axes: { x: { title: "Respondents" }, y: true },
})
  .flow(
    spread({ by: "question", dir: "y" }),
    stack({ by: "response", dir: "x" })
  )
  .mark(rect({ w: "count", fill: "response" }));
```

The time axis works the same way. A `Unit.time()` column gives a calendar, and the
axis draws one row per calendar level:

```ts
// stories/forwardsyntax/Time.stories.tsx
chart(prices, { schema: { date: Unit.time() } })
  .flow(scatter({ by: "date", x: "date", y: "price" }))
  .mark(line({ stroke: "steelblue", strokeWidth: 2 }));
```

The design rule that follows: the origin, the center, and the units belong to the
datatype. They are not axis options with a default of 0 and an override. Where the
code still hard-codes an origin of 0 (`measureOrigin` in `domain.ts`), that is a
known gap tracked by #984.

## 2. Chrome and size

**Built** (#1032, #493): the split below. Each chart claims its chrome around
its content in the claim walk (every chrome shape claims its size), so a parent
lays out the whole graphic in one layout, and the SVG is exactly the render's
`w`/`h` (see "Chrome gutters" in
[Layout and Render Passes](/internals/layout/passes#chrome-gutters)). Ink placed from a band of a category axis (a label below the last bar of a
vertical spread) is not fitted inside a given size yet, a declared shortcut. Case 2 below
(only the plot's size given) works for a chart with a size of its own; a root
with no size anywhere still falls back to the default canvas (#494).

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

**Built** in #1129 (#1114, rule 4): a continuous axis is drawn only at a `chart()`
boundary or the render root. Operator `axes:` overrides still draw at their own node
(#1032), and nested category rows still nest at each grouping level (#1115).

**Built** in #1129: `axes: true` is the default for `chart()`, and `axes: false` turns
the axes off. Each chart's `axes` applies at that chart: a chart used as a mark reads
its own, and draws only the axes of the domains it owns. An axis a chart turns off is
hidden, not drawn by a chart inside it. A render's own `axes` overrides only the
outermost chart's. The render root is an implicit chart, and a bare node rendered
without a chart still draws no axes by default. **Built** in #1170: that default is no
decision rather than `axes: false`, so a bare render or a combinator of charts claims no
axis, and each chart inside it draws and titles its own axes, as it would rendered alone. A coordinate frame's own axes (the
polar rings and angle ticks) still need an explicit `axes: true`; that is a declared
shortcut until the frame reads its chart's setting (reading the default there would
draw rings on every pie glyph and reject every geo map).

Facets fall out of this rule with no special case. In a faceted chart, the outer
chart decides the shared domain, so it draws the shared axis and the panel labels.
Each inner chart that decides its own domain draws its own axes. Here is the faceted
scatter as it is written today:

```ts
// stories/forwardsyntax/FacetedChart.stories.tsx (FacetedScatterDriving)
chart(drivingShifts)
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

**Built** in #1129, in a revised form. Domains are shared by measure and by the
constraints that place nodes, not cut at every `chart()` boundary (see
[Measure-keyed domains](/internals/design/measure-keyed-domains)). The rule below is
the first form of #1114. Rules 2 and 4 hold as built. Rules 1 and 3 do not: two
separate charts that plot the same column share a domain wherever they sit, unless a
`frame({ coord })` starts a new space. The note's section 10 says why.

### The problem

Before #1129, a scale scope did two jobs. It decided the **domain**, and it decided
the **range**. Several things started a new scope: spread panels along the spread's
direction, a fixed `w` or `h` on a node (a "self-scaled" region),
and a coordinate transform. Because one scope bundles both jobs, setting a size can
split a domain by accident. Three cases:

- **Faceted scatter.** In `FacetedScatterDriving` above, the "top" panel's x runs
  from 1955 to 2000 while the other panels run from 1955 to 2010. The panels look
  aligned, but they are not.
- **Grouped bars.** Put `h: 150` on the inner groups of a grouped bar chart, and each
  group scales its own data. A's 0.9, B's 1.1 and C's 0.6 all draw 150 px tall, and
  the y axis disappears:

  ```ts
  chart(seafood)
    .flow(
      spread({ by: "lake", dir: "x" }),
      stack({ by: "species", dir: "x", h: 150 }) // split the y domain before #1129
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
chart(titanic)
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
of its parent box. Before #1129, the layout worked only because each level silently became
its own scale scope (the "space-filling spine" in
[Underlying Space](/internals/core/underlying-space#space-filling-spines-normalize-nests-each-part)).
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
- Grouped bars draw nested category rows, and the time axis draws nested calendar
  rows. #1133 makes these two instances of one mechanism (see
  [section 6](#_6-levels-labels-and-separators)), and the mosaic would be a third.

## 6. Levels, labels and separators

**Decided** in [#1133](https://github.com/gofish-graphics/gofish-graphics/pull/1133),
which builds the time datatype's cells and bins
([#1058](https://github.com/gofish-graphics/gofish-graphics/issues/1058),
[#1059](https://github.com/gofish-graphics/gofish-graphics/issues/1059)).

An axis with nested levels has more structure than it first seems to. Each rule below
is a question about the data, not a style choice. The axis answers it from the spec's
own hierarchy and types, so nothing on the axis is set by hand.

**Levels are listed by depth.** A continuous axis and an ordinal axis list their levels
the same way: one entry per depth, nearest the plot first. A time axis has two inferred
levels, the inner calendar unit and its parent. An ordinal axis has one level per split
on that axis, plus one for each extra `.bin` in a chained key such as
`field("date").bin(Calendar.year).bin(Calendar.month)`. `levels` keeps (`true`), hides
(`false`) or replaces (a `Calendar` value) the level at each depth:

```ts
axes: {
  x: {
    levels: [Calendar.week, Calendar.month];
  }
} // a time axis
axes: {
  x: {
    levels: [false, true];
  }
} // grouped bars, inner level hidden
```

The two kinds of axis place their levels differently. A time axis places each level's
cells on its scale, so its levels need not nest. A week row can sit over a month row,
even though weeks cross month edges. An ordinal axis has no positions between its
slots, so a level there labels runs of neighboring slots. A coarser level over slots
that do not nest in it groups each slot by the cell that holds the slot's start. This
is how GitHub's contribution graph labels its weeks by month.

**Points or cells.** A label names either a point or a cell. A point's label is
centered on its tick, as on a numeric axis or a line chart of dates. A cell's label is
centered between the cell's edges, as on a histogram's bins. The axis reads which one
it has from the space's type after `.bin`, never from a tick setting on the datatype.

**Ticks or separators.** The two marks follow opposite rules, because they mean
different things.

- A time-axis tick marks a point and aims at the middle of its label. Where an inner
  row has its own tick at the same place, the outer tick stops, since the inner tick
  already marks the spot. Where the inner row has none, the outer tick is long, so it
  runs through the inner row to reach its own label.
- A divider on an ordinal axis separates regions. It runs through every level whose
  regions also break at that gap, and it stops at a level whose region continues
  across it. By default the innermost level draws no marks at all, because its
  labels already name single slots.

**Ordered or not.** A centered label collects unordered items under it, such as a lake
over its species. A start-aligned label marks where an ordered run of equal values
begins, such as a year over its months. So by default an outer level over an ordered
type (calendar cells, numeric bins, `Domain.ordered`) starts each label at its run, an
unordered outer level centers its labels, and the innermost level stays centered. A
color, a bracket or another grouping cue could do the job of start alignment, so it
can be overridden per depth:

```ts
axes: {
  x: {
    label: {
      align: [true, "center"];
    }
  }
}
```

**Partition or category.** Dividers are the default only where the levels partition
one value. Month and year are both bins of the same date, so the year boundaries are
also month boundaries, and a divider shows where one year's months end. Lake and
species are different datatypes, so neither is a binned view of the other, and the
axis draws no dividers between them. That holds for nested splits that bin the same
field, for a chained key, for a coarser `Calendar` level, and for numeric bins inside
bins. Any axis can still opt in:

```ts
axes: {
  x: {
    divider: true;
  }
}
axes: {
  x: {
    divider: [false, true];
  }
} // per depth, nearest the plot first
```

**One rule for every per-level option.** `levels`, `label.angle`, `label.align` and
`divider` are all read by depth, the same way. A plain value applies to every level
where it can, so `divider: true` divides every ordinal level and skips a numeric
axis's ticks, which have no regions between them. A list names its levels, so an
entry that cannot apply at its depth, such as `true` at a numeric axis's depth, or an
entry past the last level, is an error that lists the axis's levels.

These rules make the two cases from #1115 instances of one mechanism. Grouped bars
and the time axis both list their levels with `levels`, and both decide their labels
and marks from the types underneath. The mosaic in section 5 would be a third
instance, once a hierarchical axis can carry nested measures.

## 7. Open questions

From #1115:

- How does a child declare its measure key? It could reuse `Measure`.
- How does the axis decide how levels nest? It could follow the nesting of the
  operators, or the nesting of the measures. **Partly answered** in
  [section 6](#_6-levels-labels-and-separators): ordinal levels follow the nesting of
  the splits and the `.bin`s of a chained key, and time levels are calendar
  partitions. Nested measures are still open.
- What does a hierarchical axis look like for each case in the table in section 1? A
  mosaic might show category labels at each level, a share ruler, or both.

## Related

- [#493](https://github.com/gofish-graphics/gofish-graphics/issues/493): the axis
  region should take part in space allocation. #1032 is the rule that came out of it.
- [#494](https://github.com/gofish-graphics/gofish-graphics/issues/494): inferring the
  graphic's size when no size is given.
- [#984](https://github.com/gofish-graphics/gofish-graphics/issues/984): rebuild the
  space kinds from traits, so a type states which structures it has.
- [#256](https://github.com/gofish-graphics/gofish-graphics/issues/256): the time
  datatype.
- [#985](https://github.com/gofish-graphics/gofish-graphics/pull/985): signed `h`/`w`
  grows from the axis's 0, and free extents carry an ascent and a descent.
