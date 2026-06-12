"""Equivalent of lowlevel/Treemap.stories.tsx — Low Level Syntax/Treemap.

Lays out one rect per genre in a worldwide-gross-weighted treemap. Each
genre rect carries its own datum (via `bind_data`) so the JS-side
`Treemap` operator can read `worldwideGross` off it to size the cell.
"""

import math
from collections import defaultdict

from gofish import Treemap, rect, datum
from python_stories.vega_data_urls import read_json

GRAY = "#D1D9E2"  # mirrors packages/gofish-graphics/src/color.ts:492


def _to_num(v) -> float:
    """Mirror JS `Number(v) || 0` — null/undefined/NaN → 0. pandas serializes
    missing JSON values as `nan`, which would otherwise poison the sum."""
    if v is None:
        return 0.0
    if isinstance(v, float) and math.isnan(v):
        return 0.0
    try:
        return float(v)
    except (TypeError, ValueError):
        return 0.0


def story_default():
    movies_raw = read_json("movies.json").to_dict("records")

    # Group by Major Genre, filtering out null-genre rows.
    grouped: dict = defaultdict(list)
    for d in movies_raw:
        g = d.get("Major Genre")
        if g is None or (isinstance(g, float) and math.isnan(g)):
            continue
        grouped[str(g)].append(d)

    # Per-genre node: one rect, fill driven by `v(genre)`, datum carrying
    # worldwideGross so Treemap can use it as the size value.
    nodes = []
    for genre, values in grouped.items():
        worldwide_gross = sum(_to_num(d.get("Worldwide Gross")) for d in values)
        if worldwide_gross <= 0:
            continue
        nodes.append(
            rect(
                fill=datum(genre),
                stroke=GRAY,
                strokeWidth=1,
                rx=2,
                ry=2,
                label=True,
            ).bind_data(
                {
                    "key": genre,
                    "values": values,
                    "worldwideGross": worldwide_gross,
                },
                genre,
            )
        )

    return (
        Treemap(
            nodes,
            valueField="worldwideGross",
            paddingInner=2,
            paddingOuter=2,
            round=True,
            tile="squarify",
            flipY=False
        ),
        {"w": 700, "h": 420},
    )
