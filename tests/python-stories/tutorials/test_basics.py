"""Equivalent of tutorials/Basics.stories.tsx — Tutorials/Basics.

The finished example of the Basics tutorial: the four planets closest to the
sun, spread in a row and wrapped in a dark background. Bare marks and
operators, no `chart()`, as in bluefish/Planets.
"""

from gofish import background, circle, spread

PLANETS = [
    {"name": "mercury", "r": 15, "fill": "#F5E3C8", "stroke": "#EFC9A2"},
    {"name": "venus", "r": 36, "fill": "#D2913C", "stroke": "#A96F26"},
    {"name": "earth", "r": 38, "fill": "#3E8CCC", "stroke": "#2F6FA6"},
    {"name": "mars", "r": 21, "fill": "#F4BC80", "stroke": "#E0954C"},
]


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
                        for d in PLANETS
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
