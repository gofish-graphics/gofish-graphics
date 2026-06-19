"""Equivalent of bluefish/PythonTutor/GlobalFrame.stories.tsx."""

import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from _components import global_frame  # noqa: E402


def story_global_frame():
    return (
        global_frame(
            stack=[
                {"variable": "c", "value": "0"},
                {"variable": "d", "value": "0"},
                {"variable": "x", "value": "5"},
            ],
        ),
        {},
    )
