"""Equivalent of gofish-gotree/stories/gallery/HTreeLayout.stories.tsx —
GoTree / Gallery / HTreeLayout (the recursive H-tree fractal).

GoTree builds this (gallery dsl0) by ALTERNATING two templates by depth:
  dsl2 HorizontalLinearLayout: X.Subtree flatten / Y.Subtree align  -> spread x
  dsl1 VerticalLinearLayout:   X.Subtree align   / Y.Subtree flatten -> spread y
Both keep Root `within` on both axes -> parent centered inside its
child-group.

gofish-gotree's depth-aware combiner `alternate([A, B])` resolves at each
node's depth, so the SIBLING spread axis swaps every level -- exactly what
the H-fractal needs. parentChild stays a constant (parent centered on both
axes); only the sibling spread axis alternates H <-> V. Mapping rules:
within -> align(middle); flatten/juxtapose -> distribute.
"""

from gofish import circle
from gofish.gotree import alternate, combine, tree

# Circle nodes, colored by depth (dark root -> light leaves), static size
# 14 (r = 7), matching the dsl Element block.
_DEPTH_BLUES = ["#08306b", "#2171b5", "#6baed6", "#c6dbef", "#deebf7"]


def _by_depth(d):
    return _DEPTH_BLUES[min(d["depth"], len(_DEPTH_BLUES) - 1)]


def _node(d):
    return circle(r=7, fill=_by_depth(d))


# A deep balanced binary tree so the fractal has enough levels to read as
# an H-tree (the reference uses a deep balanced tree).
def _make_balanced(depth, prefix="r"):
    if depth == 0:
        return {"name": prefix}
    return {
        "name": prefix,
        "children": [
            _make_balanced(depth - 1, prefix + "L"),
            _make_balanced(depth - 1, prefix + "R"),
        ],
    }


BALANCED_TREE = _make_balanced(4)

# Sibling spacing: the alternating axes need different reach so the
# squares nest cleanly (classic H-tree halves the segment length each
# level, but a fixed spacing already reads as the recursive H).
_S = 64

# Even depths spread siblings horizontally, odd depths vertically -- the
# H <-> V swap that draws the H-tree.
_H = combine(
    x={"kind": "distribute", "spacing": _S},
    y={"kind": "align", "alignment": "middle"},
)
_V = combine(
    x={"kind": "align", "alignment": "middle"},
    y={"kind": "distribute", "spacing": _S},
)


def story_htree_layout():
    return (
        tree(
            BALANCED_TREE,
            node=_node,
            link={"curve": "straight", "stroke": "#90a4ae", "stroke_width": 2},
            # Parent centered inside its child-group on BOTH axes (Root
            # `within`).
            parent_child=combine(
                x={"kind": "align", "alignment": "middle"},
                y={"kind": "align", "alignment": "middle"},
            ),
            # Sibling spread axis alternates by depth -> the recursive
            # H-fractal.
            sibling=alternate([_H, _V]),
        ),
        {"w": 720, "h": 560},
    )
