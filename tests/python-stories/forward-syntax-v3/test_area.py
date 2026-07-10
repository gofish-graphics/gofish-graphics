"""Equivalent of Area.stories.tsx — Forward Syntax V3/Area."""

from gofish import chart, spread, stack, blank, ribbon, group
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
        .layer(ribbon(opacity=0.8)),
        {"w": w, "h": 300, "axes": True},
    )


def story_stacked():
    return (
        chart(SEAFOOD, axes=True)
        .flow(
            spread(by="lake", dir="x", spacing=64),
            stack(by="species", dir="y"),
        )
        .mark(blank(h="count", fill="species"))
        .layer(ribbon(by="species", opacity=0.8)),
        {"w": 400, "h": 400},
    )


def story_layered():
    return (
        chart(STREAMGRAPH_DATA, axes=True)
        .flow(spread(by="x", dir="x", spacing=50), group(by="c"))
        .mark(blank(h="y", fill="c"))
        .layer(ribbon(by="c", opacity=0.7)),
        {"w": 500, "h": 300},
    )
