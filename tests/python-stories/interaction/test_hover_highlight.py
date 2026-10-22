"""Equivalent of HoverHighlight.stories.tsx — Interaction/Hover Highlight.

The bar under the pointer turns red: a `pointer()` read in the fill
expression, evaluated by the browser at paint. Captured at rest, with the
pointer off the chart.
"""

from gofish import chart, pointer, rect, spread, when
from python_stories.data import SEAFOOD


def story_default():
    hover = pointer()
    return (
        chart(SEAFOOD)
        .flow(spread(by="lake", dir="x"))
        .mark(rect(h="count", fill=when(hover.over).then("#d62728").otherwise("#6b9bd1"))),
        {"w": 400, "h": 400},
    )
