"""Equivalent of Bar/AggregateBarChartSorted.stories.tsx — Vega-Lite/Aggregate Bar Chart (Sorted)."""

from gofish import chart, field, spread, rect
from vega_datasets import data as vega_data


def story_default():
    population = vega_data.population()
    year2000 = population[population["year"] == 2000].to_dict("records")
    return (
        chart(year2000)
        .flow(spread(by=field("age").sort("people", "desc"), dir="y", reverse=True))
        .mark(rect(w="people")),
        {"w": 500, "h": 300, "axes": True},
    )
