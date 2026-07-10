# mark

Sets the visual **mark** drawn for each data item — the shape that turns rows
into pixels.

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
ChartBuilder.mark(mark) -> ChartBuilder
```

## Parameters

| Parameter | Type                                 | Description                                                                                 |
| --------- | ------------------------------------ | ------------------------------------------------------------------------------------------- |
| `mark`    | `Mark` \| `ChartBuilder` \| callable | A mark factory result, a nested `chart(...)` drawn per group, or a `(data) -> ChartBuilder` |

Returns a new `ChartBuilder` with the mark set.

## Mark types

| Mark                                 | Draws                           |
| ------------------------------------ | ------------------------------- |
| [rect](/python/api/marks/rect)       | A rectangle per item            |
| [circle](/python/api/marks/circle)   | A circle per item               |
| [ellipse](/python/api/marks/ellipse) | An ellipse per item             |
| [line](/python/api/marks/line)       | A line through the items        |
| [ribbon](/python/api/marks/ribbon)   | A filled area through the items |
| [blank](/python/api/marks/blank)     | An invisible positioning guide  |

## Encoding channels

Mark options accept either a **constant** or a **field name** (a string matching
a column in your data):

```python
rect(h="count", fill="species")  # height and color from data fields
rect(h="count", fill="#4e79a7")  # height from data, constant color
```

## Naming marks

Call `.name("layerName")` on a mark so another chart can reference it with
[`ref` / `selectAll`](/python/api/core/chart#cross-chart-references):

```python
chart(data).flow(scatter(by="lake", x="x", y="y")).mark(blank().name("points"))
```

## Nested chart as a mark

`mark()` also accepts a whole nested `chart(...)` — one sub-chart drawn per group
(a pie glyph per scatter point, a small multiple per facet). Leave the nested
chart's **data off** and it inherits the incoming partition (the group's rows),
so you don't thread the data through a callback:

```python
chart(catch_locations).flow(scatter(by="lake", x="x", y="y")).mark(
    chart(coord=clock())  # no data -> inherits this lake's partition
    .flow(stack(by="species", dir="x", h=20))
    .mark(rect(w="count", fill="species"))
)
```

A no-data `chart()` / `chart(**options)` is an **empty scope**: as a `mark(...)`
it binds the incoming group, and inside [`.layer(...)`](/python/api/core/layer)
it binds the previous tier's marks.

The older callback form `mark(lambda data: chart(data, ...).flow(...).mark(...))`
still works and is equivalent — the function receives each group's data slice and
returns a nested chart.

## Labeling a mark

Call `.label(accessor, position=..., font_size=..., color=..., offset=..., min_space=..., rotate=...)`
on a mark to attach a deferred text label, mirroring JS's `.label(accessor, options?)`:

```python
rect(h="count").label("count", position="center", font_size=10)
```

`accessor` is either a plain field name (a string) or a `field(...)`
aggregate. Python has no function-accessor form (JS accepts a callback
there); use one of these two instead.

### `.label()` on operators {#operator-label}

Every dual-mode operator (`spread`, `stack`, `group`, `scatter`, `table`,
`treemap`) also accepts `.label(accessor, ...)`, with the same kwargs as
`Mark.label`. Chaining it on the operator instead of the mark labels the
**group**, not each individual mark instance — every node a split leaf (one
group's rows) produces gets stamped with that leaf's own subdata, and
`accessor` resolves one of two ways:

- **A bare field name** (`"class"` below) must be constant across every row
  in the group — true by construction for a `by` field, since every row in
  the group shares that value. If it isn't actually constant, this is a
  spec error and `.label()` raises loudly rather than silently reading one
  row's value:

  ```
  [gofish] .label("count"): field is not constant within the group; use an
  aggregate like field("count").mean()
  ```

- **A `field(...)` aggregate** (`field("count").sum()` / `.mean()` /
  `.count()` / `.distinct()`) folds the group's rows to one value — use this
  for a group total or mean:

  ```python
  chart(data).flow(
      stack(by="class", dir="y").label(field("count").sum(), position="center")
  ).mark(rect(h="count"))
  ```

```python
chart(data).flow(
    stack(by="class", dir="y").label("class", position="center")
).mark(rect(h="count"))
```

`.label()` and `.translate()` chain in either order:

```python
stack(by="class", dir="y").translate(y=8).label("class")
stack(by="class", dir="y").label("class").translate(y=8)
```
