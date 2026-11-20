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
rect({ x?, cx?, x2?, w?, emX?, y?, cy?, y2?, h?, emY?, dims?,
       fill?, stroke?, strokeWidth = 0, opacity?, filter?,
       rx?, ry?, aspectRatio?, inset?, key? })
```

## Parameters

::: gofish-ref rect
:::

Chain [`.label(accessor, ...)`](/js/guides/labels) on the returned mark to
attach a text label — there is no `label` option here.

## Position and size

On each axis a rect takes a start (`x`, `y`), a center (`cx`, `cy`), an
other end (`x2`, `y2`), and a size (`w`, `h`). Each takes a constant in
pixels or a data value: a field name, an accessor, or `v(...)`. Two of them
place the rect on an axis. These pairs work:

| On an axis                      | The rect                                |
| ------------------------------- | --------------------------------------- |
| start and size (`y`, `h`)       | starts at `y` and is `h` long           |
| center and size (`cy`, `h`)     | is centered on `cy` and is `h` long     |
| start and other end (`y`, `y2`) | spans from `y` to `y2`, in either order |
| size only (`h`)                 | is `h` long, and its parent places it   |
| none                            | fills the space its parent gives it     |

Both ends must be data values; in any other case the rect does not span to
`x2` or `y2`. With both ends it ignores `w` and `h`. Under
[`Coord.polar`](/js/api/coords/polar) and [`Coord.clock`](/js/api/coords/clock),
a rect between two fields draws as a straight stroke, not a bent band; give
it a start and a size there.

See [How to draw a mark between two values](/js/api/howto/intervals) for box
plots, error bars, and Gantt bars.

## Axis names

`x`, `y`, `w`, and `h` mean the first and second axis in any coordinate space.
Under [`polar`](/js/api/coords/polar) that is the angle and the radius; under
[`geo`](/js/api/coords/geo) it is longitude and latitude.

To use the names a coordinate space gives its axes, put them in `dims`. Each
key is an axis name, and each value is either a position (like `x`) or an
object with any of `min`, `center`, `max`, `size`, and `embedded`:

```ts
// Inside Coord.polar(): the same wedge as rect({ w: 0.4, h: "value" })
rect({ dims: { theta: { size: 0.4 }, r: { size: "value" } } });

// Inside Coord.geo(): the same box as rect({ x: "lon", y: "lat", w: 4, h: 4 })
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

// Gantt bar: from the "start" field to the "end" field
.mark(rect({ x: "start", x2: "end", h: 16 }))

// Color encodes "category" field
.mark(rect({ h: "value", fill: "category" }))

// Named for use with selectAll()
.mark(rect({ h: "value" }).name("bars"))
```
