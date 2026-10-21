"""Equivalent of Pack.stories.tsx — Forward Syntax/Pack."""

import math

from gofish import chart, circle, pack
from python_stories.data import SEAFOOD


def story_nested():
    return (
        chart(SEAFOOD)
        .flow(pack(by="lake"), pack())
        .mark(circle(r=12, fill="species")),
        {"w": 420, "h": 420},
    )


def story_nested_by_count():
    return (
        chart(SEAFOOD)
        .flow(pack(by="lake"), pack())
        .mark(lambda d: circle(r=3 * math.sqrt(d[0]["count"]), fill="species")(d)),
        {"w": 420, "h": 420},
    )
