"""Equivalent of lowlevel/Treemap.stories.tsx — Low Level Syntax/Treemap.

Movie counts by major genre laid out as a treemap of nested rectangles
whose areas encode each genre's worldwide-gross total. `treemap(by=...)`
partitions the raw rows itself (like `spread`/`group`); `size="Worldwide
Gross"` sums that field per genre to weight each tile's area.
"""

from gofish import chart, field, rect, squarify, treemap
from python_stories.vega_data_urls import read_json

GRAY = "#D1D9E2"  # mirrors packages/gofish-graphics/src/color.ts:492


def story_default():
    # A few titles are numbers (1776, 2012): give the column one type.
    movies_raw = read_json("movies.json").astype({"Title": str})

    return (
        chart(movies_raw)
        .flow(
            treemap(
                by=field("Major Genre").drop_nulls(),
                size="Worldwide Gross",
                spacing=2,
                padding=2,
                round=True,
                tile=squarify(),
            )
        )
        .mark(
            rect(
                fill="Major Genre",
                stroke=GRAY,
                stroke_width=1,
                rx=2,
                ry=2,
            ).label("Major Genre", position="center", color="white", font_size=12)
        ),
        {"w": 700, "h": 420},
    )
