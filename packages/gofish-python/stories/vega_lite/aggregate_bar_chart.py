"""Vega-Lite/Aggregate Bar Chart — mirrors AggregateBarChart.stories.tsx

https://vega.github.io/vega-lite/examples/bar_aggregate.html

Data: population.json filtered to year == 2000.
Each row is one age group with an aggregate people count.
"""

from gofish import chart, spread, rect

TITLE = "Vega-Lite/Aggregate Bar Chart"


def load_data():
    from stories.data.vega import load_population
    rows = load_population()
    return [r for r in rows if r["year"] == 2000]


def default(data=None, w=500, h=300):
    if data is None:
        data = load_data()
    return (
        chart(data)
        .flow(spread(by="age", dir="y"))
        .mark(rect(w="people"))
    )
