"""Equivalent of Histogram/Histogram.stories.tsx — Vega-Lite/Histogram/Histogram."""

from gofish import bin, chart, derive, rect, scatter
from python_stories.vega_data_urls import read_json


def story_default():
    # A few titles are numbers (1776, 2012): give the column one type.
    movies = read_json("movies.json").astype({"Title": str})
    return (
        chart(movies, axes=True)
        .flow(
            derive(bin("IMDB Rating")),
            scatter(x_min="start", x_max="end"),
        )
        .mark(rect(h="count")),
        {"w": 500, "h": 300},
    )
