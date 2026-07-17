"""Equivalent of gofish-gotree/stories/gallery/TornadoTree2.stories.tsx —
GoTree / Gallery / TornadoTree2.

A variant of TornadoTree: every node is a thin arc, and each deeper level
both twists angularly and grows radially, so the whole tree spirals outward
from the center. parentChild = (distribute theta, nest r) -- each child group
is twisted a bit angularly off its parent and nested radially inside it.
sibling = (distribute theta, distribute r) -- siblings fan out on theta AND
step outward on r, producing the spiral.

Internal nodes are left unsized on r so `nest` can grow them to wrap their
subtree; only the theta-width is fixed. No angular auto-fit (fixed per-level
spacing), so deep/wide branches overflow 2*pi and wrap -- this is the
"tornado" overflow from the reference, kept uncontrolled per the JS story.
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

_LEAF_THETA = 0.12  # angular width of a node (radians)
_LEAF_R = 14  # radial thickness of a leaf (px in r)


def _by_depth(d):
    return _DEPTH_BLUES[min(d["depth"], len(_DEPTH_BLUES) - 1)]


def _node(d):
    if d["height"] == 0:
        return rect(
            w=_LEAF_THETA,
            h=_LEAF_R,
            emX=True,
            emY=True,
            fill=_by_depth(d),
            stroke="white",
            strokeWidth=1,
        )
    # internal node: fixed theta-width, UNSIZED on r so `nest` grows it
    # radially to enclose its subtree.
    return rect(
        w=_LEAF_THETA,
        emX=True,
        emY=True,
        fill=_by_depth(d),
        stroke="white",
        strokeWidth=1,
    )


def story_tornado_tree2():
    return (
        tree(
            SAMPLE_TREE,
            node=_node,
            link="none",
            parent_child=combine(
                # theta: twist the child group off its parent -- a large
                # per-level twist is what makes successive rings spiral around.
                x={"kind": "distribute", "spacing": 0.5, "anchor": "middle"},
                # r: child group nested radially inside the parent. Small pad
                # keeps parent arcs from spiking too far out.
                y={"kind": "nest", "pad": 6},
            ),
            sibling=combine(
                # theta: fan siblings out angularly.
                x={"kind": "distribute", "spacing": 0.32, "anchor": "middle"},
                # r: step each sibling outward radially -> the spiral.
                y={"kind": "distribute", "spacing": 12, "anchor": "middle"},
            ),
            coord=polar(),
        ),
        {"w": 560, "h": 560},
    )
