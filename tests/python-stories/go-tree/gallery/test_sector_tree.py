"""Equivalent of gofish-gotree/stories/gallery/SectorTree.stories.tsx."""

from gofish import Coord, datum, rect
from gofish.gotree import combine, tree
from python_stories.gotree_data import by_depth

SECTOR_BLUES = [
    "#eff6fb",
    "#d6e7f3",
    "#b6d4ea",
    "#8fbfe0",
    "#6aa8d6",
    "#4a90c8",
    "#2f78b8",
]


# Balanced binary tree, 6 levels deep.
def make(depth, prefix=""):
    if depth == 0:
        return {"name": prefix}
    return {
        "name": prefix or "root",
        "children": [make(depth - 1, prefix + "L"), make(depth - 1, prefix + "R")],
    }


DEEP_BALANCED_TREE = make(6)

RING_THICKNESS = 3  # thin radial band (approximates StaticThickness 2)
RING_GAP = 13  # radial gap between consecutive rings


# Leaves carry a unit angular weight; internal nodes leave theta unsized so
# the nest grows them to their children's combined arc.
def node(d):
    if d["height"] == 0:
        return rect(
            w=datum(1),
            h=RING_THICKNESS,
            em_x=True,
            em_y=True,
            fill=by_depth(SECTOR_BLUES)(d),
            stroke="#2f78b8",
            stroke_width=0.75,
        )
    return rect(
        h=RING_THICKNESS,
        em_x=True,
        em_y=True,
        fill=by_depth(SECTOR_BLUES)(d),
        stroke="#2f78b8",
        stroke_width=0.75,
    )


def story_sector_tree():
    return (
        tree(
            DEEP_BALANCED_TREE,
            node=node,
            link="none",
            parent_child=combine(
                x={"kind": "nest", "pad": 0},
                y={"kind": "distribute", "spacing": RING_GAP, "anchor": "edge"},
            ),
            sibling=combine(
                x={"kind": "distribute", "spacing": 0, "anchor": "edge"},
                y={"kind": "align", "alignment": "middle"},
            ),
            coord=Coord.polar(),
        ),
        {"w": 560, "h": 560},
    )
