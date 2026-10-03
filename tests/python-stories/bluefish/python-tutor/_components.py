"""Reusable Python Tutor mark components — one per `.ts` helper.

Mirrors:
- packages/gofish-graphics/stories/bluefish/PythonTutor/stackSlot.ts
- elmTuple.ts
- heapObject.ts
- heap.ts
- globalFrame.ts

Each component is a `@mark` decorator (so internal `create_name(...)`
names get a `node.scope()` post-pass on the JS side). The helpers are
authored in one file to sidestep the `python_stories.bluefish.python-tutor.*`
import-path issue — the storybook title resolves to a dashed dir, which
Python can't address via `from` imports.
"""

from gofish import (
    Constraint,
    arrow,
    create_name,
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
    box_tag = create_name("box")
    value_tag = create_name("value")
    if isinstance(value, str):
        val_text = text(text=value, font_size=24, font_family=FONT_FAMILY).name(
            value_tag
        )
    else:
        val_text = text(
            text="", font_size=24, font_family=FONT_FAMILY, fill="none"
        ).name(value_tag)
    return spread(
        [
            text(text=variable, font_size=24, font_family=FONT_FAMILY).name(
                "variable"
            ),
            layer(
                [
                    rect(h=40, w=40, fill="#e2ebf6").name(box_tag),
                    rect(h=2, w=40, fill="#a6b3b6").name("boxBorderBottom"),
                    rect(h=40, w=2, fill="#a6b3b6").name("boxBorderLeft"),
                    val_text,
                ]
            ).relate(
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
def elm_tuple(tuple_index: str, tuple_data=None):
    """One boxed cell in a heap-object row."""
    val_tag = create_name("val")
    if isinstance(tuple_data, str):
        val_text = text(
            text=tuple_data, font_size=24, font_family=FONT_FAMILY, fill="black"
        ).name(val_tag)
    else:
        val_text = text(
            text="", font_size=24, font_family=FONT_FAMILY, fill="none"
        ).name(val_tag)
    return layer(
        [
            rect(
                h=60,
                w=70,
                fill="#ffffc6",
                stroke="gray",
                stroke_width=1,
            ).name("box"),
            text(
                text=tuple_index,
                font_size=16,
                font_family=FONT_FAMILY,
                fill="gray",
            ).name("label"),
            val_text,
        ]
    ).relate(
        lambda box, label, val: [
            Constraint.align([val, box], x="middle", y="middle"),
            Constraint.align([label, box], x="start", y="start"),
        ]
    )


@mark
def heap_object(object_type: str, object_values: list):
    """A heap-side object — type label + horizontal row of `elm_tuple` cells."""
    elm_tuples_tag = create_name("elmTuples")
    return spread(
        [
            text(
                text=object_type,
                font_family=FONT_FAMILY,
                font_size=16,
                fill="grey",
            ),
            spread(
                [
                    elm_tuple(
                        tuple_index=str(i),
                        tuple_data=(
                            elt["value"] if elt["type"] == "string" else None
                        ),
                    )
                    for i, elt in enumerate(object_values)
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
def heap(heap: list, heap_arrangement: list):
    """2D grid of `heap_object`s laid out by an arrangement matrix."""
    return spread(
        [
            spread(
                [
                    (
                        rect(h=60, w=140, fill="none", stroke="none")
                        if address is None
                        else heap_object(
                            object_type=heap[address]["type"],
                            object_values=[
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
            for row in heap_arrangement
        ],
        dir="y",
        alignment="start",
        spacing=75,
    )


@mark
def global_frame(stack: list):
    """Frame with a label, side border, and a column of `stack_slot`s."""
    variables_tag = create_name("variables")

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
                font_size=24,
                font_family="Andale Mono, monospace",
                fill="black",
            ).name("label"),
            spread(
                [_slot(b) for b in stack],
                dir="y",
                alignment="end",
                spacing=10,
            ).name(variables_tag),
        ]
    ).relate(
        lambda label, frame, frameBorder, variables: [
            Constraint.align([label, frame], x="middle", y="start"),
            Constraint.align([frameBorder, frame], x="start", y="middle"),
            Constraint.align([variables, label], x="end"),
            Constraint.distribute([label, variables], dir="y", spacing=10),
        ]
    )
