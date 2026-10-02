"""Equivalent of BarNegative.stories.tsx — Forward Syntax/Bar/Negative."""

from gofish import chart, spread, rect
from python_stories.data import NEGATIVE_BAR_DATA


def story_default():
    return (
        chart(NEGATIVE_BAR_DATA)
        .flow(spread(by="category", dir="x"))
        .mark(rect(h="value")),
        {"w": 400, "h": 400, "axes": True},
    )


def story_unrounded_min():
    data = [
        {"category": "A", "value": 30},
        {"category": "B", "value": -20},
        {"category": "C", "value": 45},
        {"category": "D", "value": -35},
        {"category": "E", "value": 10},
        {"category": "F", "value": -5},
    ]
    return (
        chart(data)
        .flow(spread(by="category", dir="x"))
        .mark(rect(h="value")),
        {"w": 400, "h": 300, "axes": True},
    )


def story_all_negative():
    data = [
        {"category": "A", "value": -12},
        {"category": "B", "value": -37},
        {"category": "C", "value": -23},
        {"category": "D", "value": -8},
    ]
    return (
        chart(data)
        .flow(spread(by="category", dir="x"))
        .mark(rect(h="value")),
        {"w": 400, "h": 300, "axes": True},
    )
