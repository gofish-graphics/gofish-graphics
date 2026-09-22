# geo

Projects longitude and latitude onto the plane. Inside a `geo` coordinate
space, `x` is longitude in degrees and `y` is latitude in degrees, so a mark
positioned by `x: "lon"` and `y: "lat"` lands where it belongs on a map.

::: gofish example:bird-migration-a-static hidden
:::

```ts
chart(world110m, {
  coord: geo("equalEarth", { lon: [-170, -30], lat: [-60, 75] }),
}).mark(polygon({ points: "ring", fill: "#f7f7f7", stroke: "#aaa" }));
```

## Signature

```ts
geo(
  projection: "equalEarth" | "mercator" | ((lonLat: [number, number]) => [number, number]),
  options?: {
    lon?: [number, number]; // longitude window in degrees
    lat?: [number, number]; // latitude window in degrees
  }
);
```

## Parameters

| Option       | Default        | Description                                                       |
| ------------ | -------------- | ----------------------------------------------------------------- |
| `projection` | —              | `"equalEarth"`, `"mercator"`, or your own `[lon, lat] => [x, y]`. |
| `lon`        | the data's own | Longitude window in degrees. Sets the frame.                      |
| `lat`        | the data's own | Latitude window in degrees. Sets the frame.                       |

Equal Earth and Mercator are implemented in the library, so there is no
dependency on `d3-geo`. A d3 projection object is callable with `[lon, lat]`,
so passing one as the third form works:

```ts
import { geoAlbersUsa } from "d3-geo";
chart(states, { coord: geo(geoAlbersUsa()) });
```

Mercator clamps latitude to ±85°, the usual bound, because the projection
sends the poles to infinity.

## The window is the frame

`lon` and `lat` say which part of the world the chart shows. The projected
window is fitted into the chart's width and height with a single scale factor,
so the map keeps its shape instead of being stretched to fill the box.

Leave `lon` and `lat` out and the window is the extent of the data in scope,
which is what you want for a chart whose marks are all the map there is.

Anything outside the window is left out of the picture: a shape whose box falls
entirely outside the window is not drawn. A shape that straddles an edge is
still drawn whole and hangs over the frame — cutting it would need a polygon
clipper, which GoFish does not have yet.

## Degrees stay degrees

Position scales under a `geo` space are the identity in degrees. There is no
nicing, no zero included in the domain, and no padding: a longitude of −100 is
100 degrees west, and the projection is what turns it into a pixel. This is
what lets a country outline and a bird's flight path share one frame without
either of them being re-scaled.

## Axis aliases

Inside a `geo` coord, `x` can be written `lon` and `y` can be written `lat`.
Like the polar aliases, they are scope-bounded: using them outside a coord that
declares them throws.

## Layering over a basemap

A chart's `coord` applies to every tier of a `.layer(...)` stack, not only to
the tier that declares it. So a basemap and the paths drawn over it share one
projection:

```ts
chart(world110m, {
  coord: geo("equalEarth", { lon: [-170, -30], lat: [-60, 75] }),
})
  .mark(polygon({ points: "ring", fill: "#f7f7f7", stroke: "#aaa" }))
  .layer(
    chart(birds)
      .flow(
        group({ by: "species" }),
        scatter({ by: "day", x: "lon", y: "lat" })
      )
      .mark(line({ stroke: "species", strokeWidth: 1, opacity: 0.5 }))
  )
  .render(root, { w: 600, h: 600 });
```

## Curved edges

A straight edge in degrees is a curve on the projected plane. Shapes under a
`geo` space are adaptively resampled before they are drawn, so a country
outline follows the projection rather than joining its vertices with straight
pixels.

## See also

- [`polygon`](../marks/polygon) — a mark whose `points` can read one ring per
  data row, which is how a basemap is drawn.
- [`polar`](./polar) — the other family of coordinate spaces.
