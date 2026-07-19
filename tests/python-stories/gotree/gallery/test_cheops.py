"""Equivalent of gofish-gotree/stories/gallery/Cheops.stories.tsx —
GoTree / Gallery / cheops.

"Cheops" = pyramid of nested triangles; the negative sibling spacing overlaps
adjacent siblings, and nest is on X ONLY (internal nodes unsized on x, fixed
height) so each parent grows horizontally to wrap its subtree while every
level keeps a fixed row height.

TODO (ported faithfully from the JS story, not fixed here): gofish has no
triangle mark, so the JS story renders `rect` placeholders for the paper's
triangles — this port keeps that placeholder rather than "improving" it.
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


# Triangle-placeholder nodes (rect — see module docstring TODO), colored by
# depth. Internal nodes are left UNSIZED on x (the nest axis) so the parent
# box grows to wrap its subtree horizontally; height is fixed on every node
# so levels stack as equal-height rows. White stroke stands in for the gaps
# between the reference's triangles.
_ROW_H = 80
_LEAF_W = 26


def _node(d):
    if d["height"] == 0:
        return rect(w=_LEAF_W, h=_ROW_H, fill=_by_depth(d), stroke="white", strokeWidth=1)
    return rect(h=_ROW_H, fill=_by_depth(d), stroke="white", strokeWidth=1)


def story_cheops():
    return (
        tree(
            SAMPLE_TREE,
            node=_node,
            link="none",
            parent_child=combine(
                x={"kind": "nest", "pad": 0},
                y={"kind": "distribute", "spacing": 2},
            ),
            sibling=combine(
                x={"kind": "distribute", "spacing": -8},
                # Align siblings to the TOP of their bands (y-down free space:
                # "start" = near/top edge) so same-depth nodes share a row.
                y={"kind": "align", "alignment": "start"},
            ),
        ),
        {"w": 640, "h": 420},
    )
