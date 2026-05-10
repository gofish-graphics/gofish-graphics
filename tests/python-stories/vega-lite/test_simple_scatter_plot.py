"""Equivalent of ScatterPlot.stories.tsx — Vega-Lite/Simple Scatter Plot."""

from gofish import chart, scatter, circle, log
from vega_datasets import data as vega_data


def story_default():
    cars = vega_data.cars().dropna(subset=["Horsepower", "Miles_per_Gallon"])
    return (
        chart(cars)
        .flow(
            log("cars before scatter"),
            scatter(by="Name", x="Horsepower", y="Miles_per_Gallon", debug=True),
        )
        .mark(
            circle(
                r=4,
                fill="rgba(31, 119, 180, 0.4)",
                stroke="#1f77b4",
                strokeWidth=1,
            )
        ),
        {"w": 300, "h": 300, "axes": True},
    )
