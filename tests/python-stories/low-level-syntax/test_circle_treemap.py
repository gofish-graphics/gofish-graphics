"""Equivalent of lowlevel/CircleTreemap.stories.tsx — same shape as Treemap
but with circles instead of rects.
"""

import math
from collections import defaultdict

from gofish import Treemap, circle, datum
from python_stories.vega_data_urls import read_json

GRAY = "#D1D9E2"


def _to_num(v) -> float:
    """Mirror JS `Number(v) || 0` — null/NaN → 0."""
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

    grouped: dict = defaultdict(list)
    for d in movies_raw:
        g = d.get("Major Genre")
        if g is None or (isinstance(g, float) and math.isnan(g)):
            continue
        grouped[str(g)].append(d)

    nodes = []
    for genre, values in grouped.items():
        worldwide_gross = sum(_to_num(d.get("Worldwide Gross")) for d in values)
        if worldwide_gross <= 0:
            continue
        nodes.append(
            circle(
                fill=datum(genre),
                stroke=GRAY,
                strokeWidth=1,
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
        ),
        {"w": 700, "h": 420},
    )
