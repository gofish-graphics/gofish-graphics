"""Vega-Lite/Grouped Bar Chart — mirrors GroupedBarChart.stories.tsx

https://vega.github.io/vega-lite/examples/bar_grouped.html
"""

from gofish import chart, spread, rect, palette

TITLE = "Vega-Lite/Grouped Bar Chart"

_data = [
    {"category": "A", "group": "x", "value": 0.1},
    {"category": "A", "group": "y", "value": 0.6},
    {"category": "A", "group": "z", "value": 0.9},
    {"category": "B", "group": "x", "value": 0.7},
    {"category": "B", "group": "y", "value": 0.2},
    {"category": "B", "group": "z", "value": 1.1},
    {"category": "C", "group": "x", "value": 0.6},
    {"category": "C", "group": "y", "value": 0.1},
    {"category": "C", "group": "z", "value": 0.2},
]


def default(w=400, h=300):
    return (
        chart(_data, color=palette("tableau10"))
        .flow(
            spread(by="category", dir="x", spacing=24),
            spread(by="group", dir="x", spacing=0),
        )
        .mark(rect(h="value", fill="group"))
    )
