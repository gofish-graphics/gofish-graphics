"""Equivalent of gofish-gotree/stories/gallery/SpiralLayout.stories.tsx —
GoTree / Gallery / SpiralLayout (polar spiral node-link).

dsl: AxisIndependent, X[subtree=flatten, root=juxtapose] Y[subtree=flatten,
  root=juxtapose] under CoordinateSystem polar. Both flatten and juxtapose
  map to `distribute`, so EVERY axis of BOTH relations distributes:
    parentChild = (distribute x, distribute y)
    sibling     = (distribute x, distribute y)
Under polar(): x = theta (radians, 0..2*pi), y = r (radius). Distributing
on both axes for both relations means each child steps BOTH around
(theta) AND outward (r) relative to its parent and to its previous
sibling -- the points walk a spiral.
  - parentChild: child sits one theta-step around and one r-step out from
    parent.
  - sibling: each next sibling is one theta-step around and one r-step out
    from the prior sibling, so a fan of children itself spirals.
Point-like circle nodes => anchor "middle" so spacing is read in domain
units (radians for theta, r-units for r) and bboxes don't accumulate.
Color = depth. Links straight.

NOTES -- polar gaps (no hacks; flagged for follow-up, carried from the JS
story):
 - InnerRadius (spiral start radius), Direction (CW/CCW winding), and
   CentralAngle are expressible via polar(), but the JS story does not
   apply them (uses plain polar()) -- ported faithfully as plain polar().
   Only the theta/r axis swap remains inexpressible regardless.
 - No angular auto-fit: theta spacing is a fixed per-step constant, so the
   total angle is (#steps * spacing) and freely exceeds 2*pi -- the
   spiral wraps past a full turn. For a spiral this overflow is partly
   intended, but it is uncontrolled (tracked in JS issue #627 for
   point/circle-node layouts generally).
 - Combined theta+r distribution on the SAME relation is what yields the
   spiral, but the per-step r and theta increments are independent
   constants rather than a single Archimedean-spiral parameterization, so
   the pitch is only roughly constant.
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


def _node(d):
    return circle(r=7, fill=_by_depth(d), stroke="#1f3a5f", strokeWidth=1)


def story_spiral_layout():
    return (
        tree(
            SAMPLE_TREE,
            node=_node,
            link={"curve": "straight", "stroke": "#90a4ae", "stroke_width": 1.5},
            # parentChild: step around (theta) and outward (r) from the
            # parent.
            parent_child=combine(
                x={
                    "kind": "distribute",
                    "spacing": (2 * math.pi) / 9,
                    "anchor": "middle",
                    "alignment": "middle",
                },
                y={
                    "kind": "distribute",
                    "spacing": 50,
                    "anchor": "middle",
                    "alignment": "middle",
                },
            ),
            # sibling: each next sibling spirals one theta-step around and
            # one r-step out.
            sibling=combine(
                x={
                    "kind": "distribute",
                    "spacing": (2 * math.pi) / 9,
                    "anchor": "middle",
                    "alignment": "middle",
                },
                y={
                    "kind": "distribute",
                    "spacing": 26,
                    "anchor": "middle",
                    "alignment": "middle",
                },
            ),
            coord=polar(),
        ),
        {"w": 520, "h": 520},
    )
