"""Equivalent of lowlevel/CircleTreemap.stories.tsx — same shape as Treemap
but with circles instead of rects.
"""

from gofish import chart, circle, field, treemap
from python_stories.vega_data_urls import read_json

GRAY = "#D1D9E2"


def story_default():
    # A few titles are numbers (1776, 2012): give the column one type.
    movies_raw = read_json("movies.json").astype({"Title": str})

    return (
        chart(movies_raw, axes=False)
        .flow(
            treemap(
                by=field("Major Genre").drop_nulls(),
                size="Worldwide Gross",
                spacing=2,
                padding=2,
                round=True,
            )
        )
        .mark(
            circle(fill="Major Genre", stroke=GRAY, stroke_width=1).label(
                "Major Genre", position="center", color="white", font_size=12
            )
        ),
        {"w": 700, "h": 420},
    )
