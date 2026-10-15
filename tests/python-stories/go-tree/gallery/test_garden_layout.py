"""Equivalent of gofish-gotree/stories/gallery/GardenLayout.stories.tsx."""

from gofish import Curve, circle
from gofish.gotree import combine, tree
from python_stories.gotree_data import SAMPLE_TREE, by_depth


def node(d):
    return circle(r=10, fill=by_depth()(d), stroke="#08306b", stroke_width=1)


def story_garden_layout():
    return (
        tree(
            SAMPLE_TREE,
            node=node,
            link={"curve": Curve.linear(), "stroke": "#90a4ae", "stroke_width": 1.5},
            parent_child=combine(
                x={"kind": "align", "alignment": "middle"},
                y={"kind": "distribute", "spacing": 48},
            ),
            sibling=combine(
                x={"kind": "distribute", "spacing": 24},
                y={"kind": "align", "alignment": "middle"},
            ),
        ),
        {"w": 640, "h": 420},
    )
