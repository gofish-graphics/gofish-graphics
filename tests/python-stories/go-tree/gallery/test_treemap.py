"""Equivalent of gofish-gotree/stories/gallery/Treemap.stories.tsx."""

from gofish import rect
from gofish.gotree import alternate, combine, tree
from python_stories.gotree_data import SAMPLE_TREE, by_depth


# Leaves are sized by value; internal nodes are unsized, so the nest grows
# each parent to wrap its children.
def node(d):
    if d["height"] == 0:
        return rect(w=92, h=14 * d["data"]["value"], fill=by_depth()(d))
    return rect(fill=by_depth()(d), stroke="#08306b", stroke_width=1)


P = 9  # parent -> subtree pad (small, constant)
G = 9  # sibling spacing

dice = combine(
    x={"kind": "distribute", "spacing": G},
    y={"kind": "align", "alignment": "middle"},
)
slice_ = combine(
    x={"kind": "align", "alignment": "middle"},
    y={"kind": "distribute", "spacing": G},
)


def story_treemap():
    return (
        tree(
            SAMPLE_TREE,
            node=node,
            link="none",
            parent_child=combine(
                x={"kind": "nest", "pad": P},
                y={"kind": "nest", "pad": P},
            ),
            sibling=alternate([dice, slice_]),
        ),
        {"w": 640, "h": 420},
    )
