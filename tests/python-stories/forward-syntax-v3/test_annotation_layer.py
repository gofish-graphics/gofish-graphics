"""Equivalent of AnnotationLayer.stories.tsx — Forward Syntax V3/Annotation Layer."""

from gofish import chart, spread, rect, text, datum

DATA = [
    {"cat": "a", "count": 30},
    {"cat": "b", "count": 80},
    {"cat": "c", "count": 55},
    {"cat": "d", "count": 72},
]


def story_default():
    return (
        chart(DATA, axes=True)
        .flow(spread(by="cat", dir="x"))
        .mark(rect(h="count", fill="#6b9bd1"))
        # Threshold rule: a bare rect tier; `datum(60)` is a data-space count value.
        .layer(rect(y=datum(60), h=3, w=400, fill="#333"))
        # Caption: a bare text tier.
        .layer(text(x=20, y=24, text="threshold: 60", fill="#333")),
        {"w": 400, "h": 300, "axes": True},
    )
