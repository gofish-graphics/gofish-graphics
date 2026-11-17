"""Equivalent of lowlevel/IcicleChart.stories.tsx — Low Level Syntax/Icicle Chart.

A horizontal icicle of the Titanic cohort: a root band, then class bands, then
(in Default) sex and survived bands nested inside. Built from combinator-form
`spread` with no spacing (the JS `spreadX`/`spreadY` are sugar for
`spread(dir=...)`), with each band's height proportional to its summed `count`
in pixels: the bands are boxes that touch, not data amounts.
"""

from gofish import rect, spread
from python_stories.data import TITANIC, COLORS
from python_stories._lowlevel_helpers import group_by, sum_by

_C6 = COLORS["color6"]
_GRAY = COLORS["gray"]
_NEUTRAL = COLORS["neutral"]
# class → color6 slot (name-keyed, independent of appearance order)
_CLASS_COLOR = {"First": _C6[0], "Second": _C6[1], "Third": _C6[2], "Crew": _C6[3]}

_TOTAL = sum_by(TITANIC, "count")


def story_simplified():
    by_class = group_by(TITANIC, "class")
    return (
        spread(
            [
                rect(w=40, h=_TOTAL / 10, fill=_NEUTRAL),
                spread(
                    [
                        rect(w=40, h=sum_by(items, "count") / 10, fill=_CLASS_COLOR[cls])
                        for cls, items in by_class.items()
                    ],
                    dir="y",
                    spacing=0,
                    alignment="middle",
                ),
            ],
            dir="x",
            spacing=0,
            alignment="middle",
        ),
        {"axes": True},
    )


def story_default():
    def _survived_band(items, cls, sex):
        return spread(
            [
                rect(
                    h=sum_by(s_items, "count") / 10,
                    fill=(
                        _GRAY
                        if survived == "No"
                        else (_C6[4] if sex == "Female" else _C6[5])
                    ),
                )
                for survived, s_items in group_by(items, "survived").items()
            ],
            dir="y",
            spacing=0,
            w=40,
            alignment="middle",
        )

    def _sex_band(items, cls):
        return spread(
            [
                spread(
                    [
                        rect(
                            w=0,
                            h=sum_by(s_items, "count") / 10,
                            fill=_C6[4] if sex == "Female" else _C6[5],
                        ),
                        _survived_band(s_items, cls, sex),
                    ],
                    dir="x",
                    spacing=0,
                    alignment="middle",
                )
                for sex, s_items in group_by(items, "sex").items()
            ],
            dir="y",
            spacing=0,
            alignment="middle",
        )

    def _class_band(cls, items):
        return spread(
            [rect(w=40, fill=_CLASS_COLOR[cls]), _sex_band(items, cls)],
            dir="x",
            spacing=0,
            h=sum_by(items, "count") / 10,
            alignment="start",
        )

    by_class = group_by(TITANIC, "class")
    return (
        spread(
            [
                rect(w=40, h=_TOTAL / 10, fill=_NEUTRAL),
                spread(
                    [_class_band(cls, items) for cls, items in by_class.items()],
                    dir="y",
                    spacing=0,
                    alignment="middle",
                ),
            ],
            dir="x",
            spacing=0,
            alignment="middle",
        ),
        {"axes": True},
    )
