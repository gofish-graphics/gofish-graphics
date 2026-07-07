"""Equivalent of ColoredScatterPlot.stories.tsx — Vega-Lite/Colored Scatter Plot."""

import pandas as pd

from gofish import layer, chart, scatter, circle

# vega_datasets' Python package predates penguins.json; pull the same
# file the JS storybook loads via vega-datasets.
PENGUINS_URL = "https://vega.github.io/vega-datasets/data/penguins.json"


def story_default():
    raw = pd.read_json(PENGUINS_URL)
    cleaned = raw.dropna(subset=["Flipper Length (mm)", "Body Mass (g)", "Species"])
    penguins = cleaned.reset_index(drop=True).to_dict("records")
    for i, row in enumerate(penguins):
        row["id"] = i

    species_list = []
    seen = set()
    for row in penguins:
        if row["Species"] not in seen:
            seen.add(row["Species"])
            species_list.append(row["Species"])

    charts = [
        chart([row for row in penguins if row["Species"] == species])
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
                strokeWidth=3,
            )
        )
        for species in species_list
    ]

    return (
        layer(charts),
        {"w": 300, "h": 300, "axes": True},
    )
