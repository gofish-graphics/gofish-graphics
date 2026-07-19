"""Equivalent of gofish-gotree/stories/gallery/CascadedTreemap.stories.tsx —
GoTree / Gallery / CascadedTreemap.

`alternate([dice, slice])` swaps subdivision slice<->dice every level — the
cascade: each depth subdivides on the opposite axis. `parent_child` nests on
BOTH axes (constant per depth) so internal nodes are UNSIZED on both axes
(the parent box grows to enclose its subtree); a small nest pad adds a
nested inset border at every level (the visible "cascade"). Only leaves
carry intrinsic size, driven by the datum value.
"""

from gofish import rect
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
    if d["height"] == 0:
        size = 18 + d["value"] * 10
        return rect(w=size, h=size, fill=_by_depth(d), stroke="#08306b", strokeWidth=1)
    return rect(fill=_by_depth(d), stroke="#08306b", strokeWidth=1)


_P = 6  # small nest pad -> visible cascade inset border per level
_G = 8  # sibling spacing

# dice: siblings spread on X, share a vertical center.
_DICE = combine(
    x={"kind": "distribute", "spacing": _G},
    y={"kind": "align", "alignment": "middle"},
)
# slice: siblings spread on Y, share a horizontal center.
_SLICE = combine(
    x={"kind": "align", "alignment": "middle"},
    y={"kind": "distribute", "spacing": _G},
)


def story_cascaded_treemap():
    return (
        tree(
            SAMPLE_TREE,
            node=_node,
            link="none",
            # nest on both axes -> parent rect encloses its subtree with a
            # small pad.
            parent_child=combine(
                x={"kind": "nest", "pad": _P},
                y={"kind": "nest", "pad": _P},
            ),
            # siblings alternate subdivision axis per depth (the cascade).
            sibling=alternate([_DICE, _SLICE]),
        ),
        {"w": 640, "h": 420},
    )
