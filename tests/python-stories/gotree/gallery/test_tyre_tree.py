"""Equivalent of gofish-gotree/stories/gallery/TyreTree.stories.tsx —
GoTree / Gallery / TyreTree.

Concentric tyre-like rings of wedges, where a parent's wedge INCLUDES its
children radially: the outermost ring is the root, and each level nests one
band further toward the center. Under polar(): x = theta, y = r.
parentChild = (nest theta, align r) ; sibling = (distribute theta, align r).

Unlike the sunburst/icicle (own ring per depth via distribute-r), here every
node is ALIGNED on r at the same inner edge ("start") and its radial height
encodes its reverse-depth: a node at rdepth k spans (k+1) bands outward from
the shared inner edge, so shallower levels progressively overpaint deeper
ones toward the center -- the concentric "tyre".

REQUIRES a depth-balanced tree (align-r needs every leaf at the same depth
so the radial bands line up) -- ported the JS story's balanced `sampleTree`
(depth 3, 8 leaves), not the shared uneven fixture.
"""

from gofish import polar, rect, datum
from gofish.gotree import combine, tree


def _make_balanced(depth, prefix="root"):
    if depth == 0:
        return {"name": prefix}
    return {
        "name": prefix,
        "children": [
            _make_balanced(depth - 1, prefix + "L"),
            _make_balanced(depth - 1, prefix + "R"),
        ],
    }


# Balanced binary tree, depth 3 -> 8 leaves, 4 levels.
SAMPLE_TREE = _make_balanced(3)

# Sequential blue ramp, dark at the root (outer rim) -> light at the leaves
# (inner).
_TYRE_BLUES = ["#08306b", "#2171b5", "#6baed6", "#c6dbef", "#deebf7"]

_BAND = 34  # radial thickness of one inclusion band


def _by_depth(d):
    return _TYRE_BLUES[min(d["depth"], len(_TYRE_BLUES) - 1)]


def _node(d):
    if d["height"] == 0:
        return rect(
            thetaSize=datum(1),
            emX=True,
            h=(d["height"] + 1) * _BAND,
            emY=True,
            fill=_by_depth(d),
            stroke="white",
            strokeWidth=2,
        )
    return rect(
        emX=True,
        h=(d["height"] + 1) * _BAND,
        emY=True,
        fill=_by_depth(d),
        stroke="white",
        strokeWidth=2,
    )


def story_tyre_tree():
    return (
        tree(
            SAMPLE_TREE,
            node=_node,
            link="none",
            # parentChild: nest theta realizes the dsl's X.Root=include (parent's
            # arc spans its children's). align r "start" pins every node's INNER
            # edge to the same radius, so the taller (lower-depth) wedge reaches
            # OUTWARD past its children.
            parent_child=combine(
                x={"kind": "nest", "pad": 0},
                y={"kind": "align", "alignment": "start"},
            ),
            # sibling: distribute theta (pack siblings around the circle) +
            # align r "start" (siblings share the same inner edge / band).
            sibling=combine(
                x={"kind": "distribute", "spacing": 0},
                y={"kind": "align", "alignment": "start"},
            ),
            # InnerRadius:0.25 -- the donut hole (tyre hub).
            coord=polar(inner_radius=0.25),
        ),
        {"w": 560, "h": 560},
    )
