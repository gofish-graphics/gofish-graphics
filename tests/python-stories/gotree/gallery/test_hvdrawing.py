"""Equivalent of gofish-gotree/stories/gallery/HVDrawing.stories.tsx —
GoTree / Gallery / HVDrawing (horizontal/vertical alternating tree).

The original alternates two templates by depth (gallery dsl1 <-> dsl2, axes
swapped):
  dsl1: X juxtapose/flatten, Y within/align  -> spread on X, align on Y  ("H")
  dsl2: X within/align, Y juxtapose/flatten  -> spread on Y, align on X  ("V")
Expressed with `alternate([H, V])` so every level swaps the spread axis --
THIS is what makes the HV drawing (a single fixed template collapses to a
line).

NOTE: the JS story also sets `mode: "bottomUp"` on the spec object, but
`mode` is a dead field -- grep of gofish-gotree/src/tree.tsx and
recursion.ts confirms it's declared on the `GoTreeSpec` type but never read
anywhere in the layout logic. It has zero effect on the JS render, so it's
omitted here rather than faked (the Python `tree()` signature has no
`mode` kwarg to begin with).
"""

from gofish import circle
from gofish.gotree import alternate, combine, tree

SAMPLE_TREE = {
    "name": "root",
    "children": [
        {
            "name": "A",
            "children": [
                {"name": "A1", "value": 4},
                {"name": "A2", "value": 2},
                {"name": "A3", "value": 3},
            ],
        },
        {
            "name": "B",
            "children": [
                {"name": "B1", "value": 5},
                {
                    "name": "B2",
                    "children": [
                        {"name": "B2a", "value": 2},
                        {"name": "B2b", "value": 1},
                    ],
                },
            ],
        },
        {
            "name": "C",
            "children": [
                {"name": "C1", "value": 3},
                {"name": "C2", "value": 2},
            ],
        },
    ],
}

_DEPTH_BLUES = ["#08306b", "#2171b5", "#6baed6", "#c6dbef", "#deebf7"]


def _by_depth(d):
    return _DEPTH_BLUES[min(d["depth"], len(_DEPTH_BLUES) - 1)]


def _node(d):
    return circle(r=7, fill=_by_depth(d), stroke="#08306b", strokeWidth=1)


_S = 34
# H: parent left of subtree, children in a row (spread x, centered y).
_H = combine(
    x={"kind": "distribute", "spacing": _S},
    y={"kind": "align", "alignment": "middle"},
)
# V: parent above subtree, children in a column (spread y, centered x).
_V = combine(
    x={"kind": "align", "alignment": "middle"},
    y={"kind": "distribute", "spacing": _S},
)


def story_hvdrawing():
    return (
        tree(
            SAMPLE_TREE,
            node=_node,
            link={"curve": "straight", "stroke": "#90a4ae", "stroke_width": 1.5},
            # Both relations alternate in sync (resolved at the same node
            # depth).
            parent_child=alternate([_H, _V]),
            sibling=alternate([_H, _V]),
        ),
        {"w": 640, "h": 420},
    )
