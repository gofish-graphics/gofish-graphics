"""Equivalent of interaction/Tooltip.stories.tsx — Interaction/Tooltip (#1395)."""

from gofish import chart, circle, group, line, rect, scatter, spread, stack
from python_stories.data import CATCH_LOCATIONS_ARRAY, SEAFOOD

# The top 15 path types of the issue's screenshot. Only the first row is
# from the screenshot; the rest keep share = n / 91,554.
_PATHS = [
    ("VO→VO", 11902, 195),
    ("INF→INF", 9811, 188),
    ("other→other", 8240, 201),
    ("VO→INF", 6590, 172),
    ("PK→PK", 5310, 160),
    ("VO→VO→VO", 4670, 151),
    ("INF→VO", 4120, 149),
    ("PK→VO", 3480, 133),
    ("VO→PK", 3110, 128),
    ("INF→INF→INF", 2740, 117),
    ("other→VO", 2290, 109),
    ("VO→other", 1950, 98),
    ("PK→INF", 1610, 87),
    ("INF→PK", 1330, 74),
    ("VO→INF→VO", 1090, 66),
]
PATH_TYPES = [
    {"path": p, "n": n, "n_articles": a, "share": n / 91554} for p, n, a in _PATHS
]


def story_bar_chart():
    return (
        chart(PATH_TYPES, w=520, h=400)
        .flow(spread(by="path", dir="y", spacing=4))
        .mark(rect(w="share", fill="#4c78a8").tooltip()),
        {},
    )


def story_stacked_bars():
    return (
        chart(SEAFOOD, w=400, h=300)
        .flow(spread(by="lake", dir="x", spacing=8), stack(by="species", dir="y"))
        .mark(rect(h="count", fill="species").tooltip()),
        {},
    )


def story_scatter():
    return (
        chart(CATCH_LOCATIONS_ARRAY, w=400, h=400)
        .flow(scatter(by="lake", x="x", y="y"))
        .mark(circle(r=6, fill="#4c78a8").tooltip(["lake", "x", "y"])),
        {},
    )


BUDGET = [
    {"series": s, "year": 2018 + i, "value": v}
    for s, values in [
        ("Revenue", [1.6, 1.9, 1.7, 2.3, 2.6]),
        ("Cost", [1.2, 1.3, 1.5, 1.6, 2.0]),
    ]
    for i, v in enumerate(values)
]


def story_line_chart():
    return (
        chart(BUDGET, w=400, h=260)
        .flow(group(by="series"))
        .mark(line(x="year", y="value", stroke="series", stroke_width=2).tooltip()),
        {},
    )
