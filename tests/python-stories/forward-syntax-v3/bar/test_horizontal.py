"""Equivalent of BarHorizontal.stories.tsx — Forward Syntax V3/Bar/Horizontal."""

from gofish import chart, spread, rect
from python_stories.data import SEAFOOD


def story_default():
    return (
        chart(SEAFOOD)
        .flow(spread(by="lake", dir="y"))
        .mark(rect(w="count")),
        {"w": 400, "h": 400, "axes": True},
    )
