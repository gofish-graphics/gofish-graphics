"""Equivalent of BarSortedStacked.stories.tsx — Forward Syntax V3/Bar/Sorted Stacked."""

from gofish import chart, spread, stack, derive, rect
from python_stories.data import SEAFOOD


def story_default():
    return (
        chart(SEAFOOD)
        .flow(
            spread(by="lake", dir="x"),
            derive(lambda d: sorted(d, key=lambda row: row["count"])),
            stack(by="species", dir="y"),
        )
        .mark(rect(h="count", fill="species")),
        {"w": 400, "h": 400, "axes": True},
    )
