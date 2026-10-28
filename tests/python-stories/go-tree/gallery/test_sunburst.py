"""Equivalent of gofish-gotree/stories/gallery/Sunburst.stories.tsx."""

from gofish import Coord, datum, rect
from gofish.gotree import combine, tree
from python_stories.gotree_data import by_depth


# Balanced binary tree, 4 levels deep -> 16 leaves, so wedge widths divide the
# disc evenly (each internal node has exactly 2 children).
def make(depth, prefix=""):
    if depth == 0:
        return {"name": prefix}
    return {
        "name": prefix or "root",
        "children": [make(depth - 1, prefix + "L"), make(depth - 1, prefix + "R")],
    }


DEEP_BALANCED_TREE = make(4)

BAND_HEIGHT = 42  # radial thickness of one ring


# Wedge node: leaves carry a unit angular weight (`w`, the theta extent) that
# the coord sums and fits to the budget; internal nodes leave theta unsized so
# nest grows them to their children's combined arc. em_x/em_y make theta sweep
# an arc and r the ring thickness.
def node(d):
    if d["height"] == 0:
        return rect(
            w=datum(1),
            h=BAND_HEIGHT,
            em_x=True,
            em_y=True,
            fill=by_depth()(d),
            stroke="white",
            stroke_width=1.5,
        )
    return rect(
        h=BAND_HEIGHT,
        em_x=True,
        em_y=True,
        fill=by_depth()(d),
        stroke="white",
        stroke_width=1.5,
    )


def story_sunburst():
    return (
        tree(
            DEEP_BALANCED_TREE,
            node=node,
            link="none",
            parent_child=combine(
                # theta: parent wedge encloses its subtree's arc (pad 0 -> exact tiling).
                x={"kind": "nest", "pad": 0},
                # r: parent inner ring, child group one ring out.
                y={"kind": "distribute", "spacing": BAND_HEIGHT, "anchor": "edge"},
            ),
            sibling=combine(
                # theta: siblings tile their parent's arc (edge mode sums theta-widths).
                x={"kind": "distribute", "spacing": 0, "anchor": "edge"},
                # r: siblings share the same ring.
                y={"kind": "align", "alignment": "middle"},
            ),
            coord=Coord.clock(),
        ),
        {},
    )
