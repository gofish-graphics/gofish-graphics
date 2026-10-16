"""Equivalent of gofish-gotree/stories/gallery/Jewelry.stories.tsx."""

from gofish import Curve, circle, rect
from gofish.gotree import combine, tree
from python_stories.gotree_data import SAMPLE_TREE, by_depth

STONE_BLUES = ["#08306b", "#08519c", "#2171b5", "#4292c6", "#6baed6"]


# Leaves are stones sized by value; internal nodes are pill-shaped settings
# whose width the nest grows to hold their children.
def node(d):
    if d["height"] == 0:
        value = d["data"].get("value")
        return circle(
            r=15 + (value if value is not None else 1) * 4,
            fill=by_depth(STONE_BLUES)(d),
        )
    return rect(h=63, rx=32, fill="#c6dbef", stroke="#6baed6", stroke_width=1)


def story_jewelry():
    return (
        tree(
            SAMPLE_TREE,
            node=node,
            link={"curve": Curve.linear(), "stroke": "#6baed6", "stroke_width": 2},
            parent_child=combine(
                x={"kind": "nest", "pad": 13},
                y={"kind": "align", "alignment": "middle"},
            ),
            sibling=combine(
                x={"kind": "distribute", "spacing": 8},
                y={"kind": "align", "alignment": "middle"},
            ),
        ),
        {"w": 640, "h": 420},
    )
