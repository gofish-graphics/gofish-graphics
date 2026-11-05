"""Equivalent of CircleArea.stories.tsx — Forward Syntax/Circle Area.

Circles sized by area (#972): the `area` channel sums a group's rows and
hands the circle the square root of the sum, so each circle's area is
proportional to the lake's catch.
"""

from gofish import chart, circle, spread
from python_stories.data import SEAFOOD


def story_by_area():
    return (
        chart(SEAFOOD, w=500, h=200)
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
