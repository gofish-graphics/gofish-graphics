"""Vega-Lite/Normalized Stacked Bar Chart — mirrors NormalizedStackedBarChart.stories.tsx

https://vega.github.io/vega-lite/examples/stacked_bar_normalize.html

Population data normalized to proportions per age group, stacked by sex.
"""

from gofish import chart, spread, stack, derive, rect, palette

TITLE = "Vega-Lite/Normalized Stacked Bar Chart"

_COLOR = palette({"Female": "#675193", "Male": "#ca8861"})


def load_data():
    from stories.data.vega import load_population
    rows = load_population()
    return [r for r in rows if r["year"] == 2000]


def _recode_sex(data):
    return [{**r, "sex": "Male" if r["sex"] == 1 else "Female"} for r in data]


def _calc_proportion(data):
    total = sum(r["people"] for r in data)
    return [{**r, "proportion": r["people"] / total} for r in data]


def default(data=None, w=500, h=300):
    if data is None:
        data = load_data()
    return (
        chart(data, color=_COLOR)
        .flow(
            derive(_recode_sex),
            spread(by="age", dir="x"),
            derive(_calc_proportion),
            stack(by="sex", dir="y"),
        )
        .mark(rect(h="proportion", fill="sex"))
    )
