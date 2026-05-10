"""Equivalent of GroupedBarChart.stories.tsx — Vega-Lite/Grouped Bar Chart."""

from gofish import chart, spread, rect, palette
from python_stories.data import GROUPED_BAR_DATA


def story_default():
    return (
        chart(GROUPED_BAR_DATA, {"color": palette("tableau10")})
        .flow(
            spread(by="category", dir="x", spacing=24),
            spread(by="group", dir="x", spacing=0),
        )
        .mark(rect(h="value", fill="group")),
        {"h": 300, "axes": True},
    )
