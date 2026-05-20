"""Equivalent of Area.stories.tsx — Forward Syntax V3/Area."""

from gofish import Layer, chart, spread, stack, blank, select, area, group, log
from python_stories.data import SEAFOOD, STREAMGRAPH_DATA


def story_basic():
    return (
        Layer([
            chart(SEAFOOD)
            .flow(spread(by="lake", dir="x", spacing=64))
            .mark(blank(h="count").name("points")),
            chart(select("points")).flow(log("points")).mark(area(opacity=0.8)),
        ]),
        {"w": 500, "h": 300, "axes": True},
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
            chart(select("bars")).flow(group(by="species")).mark(area(opacity=0.8)),
        ]),
        {"w": 400, "h": 400, "axes": True},
    )


def story_layered():
    return (
        Layer([
            chart(STREAMGRAPH_DATA)
            .flow(group(by="c"), spread(by="x", dir="x", spacing=50))
            .mark(blank(h="y", fill="c").name("points")),
            chart(select("points")).flow(group(by="c")).mark(area(opacity=0.7)),
        ]),
        {"w": 500, "h": 300, "axes": True},
    )
