"""Equivalent of gofish-gotree/stories/gallery/ViolinTree.stories.tsx."""

import math

from gofish import Coord, Spacing, rect
from gofish.gotree import combine, tree
from python_stories.gotree_data import SAMPLE_TREE, by_depth

LEAF_THETA = (2 * math.pi) / 9  # fixed theta-width per node (~9 slots)
VALUE_R = 42  # r-units per unit of value (violin thickness)


# A leaf's radial thickness is proportional to its value; internal nodes
# leave r unsized so the r nest grows them over their subtree.
def node(d):
    if d["height"] == 0:
        return rect(
            w=LEAF_THETA,
            h=d["data"]["value"] * VALUE_R,
            em_x=True,
            fill=by_depth()(d),
            stroke="white",
            stroke_width=1,
        )
    return rect(
        w=LEAF_THETA,
        em_x=True,
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
                x={"kind": "distribute", "spacing": Spacing.pitch(0, at="middle")},
                y={"kind": "nest", "pad": 18},
            ),
            sibling=combine(
                x={"kind": "distribute", "spacing": Spacing.pitch(LEAF_THETA, at="middle")},
                y={"kind": "distribute", "spacing": Spacing.pitch(0, at="middle")},
            ),
            coord=Coord.clock(),
        ),
        {},
    )
