"""Equivalent of gofish-gotree/stories/gallery/OakTreeVis.stories.tsx —
GoTree / Gallery / OakTreeVis (polar node-link, depth-colored circles).

dsl: Node=circle, Color=depth, StaticSize=8, Link=curveStepBefore,
  CoordinateSystem=polar, PolarAxis=x-axis, PolarCenter=right,
  Layout AxisIndependent (bottom-up):
    X: Root=within/align(left)  Subtree=flatten (-> distribute)
    Y: Root=include  (-> nest)   Subtree=flatten (-> distribute)
Under polar(): x = theta (radians, 0..2*pi), y = r (radius). So the
combine brief is:
  parentChild = (align theta,       nest r)
  sibling     = (distribute theta,  distribute r)
Distinctive vs. the other radial ports: the SIBLING relation distributes
on BOTH axes -- siblings step outward in r as they fan in theta. That
radial stagger (plus the step-link corners in the dsl) is what gives the
reference its spiral / oak-branch silhouette: each level's children climb
to larger radii rather than sharing one ring.

POLAR GAPS (no hacks; flagged for follow-up, carried from the JS story):
 1. nest on r (y) is the "embedded dimension" hard case, here on the
    RADIAL axis: the dsl's Y Root=include wants the parent's radial band
    to ENCLOSE its subtree, but a fixed circle is a point and cannot grow
    on r. The JS story tried align-r (collapses the tree into a single
    spiral string, no branching) and settled on DISTRIBUTE on r (parent
    inner, subtree outer) as the only option that yields a branching
    radial tree with point nodes -- ported faithfully as such.
 2. No angular auto-fit for POINT nodes: sibling theta spacing is a fixed
    per-level constant (2*pi/6 rad between centers) that does NOT shrink
    with the number of nodes at a depth (tracked in JS issue #627).
 3. polar()'s PolarAxis=x-axis swap and PolarCenter=right are not
    expressible; plain polar() is used, matching the JS story.
 4. Link=curveStepBefore (orthogonal step links) is NOT supported ->
    {curve: "straight"}, matching the JS story's fallback.
 5. anchor "middle" on every distribute treats circles as points (no bbox
    accumulation) so spacing reads in domain units -- radians for theta,
    r-units for r.
"""

import math

from gofish import circle, polar
from gofish.gotree import combine, tree

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

_DEPTH_BLUES = ["#08306b", "#2171b5", "#6baed6", "#c6dbef", "#deebf7"]


def _by_depth(d):
    return _DEPTH_BLUES[min(d["depth"], len(_DEPTH_BLUES) - 1)]


# Node=circle, Color=depth, StaticSize=8 -> radius ~5.
def _node(d):
    return circle(r=5, fill=_by_depth(d), stroke="#1f3a5f", strokeWidth=1)


def story_oak_tree_vis():
    return (
        tree(
            SAMPLE_TREE,
            node=_node,
            # curveStepBefore unsupported -> linear (see GAP 4).
            link={"curve": "straight", "stroke": "#90a4ae", "stroke_width": 2},
            parent_child=combine(
                # theta: parent angularly centered over its subtree's span
                # (dsl within/align).
                x={"kind": "align", "alignment": "middle"},
                # r: dsl wants nest (radial containment); approximated
                # with distribute (parent inner, children outward) -- see
                # GAP 1. mode center -> r-units.
                y={
                    "kind": "distribute",
                    "spacing": 60,
                    "anchor": "middle",
                    "alignment": "middle",
                },
            ),
            sibling=combine(
                # theta: fan siblings angularly (radians between centers,
                # center mode).
                x={
                    "kind": "distribute",
                    "spacing": (2 * math.pi) / 6,
                    "anchor": "middle",
                },
                # r: stagger siblings radially -- the spiral/oak stagger
                # (dsl flatten).
                y={"kind": "distribute", "spacing": 30, "anchor": "middle"},
            ),
            coord=polar(),
        ),
        {"w": 520, "h": 520},
    )
