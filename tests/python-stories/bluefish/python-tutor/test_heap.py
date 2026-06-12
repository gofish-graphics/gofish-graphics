"""Equivalent of bluefish/PythonTutor/Heap.stories.tsx."""

import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from _components import heap  # noqa: E402


def story_heap():
    return (
        heap(
            heap=[
                {"type": "tuple", "values": ["12", "1"]},
                {"type": "list", "values": ["x", "y", "z"]},
                {"type": "tuple", "values": ["hello", "world"]},
            ],
            heapArrangement=[[0, 1], [None, 2]],
        ),
        {"w": 800, "h": 500},
    )
