"""Equivalent of gofish-gotree/stories/gallery/TreemapSlice.stories.tsx —
GoTree / Gallery / treemap-slice.

A slice-and-dice treemap. `parent_child` nests on BOTH axes (parent box
contains its subtree on both axes, so every level is a slice within its
parent). `sibling` distributes on x and aligns middle on y — siblings are
sliced side by side along x and centered vertically. Leaves are sized in x
by their datum value and given a fixed height; internal nodes are UNSIZED
on both axes (the nest constraint grows each parent box to wrap its sliced
subtree).
"""

from gofish import rect
from gofish.gotree import combine, tree

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

# Blue depth ramp matching the gotree ColorRange (dark root -> light leaves).
_SLICES = ["#2171b5", "#4292c6", "#6baed6", "#9ecae1", "#c6dbef", "#deebf7"]


def _by_depth(d, range_=_SLICES):
    return range_[min(d["depth"], len(range_) - 1)]


_LEAF_HEIGHT = 320  # adaptive height -> fixed pixel height per leaf
_VALUE_SCALE = 30  # leaf width = datum value * scale (slice by value)


# rectangle nodes, colored by depth, white slice borders. Leaves are sized
# by data (width = value, fixed height); internal/parent rects are left
# UNSIZED on both axes so each nest grows the box to wrap its sliced subtree.
def _node(d):
    if d["height"] == 0:
        v = d["value"] if d["value"] is not None else d["width"]
        return rect(w=v * _VALUE_SCALE, h=_LEAF_HEIGHT, fill=_by_depth(d), stroke="white", strokeWidth=4)
    return rect(fill=_by_depth(d), stroke="white", strokeWidth=4)


def story_treemap_slice():
    return (
        tree(
            SAMPLE_TREE,
            node=_node,
            link="none",
            parent_child=combine(
                x={"kind": "nest", "pad": 6},
                y={"kind": "nest", "pad": 22},
            ),
            sibling=combine(
                x={"kind": "distribute", "spacing": 14},
                y={"kind": "align", "alignment": "middle"},
            ),
        ),
        {"w": 900, "h": 360},
    )
