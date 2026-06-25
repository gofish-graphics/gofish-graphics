"""Reusable Python Tutor mark components — one per `.ts` helper.

Mirrors:
- packages/gofish-graphics/stories/bluefish/PythonTutor/stackSlot.ts
- elmTuple.ts
- heapObject.ts
- heap.ts
- globalFrame.ts

Each component is a `@mark` decorator (so internal `createName(...)`
names get a `node.scope()` post-pass on the JS side). The helpers are
authored in one file to sidestep the `python_stories.bluefish.python-tutor.*`
import-path issue — the storybook title resolves to a dashed dir, which
Python can't address via `from` imports.
"""

from gofish import (
    Constraint,
    arrow,
    createName,
    layer,
    mark,
    rect,
    ref,
    spread,
    text,
)

FONT_FAMILY = "verdana, arial, helvetica, sans-serif"


@mark
def stack_slot(variable: str, value=None):
    """One row in a stack frame — variable name + boxed value."""
    box_tag = createName("box")
    value_tag = createName("value")
    if isinstance(value, str):
        val_text = text(text=value, fontSize=24, fontFamily=FONT_FAMILY).name(
            value_tag
        )
    else:
        val_text = text(
            text="", fontSize=24, fontFamily=FONT_FAMILY, fill="none"
        ).name(value_tag)
    return spread(
        [
            text(text=variable, fontSize=24, fontFamily=FONT_FAMILY).name(
                "variable"
            ),
            layer(
                [
                    rect(h=40, w=40, fill="#e2ebf6").name(box_tag),
                    rect(h=2, w=40, fill="#a6b3b6").name("boxBorderBottom"),
                    rect(h=40, w=2, fill="#a6b3b6").name("boxBorderLeft"),
                    val_text,
                ]
            ).constrain(
                lambda box, boxBorderBottom, boxBorderLeft, value: [
                    Constraint.align([box, value], x="middle", y="middle"),
                    Constraint.align(
                        [box, boxBorderBottom], x="middle", y="end"
                    ),
                    Constraint.align(
                        [box, boxBorderLeft], x="start", y="middle"
                    ),
                ]
            ),
        ],
        dir="x",
        alignment="middle",
        spacing=5,
    )


@mark
def elm_tuple(tupleIndex: str, tupleData=None):
    """One boxed cell in a heap-object row."""
    val_tag = createName("val")
    if isinstance(tupleData, str):
        val_text = text(
            text=tupleData, fontSize=24, fontFamily=FONT_FAMILY, fill="black"
        ).name(val_tag)
    else:
        val_text = text(
            text="", fontSize=24, fontFamily=FONT_FAMILY, fill="none"
        ).name(val_tag)
    return layer(
        [
            rect(
                h=60,
                w=70,
                fill="#ffffc6",
                stroke="gray",
                strokeWidth=1,
            ).name("box"),
            text(
                text=tupleIndex,
                fontSize=16,
                fontFamily=FONT_FAMILY,
                fill="gray",
            ).name("label"),
            val_text,
        ]
    ).constrain(
        lambda box, label, val: [
            Constraint.align([val, box], x="middle", y="middle"),
            Constraint.align([label, box], x="start", y="start"),
        ]
    )


@mark
def heap_object(objectType: str, objectValues: list):
    """A heap-side object — type label + horizontal row of `elm_tuple` cells."""
    elm_tuples_tag = createName("elmTuples")
    return spread(
        [
            text(
                text=objectType,
                fontFamily=FONT_FAMILY,
                fontSize=16,
                fill="grey",
            ),
            spread(
                [
                    elm_tuple(
                        tupleIndex=str(i),
                        tupleData=(
                            elt["value"] if elt["type"] == "string" else None
                        ),
                    )
                    for i, elt in enumerate(objectValues)
                ],
                dir="x",
                spacing=0,
            ).name(elm_tuples_tag),
        ],
        dir="y",
        alignment="start",
        spacing=10,
    )


@mark
def heap(heap: list, heapArrangement: list):
    """2D grid of `heap_object`s laid out by an arrangement matrix."""
    return spread(
        [
            spread(
                [
                    (
                        rect(h=60, w=140, fill="none", stroke="none")
                        if address is None
                        else heap_object(
                            objectType=heap[address]["type"],
                            objectValues=[
                                {
                                    "type": (
                                        "string"
                                        if isinstance(v, (str, int))
                                        else "pointer"
                                    ),
                                    "value": (
                                        f"{v}"
                                        if isinstance(v, (str, int))
                                        else str(v["value"])
                                    ),
                                }
                                for v in heap[address]["values"]
                            ],
                        )
                    )
                    for address in row
                ],
                dir="x",
                alignment="end",
                spacing=75,
            )
            for row in heapArrangement
        ],
        dir="y",
        alignment="start",
        spacing=75,
    )


@mark
def global_frame(stack: list):
    """Frame with a label, side border, and a column of `stack_slot`s."""
    variables_tag = createName("variables")

    def _slot(b):
        # Python equivalent of `isPointer(slot.value) ? undefined : formatValue(slot.value)`
        v = b["value"]
        if isinstance(v, dict) and v.get("type") == "pointer":
            return stack_slot(variable=b["variable"])
        return stack_slot(variable=b["variable"], value=str(v))

    return layer(
        [
            rect(h=300, w=200, fill="#e2ebf6").name("frame"),
            rect(h=300, w=5, fill="#a6b3b6").name("frameBorder"),
            text(
                text="Global Frame",
                fontSize=24,
                fontFamily="Andale Mono, monospace",
                fill="black",
            ).name("label"),
            spread(
                [_slot(b) for b in stack],
                dir="y",
                alignment="end",
                spacing=10,
            ).name(variables_tag),
        ]
    ).constrain(
        lambda label, frame, frameBorder, variables: [
            Constraint.align([label, frame], x="middle", y="start"),
            Constraint.align([frameBorder, frame], x="start", y="middle"),
            Constraint.align([variables, label], x="end"),
            Constraint.distribute([label, variables], dir="y", spacing=10),
        ]
    )
