"""Equivalent of 2DHistogramScatterPlot.stories.tsx — Vega-Lite/2D Histogram Scatter Plot."""

import math

from gofish import chart, log, scatter, rect
from vega_datasets import data as vega_data


def _present(v):
    return v is not None and not (isinstance(v, float) and math.isnan(v))


def story_default():
    df = vega_data.movies()
    # vega_datasets normalizes column names with underscores; JS reads the
    # raw JSON which keeps spaces. Restore the JS-side names so positional
    # accessors line up.
    df = df.rename(columns={
        "IMDB_Rating": "IMDB Rating",
        "Rotten_Tomatoes_Rating": "Rotten Tomatoes Rating",
    })
    movies_raw = df.to_dict("records")

    imdb_values = [d["IMDB Rating"] for d in movies_raw if _present(d["IMDB Rating"])]
    rt_values = [
        d["Rotten Tomatoes Rating"]
        for d in movies_raw
        if _present(d["Rotten Tomatoes Rating"])
    ]
    xbin_size = (max(imdb_values) - min(imdb_values)) / 10 or 1
    ybin_size = (max(rt_values) - min(rt_values)) / 10 or 1

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
        .flow(
            log("scatter locations"),
            scatter(by="id", x="x", y="y", debug=True),
        )
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
