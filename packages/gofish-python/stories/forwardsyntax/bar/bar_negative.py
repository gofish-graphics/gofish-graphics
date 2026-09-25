"""Forward Syntax/Bar/Negative — mirrors BarNegative.stories.tsx"""

from gofish import chart, spread, rect

TITLE = "Forward Syntax/Bar/Negative"

_data = [
    {"category": "A", "value": -30},
    {"category": "B", "value": 80},
    {"category": "C", "value": 45},
    {"category": "D", "value": 60},
    {"category": "E", "value": 20},
]


def default(w=400, h=400):
    return (
        chart(_data)
        .flow(spread(by="category", dir="x"))
        .mark(rect(h="value"))
    )
