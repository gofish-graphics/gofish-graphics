"""Equivalent of gofish-gotree/stories/gallery/NodeLinkTree.stories.tsx."""

from gofish import Curve, circle
from gofish.gotree import combine, tree
from python_stories.gotree_data import by_depth


# A uniform-depth tree (root -> many depth-1 nodes -> leaves), matching the
# reference's clean two-tier topology. Some depth-1 nodes are childless and
# sit on the same row as their siblings; the rest fan out to a few leaves.
def leaves(n, p):
    return [{"name": f"{p}{i}"} for i in range(n)]


NODE_LINK_DATA = {
    "name": "root",
    "children": [
        {"name": "a", "children": leaves(3, "a")},
        {"name": "b", "children": leaves(2, "b")},
        {"name": "c"},
        {"name": "d", "children": leaves(2, "d")},
        {"name": "e", "children": leaves(2, "e")},
        {"name": "f"},
        {"name": "g"},
        {"name": "h", "children": leaves(4, "h")},
        {"name": "i", "children": leaves(4, "i")},
        {"name": "j"},
        {"name": "k", "children": leaves(4, "k")},
        {"name": "l"},
        {"name": "m", "children": leaves(4, "m")},
        {"name": "n", "children": leaves(3, "n")},
    ],
}


# Circle nodes, colored by depth (dark root -> light leaves).
def node(d):
    return circle(r=9, fill=by_depth()(d), stroke="#08306b", stroke_width=1)


def story_node_link_tree():
    return (
        tree(
            NODE_LINK_DATA,
            node=node,
            # straight links -> linear interpolation.
            link={"curve": Curve.linear(), "stroke": "#555", "stroke_width": 1.5},
            parent_child=combine(
                x={"kind": "align", "alignment": "middle"},
                y={"kind": "distribute", "spacing": 90},
            ),
            sibling=combine(
                x={"kind": "distribute", "spacing": 24},
                # Align siblings to the top of their bands so every depth-1
                # node (even childless ones) sits on one row. In y-down free
                # space the top is the near edge -> "start"; otherwise a
                # childless node bottom-aligns down to the leaf row.
                y={"kind": "align", "alignment": "start"},
            ),
        ),
        {"w": 900, "h": 560},
    )
