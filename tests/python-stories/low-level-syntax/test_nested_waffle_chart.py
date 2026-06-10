"""Equivalent of lowlevel/NestedWaffleChart.stories.tsx — Low Level Syntax/Nested Waffle Chart.

A waffle of the Titanic cohort: class rows, each split by sex, each rendered as
a grid of unit dots (one per person, `count` copies of each row). The grid width
is sized so a sex block fills ~32 columns scaled by its share of the class.
Built from nested combinator-form `spread` over `ellipse` unit marks.
"""

import math

from gofish import ellipse, spread
from python_stories.data import TITANIC, COLORS
from python_stories._lowlevel_helpers import group_by, sum_by

_C6 = COLORS["color6"]
_GRAY = COLORS["gray"]
_CLASS_COLOR = {"First": _C6[0], "Second": _C6[1], "Third": _C6[2], "Crew": _C6[3]}


def _unit_row(rows):
    return spread(
        [
            ellipse(
                w=4,
                h=4,
                fill=_GRAY if r["survived"] == "No" else _CLASS_COLOR[r["class"]],
            )
            for r in rows
        ],
        dir="x",
        spacing=0.5,
        alignment="end",
    )


def _sex_block(sex_rows, class_rows):
    # Expand each row into `count` unit dots (reversed first, mirroring the JS
    # lodash chain), then chunk into grid rows whose width is the sex block's
    # share of the class scaled to ~32 columns, and reverse the row order.
    units = [r for r in reversed(sex_rows) for _ in range(r["count"])]
    cols = math.ceil((sum_by(sex_rows, "count") / sum_by(class_rows, "count")) * 32)
    chunks = [units[i : i + cols] for i in range(0, len(units), cols)]
    return spread(
        [_unit_row(chunk) for chunk in reversed(chunks)],
        dir="y",
        spacing=0.5,
        alignment="end",
    )


def story_default():
    def _class_block(class_rows):
        return spread(
            [
                _sex_block(sex_rows, class_rows)
                for sex_rows in group_by(class_rows, "sex").values()
            ],
            dir="x",
            spacing=4,
            alignment="end",
        )

    return (
        spread(
            [_class_block(rows) for rows in group_by(TITANIC, "class").values()],
            dir="y",
            spacing=8,
            alignment="middle",
            sharedScale=True,
        ),
        {"w": 500, "h": 340, "axes": True},
    )
