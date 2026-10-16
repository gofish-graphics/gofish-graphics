"""Equivalent of gofish-gotree/stories/gallery/WeaveTree.stories.tsx."""

from gofish import Curve, circle
from gofish.gotree import combine, tree
from python_stories.gotree_data import SAMPLE_TREE, by_depth


def node(d):
    return circle(r=13, fill=by_depth()(d))


def story_weave_tree():
    return (
        tree(
            SAMPLE_TREE,
            node=node,
            link={"curve": Curve.linear(), "stroke": "#666", "stroke_width": 1},
            parent_child=combine(
                x={"kind": "distribute", "spacing": 18},
                y={"kind": "align", "alignment": "end"},
            ),
            sibling=combine(
                x={"kind": "distribute", "spacing": 26},
                y={"kind": "distribute", "spacing": 26},
            ),
        ),
        {"w": 640, "h": 420},
    )
