"""Equivalent of EqualAspect.stories.tsx — Forward Syntax V3/Equal Aspect."""

import math

from gofish import chart, circle, gradient, scatter

GOLDEN_ANGLE = math.pi * (3 - math.sqrt(5))  # ≈ 137.5°

SUNFLOWER = [
    {
        "x": math.sqrt(i) * math.cos(i * GOLDEN_ANGLE),
        "y": math.sqrt(i) * math.sin(i * GOLDEN_ANGLE),
        "i": i,
    }
    for i in range(500)
]


def story_sunflower():
    # Chart-level `aspectRatio` couples the x/y data scales so the phyllotaxis
    # packing stays circular in a wide canvas (#582).
    return (
        chart(
            SUNFLOWER,
            aspectRatio="square",
            color=gradient(["#fde725", "#21918c", "#440154"]),
        )
        .flow(scatter(x="x", y="y"))
        .mark(circle(r=4, fill="i")),
        {"w": 640, "h": 380},
    )


def story_uncoupled():
    return (
        chart(SUNFLOWER, color=gradient(["#fde725", "#21918c", "#440154"]))
        .flow(scatter(x="x", y="y"))
        .mark(circle(r=4, fill="i")),
        {"w": 640, "h": 380},
    )
