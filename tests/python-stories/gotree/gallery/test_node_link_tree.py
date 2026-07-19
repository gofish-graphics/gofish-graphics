"""Equivalent of gofish-gotree/stories/gallery/NodeLinkTree.stories.tsx —
GoTree / Gallery / NodeLinkTree (classic top-down node-link diagram).

dsl: node=circle, link=straight, color=depth, mode=bottom-up.
  X.Root within   / X.Subtree flatten (margin 0.3w)
  Y.Root juxtapose (margin 0.2) / Y.Subtree align (alignment top)
Mapping (include->nest, juxtapose/flatten->distribute, within/align->align):
  parentChild = combine({ x: align middle (parent centered over subtree),
                          y: distribute (parent stacked above its subtree) })
                 on y puts the root at the TOP (y-up).
  sibling     = combine({ x: distribute (siblings laid out flat side-by-side),
                          y: align start (siblings share a baseline/row) })
"""

from gofish import circle
from gofish.gotree import combine, tree

# A uniform-depth tree (root -> many depth-1 nodes -> leaves), matching the
# reference's clean two-tier topology. Some depth-1 nodes are childless
# and sit on the same row as their siblings; the rest fan out to a few
# leaves.


def _leaves(n, p):
    return [{"name": f"{p}{i}"} for i in range(n)]


NODE_LINK_DATA = {
    "name": "root",
    "children": [
        {"name": "a", "children": _leaves(3, "a")},
        {"name": "b", "children": _leaves(2, "b")},
        {"name": "c"},
        {"name": "d", "children": _leaves(2, "d")},
        {"name": "e", "children": _leaves(2, "e")},
        {"name": "f"},
        {"name": "g"},
        {"name": "h", "children": _leaves(4, "h")},
        {"name": "i", "children": _leaves(4, "i")},
        {"name": "j"},
        {"name": "k", "children": _leaves(4, "k")},
        {"name": "l"},
        {"name": "m", "children": _leaves(4, "m")},
        {"name": "n", "children": _leaves(3, "n")},
    ],
}

_DEPTH_BLUES = ["#08306b", "#2171b5", "#6baed6", "#c6dbef", "#deebf7"]


def _by_depth(d):
    return _DEPTH_BLUES[min(d["depth"], len(_DEPTH_BLUES) - 1)]


# Circle nodes, colored by depth (dark root -> light leaves).
def _node(d):
    return circle(r=9, fill=_by_depth(d), stroke="#08306b", strokeWidth=1)


def story_node_link_tree():
    return (
        tree(
            NODE_LINK_DATA,
            node=_node,
            # straight links -> linear interpolation.
            link={"curve": "straight", "stroke": "#555", "stroke_width": 1.5},
            parent_child=combine(
                x={"kind": "align", "alignment": "middle"},
                y={"kind": "distribute", "spacing": 90},
            ),
            sibling=combine(
                x={"kind": "distribute", "spacing": 24},
                # Align siblings to the TOP of their bands so every
                # depth-1 node (even childless ones) sits on one row. In
                # y-down free space the top is the near edge -> "start";
                # otherwise a childless node bottom-aligns down to the
                # leaf row. See issue #143/#16.
                y={"kind": "align", "alignment": "start"},
            ),
        ),
        {"w": 900, "h": 560},
    )
