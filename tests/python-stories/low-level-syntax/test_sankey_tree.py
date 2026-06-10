"""Equivalent of lowlevel/SankeyTree.stories.tsx — Low Level Syntax/Sankey Tree.

A Sankey-style tree of the Titanic cohort flowing class → sex → survival. Each
level draws source/target stacks of bars (height ∝ summed count) named with
hierarchical tokens, and `connect` ribbons link each source to its target by
`ref`. The bar tiers and the ribbons all live in one `layer`.
"""

from gofish import layer, spread, stack, connect, rect, ref
from python_stories.data import TITANIC, COLORS
from python_stories._lowlevel_helpers import group_by, sum_by

_C6 = COLORS["color6"]
_GRAY = COLORS["gray"]
_NEUTRAL = COLORS["neutral"]
_CLASS_COLOR = {"First": _C6[0], "Second": _C6[1], "Third": _C6[2], "Crew": _C6[3]}

_LAYER_SPACING = 64
_INTERNAL_SPACING = 2


def _sex_color(sex):
    return _C6[4] if sex == "Female" else _C6[5]


def _tgt_color(sex, survived):
    if survived == "No":
        return _GRAY
    return _sex_color(sex)


def story_default():
    by_class = group_by(TITANIC, "class")

    def _survival_node(cls, sex, items):
        return spread(
            [
                # source: a single stacked column of survival bars
                stack(
                    [
                        rect(
                            w=40,
                            h=sum_by(s_items, "count") / 10,
                            fill=_sex_color(sex),
                        ).name(f"{cls}-{sex}-{survived}-src")
                        for survived, s_items in group_by(items, "survived").items()
                    ],
                    dir="y",
                    spacing=0,
                    alignment="middle",
                ).name(f"{cls}-{sex}-tgt"),
                # target: the survival bars spread apart
                spread(
                    [
                        rect(
                            h=sum_by(s_items, "count") / 10,
                            fill=_tgt_color(sex, survived),
                        ).name(f"{cls}-{sex}-{survived}-tgt")
                        for survived, s_items in group_by(items, "survived").items()
                    ],
                    dir="y",
                    w=40,
                    spacing=_INTERNAL_SPACING * 4,
                    alignment="middle",
                ),
            ],
            dir="x",
            spacing=_LAYER_SPACING,
            alignment="middle",
        )

    def _class_node(cls, items):
        return spread(
            [
                # source: a single stacked column of sex bars
                stack(
                    [
                        rect(
                            w=40,
                            h=sum_by(s_items, "count") / 10,
                            fill=_CLASS_COLOR[cls],
                        ).name(f"{cls}-{sex}-src")
                        for sex, s_items in group_by(items, "sex").items()
                    ],
                    dir="y",
                    spacing=0,
                    alignment="middle",
                ).name(f"{cls}-tgt"),
                # target: each sex expands into its own survival sub-tree
                spread(
                    [
                        _survival_node(cls, sex, s_items)
                        for sex, s_items in group_by(items, "sex").items()
                    ],
                    dir="y",
                    h=sum_by(items, "count") / 10,
                    spacing=_INTERNAL_SPACING * 2,
                    alignment="middle",
                ),
            ],
            dir="x",
            spacing=_LAYER_SPACING,
            alignment="middle",
        )

    bars = spread(
        [
            # root: one bar per class
            stack(
                [
                    rect(
                        w=40, h=sum_by(items, "count") / 10, fill=_NEUTRAL
                    ).name(f"{cls}-src")
                    for cls, items in by_class.items()
                ],
                dir="y",
                spacing=0,
                alignment="middle",
            ),
            spread(
                [_class_node(cls, items) for cls, items in by_class.items()],
                dir="y",
                spacing=_INTERNAL_SPACING,
                alignment="middle",
            ),
        ],
        dir="x",
        spacing=_LAYER_SPACING,
        alignment="middle",
    )

    # Ribbons: class → sex → survival, each linking a named source to its target.
    ribbons = []
    for cls, items in by_class.items():
        ribbons.append(
            connect(
                [ref(f"{cls}-src"), ref(f"{cls}-tgt")],
                direction="x",
                fill=_CLASS_COLOR[cls],
                interpolation="bezier",
                opacity=0.7,
            )
        )
        for sex, s_items in group_by(items, "sex").items():
            ribbons.append(
                connect(
                    [ref(f"{cls}-{sex}-src"), ref(f"{cls}-{sex}-tgt")],
                    direction="x",
                    fill=_sex_color(sex),
                    interpolation="bezier",
                    opacity=0.7,
                )
            )
            for survived, sv_items in group_by(s_items, "survived").items():
                ribbons.append(
                    connect(
                        [
                            ref(f"{cls}-{sex}-{survived}-src"),
                            ref(f"{cls}-{sex}-{survived}-tgt"),
                        ],
                        direction="x",
                        fill=_tgt_color(sex, survived),
                        interpolation="bezier",
                        opacity=0.7,
                    )
                )

    return (
        layer([bars, *ribbons]),
        {"w": 500, "h": 400, "axes": True},
    )
