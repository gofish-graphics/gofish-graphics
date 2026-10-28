"""Equivalent of BarStackedWithLabels.stories.tsx — Forward Syntax/Bar/Stacked With Labels."""

from gofish import chart, rect, spread, stack
from python_stories.data import SEAFOOD


def story_default():
    mark = rect(h="count", fill="species").label(
        "species", position="center", color="white", font_size=12
    )
    return (
        chart(SEAFOOD, w=440, h=400)
        .flow(
            spread(by="lake", dir="x"),
            stack(by="species", dir="y"),
        )
        .mark(mark),
        {},
    )
