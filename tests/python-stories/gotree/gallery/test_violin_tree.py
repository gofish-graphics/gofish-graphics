"""Equivalent of gofish-gotree/stories/gallery/ViolinTree.stories.tsx —
GoTree / Gallery / ViolinTree.

Polar nested bands, no links. parentChild = (distribute theta, nest r) --
the parent's rect grows RADIALLY to embed its subtree (the embedded radial
dimension). sibling = (distribute theta, distribute r).

Internal nodes are left UNSIZED on r (h) so nest-on-r grows them to wrap
their subtree; leaves are sized on r by `d["value"]`, so the radial
thickness varies leaf-to-leaf -- the violin silhouette. theta-width is a
fixed per-node constant (no angular auto-fit): sizes/spacings are hand-tuned
for the 8-leaf sampleTree, exactly as in the JS story.
"""

import math

from gofish import polar, rect
from gofish.gotree import combine, tree

# Same sample tree as gofish-gotree/stories/data.ts::sampleTree.
SAMPLE_TREE = {
    "name": "root",
    "children": [
        {
            "name": "A",
            "children": [
                {"name": "A1", "value": 4},
                {"name": "A2", "value": 2},
                {"name": "A3", "value": 3},
            ],
        },
        {
            "name": "B",
            "children": [
                {"name": "B1", "value": 5},
                {
                    "name": "B2",
                    "children": [
                        {"name": "B2a", "value": 2},
                        {"name": "B2b", "value": 1},
                    ],
                },
            ],
        },
        {
            "name": "C",
            "children": [
                {"name": "C1", "value": 3},
                {"name": "C2", "value": 2},
            ],
        },
    ],
}

_DEPTH_BLUES = ["#08306b", "#2171b5", "#6baed6", "#c6dbef", "#deebf7"]

_LEAF_THETA = (2 * math.pi) / 9  # fixed theta-width per node (~9 slots)
_VALUE_R = 14  # r-units per unit of value (violin thickness)


def _by_depth(d):
    return _DEPTH_BLUES[min(d["depth"], len(_DEPTH_BLUES) - 1)]


def _node(d):
    if d["height"] == 0:
        return rect(
            w=_LEAF_THETA,
            h=d["value"] * _VALUE_R,  # leaf radial thickness proportional to value
            emX=True,
            emY=True,
            fill=_by_depth(d),
            stroke="white",
            strokeWidth=1,
        )
    # internal: unsized on r (h) -> nest grows it to embed the subtree.
    return rect(
        w=_LEAF_THETA,
        emX=True,
        emY=True,
        fill=_by_depth(d),
        stroke="white",
        strokeWidth=1,
    )


def story_violin_tree():
    return (
        tree(
            SAMPLE_TREE,
            node=_node,
            link="none",
            # parentChild: X juxtapose -> distribute theta ; Y include -> nest r.
            # spacing:0/center on theta keeps parent theta-centered over its
            # subtree; nest on r grows the parent's rect to embed the subtree.
            parent_child=combine(
                x={"kind": "distribute", "spacing": 0, "anchor": "middle"},
                y={"kind": "nest", "pad": 6},
            ),
            # sibling: X flatten -> distribute theta ; Y flatten -> distribute r.
            sibling=combine(
                x={"kind": "distribute", "spacing": _LEAF_THETA, "anchor": "middle"},
                y={"kind": "distribute", "spacing": 0, "anchor": "middle"},
            ),
            coord=polar(),
        ),
        {"w": 520, "h": 520},
    )
