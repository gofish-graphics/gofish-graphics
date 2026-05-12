"""Equivalent of bluefish/PythonTutor/StackSlot.stories.tsx."""

import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from _components import stack_slot  # noqa: E402


def story_stack_slot():
    return stack_slot(variable="x", value="5"), {"w": 200, "h": 80}
