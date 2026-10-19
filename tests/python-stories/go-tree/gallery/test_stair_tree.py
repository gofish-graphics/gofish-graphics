"""Equivalent of gofish-gotree/stories/gallery/StairTree.stories.tsx."""

from gofish import rect
from gofish.gotree import combine, tree
from python_stories.gotree_data import SAMPLE_TREE, by_depth


# Internal nodes leave their height unset so the y nest grows them to wrap
# their subtree.
def node(d):
    if d["height"] == 0:
        return rect(w=34, h=18, fill=by_depth()(d))
    return rect(w=34, fill=by_depth()(d), stroke="#08306b", stroke_width=1)


def story_stair_tree():
    return (
        tree(
            SAMPLE_TREE,
            node=node,
            link="none",
            parent_child=combine(
                x={"kind": "distribute", "spacing": 6},
                y={"kind": "nest", "pad": 6},
            ),
            sibling=combine(
                x={"kind": "distribute", "spacing": 6},
                y={"kind": "distribute", "spacing": 6},
            ),
        ),
        {"w": 640, "h": 420},
    )
