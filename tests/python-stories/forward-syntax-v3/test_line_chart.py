"""Equivalent of LineChart.stories.tsx — Forward Syntax V3/Line Chart."""

from gofish import Layer, chart, scatter, blank, select, line
from python_stories.data import CATCH_LOCATIONS_ARRAY


def story_default():
    points = (
        chart(CATCH_LOCATIONS_ARRAY)
        .flow(scatter(by="lake", x="x", y="y"))
        .mark(blank().name("points"))
    )
    lines = chart(select("points")).mark(line())
    return (
        Layer([points, lines]),
        {"w": 400, "h": 400, "axes": True},
    )
