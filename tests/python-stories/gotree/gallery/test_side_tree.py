"""Equivalent of gofish-gotree/stories/gallery/SideTree.stories.tsx —
GoTree / Gallery / SideTree (polar node-link, "side-leaning" tree).

dsl: gallery/SideTree/dsl.json
  Node: circle, StaticSize 6 ; Link: straight ; Color: depth
  CoordinateSystem: polar, StartAngle 0.17
  Layout (AxisIndependent, bottom-up):
    X.Root = juxtapose, X.Subtree = align
    Y.Root = juxtapose, Y.Subtree = flatten
  Relation -> combine kind: juxtapose/flatten -> distribute, align ->
  align. GoTree "Root" = parent<->child relation, "Subtree" = among-
  siblings relation, so:
    parentChild = (distribute X, distribute Y)
    sibling     = (align X,      distribute Y)

Under polar(): x = theta (radians, 0..2*pi), y = r (radius). Map brief
x=theta, y=r:
  - parentChild distributes on BOTH theta and r: a child moves outward in
    r AND sweeps a little in theta from its parent -> the characteristic
    diagonal "lean".
  - siblings ALIGN in theta (share one angle / lie on a common spoke) and
    DISTRIBUTE in r -> a sibling group stacks radially along a single
    ray, reading as the long straight spines in the reference image.
Point-like circle nodes => anchor "middle" on every distribute axis so
spacing is read in domain units (radians for theta, r-units for r) and
bboxes don't accumulate.

POLAR LIMITATIONS (no hacks here -- flagged for follow-up, carried from
the JS story):
 - The dsl's StartAngle 0.17 (and any InnerRadius / Direction /
   CentralAngle) are expressible via `polar(start_angle=0.17, ...)`, but
   the JS story itself does not apply them (uses plain polar()) -- ported
   faithfully as plain polar() too.
 - No angular auto-fit for POINT nodes: theta spacing is a fixed per-level
   constant, it does not shrink with node count, so wide/deep trees can
   overflow the 2*pi budget and wrap (tracked in JS issue #627); spacings
   here are hand-tuned.
 - The dsl's bottom-up Mode and per-relation Margins are not modeled --
   only the relation->constraint-kind mapping is ported.
"""

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
    return circle(r=6, fill=_by_depth(d), stroke="#1f3a5f", strokeWidth=1)


def story_side_tree():
    return (
        tree(
            SAMPLE_TREE,
            node=_node,
            link={"curve": "straight", "stroke": "#607d8b", "stroke_width": 1.5},
            # parentChild = (distribute theta, distribute r): child leans
            # away in angle and steps outward in radius from its parent.
            parent_child=combine(
                x={"kind": "distribute", "spacing": 0.5, "anchor": "middle"},
                y={"kind": "distribute", "spacing": 70, "anchor": "middle"},
            ),
            # sibling = (align theta, distribute r): siblings share a
            # spoke (one angle) and stack out along the radius.
            sibling=combine(
                x={"kind": "align", "alignment": "middle"},
                y={"kind": "distribute", "spacing": 90, "anchor": "middle"},
            ),
            coord=polar(),
        ),
        {"w": 560, "h": 560},
    )
