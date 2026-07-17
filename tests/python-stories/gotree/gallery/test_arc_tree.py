"""Equivalent of gofish-gotree/stories/gallery/ArcTree.stories.tsx —
GoTree / Gallery / arc-tree.

dsl: X.Root juxtapose / X.Subtree flatten ; Y.Root within / Y.Subtree align.
  parentChild = (distribute x, align y)   sibling = (distribute x, align y)
Every node -- parent or sibling -- is distributed along x and aligned to a
shared y baseline, so the whole tree collapses onto a single horizontal
line. The hierarchy then shows only through the (arc) links connecting each
node to its relatives.

Links use the `arc` route -- GoTree's `arccurve` (ArcDirection "top"): each
link is a semicircle through the two nodes, center at their midpoint,
radius half the chord, so siblings stack as nested semicircular arcs.

Node color depends on hierarchy depth, not a field of the tree data itself,
so it's ported as a whole `node=` callable rather than a static mark
template with field-accessor channels (same reasoning as the orthogonal-tree
port).
"""

from gofish import circle
from gofish.gotree import combine, tree

# Same sample tree as gofish-gotree/stories/data.ts::sampleTree.
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
    return circle(r=6, fill=_by_depth(d), stroke="#08306b", strokeWidth=1)


def story_arc_tree():
    return (
        tree(
            SAMPLE_TREE,
            node=_node,
            link={"curve": "arc", "stroke": "#90a4ae", "stroke_width": 1.5},
            parent_child=combine(
                x={"kind": "distribute", "spacing": 14},
                y={"kind": "align", "alignment": "middle"},
            ),
            sibling=combine(
                x={"kind": "distribute", "spacing": 14},
                y={"kind": "align", "alignment": "middle"},
            ),
        ),
        {"w": 640, "h": 420},
    )
