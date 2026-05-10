"""Equivalent of Heatmap.stories.tsx — Forward Syntax V3/Heatmap."""

from gofish import chart, table, rect, gradient
from python_stories.data import HEATMAP_DATA


def story_default():
    return (
        chart(HEATMAP_DATA, {"color": gradient(["#ffffcc", "#fd8d3c", "#bd0026"])})
        .flow(table(by={"x": "hour", "y": "day"}, spacing=4))
        .mark(rect(fill="value")),
        {"w": 600, "h": 400, "axes": True},
    )
