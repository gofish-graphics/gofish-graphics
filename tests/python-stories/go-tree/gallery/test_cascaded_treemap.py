"""Equivalent of gofish-gotree/stories/gallery/CascadedTreemap.stories.tsx."""

from gofish import rect
from gofish.gotree import alternate, combine, tree
from python_stories.gotree_data import SAMPLE_TREE, by_depth


# Leaves are squares sized by value; internal nodes are unsized, so the nest
# grows each parent to wrap its children.
def node(d):
    if d["height"] == 0:
        return rect(
            w=41 + d["data"]["value"] * 23,
            h=41 + d["data"]["value"] * 23,
            fill=by_depth()(d),
            stroke="#08306b",
            stroke_width=1,
        )
    return rect(fill=by_depth()(d), stroke="#08306b", stroke_width=1)


P = 14  # small nest pad -> visible cascade inset border per level
G = 18  # sibling spacing

dice = combine(
    x={"kind": "distribute", "spacing": G},
    y={"kind": "align", "alignment": "middle"},
)
slice_ = combine(
    x={"kind": "align", "alignment": "middle"},
    y={"kind": "distribute", "spacing": G},
)


def story_cascaded_treemap():
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
        {},
    )
