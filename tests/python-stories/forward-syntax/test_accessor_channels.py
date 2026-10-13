"""Equivalent of AccessorChannels.stories.tsx — Forward Syntax/Accessor Channels.

Python lambdas in size channels (#1080, #937). Each lambda reaches JS as an
async accessor that calls back into Python; the render must match the JS
story's plain accessors.
"""

import math

from gofish import Coord, chart, rect, spread
from python_stories.data import SEAFOOD


def story_bar_height():
    return (
        chart(SEAFOOD, axes=True)
        .flow(spread(by="lake", dir="x"))
        .mark(rect(h=lambda d: d["count"])),
        {"w": 400, "h": 300},
    )


def story_rose_radius():
    return (
        chart(SEAFOOD, coord=Coord.clock())
        .flow(spread(by="lake", dir="x", spacing=0))
        .mark(
            rect(
                w=(math.pi * 2) / 6,
                em_x=True,
                fill="lake",
                dims={"r": {"size": lambda d: math.sqrt(d["count"])}},
            )
        ),
        {"w": 400, "h": 400},
    )
