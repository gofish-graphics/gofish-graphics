"""Equivalent of bluefish/PythonTutor/ElmTuple.stories.tsx."""

import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from _components import elm_tuple  # noqa: E402


def story_elm_tuple():
    return elm_tuple(tuple_index="0", tuple_data="12"), {"w": 120, "h": 100}
