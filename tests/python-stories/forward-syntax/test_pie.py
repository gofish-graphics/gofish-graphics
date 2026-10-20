"""Equivalent of Pie.stories.tsx — Forward Syntax/Pie."""

import math

from gofish import chart, spread, stack, derive, rect, Coord
from python_stories.data import SEAFOOD, NIGHTINGALE


def story_basic():
    return (
        chart(SEAFOOD, coord=Coord.clock(), axes=True, padding=80, w=400, h=400)
        .flow(stack(by="species", dir="x"))
        .mark(rect(w="count", fill="species")),
        {},
    )


def story_donut():
    return (
        chart(SEAFOOD, coord=Coord.clock(), axes=True, padding=60, w=400, h=400)
        .flow(stack(by="species", dir="x", y=50, h=50))
        .mark(rect(w="count", fill="species")),
        {},
    )


def story_rose():
    return (
        # A wider polar inset, so the rotated radial title fits until the
        # coord reserves what its axes draw (#1165).
        chart(NIGHTINGALE, coord=Coord.clock(), axes=True, padding=40, w=400, h=400)
        .flow(
            spread(by="Month", dir="x", spacing=0, axes={"x": False, "y": True}),
            stack(by="Type", dir="y"),
            derive(lambda d: [{**row, "Death": math.sqrt(row["Death"])} for row in d]),
        )
        .mark(rect(w=(math.pi * 2) / 12, em_x=True, h="Death", fill="Type")),
        {},
    )
