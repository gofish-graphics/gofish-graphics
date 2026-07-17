"""Equivalent of gofish-gotree/stories/gallery/OrthogonalGridEmbedding.stories.tsx —
GoTree / Gallery / OrthogonalGridEmbedding (polar node-link).

dsl: CoordinateSystem polar; Node circle; Link orthogonal; Color depth.
  Layout X (= theta): Root within / Subtree flatten ;
         Y (= r): Root juxtapose / Subtree align.
Relation -> combine kind: within/align -> align, juxtapose/flatten ->
distribute. Root relation = parentChild ; Subtree relation = sibling. So:
  parentChild = (align theta, distribute r)   -- parent centered angularly
    over its subtree's wedge; parent inner, children one ring outward.
  sibling     = (distribute theta, align r)   -- siblings spread around
    the circle on a shared radius.
Under polar(): x = theta (radians, 0..2*pi), y = r (radius). Point-like
circle nodes => anchor "middle" on the distribute axes so spacing is read
in domain units (radians for theta, r-units for r) and bboxes don't
accumulate. Color byDepth (sequential blue ramp, dark root -> light
leaves).

NOTES -- features in the dsl that gofish-gotree cannot express here (no
hacks, carried from the JS story):
 - Orthogonal links: the dsl's Link is "orthogonal" (right-angle elbow
   connectors). The link renderer has no orthogonal mode under polar, so
   links fall back to {curve: "straight"} (straight segments that still
   bow along arcs under the polar transform).
 - No angular auto-fit for POINT nodes: angular spacing is a fixed
   per-level constant that does NOT shrink with the number of nodes at a
   depth (tracked in JS issue #627). Spacing is hand-tuned for the small
   sample tree.
 - The PolarAxis theta/r swap from the dsl is still NOT expressible (no
   transposed variant).
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
    return circle(r=7, fill=_by_depth(d), stroke="#08306b", strokeWidth=1)


def story_orthogonal_grid_embedding():
    return (
        tree(
            SAMPLE_TREE,
            node=_node,
            # Orthogonal links unsupported -> linear fallback (see NOTES).
            link={"curve": "straight", "stroke": "#90a4ae", "stroke_width": 1.5},
            parent_child=combine(
                # theta: parent centered over its subtree's angular span.
                x={"kind": "align", "alignment": "middle"},
                # r: parent inner, children one ring outward (center mode
                # -> spacing in r-units).
                y={
                    "kind": "distribute",
                    "spacing": 70,
                    "anchor": "middle",
                    "alignment": "middle",
                },
            ),
            sibling=combine(
                # theta: spread siblings angularly (spacing in radians,
                # center mode).
                x={
                    "kind": "distribute",
                    "spacing": (2 * math.pi) / 6,
                    "anchor": "middle",
                    "alignment": "middle",
                },
                # r: siblings share a radius.
                y={"kind": "align", "alignment": "middle"},
            ),
            coord=polar(),
        ),
        {"w": 480, "h": 480},
    )
