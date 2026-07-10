"""Equivalent of LineChart.stories.tsx — Forward Syntax V3/Line Chart."""

from gofish import chart, scatter, blank, line
from python_stories.data import CATCH_LOCATIONS_ARRAY, DRIVING_SHIFTS


def story_default():
    return (
        chart(CATCH_LOCATIONS_ARRAY)
        .flow(scatter(by="lake", x="x", y="y"))
        .mark(blank())
        .layer(line()),
        {"w": 400, "h": 400, "axes": True},
    )


def story_gas_prices():
    return (
        chart(DRIVING_SHIFTS)
        .flow(scatter(by="year", x="year", y="gas"))
        .mark(blank())
        .layer(line(stroke="steelblue", strokeWidth=2)),
        {"w": 500, "h": 400, "axes": True},
    )
