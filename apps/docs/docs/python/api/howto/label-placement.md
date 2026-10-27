# How to place labels

A label's `position` can be a value of the [`Place`](/python/api/place)
family. A place reads the mark's outline and tries spots in order, so labels
keep off the marks, off each other, and off any nodes you list. A label with
no free spot is hidden.

## Label points

A dot's label goes around it by default (`Place.around()`): the first of
eight spots, upper right first, that covers no other dot or label. Sort the
rows so the labels you care about most come first; they are placed first.

```python
from gofish import chart, circle, scatter

(
    chart(countries)
    .flow(scatter(by="country", x="fertility", y="life_expect"))
    .mark(circle(r=4).label("country"))
    .render(w=640, h=440, axes=True)
)
```

::: gofish example:scatter-plot-with-point-labels hidden
:::

## Name lines at their ends

A line's label goes past its last point by default (`Place.end()`), so the
labels can replace a legend. Labels that would cover each other slide apart
vertically. Use `Place.start()` to name the lines where they begin.

```python
from gofish import Place, Schema, chart, group, line, scatter

(
    chart(stocks, schema={"date": Schema.time()})
    .flow(group(by="symbol"), scatter(by="date", x="date", y="price"))
    .mark(line(stroke="symbol", stroke_width=2).label("symbol", position=Place.end()))
    .render(w=560, h=320, axes=True, legend=False)
)
```

::: gofish example:line-chart-with-end-labels hidden
:::

## Write a label on its line

`Place.along(at=..., orient="sloped")` puts the label on the line, `at` of
the way along it, turned to follow it. Add a `halo` so the line does not run
through the text. A label that would cover another line slides along its
own. `side` puts the label beside the line instead: `"above"`, `"below"`, or
a list such as `["above", "below"]`, tried in order at each spot.

```python
from gofish import Place, Schema, chart, group, line, scatter

(
    chart(stocks, schema={"date": Schema.time()})
    .flow(group(by="symbol"), scatter(by="date", x="date", y="price"))
    .mark(
        line(stroke="symbol", stroke_width=2).label(
            "symbol",
            position=Place.along(at=0.6, orient="sloped"),
            halo={},
            font_weight=600,
        )
    )
    .render(w=560, h=320, axes=True, legend=False)
)
```

::: gofish example:line-chart-with-inline-labels hidden
:::

## Label the bands of a streamgraph

A band's label goes inside it by default (`Place.interior()`), where the
label's box can grow largest. A band too thin for its label leaves it out.
A `polygon` is labeled the same way.

```python
from gofish import chart, ribbon, spread, stack

(
    chart(seafood)
    .flow(
        spread(by="lake", dir="x", spacing=64, alignment="middle"),
        stack(by="species", dir="y"),
    )
    .mark(ribbon(h="count", fill="species", opacity=0.8).label("species"))
    .render(w=520, h=360, legend=False)
)
```

::: gofish example:streamgraph-with-band-labels hidden
:::

## Keep labels off other marks

`avoiding` lists more nodes for the labels to keep off: a `select_all(name)`,
or a list of marks such as `ref(...)`. Draw those nodes before the labels,
so they are placed when the labels look for them.

```python
from gofish import blank, chart, circle, line, scatter, select_all

(
    chart(trend_ends)
    .flow(scatter(by="fertility", x="fertility", y="life_expect"))
    .mark(blank().name("ends"))
    .layer(
        chart(select_all("ends")).mark(
            line(stroke="#9e9e9e", stroke_width=2).name("trend")
        )
    )
    .layer(
        chart(countries)
        .flow(scatter(by="country", x="fertility", y="life_expect"))
        .mark(circle(r=4).label("country", avoiding=select_all("trend")))
    )
    .render(w=640, h=440, axes=True)
)
```

::: gofish example:point-labels-avoiding-a-trend-line hidden
:::

## Put a bar's value above it, or inside

`Place.around(directions=["top"], side=["outset", "inset"])` puts the value
above the bar, or just inside its top when there is no room above.

```python
from gofish import Place, chart, rect, spread

(
    chart(sales)
    .flow(spread(by="month", dir="x"))
    .mark(
        rect(h="units").label(
            "units",
            position=Place.around(directions=["top"], side=["outset", "inset"]),
        )
    )
)
```

For a horizontal bar, `Place.along(at="x-max", side=["outset", "inset"])`
puts the value just past the bar's end, within the bar's height.
