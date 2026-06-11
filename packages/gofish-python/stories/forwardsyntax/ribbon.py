"""Forward Syntax V3/Ribbon — mirrors Ribbon.stories.tsx"""

import math

from gofish import Layer, chart, spread, stack, derive, rect, selectAll, area, group, clock
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
    overlay = chart(selectAll("bars")).flow(group(by="datum.species")).mark(area(opacity=0.8))
    return Layer([bars, overlay])


def polar(w=400, h=400):
    """Polar ribbon: stacked bars + area overlay in clock() coordinate space."""
    bars = (
        chart(seafood)
        .flow(
            spread(by="lake", dir="x", spacing=(2 * math.pi) / 6, mode="center", y=50, label=False),
            derive(lambda d: sorted(d, key=lambda r: r["count"])),
            stack(by="species", dir="y", label=False),
        )
        .mark(rect(w=0.1, h="count", fill="species").name("bars"))
    )
    overlay = chart(selectAll("bars")).flow(group(by="datum.species")).mark(area(opacity=0.8))
    return Layer({"coord": clock()}, [bars, overlay])
