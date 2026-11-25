"""Equivalent of gofish-gotree/stories/gallery/DeepTree.stories.tsx."""

from gofish import Curve, circle
from gofish.gotree import combine, tree
from python_stories.gotree_data import by_depth

# The root's 19 children and how many leaves each has, read off the reference.
LEAF_COUNTS = [0, 2, 2, 0, 0, 2, 2, 0, 0, 0, 3, 4, 0, 4, 0, 4, 0, 0, 4]


def child(i, n):
    if n == 0:
        return {"name": f"c{i}"}
    return {"name": f"c{i}", "children": [{"name": f"c{i}-{j}"} for j in range(n)]}


DEEP_TREE = {
    "name": "root",
    "children": [child(i, n) for i, n in enumerate(LEAF_COUNTS)],
}

DEEP_BLUES = ["#2171b5", "#84aed8", "#deebf7"]


def node(d):
    return circle(r=8, fill=by_depth(DEEP_BLUES)(d), stroke="white", stroke_width=2)


# LinkWidth=depth: links out of the root are the thickest.
LINK_WIDTHS = [9, 6]


def story_deep_tree():
    return (
        tree(
            DEEP_TREE,
            node=node,
            link=lambda source, target: {
                "curve": Curve.bezier(),
                "stroke": "#606060",
                "stroke_width": LINK_WIDTHS[source["depth"]],
            },
            parent_child=combine(
                x={"kind": "nest", "pad": 0},
                y={"kind": "distribute", "spacing": 180},
            ),
            sibling=combine(
                x={"kind": "distribute", "spacing": 4},
                y={"kind": "align", "alignment": "start"},
            ),
        ),
        {},
    )
