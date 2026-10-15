"""The JSON loader the dataset modules (data.py, bird_data.py) share.

Datasets for the stories are mirrored byte-for-byte from the JS sources in
packages/gofish-graphics/src/data/*.ts (and the runtime-computed color palettes
from src/color.ts) into JSON files in _lowlevel_data/. They are *generated*, not
hand-edited: regenerate with the tsx dump used when these ports were added.

This is a module of its own, so importing the loader parses no dataset. A
module in python_stories that imports load_json from here is a dataset module:
the docs build (apps/docs/docs/.vitepress/data/pythonExamples.ts) turns a
story's import from it into an import from the snippet's standalone `dataset`
module, and inlines each `NAME = load_json("file")` as a Python literal.
"""

import json as _json
from pathlib import Path as _Path

DATA_DIR = _Path(__file__).parent / "_lowlevel_data"


def load_json(name: str):
    with open(DATA_DIR / f"{name}.json") as f:
        return _json.load(f)
