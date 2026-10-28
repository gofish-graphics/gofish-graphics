"""Equivalent of lowlevel/NestedMosaicChart.stories.tsx — Low Level Syntax/Nested Mosaic Chart.

Three nested `stack(...)` flows (class -> sex -> survived), each with
`size: field("count").normalize()`, mirror the JS spec exactly.

The JS fill is a function of two fields:

    fill: (d) => (d.survived === "No" ? gray : classColor[d.class])

It crosses as a Python lambda: the wrapper serializes it as
`{"__gofish_lambda": id}`, and the JS side resolves it before layout with one
batched call over the rows (`RESOLVE_ROWS`), so the fill channel sees plain
color strings.
"""

from gofish import chart, stack, rect, field
from python_stories.data import TITANIC, COLORS

_C6 = COLORS["color6"]
_GRAY = COLORS["gray"]
_CLASS_COLOR = {"First": _C6[0], "Second": _C6[1], "Third": _C6[2], "Crew": _C6[3]}


def story_default():
    return (
        chart(TITANIC, w=500, h=500)
        .flow(
            stack(by="class", dir="y", size=field("count").normalize()),
            stack(by="sex", dir="x", size=field("count").normalize()),
            stack(by="survived", dir="y", size=field("count").normalize()),
        )
        .mark(
            rect(
                fill=lambda d: _GRAY if d["survived"] == "No" else _CLASS_COLOR[d["class"]],
                stroke="white",
                stroke_width=1,
            )
        ),
        {},
    )
