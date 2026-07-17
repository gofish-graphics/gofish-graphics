"""Equivalent of gofish-gotree/stories/gallery/ClockTree.stories.tsx —
GoTree / Gallery / ClockTree.

Nodes arranged around a clock-face ring. Under polar(): x = theta (radians
0..2pi), y = r (radius). Both parentChild and sibling distribute on theta and
align on r -- i.e. every node (parents and children alike) gets its own
angular slot, and they all share one radial band (the bottom-up "flatten").

Wedge node: thetaSize is a unit angular WEIGHT (every node an equal slot).
The coord is the sigma-scale-root: it sums the weights and fits them to the
angular budget, so the ring closes exactly with no hand-set 2*pi/N. emX/emY
make theta sweep an arc and r a radial band. Height grows with reverse-depth
(d["height"]): the root is the tallest wedge, leaves the shortest.

See the JS story for the full fidelity-gap notes (no angular auto-fit across
the nested distribute layers, no bottom-up root-alignment, no polar theta/r
axis swap) -- ported verbatim, not re-derived.
"""

from gofish import polar, rect, datum
from gofish.gotree import combine, tree

# Same tree as the JS story's local `clockTree` (a moderately bushy tree so
# the rim is densely populated).
CLOCK_TREE = {
    "name": "root",
    "children": [
        {
            "name": "A",
            "children": [{"name": "A1"}, {"name": "A2"}, {"name": "A3"}],
        },
        {
            "name": "B",
            "children": [
                {"name": "B1"},
                {
                    "name": "B2",
                    "children": [
                        {"name": "B2a"},
                        {"name": "B2b"},
                        {"name": "B2c"},
                    ],
                },
                {"name": "B3"},
            ],
        },
        {"name": "C", "children": [{"name": "C1"}, {"name": "C2"}]},
        {
            "name": "D",
            "children": [
                {"name": "D1"},
                {
                    "name": "D2",
                    "children": [{"name": "D2a"}, {"name": "D2b"}],
                },
                {"name": "D3"},
                {"name": "D4"},
            ],
        },
        {
            "name": "E",
            "children": [{"name": "E1"}, {"name": "E2"}, {"name": "E3"}],
        },
    ],
}

# Sequential blue ramp, dark at the root -> light at the leaves.
_DEPTH_BLUES = ["#08306b", "#2171b5", "#6baed6", "#c6dbef", "#deebf7"]

_BAND_UNIT = 26  # radial thickness unit; node height = (rdepth+1)*bandUnit


def _by_depth(d):
    return _DEPTH_BLUES[min(d["depth"], len(_DEPTH_BLUES) - 1)]


def _node(d):
    return rect(
        thetaSize=datum(1),
        h=(d["height"] + 1) * _BAND_UNIT,
        emX=True,
        emY=True,
        fill=_by_depth(d),
        stroke="white",
        strokeWidth=1.5,
    )


def story_clock_tree():
    return (
        tree(
            CLOCK_TREE,
            node=_node,
            link="none",
            parent_child=combine(
                # theta: parent and its child-group take adjacent angular slots.
                x={"kind": "distribute", "spacing": 0, "anchor": "edge"},
                # r: parent and group share the radial band.
                y={"kind": "align", "alignment": "middle"},
            ),
            sibling=combine(
                # theta: siblings tile angularly (edge mode sums theta-widths).
                x={"kind": "distribute", "spacing": 0, "anchor": "edge"},
                # r: siblings share the same radial band.
                y={"kind": "align", "alignment": "middle"},
            ),
            # InnerRadius:0.72 -- the hollow clock rim.
            coord=polar(inner_radius=0.72),
        ),
        {"w": 540, "h": 540},
    )
