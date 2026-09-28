---
order: 10
---

# rect

Draws a rectangle for each data item.

::: gofish

```js
gf.chart([{ value: 80 }])
  .mark(gf.rect({ w: 120, h: "value", fill: "steelblue", rx: 4 }))
  .render(root, { w: 200, h: 150 });
```

:::

## Signature

```ts
rect({ w?, h?, dims?, fill?, stroke?, strokeWidth = 0, rx?, ry? })
```

## Parameters

::: gofish-ref rect
:::

Chain [`.label(accessor, ...)`](/js/guides/labels) on the returned mark to
attach a text label — there is no `label` option here.

## Axis names

`x`, `y`, `w`, and `h` mean the first and second axis in any coordinate space.
Under [`polar`](/js/api/coords/polar) that is the angle and the radius; under
[`geo`](/js/api/coords/geo) it is longitude and latitude.

To use the names a coordinate space gives its axes, put them in `dims`. Each
key is an axis name, and each value is either a position (like `x`) or an
object with any of `min`, `center`, `max`, `size`, and `embedded`:

```ts
// Inside polar(): the same wedge as rect({ w: 0.4, h: "value" })
rect({ dims: { theta: { size: 0.4 }, r: { size: "value" } } });

// Inside geo(): the same box as rect({ x: "lon", y: "lat", w: 4, h: 4 })
rect({ dims: { lon: "lon", lat: "lat" }, w: 4, h: 4 });
```

`x` and `y` are always valid keys too. A name the enclosing coordinate space
does not declare throws an error that lists the ones it does, and setting the
same part of an axis twice (for example `w` and `dims.theta.size`) is an error.
The same `dims` option works on `ellipse`, `petal`, `text`, `image`, and
`layer`.

## Examples

```ts
// Bar chart: height encodes "value" field
.mark(rect({ h: "value" }))

// Fixed size with rounded corners
.mark(rect({ w: 20, h: 20, rx: 4 }))

// Color encodes "category" field
.mark(rect({ h: "value", fill: "category" }))

// Named for use with selectAll()
.mark(rect({ h: "value" }).name("bars"))
```
