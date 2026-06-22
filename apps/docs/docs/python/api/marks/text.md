# text

Draws a text label for each data item. Used for value labels on bars, point
annotations, node names in diagrams, and axis titles.

```python
from gofish import chart, text

chart([{"label": "GoFish"}]).mark(
    text(text="label", fontSize=28, fill="steelblue")
).render(w=240, h=80)
```

## Signature

```python
text(text=None, fill=None, fontSize=None, fontWeight=None, fontFamily=None,
     debugBoundingBox=None, label=None) -> Mark
```

## Parameters

| Parameter          | Type            | Description                                                                   |
| ------------------ | --------------- | ----------------------------------------------------------------------------- |
| `text`             | `str` \| `int`  | The string to render — a constant, a field name, or a `(row) -> str` callable |
| `fill`             | `str`           | Fill color — a constant or a field name                                       |
| `fontSize`         | `int` \| `str`  | Font size in pixels                                                           |
| `fontWeight`       | `int` \| `str`  | Font weight                                                                   |
| `fontFamily`       | `str`           | Font family                                                                   |
| `debugBoundingBox` | `bool`          | Draw the text's bounding box (for layout debugging)                           |
| `label`            | `bool` \| `str` | Auto value-label flag (distinct from `text` content)                          |

Returns a `Mark` for use in [`.mark()`](/python/api/core/mark).

## Encoding

The `text` option takes a **constant**, a **field name** (a string column in
your data), or a **callable** `(row) -> str` evaluated per row:

```python
text(text="Hello")               # constant string
text(text="name")                # content from a field
text(text=lambda row: f"{row['amount']}%")  # computed per row
```

## Examples

```python
# Static label
chart([{"label": "GoFish"}]).mark(text(text="label", fontSize=24, fill="steelblue"))

# Value labels: layer text totals on top of bars
layer([
    chart(seafood)
        .flow(spread(by="lake", dir="x"))
        .mark(rect(h="count").name("bars")),
    chart(selectAll("bars"))
        .flow(group(by="datum.lake"))
        .mark(lambda d: spread(
            [d[0], text(text=str(sum(r["count"] for r in d[0].datum)))],
            dir="y", alignment="middle", spacing=10,
        )),
])

# Computed per-row label
chart(bottles).mark(text(text=lambda d: f"{d['amount']}%", fontSize=35, fill="#666"))
```
