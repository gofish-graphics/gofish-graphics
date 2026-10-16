"""Equivalent of gofish-gotree/stories/gallery/Dendrogram.stories.tsx."""

from gofish import Curve, rect
from gofish.gotree import combine, tree
from python_stories.gotree_data import by_depth


# A multi-level tree so the bracketing reads clearly.
def sub(p, n):
    return [{"name": f"{p}{i}"} for i in range(n)]


DENDRO_DATA = {
    "name": "root",
    "children": [
        {
            "name": "A",
            "children": [
                {"name": "A0", "children": sub("A0", 3)},
                {"name": "A1", "children": sub("A1", 2)},
            ],
        },
        {
            "name": "B",
            "children": [
                {"name": "B0", "children": sub("B0", 2)},
                {"name": "B1", "children": sub("B1", 3)},
                {"name": "B2", "children": sub("B2", 2)},
            ],
        },
        {
            "name": "C",
            "children": [
                {"name": "C0", "children": sub("C0", 3)},
                {"name": "C1", "children": sub("C1", 2)},
            ],
        },
    ],
}


# Hidden node: a zero-area transparent rect that still gives the link
# endpoints something to anchor to. Internal nodes are unsized on x (the nest
# axis) so the parent box grows to span its subtree.
def node(d):
    if d["height"] == 0:
        return rect(w=1, h=1, fill="transparent", stroke_width=0)
    return rect(h=1, fill="transparent", stroke_width=0)


def story_dendrogram():
    return (
        tree(
            DENDRO_DATA,
            node=node,
            # Each link colored by its target node's depth.
            link=lambda src, tgt: {
                "curve": Curve.linear(),
                "stroke": by_depth()(tgt),
                "stroke_width": 1.5,
            },
            parent_child=combine(
                x={"kind": "nest", "pad": 0},
                y={"kind": "distribute", "spacing": 154},
            ),
            sibling=combine(
                x={"kind": "distribute", "spacing": 48},
                # "bottom" alignment: siblings share their start edge.
                y={"kind": "align", "alignment": "start"},
            ),
        ),
        {"w": 900, "h": 520},
    )
