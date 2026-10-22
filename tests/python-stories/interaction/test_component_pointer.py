"""Equivalent of ComponentPointer.stories.tsx — Interaction/Component Pointer.

A low-level component, five raw rects with no chart and no data binding,
whose fill reads a `pointer()`: each box is given a one-row list as its datum
(`bind_data([box])`), which is what `p.over` compares with the hovered box's.
Captured at rest, all five in the base color.
"""

from gofish import pointer, rect, spread, when


def story_default():
    p = pointer()
    boxes = [{"i": i} for i in range(5)]
    return (
        spread(
            [
                rect(
                    w=70,
                    h=60 + box["i"] * 18,
                    fill=when(p.over).then("#d62728").otherwise("#6b9bd1"),
                ).bind_data([box])
                for box in boxes
            ],
            dir="x",
            spacing=14,
            alignment="middle",
        ),
        {"w": 460, "h": 200},
    )
