"""Equivalent of Ribbon.stories.tsx — Forward Syntax/Ribbon."""

import math

from gofish import (
    layer,
    ribbon,
    chart,
    field,
    group,
    rect,
    scatter,
    select_all,
    spread,
    stack,
    Coord,
    Curve,
)
from python_stories.data import SEAFOOD


def story_basic():
    return (
        chart(SEAFOOD, h=400)
        .flow(
            spread(by="lake", dir="x", spacing=64),
            stack(by=field("species").sort("count"), dir="y"),
        )
        .mark(rect(h="count", fill="species"))
        .layer(ribbon(opacity=0.8)),
        {},
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
        layer([bars, overlay], coord=Coord.clock(), w=500, h=500),
        {"axes": True},
    )


def story_orthogonal():
    return (
        chart(SEAFOOD, h=400)
        .flow(
            spread(by="lake", dir="x", spacing=64),
            stack(by=field("species").sort("count"), dir="y"),
        )
        .mark(rect(h="count", fill="species"))
        .layer(ribbon(opacity=0.8, curve=Curve.orthogonal())),
        {},
    )


def story_orthogonal_vertical():
    return (
        chart(SEAFOOD, w=400)
        .flow(
            spread(by="lake", dir="y", spacing=64),
            stack(by=field("species").sort("count"), dir="x"),
        )
        .mark(rect(w="count", fill="species"))
        .layer(ribbon(dir="y", opacity=0.8, curve=Curve.orthogonal())),
        {},
    )


def story_smooth_over_bars():
    data = [
        {"x": 0, "v": 40},
        {"x": 1, "v": 150},
        {"x": 2, "v": 90},
        {"x": 3, "v": 180},
        {"x": 4, "v": 60},
    ]
    return (
        chart(data, w=360, h=220)
        .flow(scatter(by="x", x="x"))
        .mark(rect(w=30, h="v", fill="#4c78a8", opacity=0.5))
        .layer(ribbon(fill="#f58518", opacity=0.5)),
        {},
    )
