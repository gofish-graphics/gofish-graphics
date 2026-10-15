# Coord.geo

Projects longitude and latitude onto the plane. Inside a `geo` coordinate
space, `x` is longitude in degrees and `y` is latitude in degrees, so a mark
positioned by `x="lon"` and `y="lat"` lands where it belongs on a map.

::: gofish example:bird-migration-a-static hidden
:::

```python
from gofish import chart, polygon, Coord

chart(world110m, coord=Coord.geo("equalEarth", lon=(-170, -30), lat=(-60, 75))) \
    .mark(polygon(points="ring", fill="#f7f7f7", stroke="#aaa"))
```

## Signature

```python
Coord.geo(
    projection: str,                         # "equalEarth" or "mercator"
    lon: tuple[float, float] | None = None,  # longitude window in degrees
    lat: tuple[float, float] | None = None,  # latitude window in degrees
) -> Coord
```

## Parameters

::: gofish-ref geo
:::

Python names a projection by its string. The JavaScript `Coord.geo` also takes
a function `[lon, lat] => [x, y]`, such as a d3-geo projection, but a function
cannot cross from Python to the renderer.

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
still drawn whole and hangs over the frame.

## Degrees stay degrees

Position scales under a `geo` space are the identity in degrees. There is no
nicing, no zero included in the domain, and no padding: a longitude of −100 is
100 degrees west, and the projection is what turns it into a pixel.

## Axis names

`x` and `y` always work, and inside a `geo` space they mean longitude and
latitude. The space also declares the names `lon` and `lat`, which you can use
wherever an axis is named: as a key of a mark's or a scatter's `dims` keyword,
and as an operator's `dir`.

```python
chart(cities, coord=Coord.geo("equalEarth")) \
    .flow(scatter(by="name", dims={"lon": "lon", "lat": "lat"})) \
    .mark(circle(r=3))
```

This places each city exactly as `scatter(by="name", x="lon", y="lat")` does.
The names only work inside a `geo` space. Anywhere else, `lon` raises an error
that lists the names you can use there.

## Layering over a basemap

A chart's `coord` applies to every tier of a `.layer(...)` stack, not only to
the tier that declares it. So a basemap and the paths drawn over it share one
projection:

```python
chart(
    world110m,
    coord=Coord.geo("equalEarth", lon=(-170, -30), lat=(-60, 75)),
    legend=False,
) \
    .mark(polygon(points="ring", fill="#f7f7f7", stroke="#aaa")) \
    .layer(
        chart(birds)
        .flow(group(by="species"), scatter(by="day", x="lon", y="lat"))
        .mark(line(stroke="species", stroke_width=1, opacity=0.5))
    ) \
    .render(w=600, h=600)
```

## See also

- [`polygon`](../marks/polygon) — a mark whose `points` can read one ring per
  data row, which is how a basemap is drawn.
- [`polar`](./polar) — the other family of coordinate spaces.
