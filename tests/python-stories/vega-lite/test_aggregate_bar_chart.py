"""Equivalent of Bar/AggregateBarChart.stories.tsx — Vega-Lite/Aggregate Bar Chart.

JS dropped its unused `derive`/`groupBy`/`sumBy` imports in the
story-simplifications pass; this port never had those dead imports, so
nothing here changes.
"""

from gofish import chart, spread, rect
from vega_datasets import data as vega_data


def story_default():
    population = vega_data.population()
    year2000 = population[population["year"] == 2000]
    return (
        chart(year2000)
        .flow(spread(by="age", dir="y", reverse=True))
        .mark(rect(w="people")),
        {"w": 500, "h": 300, "axes": True},
    )
