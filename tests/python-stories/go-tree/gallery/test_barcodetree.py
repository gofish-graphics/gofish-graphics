"""Equivalent of gofish-gotree/stories/gallery/BarcodeTree.stories.tsx."""

from gofish import rect
from gofish.gotree import combine, tree
from python_stories.gotree_data import SAMPLE_TREE, by_depth

GRAYS = ["#070707", "#3b3e41", "#6c6f72", "#929598", "#b6b9bc"]


# Leaves are tall fixed bars; internal nodes leave their height unset so the
# y nest grows them to wrap their subtree.
def node(d):
    if d["height"] == 0:
        return rect(w=12, h=80, fill=by_depth(GRAYS)(d))
    return rect(w=12, fill=by_depth(GRAYS)(d))


def story_barcode_tree():
    return (
        tree(
            SAMPLE_TREE,
            node=node,
            link="none",
            parent_child=combine(
                x={"kind": "distribute", "spacing": 4},
                y={"kind": "nest", "pad": 6},
            ),
            sibling=combine(
                x={"kind": "distribute", "spacing": 4},
                y={"kind": "align", "alignment": "middle"},
            ),
        ),
        {"w": 640, "h": 420},
    )
