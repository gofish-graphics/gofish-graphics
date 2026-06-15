"""Equivalent of Area.stories.tsx — Forward Syntax V3/Area."""

from gofish import Layer, chart, spread, stack, blank, selectAll, area, group
from python_stories.data import SEAFOOD, STREAMGRAPH_DATA


def story_basic():
    # An area chart has no intrinsic width, so it fills the container: the six
    # lakes are spread to span `w` (five gaps between them) instead of a fixed
    # pixel spacing, which would leave the canvas partly empty. Mirrors
    # Area.stories.tsx's Basic export.
    w = 500
    lakes = 6
    return (
        chart(SEAFOOD)
        .flow(spread(by="lake", dir="x", spacing=w / (lakes - 1)))
        .mark(blank(h="count"))
        .connect(area(opacity=0.8)),
        {"w": w, "h": 300, "axes": True},
    )


def story_stacked():
    return (
        Layer([
            chart(SEAFOOD)
            .flow(
                spread(by="lake", dir="x", spacing=64),
                stack(by="species", dir="y"),
            )
            .mark(blank(h="count", fill="species").name("bars")),
            chart(selectAll("bars")).flow(group(by="datum.species")).mark(area(opacity=0.8)),
        ]),
        {"w": 400, "h": 400, "axes": True},
    )


def story_layered():
    return (
        Layer([
            chart(STREAMGRAPH_DATA)
            .flow(spread(by="x", dir="x", spacing=50), group(by="c"))
            .mark(blank(h="y", fill="c").name("points")),
            chart(selectAll("points")).flow(group(by="datum.c")).mark(area(opacity=0.7)),
        ]),
        {"w": 500, "h": 300, "axes": True},
    )
