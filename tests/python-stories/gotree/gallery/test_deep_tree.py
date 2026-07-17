"""Equivalent of gofish-gotree/stories/gallery/DeepTree.stories.tsx —
GoTree / Gallery / deep-tree (a deep radial node-link, sunburst family).

dsl: node=circle, color=depth, link=curve; CoordinateSystem polar
  (Direction clockwise, PolarAxis y-axis, InnerRadius 0, CentralAngle 1).
  Layout AxisIndependent, Mode top-down:
    X.Root include  / X.Subtree flatten  -> parentChild nest, sibling distribute
    Y.Root juxtapose / Y.Subtree align   -> parentChild distribute, sibling align
Under polar(): x = theta (radians, 0..2*pi), y = r (radius). So the brief
mapping is:
  parentChild = (nest theta, distribute r):
    - theta nest -> parent centered over its subtree's angular span (a
      circle is a point, so nest only re-centers the parent; it doesn't
      grow it).
    - r distribute -> one ring per depth (parent inner, children outward).
  sibling = (distribute theta, align r):
    - theta distribute -> siblings spread angularly (spacing in radians).
    - r align -> all siblings share a radius (same ring).
Point-like circle nodes => anchor "middle" on every distribute so spacing
is read in domain units (radians for theta, r-units for r) and pixel bboxes
don't accumulate.

NOTES -- polar limitations (no hacks; flagged for follow-up), from the JS
story:
 - Links: the dsl asks for "curve" links with depth-driven width. Curved
   link interpolation isn't wired through the coord transform yet, so this
   falls back to fixed-width {curve: "straight"}.
 - No angular auto-fit for POINT nodes: sibling theta spacing is a fixed
   per-level constant that does NOT shrink with the number of nodes at a
   depth (tracked in JS issue #627). The tree below is kept modest so the
   structure stays legible.
 - polar() axis-swap (PolarAxis y-axis) and PolarCenter "bottom" from the
   dsl are not expressible; plain polar() is used.
"""

import math

from gofish import circle, polar
from gofish.gotree import combine, tree

# A deep tree -- 4 levels below the root (depth 0..4) so several rings show
# the "deep" structure. Branching kept low (binary) so the fixed angular
# budget isn't blown out completely. 16 leaves at the outer ring.


def _make_deep(depth, prefix):
    if depth == 0:
        return {"name": prefix}
    return {
        "name": prefix,
        "children": [
            _make_deep(depth - 1, prefix + "a"),
            _make_deep(depth - 1, prefix + "b"),
        ],
    }


DEEP_TREE = _make_deep(4, "r")

_DEPTH_BLUES = ["#08306b", "#2171b5", "#6baed6", "#c6dbef", "#deebf7"]


def _by_depth(d):
    return _DEPTH_BLUES[min(d["depth"], len(_DEPTH_BLUES) - 1)]


# circle nodes, depth-colored (dark blue root -> light blue leaves).
def _node(d):
    return circle(r=6, fill=_by_depth(d), stroke="#08306b", strokeWidth=1)


def story_deep_tree():
    return (
        tree(
            DEEP_TREE,
            node=_node,
            # NOTE: dsl wants curve links (LinkWidth=depth); falling back
            # to linear, matching the JS story.
            link={"curve": "straight", "stroke": "#5f6b7a", "stroke_width": 1.5},
            parent_child=combine(
                # theta: nest centers the parent circle over its subtree's
                # angular span.
                x={"kind": "nest", "pad": 0},
                # r: one ring per depth (center mode -> spacing in
                # r-units).
                y={
                    "kind": "distribute",
                    "spacing": 72,
                    "anchor": "middle",
                    "alignment": "middle",
                },
            ),
            sibling=combine(
                # theta: spread siblings angularly (spacing in radians,
                # center mode).
                x={
                    "kind": "distribute",
                    "spacing": (2 * math.pi) / 10,
                    "anchor": "middle",
                    "alignment": "middle",
                },
                # r: all siblings share a radius (same ring).
                y={"kind": "align", "alignment": "middle"},
            ),
            coord=polar(),
        ),
        {"w": 560, "h": 560},
    )
