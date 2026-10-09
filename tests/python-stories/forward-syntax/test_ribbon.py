"""Equivalent of Ribbon.stories.tsx — Forward Syntax/Ribbon."""

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
    select_all,
    spread,
    stack,
)
from python_stories.data import SEAFOOD


def story_basic():
    return (
        chart(SEAFOOD)
        .flow(
            spread(by="lake", dir="x", spacing=64),
            stack(by=field("species").sort("count"), dir="y"),
        )
        .mark(rect(h="count", fill="species"))
        .layer(ribbon(opacity=0.8)),
        {"w": 400, "h": 400},
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
            stack(by=field("species").sort("count"), dir="y"),
        )
        .mark(rect(w=0.1, h="count", fill="species").name("bars"))
    )
    overlay = (
        chart(select_all("bars"))
        .flow(group(by="species"))
        .mark(ribbon(opacity=0.8))
    )
    return (
        layer([bars, overlay], coord=clock()),
        {"w": 400, "h": 400, "axes": True},
    )
