"""Equivalent of gofish-gotree/stories/gallery/GardenLayout.stories.tsx —
GoTree / Gallery / GardenLayout (the "ReadableTreeLayout" subtree).

dsl: Mode bottom-up ; node=circle, color=class, link=orthogonal.
  X.Root within / X.Subtree flatten ; Y.Root juxtapose / Y.Subtree align.
Mapped (include->nest, juxtapose/flatten->distribute, within/align->align):
  parentChild = combine({ x: align(middle, "within"), y: distribute("juxtapose") })
  sibling     = combine({ x: distribute("flatten"),    y: align(middle, "align") })
-> parent sits centered above its child row (x align), separated
  vertically (y distribute); siblings spread horizontally in a single row
  (x distribute) on a shared baseline (y align). Structurally a classic
  node-link tree.

TODO (carried from the JS story): needs orthogonal links implemented --
GoTree's spec asks for "orthogonal" (elbow) links, but the JS story itself
falls back to `{curve: "straight"}` -- ported faithfully as such here.
"""

from gofish import circle
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


def _node(d):
    return circle(r=10, fill=_by_depth(d), stroke="#08306b", strokeWidth=1)


def story_garden_layout():
    return (
        tree(
            SAMPLE_TREE,
            node=_node,
            link={"curve": "straight", "stroke": "#90a4ae", "stroke_width": 1.5},
            parent_child=combine(
                x={"kind": "align", "alignment": "middle"},
                y={"kind": "distribute", "spacing": 48},
            ),
            sibling=combine(
                x={"kind": "distribute", "spacing": 24},
                y={"kind": "align", "alignment": "middle"},
            ),
        ),
        {"w": 640, "h": 420},
    )
