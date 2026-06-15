"""Equivalent of bluefish/PythonTutor/PythonTutor.stories.tsx — composes
`global_frame` + `heap` with arrows between pointer slots and their targets.
"""

import os
import sys

sys.path.insert(0, os.path.dirname(__file__))

from _components import global_frame, heap  # noqa: E402
from _types import binding, is_pointer, pointer, tuple_  # noqa: E402

from gofish import arrow, createName, layer, ref, spread  # noqa: E402


def story_python_tutor():
    data = {
        "stack": [
            binding("c", pointer(0)),
            binding("d", pointer(1)),
            binding("x", "5"),
        ],
        "heap": [
            tuple_(["12", pointer(1), "1", "0", pointer(2), pointer(3)]),
            tuple_(["1", "4"]),
            tuple_(["3", "10", "7", "8", pointer(4)]),
            tuple_(["2", pointer(4)]),
            tuple_(["3"]),
        ],
        "heapArrangement": [
            [0, 3, None, None],
            [None, 1, 2, 4],
        ],
    }

    global_frame_name = createName("globalFrame")
    heap_name = createName("heap")

    # Address → (row, col) in the arrangement grid
    addr_pos = {}
    for r, row in enumerate(data["heapArrangement"]):
        for c, addr in enumerate(row):
            if addr is not None:
                addr_pos[addr] = (r, c)

    stack_arrows = []
    for i, slot in enumerate(data["stack"]):
        if is_pointer(slot["value"]):
            target_pos = addr_pos[slot["value"]["value"]]
            stack_arrows.append(
                arrow(
                    [
                        ref(global_frame_name).variables[i].value,
                        ref(heap_name).path(*target_pos).elmTuples[0],
                    ],
                    bow=0,
                    stretch=0,
                    flip=True,
                    padStart=0,
                    stroke="#1A5683",
                    start=True,
                )
            )

    heap_arrows = []
    for a, obj in enumerate(data["heap"]):
        for j, v in enumerate(obj["values"]):
            if is_pointer(v):
                src_pos = addr_pos[a]
                dst_pos = addr_pos[v["value"]]
                heap_arrows.append(
                    arrow(
                        [
                            ref(heap_name).path(*src_pos).elmTuples[j].val,
                            ref(heap_name).path(*dst_pos).elmTuples[0],
                        ],
                        bow=0,
                        padEnd=25,
                        padStart=0,
                        stroke="#1A5683",
                        start=True,
                    )
                )

    return (
        layer(
            [
                spread(
                    [
                        global_frame(stack=data["stack"]).name(global_frame_name),
                        heap(
                            heap=data["heap"],
                            heapArrangement=data["heapArrangement"],
                        ).name(heap_name),
                    ],
                    dir="x",
                    alignment="start",
                    spacing=100,
                ),
                *stack_arrows,
                *heap_arrows,
            ]
        ),
        {},
    )
