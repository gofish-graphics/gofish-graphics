"""Equivalent of
gofish-gotree/stories/gallery/HierarchicalSectorChart.stories.tsx —
GoTree / Gallery / HierarchicalSectorChart.

Sunburst-of-sectors: concentric filled rect wedges, colored by depth. Under
polar(): x = theta, y = r. parentChild = (nest theta, distribute r) -- the
parent wedge spans the combined angular extent of its children (nest, pad 0
-> no gap) while the child group sits one ring out from the parent (distribute
r, edge mode, spacing 0 -> rings touch with no radial gap). sibling =
(distribute theta, align r) -- siblings pack angularly into their parent's
arc and share the same ring.

Wedge node: width in theta-units (emX) sweeps an arc; height in r-units (emY)
is the ring thickness. Leaves carry the explicit theta-share (unit weight,
auto-fit via nest summing them up the tree); internal nodes leave width to
nest. Ported verbatim, including the flagged gaps (no innerRadius/direction/
startAngle/centralAngle applied, no polar theta/r axis swap, link "none" per
the dsl's Link:hidden).
"""

from gofish import polar, rect, datum
from gofish.gotree import combine, tree

# Orange -> yellow depth ramp (dsl ColorRange ["#DE4006","#EFD648"]), sampled
# at the 3 depths this tree uses.
_SECTOR_RAMP = ["#DE4006", "#E87B11", "#EFD648"]

# Moderately uneven 3-level tree matching the JS story's local `sectorTree`.
SECTOR_TREE = {
    "name": "root",
    "children": [
        {
            "name": "A",
            "children": [{"name": "A1"}, {"name": "A2"}, {"name": "A3"}],
        },
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
        {
            "name": "E",
            "children": [{"name": "E1"}, {"name": "E2"}, {"name": "E3"}],
        },
    ],
}

_BAND_HEIGHT = 56  # radial thickness of one ring


def _by_depth(d):
    return _SECTOR_RAMP[min(d["depth"], len(_SECTOR_RAMP) - 1)]


def _node(d):
    if d["height"] == 0:
        return rect(
            thetaSize=datum(1),
            h=_BAND_HEIGHT,
            emX=True,
            emY=True,
            fill=_by_depth(d),
            stroke="white",
            strokeWidth=1.5,
        )
    return rect(
        h=_BAND_HEIGHT,
        emX=True,
        emY=True,
        fill=_by_depth(d),
        stroke="white",
        strokeWidth=1.5,
    )


def story_hierarchical_sector_chart():
    return (
        tree(
            SECTOR_TREE,
            node=_node,
            link="none",
            parent_child=combine(
                # theta: parent wedge encloses its subtree's arc (pad 0 -> exact tiling).
                x={"kind": "nest", "pad": 0},
                # r: parent inner ring, child group on the next ring out (edge
                # mode, spacing 0 -> rings touch with no radial gap).
                y={"kind": "distribute", "spacing": 0, "anchor": "edge"},
            ),
            sibling=combine(
                # theta: siblings tile their parent's arc (edge mode sums theta-widths).
                x={"kind": "distribute", "spacing": 0, "anchor": "edge"},
                # r: siblings share the same ring.
                y={"kind": "align", "alignment": "middle"},
            ),
            coord=polar(),
        ),
        {"w": 560, "h": 560},
    )
