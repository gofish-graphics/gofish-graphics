"""Equivalent of gofish-gotree/stories/gallery/SectorTree2.stories.tsx —
GoTree / Gallery / SectorTree2.

Concentric filled sector/wedge rings. Under polar(): x = theta, y = r.
parentChild = (nest theta, distribute r) -- parent wedge spans its children's
arc (nest, pad 0), sitting one ring in from the child group (distribute r,
edge mode, spacing = ring thickness). sibling = (distribute theta, align r)
-- siblings tile the parent's arc and share one ring. Identical axis
decomposition to the gallery Sunburst.

The JS story's PolarAxis:x-axis / PolarCenter:right (a right-centered
half-disc orientation) is NOT expressible -- polar() has no transposed
variant and no polar-space anchor -- so this renders a full upright disc,
per the JS story's own note. Ported verbatim.
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
            strokeWidth=2,
        )
    return rect(
        h=_BAND_HEIGHT,
        emX=True,
        emY=True,
        fill=_by_depth(d),
        stroke="white",
        strokeWidth=2,
    )


def story_sector_tree2():
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
