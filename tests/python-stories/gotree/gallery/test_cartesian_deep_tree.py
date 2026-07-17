"""Equivalent of gofish-gotree/stories/gallery/CartesianDeepTree.stories.tsx —
GoTree / Gallery / cartesian-deep-tree.

dsl: node=circle, color=depth, link=curve, mode=top-down, StaticSize 6.
  X.Root include / X.Subtree flatten ; Y.Root juxtapose(0r) / Y.Subtree align(bottom).
Mapped (include->nest, juxtapose/flatten->distribute, align->align):
  parentChild = combine({ x: nest (parent spans/centers over its subtree),
                          y: distribute (level stacked vertically) })
  sibling     = combine({ x: distribute (siblings spread horizontally),
                          y: align "start" (Alignment "bottom" -> low y in y-up) })
nest is on X ONLY: the parent is centered horizontally over the whole
subtree span while levels stack on Y. distribute order is "reverse", so the
parent (child 0 of [parent, group]) lands at LOW y = bottom and leaves climb
upward -- matching the reference png (dark root at the bottom center, light
leaves on top).

COMPROMISES (noted, no hacks):
 - Nodes are fixed-size circles. A circle can't be "unsized" on the nest
   axis, so nest-x doesn't grow the parent -- it just CENTERS the parent
   circle over its subtree span. This matches the reference (all nodes are
   equal-size dots).
 - Links: the dsl asks for "curve" links with depth-driven width. We use
   the `bezier`-equivalent `straight` route mapping from the JS story
   (which itself notes depth-driven LinkWidth is still a TODO); ported
   faithfully as `{"curve": "straight"}` per the JS story's actual call.
"""

from gofish import circle
from gofish.gotree import combine, tree

# A deep balanced binary tree (4 levels, 16 leaves) — the "deep" in the
# title. Same recursive construction as the JS story's `deepTree`.


def _make_deep(depth, prefix):
    if depth == 0:
        return {"name": prefix}
    return {
        "name": prefix,
        "children": [
            _make_deep(depth - 1, prefix + "a"),
            _make_deep(depth - 1, prefix + "b"),
        ],
    }


DEEP_TREE = _make_deep(4, "r")

_DEPTH_BLUES = ["#08306b", "#2171b5", "#6baed6", "#c6dbef", "#deebf7"]


def _by_depth(d):
    return _DEPTH_BLUES[min(d["depth"], len(_DEPTH_BLUES) - 1)]


# circle nodes, depth-colored (StaticSize 6 -> r 6).
def _node(d):
    return circle(r=6, fill=_by_depth(d), stroke="#08306b", strokeWidth=1)


def story_cartesian_deep_tree():
    return (
        tree(
            DEEP_TREE,
            node=_node,
            link={"curve": "straight", "stroke": "#5f6b7a", "stroke_width": 1.5},
            parent_child=combine(
                x={"kind": "nest", "pad": 0},
                # order "reverse" puts the parent at HIGH y = the bottom in
                # y-down free space, so the root sits at the bottom and
                # leaves climb upward (matching the reference). See issue
                # #143/#16.
                y={"kind": "distribute", "spacing": 80, "order": "reverse"},
            ),
            sibling=combine(
                x={"kind": "distribute", "spacing": 22},
                y={"kind": "align", "alignment": "start"},
            ),
        ),
        {"w": 900, "h": 520},
    )
