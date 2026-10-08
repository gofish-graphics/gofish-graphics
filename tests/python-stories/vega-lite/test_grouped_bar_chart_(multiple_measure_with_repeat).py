"""Equivalent of GroupedBarChartRepeat.stories.tsx —
Vega-Lite/Grouped Bar Chart (Multiple Measure with Repeat).

Demonstrates the low-level combinator form of `spread` used as a mark with
two explicit child rects, plus the `datum()` per-row-value wrapper so the
fill reads the per-row value directly instead of going through a
categorical color encoding.
"""

from gofish import chart, rect, spread, datum, field
from python_stories.vega_data_urls import read_json


def story_default():
    # A few titles are numbers (1776, 2012): give the column one type.
    movies = read_json("movies.json").astype({"Title": str}).to_dict("records")
    return (
        chart(
            movies,
            # TODO(#1017): remove label_angle once "auto" is the default.
            axes={"x": {"label_angle": "auto"}, "y": {"title": "Total Gross"}},
        )
        .flow(spread(by="Major Genre", dir="x"))
        .mark(
            spread(
                [
                    # Both columns are dollars, so they share one measure and one value axis.
                    rect(h=field("Worldwide Gross", "dollars"), fill=datum("Worldwide Gross")),
                    rect(h=field("US Gross", "dollars"), fill=datum("US Gross")),
                ],
                dir="x",
                spacing=0,
            )
        ),
        {"w": 600, "h": 300},
    )
