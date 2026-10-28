"""Equivalent of Heatmap.stories.tsx — Forward Syntax/Heatmap."""

from gofish import chart, table, rect, Color
from python_stories.data import HEATMAP_DATA


def story_default():
    return (
        chart(
            HEATMAP_DATA,
            color=Color.gradient(["#ffffcc", "#fd8d3c", "#bd0026"]),
            w=600,
            h=400,
        )
        .flow(table(by={"x": "hour", "y": "day"}, spacing=4))
        .mark(rect(fill="value")),
        {},
    )
