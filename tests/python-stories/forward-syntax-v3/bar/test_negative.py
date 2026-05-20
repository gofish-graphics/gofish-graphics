"""Equivalent of BarNegative.stories.tsx — Forward Syntax V3/Bar/Negative."""

from gofish import chart, spread, rect
from python_stories.data import NEGATIVE_BAR_DATA


def story_default():
    return (
        chart(NEGATIVE_BAR_DATA)
        .flow(spread(by="category", dir="x"))
        .mark(rect(h="value")),
        {"w": 400, "h": 400, "axes": True},
    )
