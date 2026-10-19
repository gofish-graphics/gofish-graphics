"""Equivalent of gofish-gotree/stories/gallery/FlowerTree.stories.tsx."""

import math

from gofish import Coord, Curve, circle
from gofish.gotree import combine, tree
from python_stories.gotree_data import SAMPLE_TREE, by_depth


# Node size grows with the number of leaves under it.
def node(d):
    return circle(
        r=35 + math.sqrt(d["width"]) * 35,
        fill=by_depth()(d),
        stroke="white",
        stroke_width=2,
    )


def story_flower_tree():
    return (
        tree(
            SAMPLE_TREE,
            node=node,
            link={"curve": Curve.linear(), "stroke": "#90a4ae", "stroke_width": 1.5},
            parent_child=combine(
                x={"kind": "nest", "pad": 0.04},
                y={"kind": "align", "alignment": "middle"},
            ),
            sibling=combine(
                x={
                    "kind": "distribute",
                    "spacing": (2 * math.pi) / 7,
                    "anchor": "middle",
                },
                y={"kind": "align", "alignment": "middle"},
            ),
            coord=Coord.polar(),
        ),
        {"w": 520, "h": 520},
    )
