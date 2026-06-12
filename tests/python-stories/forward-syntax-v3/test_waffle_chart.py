"""Equivalent of WaffleChart.stories.tsx — Forward Syntax V3/Waffle Chart."""

from gofish import chart, spread, derive, rect, repeat
from python_stories.data import SEAFOOD


def story_default():
    return (
        chart(SEAFOOD)
        .flow(
            spread(by="lake", spacing=8, dir="x", axes=False),
            derive(lambda d: [item for row in d for item in repeat(row, "count")]),
            derive(lambda d: [d[i : i + 5] for i in range(0, len(d), 5)]),
            spread(spacing=2, dir="y"),
            spread(spacing=2, dir="x"),
        )
        .mark(rect(w=8, h=8, fill="species")),
        {"w": 400, "h": 400, "axes": True},
    )
