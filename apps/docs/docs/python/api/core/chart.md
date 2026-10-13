# chart

Creates a `ChartBuilder`. This is the entry point for every GoFish chart.

::: gofish example:bar-chart hidden
:::

```python
from gofish import chart, spread, rect

chart(seafood, axes=True).flow(spread(by="lake", dir="x")).mark(
    rect(h="count")
).render(w=500, h=300)
```

## Signature

```python
chart(data, **options) -> ChartBuilder
chart(**options) -> ChartBuilder  # empty scope — data inherited from context
```

Calling `chart()` (or `chart(**options)`) with **no data** creates an _empty
scope_ that inherits its data from the enclosing context: the incoming partition
when used directly as a [`.mark(...)`](/python/api/core/mark), or the previous
tier's marks inside [`.layer(...)`](/python/api/core/layer).

## Parameters

`data` (`list[dict]` or a dataframe) is the dataset to visualize: a list of
dict rows, or any dataframe [narwhals](https://narwhals-dev.github.io/narwhals/)
supports (pandas, polars, pyarrow, a DuckDB relation, ...), or
[`select_all()` / `ref()`](#cross-chart-references) for a layer reference.

The chart-level options are keyword arguments. Any other keyword raises a
`TypeError`. See [Axes](#axes) for the full `axes` shape and
[`Schema`](/python/api/core/schema) for `schema`.

::: gofish-ref ChartOptions
:::

Chart-level options are passed as keyword arguments:

```python
chart(data, color=Color.palette("tableau10"))
chart(data, color=Color.gradient("blues"), coord=Coord.clock())
```

Returns a `ChartBuilder` with [`.flow()`](/python/api/core/flow),
[`.mark()`](/python/api/core/mark), and [`.render()`](/python/api/core/render).

::: tip
Chart **size** is set on [`.render()`](/python/api/core/render), not `chart()` —
`render(w=500, h=300)`. `coord` and `color` are `chart()` options; `axes` and
`padding` can be set on either, as in JS.
:::

## Axes

`axes` is a `chart()` option (mirroring the JS `chart(data, { axes: true })`),
and also a [`render`](/python/api/core/render) option.
It accepts a bool, a per-dimension dict, or per-dimension title control:

```python
chart(data, axes=True)                       # both axes, titles inferred
chart(data, axes=False)                       # no axes
chart(data, axes={"x": True, "y": False})     # x only
chart(data, axes={"x": {"title": "Year"}, "y": True})   # custom x title
chart(data, axes={"x": {"title": False}, "y": True})    # suppress inferred x title
chart(data, axes={"x": {"side": "end"}})                # x-axis on the far edge
chart(data, axes={"x": {"label_angle": 45}})            # x labels rotated 45 degrees
chart(data, axes={"x": {"rows": [Calendar.month, Calendar.year]}})  # rows of a time axis
```

Keys inside the per-axis dict are snake_case, like every keyword argument:
`"title"`, `"side"`, `"label_angle"`, and `"rows"`. Any other key, including the
camelCase `"labelAngle"`, raises a `TypeError`.

`"label_angle"` rotates the tick and category labels clockwise by that many
degrees. A list rotates each tier of a nested axis separately, from the
innermost tier outward (`[45]` rotates only the innermost row), and `"auto"`
picks 0, 45, or 90 degrees for each label row so the labels do not collide.

`"rows"` sets the label rows of a time axis, an axis over a
[`Schema.time()`](/python/api/core/schema) column. See
[`Calendar`](/python/api/core/calendar).

Each per-axis dict also accepts `"side": "start" | "end"`. By default a
**continuous/quantitative x-axis renders at the visual bottom** (and a continuous
y-axis at the left) once the frame's y-orientation is resolved — so a scatter, a
horizontal bar, and a faceted small-multiple all place their value axis at the
bottom with no option. An explicit `"side"` overrides that with the literal
**frame-relative** seating: `"start"` is the start of the axis order (the top of
a y that reads top-down, the bottom of a continuous y, which grows upward), `"end"`
the far edge — e.g. `{"x": {"side": "end"}}`
forces the x-axis onto the opposite edge from the default.

For polar charts, combine with `coord` (and `padding` for label room):

```python
chart(seafood, coord=Coord.clock(), axes=True, padding=80)
```

Per-operator overrides use the same shape on
[`spread`](/python/api/operators/spread) / [`scatter`](/python/api/operators/scatter):

```python
chart(data, axes=True).flow(spread(by="species", dir="x", axes={"x": True, "y": False}))
```

## Equal scale from a shared unit

By default each axis resolves its data→pixel scale independently, so a circle in
data space becomes an ellipse. But when **x and y are in the same unit**,
their scales must be equal — a circle stays circular. GoFish does this from the
**unit**, not a knob: declare both columns in the same unit with
[`Schema.unit`](/python/api/core/schema) and the shared scale follows.

```python
(
    chart(data, schema={"x": Schema.unit("plane"), "y": Schema.unit("plane")})
    .flow(scatter(x="x", y="y"))
    .mark(circle(r=4))
    .render(w=640, h=380)  # a true circle, not an ellipse
)
```

This is the same rule the `circle` mark obeys one level down: `circle(r=...)`
lowers to a `w` and `h` that share a unit, so it can never distort. The
binding axis fills its dimension; the other centers in the leftover space.
Two columns with no declared unit (e.g. `bill_length` vs `bill_depth`) stay
independent.

## The builder

Every builder method returns a **new** `ChartBuilder`, so chains are immutable
and safe to reuse:

```python
base = chart(seafood).flow(spread(by="lake", dir="x"))
bars = base.mark(rect(h="count"))
dots = base.mark(circle(r="count"))
```

## Convenience methods

`.facet()` and `.stack()` are shortcuts for common single-operator flows:

```python
chart(seafood).facet(by="lake", dir="x").mark(rect(h="count"))
# equivalent to
chart(seafood).flow(spread(by="lake", dir="x")).mark(rect(h="count"))
```

## Cross-chart references

Pass `select_all("layerName")` as the data argument to reference a named mark from
another chart — it resolves to an **array of refs**, one per named node, which
connectors like [`line`](/python/api/marks/line) and [`ribbon`](/python/api/marks/ribbon)
consume directly. Use `ref("layerName")` as data for the singular case: it returns a
**single ref** and raises if the layer matched zero or more than one node.

After a selection the stream is refs, but `by` reads a ref through its rows, so
the bare field name still works — `group(by="species")`; see
[`spread` → path-aware `by`](/python/api/operators/spread#path-aware-by). See
[`mark`](/python/api/core/mark) for `.name()` on a mark.

For the full reference — singular-as-data rules, node-unit selection, hygienic
scoping, and connector use — see [`ref` / `select_all`](/python/api/selection/ref).

## Naming a chart: `.name()`

A **chart-level** `.name()` — distinct from naming a mark — tags the whole
chart so a sibling `layer([...]).relate(...)` callback can reference it by
that name (mirrors JS `chart.resolve().name(...)`). The relate lambda's
parameter names match the charts' `.name()` strings:

```python
sc = chart(data).flow(scatter(x="x", y="y")).mark(circle(r=3)).name("scatter")
top = chart(data, h=80).flow(...).mark(rect(h="count")).name("topHist")

layer([sc, top]).relate(lambda scatter, topHist: [
    Constraint.align([scatter], x="baseline", y="baseline"),
    Constraint.position([topHist], y=410, anchor="start"),
])
```
