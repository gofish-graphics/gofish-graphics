"""Equivalent of Histogram/Histogram.stories.tsx — Vega-Lite/Histogram/Histogram."""

from gofish import bin, chart, derive, rect, scatter
from python_stories.vega_data_urls import read_json


def story_default():
    df = read_json("movies.json")
    movies = df.to_dict("records")
    return (
        chart(movies)
        .flow(
            derive(bin("IMDB Rating")),
            scatter(xMin="start", xMax="end"),
        )
        .mark(rect(h="count")),
        {"w": 500, "h": 300, "axes": True},
    )
