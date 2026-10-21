"""Equivalent of gofish-gotree/stories/gallery/TornadoTree2.stories.tsx."""

from gofish import Coord, rect
from gofish.gotree import combine, tree
from python_stories.gotree_data import SAMPLE_TREE, by_depth

LEAF_THETA = 0.12  # angular width of a node (radians)
LEAF_R = 89  # radial thickness of a leaf (px in r)


# Internal nodes leave r unsized so the r nest grows them over their subtree.
def node(d):
    if d["height"] == 0:
        return rect(
            w=LEAF_THETA,
            h=LEAF_R,
            em_x=True,
            em_y=True,
            fill=by_depth()(d),
            stroke="white",
            stroke_width=1,
        )
    return rect(
        w=LEAF_THETA,
        em_x=True,
        em_y=True,
        fill=by_depth()(d),
        stroke="white",
        stroke_width=1,
    )


def story_tornado_tree2():
    return (
        tree(
            SAMPLE_TREE,
            node=node,
            link="none",
            parent_child=combine(
                x={"kind": "distribute", "spacing": 0.5, "anchor": "middle"},
                y={"kind": "nest", "pad": 38},
            ),
            sibling=combine(
                x={"kind": "distribute", "spacing": 0.32, "anchor": "middle"},
                y={"kind": "distribute", "spacing": 76, "anchor": "middle"},
            ),
            coord=Coord.clock(),
        ),
        {"w": 560, "h": 560},
    )
