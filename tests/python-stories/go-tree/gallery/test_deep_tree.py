"""Equivalent of gofish-gotree/stories/gallery/DeepTree.stories.tsx."""

import math

from gofish import Coord, Curve, circle
from gofish.gotree import combine, tree
from python_stories.gotree_data import by_depth


# A balanced binary tree, 4 levels deep.
def make(depth, prefix):
    if depth == 0:
        return {"name": prefix}
    return {
        "name": prefix,
        "children": [make(depth - 1, prefix + "a"), make(depth - 1, prefix + "b")],
    }


DEEP_TREE = make(4, "r")


def node(d):
    return circle(r=6, fill=by_depth()(d), stroke="#08306b", stroke_width=1)


def story_deep_tree():
    return (
        tree(
            DEEP_TREE,
            node=node,
            link={"curve": Curve.linear(), "stroke": "#5f6b7a", "stroke_width": 1.5},
            parent_child=combine(
                x={"kind": "nest", "pad": 0},
                y={
                    "kind": "distribute",
                    "spacing": 151,
                    "anchor": "middle",
                },
            ),
            sibling=combine(
                x={
                    "kind": "distribute",
                    "spacing": (2 * math.pi) / 10,
                    "anchor": "middle",
                },
                y={"kind": "align", "alignment": "middle"},
            ),
            coord=Coord.polar(),
        ),
        {},
    )
