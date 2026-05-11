"""Equivalent of Bar/StackedBarChartRounded.stories.tsx — Vega-Lite/Stacked Bar Chart (Rounded Corners)."""

from collections import OrderedDict
from datetime import datetime, timezone

from gofish import chart, derive, spread, stack, rect, palette
from python_stories.vega_data_urls import read_csv

MONTHS = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
]


def _js_month_index(date_str: str) -> int:
    """Mirror JS `new Date(date_str).getMonth()` — see test_stacked_bar_chart.py."""
    dt = datetime.strptime(date_str, "%Y-%m-%d").replace(tzinfo=timezone.utc)
    return dt.astimezone().month - 1


def _aggregate(data):
    # Mirror the JS: groupBy(month) → groupBy(weather) → counts; iterate
    # months in calendar order, weather in natural data order (JS uses
    # lodash's groupBy which preserves insertion order).
    by_month: "OrderedDict[str, OrderedDict[str, int]]" = OrderedDict()
    for row in data:
        month = MONTHS[_js_month_index(str(row["date"]))]
        weather = row["weather"]
        if month not in by_month:
            by_month[month] = OrderedDict()
        by_month[month][weather] = by_month[month].get(weather, 0) + 1

    result = []
    for month in MONTHS:
        if month not in by_month:
            continue
        for weather, count in by_month[month].items():
            result.append({"month": month, "weather": weather, "count": count})
    return result


def story_default():
    df = read_csv("seattle-weather.csv")
    weather = df.to_dict("records")
    return (
        chart(
            weather,
            color=palette({
                "sun": "#e7ba52",
                "fog": "#dfdfdf",
                "drizzle": "#79a1d5",
                "rain": "#1f77b4",
                "snow": "#9467bd",
            }),
        )
        .flow(
            derive(_aggregate),
            spread(by="month", dir="x"),
            stack(by="weather", dir="y"),
        )
        .mark(rect(h="count", fill="weather", rx=3, ry=3)),
        {"w": 600, "h": 300, "axes": True},
    )
