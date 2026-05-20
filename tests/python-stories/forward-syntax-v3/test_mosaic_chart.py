"""Equivalent of MosaicChart.stories.tsx — Forward Syntax V3/Mosaic Chart."""

from gofish import chart, spread, stack, derive, rect, normalize
from python_stories.data import MOSAIC_DATA


def story_default():
    return (
        chart(MOSAIC_DATA)
        .flow(
            spread(by="origin", dir="x"),
            derive(lambda d: normalize(d, "count")),
            stack(by="cylinders", dir="y"),
        )
        .mark(rect(h="count", fill="origin", stroke="white", strokeWidth=2)),
        {"w": 400, "h": 400, "axes": True},
    )
