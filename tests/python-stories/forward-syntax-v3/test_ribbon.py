"""Equivalent of Ribbon.stories.tsx — Forward Syntax V3/Ribbon."""

import math

from gofish import (
    layer,
    ribbon,
    chart,
    clock,
    field,
    group,
    rect,
    scatter,
    selectAll,
    spread,
    stack,
)
from python_stories.data import SEAFOOD


def story_basic():
    return (
        chart(SEAFOOD, axes=True)
        .flow(
            spread(by="lake", dir="x", spacing=64),
            stack(by=field("species").sort("count"), dir="y"),
        )
        .mark(rect(h="count", fill="species"))
        .layer(ribbon(opacity=0.8)),
        {"w": 400, "h": 400, "axes": True},
    )


def story_polar():
    bars = (
        chart(SEAFOOD)
        .flow(
            scatter(
                by="lake",
                x="lake",
                w=2 * math.pi,
                axes={"x": False, "y": True},
            ).translate(y=50),
            stack(by=field("species").sort("count"), dir="y", label=False),
        )
        .mark(rect(w=0.1, h="count", fill="species").name("bars"))
    )
    overlay = (
        chart(selectAll("bars"))
        .flow(group(by="species"))
        .mark(ribbon(opacity=0.8))
    )
    return (
        layer({"coord": clock()}, [bars, overlay]),
        {"w": 400, "h": 400, "axes": True},
    )
