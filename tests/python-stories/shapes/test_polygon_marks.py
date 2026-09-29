"""Equivalent of shapes/PolygonMarks.stories.tsx — Shapes/Polygon Marks.

A field name as a polygon's `fill` goes through the chart's color scale, as
it does on `rect` (#953).
"""

from gofish import chart, gradient, polygon

ROWS = [
    {"n": 1, "ring": [[0, 0], [1, 0], [1, 1]]},
    {"n": 5, "ring": [[2, 0], [3, 0], [3, 1]]},
]


def story_data_driven_fill():
    return (
        chart(ROWS, color=gradient(["#fff5eb", "#7f2704"])).mark(
            polygon(points="ring", fill="n")
        ),
        {"w": 200, "h": 200},
    )
