"""Equivalent of gofish-gotree/stories/gallery/IndentedTree.stories.tsx —
GoTree / Gallery / IndentedTree.

The classic indented / outline tree: every node is a row, children stack
directly below their parent (distribute y) and every node shares the same
left edge (align x "start"). There is no indentation — depth is instead
encoded via bar width (RootWidth = "rdepth": widest at the root, narrowest
at the leaves) plus color = depth.
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


# sampleTree's deepest path is root -> B -> B2 -> B2b, so maxDepth = 3.
# "rdepth" => bar width grows toward the root (widest) and shrinks toward the
# leaves (narrowest), approximated with a depth-based linear width.
_MAX_DEPTH = 3


def _node(d):
    return rect(w=16 + (_MAX_DEPTH - d["depth"]) * 26, h=16, fill=_by_depth(d))


_LAYOUT = combine(
    x={"kind": "align", "alignment": "start"},
    y={"kind": "distribute", "spacing": 4},
)


def story_indented_tree():
    return (
        tree(
            SAMPLE_TREE,
            node=_node,
            # gotree link = "none" -> no connectors in the indented/outline layout.
            link="none",
            parent_child=_LAYOUT,
            sibling=_LAYOUT,
        ),
        {"w": 640, "h": 420},
    )
