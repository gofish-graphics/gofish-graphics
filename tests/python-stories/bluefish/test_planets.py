"""Equivalent of bluefish/Planets.stories.tsx::PlanetsOnly — Bluefish/Planets.

PlanetsOnly is the simplest export in the file: pure low-level composition
of a `spread` combinator over per-planet `ellipse` children, rendered
directly (no Chart wrapper). The other Planets exports (labels, arrows)
need additional low-level primitives (`layer`, `text`, `ref`, `arrow`)
that the Python wrapper doesn't yet expose — those stay per-export exempt.

JS uses `For(planets, planet => ellipse({...}))` to produce the children;
Python uses a list comprehension to the same effect.
"""

from gofish import ellipse, spread

PLANETS = [
    {"name": "Mercury", "radius": 15, "color": "#EBE3CF"},
    {"name": "Venus", "radius": 36, "color": "#DC933C"},
    {"name": "Earth", "radius": 38, "color": "#179DD7"},
    {"name": "Mars", "radius": 21, "color": "#F1CF8E"},
]


def story_planets_only():
    return (
        spread(
            [
                ellipse(
                    w=p["radius"] * 2,
                    h=p["radius"] * 2,
                    fill=p["color"],
                    stroke="#333",
                    strokeWidth=3,
                )
                for p in PLANETS
            ],
            dir="x",
            spacing=50,
            alignment="middle",
        ),
        {"w": 800, "h": 200},
    )
