"""Equivalent of tutorials/Basics.stories.tsx — Tutorials/Basics.

The finished example of the Basics tutorial: the four planets closest to the
sun, spread in a row and wrapped in a dark background. Bare marks and
operators, no `chart()`, as in bluefish/Planets.
"""

from gofish import background, circle, spread
from python_stories.data import TUTORIAL_PLANETS


def story_basics():
    return (
        background(
            [
                spread(
                    [
                        circle(
                            r=d["r"],
                            fill=d["fill"],
                            stroke=d["stroke"],
                            stroke_width=3,
                        )
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
            rx=16,
            ry=16,
        ),
        {"w": 410, "h": 116},
    )
