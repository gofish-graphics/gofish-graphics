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
text(*, text=None, fill=None, stroke=None, strokeWidth=None, filter=None,
     fontSize=None, fontFamily=None, fontStyle=None, fontWeight=None,
     debugBoundingBox=None, rotate=None,
     x=None, cx=None, x2=None, w=None, emX=None,
     y=None, cy=None, y2=None, h=None, emY=None,
     theta=None, thetaSize=None, r=None, rSize=None, key=None) -> Mark
```

Keyword-only (matches every existing call site, which already passes
`text=...` by keyword).

## Parameters

| Parameter                                                | Type           | Description                                                                   |
| -------------------------------------------------------- | -------------- | ----------------------------------------------------------------------------- |
| `text`                                                   | `str` \| `int` | The string to render — a constant, a field name, or a `(row) -> str` callable |
| `fill`                                                   | `str`          | Fill color — a constant or a field name                                       |
| `stroke`, `strokeWidth`                                  | `str`, `int`   | Outline color / width                                                         |
| `filter`                                                 | `str`          | Raw SVG filter attribute                                                      |
| `fontSize`                                               | `int` \| `str` | Font size in pixels (default 12)                                              |
| `fontFamily`                                             | `str`          | Font family (default `"system-ui, sans-serif"`)                               |
| `fontStyle`                                              | `str`          | CSS font style, e.g. `"italic"`                                               |
| `fontWeight`                                             | `int` \| `str` | CSS font weight, e.g. `300`, `700`, `"bold"`                                  |
| `debugBoundingBox`                                       | `bool`         | Draw the text's bounding box (for layout debugging)                           |
| `rotate`                                                 | `int`          | Rotation in degrees about the text anchor                                     |
| `x`, `cx`, `x2`, `w`, `emX`, `y`, `cy`, `y2`, `h`, `emY` | `int` \| `str` | Box-geometry position channels (position the text anchor)                     |
| `theta`, `thetaSize`, `r`, `rSize`                       | `int` \| `str` | Polar coord-space aliases for `x`/`w`/`y`/`h`                                 |
| `key`                                                    | `str`          | Internal per-node key override                                                |

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

# Italic label
text(text="note", fontStyle="italic")

# Light-weight label
text(text="caption", fontWeight=300)
```
