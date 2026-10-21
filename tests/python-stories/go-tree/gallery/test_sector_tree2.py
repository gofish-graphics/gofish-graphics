"""Equivalent of gofish-gotree/stories/gallery/SectorTree2.stories.tsx."""

from gofish import Coord, datum, rect
from gofish.gotree import combine, tree
from python_stories.gotree_data import by_depth


# Balanced binary tree, 4 levels deep.
def make(depth, prefix=""):
    if depth == 0:
        return {"name": prefix}
    return {
        "name": prefix or "root",
        "children": [make(depth - 1, prefix + "L"), make(depth - 1, prefix + "R")],
    }


DEEP_BALANCED_TREE = make(4)

BAND_HEIGHT = 42  # radial thickness of one ring


# Leaves carry a unit angular weight; internal nodes leave theta unsized so
# the nest grows them to their children's combined arc.
def node(d):
    if d["height"] == 0:
        return rect(
            w=datum(1),
            h=BAND_HEIGHT,
            em_x=True,
            em_y=True,
            fill=by_depth()(d),
            stroke="white",
            stroke_width=2,
        )
    return rect(
        h=BAND_HEIGHT,
        em_x=True,
        em_y=True,
        fill=by_depth()(d),
        stroke="white",
        stroke_width=2,
    )


def story_sector_tree2():
    return (
        tree(
            DEEP_BALANCED_TREE,
            node=node,
            link="none",
            parent_child=combine(
                x={"kind": "nest", "pad": 0},
                y={"kind": "distribute", "spacing": BAND_HEIGHT, "anchor": "edge"},
            ),
            sibling=combine(
                x={"kind": "distribute", "spacing": 0, "anchor": "edge"},
                y={"kind": "align", "alignment": "middle"},
            ),
            coord=Coord.clock(),
        ),
        {"w": 540, "h": 540},
    )
