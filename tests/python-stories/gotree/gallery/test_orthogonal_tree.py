"""Equivalent of gofish-gotree/stories/gallery/OrthogonalTree.stories.tsx —
GoTree / Gallery / OrthogonalTree.

Every relationship distributes on BOTH axes: a parent sits up-left of its
subtree and each sibling steps further down-right, so the whole tree
cascades along a diagonal — the classic orthogonal node-link "staircase"
grid. Links use the `orthogonal` route: right-angle elbows bending at the
parent<->child midpoint (GoTree's orthogonal link, `ue`).

Node color depends on hierarchy depth (`byDepth` in the JS story's shared
`data.ts`), not on a field of the tree data itself — that can't be expressed
as a channel accessor over the node's own row, so it's ported as a whole
`node=` callable (mark-fn) rather than a static mark template with
field-accessor channels. See `_node` below.
"""

from gofish import circle
from gofish.gotree import combine, tree

# Same sample tree as gofish-gotree/stories/data.ts::sampleTree (the leaf
# `value`s are unused by this story, but kept for byte-parity with the
# shared fixture).
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

# Sequential blue ramp, dark at the root -> light at the leaves — same as
# data.ts::depthBlues.
_DEPTH_BLUES = ["#08306b", "#2171b5", "#6baed6", "#c6dbef", "#deebf7"]


def _by_depth(d):
    return _DEPTH_BLUES[min(d["depth"], len(_DEPTH_BLUES) - 1)]


def _node(d):
    return circle(r=7, fill=_by_depth(d), stroke="#08306b", strokeWidth=1)


def story_orthogonal_tree():
    return (
        tree(
            SAMPLE_TREE,
            node=_node,
            link={"curve": "orthogonal", "stroke": "#90a4ae", "stroke_width": 1.5},
            # parent up-left of its subtree: distribute x forward (parent at
            # low x = left), distribute y forward too (matches the JS story's
            # combine() call — GoFish's y-down default puts the parent at
            # low y = top of screen).
            parent_child=combine(
                x={"kind": "distribute", "spacing": 18},
                y={"kind": "distribute", "spacing": 18},
            ),
            # siblings step down-right: each later sibling further right (x
            # forward) and lower (y forward) -> the diagonal cascade.
            sibling=combine(
                x={"kind": "distribute", "spacing": 18},
                y={"kind": "distribute", "spacing": 18},
            ),
        ),
        {"w": 640, "h": 420},
    )
