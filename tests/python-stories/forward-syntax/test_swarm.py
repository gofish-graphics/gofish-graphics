"""Equivalent of Swarm.stories.tsx — Forward Syntax/Swarm."""

from gofish import chart, circle, scatter, spread, swarm
from python_stories.data import PENGUINS

WEIGHED = [p for p in PENGUINS if p["Body Mass (g)"] is not None]


def story_penguin_mass():
    return (
        chart(WEIGHED, axes=True)
        .flow(
            spread(by="Species", dir="y", spacing=16),
            scatter(
                x="Body Mass (g)",
                alignment="middle",
                overlap=swarm(padding=1),
            ),
        )
        .mark(circle(r=3, fill="Species")),
        {"w": 560, "h": 320},
    )


def story_one_sided():
    return (
        chart(WEIGHED, axes=True)
        .flow(
            scatter(
                x="Body Mass (g)",
                alignment="start",
                overlap=swarm(padding=1),
            )
        )
        .mark(circle(r=3, fill="Species")),
        {"w": 560, "h": 200},
    )
