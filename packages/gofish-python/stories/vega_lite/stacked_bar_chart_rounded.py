"""Vega-Lite/Stacked Bar Chart (Rounded Corners) — mirrors StackedBarChartRounded.stories.tsx

https://vega.github.io/vega-lite/examples/stacked_bar_count_corner_radius_mark.html

Note: rx/ry applies the same radius to all corners. Per-corner radius
(cornerRadiusTopLeft etc.) is not yet supported — same limitation as JS story.
"""

from collections import defaultdict
from gofish import chart, spread, stack, derive, rect, palette

TITLE = "Vega-Lite/Stacked Bar Chart (Rounded Corners)"

MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
          "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

_COLOR = palette({
    "sun": "#e7ba52",
    "fog": "#dfdfdf",
    "drizzle": "#79a1d5",
    "rain": "#1f77b4",
    "snow": "#9467bd",
})


def load_data():
    from stories.data.vega import load_seattle_weather
    return load_seattle_weather()


def _aggregate_by_month_weather(data):
    from datetime import datetime
    result = []
    by_month = defaultdict(list)
    for row in data:
        month = MONTHS[datetime.strptime(row["date"], "%Y-%m-%d").month - 1]
        by_month[month].append(row["weather"])

    for month in MONTHS:
        if month not in by_month:
            continue
        by_weather = defaultdict(int)
        for w in by_month[month]:
            by_weather[w] += 1
        for weather, count in by_weather.items():
            result.append({"month": month, "weather": weather, "count": count})
    return result


def default(data=None, w=600, h=300):
    if data is None:
        data = load_data()
    return (
        chart(data, color=_COLOR)
        .flow(
            derive(_aggregate_by_month_weather),
            spread(by="month", dir="x"),
            stack(by="weather", dir="y"),
        )
        .mark(rect(h="count", fill="weather", rx=3, ry=3))
    )
