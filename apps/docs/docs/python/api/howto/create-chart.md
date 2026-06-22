# How to create a chart

GoFish uses a builder pattern to create charts. You chain four methods together:
[`chart`](/python/api/core/chart), [`flow`](/python/api/core/flow),
[`mark`](/python/api/core/mark), and [`render`](/python/api/core/render).

## Basic pattern

```python
chart(data) \
    .flow(operators...) \
    .mark(visual_mark) \
    .render(w=..., h=...)
```

Each method has a specific role:

| Method         | Purpose                                   |
| -------------- | ----------------------------------------- |
| `chart(data)`  | Creates a builder with your dataset       |
| `.flow(...)`   | Applies layout operators to position data |
| `.mark(...)`   | Sets the visual representation            |
| `.render(...)` | Renders the chart to a widget             |

## Step 1: chart

`chart(data)` creates a `ChartBuilder` with your dataset. The data can be any
list of dicts (or a pandas `DataFrame`):

```python
data = [
    {"category": "A", "value": 30},
    {"category": "B", "value": 50},
    {"category": "C", "value": 20},
]

chart(data)
```

Chart-level options are passed as **keyword arguments** — including `axes`
(see [Step 4](#step-4-render)), a color scale, or a coordinate transform such as
polar coordinates for pie charts:

```python
chart(data, coord=clock())
```

## Step 2: flow

`.flow()` accepts one or more **operators** that determine how data is laid out
spatially. The main operators are:

- [`spread(by=..., dir=...)`](/python/api/operators/spread) — divides space into
  separate regions for each group
- [`stack(by=..., dir=...)`](/python/api/operators/stack) — stacks items
  edge-to-edge along a shared scale
- [`scatter(by=..., x=..., y=...)`](/python/api/operators/scatter) — positions
  items by x/y coordinates

```python
.flow(spread(by="category", dir="x"))
```

The `dir` option specifies the direction: `"x"` for horizontal, `"y"` for
vertical.

See [How to pick a layout operator](/python/api/howto/operators) for guidance on
choosing between them.

## Step 3: mark

`.mark()` specifies how each data item should appear visually. Common marks
include:

- [`rect()`](/python/api/marks/rect) — rectangles (bars)
- [`circle()`](/python/api/marks/circle) — circles
- [`line()`](/python/api/marks/line) — connecting line
- [`area()`](/python/api/marks/area) — filled area

Mark options can use fixed values or reference data fields:

```python
.mark(rect(h="value", fill="category"))
```

Here `h="value"` means the rectangle height comes from each item's `value`
field, and `fill="category"` maps the fill color to the `category` field.

## Step 4: render

`.render()` renders the chart, returning a widget that auto-displays in a
notebook:

```python
.render(w=400, h=300)
```

Render options:

- `w` — width in pixels
- `h` — height in pixels

::: tip
**Axes are a `chart()` option in Python, not a render option** (mirroring the JS
`chart(data, { axes: true })`). Pass `axes=...` to `chart(...)`:

```python
chart(data, axes=True)                      # both axes, titles inferred
chart(data, axes=False)                     # no axes
chart(data, axes={"x": True, "y": False})   # x only
```

Only **size** (`w`/`h`) goes on `.render()`. See
[`chart`](/python/api/core/chart#axes) for the full `axes` shape.
:::

## Composing operators

You can pass multiple operators to `.flow()` to create nested layouts. Operators
apply in order — the first groups and positions the data, then subsequent
operators work within those groups.

**Example: Stacked bar chart**

To create a stacked bar chart, use `spread` to separate categories horizontally,
then `stack` to stack items within each category:

::: gofish example:stacked-bar-chart hidden
:::

```python
from gofish import chart, spread, stack, rect

chart(seafood, axes=True).flow(
    spread(by="lake", dir="x"),
    stack(by="species", dir="y"),
).mark(rect(h="count", fill="species")).render(w=400, h=300)
```

The first operator (`spread`) creates separate regions for each lake along the
x-axis. The second operator (`stack`) stacks the species vertically within each
region.

## Complete examples

### Basic bar chart

A simple bar chart with one bar per category:

::: gofish example:bar-chart hidden
:::

```python
from gofish import chart, spread, rect

chart(seafood, axes=True).flow(spread(by="lake", dir="x")).mark(
    rect(h="count")
).render(w=400, h=300)
```

### Grouped bar chart

To group bars side-by-side instead of stacking, use `spread` for both levels
(same direction):

::: gofish example:grouped-bar-chart hidden
:::

```python
from gofish import chart, spread, rect

chart(seafood, axes=True).flow(
    spread(by="lake", dir="x"),
    spread(by="species", dir="x", spacing=0),
).mark(rect(h="count", fill="species")).render(w=400, h=300)
```

### Stacked bar chart

To stack bars, use `spread` then `stack` (perpendicular directions):

::: gofish example:stacked-bar-chart hidden
:::

```python
from gofish import chart, spread, stack, rect

chart(seafood, axes=True).flow(
    spread(by="lake", dir="x"),
    stack(by="species", dir="y"),
).mark(rect(h="count", fill="species")).render(w=400, h=300)
```
