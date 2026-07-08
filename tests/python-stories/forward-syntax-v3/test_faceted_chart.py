"""Equivalent of forwardsyntax/FacetedChart.stories.tsx — Forward Syntax V3/Faceted Chart."""

from gofish import chart, circle, rect, scatter, spread
from python_stories.data import DRIVING_SHIFTS, SEAFOOD


def story_default():
    def species_bars(data):
        return (
            chart(data)
            .flow(spread(by="species", dir="x", spacing=2, axes={"x": True, "y": False}))
            .mark(rect(h="count", w=20))
        )

    return (
        chart(SEAFOOD, axes=True)
        .flow(spread(by="lake", dir="x", spacing=15))
        .mark(species_bars),
        {"w": 1000, "h": 400},
    )


def story_faceted_scatter_driving():
    def year_miles_scatter(data):
        return (
            chart(data)
            .flow(scatter(x="year", y="miles", axes={"x": True, "y": False}))
            .mark(circle(r=3, fill="#4682b4"))
        )

    return (
        chart(DRIVING_SHIFTS, axes=True)
        .flow(spread(by="side", dir="x", spacing=50))
        .mark(year_miles_scatter),
        {"w": 800, "h": 400},
    )


def story_faceted_scatter_y():
    def year_gas_scatter(data):
        return (
            chart(data)
            .flow(scatter(x="year", y="gas", axes={"x": False, "y": True}))
            .mark(circle(r=3, fill="#e07b39"))
        )

    return (
        chart(DRIVING_SHIFTS, axes=True)
        .flow(spread(by="side", dir="y", spacing=50))
        .mark(year_gas_scatter),
        {"w": 400, "h": 800},
    )
