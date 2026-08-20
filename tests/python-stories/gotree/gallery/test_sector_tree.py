"""Equivalent of gofish-gotree/stories/gallery/SectorTree.stories.tsx —
GoTree / Gallery / SectorTree.

Concentric rings of thin sector wedges. Under polar(): x = theta, y = r.
sibling = (distribute theta, align r): siblings pack angularly into their
parent's arc and share one radial ring. parentChild diverges from the dsl's
literal Y.Root = within/align (which would collapse the tree to one ring):
the reference's concentric rings come from GoTree's RootHeight:rdepth
encoding, which polar() cannot express, so distribute-r (parent inner ring,
child group one ring out) is used instead -- the same divergence the JS
story documents, ported verbatim (not "fixed" further).

Wedge node (theta auto-fit): leaves carry a unit angular weight; internal
nodes leave theta unsized so nest-theta grows each to its children's combined
arc.
"""

from gofish import polar, rect, datum
from gofish.gotree import combine, tree

_SECTOR_BLUES = [
    "#eff6fb",
    "#d6e7f3",
    "#b6d4ea",
    "#8fbfe0",
    "#6aa8d6",
    "#4a90c8",
    "#2f78b8",
]


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


# Balanced binary tree, 6 levels deep -> 64 leaves.
DEEP_BALANCED_TREE = _make_balanced(6)

_RING_THICKNESS = 3  # thin radial band (approximates StaticThickness 2)
_RING_GAP = 13  # radial gap between consecutive rings


def _by_depth(d):
    return _SECTOR_BLUES[min(d["depth"], len(_SECTOR_BLUES) - 1)]


def _node(d):
    if d["height"] == 0:
        return rect(
            thetaSize=datum(1),
            h=_RING_THICKNESS,
            emX=True,
            emY=True,
            fill=_by_depth(d),
            stroke="#2f78b8",
            strokeWidth=0.75,
        )
    return rect(
        h=_RING_THICKNESS,
        emX=True,
        emY=True,
        fill=_by_depth(d),
        stroke="#2f78b8",
        strokeWidth=0.75,
    )


def story_sector_tree():
    return (
        tree(
            DEEP_BALANCED_TREE,
            node=_node,
            link="none",
            # parentChild: nest theta (include -> parent's arc spans its
            # children's; nest grows the unsized parent theta) + distribute r
            # (parent inner ring -> child group one ring out, gap = RING_GAP).
            parent_child=combine(
                x={"kind": "nest", "pad": 0},
                y={"kind": "distribute", "spacing": _RING_GAP, "anchor": "edge"},
            ),
            # sibling: distribute theta (pack angularly into the parent's arc)
            # + align r middle (siblings share one ring).
            sibling=combine(
                x={"kind": "distribute", "spacing": 0, "anchor": "edge"},
                y={"kind": "align", "alignment": "middle"},
            ),
            coord=polar(),
        ),
        {"w": 560, "h": 560},
    )
