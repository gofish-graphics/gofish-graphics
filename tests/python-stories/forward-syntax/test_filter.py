"""Equivalent of Filter.stories.tsx — Forward Syntax/Filter."""

from gofish import chart, circle, field, filter, scatter
from python_stories.data import PENGUINS


def story_field_between():
    return (
        chart(PENGUINS, axes=True)
        .flow(
            filter(field("Body Mass (g)").between(3500, 4500, closed="left")),
            scatter(x="Flipper Length (mm)", y="Beak Length (mm)"),
        )
        .mark(circle(r=3, fill="Species")),
        {"w": 400, "h": 300},
    )
