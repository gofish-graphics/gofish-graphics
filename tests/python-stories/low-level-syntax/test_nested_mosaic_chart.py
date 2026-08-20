"""Equivalent of lowlevel/NestedMosaicChart.stories.tsx — Low Level Syntax/Nested Mosaic Chart.

Three nested `stack(...)` flows (class -> sex -> survived), each with
`size: field("count").normalize()`, mirror the JS spec exactly.

The only unportable fragment in the JS story is the fill channel, a function
of two fields:

    fill: (d) => (d.survived === "No" ? gray : classColor[d.class])

This crosses via the EXISTING lambda bridge (the same one `text(text=lambda
d: ...)` already uses, see `piccl/test_bottle.py`): a bare Python callable
passed as a mark kwarg is wrapped by `_channel()` in `gofish/ast.py` into a
`_PendingAccessor`, registered with the derive server under a UUID, and
serialized as `{"__gofish_lambda": id}`. The JS harness (`fromJSON.ts`)
swaps in an `async (d) => fetch /derive/<id>` arrow at render time. Until
this port, `rect`'s `fill` channel (`inferColor` in `src/ast/channels.ts`)
did not await a function accessor's return value the way `text`'s `raw`
channel (`inferRaw`) did, so an async lambda fill would have resolved to an
unresolved Promise instead of a color string. `inferColor` was made async
(and its callers updated to await it) to close that gap — see
`/internals/frontend/mark-factory`.

`gray` (`#D1D9E2`) and `color6[0..3]` (`#4190c5`, `#f2cf57`, `#a181c8`,
`#ff9666`) are inlined from `packages/gofish-graphics/src/color.ts`; the
Python package does not (yet) expose the JS color palette.
"""

from gofish import chart, stack, rect, field

# packages/gofish-graphics/src/color.ts: gray
GRAY = "#D1D9E2"

# packages/gofish-graphics/src/color.ts: color6[0..3]
CLASS_COLOR = {
    "First": "#4190c5",
    "Second": "#f2cf57",
    "Third": "#a181c8",
    "Crew": "#ff9666",
}

TITANIC = [
    {"class": "First", "sex": "Female", "survived": "Yes", "count": 141},
    {"class": "First", "sex": "Male", "survived": "Yes", "count": 62},
    {"class": "Second", "sex": "Female", "survived": "Yes", "count": 93},
    {"class": "Second", "sex": "Male", "survived": "Yes", "count": 25},
    {"class": "Third", "sex": "Female", "survived": "Yes", "count": 90},
    {"class": "Third", "sex": "Male", "survived": "Yes", "count": 88},
    {"class": "Crew", "sex": "Female", "survived": "Yes", "count": 20},
    {"class": "Crew", "sex": "Male", "survived": "Yes", "count": 192},
    {"class": "First", "sex": "Female", "survived": "No", "count": 4},
    {"class": "First", "sex": "Male", "survived": "No", "count": 118},
    {"class": "Second", "sex": "Female", "survived": "No", "count": 13},
    {"class": "Second", "sex": "Male", "survived": "No", "count": 154},
    {"class": "Third", "sex": "Female", "survived": "No", "count": 106},
    {"class": "Third", "sex": "Male", "survived": "No", "count": 422},
    {"class": "Crew", "sex": "Female", "survived": "No", "count": 3},
    {"class": "Crew", "sex": "Male", "survived": "No", "count": 670},
]


def story_default():
    return (
        chart(TITANIC, axes=True)
        .flow(
            stack(by="class", dir="y", size=field("count").normalize()),
            stack(by="sex", dir="x", size=field("count").normalize()),
            stack(by="survived", dir="y", size=field("count").normalize()),
        )
        .mark(
            rect(
                fill=lambda d: GRAY if d["survived"] == "No" else CLASS_COLOR[d["class"]],
                stroke="white",
                strokeWidth=1,
            )
        ),
        {"w": 500, "h": 500},
    )
