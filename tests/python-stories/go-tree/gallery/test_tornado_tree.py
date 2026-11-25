"""Equivalent of gofish-gotree/stories/gallery/TornadoTree.stories.tsx."""

from gofish import Coord, datum, rect
from gofish.gotree import combine, tree
from python_stories.gotree_data import SAMPLE_TREE, by_depth


# Leaves carry a unit theta weight; internal nodes leave theta to the nest.
# Every node is one radial unit thick.
def node(d):
    if d["height"] == 0:
        return rect(w=datum(1), h=datum(1), fill=by_depth()(d))
    return rect(h=datum(1), fill=by_depth()(d))


def story_tornado_tree():
    return (
        tree(
            SAMPLE_TREE,
            node=node,
            link="none",
            # PolarAxis x-axis: the layout's X relations go on r (y here) and
            # its Y relations on theta (x here).
            parent_child=combine(
                # theta: the parent's arc spans its subtree's (Root include).
                x={"kind": "nest", "pad": 0},
                # r: the child group, then the parent outside it (bottom-up).
                y={"kind": "distribute", "spacing": 4, "order": "reverse"},
            ),
            sibling=combine(
                # theta: siblings follow one another around the angle.
                x={"kind": "distribute", "spacing": 0},
                # r: and outward.
                y={"kind": "distribute", "spacing": 4},
            ),
            coord=Coord.clock(),
        ),
        {"w": 540, "h": 540},
    )
