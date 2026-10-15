"""Equivalent of lowlevel/Pack.stories.tsx — Low Level Syntax/Pack.

`pack` places each child by its enclosing circle. Circles enclose themselves,
an ellipse encloses as the circle of its larger radius, and a polygon as the
smallest circle through its vertices. A pack nested in a pack is packed by the
circle around its own children. Uses pack's combinator form
(``pack([marks])``); the normalized DOM should match the JS MixedShapes story.
"""

from gofish import circle, ellipse, pack, polygon

COLORS = ["#4e79a7", "#f28e2b", "#e15759", "#76b7b2", "#59a14f"]


def story_mixed_shapes():
    return (
        pack([
            circle(r=60, fill=COLORS[0]),
            circle(r=22, fill=COLORS[1]),
            ellipse(w=90, h=44, fill=COLORS[2]),
            circle(r=38, fill=COLORS[3]),
            polygon(points=[[0, 0], [70, 0], [35, 60]], fill=COLORS[4]),
            circle(r=12, fill=COLORS[0]),
            pack([
                circle(r=26, fill=COLORS[1]),
                circle(r=18, fill=COLORS[2]),
                circle(r=14, fill=COLORS[3]),
                circle(r=9, fill=COLORS[4]),
                circle(r=6, fill=COLORS[0]),
            ]),
            circle(r=30, fill=COLORS[4]),
        ]),
        {"w": 420, "h": 420},
    )
