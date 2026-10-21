"""Equivalent of gofish-gotree/stories/gallery/HierarchicalSectorChart.stories.tsx."""

from gofish import Coord, datum, rect
from gofish.gotree import combine, tree
from python_stories.gotree_data import by_depth

SECTOR_RAMP = ["#DE4006", "#E87B11", "#EFD648"]

SECTOR_TREE = {
    "name": "root",
    "children": [
        {"name": "A", "children": [{"name": "A1"}, {"name": "A2"}, {"name": "A3"}]},
        {"name": "B", "children": [{"name": "B1"}, {"name": "B2"}]},
        {
            "name": "C",
            "children": [
                {"name": "C1"},
                {"name": "C2"},
                {"name": "C3"},
                {"name": "C4"},
            ],
        },
        {"name": "D", "children": [{"name": "D1"}, {"name": "D2"}]},
        {"name": "E", "children": [{"name": "E1"}, {"name": "E2"}, {"name": "E3"}]},
    ],
}

BAND_HEIGHT = 90  # radial thickness of one ring


# Leaves carry a unit angular weight; internal nodes leave theta unsized so
# the nest grows them to their children's combined arc.
def node(d):
    if d["height"] == 0:
        return rect(
            w=datum(1),
            h=BAND_HEIGHT,
            em_x=True,
            em_y=True,
            fill=by_depth(SECTOR_RAMP)(d),
            stroke="white",
            stroke_width=1.5,
        )
    return rect(
        h=BAND_HEIGHT,
        em_x=True,
        em_y=True,
        fill=by_depth(SECTOR_RAMP)(d),
        stroke="white",
        stroke_width=1.5,
    )


def story_hierarchical_sector_chart():
    return (
        tree(
            SECTOR_TREE,
            node=node,
            link="none",
            parent_child=combine(
                x={"kind": "nest", "pad": 0},
                y={"kind": "distribute", "spacing": 0, "anchor": "edge"},
            ),
            sibling=combine(
                x={"kind": "distribute", "spacing": 0, "anchor": "edge"},
                y={"kind": "align", "alignment": "middle"},
            ),
            coord=Coord.clock(),
        ),
        {"w": 560, "h": 560},
    )
