"""Equivalent of gofish-gotree/stories/gallery/IciclePlotPolar.stories.tsx —
GoTree / Gallery / icicleplot.

A POLAR icicle plot: concentric wedge bands. Under polar(): x = theta,
y = r. parentChild = (nest theta, distribute r) -- parent spans its
children's angular extent (nest theta) and sits one ring in from the child
group (distribute r, edge mode). sibling = (distribute theta, align r) --
siblings pack angularly and share the same ring. This is the same point in
combine({x,y}) space as the Sunburst template, just an icicle framing.

dsl Node="circle" but the reference renders filled wedges, so each node is a
polar wedge (rect swept through theta), matching the JS story. Leaves carry a
unit theta-size weight (auto-fit via nest summing up the tree); internal
nodes leave theta unsized.
"""

from gofish import polar, rect, datum
from gofish.gotree import combine, tree

# Same sample tree as gofish-gotree/stories/data.ts::sampleTree.
SAMPLE_TREE = {
    "name": "root",
    "children": [
        {
            "name": "A",
            "children": [
                {"name": "A1", "value": 4},
                {"name": "A2", "value": 2},
                {"name": "A3", "value": 3},
            ],
        },
        {
            "name": "B",
            "children": [
                {"name": "B1", "value": 5},
                {
                    "name": "B2",
                    "children": [
                        {"name": "B2a", "value": 2},
                        {"name": "B2b", "value": 1},
                    ],
                },
            ],
        },
        {
            "name": "C",
            "children": [
                {"name": "C1", "value": 3},
                {"name": "C2", "value": 2},
            ],
        },
    ],
}

# Sequential blue ramp matching the dsl ColorRange (#2171b5 dark -> #deebf7
# light), dark at the root, lightening outward by depth.
_ICICLE_BLUES = ["#2171b5", "#6baed6", "#9ecae1", "#c6dbef", "#deebf7"]

_BAND_HEIGHT = 46  # radial thickness of one depth ring


def _by_depth(d):
    return _ICICLE_BLUES[min(d["depth"], len(_ICICLE_BLUES) - 1)]


def _node(d):
    if d["height"] == 0:
        return rect(
            thetaSize=datum(1),
            emX=True,
            h=_BAND_HEIGHT,
            emY=True,
            fill=_by_depth(d),
            stroke="white",
            strokeWidth=2,
        )
    return rect(
        emX=True,
        h=_BAND_HEIGHT,
        emY=True,
        fill=_by_depth(d),
        stroke="white",
        strokeWidth=2,
    )


def story_icicle_plot():
    return (
        tree(
            SAMPLE_TREE,
            node=_node,
            link="none",
            # parentChild: distribute r (juxtapose -> adjacent rings, parent
            # inner -> children outward) + align theta middle (parent centered
            # over its subtree; the embedded width already gives it the
            # subtree's full angular span).
            parent_child=combine(
                x={"kind": "nest", "pad": 0},
                y={"kind": "distribute", "spacing": 0},
            ),
            # sibling: distribute theta (flatten -> pack around the circle) +
            # align r middle (siblings share one ring).
            sibling=combine(
                x={"kind": "distribute", "spacing": 0},
                y={"kind": "align", "alignment": "middle"},
            ),
            coord=polar(),
        ),
        {"w": 560, "h": 560},
    )
