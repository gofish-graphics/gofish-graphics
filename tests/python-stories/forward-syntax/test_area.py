"""Equivalent of Area.stories.tsx — Forward Syntax/Area."""

from gofish import chart, spread, stack, ribbon, group
from python_stories.data import SEAFOOD, STREAMGRAPH_DATA


def story_basic():
    return (
        chart(SEAFOOD)
        .flow(spread(by="lake", dir="x", spacing=64))
        .mark(ribbon(h="count", opacity=0.8)),
        {"h": 300},
    )


def story_stacked():
    return (
        chart(SEAFOOD)
        .flow(
            spread(by="lake", dir="x", spacing=64),
            stack(by="species", dir="y"),
        )
        .mark(ribbon(h="count", fill="species", opacity=0.8)),
        {"h": 400},
    )


def story_layered():
    return (
        chart(STREAMGRAPH_DATA)
        .flow(spread(by="x", dir="x", spacing=50), group(by="c"))
        .mark(ribbon(h="y", fill="c", opacity=0.7)),
        {"h": 300},
    )
