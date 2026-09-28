"""Equivalent of bluefish/Planets.stories.tsx — Bluefish/Planets.

All six exports port directly now that the Python wrapper exposes the
necessary low-level combinators (`layer`, `spread([marks], ...)`, `arrow`)
and leaves (`text(text=...)`, `ref(name)`); the label column and the arrow
are `.relate()` clauses over the planet row's names. The shared `PLANETS` constant
mirrors the JS file. Where JS uses `map(planets, planet => ellipse({...}))`,
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
        layer([_planet_row()]).relate(
            lambda Mercury: [
                spread(
                    [text(text="Mercury"), Mercury],
                    dir="y",
                    spacing=60,
                    alignment="middle",
                ),
            ]
        ),
        {},
    )


def story_planets_with_label_below():
    return (
        layer([_planet_row()]).relate(
            lambda Mercury: [
                spread(
                    [Mercury, text(text="Mercury")],
                    dir="y",
                    spacing=60,
                    alignment="middle",
                ),
            ]
        ),
        {},
    )


def story_planets_with_label_above_no_spacing():
    return (
        layer([_planet_row()]).relate(
            lambda Mercury: [
                spread(
                    [text(text="Mercury", debugBoundingBox=True), Mercury],
                    dir="y",
                    spacing=0,
                    alignment="middle",
                ),
            ]
        ),
        {},
    )


def story_planets_with_label_below_no_spacing():
    return (
        layer([_planet_row()]).relate(
            lambda Mercury: [
                spread(
                    [Mercury, text(text="Mercury", debugBoundingBox=True)],
                    dir="y",
                    spacing=0,
                    alignment="middle",
                ),
            ]
        ),
        {},
    )


def story_planets_with_arrow():
    return (
        layer([_planet_row()]).relate(
            lambda Mercury: [
                spread(
                    [text(text="Mercury").name("label"), Mercury],
                    dir="y",
                    spacing=60,
                    alignment="middle",
                ),
                arrow([ref("label"), Mercury]),
            ]
        ),
        {},
    )
