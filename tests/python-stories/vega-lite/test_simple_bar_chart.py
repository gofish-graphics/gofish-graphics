"""Equivalent of SimpleBarChart.stories.tsx — Vega-Lite/Simple Bar Chart."""

from gofish import chart, spread, rect
from python_stories.data import SIMPLE_BAR_DATA


def story_default():
    return (
        chart(SIMPLE_BAR_DATA)
        .flow(spread(by="a", dir="x"))
        .mark(rect(h="b")),
        {"h": 300, "axes": True},
    )
