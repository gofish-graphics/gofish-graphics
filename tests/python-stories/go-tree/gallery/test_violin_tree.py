"""Equivalent of gofish-gotree/stories/gallery/ViolinTree.stories.tsx."""

import math

from gofish import Coord, datum, rect
from gofish.gotree import combine, tree
from python_stories.gotree_data import SAMPLE_TREE, by_depth


# Every node is one theta unit wide. Leaves are one radial unit; internal
# nodes leave r to the nest.
def node(d):
    if d["height"] == 0:
        return rect(
            w=datum(1),
            h=datum(1),
            fill=by_depth()(d),
            stroke="white",
            stroke_width=1,
        )
    return rect(
        w=datum(1),
        fill=by_depth()(d),
        stroke="white",
        stroke_width=1,
    )


def story_violin_tree():
    return (
        tree(
            SAMPLE_TREE,
            node=node,
            link="none",
            parent_child=combine(
                # theta: the child group, then the parent (bottom-up).
                x={"kind": "distribute", "spacing": 0, "order": "reverse"},
                # r: the parent's span covers its subtree's (Root include).
                y={"kind": "nest", "pad": 0},
            ),
            sibling=combine(
                # theta: siblings follow one another around the circle.
                x={"kind": "distribute", "spacing": 0},
                # r: and inward (PolarCenter bottom: the layout's top is the rim).
                y={"kind": "distribute", "spacing": 0, "order": "reverse"},
            ),
            # Counter-clockwise from 12 o'clock, as the reference turns.
            coord=Coord.polar(baseline_angle=math.pi / 2),
        ),
        {"w": 540, "h": 540},
    )
