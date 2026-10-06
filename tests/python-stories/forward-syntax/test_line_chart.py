"""Equivalent of LineChart.stories.tsx — Forward Syntax/Line Chart."""

from gofish import chart, scatter, line
from python_stories.data import CATCH_LOCATIONS_ARRAY, DRIVING_SHIFTS


def story_default():
    return (
        chart(CATCH_LOCATIONS_ARRAY, axes=True)
        .flow(scatter(by="lake", x="x", y="y"))
        .mark(line()),
        {"w": 400, "h": 400},
    )


def story_gas_prices():
    return (
        chart(DRIVING_SHIFTS, axes=True)
        .flow(scatter(by="year", x="year", y="gas"))
        .mark(line(stroke="steelblue", stroke_width=2)),
        {"w": 500, "h": 400},
    )
