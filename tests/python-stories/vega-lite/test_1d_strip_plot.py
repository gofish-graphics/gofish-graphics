"""Equivalent of 1DStripPlot.stories.tsx — Vega-Lite/1D Strip Plot."""

from gofish import chart, scatter, rect
from vega_datasets import data as vega_data


def story_default():
    weather = vega_data.seattle_weather()
    return (
        chart(weather)
        .flow(scatter(by="date", x="precipitation"))
        .mark(rect(w=1, h=10, fill="rgb(31, 119, 180)", opacity=0.7)),
        {"w": 300, "h": 0, "axes": True},
    )
