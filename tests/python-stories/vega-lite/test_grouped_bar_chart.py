"""Equivalent of GroupedBarChart.stories.tsx — Vega-Lite/Grouped Bar Chart."""

from gofish import chart, spread, rect, Color
from python_stories.data import GROUPED_BAR_DATA


def story_default():
    return (
        chart(GROUPED_BAR_DATA, color=Color.palette("tableau10"), w=3 * 3 * 20, h=200)
        .flow(
            spread(by="category", dir="x", spacing=24),
            spread(by="group", dir="x", spacing=0),
        )
        .mark(rect(h="value", fill="group")),
        {},
    )
