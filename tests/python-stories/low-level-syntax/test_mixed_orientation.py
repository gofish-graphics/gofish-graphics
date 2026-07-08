"""Equivalent of lowlevel/MixedOrientation.stories.tsx — Low Level Syntax/Mixed Orientation.

Per-scope y-orientation (#629): three free-space subtrees side by side. The bar
chart's y is a CONTINUOUS value axis, so it declares y-up and grows its bars
UPWARD; the heatmap (keyed rows) and the tidy tree (keyed depth levels) have
ORDINAL y axes, so they stay SVG-native y-DOWN and read top→bottom. Combinator
`spread` in the `dir` variants stands in for v1 `spreadX`/`spreadY`; a data-bound
SIZE uses `datum(v)` (JS `value(v)`).
"""

from gofish import datum, ellipse, layer, rect, spread, text
from python_stories.data import COLORS

_C6 = COLORS["color6"]


# A vertical bar chart: y is a CONTINUOUS value axis, so it grows UPWARD.
_BAR_DATA = [
    {"cat": "A", "value": 30},
    {"cat": "B", "value": 80},
    {"cat": "C", "value": 55},
    {"cat": "D", "value": 95},
    {"cat": "E", "value": 62},
]


def _bar_chart():
    return spread(
        [
            rect(key=d["cat"], w=22, h=datum(d["value"]), fill=_C6[0])
            for d in _BAR_DATA
        ],
        dir="x",
        spacing=10,
        alignment="start",
        h=200,
    )


# A heatmap: keyed rows make the y axis ORDINAL, so it reads top → bottom.
_HEAT_ROWS = ["Mon", "Tue", "Wed", "Thu"]
_HEAT_COLS = 5


def _heat_val(r, c):
    return (r * 7 + c * 13) % 10


def _heatmap():
    return spread(
        [
            spread(
                [
                    rect(
                        w=22,
                        h=22,
                        fill=f"rgba(189,0,38,{0.15 + 0.085 * _heat_val(ri, c)})",
                    )
                    for c in range(_HEAT_COLS)
                ],
                dir="x",
                key=row,
                spacing=3,
                alignment="middle",
            )
            for ri, row in enumerate(_HEAT_ROWS)
        ],
        dir="y",
        spacing=3,
        alignment="start",
    )


# A tidy tree drawn level by level: keyed depth LEVELS make the y axis ORDINAL,
# so it, too, stays y-DOWN and reads root → leaves, top to bottom.
def _tree_node(label):
    return layer(
        [
            ellipse(w=20, h=20, fill=_C6[2]),
            text(text=label, fontSize=9, fill="white"),
        ]
    )


def _tree_chart():
    levels = [["r"], ["a", "b"], ["1", "2", "3"]]
    return spread(
        [
            spread(
                [_tree_node(x) for x in row],
                dir="x",
                key=f"L{li}",
                spacing=16,
                alignment="middle",
            )
            for li, row in enumerate(levels)
        ],
        dir="y",
        spacing=30,
        alignment="middle",
    )


def story_default():
    return (
        spread(
            [_bar_chart(), _heatmap(), _tree_chart()],
            dir="x",
            spacing=64,
            alignment="start",
        ),
        {"axes": True},
    )
