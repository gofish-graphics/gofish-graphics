"""Equivalent of gofish-gotree/stories/gallery/OrthogonalGridEmbedding.stories.tsx."""

import math

from gofish import Coord, Curve, circle
from gofish.gotree import combine, tree
from python_stories.gotree_data import SAMPLE_TREE, by_depth


def node(d):
    return circle(r=7, fill=by_depth()(d), stroke="#08306b", stroke_width=1)


def story_orthogonal_grid_embedding():
    return (
        tree(
            SAMPLE_TREE,
            node=node,
            link={"curve": Curve.linear(), "stroke": "#90a4ae", "stroke_width": 1.5},
            parent_child=combine(
                x={"kind": "align", "alignment": "middle"},
                y={
                    "kind": "distribute",
                    "spacing": 138,
                    "anchor": "middle",
                },
            ),
            sibling=combine(
                x={
                    "kind": "distribute",
                    "spacing": (2 * math.pi) / 6,
                    "anchor": "middle",
                },
                y={"kind": "align", "alignment": "middle"},
            ),
            coord=Coord.clock(),
        ),
        {},
    )
