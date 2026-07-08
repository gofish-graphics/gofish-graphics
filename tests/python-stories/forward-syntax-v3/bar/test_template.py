"""Equivalent of BarTemplate.stories.tsx — Forward Syntax V3/Bar/Template.

Every story uses the ``bar_chart`` template helper (gofish/charts.py, the
Python mirror of src/charts/bar.ts) rather than a hand-written builder chain.
"""

from gofish import circle
from gofish.charts import bar_chart

# Test data for template-based bar charts (mirrors the JS testData).
TEST_DATA = [
    {"category": "A", "value": 30, "color": "#ff6b6b"},
    {"category": "B", "value": 80, "color": "#4ecdc4"},
    {"category": "C", "value": 45, "color": "#45b7d1"},
    {"category": "D", "value": 60, "color": "#f9ca24"},
    {"category": "E", "value": 20, "color": "#6c5ce7"},
]

_OPTIONS = {"w": 500, "h": 400}


def story_vertical():
    return (
        bar_chart(TEST_DATA, x="category", y="value", axes=True),
        _OPTIONS,
    )


def story_horizontal():
    return (
        bar_chart(TEST_DATA, x="value", y="category", orientation="x", axes=True),
        _OPTIONS,
    )


def story_vertical_with_fill_color():
    return (
        bar_chart(TEST_DATA, x="category", y="value", fill="#4ecdc4", axes=True),
        _OPTIONS,
    )


def story_horizontal_with_fill_color():
    return (
        bar_chart(
            TEST_DATA,
            x="value",
            y="category",
            orientation="x",
            fill="#ff6b6b",
            axes=True,
        ),
        _OPTIONS,
    )


def story_vertical_with_fill_field():
    return (
        bar_chart(TEST_DATA, x="category", y="value", fill="color", axes=True),
        _OPTIONS,
    )


def story_horizontal_with_fill_field():
    return (
        bar_chart(
            TEST_DATA,
            x="value",
            y="category",
            orientation="x",
            fill="color",
            axes=True,
        ),
        _OPTIONS,
    )


def story_vertical_with_custom_mark():
    return (
        bar_chart(TEST_DATA, x="category", y="value", mark=circle, axes=True),
        _OPTIONS,
    )


def story_horizontal_with_custom_mark():
    return (
        bar_chart(
            TEST_DATA,
            x="value",
            y="category",
            orientation="x",
            mark=circle,
            axes=True,
        ),
        _OPTIONS,
    )


def story_vertical_with_custom_mark_and_fill():
    return (
        bar_chart(
            TEST_DATA,
            x="category",
            y="value",
            fill="#45b7d1",
            mark=circle,
            axes=True,
        ),
        _OPTIONS,
    )


def story_horizontal_with_custom_mark_and_fill():
    return (
        bar_chart(
            TEST_DATA,
            x="value",
            y="category",
            orientation="x",
            fill="#f9ca24",
            mark=circle,
            axes=True,
        ),
        _OPTIONS,
    )
