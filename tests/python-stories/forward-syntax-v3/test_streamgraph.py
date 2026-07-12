"""Equivalent of Streamgraph.stories.tsx — Forward Syntax V3/Streamgraph."""

from gofish import chart, spread, stack, blank, ribbon
from python_stories.data import SEAFOOD


def story_default():
    return (
        chart(SEAFOOD, axes=True)
        .flow(
            spread(by="lake", dir="x", spacing=64, alignment="middle"),
            stack(by="species", dir="y"),
        )
        .mark(blank(h="count", fill="species"))
        .layer(ribbon(opacity=0.8)),
        {"w": 400, "h": 400},
    )
