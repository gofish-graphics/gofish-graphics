"""Equivalent of SemanticZoomHistogram.stories.tsx — Interaction/Semantic Zoom Histogram.

The mouse wheel re-bins a histogram. The binning is Python, in a `derive`
that reads the `wheel(...)` source (the kernel tier): the browser ships the
wheel's value with each call and re-runs the derive when it changes. The
caption is an expression, so it patches at paint without the kernel.
"""

import math

from gofish import chart, concat_str, derive, rect, spread, text, wheel
from python_stories.data import PENGUINS

MASS = "Body Mass (g)"


def bin_rows(rows, k):
    """Equal-width bins over the rows' masses, one row per bin, empty bins
    kept (as the JS `binRows`)."""
    masses = [p[MASS] for p in rows if p[MASS] is not None]
    lo, hi = min(masses), max(masses)
    width = (hi - lo) / k
    counts = [0] * k
    for m in masses:
        counts[min(k - 1, math.floor((m - lo) / width))] += 1
    # JS `Math.round` rounds a half up.
    return [
        {"bin": str(math.floor(lo + i * width + 0.5)), "count": c}
        for i, c in enumerate(counts)
    ]


def story_default():
    bins = wheel(range=[3, 40], initial=12, round=True)
    return (
        chart(PENGUINS)
        .flow(derive(lambda rows: bin_rows(rows, bins())), spread(by="bin", dir="x"))
        .mark(rect(h="count"))
        .layer(
            text(
                x=20,
                y=290,
                text=concat_str("bins: ", bins, " (scroll to re-bin)"),
                fill="#333",
            )
        ),
        {"w": 500, "h": 300},
    )
