"""Equivalent of forwardsyntax/FacetedChart.stories.tsx — Forward Syntax V3/Faceted Chart."""

from gofish import chart, circle, rect, scatter, spread
from python_stories.data import DRIVING_SHIFTS, SEAFOOD


def story_default():
    return (
        chart(SEAFOOD, axes=True)
        .flow(
            spread(by="lake", dir="x", spacing=15),
            spread(by="species", dir="x", spacing=2, axes={"x": True, "y": False}),
        )
        .mark(rect(h="count", w=20)),
        {"w": 1000, "h": 400},
    )


def story_faceted_scatter_driving():
    return (
        chart(DRIVING_SHIFTS, axes=True)
        .flow(
            spread(by="side", dir="x", spacing=50),
            scatter(x="year", y="miles", axes={"x": True, "y": False}),
        )
        .mark(circle(r=3, fill="#4682b4")),
        {"w": 800, "h": 400},
    )


def story_faceted_scatter_y():
    return (
        chart(DRIVING_SHIFTS, axes=True)
        .flow(
            spread(by="side", dir="y", spacing=50),
            scatter(x="year", y="gas", axes={"x": False, "y": True}),
        )
        .mark(circle(r=3, fill="#e07b39")),
        {"w": 400, "h": 800},
    )
