"""Equivalent of gofish-gotree/stories/gallery/Iptp.stories.tsx —
GoTree / Gallery / iptp.

An indented pixel-tree plot that lays out the hierarchy as a dense grid of
nested rectangles. parent_child distributes on BOTH axes (each level steps
down and across); siblings flatten along x and share a top edge.
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


# Uniform tall-bar rectangle nodes, colored by depth (dark root -> light leaves).
def _node(d):
    return rect(w=16, h=90, fill=_by_depth(d))


def story_iptp():
    return (
        tree(
            SAMPLE_TREE,
            node=_node,
            link="none",
            parent_child=combine(
                x={"kind": "distribute", "spacing": 6},
                # puts the parent at HIGH y (top of screen, y-up) so the
                # root sits above its subtree.
                y={"kind": "distribute", "spacing": 6},
            ),
            sibling=combine(
                x={"kind": "distribute", "spacing": 6},
                # Align siblings to the TOP of their bands (y-down free
                # space: "start" = near/top edge) so same-depth nodes share
                # a row.
                y={"kind": "align", "alignment": "start"},
            ),
        ),
        {"w": 640, "h": 420},
    )
