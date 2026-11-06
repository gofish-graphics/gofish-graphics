"""Equivalent of 2DHistogramScatterPlot.stories.tsx — Vega-Lite/2D Histogram Scatter Plot."""

from gofish import Bin, chart, circle, field, partition
from python_stories.vega_data_urls import read_json


def story_default():
    # Use the same npm-pinned movies.json the JS storybook loads — the
    # Python `vega_datasets` package ships an older snapshot with
    # different rows, which breaks byte parity.
    movies = read_json("movies.json").astype({"Title": str})
    movies = movies[
        movies["IMDB Rating"].notna() & movies["Rotten Tomatoes Rating"].notna()
    ]

    # One cell per pair of bins, and in it a circle whose area is the
    # number of movies in the cell. The largest circle fits its cell.
    return (
        chart(movies, w=300, h=300)
        .flow(
            partition(
                by={
                    "x": field("IMDB Rating").bin(Bin.step(1)),
                    "y": field("Rotten Tomatoes Rating").bin(Bin.step(10)),
                }
            )
        )
        .mark(
            circle(
                area=field("IMDB Rating").count(),
                fill="transparent",
                stroke="black",
                stroke_width=1,
            )
        ),
        {},
    )
