"""Forward Syntax V3/Ribbon — mirrors Ribbon.stories.tsx"""

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
from stories.data.seafood import seafood

TITLE = "Forward Syntax V3/Ribbon"


def basic(w=400, h=400):
    """Ribbon chart: sorted stacked bars with an area overlay connecting species across lakes."""
    bars = (
        chart(seafood)
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
    return layer([bars, overlay])


def polar(w=400, h=400):
    """Polar ribbon: stacked bars + area overlay in clock() coordinate space."""
    bars = (
        chart(seafood)
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
    return layer({"coord": clock()}, [bars, overlay])
