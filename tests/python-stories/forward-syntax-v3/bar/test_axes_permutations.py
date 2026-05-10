"""Equivalent of BarAxesPermutations.stories.tsx — Forward Syntax V3/Bar/Axes Permutations."""

from gofish import chart, spread, rect
from python_stories.data import SEAFOOD


def story_axes_true():
    return (
        chart(SEAFOOD).flow(spread(by="lake", dir="x")).mark(rect(h="count")),
        {"w": 400, "h": 400, "axes": True},
    )


def story_axes_false():
    return (
        chart(SEAFOOD).flow(spread(by="lake", dir="x")).mark(rect(h="count")),
        {"w": 400, "h": 400, "axes": False},
    )
