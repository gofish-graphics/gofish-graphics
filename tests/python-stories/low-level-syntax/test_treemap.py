"""Equivalent of lowlevel/Treemap.stories.tsx — Low Level Syntax/Treemap.

Movie counts by major genre laid out as a treemap of nested rectangles
whose areas encode each genre's worldwide-gross total. `treemap(by=...)`
partitions the raw rows itself (like `spread`/`group`); `size="Worldwide
Gross"` sums that field per genre to weight each tile's area.
"""

from gofish import chart, field, rect, treemap
from python_stories.vega_data_urls import read_json

GRAY = "#D1D9E2"  # mirrors packages/gofish-graphics/src/color.ts:492


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
                tile="squarify",
                flipY=False,
            )
        )
        .mark(
            rect(
                fill="Major Genre",
                stroke=GRAY,
                strokeWidth=1,
                rx=2,
                ry=2,
                label=True,
            )
        ),
        {"w": 700, "h": 420},
    )
