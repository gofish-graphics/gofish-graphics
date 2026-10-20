"""Equivalent of tutorials/Diagrams.stories.tsx — Tutorials/Diagrams.

The finished example of the Diagrams tutorial: the Basics picture with
Mercury labeled. The label is centered on Mercury, spaced off the whole
box, and an arrow runs from the label to the planet. Bare marks and
operators, no `chart()`, as in bluefish/Planets.
"""

from gofish import Constraint, Shape, arrow, circle, enclose, layer, spread, text
from python_stories.data import TUTORIAL_PLANETS


def story_diagrams():
    return (
        layer([
            enclose(
                [
                    spread(
                        [
                            circle(
                                r=d["r"],
                                fill=d["fill"],
                                stroke=d["stroke"],
                                stroke_width=3,
                            ).name(d["name"])
                            for d in TUTORIAL_PLANETS
                        ],
                        dir="x",
                        spacing=50,
                        alignment="middle",
                    ),
                ],
                padding=20,
                fill="#252150",
                stroke="none",
                shape=Shape.box(rx=16),
            ).name("planets"),
            text(text="Mercury", fill="#E94560", font_size=14).name("label"),
        ]).relate(lambda mercury, planets, label, **_: [
            Constraint.align([mercury, label], x="middle"),
            Constraint.distribute([planets, label], dir="y", spacing=20),
            arrow([label, mercury], stroke="#E94560"),
        ]),
        {},
    )
