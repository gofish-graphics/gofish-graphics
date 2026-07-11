"""Equivalent of BarStackedWithLabels.stories.tsx — Forward Syntax V3/Bar/Stacked With Labels."""

from gofish import chart, rect, spread, stack
from python_stories.data import SEAFOOD


def story_default():
    mark = rect(h="count", fill="species").label(
        "species", position="center", color="white", fontSize=12
    )
    return (
        chart(SEAFOOD)
        .flow(
            spread(by="lake", dir="x"),
            stack(by="species", dir="y"),
        )
        .mark(mark),
        {"w": 400, "h": 400, "axes": True},
    )
