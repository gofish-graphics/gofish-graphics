"""Equivalent of gofish-gotree/stories/gallery/RadialTreeIncline.stories.tsx.

A radial node-link tree with a pinwheel "incline": every parent sits at the
leading edge of its own subtree instead of over its center. Like RadialTree,
it does not use tree(): a small data pass computes each node's polar position,
and the marks are placed by hand inside a polar layer. See the JS story for
the derivation.
"""

import math

from gofish import Coord, Curve, ellipse, layer, line
from python_stories.gotree_data import FLARE_VIS, by_depth

NODE_R = 11
RING_SPACING = 120
# GoTree's X.Subtree flatten margin, "-0.13w", dealt out only between children:
# an internal box is sum(child widths) / (1 - m) wide, smaller than its content,
# so sibling leaves overlap like stacked coins.
SUBTREE_MARGIN = -0.13
# X.Root juxtapose, the incline: a parent sits at this fraction of its box
# (0 is the leading edge), while its children fill the whole box.
PARENT_POS = 0


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

    # Top-down: pack each node's children left to right inside its box, with
    # the (negative) slack only between them, and place the node at PARENT_POS.
    def walk(n, depth, path, parent_path, box_left):
        w = box_width(n)
        placed.append(
            {
                "path": path,
                "depth": depth,
                "theta": ((box_left + PARENT_POS * w) / root_width) * 2 * math.pi,
                "r": depth * RING_SPACING,
                "parent_path": parent_path,
            }
        )
        kids = n.get("children") or []
        if not kids:
            return
        gap = (m * w) / (len(kids) - 1) if len(kids) > 1 else 0
        cursor = box_left
        for i, c in enumerate(kids):
            walk(c, depth + 1, f"{path}/{i}", path, cursor)
            cursor += box_width(c) + gap

    walk(root, 0, "root", None, 0)
    return placed


PLACED = layout(FLARE_VIS)
BY_PATH = {p["path"]: p for p in PLACED}

# Uniform straight links.
LINK_WIDTH = 2

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
        fill=by_depth(DEPTH_COLORS)(p),
        stroke="white",
        stroke_width=2.25,
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
        stroke="#57606b",
        stroke_width=LINK_WIDTH,
    )


LINKS = [link_mark(p) for p in PLACED if p["parent_path"] is not None]


def story_radial_tree_incline():
    # Inside a coord, paint order is list order: links first, under the nodes.
    return (
        layer([layer([*LINKS, *NODES])], coord=Coord.clock()),
        {"w": 520, "h": 520},
    )
