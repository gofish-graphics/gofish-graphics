"""Equivalent of Ribbon.stories.tsx — Forward Syntax V3/Ribbon."""

import math

from gofish import (
    layer,
    area,
    chart,
    clock,
    derive,
    group,
    rect,
    scatter,
    selectAll,
    spread,
    stack,
)
from python_stories.data import SEAFOOD


def story_basic():
    bars = (
        chart(SEAFOOD)
        .flow(
            spread(by="lake", dir="x", spacing=64),
            derive(lambda d: sorted(d, key=lambda r: r["count"])),
            stack(by="species", dir="y"),
        )
        .mark(rect(h="count", fill="species").name("bars"))
    )
    overlay = (
        chart(selectAll("bars"))
        .flow(group(by="species"))
        .mark(area(opacity=0.8))
    )
    return (
        layer([bars, overlay]),
        {"w": 400, "h": 400, "axes": True},
    )


def story_layered():
    # Same ribbon as story_basic, via the `.layer(chart(...))` API instead of the
    # manual layer([...]) + selectAll form. An empty chart() scope inherits the
    # previous tier's marks.
    return (
        chart(SEAFOOD, axes=True)
        .flow(
            spread(by="lake", dir="x", spacing=64),
            derive(lambda d: sorted(d, key=lambda r: r["count"])),
            stack(by="species", dir="y"),
        )
        .mark(rect(h="count", fill="species"))
        .layer(
            chart()
            .flow(group(by="species"))
            .mark(area(opacity=0.8))
        ),
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
            derive(lambda d: sorted(d, key=lambda r: r["count"])),
            stack(by="species", dir="y", label=False),
        )
        .mark(rect(w=0.1, h="count", fill="species").name("bars"))
    )
    overlay = (
        chart(selectAll("bars"))
        .flow(group(by="species"))
        .mark(area(opacity=0.8))
    )
    return (
        layer({"coord": clock()}, [bars, overlay]),
        {"w": 400, "h": 400, "axes": True},
    )
