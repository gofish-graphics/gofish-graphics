"""Equivalent of Bar/AggregateBarChartSorted.stories.tsx — Vega-Lite/Aggregate Bar Chart (Sorted)."""

from gofish import chart, derive, spread, rect
from vega_datasets import data as vega_data


def _aggregate_and_sort(data):
    totals = {}
    for row in data:
        totals[row["age"]] = totals.get(row["age"], 0) + row["people"]
    aggregated = [{"age": age, "people": people} for age, people in totals.items()]
    return sorted(aggregated, key=lambda r: r["people"], reverse=True)


def story_default():
    population = vega_data.population()
    year2000 = population[population["year"] == 2000].to_dict("records")
    return (
        chart(year2000)
        .flow(
            derive(_aggregate_and_sort),
            spread(by="age", dir="y", reverse=True),
        )
        .mark(rect(w="people")),
        {"w": 500, "h": 300, "axes": True},
    )
