"""Equivalent of gofish-gotree/stories/gallery/OutsideInTree.stories.tsx.

An inverted sunburst: the root is the outermost ring and the tree grows
inward. It does not use tree(): a small data pass gives each node an angular
span from its leaf count and a radial band from its depth, and each node is
drawn as a rect wedge inside a polar layer. See the JS story for why.
"""

import math

from gofish import Coord, layer, rect
from python_stories.gotree_data import FLARE_VIS

R_OUTER = 246  # the root's outer edge
ROOT_THICK = 40  # depth 0 band (outermost, darkest)
MID_THICK = 68  # depth 1 band (widest)
LEAF_THICK = 46  # depth 2 band (innermost)

R2 = R_OUTER  # root outer
R1 = R2 - ROOT_THICK  # root inner = depth 1 outer
R0 = R1 - MID_THICK  # depth 1 inner = depth 2 outer
RH = R0 - LEAF_THICK  # depth 2 inner = white hole radius
BANDS = [
    (R1, R2),  # depth 0
    (R0, R1),  # depth 1
    (RH, R0),  # depth 2
]

DEPTH_COLORS = ["#2171b5", "#7faed6", "#deebf7"]


def leaf_count(n):
    kids = n.get("children")
    return sum(leaf_count(c) for c in kids) if kids else 1


def layout(root):
    """Each node's depth, start angle and angular span (radians), in
    preorder."""
    slot = (2 * math.pi) / leaf_count(root)
    wedges = []

    # Top-down: each node gets a contiguous span proportional to its leaf
    # count, and its children tile it left to right. The root spans 2 pi.
    def walk(n, depth, theta0):
        wedges.append(
            {"depth": depth, "theta0": theta0, "d_theta": leaf_count(n) * slot}
        )
        cursor = theta0
        for c in n.get("children") or []:
            walk(c, depth + 1, cursor)
            cursor += leaf_count(c) * slot

    walk(root, 0, 0)
    return wedges


WEDGES = layout(FLARE_VIS)


# A wedge is a rect swept through polar space: x and w are the start angle and
# span (em_x, in radians), y and h the inner radius and band thickness (em_y).
# The white stroke draws the seams between neighboring wedges.
def wedge_mark(theta0, d_theta, depth):
    r_inner, r_outer = BANDS[depth]
    return rect(
        x=theta0,
        w=d_theta,
        y=r_inner,
        h=r_outer - r_inner,
        em_x=True,
        em_y=True,
        fill=DEPTH_COLORS[depth],
        stroke="white",
        stroke_width=0 if depth == 0 else 2,
    )


# A full ring would collapse to a sliver (its start and end angles coincide),
# so a wedge wider than 1.5 pi is drawn as four quarter wedges.
def wedge_marks(wg):
    if wg["d_theta"] > 1.5 * math.pi:
        q = wg["d_theta"] / 4
        return [wedge_mark(wg["theta0"] + i * q, q, wg["depth"]) for i in range(4)]
    return [wedge_mark(wg["theta0"], wg["d_theta"], wg["depth"])]


# Deepest first (the sort is stable, so each ring keeps its order).
MARKS = [
    m
    for wg in sorted(WEDGES, key=lambda wg: wg["depth"], reverse=True)
    for m in wedge_marks(wg)
]


def story_outside_in_tree():
    return layer([layer(MARKS)], coord=Coord.clock()), {"w": 540, "h": 540}
