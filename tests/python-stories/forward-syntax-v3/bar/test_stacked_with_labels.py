"""Equivalent of BarStackedWithLabels.stories.tsx — Forward Syntax V3/Bar/Stacked With Labels.

Note: The JS story uses `label: true` in the rect mark. The Python rect() currently
passes through extra kwargs via Mark, so this should work if the IR handles it.
"""

from gofish import chart, spread, stack
from gofish.ast import Mark
from python_stories.data import SEAFOOD


def story_default():
    # Use Mark directly to pass label=True since Python rect() doesn't have that param
    mark = Mark("rect", h="count", fill="species", label=True)
    return (
        chart(SEAFOOD)
        .flow(
            spread(by="lake", dir="x"),
            stack(by="species", dir="y"),
        )
        .mark(mark),
        {"w": 400, "h": 400, "axes": True},
    )
