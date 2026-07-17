"""Equivalent of gofish-gotree/stories/gallery/NestedPieTree.stories.tsx —
GoTree / Gallery / NestedPieTree.

This is the CARTESIAN nested-rectangle form (the original gallery entry is a
polar nested-pie under a polar coordinate system, covered separately by a
different story). Every parent rectangle CONTAINS its children on both
axes; `alternate([slice, dice])` swaps the subdivision direction slice<->dice
at each depth — the cartesian analogue of the radial slice/dice nesting.
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


# rectangle nodes, colored by depth. Leaves are sized by their datum value
# (height proportional to value, fixed width); internal nodes are left
# UNSIZED on both axes (the nest axes) so each parent box grows to enclose
# its whole subtree.
def _node(d):
    if d["height"] == 0:
        v = d["value"] if d["value"] is not None else (d["width"] or 1)
        return rect(w=40, h=v * 16, fill=_by_depth(d))
    return rect(fill=_by_depth(d), stroke="#08306b", strokeWidth=1)


_P = 6  # nest padding (Root include pad)
_G = 8  # sibling distribute spacing (Subtree flatten margin)

# dice: siblings stack vertically (distribute y), sharing an x-center.
_DICE = combine(
    x={"kind": "align", "alignment": "middle"},
    y={"kind": "distribute", "spacing": _G},
)
# slice: siblings stack horizontally (distribute x), sharing a y-center.
_SLICE = combine(
    x={"kind": "distribute", "spacing": _G},
    y={"kind": "align", "alignment": "middle"},
)


def story_nested_pie_tree():
    return (
        tree(
            SAMPLE_TREE,
            node=_node,
            link="none",
            # include -> nest on both axes at every level: the parent
            # rectangle wraps its subtree group horizontally and vertically
            # with a small padding.
            parent_child=combine(
                x={"kind": "nest", "pad": _P},
                y={"kind": "nest", "pad": _P},
            ),
            # Alternate the subdivision axis by depth: slice <-> dice every level.
            sibling=alternate([_SLICE, _DICE]),
        ),
        {"w": 640, "h": 420},
    )
