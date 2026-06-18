"""Equivalent of lowlevel/IcicleChart.stories.tsx — Low Level Syntax/Icicle Chart.

A horizontal icicle of the Titanic cohort: a root band, then class bands, then
(in Default) sex and survived bands nested inside. Built from combinator-form
`stack` (the v1 `stackX`/`stackY` are sugar for `stack(dir=...)`), with each
band's height proportional to its summed `count`.
"""

from gofish import rect, stack
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
        stack(
            [
                rect(w=40, h=_TOTAL / 10, fill=_NEUTRAL),
                stack(
                    [
                        rect(w=40, h=sum_by(items, "count") / 10, fill=_CLASS_COLOR[cls])
                        for cls, items in by_class.items()
                    ],
                    dir="y",
                    reverse=True,
                    alignment="middle",
                ),
            ],
            dir="x",
            alignment="middle",
        ),
        {"axes": True},
    )


def story_default():
    def _survived_band(items, cls, sex):
        return stack(
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
            w=40,
            reverse=True,
            alignment="middle",
        )

    def _sex_band(items, cls):
        return stack(
            [
                stack(
                    [
                        rect(
                            w=0,
                            h=sum_by(s_items, "count") / 10,
                            fill=_C6[4] if sex == "Female" else _C6[5],
                        ),
                        _survived_band(s_items, cls, sex),
                    ],
                    dir="x",
                    alignment="middle",
                )
                for sex, s_items in group_by(items, "sex").items()
            ],
            dir="y",
            reverse=True,
            alignment="middle",
        )

    def _class_band(cls, items):
        return stack(
            [rect(w=40, fill=_CLASS_COLOR[cls]), _sex_band(items, cls)],
            dir="x",
            h=sum_by(items, "count") / 10,
            alignment="start",
        )

    by_class = group_by(TITANIC, "class")
    return (
        stack(
            [
                rect(w=40, h=_TOTAL / 10, fill=_NEUTRAL),
                stack(
                    [_class_band(cls, items) for cls, items in by_class.items()],
                    dir="y",
                    reverse=True,
                    alignment="middle",
                ),
            ],
            dir="x",
            alignment="middle",
        ),
        {"axes": True},
    )
