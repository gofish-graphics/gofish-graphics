"""Equivalent of CircleArea.stories.tsx — Forward Syntax/Circle Area.

Circles sized by area (#972): the `area` channel sums a group's rows and
hands the circle the square root of the sum, so each circle's area is
proportional to the lake's catch. The by-area chart's y axis is off until a
count axis on a square-root scale exists (#14).
"""

from gofish import chart, circle, spread
from python_stories.data import SEAFOOD


def story_by_area():
    # TODO(#14): a count axis on a square-root scale, then turn y back on.
    return (
        chart(SEAFOOD, w=500, h=200, axes={"x": True, "y": False})
        .flow(spread(by="lake", dir="x", spacing=8))
        .mark(circle(area="count", fill="lake")),
        {},
    )


def story_by_radius():
    return (
        chart(SEAFOOD, w=500, h=200)
        .flow(spread(by="lake", dir="x", spacing=8))
        .mark(circle(r="count", fill="lake")),
        {},
    )
