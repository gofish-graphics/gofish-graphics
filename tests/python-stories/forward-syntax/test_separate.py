"""Equivalent of Separate.stories.tsx — Forward Syntax/Separate."""

from gofish import chart, circle, scatter, spread, Overlap
from python_stories.data import PENGUINS

WEIGHED = [p for p in PENGUINS if p["Body Mass (g)"] is not None]


def story_penguin_mass():
    return (
        chart(WEIGHED)
        .flow(
            spread(by="Species", dir="y", spacing=16),
            scatter(
                x="Body Mass (g)",
                alignment="middle",
                overlap=Overlap.separate(padding=1),
            ),
        )
        .mark(circle(r=3, fill="Species")),
        {"w": 560, "h": 320},
    )


def story_one_sided():
    return (
        chart(WEIGHED)
        .flow(
            scatter(
                x="Body Mass (g)",
                alignment="start",
                overlap=Overlap.separate(padding=1),
            )
        )
        .mark(circle(r=3, fill="Species")),
        {"w": 560, "h": 200},
    )


def story_mixed_radii():
    return (
        chart(WEIGHED[:120])
        .flow(
            scatter(
                x="Flipper Length (mm)",
                alignment="middle",
                overlap=Overlap.separate(padding=1),
            )
        )
        .mark(
            lambda d: circle(
                r=2 + (d[0]["Body Mass (g)"] - 2700) / 600,
                fill="Species",
            )(d)
        ),
        {"w": 480, "h": 200},
    )
