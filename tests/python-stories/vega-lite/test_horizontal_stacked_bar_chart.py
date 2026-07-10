"""Equivalent of Bar/HorizontalStackedBarChart.stories.tsx — Vega-Lite/Horizontal Stacked Bar Chart.

JS dropped its unused `derive`/`groupBy`/`sumBy` imports in the
story-simplifications pass; this port never had those dead imports, so
nothing here changes.
"""

from gofish import chart, spread, stack, rect, palette
from vega_datasets import data as vega_data


def story_default():
    barley = vega_data.barley()
    return (
        chart(barley, color=palette("tableau10"))
        .flow(
            spread(by="variety", dir="y"),
            stack(by="site", dir="x"),
        )
        .mark(rect(w="yield", fill="site")),
        {"w": 500, "h": 400, "axes": True},
    )
