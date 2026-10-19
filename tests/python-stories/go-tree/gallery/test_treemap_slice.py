"""Equivalent of gofish-gotree/stories/gallery/TreemapSlice.stories.tsx."""

from gofish import rect
from gofish.gotree import combine, tree
from python_stories.gotree_data import SAMPLE_TREE, by_depth

SLICES = [
    "#2171b5",
    "#4292c6",
    "#6baed6",
    "#9ecae1",
    "#c6dbef",
    "#deebf7",
]

LEAF_HEIGHT = 320  # adaptive height -> fixed pixel height per leaf
VALUE_SCALE = 30  # leaf width = value * scale (slice by value)


# Leaves are sized by value; internal nodes are unsized, so the nest grows
# each parent to wrap its children.
def node(d):
    if d["height"] == 0:
        value = d["data"].get("value")
        return rect(
            w=(value if value is not None else d["width"]) * VALUE_SCALE,
            h=LEAF_HEIGHT,
            fill=by_depth(SLICES)(d),
            stroke="white",
            stroke_width=4,
        )
    return rect(fill=by_depth(SLICES)(d), stroke="white", stroke_width=4)


def story_treemap_slice():
    return (
        tree(
            SAMPLE_TREE,
            node=node,
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
