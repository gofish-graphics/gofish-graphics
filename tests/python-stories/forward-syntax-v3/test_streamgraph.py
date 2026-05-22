"""Equivalent of Streamgraph.stories.tsx — Forward Syntax V3/Streamgraph."""

from gofish import Layer, chart, spread, stack, blank, select, area, group
from python_stories.data import SEAFOOD


def story_default():
    bars = (
        chart(SEAFOOD)
        .flow(
            spread(by="lake", dir="x", spacing=64, alignment="middle"),
            stack(by="species", dir="y"),
        )
        .mark(blank(h="count", fill="species").name("bars"))
    )
    overlay = chart(select("bars")).flow(group(by="species")).mark(area(opacity=0.8))
    return (
        Layer([bars, overlay]),
        {"w": 400, "h": 400, "axes": True},
    )
