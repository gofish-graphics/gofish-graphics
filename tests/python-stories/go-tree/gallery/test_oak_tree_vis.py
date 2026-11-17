"""Equivalent of gofish-gotree/stories/gallery/OakTreeVis.stories.tsx."""

import math

from gofish import Coord, Curve, Spacing, circle
from gofish.gotree import combine, tree
from python_stories.gotree_data import SAMPLE_TREE, by_depth


def node(d):
    return circle(r=5, fill=by_depth()(d), stroke="#1f3a5f", stroke_width=1)


def story_oak_tree_vis():
    return (
        tree(
            SAMPLE_TREE,
            node=node,
            link={"curve": Curve.linear(), "stroke": "#90a4ae", "stroke_width": 2},
            parent_child=combine(
                x={"kind": "align", "alignment": "middle"},
                y={
                    "kind": "distribute",
                    "spacing": Spacing.pitch(121, at="middle"),
                },
            ),
            sibling=combine(
                x={
                    "kind": "distribute",
                    "spacing": Spacing.pitch((2 * math.pi) / 6, at="middle"),
                },
                y={"kind": "distribute", "spacing": Spacing.pitch(61, at="middle")},
            ),
            coord=Coord.clock(),
        ),
        {},
    )
