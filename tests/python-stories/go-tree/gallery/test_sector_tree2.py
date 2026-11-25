"""Equivalent of gofish-gotree/stories/gallery/SectorTree2.stories.tsx."""

import math

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


# A node's angular slot, in leaf slots: a parent is as long as its child group.
def slots(d):
    return 1 if d["height"] == 0 else 2 ** (d["height"] - 1)


# Leaves carry a unit radial weight; internal nodes leave r unsized so the
# nest grows them to their children's span.
def node(d):
    if d["height"] == 0:
        return rect(
            w=datum(slots(d)),
            h=datum(1),
            fill=by_depth()(d),
            stroke="white",
            stroke_width=2,
        )
    return rect(
        w=datum(slots(d)),
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
            # PolarAxis x-axis: the layout's X relations go on r (y here) and
            # its Y relations on theta (x here).
            parent_child=combine(
                # theta: the child group in the next angular slot.
                x={"kind": "distribute", "spacing": 0},
                # r: the parent spans its children's radial range.
                y={"kind": "nest", "pad": 0},
            ),
            sibling=combine(
                # theta: siblings start on the same angle.
                x={"kind": "align", "alignment": "start"},
                # r: they split the radius outward.
                y={"kind": "distribute", "spacing": 0},
            ),
            coord=Coord.polar(baseline_angle=math.pi / 2),
        ),
        {"w": 540, "h": 540},
    )
