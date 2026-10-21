"""Equivalent of gofish-gotree/stories/gallery/MultilevelSilhouetteTree.stories.tsx.

A multi-template radial tree: most depth-1 subtrees are drawn as filled
wedges (a silhouette), and a few as node-link fans, all around one central
disc. It does not use tree(): a small data pass computes each wedge, circle
and link in polar coordinates, and the marks are placed by hand inside a
polar layer. See the JS story for the derivation.
"""

import math

from gofish import Coord, Curve, ellipse, layer, line, rect
from python_stories.gotree_data import FLARE_VIS

DISC_R = 106  # the root's filled disc
WEDGE_R0 = 113  # medium ring inner (a thin white gap after the disc)
WEDGE_R1 = 191  # medium ring outer
PALE_R0 = 197  # pale ring inner (a thin white gap after the medium ring)
PALE_R1 = 252  # pale ring outer
FAN_PARENT_R = 123  # a fan's parent circle, just outside the disc
FAN_LEAF_R = 291  # a fan's leaf circles, beyond the wedge rings
PARENT_CIRCLE_R = 15  # screen radius (px) of a fan parent
LEAF_CIRCLE_R = 13  # screen radius (px) of a fan leaf

# Angular seams (radians): the white gaps between neighboring wedges.
WEDGE_GAP = 0.03  # between depth-1 slots
PALE_GAP = 0.016  # between depth-2 pale wedges within a slot
FAN_PITCH = 0.2  # angle between neighboring leaves in a fan

DISC_FILL = "#2f75bd"
MED_FILL = "#84abd9"
PALE_FILL = "#d7e6f6"
FAN_PARENT_FILL = "#6f9fd0"
FAN_LEAF_FILL = "#cfe0f2"
LINK_STROKE = "#5f6b7a"

# The depth-1 subtrees drawn as node-link fans instead of wedges: heap, Maths,
# Shapes and Strings, one near each side.
FAN_INDICES = {6, 11, 15, 18}


def leaf_count(n):
    kids = n.get("children")
    return sum(leaf_count(c) for c in kids) if kids else 1


disc_quarters = []
med_wedges = []
pale_wedges = []
fan_links = []
fan_leaves = []
fan_parents = []


def build(root):
    slot = (2 * math.pi) / leaf_count(root)

    # The root disc as four quarter pies (one full-circle rect would collapse
    # to a sliver). Each quarter overlaps the next a little and is stroked in
    # its own fill, so no seam shows.
    for i in range(4):
        disc_quarters.append(
            {
                "theta0": (i * math.pi) / 2,
                "theta1": ((i + 1) * math.pi) / 2 + 0.03,
                "fill": DISC_FILL,
                "stroke": DISC_FILL,
            }
        )

    cursor = 0
    for idx, child in enumerate(root.get("children") or []):
        span = leaf_count(child) * slot
        t0 = cursor
        t1 = cursor + span
        cursor = t1
        leaves = child.get("children") or []
        k = len(leaves)

        if idx in FAN_INDICES:
            # Node-link template: a parent circle and a straight fan to its
            # leaf circles, at a fixed pitch centered on the slot.
            center = (t0 + t1) / 2
            fan_parents.append(
                {
                    "theta": center,
                    "r": FAN_PARENT_R,
                    "radius": PARENT_CIRCLE_R,
                    "fill": FAN_PARENT_FILL,
                }
            )
            for j in range(k):
                theta = center + (j - (k - 1) / 2) * FAN_PITCH
                fan_leaves.append(
                    {
                        "theta": theta,
                        "r": FAN_LEAF_R,
                        "radius": LEAF_CIRCLE_R,
                        "fill": FAN_LEAF_FILL,
                    }
                )
                fan_links.append(
                    {"a": (center, FAN_PARENT_R), "b": (theta, FAN_LEAF_R)}
                )
            continue

        # Silhouette template: a medium wedge and its pale children.
        med_wedges.append(
            {
                "theta0": t0 + WEDGE_GAP / 2,
                "theta1": t1 - WEDGE_GAP / 2,
                "fill": MED_FILL,
                "stroke": "white",
            }
        )
        if k > 0:
            sub = span / k
            for j in range(k):
                pale_wedges.append(
                    {
                        "theta0": t0 + j * sub + PALE_GAP / 2,
                        "theta1": t0 + (j + 1) * sub - PALE_GAP / 2,
                        "fill": PALE_FILL,
                        "stroke": "white",
                    }
                )


build(FLARE_VIS)


# A wedge is a rect swept through polar space: both dims embedded, so it
# draws as an annular sector.
def wedge_mark(w, r_inner, r_outer, stroke_width):
    return rect(
        x=w["theta0"],
        w=w["theta1"] - w["theta0"],
        y=r_inner,
        h=r_outer - r_inner,
        em_x=True,
        em_y=True,
        fill=w["fill"],
        stroke=w["stroke"],
        stroke_width=stroke_width,
    )


# A point ellipse's polar center is (min + w/2, min + h/2), so placing its min
# at (theta - R, r - R) lands the center exactly on (theta, r).
def circle_mark(c):
    return ellipse(
        x=c["theta"] - c["radius"],
        y=c["r"] - c["radius"],
        w=c["radius"] * 2,
        h=c["radius"] * 2,
        fill=c["fill"],
        stroke="white",
        stroke_width=2.5,
    )


# An invisible zero-size anchor at exact polar coordinates, for link endpoints.
def pt(theta, r):
    return ellipse(x=theta, y=r, w=0, h=0, fill="none", stroke="none")


def link_mark(link):
    return line(
        [pt(*link["a"]), pt(*link["b"])],
        curve=Curve.linear(),
        fill="none",
        stroke=LINK_STROKE,
        stroke_width=2,
    )


# Paint order is list order: the disc, the wedge rings, then the fan links
# under the fan circles, leaves under parents.
MARKS = [
    *(wedge_mark(w, 0, DISC_R, 2) for w in disc_quarters),
    *(wedge_mark(w, WEDGE_R0, WEDGE_R1, 2.5) for w in med_wedges),
    *(wedge_mark(w, PALE_R0, PALE_R1, 2.5) for w in pale_wedges),
    *(link_mark(link) for link in fan_links),
    *(circle_mark(c) for c in fan_leaves),
    *(circle_mark(c) for c in fan_parents),
]


def story_multilevel_silhouette_tree():
    return layer([layer(MARKS)], coord=Coord.polar()), {"w": 660, "h": 660}
