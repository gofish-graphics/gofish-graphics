"""Equivalent of gofish-gotree/stories/gallery/ArcTree.stories.tsx.

Every node is distributed along x and aligned to one y baseline, so the tree
lies on a single line and the hierarchy shows only through its arc links.
"""

from gofish import Curve, circle
from gofish.gotree import combine, tree
from python_stories.gotree_data import SAMPLE_TREE, by_depth


def node(d):
    return circle(r=11, fill=by_depth()(d), stroke="#08306b", stroke_width=1)


def story_arc_tree():
    return (
        tree(
            SAMPLE_TREE,
            node=node,
            link={"curve": Curve.arc(), "stroke": "#90a4ae", "stroke_width": 1.5},
            parent_child=combine(
                x={"kind": "distribute", "spacing": 27},
                y={"kind": "align", "alignment": "middle"},
            ),
            sibling=combine(
                x={"kind": "distribute", "spacing": 27},
                y={"kind": "align", "alignment": "middle"},
            ),
        ),
        {"w": 640, "h": 420},
    )
