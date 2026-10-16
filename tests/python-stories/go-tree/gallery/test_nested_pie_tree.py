"""Equivalent of gofish-gotree/stories/gallery/NestedPieTree.stories.tsx."""

from gofish import rect
from gofish.gotree import alternate, combine, tree
from python_stories.gotree_data import SAMPLE_TREE, by_depth


# Leaves are sized by value; internal nodes are unsized, so the nest grows
# each parent to wrap its children.
def node(d):
    if d["height"] == 0:
        value = d["data"].get("value")
        return rect(
            w=92,
            h=(value if value is not None else d["width"]) * 37,
            fill=by_depth()(d),
        )
    return rect(fill=by_depth()(d), stroke="#08306b", stroke_width=1)


P = 14  # nest padding (Root include pad)
G = 18  # sibling distribute spacing (Subtree flatten margin)

dice = combine(
    x={"kind": "align", "alignment": "middle"},
    y={"kind": "distribute", "spacing": G},
)
slice_ = combine(
    x={"kind": "distribute", "spacing": G},
    y={"kind": "align", "alignment": "middle"},
)


def story_nested_pie_tree():
    return (
        tree(
            SAMPLE_TREE,
            node=node,
            link="none",
            parent_child=combine(
                x={"kind": "nest", "pad": P},
                y={"kind": "nest", "pad": P},
            ),
            sibling=alternate([slice_, dice]),
        ),
        {"w": 640, "h": 420},
    )
