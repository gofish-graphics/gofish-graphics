"""Equivalent of gofish-gotree/stories/gallery/ElasticHierarchy.stories.tsx."""

from gofish import rect
from gofish.gotree import combine, tree
from python_stories.gotree_data import SAMPLE_TREE, by_depth


# Leaves are sized by value; internal nodes are unsized, so the nest grows
# each parent box to wrap its children.
def node(d):
    if d["height"] == 0:
        value = d["data"].get("value")
        return rect(
            w=46,
            h=42 + (value if value is not None else 1) * 21,
            fill=by_depth()(d),
            stroke="#08306b",
            stroke_width=1,
        )
    return rect(fill=by_depth()(d), stroke="#08306b", stroke_width=1.5)


def story_elastic_hierarchy():
    return (
        tree(
            SAMPLE_TREE,
            node=node,
            link="none",
            parent_child=combine(
                x={"kind": "nest", "pad": 14},
                y={"kind": "nest", "pad": 38},
            ),
            sibling=combine(
                x={"kind": "distribute", "spacing": 14},
                y={"kind": "align", "alignment": "middle"},
            ),
        ),
        {"w": 640, "h": 420},
    )
