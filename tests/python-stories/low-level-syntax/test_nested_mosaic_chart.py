"""Equivalent of lowlevel/NestedMosaicChart.stories.tsx — Low Level Syntax/Nested Mosaic Chart.

A mosaic of the Titanic cohort: class rows (height ∝ class size), each split
horizontally by sex (width ∝ sex share), each split vertically by survival.
Built from combinator-form `spread`/`stack` (v1 `spreadX`/`spreadY`/`stackY`
are sugar for the `dir` variants); the survival bands carry a `datum` height so
they share one inferred scale.
"""

from gofish import rect, spread, stack, datum
from python_stories.data import TITANIC, COLORS
from python_stories._lowlevel_helpers import group_by, sum_by

_C6 = COLORS["color6"]
_GRAY = COLORS["gray"]
_CLASS_COLOR = {"First": _C6[0], "Second": _C6[1], "Third": _C6[2], "Crew": _C6[3]}


def story_default():
    def _survival_stack(sex_items, cls, class_items):
        return stack(
            [
                rect(
                    h=datum(sum_by(items, "count")),
                    fill=_GRAY if survived == "No" else _CLASS_COLOR[cls],
                )
                for survived, items in group_by(sex_items, "survived").items()
            ],
            dir="y",
            w=(sum_by(sex_items, "count") / sum_by(class_items, "count")) * 100,
            alignment="middle",
            sharedScale=True,
            # y-down: reverse so the colored (survived) part stacks ABOVE the
            # gray (did-not-survive) part.
            reverse=True,
        )

    def _class_row(cls, items):
        return spread(
            [
                _survival_stack(sex_items, cls, items)
                for sex, sex_items in group_by(items, "sex").items()
            ],
            dir="x",
            key=cls,
            h=sum_by(items, "count") / 10,
            spacing=2,
            alignment="middle",
        )

    return (
        spread(
            [_class_row(cls, items) for cls, items in group_by(TITANIC, "class").items()],
            dir="y",
            # The class axis is ORDINAL, so it stays y-down (reads top→bottom) —
            # the first class (First) is at the top and Crew at the bottom
            # natively (#629), no reverse needed.
            spacing=4,
            alignment="start",
        ),
        {"axes": True},
    )
