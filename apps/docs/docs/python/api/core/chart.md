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

Each chart's `axes` applies at that chart. A chart nested in another reads its
own `axes` and draws only the axes of the domains it owns, so a shared axis is
drawn once. An axis a chart turns off is hidden: no chart inside it draws that
axis instead.

```python
chart(data, axes=True)                       # both axes, titles inferred (the default)
chart(data, axes=False)                       # no axes
chart(data, axes={"x": True, "y": False})     # x only
chart(data, axes={"x": {"title": "Year"}, "y": True})   # custom x title
chart(data, axes={"x": {"title": False}, "y": True})    # suppress inferred x title
chart(data, axes={"x": {"side": "end"}})                # x-axis on the far edge
chart(data, axes={"x": {"label": {"angle": 45}}})         # x labels rotated 45 degrees
chart(data, axes={"x": {"label": {"align": [True, "center"]}}})  # center the second level
chart(data, axes={"x": {"levels": [Calendar.week, Calendar.month]}})  # the rows of a time axis
chart(data, axes={"x": {"levels": [False, True]}})       # hide the innermost level
chart(data, axes={"x": {"divider": [False, True]}})      # dividers at the second level's boundaries
```

Keys inside the per-axis dict are snake_case, like every keyword argument:
`"title"`, `"side"`, `"label"`, `"levels"`, and `"divider"`, and inside `"label"`, `"angle"`
and `"align"`. Any other key raises a `TypeError` that lists
the keys the dict takes.

`"label"` sets how the axis's labels are drawn. Its `"angle"` rotates the tick
and category labels clockwise by that many
degrees. A list rotates each level of the axis separately, by the same
depths as `"levels"`, nearest the plot first (`[45]` rotates only the
innermost level), and `"auto"` picks 0, 45, or 90 degrees for each level so
the labels do not collide.

`"levels"` sets the axis's levels, its bands of labels, by depth, nearest
the plot first. Every axis on the dimension has levels, counted from the
inside out:

| Axis    | Inferred levels                                                                                                                                     |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| numeric | one: its ticks                                                                                                                                      |
| time    | two rows: the level and step its domain picks for about 10 ticks, then that level's parent (see [`Calendar`](/python/api/core/calendar))            |
| ordinal | one per split; a key binned by a chain, `field("date").bin(Calendar.year).bin(Calendar.month)`, has one per bin, nearest first (months, then years) |

Each entry sets the level at its depth:

- `True` keeps the level as inferred.
- `False` hides it: its labels (and a time row's ticks) are not drawn and
  take no space.
- A Calendar value names its cells. On a time axis it is a row's partition.
  On an ordinal axis over cells of time, it groups the slots by its cells:
  `Calendar.year` over month slots labels each run of months in one year.

Depths the list does not reach stay as inferred, so `[False]` hides only the
innermost level. On the outermost axis of the dimension, a Calendar value
past the inferred levels adds a level: `"levels": [True, Calendar.year]` over
the slots of `field("date").bin([Calendar.year, Calendar.month])` adds a year
level. An entry that cannot apply is an error that lists the dimension's
levels: a Calendar value over slots that are not times, or finer than the
slots (`Calendar.week` over months), `False` on a numeric axis, and an entry
past the last level. A Calendar value coarser than slots that do not nest in
it groups each slot by the cell that holds the slot's start: over week
slots, `Calendar.month` puts each week in the month it starts in.
`"angle"` and `"align"` lists of the label, and `"divider"` lists, use the
same depths, and an entry of one that cannot apply at its depth, or one past
the last level, is the same error.

On an ordinal axis, the label rows of the dimension stack from the plot
edge, whichever split draws them, so nested splits and one chained key look
the same. A row sits 2 pixels past a row it divides (by default, a row it
partitions) and 8 pixels past any other row. A divider is a line centered in the gap between two
neighboring slots. It runs through the row of every level that has a
boundary in that gap, starting at the plot edge. A level whose group
continues across the gap stops the divider.

`"divider"` sets which levels draw dividers at their boundaries. By default a
level draws them when it partitions the value of the level inside it, that
is, both bin the same column:

| Levels                                                                                                         | Dividers               |
| -------------------------------------------------------------------------------------------------------------- | ---------------------- |
| a chained key, `field("date").bin(Calendar.year).bin(Calendar.month)`                                          | between the years      |
| nested splits that bin one column, `field("date").bin(Calendar.year)` then `field("date").bin(Calendar.month)` | between the years      |
| a coarser Calendar entry of `"levels"`, `[True, Calendar.month]` over week slots                               | between the months     |
| numeric bins inside bins of one column, `Bin.step(10)` then `Bin.step(2)`                                      | between the outer bins |
| categories inside categories (a lake over its species), or months over weather categories                      | none                   |
| the innermost level of the dimension                                                                           | none                   |

So in a chart of months over weather categories, with a chained year above
the months, the one divider is between the years, and it runs from the plot
edge through the weather, month and year rows. `True` turns a level's
dividers on and `False` turns them off. A single value applies to every
ordinal level and skips a continuous axis's level, whose ticks name points,
with no regions between them. A list is per level, by the same depths as
`"levels"`, and a depth past its end stays as inferred:
`"divider": [False, True]` divides only at the second level's boundaries. In
a list, `True` at a continuous level's depth is an error.

The label's `"align"` sets where each level's labels sit along the axis: `"center"` centers
a label under what it names, and `"start"` puts it at the start of its run,
3 pixels past the divider before it (the first run starts at the axis
start). By default:

| Level                                                                                                      | Labels                   |
| ---------------------------------------------------------------------------------------------------------- | ------------------------ |
| the innermost level of the dimension (one label per slot)                                                  | centered                 |
| an outer level over unordered categories                                                                   | centered                 |
| an outer level over ordered groups: cells of time, numeric bins, or a column the `schema` declares ordered | at the start of each run |
| a continuous axis's ticks                                                                                  | centered on the tick     |

A single value applies to every level where it can: a single `"start"`
skips a continuous axis's levels, since their labels name points. A list is
per level, by the same depths as `"levels"`, and `True` keeps a level's
inferred alignment: `"label": {"align": [True, "center"]}` centers the second
level. In a list, `"start"` at a continuous level's depth is an error.

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
[`Unit`](/python/api/core/schema) or a unit's name and the shared scale follows.

```python
(
    chart(data, schema={"x": "plane", "y": "plane"})
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
