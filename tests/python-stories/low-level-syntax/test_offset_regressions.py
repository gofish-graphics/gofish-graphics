"""Equivalent of lowlevel/OffsetRegressions.stories.tsx — Low Level Syntax/Offset Regressions.

Regression repros for issue #755: an explicit offset (`position()`, an
operator's `x=`/`y=`, or `.translate()`) is applied exactly once. Before the
fix, `position()` added its offset to its local box AND to its translate, so
the box it reported was displaced twice and the root reserved the extra offset
as a phantom overhang.

Expected to change: the y axis in `story_spread_option_y` and
`story_operator_translate_y` stays put while the bars lift, which is wrong
(#1053), and both `story_operator_translate_*` stories record `.translate()`'s
current absolute placement, whose meaning is undecided (#1054). When either is
resolved, these baselines move on purpose; what must still hold is that each
offset is counted once.
"""

from gofish import chart, layer, position, rect, spread


# A 50x50 square at (150, 150) in a 200x200 canvas fills the bottom-right
# corner and spills nothing, so the SVG is 280x280 (the canvas plus the 40px
# padding on each side). Before the fix it was 398x398.
def story_position_in_layer():
    return (
        layer([
            position([rect(w=50, h=50, fill="steelblue")], x=150, y=150),
        ]),
        {"w": 200, "h": 200},
    )


DATA = [
    {"c": "a", "v": 10},
    {"c": "b", "v": 20},
    {"c": "c", "v": 30},
]


# The reference: a spread's own `y=` lifts the bars 50px; the tallest bar then
# spills 50px above the canvas, and only that spill is reserved.
def story_spread_option_y():
    return (
        chart(DATA).flow(spread(by="c", dir="x", y=50)).mark(rect(h="v")),
        {"w": 300, "h": 200, "axes": True},
    )


# `.translate(y=50)` on the operator must render exactly like
# `story_spread_option_y`.
def story_operator_translate_y():
    return (
        chart(DATA)
        .flow(spread(by="c", dir="x").translate(y=50))
        .mark(rect(h="v")),
        {"w": 300, "h": 200, "axes": True},
    )


# The same on x: the bars and their y axis shift right together by 50px, and
# the SVG widens only by the 50px the bars spill past the canvas.
def story_operator_translate_x():
    return (
        chart(DATA)
        .flow(spread(by="c", dir="x").translate(x=50))
        .mark(rect(h="v")),
        {"w": 300, "h": 200, "axes": True},
    )
