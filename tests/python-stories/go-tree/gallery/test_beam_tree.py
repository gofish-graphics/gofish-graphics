"""Equivalent of gofish-gotree/stories/gallery/BeamTree.stories.tsx."""

from gofish import rect
from gofish.gotree import alternate, combine, tree
from python_stories.gotree_data import SAMPLE_TREE, by_depth

LEAF_W = 14  # px per unit of value
LEAF_H = 200  # fixed beam height


# Leaves are beams sized by value; internal nodes are unsized, so the nest
# grows each parent box to wrap its subtree.
def node(d):
    if d["height"] == 0:
        value = d["data"].get("value")
        return rect(
            w=LEAF_W * (value if value is not None else d["width"]),
            h=LEAF_H,
            fill=by_depth()(d),
        )
    return rect(fill=by_depth()(d))


G = 8  # sibling gap
P = 6  # nest padding (parent box wraps its subtree on both axes)

parent_child = combine(
    x={"kind": "nest", "pad": P},
    y={"kind": "nest", "pad": P},
)
spread_x = combine(
    x={"kind": "distribute", "spacing": G},
    y={"kind": "align", "alignment": "middle"},
)
spread_y = combine(
    x={"kind": "align", "alignment": "middle"},
    y={"kind": "distribute", "spacing": G},
)
sibling = alternate([spread_x, spread_y])


def story_beam_tree():
    return (
        tree(
            SAMPLE_TREE,
            node=node,
            link="none",
            parent_child=parent_child,
            sibling=sibling,
        ),
        {"w": 640, "h": 420},
    )
