"""Equivalent of Bar/StackedBarChart.stories.tsx — Vega-Lite/Stacked Bar Chart."""

from datetime import datetime, timezone

from gofish import chart, derive, spread, stack, log, rect, palette
from python_stories.vega_data_urls import read_csv

MONTHS = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
]
WEATHER_ORDER = ["sun", "fog", "drizzle", "rain", "snow"]


def _js_month_index(date_str: str) -> int:
    """Mirror JS `new Date(date_str).getMonth()`.

    JS parses bare "YYYY-MM-DD" strings as UTC midnight and `getMonth()`
    reads the LOCAL month — so in PST a "2012-02-01" string lands in
    January. Replicate that browser-local behavior so Python and JS group
    the same rows into the same months.
    """
    dt = datetime.strptime(date_str, "%Y-%m-%d").replace(tzinfo=timezone.utc)
    return dt.astimezone().month - 1


def _add_month(data):
    out = []
    for row in data:
        out.append({"month": MONTHS[_js_month_index(str(row["date"]))], **row})
    return out


def _sort_by_weather(data):
    if data and "weather" in data[0]:
        return sorted(data, key=lambda r: WEATHER_ORDER.index(r["weather"]))
    return data


def _collapse(data):
    return {"count": len(data), "weather": data[0]["weather"]}


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
            derive(_add_month),
            spread(by="month", dir="x"),
            derive(_sort_by_weather),
            stack(by="weather", dir="y"),
            log("spread data"),
            derive(_collapse),
        )
        .mark(rect(h="count", fill="weather")),
        {"w": 600, "h": 300, "axes": True},
    )
