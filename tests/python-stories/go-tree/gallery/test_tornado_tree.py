"""Equivalent of gofish-gotree/stories/gallery/TornadoTree.stories.tsx."""

from gofish import Coord, Spacing, rect
from gofish.gotree import combine, tree
from python_stories.gotree_data import SAMPLE_TREE, by_depth

TH = 0.13  # fixed angular width per node (radians, via em_x): thin slivers
LEAF_H = 59  # leaf radial thickness (r units)


# Internal nodes leave r unsized so the r nest grows them over their subtree.
def node(d):
    if d["height"] == 0:
        return rect(
            w=TH,
            h=LEAF_H,
            em_x=True,
            fill=by_depth()(d),
            stroke="white",
            stroke_width=1,
        )
    return rect(
        w=TH,
        em_x=True,
        fill=by_depth()(d),
        stroke="white",
        stroke_width=1,
    )


def story_tornado_tree():
    return (
        tree(
            SAMPLE_TREE,
            node=node,
            link="none",
            parent_child=combine(
                x={"kind": "distribute", "spacing": Spacing.pitch(0.55, at="middle")},
                y={"kind": "nest", "pad": 44},
            ),
            sibling=combine(
                x={"kind": "distribute", "spacing": Spacing.pitch(0.42, at="middle")},
                y={"kind": "distribute", "spacing": Spacing.pitch(44, at="middle")},
            ),
            coord=Coord.clock(),
        ),
        {},
    )
