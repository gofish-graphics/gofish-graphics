"""Equivalent of Separate.stories.tsx — Forward Syntax/Separate."""

from gofish import chart, circle, scatter, spread, Overlap
from python_stories.data import PENGUINS

WEIGHED = [p for p in PENGUINS if p["Body Mass (g)"] is not None]


def story_penguin_mass():
    return (
        chart(WEIGHED, w=560)
        .flow(
            spread(by="Species", dir="y", spacing=16),
            scatter(
                x="Body Mass (g)",
                alignment="middle",
                overlap=Overlap.separate(padding=1),
            ),
        )
        .mark(circle(r=3, fill="Species")),
        {},
    )


def story_one_sided():
    return (
        chart(WEIGHED, w=560, h=200)
        .flow(
            scatter(
                x="Body Mass (g)",
                alignment="start",
                overlap=Overlap.separate(padding=1),
            )
        )
        .mark(circle(r=3, fill="Species")),
        {},
    )


def story_mixed_radii():
    return (
        chart(WEIGHED[:120], w=480, h=200)
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
        {},
    )
