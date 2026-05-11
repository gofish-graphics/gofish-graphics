"""Equivalent of Bar/NormalizedStackedBarChart.stories.tsx — Vega-Lite/Normalized Stacked Bar Chart."""

from gofish import chart, derive, spread, stack, rect, palette
from vega_datasets import data as vega_data


def _map_sex(data):
    return [
        {**row, "sex": "Male" if row["sex"] == 1 else "Female"}
        for row in data
    ]


def _add_proportion(data):
    total = sum(row["people"] for row in data)
    if total == 0:
        return data
    return [{**row, "proportion": row["people"] / total} for row in data]


def story_default():
    population = vega_data.population()
    year2000 = population[population["year"] == 2000].to_dict("records")
    return (
        chart(
            year2000,
            {"color": palette({"Female": "#675193", "Male": "#ca8861"})},
        )
        .flow(
            derive(_map_sex),
            spread(by="age", dir="x"),
            derive(_add_proportion),
            stack(by="sex", dir="y"),
        )
        .mark(rect(h="proportion", fill="sex")),
        {"w": 500, "h": 300, "axes": True},
    )
