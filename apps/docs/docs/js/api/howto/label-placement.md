# How to place labels

A label's `position` can be a value of the [`Place`](/js/api/place) family.
A place reads the mark's outline and tries spots in order, so labels keep
off the marks, off each other, and off any nodes you list. A label with no
free spot is hidden.

## Label points

A dot's label goes around it by default (`Place.around()`): the first of
eight spots, upper right first, that covers no other dot or label. Sort the
rows so the labels you care about most come first; they are placed first.

::: gofish example:scatter-plot-with-point-labels
:::

## Name lines at their ends

A line's label goes past its last point by default (`Place.end()`), so the
labels can replace a legend. Labels that would cover each other slide apart
vertically. Use `Place.start()` to name the lines where they begin.

::: gofish example:line-chart-with-end-labels
:::

## Write a label on its line

`Place.along({ at, orient: "sloped" })` puts the label on the line, `at` of
the way along it, turned to follow it. Add a `halo` so the line does not run
through the text. A label that would cover another line slides along its
own. `side` puts the label beside the line instead: `"above"`, `"below"`, or
a list such as `["above", "below"]`, tried in order at each spot.

::: gofish example:line-chart-with-inline-labels
:::

## Label the bands of a streamgraph

A band's label goes inside it by default (`Place.interior()`), where the
label's box can grow largest. A band too thin for its label leaves it out.
A `polygon` is labeled the same way.

::: gofish example:streamgraph-with-band-labels
:::

## Keep labels off other marks

`avoiding` lists more nodes for the labels to keep off: a `selectAll(name)`,
or a list of nodes or refs. Draw those nodes before the labels, so they are
placed when the labels look for them.

::: gofish example:point-labels-avoiding-a-trend-line
:::

## Put a bar's value above it, or inside

`Place.around({ directions: ["top"], side: ["outset", "inset"] })` puts the
value above the bar, or just inside its top when there is no room above.

```ts
chart(sales)
  .flow(spread({ by: "month", dir: "x" }))
  .mark(
    rect({ h: "units" }).label("units", {
      position: Place.around({
        directions: ["top"],
        side: ["outset", "inset"],
      }),
    })
  );
```

For a horizontal bar, `Place.along({ at: "x-max", side: ["outset", "inset"] })`
puts the value just past the bar's end, within the bar's height.
