"""Equivalent of Scatter.stories.tsx — Forward Syntax V3/Scatter."""

from gofish import Layer, chart, scatter, circle, select, line
from python_stories.data import CATCH_LOCATIONS_ARRAY, DRIVING_SHIFTS


def story_basic():
    return (
        chart(CATCH_LOCATIONS_ARRAY)
        .flow(scatter(by="lake", x="x", y="y"))
        .mark(circle(r=5)),
        {"w": 400, "h": 400, "axes": True},
    )


def story_connected():
    points = (
        chart(DRIVING_SHIFTS)
        .flow(scatter(by="year", x="miles", y="gas"))
        .mark(circle(r=4, fill="white", stroke="black", strokeWidth=2).name("points"))
    )
    lines = (
        chart(select("points"))
        .mark(line(stroke="black", strokeWidth=2))
        .zOrder(-1)
    )
    return (
        Layer([points, lines]),
        {"w": 400, "h": 400, "axes": True},
    )
