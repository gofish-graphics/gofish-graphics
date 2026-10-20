"""Equivalent of BarStacked.stories.tsx — Forward Syntax/Bar/Stacked."""

from gofish import chart, spread, stack, rect
from python_stories.data import SEAFOOD


def story_default():
    return (
        chart(SEAFOOD, w=400, h=400)
        .flow(
            spread(by="lake", dir="x"),
            stack(by="species", dir="y"),
        )
        .mark(rect(h="count", fill="species")),
        {},
    )
