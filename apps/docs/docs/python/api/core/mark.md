# mark

Sets the visual **mark** drawn for each data item — the shape that turns rows
into pixels.

::: starfish example:bar-chart hidden
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

| Parameter | Type               | Description                                                   |
| --------- | ------------------ | ------------------------------------------------------------- |
| `mark`    | `Mark` \| callable | A mark factory result, or a `(data) -> ChartBuilder` function |

Returns a new `ChartBuilder` with the mark set.

## Mark types

| Mark                                 | Draws                           |
| ------------------------------------ | ------------------------------- |
| [rect](/python/api/marks/rect)       | A rectangle per item            |
| [circle](/python/api/marks/circle)   | A circle per item               |
| [ellipse](/python/api/marks/ellipse) | An ellipse per item             |
| [line](/python/api/marks/line)       | A line through the items        |
| [area](/python/api/marks/area)       | A filled area through the items |
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

## The mark-as-function pattern

`mark()` also accepts a function `(data) -> ChartBuilder`. The function receives
each group's data slice and returns a nested chart, letting you build custom
glyphs:

```python
chart(seafood).flow(spread(by="lake", dir="x")).mark(
    lambda group: chart(group).flow(stack(by="species", dir="y")).mark(rect(h="count"))
)
```
