"""Equivalent of gofish-gotree/stories/gallery/Dendrogram.stories.tsx —
GoTree / Gallery / dendrogram.

Hidden internal nodes (zero-area transparent rects, just to anchor the
links) with bracket-style connectors, as used for clustering trees. nest is
on X ONLY so internal nodes are unsized on x (the parent box grows to span
its subtree) but keep a fixed (tiny) height; leaves are fully fixed-size.

TODO (ported faithfully from the JS story, not fixed here): curveStepAfter
(right-angle brackets) is unsupported by the bridge, so — matching the JS
story's own fallback — this uses {curve: "straight"} (straight diagonal
edges) instead of the reference's right-angle brackets.
"""

from gofish import rect
from gofish.gotree import combine, tree


def _sub(prefix, n):
    return [{"name": f"{prefix}{i}"} for i in range(n)]


DENDRO_DATA = {
    "name": "root",
    "children": [
        {
            "name": "A",
            "children": [
                {"name": "A0", "children": _sub("A0", 3)},
                {"name": "A1", "children": _sub("A1", 2)},
            ],
        },
        {
            "name": "B",
            "children": [
                {"name": "B0", "children": _sub("B0", 2)},
                {"name": "B1", "children": _sub("B1", 3)},
                {"name": "B2", "children": _sub("B2", 2)},
            ],
        },
        {
            "name": "C",
            "children": [
                {"name": "C0", "children": _sub("C0", 3)},
                {"name": "C1", "children": _sub("C1", 2)},
            ],
        },
    ],
}

_DEPTH_BLUES = ["#08306b", "#2171b5", "#6baed6", "#c6dbef", "#deebf7"]


def _by_depth(d):
    return _DEPTH_BLUES[min(d["depth"], len(_DEPTH_BLUES) - 1)]


# Hidden node: a zero-area transparent rect that still gives the link
# endpoints something to anchor to.
def _node(d):
    if d["height"] == 0:
        return rect(w=1, h=1, fill="transparent", strokeWidth=0)
    return rect(h=1, fill="transparent", strokeWidth=0)


# color=depth: the hidden nodes carry no visible color, so honor it on the
# links — each link colored by its target node's depth.
def _link(src, tgt):
    return {"curve": "straight", "stroke": _by_depth(tgt), "strokeWidth": 1.5}


def story_dendrogram():
    return (
        tree(
            DENDRO_DATA,
            node=_node,
            link=_link,
            parent_child=combine(
                x={"kind": "nest", "pad": 0},
                y={"kind": "distribute", "spacing": 70},
            ),
            sibling=combine(
                x={"kind": "distribute", "spacing": 22},
                # "bottom" alignment: y-up -> screen bottom is low y -> "start".
                y={"kind": "align", "alignment": "start"},
            ),
        ),
        {"w": 900, "h": 520},
    )
