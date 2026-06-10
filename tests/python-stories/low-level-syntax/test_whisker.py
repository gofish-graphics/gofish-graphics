"""Equivalent of lowlevel/Whisker.stories.tsx — Low Level Syntax/Whisker.

Box-and-whisker glyphs over the gender pay-gap data. Each glyph is a `layer`
of: min/max tick rects (named) joined by a vertical `connect` whisker, the
interquartile box, and the median line. Three stories: a single glyph, a
male/female pair, and the full pay-grade × gender plot. Mirrors the JS
`boxwhisker.ts` helper (which the story file delegates to).
"""

from gofish import layer, spread, connect, rect, ref, datum
from python_stories.data import GENDER_PAY_GAP, PAY_GRADE
from python_stories._lowlevel_helpers import group_by, order_by

_RENDER = {"w": 320, "h": 400, "axes": True}


def _box_and_whisker(d, tag):
    """One glyph. `tag` makes the min/max ref names unique across glyphs
    (the JS helper uses a random suffix; a stable per-glyph tag keeps the
    Python output deterministic)."""
    median, lo, hi = d["Median"], d["Min"], d["Max"]
    q1, q3 = d["25-Percentile"], d["75-Percentile"]
    fill = datum(d["Gender"])
    min_name, max_name = f"min-{tag}", f"max-{tag}"
    return layer(
        [
            rect(w=8, h=1, y=datum(lo), fill="gray").name(min_name),
            rect(w=8, h=1, y=datum(hi), fill="gray").name(max_name),
            connect(
                [ref(min_name), ref(max_name)], direction="y", mode="center", strokeWidth=1
            ),
            rect(w=8, y=datum(q1), h=datum(q3 - q1), fill=fill),
            rect(w=8, h=1, y=datum(median), fill="white"),
        ]
    )


def story_single_box_whisker():
    return (_box_and_whisker(GENDER_PAY_GAP[0], "single"), _RENDER)


def story_pair_box_whisker():
    grade_five = [d for d in GENDER_PAY_GAP if d["Pay Grade"] == "Five"]
    male = next(d for d in grade_five if d["Gender"] == "Male")
    female = next(d for d in grade_five if d["Gender"] == "Female")
    return (
        spread(
            [_box_and_whisker(male, "male"), _box_and_whisker(female, "female")],
            dir="x",
            spacing=8,
            sharedScale=True,
        ),
        _RENDER,
    )


def story_box_whisker():
    by_grade = group_by(
        order_by(GENDER_PAY_GAP, lambda d: PAY_GRADE.index(d["Pay Grade"])),
        "Pay Grade",
    )
    return (
        spread(
            [
                spread(
                    [
                        _box_and_whisker(rows[0], f"{grade}-{gender}")
                        for gender, rows in group_by(grade_rows, "Gender").items()
                    ],
                    dir="x",
                    key=grade,
                    spacing=8,
                )
                for grade, grade_rows in by_grade.items()
            ],
            dir="x",
            spacing=8,
            sharedScale=True,
        ),
        _RENDER,
    )
