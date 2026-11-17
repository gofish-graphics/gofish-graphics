"""Equivalent of AccessorChannels.stories.tsx — Forward Syntax/Accessor Channels.

Python lambdas in size channels (#1080, #937). Each lambda reaches JS as an
async accessor that calls back into Python; the render must match the JS
story's plain accessors. A lambda's value means what it would written in the
channel, so it returns `datum(...)` for data (a bare number would be pixels).
"""

import math

from gofish import Coord, chart, datum, rect, spread
from python_stories.data import SEAFOOD


def story_bar_height():
    return (
        chart(SEAFOOD, w=400, h=300)
        .flow(spread(by="lake", dir="x"))
        .mark(rect(h=lambda d: datum(d["count"]))),
        {},
    )


def story_rose_radius():
    return (
        chart(SEAFOOD, coord=Coord.clock(), w=400, h=400)
        .flow(spread(by="lake", dir="x", spacing=0))
        .mark(
            rect(
                w=(math.pi * 2) / 6,
                em_x=True,
                fill="lake",
                dims={"r": {"size": lambda d: datum(math.sqrt(d["count"]))}},
            )
        ),
        {},
    )
