"""Equivalent of gofish-gotree/stories/gallery/ElasticHierarchy.stories.tsx —
GoTree / Gallery / ElasticHierarchy.

Each parent box ENCLOSES its subtree on both axes (nest); the larger Y pad
leaves a "header" band of empty space above/below the contained children,
while siblings sit side-by-side in a row (distribute x, aligned middle on
y). Leaves are sized by datum (value); internal/parent rects are UNSIZED on
both axes (the nest axes) so each box grows to wrap its subtree.
"""

from gofish import rect
from gofish.gotree import combine, tree

SAMPLE_TREE = {
    "name": "root",
    "children": [
        {
            "name": "A",
            "children": [
                {"name": "A1", "value": 4},
                {"name": "A2", "value": 2},
                {"name": "A3", "value": 3},
            ],
        },
        {
            "name": "B",
            "children": [
                {"name": "B1", "value": 5},
                {
                    "name": "B2",
                    "children": [
                        {"name": "B2a", "value": 2},
                        {"name": "B2b", "value": 1},
                    ],
                },
            ],
        },
        {
            "name": "C",
            "children": [
                {"name": "C1", "value": 3},
                {"name": "C2", "value": 2},
            ],
        },
    ],
}

_DEPTH_BLUES = ["#08306b", "#2171b5", "#6baed6", "#c6dbef", "#deebf7"]


def _by_depth(d):
    return _DEPTH_BLUES[min(d["depth"], len(_DEPTH_BLUES) - 1)]


# rectangle nodes, colored by depth. Leaves carry the size (height scaled by
# `value`); internal nodes are left unsized on both axes so nest grows the
# parent box to inner.intrinsicDims + 2*pad.
def _node(d):
    if d["height"] == 0:
        v = d["value"] if d["value"] is not None else 1
        return rect(w=26, h=24 + v * 12, fill=_by_depth(d), stroke="#08306b", strokeWidth=1)
    return rect(fill=_by_depth(d), stroke="#08306b", strokeWidth=1.5)


def story_elastic_hierarchy():
    return (
        tree(
            SAMPLE_TREE,
            node=_node,
            link="none",
            # include on both axes -> nest. Larger y pad makes the parent
            # "header" band of empty space; small x pad hugs the subtree
            # horizontally.
            parent_child=combine(
                x={"kind": "nest", "pad": 8},
                y={"kind": "nest", "pad": 22},
            ),
            # flatten x -> distribute (margin -> spacing); align y -> align middle.
            sibling=combine(
                x={"kind": "distribute", "spacing": 8},
                y={"kind": "align", "alignment": "middle"},
            ),
        ),
        {"w": 640, "h": 420},
    )
