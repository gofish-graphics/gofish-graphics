"""Equivalent of WaffleChart.stories.tsx — Forward Syntax V3/Waffle Chart."""

from gofish import chart, spread, derive, rect, repeat
from python_stories.data import SEAFOOD


def story_default():
    return (
        chart(SEAFOOD)
        .flow(
            # Bottom-align the lake columns (y-down: "end" = bottom) so the
            # waffles sit on a baseline and fill upward.
            spread(by="lake", spacing=8, dir="x", axes=False, alignment="end"),
            derive(lambda d: [item for row in d for item in repeat(row, "count")]),
            derive(lambda d: [d[i : i + 5] for i in range(0, len(d), 5)]),
            # Reverse the rows so the ragged partial row lands at the top.
            spread(spacing=2, dir="y", reverse=True),
            spread(spacing=2, dir="x"),
        )
        .mark(rect(w=8, h=8, fill="species")),
        {"axes": True},
    )
