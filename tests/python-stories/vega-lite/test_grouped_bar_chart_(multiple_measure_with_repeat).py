"""Equivalent of GroupedBarChartRepeat.stories.tsx —
Vega-Lite/Grouped Bar Chart (Multiple Measure with Repeat).

Demonstrates the low-level combinator form of `spread` used as a mark with
two explicit child rects, plus the `datum()` per-row-value wrapper so the
fill reads the per-row value directly instead of going through a
categorical color encoding.
"""

from gofish import chart, rect, spread, datum
from python_stories.vega_data_urls import read_json


def story_default():
    movies = read_json("movies.json").to_dict("records")
    return (
        chart(movies)
        .flow(spread(by="Major Genre", dir="x"))
        .mark(
            spread(
                [
                    rect(h="Worldwide Gross", fill=datum("Worldwide Gross")),
                    rect(h="US Gross", fill=datum("US Gross")),
                ],
                dir="x",
                spacing=0,
            )
        ),
        {"w": 600, "h": 300, "axes": True},
    )
