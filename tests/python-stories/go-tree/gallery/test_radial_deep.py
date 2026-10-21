"""Equivalent of gofish-gotree/stories/gallery/RadialDeep.stories.tsx.

A deep radial node-link tree. Like RadialTree, it does not use tree(): a
small data pass computes each node's polar position (angle from its subtree's
leaf count, radius from its depth), and the marks are placed by hand inside a
polar layer. See the JS story for the derivation.
"""

import math

from gofish import Coord, Curve, ellipse, layer, line
from python_stories.gotree_data import FLARE_VIS

NODE_R = 15.5
RING_SPACING = 117
# GoTree's X.Subtree flatten margin: an internal box is sum(child widths) /
# (1 - m) wide, so the leaf pitch shrinks by (1 - m) per level and the spare
# angle becomes gaps between neighboring fans.
SUBTREE_MARGIN = 0.55


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
                "r": depth * RING_SPACING,
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


# Thick spokes from the root, thin links below.
def link_width(parent_depth):
    return 7.5 if parent_depth == 0 else 2.25


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
        stroke_width=2.75,
    )


# The root goes last, so its dark disc paints over where the spokes meet (the
# sort is stable, so the other nodes keep their order).
NODES = [node_mark(p) for p in sorted(PLACED, key=lambda p: p["depth"] == 0)]


# An invisible zero-size anchor at exact polar coordinates, for link endpoints.
def pt(theta, r):
    return ellipse(x=theta, y=r, w=0, h=0, fill="none", stroke="none")


# Root-to-child spokes start at the center with the child's angle, so each
# spoke is a straight radial line. Deeper links go parent to child directly.
def link_mark(p):
    parent = BY_PATH[p["parent_path"]]
    src = (p["theta"], 0) if parent["depth"] == 0 else (parent["theta"], parent["r"])
    return line(
        [pt(*src), pt(p["theta"], p["r"])],
        curve=Curve.linear(),
        fill="none",
        stroke="#5f6b7a",
        stroke_width=link_width(parent["depth"]),
    )


LINKS = [link_mark(p) for p in PLACED if p["parent_path"] is not None]


def story_radial_deep():
    # Inside a coord, paint order is list order: links first, under the nodes.
    return (
        layer([layer([*LINKS, *NODES])], coord=Coord.clock()),
        {"w": 520, "h": 520},
    )
