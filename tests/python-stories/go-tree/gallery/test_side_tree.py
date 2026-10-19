"""Equivalent of gofish-gotree/stories/gallery/SideTree.stories.tsx."""

from gofish import Coord, Curve, circle
from gofish.gotree import combine, tree
from python_stories.gotree_data import SAMPLE_TREE, by_depth


def node(d):
    return circle(r=6, fill=by_depth()(d), stroke="#1f3a5f", stroke_width=1)


def story_side_tree():
    return (
        tree(
            SAMPLE_TREE,
            node=node,
            link={"curve": Curve.linear(), "stroke": "#607d8b", "stroke_width": 1.5},
            parent_child=combine(
                x={"kind": "distribute", "spacing": 0.5, "anchor": "middle"},
                y={"kind": "distribute", "spacing": 84, "anchor": "middle"},
            ),
            sibling=combine(
                x={"kind": "align", "alignment": "middle"},
                y={"kind": "distribute", "spacing": 109, "anchor": "middle"},
            ),
            coord=Coord.polar(),
        ),
        {"w": 560, "h": 560},
    )
