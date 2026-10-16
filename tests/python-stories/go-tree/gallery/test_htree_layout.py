"""Equivalent of gofish-gotree/stories/gallery/HTreeLayout.stories.tsx."""

from gofish import Curve, circle
from gofish.gotree import alternate, combine, tree
from python_stories.gotree_data import by_depth


def node(d):
    return circle(r=15, fill=by_depth()(d))


# A balanced binary tree, 4 levels deep.
def make(depth, prefix="r"):
    if depth == 0:
        return {"name": prefix}
    return {
        "name": prefix,
        "children": [make(depth - 1, prefix + "L"), make(depth - 1, prefix + "R")],
    }


BALANCED_TREE = make(4)

S = 140
H = combine(
    x={"kind": "distribute", "spacing": S},
    y={"kind": "align", "alignment": "middle"},
)
V = combine(
    x={"kind": "align", "alignment": "middle"},
    y={"kind": "distribute", "spacing": S},
)


def story_htree_layout():
    return (
        tree(
            BALANCED_TREE,
            node=node,
            link={"curve": Curve.linear(), "stroke": "#90a4ae", "stroke_width": 2},
            parent_child=combine(
                x={"kind": "align", "alignment": "middle"},
                y={"kind": "align", "alignment": "middle"},
            ),
            sibling=alternate([H, V]),
        ),
        {"w": 720, "h": 560},
    )
