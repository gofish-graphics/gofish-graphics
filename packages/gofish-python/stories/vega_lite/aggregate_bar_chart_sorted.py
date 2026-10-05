"""Vega-Lite/Aggregate Bar Chart (Sorted) — mirrors AggregateBarChartSorted.stories.tsx

https://vega.github.io/vega-lite/examples/bar_aggregate_sort_by_encoding.html

Pre-aggregates people by age group, sorts descending, then spreads.
"""

from collections import defaultdict
from gofish import chart, spread, derive, rect

TITLE = "Vega-Lite/Aggregate Bar Chart (Sorted)"


def load_data():
    from stories.data.vega import load_population
    rows = load_population()
    return [r for r in rows if r["year"] == 2000]


def _aggregate_and_sort(data):
    groups = defaultdict(list)
    for row in data:
        groups[str(row["age"])].append(row)
    aggregated = [
        {"age": age, "people": sum(r["people"] for r in rows)}
        for age, rows in groups.items()
    ]
    return sorted(aggregated, key=lambda r: r["people"], reverse=True)


def default(data=None, w=500, h=300):
    if data is None:
        data = load_data()
    return (
        chart(data)
        .flow(
            derive(_aggregate_and_sort),
            spread(by="age", dir="y"),
        )
        .mark(rect(w="people"))
    )
