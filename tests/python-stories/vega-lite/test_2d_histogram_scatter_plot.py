"""Equivalent of 2DHistogramScatterPlot.stories.tsx — Vega-Lite/2D Histogram Scatter Plot."""

import math

from gofish import chart, scatter, rect
from python_stories.vega_data_urls import read_json


def _present(v):
    return v is not None and not (isinstance(v, float) and math.isnan(v))


def _js_numeric(v):
    """Mirror JS `Math.min`/`Math.max` coercion: `null` → 0, `NaN` propagates
    as 0 here because pandas converts JSON `null` to `float('nan')`."""
    if v is None or (isinstance(v, float) and math.isnan(v)):
        return 0
    return v


def story_default():
    # Use the same npm-pinned movies.json the JS storybook loads — the
    # Python `vega_datasets` package ships an older snapshot with
    # different rows, which breaks byte parity.
    df = read_json("movies.json")
    movies_raw = df.to_dict("records")

    # JS `Math.max(...arr.map(d => d["IMDB Rating"]))` runs on the *unfiltered*
    # list, where missing ratings (null) coerce to 0. Mirror that so the bin
    # size matches what the JS storybook computes.
    imdb_all = [_js_numeric(d["IMDB Rating"]) for d in movies_raw]
    rt_all = [_js_numeric(d["Rotten Tomatoes Rating"]) for d in movies_raw]
    xbin_size = (max(imdb_all) - min(imdb_all)) / 10 or 1
    ybin_size = (max(rt_all) - min(rt_all)) / 10 or 1

    movies = [
        {
            "x": math.floor(d["IMDB Rating"] / xbin_size) * xbin_size,
            "y": math.floor(d["Rotten Tomatoes Rating"] / ybin_size) * ybin_size,
        }
        for d in movies_raw
        if _present(d["IMDB Rating"]) and _present(d["Rotten Tomatoes Rating"])
    ]

    seen_xs: list = []
    seen_ys: list = []
    for d in movies:
        if d["x"] not in seen_xs:
            seen_xs.append(d["x"])
        if d["y"] not in seen_ys:
            seen_ys.append(d["y"])

    counts = []
    for x in seen_xs:
        for y in seen_ys:
            count = sum(1 for d in movies if d["x"] == x and d["y"] == y)
            if count > 0:
                counts.append({"x": x, "y": y, "count": count})

    max_count = max([1, *(c["count"] for c in counts)])

    movie_counts = []
    for i, d in enumerate(counts):
        t = d["count"] / max_count
        w = max(1, xbin_size * 5 * t) / len(seen_xs)
        h = max(1, ybin_size * 5 * t) / len(seen_ys)
        size = min(w, h)
        movie_counts.append({**d, "size": size, "id": i})

    return (
        chart(movie_counts)
        .flow(scatter(by="id", x="x", y="y"))
        .mark(
            rect(
                w="size",
                aspectRatio=1,
                fill="transparent",
                stroke="black",
                strokeWidth=1,
                rx=2,
                ry=2,
            )
        ),
        {"w": 600, "h": 300, "axes": True},
    )
