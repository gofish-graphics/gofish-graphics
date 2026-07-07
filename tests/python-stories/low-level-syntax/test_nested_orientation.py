"""Equivalent of lowlevel/NestedOrientation.stories.tsx — Low Level Syntax/Nested Orientation.

Per-scope y-orientation (#629) under nesting. `NestedCharts`: small multiples of
mini bar charts — the outer spread and every inner mini chart carry a continuous
y, and y-up nests idempotently, so each mini chart grows UPWARD (a double flip
would render them upside down). `PolarInChart`: a polar pie beside a continuous-y
bar chart in one free-space canvas — the `coord` pie fixes its own orientation
and cancels the incoming flip, so the wedges keep their clockwise-from-top sense
while the bars grow up. Combinator `spread`/`stack` in the `dir` variants stand
in for v1 `spreadX`/`stackX`; a data-bound SIZE uses `datum(v)` (JS `value(v)`).
"""

from gofish import datum, layer, polar, rect, spread, stack
from python_stories.data import COLORS

_C6 = COLORS["color6"]


# ─── NestedCharts ─────────────────────────────────────────────────────────────

_GROUPS = [
    {"name": "Q1", "bars": [30, 55, 40]},
    {"name": "Q2", "bars": [70, 45, 90]},
    {"name": "Q3", "bars": [50, 80, 35]},
    {"name": "Q4", "bars": [95, 60, 75]},
]


def _mini_chart(bars, key):
    return spread(
        [
            rect(key=f"{key}-{i}", w=12, h=datum(b), fill=_C6[i])
            for i, b in enumerate(bars)
        ],
        dir="x",
        key=key,
        spacing=4,
        alignment="start",
        h=160,
    )


def story_nested_charts():
    return (
        spread(
            [_mini_chart(g["bars"], g["name"]) for g in _GROUPS],
            dir="x",
            spacing=40,
            alignment="start",
        ),
        {"axes": True},
    )


# ─── PolarInChart ─────────────────────────────────────────────────────────────

_PIE_DATA = [
    {"label": "A", "count": 30, "color": _C6[0]},
    {"label": "B", "count": 20, "color": _C6[1]},
    {"label": "C", "count": 25, "color": _C6[2]},
    {"label": "D", "count": 15, "color": _C6[3]},
    {"label": "E", "count": 10, "color": _C6[4]},
]


def _pie():
    return layer(
        {"coord": polar()},
        [
            stack(
                [rect(w=datum(d["count"]), fill=d["color"]) for d in _PIE_DATA],
                dir="x",
                h=70,
                spacing=0,
                alignment="start",
                sharedScale=True,
            )
        ],
    )


def _bars_beside():
    return spread(
        [
            rect(key=f"b{i}", w=18, h=datum(b), fill=_C6[0])
            for i, b in enumerate([40, 90, 60, 80])
        ],
        dir="x",
        spacing=8,
        alignment="start",
        h=160,
    )


def story_polar_in_chart():
    return (
        spread(
            [_bars_beside(), _pie()],
            dir="x",
            spacing=80,
            alignment="middle",
        ),
        {},
    )
