"""Equivalent of gofish-gotree/stories/gallery/Cheops.stories.tsx."""

from gofish import rect
from gofish.gotree import combine, tree
from python_stories.gotree_data import SAMPLE_TREE, by_depth

ROW_H = 80
LEAF_W = 26


# TODO: needs a triangle mark for cheops.
def node(d):
    if d["height"] == 0:
        return rect(
            w=LEAF_W,
            h=ROW_H,
            fill=by_depth()(d),
            stroke="white",
            stroke_width=1,
        )
    return rect(h=ROW_H, fill=by_depth()(d), stroke="white", stroke_width=1)


def story_cheops():
    return (
        tree(
            SAMPLE_TREE,
            node=node,
            link="none",
            parent_child=combine(
                x={"kind": "nest", "pad": 0},
                y={"kind": "distribute", "spacing": 2},
            ),
            sibling=combine(
                x={"kind": "distribute", "spacing": -8},
                y={"kind": "align", "alignment": "start"},
            ),
        ),
        {"w": 640, "h": 420},
    )
