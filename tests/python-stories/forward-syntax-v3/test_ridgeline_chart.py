"""Equivalent of RidgelineChart.stories.tsx — Forward Syntax V3/Ridgeline Chart."""

from gofish import layer, chart, spread, blank, selectAll, area, group
from python_stories.data import SEAFOOD


def story_default():
    points = (
        chart(SEAFOOD)
        .flow(
            spread(by="lake", dir="x", spacing=80),
            spread(by="species", dir="y", spacing=-16),
        )
        .mark(blank(h="count", fill="species").name("points"))
    )
    overlay = (
        chart(selectAll("points"))
        .flow(group(by="species"))
        .mark(area(opacity=0.8, mixBlendMode="normal"))
    )
    return (
        layer([points, overlay]),
        {"w": 500, "h": 300, "axes": True},
    )
