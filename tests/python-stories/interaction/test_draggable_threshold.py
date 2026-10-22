"""Equivalent of DraggableThreshold.stories.tsx — Interaction/Draggable Threshold.

A drag sets a threshold: the rule moves with it (a re-layout) and the bars
above it turn red (a paint patch). `cut` is an expression over the drag,
clamped to the plot and 60 before the first drag, which is the state the
capture draws.
"""

from gofish import chart, drag, field, rect, spread, when

DATA = [
    {"cat": "a", "count": 30},
    {"cat": "b", "count": 95},
    {"cat": "c", "count": 55},
    {"cat": "d", "count": 72},
    {"cat": "e", "count": 40},
    {"cat": "f", "count": 88},
]


def story_default():
    w = 500
    dr = drag()
    cut = dr.y.clip(0, 95).fill_null(60)
    return (
        chart(DATA)
        .flow(spread(by="cat", dir="x"))
        .mark(
            rect(
                h="count",
                fill=when(field("count").sum() > cut).then("#d62728").otherwise("#6b9bd1"),
            )
        )
        .layer(rect(y=cut, h=3, w=w, fill="#333")),
        {"w": w, "h": 360},
    )
