"""Equivalent of gofish-gotree/stories/gallery/TyreTree.stories.tsx."""

from gofish import Coord, datum, rect
from gofish.gotree import combine, tree
from python_stories.gotree_data import by_depth


# Balanced binary tree, 3 levels deep.
def make(depth, prefix="root"):
    if depth == 0:
        return {"name": prefix}
    return {
        "name": prefix,
        "children": [make(depth - 1, prefix + "L"), make(depth - 1, prefix + "R")],
    }


SAMPLE_TREE = make(3)

TYRE_BLUES = ["#08306b", "#2171b5", "#6baed6", "#c6dbef", "#deebf7"]

BAND = 56  # radial thickness of one inclusion band


# A node's ring is as thick as the levels below it, so every ring starts at
# the hub and the rings overlap like tyre treads.
def node(d):
    if d["height"] == 0:
        return rect(
            w=datum(1),
            em_x=True,
            h=(d["height"] + 1) * BAND,
            em_y=True,
            fill=by_depth(TYRE_BLUES)(d),
            stroke="white",
            stroke_width=2,
        )
    return rect(
        em_x=True,
        h=(d["height"] + 1) * BAND,
        em_y=True,
        fill=by_depth(TYRE_BLUES)(d),
        stroke="white",
        stroke_width=2,
    )


def story_tyre_tree():
    return (
        tree(
            SAMPLE_TREE,
            node=node,
            link="none",
            parent_child=combine(
                x={"kind": "nest", "pad": 0},
                y={"kind": "align", "alignment": "start"},
            ),
            sibling=combine(
                x={"kind": "distribute", "spacing": 0},
                y={"kind": "align", "alignment": "start"},
            ),
            coord=Coord.clock(inner_radius=0.25),
        ),
        {"w": 560, "h": 560},
    )
