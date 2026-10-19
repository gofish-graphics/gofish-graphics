"""Equivalent of gofish-gotree/stories/gallery/Iptp.stories.tsx."""

from gofish import rect
from gofish.gotree import combine, tree
from python_stories.gotree_data import SAMPLE_TREE, by_depth


def node(d):
    return rect(w=16, h=90, fill=by_depth()(d))


def story_iptp():
    return (
        tree(
            SAMPLE_TREE,
            node=node,
            link="none",
            parent_child=combine(
                x={"kind": "distribute", "spacing": 6},
                y={"kind": "distribute", "spacing": 6},
            ),
            sibling=combine(
                x={"kind": "distribute", "spacing": 6},
                y={"kind": "align", "alignment": "start"},
            ),
        ),
        {"w": 640, "h": 420},
    )
