"""Equivalent of bluefish/PythonTutor/HeapObject.stories.tsx."""

import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from _components import heap_object  # noqa: E402


def story_heap_object():
    return (
        heap_object(
            objectType="tuple",
            objectValues=[
                {"type": "string", "value": "12"},
                {"type": "string", "value": "1"},
                {"type": "string", "value": "0"},
            ],
        ),
        {"w": 400, "h": 200},
    )
