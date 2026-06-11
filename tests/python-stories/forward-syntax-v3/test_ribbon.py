"""Equivalent of Ribbon.stories.tsx — Forward Syntax V3/Ribbon."""

import math

from gofish import Layer, chart, clock, spread, stack, derive, rect, selectAll, area, group
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
    overlay = chart(selectAll("bars")).flow(group(by="datum.species")).mark(area(opacity=0.8))
    return (
        Layer([bars, overlay]),
        {"w": 400, "h": 400, "axes": True},
    )


def story_polar():
    bars = (
        chart(SEAFOOD)
        .flow(
            spread(
                by="lake",
                dir="x",
                spacing=(2 * math.pi) / 6,
                mode="center",
                y=50,
                label=False,
            ),
            derive(lambda d: sorted(d, key=lambda r: r["count"])),
            stack(by="species", dir="y", label=False),
        )
        .mark(rect(w=0.1, h="count", fill="species").name("bars"))
    )
    overlay = chart(selectAll("bars")).flow(group(by="datum.species")).mark(area(opacity=0.8))
    return (
        Layer({"coord": clock()}, [bars, overlay]),
        {"w": 400, "h": 400, "axes": True},
    )
