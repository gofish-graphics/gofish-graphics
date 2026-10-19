"""Equivalent of gofish-gotree/stories/gallery/HVDrawing.stories.tsx."""

from gofish import Curve, circle
from gofish.gotree import alternate, combine, tree
from python_stories.gotree_data import SAMPLE_TREE, by_depth


def node(d):
    return circle(r=16, fill=by_depth()(d), stroke="#08306b", stroke_width=1)


S = 78
H = combine(
    x={"kind": "distribute", "spacing": S},
    y={"kind": "align", "alignment": "middle"},
)
V = combine(
    x={"kind": "align", "alignment": "middle"},
    y={"kind": "distribute", "spacing": S},
)


def story_hvdrawing():
    return (
        tree(
            SAMPLE_TREE,
            node=node,
            link={"curve": Curve.linear(), "stroke": "#90a4ae", "stroke_width": 1.5},
            parent_child=alternate([H, V]),
            sibling=alternate([H, V]),
        ),
        {"w": 640, "h": 420},
    )
