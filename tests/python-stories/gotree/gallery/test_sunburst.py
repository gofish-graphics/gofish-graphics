"""Equivalent of gofish-gotree/stories/gallery/Sunburst.stories.tsx —
GoTree / Gallery / sunburst.

Concentric filled wedges. Under polar(): x = theta, y = r. parentChild =
(nest theta, distribute r) -- parent wedge spans its children's combined
angular extent (nest, pad 0) and sits on the ring just inside the child
group (distribute r, edge mode, spacing = ring thickness). sibling =
(distribute theta, align r) -- siblings tile the parent's arc and share one
ring.

Wedge node (theta auto-fit): leaves carry a unit thetaSize weight that the
coord sums and fits to the budget; internal nodes leave theta unsized so nest
grows them to their children's combined arc. dsl Node:circle, but the
reference (and a real sunburst) is filled arc wedges -- rendered as rect
wedges, matching the JS story.
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


# Balanced binary tree, 4 levels deep -> 16 leaves.
DEEP_BALANCED_TREE = _make_balanced(4)

_DEPTH_BLUES = ["#08306b", "#2171b5", "#6baed6", "#c6dbef", "#deebf7"]

_BAND_HEIGHT = 42  # radial thickness of one ring


def _by_depth(d):
    return _DEPTH_BLUES[min(d["depth"], len(_DEPTH_BLUES) - 1)]


def _node(d):
    if d["height"] == 0:
        return rect(
            thetaSize=datum(1),
            h=_BAND_HEIGHT,
            emX=True,
            emY=True,
            fill=_by_depth(d),
            stroke="white",
            strokeWidth=1.5,
        )
    return rect(
        h=_BAND_HEIGHT,
        emX=True,
        emY=True,
        fill=_by_depth(d),
        stroke="white",
        strokeWidth=1.5,
    )


def story_sunburst():
    return (
        tree(
            DEEP_BALANCED_TREE,
            node=_node,
            link="none",
            parent_child=combine(
                # theta: parent wedge encloses its subtree's arc (pad 0 -> exact tiling).
                x={"kind": "nest", "pad": 0},
                # r: parent inner ring, child group one ring out.
                y={"kind": "distribute", "spacing": _BAND_HEIGHT, "anchor": "edge"},
            ),
            sibling=combine(
                # theta: siblings tile their parent's arc (edge mode sums theta-widths).
                x={"kind": "distribute", "spacing": 0, "anchor": "edge"},
                # r: siblings share the same ring.
                y={"kind": "align", "alignment": "middle"},
            ),
            coord=polar(),
        ),
        {"w": 540, "h": 540},
    )
