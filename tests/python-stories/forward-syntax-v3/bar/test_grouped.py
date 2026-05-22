"""Equivalent of BarGrouped.stories.tsx — Forward Syntax V3/Bar/Grouped."""

from gofish import chart, spread, stack, rect
from python_stories.data import SEAFOOD


def story_default():
    return (
        chart(SEAFOOD)
        .flow(
            spread(by="lake", dir="x"),
            stack(by="species", dir="x"),
        )
        .mark(rect(h="count", fill="species")),
        {"w": 400, "h": 400, "axes": True},
    )
