"""Forward Syntax/Mosaic Chart — mirrors MosaicChart.stories.tsx

Uses normalize() inside derive() to make each origin's cylinder counts
sum to 1, then stacks to fill the full height — creating a mosaic / waffle chart.
"""

from gofish import chart, spread, stack, derive, normalize, rect

TITLE = "Forward Syntax/Mosaic Chart"

_data = [
    {"origin": "Europe", "cylinders": "4", "count": 66},
    {"origin": "Europe", "cylinders": "5", "count": 3},
    {"origin": "Europe", "cylinders": "6", "count": 4},
    {"origin": "Japan",  "cylinders": "3", "count": 4},
    {"origin": "Japan",  "cylinders": "4", "count": 69},
    {"origin": "Japan",  "cylinders": "6", "count": 6},
    {"origin": "USA",    "cylinders": "4", "count": 72},
    {"origin": "USA",    "cylinders": "6", "count": 74},
    {"origin": "USA",    "cylinders": "8", "count": 108},
]


def default(w=400, h=400):
    return (
        chart(_data)
        .flow(
            spread(by="origin", dir="x"),
            derive(lambda d: normalize(d, "count")),
            stack(by="cylinders", dir="y"),
        )
        .mark(rect(h="count", fill="origin", stroke="white", strokeWidth=2))
    )
