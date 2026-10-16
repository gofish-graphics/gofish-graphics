"""Equivalent of gofish-gotree/stories/gallery/IndentedTree.stories.tsx."""

from gofish import rect
from gofish.gotree import combine, tree
from python_stories.gotree_data import SAMPLE_TREE, by_depth

MAX_DEPTH = 3


# Deeper rows are narrower, so their shared start edge reads as an indent.
def node(d):
    return rect(w=26 + (MAX_DEPTH - d["depth"]) * 43, h=26, fill=by_depth()(d))


layout = combine(
    x={"kind": "align", "alignment": "start"},
    y={"kind": "distribute", "spacing": 7},
)


def story_indented_tree():
    return (
        tree(
            SAMPLE_TREE,
            node=node,
            link="none",
            parent_child=layout,
            sibling=layout,
        ),
        {"w": 640, "h": 420},
    )
