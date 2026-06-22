"""Equivalent of Streamgraph.stories.tsx — Forward Syntax V3/Streamgraph."""

from gofish import layer, chart, spread, stack, blank, selectAll, area, group
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
    overlay = chart(selectAll("bars")).flow(group(by="species")).mark(area(opacity=0.8))
    return (
        layer([bars, overlay]),
        {"w": 400, "h": 400, "axes": True},
    )
