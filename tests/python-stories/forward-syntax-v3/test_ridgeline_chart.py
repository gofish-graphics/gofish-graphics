"""Equivalent of RidgelineChart.stories.tsx — Forward Syntax V3/Ridgeline Chart."""

from gofish import chart, spread, blank, ribbon, group
from python_stories.data import SEAFOOD


def story_default():
    return (
        chart(SEAFOOD, axes=True)
        .flow(
            spread(by="lake", dir="x", spacing=80),
            spread(by="species", dir="y", spacing=-16),
        )
        .mark(blank(h="count", fill="species"))
        .layer(
            chart()
            .flow(group(by="species"))
            .mark(ribbon(opacity=0.8, mixBlendMode="normal"))
        ),
        {"w": 500, "h": 300},
    )
