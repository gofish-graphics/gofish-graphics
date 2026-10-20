"""Equivalent of Area.stories.tsx — Forward Syntax/Area."""

from gofish import chart, spread, stack, ribbon, group
from python_stories.data import SEAFOOD, STREAMGRAPH_DATA


def story_basic():
    return (
        chart(SEAFOOD, h=300)
        .flow(spread(by="lake", dir="x", spacing=64))
        .mark(ribbon(h="count", opacity=0.8)),
        {},
    )


def story_stacked():
    return (
        chart(SEAFOOD, h=400)
        .flow(
            spread(by="lake", dir="x", spacing=64),
            stack(by="species", dir="y"),
        )
        .mark(ribbon(h="count", fill="species", opacity=0.8)),
        {},
    )


def story_layered():
    return (
        chart(STREAMGRAPH_DATA, h=300)
        .flow(spread(by="x", dir="x", spacing=50), group(by="c"))
        .mark(ribbon(h="y", fill="c", opacity=0.7)),
        {},
    )
