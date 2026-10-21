"""Equivalent of gofish-gotree/stories/gallery/RadialPhylogeneticTree.stories.tsx.

A radial phylogenetic tree: every leaf lands on one outer ring (aligned tips)
and internal nodes fork at a radius set by their depth. It does not use
tree(): a small data pass computes each node's angle and radius, projects it
to pixels by hand, and draws only the links, in a plain layer.
"""

import math

from gofish import Curve, ellipse, layer, line
from python_stories.gotree_data import FLARE_VIS

LEAF_R = 216  # the outer ring, where every leaf lands
RING = 116  # radius per internal-node depth (the fork radius)


def layout(root):
    """Each node's path, depth, angle (radians), radius (pixels), whether it is
    a leaf, and its parent path, in preorder."""

    # A node's box is its leaf count, so each leaf gets an equal angle.
    def box_width(n):
        kids = n.get("children")
        return sum(box_width(c) for c in kids) if kids else 1

    total_leaves = box_width(root)
    placed = []

    def walk(n, depth, path, parent_path, box_left):
        w = box_width(n)
        is_leaf = not n.get("children")
        placed.append(
            {
                "path": path,
                "depth": depth,
                "theta": ((box_left + w / 2) / total_leaves) * 2 * math.pi,
                "r": LEAF_R if is_leaf else depth * RING,
                "is_leaf": is_leaf,
                "parent_path": parent_path,
            }
        )
        cursor = box_left
        for i, c in enumerate(n.get("children") or []):
            walk(c, depth + 1, f"{path}/{i}", path, cursor)
            cursor += box_width(c)

    walk(root, 0, "root", None, 0)
    return placed


PLACED = layout(FLARE_VIS)
BY_PATH = {p["path"]: p for p in PLACED}


# Slightly thicker spokes from the root.
def link_width(parent_depth):
    return 1.7 if parent_depth == 0 else 1.25


LINK_COLOR = "#5a5a5a"

CANVAS = 500
CENTER = CANVAS / 2


# Polar to pixels around the canvas center, with angle 0 at 12 o'clock.
def project(theta, r):
    return (
        CENTER + r * math.cos(theta - math.pi / 2),
        CENTER + r * math.sin(theta - math.pi / 2),
    )


# An invisible zero-size anchor at a pixel position, for link endpoints.
def pt(xy):
    x, y = xy
    return ellipse(x=x, y=y, w=0, h=0, fill="none", stroke="none")


# Root-to-child spokes start at the canvas center.
def link_mark(p):
    parent = BY_PATH[p["parent_path"]]
    src = (
        (CENTER, CENTER)
        if parent["depth"] == 0
        else project(parent["theta"], parent["r"])
    )
    return line(
        [pt(src), pt(project(p["theta"], p["r"]))],
        curve=Curve.linear(),
        fill="none",
        stroke=LINK_COLOR,
        stroke_width=link_width(parent["depth"]),
    )


LINKS = [link_mark(p) for p in PLACED if p["parent_path"] is not None]


def story_radial_phylogenetic_tree():
    return layer([layer(LINKS)]), {"w": CANVAS, "h": CANVAS}
