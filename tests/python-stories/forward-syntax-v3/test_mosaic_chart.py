"""Equivalent of MosaicChart.stories.tsx — Forward Syntax V3/Mosaic Chart."""

from gofish import chart, stack, rect
from python_stories.data import MOSAIC_DATA


def story_default():
    return (
        chart(MOSAIC_DATA, axes=True)
        .flow(
            # Column widths ∝ each region's total (marginal); segments fill the
            # column by cylinder share (conditional): `w="count"` sizes the
            # column by its raw Σcount, `normalize=True` rescales the same field
            # so the segments fill the height. No preprocessing.
            stack(by="origin", dir="x"),
            stack(by="cylinders", dir="y", w="count", normalize=True),
        )
        .mark(rect(h="count", fill="origin", stroke="white", strokeWidth=2)),
        {"w": 400, "h": 400},
    )
