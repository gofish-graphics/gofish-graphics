"""Equivalent of MosaicChart.stories.tsx — Forward Syntax V3/Mosaic Chart."""

from gofish import chart, stack, rect, field
from python_stories.data import MOSAIC_DATA


def story_default():
    return (
        chart(MOSAIC_DATA, axes=True)
        .flow(
            # Column widths ∝ each region's total (marginal): `size="count"`
            # sizes each column by its raw Σcount. Stacked segments fill the
            # column, split by cylinder share (conditional): `size:
            # field("count").normalize()` replaces both the segment's raw count
            # AND its w/h — the wrapper's data-driven size claim fills the
            # column height in proportion to each cylinder group's share. No
            # preprocessing.
            stack(by="origin", dir="x", size="count"),
            stack(by="cylinders", dir="y", size=field("count").normalize()),
        )
        .mark(rect(fill="origin", stroke="white", strokeWidth=2)),
        {"w": 400, "h": 400},
    )
