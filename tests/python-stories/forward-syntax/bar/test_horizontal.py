"""Equivalent of BarHorizontal.stories.tsx — Forward Syntax/Bar/Horizontal."""

from gofish import chart, spread, rect
from python_stories.data import SEAFOOD


def story_default():
    return (
        chart(SEAFOOD, w=400, h=400)
        .flow(spread(by="lake", dir="y"))
        .mark(rect(w="count")),
        {},
    )
