"""Equivalent of gofish-gotree/stories/gallery/IciclePlotPolar.stories.tsx."""

from gofish import Coord, datum, rect
from gofish.gotree import combine, tree
from python_stories.gotree_data import SAMPLE_TREE, by_depth

ICICLE_BLUES = ["#2171b5", "#6baed6", "#9ecae1", "#c6dbef", "#deebf7"]

BAND_HEIGHT = 46  # radial thickness of one depth ring


# Leaves carry a unit angular weight; internal nodes leave theta unsized so
# the nest grows them to their children's combined arc.
def node(d):
    if d["height"] == 0:
        return rect(
            w=datum(1),
            em_x=True,
            h=BAND_HEIGHT,
            em_y=True,
            fill=by_depth(ICICLE_BLUES)(d),
            stroke="white",
            stroke_width=2,
        )
    return rect(
        em_x=True,
        h=BAND_HEIGHT,
        em_y=True,
        fill=by_depth(ICICLE_BLUES)(d),
        stroke="white",
        stroke_width=2,
    )


def story_icicle_plot():
    return (
        tree(
            SAMPLE_TREE,
            node=node,
            link="none",
            parent_child=combine(
                x={"kind": "nest", "pad": 0},
                y={"kind": "distribute", "spacing": 0},
            ),
            sibling=combine(
                x={"kind": "distribute", "spacing": 0},
                y={"kind": "align", "alignment": "middle"},
            ),
            coord=Coord.polar(),
        ),
        {"w": 560, "h": 560},
    )
