"""Vega-Lite/Stacked Bar Chart — mirrors StackedBarChart.stories.tsx

https://vega.github.io/vega-lite/examples/stacked_bar_weather.html

Seattle weather data: count of days per weather type per month.
"""

from gofish import chart, spread, stack, derive, rect, palette

TITLE = "Vega-Lite/Stacked Bar Chart"

MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
          "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

WEATHER_ORDER = ["sun", "fog", "drizzle", "rain", "snow"]

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


def _add_month(data):
    from datetime import datetime
    return [
        {**r, "month": MONTHS[datetime.strptime(r["date"], "%Y-%m-%d").month - 1]}
        for r in data
    ]


def _sort_weather(data):
    if data and "weather" in data[0]:
        return sorted(data, key=lambda r: WEATHER_ORDER.index(r["weather"])
                      if r["weather"] in WEATHER_ORDER else 99)
    return data


def _count_rows(data):
    return {"count": len(data), "weather": data[0]["weather"]}


def default(data=None, w=600, h=300):
    if data is None:
        data = load_data()
    return (
        chart(data, color=_COLOR)
        .flow(
            derive(_add_month),
            spread(by="month", dir="x"),
            derive(_sort_weather),
            stack(by="weather", dir="y"),
            derive(_count_rows),
        )
        .mark(rect(h="count", fill="weather"))
    )
