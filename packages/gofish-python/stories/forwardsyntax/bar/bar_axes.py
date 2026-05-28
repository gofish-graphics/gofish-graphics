"""Forward Syntax V3/Bar/Axes — mirrors BarAxesPermutations.stories.tsx.

Demonstrates the chart-level ``axes`` option (moved off ``.render()``):
a bool, a per-dimension dict, and per-axis titles. Mirrors the JS
``Chart(data, { axes })`` shape.
"""

from gofish import chart, spread, rect
from stories.data.seafood import seafood

TITLE = "Forward Syntax V3/Bar/Axes"


def both(w=400, h=400):
    """Both axes on, titles inferred."""
    return (
        chart(seafood, axes=True)
        .flow(spread(by="lake", dir="x"))
        .mark(rect(h="count"))
    )


def x_only(w=400, h=400):
    """Per-dimension toggle: x-axis only."""
    return (
        chart(seafood, axes={"x": True, "y": False})
        .flow(spread(by="lake", dir="x"))
        .mark(rect(h="count"))
    )


def custom_title(w=400, h=400):
    """Custom x-axis title, inferred y-axis title."""
    return (
        chart(seafood, axes={"x": {"title": "Sampling Location"}, "y": True})
        .flow(spread(by="lake", dir="x"))
        .mark(rect(h="count"))
    )
