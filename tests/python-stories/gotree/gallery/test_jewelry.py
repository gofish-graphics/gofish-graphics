"""Equivalent of gofish-gotree/stories/gallery/Jewelry.stories.tsx —
GoTree / Gallery / Jewelry.

Each parent CONTAINS its subtree horizontally (nest on X only) and is
centered on it vertically (align y); siblings string out left->right
(distribute x) sharing a vertical center (align y) — beads on a string.

NOTE (ported faithfully from the JS story, not fixed here): nest grows a
bbox, and a circle is sized by a single radius, so an internal "circle"
can't grow on X only. Internal nodes are therefore rects left UNSIZED on X
(fixed height) so the parent box wraps its subtree horizontally; leaves
stay circles sized by value. The light internal fill reads as the enclosing
"setting" around the darker leaf "stones".
"""

from gofish import circle, rect
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

# Darker-than-default ramp so deep leaves stay visible as "stones" against
# the light enclosing "settings" (the default blue ramp fades to near-white).
_STONE_BLUES = ["#08306b", "#08519c", "#2171b5", "#4292c6", "#6baed6"]


def _by_depth(d, range_=_STONE_BLUES):
    return range_[min(d["depth"], len(range_) - 1)]


def _node(d):
    if d["height"] == 0:
        v = d["value"] if d["value"] is not None else 1
        return circle(r=7 + v * 2, fill=_by_depth(d))
    return rect(h=30, rx=15, fill="#c6dbef", stroke="#6baed6", strokeWidth=1)


def story_jewelry():
    return (
        tree(
            SAMPLE_TREE,
            node=_node,
            link={"curve": "straight", "stroke": "#6baed6", "stroke_width": 2},
            parent_child=combine(
                x={"kind": "nest", "pad": 6},
                y={"kind": "align", "alignment": "middle"},
            ),
            sibling=combine(
                x={"kind": "distribute", "spacing": 4},
                y={"kind": "align", "alignment": "middle"},
            ),
        ),
        {"w": 640, "h": 420},
    )
