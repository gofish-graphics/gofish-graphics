"""Equivalent of LineChart.stories.tsx — Forward Syntax V3/Line Chart."""

from gofish import chart, scatter, blank, line
from python_stories.data import CATCH_LOCATIONS_ARRAY


def story_default():
    return (
        chart(CATCH_LOCATIONS_ARRAY)
        .flow(scatter(by="lake", x="x", y="y"))
        .mark(blank())
        .connect(line()),
        {"w": 400, "h": 400, "axes": True},
    )
