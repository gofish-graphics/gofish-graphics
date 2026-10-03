"""Equivalent of Jitter.stories.tsx — Forward Syntax/Jitter."""

from gofish import chart, circle, jitter, scatter, spread
from python_stories.data import PENGUINS

WEIGHED = [p for p in PENGUINS if p["Body Mass (g)"] is not None]


def story_penguin_mass():
    return (
        chart(WEIGHED, axes=True)
        .flow(
            spread(by="Species", dir="y", spacing=16),
            scatter(x="Body Mass (g)", alignment="middle", overlap=jitter()),
        )
        .mark(circle(r=3, fill="Species")),
        {"w": 560, "h": 320},
    )
