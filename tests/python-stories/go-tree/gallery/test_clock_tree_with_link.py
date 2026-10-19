"""Equivalent of gofish-gotree/stories/gallery/ClockTreeWithLink.stories.tsx."""

from gofish import Coord, Curve, datum, rect
from gofish.gotree import combine, tree
from python_stories.gotree_data import by_depth


def branch(p, n):
    return [{"name": f"{p}{i}"} for i in range(n)]


CLOCK_DATA = {
    "name": "root",
    "children": [
        {"name": "a", "children": branch("a", 3)},
        {"name": "b", "children": branch("b", 2)},
        {"name": "c", "children": branch("c", 4)},
        {"name": "d", "children": branch("d", 1)},
        {"name": "e", "children": branch("e", 3)},
        {"name": "f", "children": branch("f", 2)},
        {"name": "g", "children": branch("g", 3)},
        {"name": "h", "children": branch("h", 2)},
    ],
}

BAND_HEIGHT = 60  # radial thickness of the ring band


def node(d):
    return rect(
        w=datum(1),
        h=BAND_HEIGHT,
        em_x=True,
        em_y=True,
        fill=by_depth()(d),
        stroke="white",
        stroke_width=1.5,
    )


def story_clock_tree_with_link():
    return (
        tree(
            CLOCK_DATA,
            node=node,
            link={"curve": Curve.linear(), "stroke": "#90a4ae", "stroke_width": 1},
            parent_child=combine(
                x={"kind": "distribute", "spacing": 0, "anchor": "edge"},
                y={"kind": "align", "alignment": "middle"},
            ),
            sibling=combine(
                x={"kind": "distribute", "spacing": 0, "anchor": "edge"},
                y={"kind": "align", "alignment": "middle"},
            ),
            coord=Coord.polar(inner_radius=0.79),
        ),
        {"w": 520, "h": 520},
    )
