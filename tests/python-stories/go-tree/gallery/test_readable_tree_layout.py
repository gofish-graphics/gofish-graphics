"""Equivalent of gofish-gotree/stories/gallery/ReadableTreeLayout.stories.tsx."""

from gofish import Curve, circle
from gofish.gotree import combine, tree
from python_stories.gotree_data import SAMPLE_TREE, by_depth


def node(d):
    return circle(r=14, fill=by_depth()(d), stroke="#08306b", stroke_width=1)


def story_readable_tree_layout():
    return (
        tree(
            SAMPLE_TREE,
            node=node,
            link={"curve": Curve.orthogonal(), "stroke": "#555555", "stroke_width": 2},
            parent_child=combine(
                x={"kind": "align", "alignment": "middle"},
                y={"kind": "distribute", "spacing": 102},
            ),
            sibling=combine(
                x={"kind": "distribute", "spacing": 31},
                y={"kind": "align", "alignment": "middle"},
            ),
        ),
        {"w": 640, "h": 420},
    )
