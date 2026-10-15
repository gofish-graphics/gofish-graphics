"""Equivalent of ColoredScatterPlot.stories.tsx — Vega-Lite/Colored Scatter Plot."""

import pandas as pd

from gofish import layer, chart, scatter, circle

# vega_datasets' Python package predates penguins.json; pull the same
# file the JS storybook loads via vega-datasets.
PENGUINS_URL = "https://vega.github.io/vega-datasets/data/penguins.json"


def story_default():
    raw = pd.read_json(PENGUINS_URL)
    cleaned = raw.dropna(subset=["Flipper Length (mm)", "Body Mass (g)", "Species"])
    # Pass the DataFrame, not to_dict("records"): records turn a missing
    # "Sex" into NaN, a number in a text column, which chart() rejects.
    penguins = cleaned.reset_index(drop=True)
    penguins["id"] = penguins.index

    charts = [
        chart(penguins[penguins["Species"] == species].reset_index(drop=True))
        .flow(
            scatter(
                by="id",
                x="Flipper Length (mm)",
                y="Body Mass (g)",
            )
        )
        .mark(
            circle(
                r=4,
                stroke="Species",
                fill="Species",
                stroke_width=3,
            )
        )
        for species in penguins["Species"].unique()
    ]

    return (
        layer(charts),
        {"w": 300, "h": 300, "axes": True},
    )
