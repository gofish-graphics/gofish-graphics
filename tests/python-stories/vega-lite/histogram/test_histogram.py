"""Equivalent of Histogram/Histogram.stories.tsx — Vega-Lite/Histogram/Histogram."""

from gofish import chart, field, rect, spread
from python_stories.vega_data_urls import read_json


def story_default():
    # A few titles are numbers (1776, 2012): give the column one type.
    movies = read_json("movies.json").astype({"Title": str})
    return (
        chart(movies, axes=True)
        .flow(spread(by=field("IMDB Rating").bin(), dir="x", spacing=1))
        .mark(rect(h=field("IMDB Rating").count())),
        {"w": 500, "h": 300},
    )
