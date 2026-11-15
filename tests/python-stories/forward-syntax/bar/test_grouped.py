"""Equivalent of BarGrouped.stories.tsx — Forward Syntax/Bar/Grouped."""

from gofish import chart, spread, rect
from python_stories.data import SEAFOOD


def story_default():
    return (
        chart(SEAFOOD, w=400, h=400, axes={"x": {"levels": [False, True]}})
        .flow(
            spread(by="lake", dir="x", spacing=24),
            spread(by="species", dir="x", spacing=2),
        )
        .mark(rect(h="count", fill="species")),
        {},
    )
