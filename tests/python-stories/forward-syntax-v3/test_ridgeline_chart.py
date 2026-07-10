"""Equivalent of RidgelineChart.stories.tsx — Forward Syntax V3/Ridgeline Chart."""

from gofish import chart, spread, ribbon
from python_stories.data import SEAFOOD


def story_default():
    return (
        chart(SEAFOOD, axes=True)
        .flow(
            spread(by="lake", dir="x", spacing=80),
            spread(by="species", dir="y", spacing=-16),
        )
        .mark(
            ribbon(
                h="count",
                fill="species",
                by="species",
                opacity=0.8,
                mixBlendMode="normal",
            )
        ),
        {"w": 500, "h": 300},
    )
