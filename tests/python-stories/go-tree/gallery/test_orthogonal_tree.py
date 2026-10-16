"""Equivalent of gofish-gotree/stories/gallery/OrthogonalTree.stories.tsx."""

from gofish import Curve, circle
from gofish.gotree import combine, tree
from python_stories.gotree_data import SAMPLE_TREE, by_depth


def node(d):
    return circle(r=7, fill=by_depth()(d), stroke="#08306b", stroke_width=1)


def story_orthogonal_tree():
    return (
        tree(
            SAMPLE_TREE,
            node=node,
            link={
                "curve": Curve.orthogonal(),
                "stroke": "#90a4ae",
                "stroke_width": 1.5,
            },
            parent_child=combine(
                x={"kind": "distribute", "spacing": 18},
                y={"kind": "distribute", "spacing": 18},
            ),
            sibling=combine(
                x={"kind": "distribute", "spacing": 18},
                y={"kind": "distribute", "spacing": 18},
            ),
        ),
        {"w": 640, "h": 420},
    )
