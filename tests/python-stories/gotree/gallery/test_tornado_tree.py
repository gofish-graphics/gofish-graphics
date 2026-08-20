"""Equivalent of gofish-gotree/stories/gallery/TornadoTree.stories.tsx —
GoTree / Gallery / TornadoTree.

Polar, nested-radial spiral. Under polar(): x = theta, y = r.
parentChild = (distribute theta, NEST r) -- parent's radial band ENCLOSES
its subtree, while parent and subtree are offset angularly (the spiral
"twist"). sibling = (distribute theta, distribute r) -- siblings step in
BOTH angle and radius, fanning each level outward into the tornado curl.

Nest-on-r is the hard case: internal nodes get a rect with no `h` (unsized on
r, the nest axis) and a fixed theta-width (emX). There is no angular
auto-fit here -- theta spacing is a fixed per-level constant, so the spiral
overflows 2*pi and wraps; that wrap is on-theme (the reference is itself a
spiral winding past 2*pi) but not principled allocation. Ported verbatim,
including this uncontrolled overflow.
"""

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

_TH = 0.13  # fixed angular width per node (radians, via emX) -- thin slivers
_LEAF_H = 12  # leaf radial thickness (r units, via emY)


def _by_depth(d):
    return _DEPTH_BLUES[min(d["depth"], len(_DEPTH_BLUES) - 1)]


def _node(d):
    if d["height"] == 0:
        return rect(
            w=_TH,
            h=_LEAF_H,
            emX=True,
            emY=True,
            fill=_by_depth(d),
            stroke="white",
            strokeWidth=1,
        )
    # internal node: NO h -> grows on r via nest (radial containment).
    return rect(
        w=_TH,
        emX=True,
        emY=True,
        fill=_by_depth(d),
        stroke="white",
        strokeWidth=1,
    )


def story_tornado_tree():
    return (
        tree(
            SAMPLE_TREE,
            node=_node,
            link="none",
            parent_child=combine(
                # theta: offset parent from its subtree -> the spiral twist.
                x={"kind": "distribute", "spacing": 0.55, "anchor": "middle"},
                # r: parent's band ENCLOSES the subtree (dsl Root "include").
                y={"kind": "nest", "pad": 9},
            ),
            sibling=combine(
                # theta: step siblings angularly (tight -> packs the curl).
                x={"kind": "distribute", "spacing": 0.42, "anchor": "middle"},
                # r: step siblings radially too -> fans the level outward.
                y={"kind": "distribute", "spacing": 9, "anchor": "middle"},
            ),
            coord=polar(),
        ),
        {"w": 480, "h": 480},
    )
