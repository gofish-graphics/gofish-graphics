"""Equivalent of BirdMigrationStatic.stories.tsx — Animated Vega-Lite/Bird Migration Static.

Panel A of the Animated Vega-Lite bird migration example: each species' daily
positions threaded into one path over a map of the Americas.
"""

from gofish import chart, group, line, polygon, scatter, Coord
from python_stories.bird_data import BIRDS, WORLD_110M


def story_a_static_lines():
    return (
        chart(
            WORLD_110M,
            coord=Coord.geo("equalEarth", lon=(-180, -58.7), lat=(-60, 84)),
            legend=False,
            w=600,
            h=600,
        )
        .mark(polygon(points="ring", fill="#f7f7f7", stroke="#aaa"))
        .layer(
            chart(BIRDS)
            .flow(group(by="species"), scatter(by="day", x="lon", y="lat"))
            .mark(line(stroke="species", stroke_width=1, opacity=0.5))
        ),
        {},
    )
