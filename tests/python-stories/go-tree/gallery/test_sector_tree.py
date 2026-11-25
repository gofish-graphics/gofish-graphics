"""Equivalent of gofish-gotree/stories/gallery/SectorTree.stories.tsx."""

from gofish import Coord, datum, rect
from gofish.gotree import combine, tree
from python_stories.gotree_data import by_depth

# Light (leaves) -> blue (root), the reference's ramp.
SECTOR_BLUES = ["#2171b5", "#84aed8", "#deebf7"]


def branch(p, n):
    return [{"name": f"{p}{i}"} for i in range(n)]


# A three-level tree with uneven fan-out, like the reference.
SECTOR_TREE = {
    "name": "root",
    "children": [
        {"name": "a", "children": branch("a", 3)},
        {"name": "b"},
        {"name": "c", "children": branch("c", 4)},
        {"name": "d", "children": branch("d", 2)},
        {"name": "e"},
        {"name": "f", "children": branch("f", 3)},
        {"name": "g", "children": branch("g", 1)},
        {"name": "h", "children": branch("h", 4)},
    ],
}
LEVELS = 3  # root + 2 levels


# Thin arc: theta extent = reverse depth, r extent = one unit.
def node(d):
    return rect(
        w=datum(LEVELS - d["depth"]),
        h=datum(1),
        fill=by_depth(SECTOR_BLUES)(d),
        stroke="white",
        stroke_width=1,
    )


def story_sector_tree():
    return (
        tree(
            SECTOR_TREE,
            node=node,
            link="none",
            # PolarAxis x-axis: the layout's X relations go on r (y here) and
            # its Y relations on theta (x here).
            parent_child=combine(
                # theta: the child group centered within the parent's arc.
                x={"kind": "align", "alignment": "middle"},
                # r: the child group, then the parent outside it (bottom-up).
                y={"kind": "distribute", "spacing": 0, "order": "reverse"},
            ),
            sibling=combine(
                # theta: centered on the same angle.
                x={"kind": "align", "alignment": "middle"},
                # r: one after another outward.
                y={"kind": "distribute", "spacing": 0},
            ),
            coord=Coord.clock(),
        ),
        {"w": 540, "h": 540},
    )
