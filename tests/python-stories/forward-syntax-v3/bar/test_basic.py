"""Equivalent of BarBasic.stories.tsx — Forward Syntax V3/Bar/Basic."""

from gofish import chart, spread, rect
from python_stories.data import SEAFOOD


def story_default():
    return (
        chart(SEAFOOD)
        .flow(spread(by="lake", dir="x"))
        .mark(rect(h="count")),
        {"w": 400, "h": 400, "axes": True},
    )
