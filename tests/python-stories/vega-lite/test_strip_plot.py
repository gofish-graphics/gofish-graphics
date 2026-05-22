"""Equivalent of StripPlot.stories.tsx — Vega-Lite/Strip Plot."""

from gofish import chart, scatter, rect, spread, derive
from vega_datasets import data as vega_data


def story_default():
    raw = vega_data.cars().dropna(subset=["Horsepower", "Cylinders"])
    cars = [
        {
            "name": row["Name"],
            "horsepower": row["Horsepower"],
            "cylinders": int(round(row["Cylinders"])),
        }
        for _, row in raw.iterrows()
    ]
    return (
        chart(cars)
        .flow(
            derive(lambda d: sorted(d, key=lambda r: r["cylinders"], reverse=True)),
            spread(by="cylinders", dir="y"),
            scatter(x="horsepower"),
        )
        .mark(rect(w=1, h=10, fill="rgb(31, 119, 180)", opacity=0.7)),
        {"w": 400, "h": 300, "axes": True},
    )
