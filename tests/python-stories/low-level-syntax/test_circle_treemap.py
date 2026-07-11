"""Equivalent of lowlevel/CircleTreemap.stories.tsx — same shape as Treemap
but with circles instead of rects.
"""

from gofish import chart, circle, field, treemap
from python_stories.vega_data_urls import read_json

GRAY = "#D1D9E2"


def story_default():
    movies_raw = read_json("movies.json").to_dict("records")

    return (
        chart(movies_raw)
        .flow(
            treemap(
                by=field("Major Genre").drop_nulls(),
                size="Worldwide Gross",
                paddingInner=2,
                paddingOuter=2,
                round=True,
            )
        )
        .mark(
            circle(fill="Major Genre", stroke=GRAY, strokeWidth=1).label(
                "Major Genre", position="center", color="white", fontSize=12
            )
        ),
        {"w": 700, "h": 420},
    )
