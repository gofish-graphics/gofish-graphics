"""Equivalent of gofish-gotree/stories/gallery/FlowerTree.stories.tsx —
GoTree / Gallery / FlowerTree.

Polar circle clusters ("petals"). Under polar(): x = theta, y = r.
parentChild = (x: nest, y: align) -- the parent's angular wedge ENCLOSES the
angular span of its child group, while align on r keeps parent and children
on the SAME radial band (no radial growth between levels). sibling =
(x: distribute, y: align) -- siblings distribute angularly on a shared
radius.

Radius is scaled by subtree leaf count (`d["width"]`) so parents visibly wrap
their cluster of child circles -- the petal. Ported verbatim, including the
JS story's flagged gaps (no angular auto-fit for point/circle nodes -- fixed
per-level spacing constant, not derived from node count; nest on theta is a
flat radian pad, not a true wedge inset).
"""

import math

from gofish import circle, polar
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


def _by_depth(d):
    return _DEPTH_BLUES[min(d["depth"], len(_DEPTH_BLUES) - 1)]


def _node(d):
    return circle(
        r=6 + math.sqrt(d.get("width") or 1) * 6,
        fill=_by_depth(d),
        stroke="white",
        strokeWidth=2,
    )


def story_flower_tree():
    return (
        tree(
            SAMPLE_TREE,
            node=_node,
            link={"curve": "straight", "stroke": "#90a4ae", "stroke_width": 1.5},
            parent_child=combine(
                # theta: parent wedge encloses (nests) the child group's angular span.
                x={"kind": "nest", "pad": 0.04},
                # r: parent on the same radial band as its children (no growth).
                y={"kind": "align", "alignment": "middle"},
            ),
            sibling=combine(
                # theta: spread siblings angularly (spacing in radians, center
                # mode so point-like circles don't accumulate bboxes around the
                # ring).
                x={
                    "kind": "distribute",
                    "spacing": (2 * math.pi) / 7,
                    "anchor": "middle",
                },
                # r: siblings share a radius band.
                y={"kind": "align", "alignment": "middle"},
            ),
            coord=polar(),
        ),
        {"w": 520, "h": 520},
    )
