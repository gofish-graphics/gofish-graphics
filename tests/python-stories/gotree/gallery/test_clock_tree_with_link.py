"""Equivalent of gofish-gotree/stories/gallery/ClockTreeWithLink.stories.tsx —
GoTree / Gallery / ClockTreeWithLink.

A clock-face ring of nodes whose links bend inward across the disc. Both
parentChild and sibling distribute on theta and align on r, so the whole tree
flattens onto a single ring (every node -- root, internals, leaves -- gets one
angular slot at the same radius). Links then connect parent -> child across
the disc.

JS `curveStepBefore` (an orthogonal radial-then-angular step) is unsupported
by gofish-gotree links (only `{curve: "straight"}` is supported under polar),
so links are drawn as straight chords through the hollow center, per the JS
story's own note -- ported verbatim, not "fixed".
"""

from gofish import polar, rect, datum
from gofish.gotree import combine, tree


def _branch(prefix, n):
    return [{"name": f"{prefix}{i}"} for i in range(n)]


CLOCK_DATA = {
    "name": "root",
    "children": [
        {"name": "a", "children": _branch("a", 3)},
        {"name": "b", "children": _branch("b", 2)},
        {"name": "c", "children": _branch("c", 4)},
        {"name": "d", "children": _branch("d", 1)},
        {"name": "e", "children": _branch("e", 3)},
        {"name": "f", "children": _branch("f", 2)},
        {"name": "g", "children": _branch("g", 3)},
        {"name": "h", "children": _branch("h", 2)},
    ],
}

_DEPTH_BLUES = ["#08306b", "#2171b5", "#6baed6", "#c6dbef", "#deebf7"]

_BAND_HEIGHT = 60  # radial thickness of the ring band


def _by_depth(d):
    return _DEPTH_BLUES[min(d["depth"], len(_DEPTH_BLUES) - 1)]


def _node(d):
    return rect(
        thetaSize=datum(1),
        h=_BAND_HEIGHT,
        emX=True,
        emY=True,
        fill=_by_depth(d),
        stroke="white",
        strokeWidth=1.5,
    )


def story_clock_tree_with_link():
    return (
        tree(
            CLOCK_DATA,
            node=_node,
            # curveStepBefore is unsupported -> straight chord (bows under polar).
            link={"curve": "straight", "stroke": "#90a4ae", "stroke_width": 1},
            parent_child=combine(
                # theta: parent at the start of its subtree's slot, group after it.
                x={"kind": "distribute", "spacing": 0, "anchor": "edge"},
                # r: parent and subtree share the ring.
                y={"kind": "align", "alignment": "middle"},
            ),
            sibling=combine(
                # theta: siblings tile angularly (edge mode sums theta-widths).
                x={"kind": "distribute", "spacing": 0, "anchor": "edge"},
                # r: siblings share the ring.
                y={"kind": "align", "alignment": "middle"},
            ),
            # InnerRadius:0.79 -- the thin outer clock rim with an empty center
            # that the step/arc links route through.
            coord=polar(inner_radius=0.79),
        ),
        {"w": 520, "h": 520},
    )
