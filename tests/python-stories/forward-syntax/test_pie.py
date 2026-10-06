"""Equivalent of Pie.stories.tsx — Forward Syntax/Pie."""

import math

from gofish import chart, spread, stack, derive, rect, clock
from python_stories.data import SEAFOOD, NIGHTINGALE


def story_basic():
    return (
        chart(SEAFOOD, coord=clock(), axes=True, padding=80)
        .flow(stack(by="species", dir="x"))
        .mark(rect(w="count", fill="species")),
        {"w": 400, "h": 400},
    )


def story_donut():
    return (
        chart(SEAFOOD, coord=clock(), axes=True, padding=60)
        .flow(stack(by="species", dir="x", y=50, h=50))
        .mark(rect(w="count", fill="species")),
        {"w": 400, "h": 400},
    )


def story_rose():
    return (
        chart(NIGHTINGALE, coord=clock(), axes=True)
        .flow(
            spread(by="Month", dir="x", spacing=0, axes={"x": False, "y": True}),
            stack(by="Type", dir="y"),
            derive(lambda d: [{**row, "Death": math.sqrt(row["Death"])} for row in d]),
        )
        .mark(rect(w=(math.pi * 2) / 12, em_x=True, h="Death", fill="Type")),
        {"w": 400, "h": 400},
    )
