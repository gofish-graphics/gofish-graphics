"""Equivalent of bluefish/Planets.stories.tsx — Bluefish/Planets.

All six exports port directly now that the Python wrapper exposes the
necessary low-level combinators (`layer`, `spread([marks], ...)`, `arrow`)
and leaves (`text(text=...)`, `ref(name)`). The shared `PLANETS` constant
mirrors the JS file. Where JS uses `For(planets, planet => ellipse({...}))`,
Python uses a list comprehension to the same effect.
"""

from gofish import arrow, ellipse, layer, ref, spread, text

PLANETS = [
    {"name": "Mercury", "radius": 15, "color": "#EBE3CF"},
    {"name": "Venus", "radius": 36, "color": "#DC933C"},
    {"name": "Earth", "radius": 38, "color": "#179DD7"},
    {"name": "Mars", "radius": 21, "color": "#F1CF8E"},
]


def _planet_row():
    """The horizontal spread of planet ellipses shared by every story."""
    return spread(
        [
            ellipse(
                w=p["radius"] * 2,
                h=p["radius"] * 2,
                fill=p["color"],
                stroke="#333",
                strokeWidth=3,
            ).name(p["name"])
            for p in PLANETS
        ],
        dir="x",
        spacing=50,
        alignment="middle",
    )


def story_planets_only():
    return _planet_row(), {}


def story_planets_with_label_above():
    return (
        layer([
            _planet_row(),
            spread(
                [ref("Mercury"), text(text="Mercury")],
                dir="y",
                spacing=60,
                alignment="middle",
            ),
        ]),
        {},
    )


def story_planets_with_label_below():
    return (
        layer([
            _planet_row(),
            spread(
                [text(text="Mercury"), ref("Mercury")],
                dir="y",
                spacing=60,
                alignment="middle",
            ),
        ]),
        {},
    )


def story_planets_with_label_above_no_spacing():
    return (
        layer([
            _planet_row(),
            spread(
                [ref("Mercury"), text(text="Mercury", debugBoundingBox=True)],
                dir="y",
                spacing=0,
                alignment="middle",
            ),
        ]),
        {},
    )


def story_planets_with_label_below_no_spacing():
    return (
        layer([
            _planet_row(),
            spread(
                [text(text="Mercury", debugBoundingBox=True), ref("Mercury")],
                dir="y",
                spacing=0,
                alignment="middle",
            ),
        ]),
        {},
    )


def story_planets_with_arrow():
    return (
        layer([
            _planet_row(),
            spread(
                [text(text="Mercury").name("label"), ref("Mercury")],
                dir="y",
                spacing=60,
                alignment="middle",
            ),
            arrow([ref("label"), ref("Mercury")]),
        ]),
        {},
    )
