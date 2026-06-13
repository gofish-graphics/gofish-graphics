# image

Draws a raster or SVG image for each data item. Use it for logos, icons, photo
glyphs, or any artwork you want to place and size like a native mark.

```python
from gofish import chart, image

chart([{"label": "badge"}]).mark(
    image(href="https://example.com/badge.svg", w=96, h=64)
).render(w=150, h=120)
```

## Signature

```python
image(href=None, w=None, h=None, x=None, y=None, debug=None) -> Mark
```

## Parameters

| Parameter | Type           | Description                                                  |
| --------- | -------------- | ------------------------------------------------------------ |
| `href`    | `str`          | Image source — a URL or `data:` URI (required)               |
| `w`       | `int` \| `str` | Width — a constant in pixels or a field name to encode data  |
| `h`       | `int` \| `str` | Height — a constant in pixels or a field name to encode data |
| `x`, `y`  | `int` \| `str` | Explicit position accessors                                  |
| `debug`   | `bool`         | Log debug info to the console                                |

Returns a `Mark` for use in [`.mark()`](/python/api/core/mark).

## Sizing

`href` is required. Width and height are resolved from the image's intrinsic
dimensions when not given:

- **`w` and `h`** — the image is drawn at exactly that size.
- **`w` only** (or **`h` only**) — the missing dimension is derived from the
  image's intrinsic aspect ratio, so the image scales proportionally.
- **neither** — the image renders at its intrinsic pixel dimensions. GoFish
  reads these by probing the loaded image (or parsing an SVG `data:` URI).

## Examples

```python
# Fixed size
chart(data).mark(image(href=bottle_png, w=193, h=600))

# Scale to a width, keep the aspect ratio
chart(data).mark(image(href=bottle_jpg, w=90))

# Intrinsic size from a data URI
chart(data).mark(image(href=inline_badge_svg))
```
