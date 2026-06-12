"""Equivalent of BarStackedFluent.stories.tsx — Forward Syntax V3/Bar/Stacked Fluent."""

from gofish import chart, rect
from python_stories.data import SEAFOOD


def story_default():
    return (
        chart(SEAFOOD)
        .facet(by="lake", dir="x")
        .stack(by="species", dir="y")
        .mark(rect(h="count", fill="species")),
        {"w": 400, "h": 400, "axes": True},
    )
