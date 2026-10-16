"""Equivalent of gofish-gotree/stories/gallery/TreemapOval.stories.tsx."""

from gofish import ellipse
from gofish.gotree import alternate, combine, tree
from python_stories.gotree_data import SAMPLE_TREE, by_depth


# Leaves are circles sized by value; internal nodes are unsized, so the nest
# grows each parent ellipse to wrap its children.
def node(d):
    if d["height"] == 0:
        return ellipse(
            w=37 + d["data"]["value"] * 24,
            h=37 + d["data"]["value"] * 24,
            fill=by_depth()(d),
        )
    return ellipse(fill=by_depth()(d), stroke="#08306b", stroke_width=1)


P = 17
G = 14

dice = combine(
    x={"kind": "align", "alignment": "middle"},
    y={"kind": "distribute", "spacing": G},
)
slice_ = combine(
    x={"kind": "distribute", "spacing": G},
    y={"kind": "align", "alignment": "middle"},
)


def story_treemap_oval():
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
