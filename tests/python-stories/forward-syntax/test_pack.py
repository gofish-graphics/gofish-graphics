"""Equivalent of Pack.stories.tsx — Forward Syntax/Pack."""

from gofish import chart, circle, circles, pack
from python_stories.data import SEAFOOD


def story_nested():
    return (
        chart(SEAFOOD)
        .flow(pack(by="lake"), pack(method=circles()))
        .mark(circle(r=12, fill="species")),
        {"w": 420, "h": 420},
    )
