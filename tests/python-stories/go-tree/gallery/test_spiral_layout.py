"""Equivalent of gofish-gotree/stories/gallery/SpiralLayout.stories.tsx."""

import math

from gofish import Coord, Curve, circle
from gofish.gotree import combine, tree
from python_stories.gotree_data import SAMPLE_TREE, by_depth


def node(d):
    return circle(r=7, fill=by_depth()(d), stroke="#1f3a5f", stroke_width=1)


def story_spiral_layout():
    return (
        tree(
            SAMPLE_TREE,
            node=node,
            link={"curve": Curve.linear(), "stroke": "#90a4ae", "stroke_width": 1.5},
            parent_child=combine(
                x={
                    "kind": "distribute",
                    "spacing": (2 * math.pi) / 9,
                    "anchor": "middle",
                    "alignment": "middle",
                },
                y={
                    "kind": "distribute",
                    "spacing": 118,
                    "anchor": "middle",
                    "alignment": "middle",
                },
            ),
            sibling=combine(
                x={
                    "kind": "distribute",
                    "spacing": (2 * math.pi) / 9,
                    "anchor": "middle",
                    "alignment": "middle",
                },
                y={
                    "kind": "distribute",
                    "spacing": 62,
                    "anchor": "middle",
                    "alignment": "middle",
                },
            ),
            coord=Coord.polar(),
        ),
        {"w": 520, "h": 520},
    )
