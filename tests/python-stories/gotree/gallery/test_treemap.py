"""Equivalent of gofish-gotree/stories/gallery/Treemap.stories.tsx —
GoTree / Gallery / Treemap.

`parent_child` is CONSTANT nest x nest (every parent box wraps its subtree
on both axes); only the sibling subdivision alternates slice<->dice every
level via `alternate([dice, slice])`. That swap is the essence of a
squarified-looking treemap — it avoids the tall-thin-column look of a
single fixed template. Node = rectangle, link = none, color = depth (blue
ramp, dark root -> light leaf).
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


# Internal/parent nodes nest on BOTH axes, so they must be UNSIZED on both x
# and y — the rect grows to wrap its subtree. Leaves are sized by data so
# areas read proportionally (height proportional to d.data.value).
def _node(d):
    if d["height"] == 0:
        return rect(w=92, h=14 * d["value"], fill=_by_depth(d))
    return rect(fill=_by_depth(d), stroke="#08306b", strokeWidth=1)


_P = 9  # parent->subtree pad (small, constant)
_G = 9  # sibling spacing

# DICE: siblings side-by-side on x, centered on y.
_DICE = combine(
    x={"kind": "distribute", "spacing": _G},
    y={"kind": "align", "alignment": "middle"},
)
# SLICE: siblings stacked on y, centered on x.
_SLICE = combine(
    x={"kind": "align", "alignment": "middle"},
    y={"kind": "distribute", "spacing": _G},
)


def story_treemap():
    return (
        tree(
            SAMPLE_TREE,
            node=_node,
            link="none",
            # Parent box wraps its subtree on both axes at every depth (constant).
            parent_child=combine(
                x={"kind": "nest", "pad": _P},
                y={"kind": "nest", "pad": _P},
            ),
            # Siblings subdivide the parent, swapping dice<->slice every level.
            sibling=alternate([_DICE, _SLICE]),
        ),
        {"w": 640, "h": 420},
    )
