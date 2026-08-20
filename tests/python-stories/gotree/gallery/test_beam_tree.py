"""Equivalent of gofish-gotree/stories/gallery/BeamTree.stories.tsx —
GoTree / Gallery / BeamTree.

Alternating nested beams. parent_child nests on BOTH axes at every level
(parent rectangle grows to enclose its subtree), so every parent rectangle
becomes a nested "beam". `alternate([spread_x, spread_y])` swaps the
sibling-subdivision axis by depth: the root lays children out in a row,
those children stack their children in a column, and so on. Leaves carry
the size (proportional to value); internal nodes are unsized so their boxes
wrap the children plus padding.

NOTE (ported faithfully from the JS story, not fixed here): gotree's
reference uses asymmetric per-side negative Y.Root padding to make the
parent band overhang its children. GoFish nest pad is symmetric, so that
exact overhang nuance isn't expressible here; a small positive pad is used
for clean nested beams instead (same compromise as the JS story).
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


# rectangle nodes, colored by depth (dark root -> light leaves). Leaves are
# sized by datum — width proportional to value, a fixed tall height — so the
# beams are proportional. Internal nodes are left UNSIZED on both axes (the
# nest axes) so each parent box grows to wrap its subtree plus padding.
_LEAF_W = 14  # px per unit of value
_LEAF_H = 200  # fixed beam height


def _node(d):
    if d["height"] == 0:
        w = _LEAF_W * (d["value"] if d["value"] is not None else (d["width"] or 1))
        return rect(w=w, h=_LEAF_H, fill=_by_depth(d))
    return rect(fill=_by_depth(d))


_G = 8  # sibling gap
_P = 6  # nest padding (parent box wraps its subtree on both axes)

# parent contains subtree on BOTH axes at every level -> nested beams.
_PARENT_CHILD = combine(
    x={"kind": "nest", "pad": _P},
    y={"kind": "nest", "pad": _P},
)
# siblings alternate the spread axis by depth: row, then column, then row...
_SPREAD_X = combine(
    x={"kind": "distribute", "spacing": _G},
    y={"kind": "align", "alignment": "middle"},
)
_SPREAD_Y = combine(
    x={"kind": "align", "alignment": "middle"},
    y={"kind": "distribute", "spacing": _G},
)
_SIBLING = alternate([_SPREAD_X, _SPREAD_Y])


def story_beam_tree():
    return (
        tree(
            SAMPLE_TREE,
            node=_node,
            link="none",
            parent_child=_PARENT_CHILD,
            sibling=_SIBLING,
        ),
        {"w": 640, "h": 420},
    )
