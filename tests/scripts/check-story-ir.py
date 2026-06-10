#!/usr/bin/env python3
"""Quick local IR smoke-check for a single Python story file.

Imports one `tests/python-stories/**/test_*.py`, runs each `story_*` function,
and calls `.to_ir()` on the returned builder/mark — catching runtime errors
(KeyError, bad kwargs, wrong combinator shape) in a tight feedback loop without
spinning up the derive-server or the full capture pipeline.

This is intentionally lighter than `pnpm --filter @gofish/tests validate-python-ir`,
which additionally validates every story's IR against the canonical
`gofish-ir` JSON Schema. Use this while *authoring* a port; run validate-python-ir
before relying on it.

Usage:
    python tests/scripts/check-story-ir.py <story_file> [story_fn]

    # all story_* in a file:
    python tests/scripts/check-story-ir.py tests/python-stories/low-level-syntax/test_sankey_tree.py
    # one function:
    python tests/scripts/check-story-ir.py .../test_sankey_tree.py story_default
"""

import importlib.util
import json
import os
import sys

PROJECT_ROOT = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "..")
)
PKG_DIR = os.path.join(PROJECT_ROOT, "tests/python-stories")

# Make `from gofish import ...` and `from python_stories... import ...` resolve
# exactly as the derive-server does (python_stories has a hyphen in its path, so
# it can't be a normal import — register it explicitly against tests/python-stories).
sys.path.insert(0, os.path.join(PROJECT_ROOT, "packages/gofish-python"))


def _register_python_stories():
    if "python_stories" in sys.modules:
        return
    pkg_init = os.path.join(PKG_DIR, "__init__.py")
    spec = importlib.util.spec_from_file_location(
        "python_stories", pkg_init, submodule_search_locations=[PKG_DIR]
    )
    mod = importlib.util.module_from_spec(spec)
    sys.modules["python_stories"] = mod
    spec.loader.exec_module(mod)


def main(argv):
    if not argv:
        print(__doc__)
        return 2
    story_file = argv[0]
    only_fn = argv[1] if len(argv) > 1 else None

    _register_python_stories()
    spec = importlib.util.spec_from_file_location("_gofish_story", story_file)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)

    names = (
        [only_fn]
        if only_fn
        else sorted(n for n in dir(mod) if n.startswith("story_"))
    )
    if not names:
        print(f"no story_* functions found in {story_file}")
        return 1

    for name in names:
        fn = getattr(mod, name)
        result = fn()
        obj = result[0] if isinstance(result, tuple) else result
        ir = obj.to_ir()
        encoded = json.dumps(ir)
        print(f"  {name}: OK  (ir {len(encoded)} bytes, top type={ir.get('type')})")
    print(f"all stories produced IR ({story_file})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
