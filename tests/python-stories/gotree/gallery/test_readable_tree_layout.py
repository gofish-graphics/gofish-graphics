"""Equivalent of gofish-gotree/stories/gallery/ReadableTreeLayout.stories.tsx —
GoTree / Gallery / ReadableTreeLayout.

dsl: node=circle, link=orthogonal, color=depth, mode=bottom-up, cartesian.
  X.Root = within (centered) ; X.Subtree = flatten (margin 0.3w)
  Y.Root = juxtapose (margin 0.2) ; Y.Subtree = align (alignment top)
Mapping (within->align middle, juxtapose/flatten->distribute, align->align):
  parentChild = (align middle x, distribute y)  -> parent centered over
                its subtree and offset vertically from it.
  sibling     = (distribute x, align top y)      -> siblings spread
                across, their tops aligned on a level.
This is a node-link tree (same layout family as NodeLinkTree). The root
lands at the top of the frame, leaves at the bottom, matching the
reference. Links use the `orthogonal` route (elbow connectors), matching
the dsl's orthogonal links.
"""

from gofish import circle
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


def _node(d):
    return circle(r=8, fill=_by_depth(d), stroke="#08306b", strokeWidth=1)


def story_readable_tree_layout():
    return (
        tree(
            SAMPLE_TREE,
            node=_node,
            link={"curve": "orthogonal", "stroke": "#555555", "stroke_width": 2},
            parent_child=combine(
                x={"kind": "align", "alignment": "middle"},
                y={"kind": "distribute", "spacing": 60},
            ),
            sibling=combine(
                x={"kind": "distribute", "spacing": 18},
                y={"kind": "align", "alignment": "middle"},
            ),
        ),
        {"w": 640, "h": 420},
    )
