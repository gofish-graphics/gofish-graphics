"""Equivalent of gofish-gotree/stories/gallery/RotationTree.stories.tsx.

The radial-collapse "pinwheel": every non-root node sits on one shared ring,
and the links swirl. Like RadialTree, it does not use tree(): a small data
pass computes each node's polar position, and the marks are placed by hand
inside a polar layer. See the JS story for the derivation.
"""

import math

from gofish import Coord, Curve, ellipse, layer, line
from python_stories.gotree_data import FLARE_VIS

NODE_R = 11.5
RING_R = 228  # the one radius every non-root node collapses to
SUBTREE_MARGIN = 0.22
# Angular lag (radians) a spoke's center anchor carries past its hub. A linear
# link resampled under the polar transform then winds into a spiral arc: the
# pinwheel sweep.
SWIRL_LAG = 1.3
# How far (px) the mid anchor of a ring link is pushed outside RING_R.
RING_BULGE = 10


def layout(root):
    """Each node's path, depth, angle (radians), radius (pixels) and parent
    path, in preorder."""
    m = SUBTREE_MARGIN

    # Bottom-up: a leaf's box is 1 unit; an internal box is sum / (1 - m).
    def box_width(n):
        kids = n.get("children")
        return sum(box_width(c) for c in kids) / (1 - m) if kids else 1

    root_width = box_width(root)
    placed = []

    # Top-down: pack each node's children left to right inside its box, half a
    # gap on each side of every child, and place the node at its box center.
    def walk(n, depth, path, parent_path, box_left):
        w = box_width(n)
        placed.append(
            {
                "path": path,
                "depth": depth,
                "theta": ((box_left + w / 2) / root_width) * 2 * math.pi,
                "r": 0 if depth == 0 else RING_R,
                "parent_path": parent_path,
            }
        )
        kids = n.get("children") or []
        if not kids:
            return
        gap = (m * w) / len(kids)
        cursor = box_left
        for i, c in enumerate(kids):
            cursor += gap / 2
            walk(c, depth + 1, f"{path}/{i}", path, cursor)
            cursor += box_width(c) + gap / 2

    walk(root, 0, "root", None, 0)
    return placed


PLACED = layout(FLARE_VIS)
BY_PATH = {p["path"]: p for p in PLACED}

# Three depth shades (dark root, pale leaves).
DEPTH_COLORS = ["#1a63a8", "#6f9fd0", "#cfe0f2"]


# A point ellipse's polar center is (min + w/2, min + h/2), so placing its min
# at (theta - R, r - R) lands the center exactly on (theta, r).
def node_mark(p):
    return ellipse(
        x=p["theta"] - NODE_R,
        y=p["r"] - NODE_R,
        w=NODE_R * 2,
        h=NODE_R * 2,
        fill=DEPTH_COLORS[min(p["depth"], len(DEPTH_COLORS) - 1)],
        stroke="white",
        stroke_width=2.5,
    )


# The root goes last, so its dark disc paints over where the spokes meet (the
# sort is stable, so the other nodes keep their order).
NODES = [node_mark(p) for p in sorted(PLACED, key=lambda p: p["depth"] == 0)]


# An invisible zero-size anchor at exact polar coordinates, for link endpoints.
def pt(theta, r):
    return ellipse(x=theta, y=r, w=0, h=0, fill="none", stroke="none")


LINK_STROKE = "#5f6b7a"
LINK_WIDTH = 1.3


def link_mark(p):
    parent = BY_PATH[p["parent_path"]]
    if parent["depth"] == 0:
        # Center to hub: the center anchor carries the child's angle plus the
        # lag, so the link winds into a pinwheel arc.
        anchors = [pt(p["theta"] + SWIRL_LAG, 0), pt(p["theta"], p["r"])]
    else:
        # Hub to leaf, both on the ring: a petal through a mid anchor pushed
        # just outside the ring.
        mid_theta = (parent["theta"] + p["theta"]) / 2
        anchors = [
            pt(parent["theta"], parent["r"]),
            pt(mid_theta, RING_R + RING_BULGE),
            pt(p["theta"], p["r"]),
        ]
    return line(
        anchors,
        curve=Curve.linear(),
        fill="none",
        stroke=LINK_STROKE,
        stroke_width=LINK_WIDTH,
    )


LINKS = [link_mark(p) for p in PLACED if p["parent_path"] is not None]


def story_rotation_tree():
    # Inside a coord, paint order is list order: links first, under the nodes.
    return (
        layer([layer([*LINKS, *NODES])], coord=Coord.polar()),
        {"w": 520, "h": 520},
    )
