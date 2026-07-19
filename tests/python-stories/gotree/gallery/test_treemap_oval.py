"""Equivalent of gofish-gotree/stories/gallery/TreemapOval.stories.tsx —
GoTree / Gallery / TreemapOval.

A treemap with ELLIPSE nodes instead of rectangles: nested ovals. Both axes
nest so each parent oval grows to wrap its subtree's bounding box. Leaves
are sized by their datum value. `alternate([dice, slice])` swaps the
subdivision slice<->dice at every level — a rounder, more 2D-filled nesting
than a single stretched template.

NOTE (ported faithfully from the JS story, not fixed here): because nest
sizes a bounding box, an ellipse wrapping children overflows visually at
its corners — expected for oval treemaps, per the JS story's own comment.
"""

from gofish import ellipse
from gofish.gotree import alternate, combine, tree

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


# ellipse nodes, colored by depth. Internal nodes are left UNSIZED on both x
# and y (the nest axes) so each parent oval grows to wrap its subtree;
# leaves are sized by their datum value (area-ish ramp).
def _node(d):
    if d["height"] == 0:
        return ellipse(w=22 + d["value"] * 14, h=22 + d["value"] * 14, fill=_by_depth(d))
    return ellipse(fill=_by_depth(d), stroke="#08306b", strokeWidth=1)


_P = 10
_G = 8
# dice: siblings stack vertically (spread y), share an x-center.
_DICE = combine(
    x={"kind": "align", "alignment": "middle"},
    y={"kind": "distribute", "spacing": _G},
)
# slice: siblings spread horizontally (spread x), share a y-center.
_SLICE = combine(
    x={"kind": "distribute", "spacing": _G},
    y={"kind": "align", "alignment": "middle"},
)


def story_treemap_oval():
    return (
        tree(
            SAMPLE_TREE,
            node=_node,
            link="none",
            # Both axes nest so each parent oval wraps its subtree's bbox.
            parent_child=combine(
                x={"kind": "nest", "pad": _P},
                y={"kind": "nest", "pad": _P},
            ),
            # Subdivision alternates slice<->dice every level (depth-indexed).
            sibling=alternate([_SLICE, _DICE]),
        ),
        {"w": 640, "h": 420},
    )
