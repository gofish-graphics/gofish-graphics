# Refs and Selection

::: warning Under construction
This page is a first draft. The ideas are right, but the prose has not been
written properly yet and may change shape.
:::

A **ref** is a reference to a mark that is already part of the scene. It is not
a copy of that mark and it is not a second drawing of it. It is a way for one
part of a picture to talk about another part: where it ended up, how big it is,
and what row of data it came from.

Refs are the answer to a question that comes up in charts and diagrams alike.
An arrow has two ends, and both ends are somewhere else. A label sits beside
something. A line passes through a series of points that another mark drew. In
each case the new mark has no position of its own to speak of. Its position is
a function of marks that already exist.

## A line through points somebody else drew

Here a chart draws one circle per year. A second chart takes those circles as
its data and draws a line through them.

::: gofish

```js
const trips = [
  { year: 1960, miles: 9, price: 1.7 },
  { year: 1970, miles: 10, price: 2.1 },
  { year: 1980, miles: 9.5, price: 3.4 },
  { year: 1990, miles: 11, price: 2.2 },
  { year: 2000, miles: 12, price: 1.8 },
  { year: 2010, miles: 10, price: 3.0 },
];

gf.layer([
  gf
    .chart(trips)
    .flow(gf.scatter({ by: "year", x: "miles", y: "price" }))
    .mark(
      gf
        .circle({ r: 5, fill: "white", stroke: "#4c78a8", strokeWidth: 2 })
        .name("points")
    ),
  gf
    .chart(gf.selectAll("points"))
    .mark(gf.line({ stroke: "#4c78a8", strokeWidth: 2 })),
]).render(root, { w: 360, h: 200, axes: true });
```

:::

The line never mentions `miles` or `price`. It was given six refs and it read
their placement. If the data changed, or the chart were drawn at another size,
or a coordinate transform bent the whole plot into a circle, the line would
still pass through the circles, because the refs are what it knows about.

## Why the connector lives in a sibling layer

Notice where the line is. It is not inside the chart that drew the circles. It
is beside it, in an enclosing `layer`.

That placement is forced by what a connector is. A line, a ribbon, and an arrow
are **relational** marks: one drawn thing that depends on two or more other
drawn things. A mark nested inside the tier that produces the circles would be
drawn once per circle, and from inside one circle you cannot see the next one.
The connector has to sit at a tier where all of its endpoints are in view, and
the first such tier is the sibling layer.

The same shape appears in a diagram, where an arrow between two components is a
child of the layer that holds both of them rather than a child of either one.
It is not a special rule for charts and a different one for diagrams. It is one
rule: a relational mark goes where it can see all its ends.

When the connector traces the very chart that produced the marks, chaining
[`.layer()`](/js/api/core/layer) writes the same arrangement with less typing.
Reach for `selectAll` by hand when the marks belong to a different chart.

## The datum rides along

A ref points at a placed node, and it also carries the data that node was bound
to, reachable as `ref.datum`. That matters because a connector often needs to
group its endpoints differently than the chart that drew them did.

A stream chart is the standard case. The bars were laid out one per month, and
the ribbons run one per product. The ribbon chart is not re-reading the
original table. It is re-partitioning the refs, by the data the refs carry:
`group({ by: "datum.kind" })` rather than `group({ by: "kind" })`.

The `datum.` prefix is not decoration. It records the fact that the stream you
are operating on is made of refs, not rows. A mark's own channels, like
`rect({ h: "count" })`, read a row and are not prefixed. Keeping the two
spellings apart is what makes it obvious, in the source, which of the two
things a given operator is looking at.

One consequence is worth naming. A ref's datum is a bag of rows, not a single
row, because a mark may aggregate. Reading `datum.kind` off it gives an answer
only when every row in the bag agrees. When they disagree there is no honest
single value, so the answer is nothing rather than an arbitrary pick.

## Singular and plural

There are two spellings, and they differ in what they give back.

`ref(name)` is singular. It gives one ref, and it fails if the name matched
zero nodes or more than one.

`selectAll(name)` is plural. It gives an array of refs, one per node the named
mark produced, never flattened and never merged.

This follows a rule that runs through the whole library: a name says what shape
of value it denotes. `ref` is a noun in the singular, so it is one thing.
`selectAll` is a plural verb, so it is a collection. You do not have to
remember a convention about which functions return arrays, because the names
already say so.

The refusal in the singular form is the useful part. A name that matched four
bars is a collection, and quietly handing back the first one would turn a
mistake into a picture that looks almost right. Failing at that point says the
thing you actually got wrong.

## Compared to D3 selections

The vocabulary looks like D3 on purpose. `selectAll` is the plural collection,
the way `querySelectorAll` is, and `ref` is the one-or-bust singular, the way
`querySelector` is. Underneath, the two systems are doing different work.

D3 selects DOM elements. The selection exists after the elements have been
created and laid out, and what you do with it is set attributes on them.
Position is something you compute and then write down.

GoFish selects scene nodes, before layout has finished. A ref is therefore
something layout can still act on. That is why a line can be built out of refs
and come out in the right place: the refs are resolved during the same pass
that decides where everything goes, so a mark made from refs is a participant
in layout rather than a report on it.

The second difference is that a GoFish selection is inert. A D3 selection owns
`.data()`, `.attr()`, `.filter()` and the rest, so the selection object is
where the work happens. A GoFish selection is a plain array of refs with no
methods of its own. To regroup or re-encode it, you run it through the same
[operators](/js/concepts/constraints-and-operators) you would use on rows. There
is one place where data is reshaped, and a selection is not a second one.

## What was rejected

**A bespoke selection type.** A dedicated object could have carried batch
operations, the way D3's does. It would have meant two vocabularies for
reshaping data, one for tables and one for selections, that have to be kept in
step with each other forever. An array of refs needs no second vocabulary,
because the operators already work on it.

**Flattening a selection into rows.** Returning the underlying data rather than
one ref per node would make `selectAll` feel like a query. It would also throw
away the thing a connector actually needs, which is geometry. Node granularity
keeps both: placement on the ref, data on `ref.datum`.

**Letting the singular form pick the first match.** Convenient and wrong, as
above.

**Inline plural refs.** `selectAll` is a chart-data verb today and using it
inline inside a layout throws. This is a limit rather than a decision on
principle, and it may lift later.

## Where next

- [ref / selectAll](/js/api/selection/ref) for the signatures, `pluck`,
  `project`, and the exact scoping rules.
- [How to use selection](/js/api/howto/selection) for worked recipes.
- [Names and Scope](/js/concepts/names-and-scope) for where the names a ref
  looks up come from.
