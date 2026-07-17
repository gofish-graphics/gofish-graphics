"""Equivalent of gofish-gotree/stories/gallery/StairTree.stories.tsx —
GoTree / Gallery / StairTree.

Each parent sits left of its subtree (distribute x) and its box wraps the
subtree vertically (nest y); siblings step diagonally (distribute on both
axes) — producing the cascading staircase.
"""

from gofish import rect
from gofish.gotree import combine, tree

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


# rectangle nodes, colored by depth. Internal nodes are left UNSIZED on y
# (the nest axis) so the parent box grows to wrap its subtree; leaves are
# fixed.
def _node(d):
    if d["height"] == 0:
        return rect(w=34, h=18, fill=_by_depth(d))
    return rect(w=34, fill=_by_depth(d), stroke="#08306b", strokeWidth=1)


def story_stair_tree():
    return (
        tree(
            SAMPLE_TREE,
            node=_node,
            link="none",
            parent_child=combine(
                x={"kind": "distribute", "spacing": 6},
                y={"kind": "nest", "pad": 6},
            ),
            sibling=combine(
                x={"kind": "distribute", "spacing": 6},
                y={"kind": "distribute", "spacing": 6},
            ),
        ),
        {"w": 640, "h": 420},
    )
