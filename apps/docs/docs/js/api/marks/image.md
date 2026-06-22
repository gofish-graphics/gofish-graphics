# image

Draws a raster or SVG image for each data item. Use it for logos, icons, photo
glyphs, or any artwork you want to place and size like a native mark.

::: gofish

```js
gf.chart([{ label: "badge" }])
  .mark(
    gf.image({
      href: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='96' height='64'%3E%3Crect width='96' height='64' rx='8' fill='%234e79a7'/%3E%3Ccircle cx='48' cy='32' r='18' fill='white'/%3E%3C/svg%3E",
      w: 96,
      h: 64,
    })
  )
  .render(root, { w: 150, h: 120 });
```

:::

## Signature

```ts
image({ href, w?, h?, x?, y?, opacity?, filter?, preserveAspectRatio?, name? })
```

## Parameters

| Option                | Type               | Description                                                    |
| --------------------- | ------------------ | -------------------------------------------------------------- |
| `href`                | `string`           | Image source — a URL, asset import, or `data:` URI (required)  |
| `w`                   | `number \| string` | Width — number for fixed pixels, field name to encode data     |
| `h`                   | `number \| string` | Height — number for fixed pixels, field name to encode data    |
| `x`, `y`              | `number \| string` | Explicit position accessors                                    |
| `opacity`             | `number`           | Opacity, `0`–`1`                                               |
| `filter`              | `string`           | SVG filter reference applied to the image                      |
| `preserveAspectRatio` | `string`           | SVG `preserveAspectRatio` value (default `"xMidYMid meet"`)    |
| `name`                | `string`           | Layer name for use with [`selectAll()`](/js/api/selection/ref) |

## Sizing

`href` is required. Width and height are resolved from the image's intrinsic
dimensions when not given:

- **`w` and `h`** — the image is drawn at exactly that size.
- **`w` only** (or **`h` only**) — the missing dimension is derived from the
  image's intrinsic aspect ratio, so the image scales proportionally.
- **neither** — the image renders at its intrinsic pixel dimensions. GoFish
  reads these by probing the loaded image (or parsing an SVG `data:` URI), so the
  mark waits for the source to load before it produces a node.

## Examples

```ts
// Fixed size
.mark(image({ href: bottlePng, w: 193, h: 600 }))

// Scale to a width, keep the aspect ratio
.mark(image({ href: bottleJpg, w: 90 }))

// Intrinsic size from a data URI
.mark(image({ href: inlineBadgeSvg }))

// Named for use with selectAll()
.mark(image({ href: logoPng, w: 48 }).name("logos"))
```
