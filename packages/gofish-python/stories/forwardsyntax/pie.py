"""Forward Syntax V3/Pie — mirrors Pie.stories.tsx"""

import math

from gofish import chart, stack, derive, rect, clock
from stories.data.seafood import seafood
from stories.data.nightingale import nightingale

TITLE = "Forward Syntax V3/Pie"


def basic(w=400, h=400):
    """Simple pie chart: species stacked by count in clock coordinate space."""
    return (
        chart(seafood, coord=clock())
        .flow(stack(by="species", dir="x"))
        .mark(rect(w="count", fill="species"))
    )


def donut(w=400, h=400):
    """Donut chart: pie with a hole via y and h offsets on the stack."""
    return (
        chart(seafood, coord=clock())
        .flow(stack(by="species", dir="x", y=50, h=50))
        .mark(rect(w="count", fill="species"))
    )


def rose(w=400, h=400):
    """Nightingale rose chart: months × type stacked in clock coordinate space."""
    return (
        chart(nightingale, coord=clock())
        .flow(
            stack(by="Month", dir="x"),
            stack(by="Type", dir="y"),
            derive(lambda d: [{**row, "Death": math.sqrt(row["Death"])} for row in d]),
        )
        .mark(rect(w=(math.pi * 2) / 12, emX=True, h="Death", fill="Type"))
    )
