"""Equivalent of gofish-gotree/stories/gallery/WeaveTree.stories.tsx —
GoTree / Gallery / WeaveTree.

dsl: X.Root juxtapose(margin 0) / X.Subtree flatten(margin 0.15) ;
     Y.Root within(top) / Y.Subtree flatten ; mode bottom-up.
  parentChild = (distribute x, align y top)   sibling = (distribute x, distribute y)
Mapping: juxtapose/flatten->distribute, within->align, "top"->high y in
y-up->"end".
Each parent sits left of its subtree (distribute x) and aligns to its
subtree's top edge (align y "end"); siblings spread on BOTH axes
(distribute x and y) so every sibling steps diagonally -- the woven,
braided look.

TODO (carried from the JS story): needs curve links implemented -- dsl
Link is "curve" but the gotree LinkSpec only supports interpolation
linear/bezier/orthogonal/arc, so this falls back to {curve: "straight"},
matching the JS story.
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
    return circle(r=6, fill=_by_depth(d))


def story_weave_tree():
    return (
        tree(
            SAMPLE_TREE,
            node=_node,
            # TODO: needs curve links implemented
            link={"curve": "straight", "stroke": "#666", "stroke_width": 1},
            parent_child=combine(
                x={"kind": "distribute", "spacing": 8},
                y={"kind": "align", "alignment": "end"},
            ),
            sibling=combine(
                x={"kind": "distribute", "spacing": 12},
                y={"kind": "distribute", "spacing": 12},
            ),
        ),
        {"w": 640, "h": 420},
    )
