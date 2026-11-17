"""Equivalent of shapes/PolygonMarks.stories.tsx — Shapes/Polygon Marks.

A field name as a polygon's `fill` goes through the chart's color scale, as
it does on `rect` (#953). A polygon with `w` is drawn in its slot's box, and
a polar coord bends every point of its outline, curves included (#1331).
"""

from gofish import Color, Coord, chart, polygon, stack
from python_stories.data import SEAFOOD

ROWS = [
    {"n": 1, "ring": [[0, 0], [1, 0], [1, 1]]},
    {"n": 5, "ring": [[2, 0], [3, 0], [3, 1]]},
]

# One petal in its slot's unit box: across the slot on x, out from the
# center on y (the Flower Chart's petal).
PETAL = "M0 0 L0 .468 Q.451 .809 .5 1 Q.549 .809 1 .468 L1 0 Z"

LAKE_A = [d for d in SEAFOOD if d["lake"] == "Lake A"]
LAKE_F = [d for d in SEAFOOD if d["lake"] == "Lake F"]


def story_data_driven_fill():
    return (
        chart(
            ROWS,
            color=Color.gradient(["#fff5eb", "#7f2704"]),
            axes=False,
            w=200,
            h=200,
        ).mark(
            polygon(points="ring", fill="n")
        ),
        {},
    )


def story_petal_wide_slot():
    return (
        chart(LAKE_F, coord=Coord.polar(), axes=False, w=220, h=220)
        .flow(stack(by="species", dir="x", h=90))
        .mark(polygon(w="count", d=PETAL, fill="species")),
        {},
    )


def story_petal_donut():
    return (
        chart(
            LAKE_A,
            coord=Coord.clock(inner_radius=0.4),
            axes=False,
            w=220,
            h=220,
        )
        .flow(stack(by="species", dir="x", h=90))
        .mark(polygon(w="count", d=PETAL, fill="species")),
        {},
    )


def story_pie_slice():
    return (
        chart(LAKE_A, coord=Coord.polar(), axes=False, w=220, h=220)
        .flow(stack(by="species", dir="x", h=90))
        .mark(polygon(w="count", d="M0 0 L0 1 L1 1 L1 0 Z", fill="species")),
        {},
    )


def story_petal_bars():
    return (
        chart(LAKE_A, axes=False, w=300, h=120)
        .flow(stack(by="species", dir="x", h=100))
        .mark(polygon(w="count", d=PETAL, fill="species")),
        {},
    )
