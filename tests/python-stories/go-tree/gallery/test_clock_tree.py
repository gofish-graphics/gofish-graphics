"""Equivalent of gofish-gotree/stories/gallery/ClockTree.stories.tsx."""

from gofish import Coord, datum, rect
from gofish.gotree import combine, tree
from python_stories.gotree_data import by_depth

CLOCK_TREE = {
    "name": "root",
    "children": [
        {"name": "A", "children": [{"name": "A1"}, {"name": "A2"}, {"name": "A3"}]},
        {
            "name": "B",
            "children": [
                {"name": "B1"},
                {
                    "name": "B2",
                    "children": [{"name": "B2a"}, {"name": "B2b"}, {"name": "B2c"}],
                },
                {"name": "B3"},
            ],
        },
        {"name": "C", "children": [{"name": "C1"}, {"name": "C2"}]},
        {
            "name": "D",
            "children": [
                {"name": "D1"},
                {"name": "D2", "children": [{"name": "D2a"}, {"name": "D2b"}]},
                {"name": "D3"},
                {"name": "D4"},
            ],
        },
        {"name": "E", "children": [{"name": "E1"}, {"name": "E2"}, {"name": "E3"}]},
    ],
}

BAND_UNIT = 26  # radial thickness unit; node height = (height + 1) * BAND_UNIT


def node(d):
    return rect(
        w=datum(1),
        h=(d["height"] + 1) * BAND_UNIT,
        em_x=True,
        em_y=True,
        fill=by_depth()(d),
        stroke="white",
        stroke_width=1.5,
    )


def story_clock_tree():
    return (
        tree(
            CLOCK_TREE,
            node=node,
            link="none",
            parent_child=combine(
                x={"kind": "distribute", "spacing": 0, "anchor": "edge"},
                y={"kind": "align", "alignment": "middle"},
            ),
            sibling=combine(
                x={"kind": "distribute", "spacing": 0, "anchor": "edge"},
                y={"kind": "align", "alignment": "middle"},
            ),
            coord=Coord.clock(inner_radius=0.72),
        ),
        {"w": 540, "h": 540},
    )
