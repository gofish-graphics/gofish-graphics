"""Equivalent of SlopeChart.stories.tsx — Forward Syntax V3/Slope Chart.

Six site panels, each holding ten short two-point slopes (one per barley
variety) from the 1931 yield to the 1932 yield. No `along` on the line: the
default split (issue #752) reads it straight off the flow — the year spread
is the innermost tier that lays out the travel axis (x), so it becomes the
path tier, and every OTHER grouping (site, variety) splits.
"""

from gofish import chart, spread, scatter, line
from vega_datasets import data as vega_data


def story_default():
    barley = vega_data.barley()
    return (
        chart(barley, axes=True)
        .flow(
            spread(by="site", dir="x", spacing=110),
            spread(by="year", dir="x", spacing=36),
            scatter(by="variety", y="yield"),
        )
        .mark(line(stroke="variety", strokeWidth=2)),
        {"w": 700, "h": 350},
    )
