"""Equivalent of Bin.stories.tsx — Forward Syntax/Bin."""

import math
from datetime import datetime, timedelta, timezone

from gofish import chart, rect, field, spread, stack, partition, table, Schema, Calendar, Bin, Color
from python_stories.data import SEATTLE_WEATHER

# Seventy-two movie ratings from 1 to 9.5, none from 2 to 2.5: a hump around
# 6.5 with a thin low tail.
MOVIES = [
    {"rating": r}
    for r in [
        1.2, 1.6, 1.8, 2.6, 2.9, 3.1, 3.4, 3.6, 3.8, 4.0, 4.1, 4.3, 4.4, 4.6,
        4.7, 4.8, 4.9, 5.0, 5.1, 5.2, 5.3, 5.3, 5.4, 5.5, 5.6, 5.6, 5.7, 5.8,
        5.9, 5.9, 6.0, 6.0, 6.1, 6.2, 6.2, 6.3, 6.3, 6.4, 6.4, 6.5, 6.5, 6.5,
        6.6, 6.6, 6.7, 6.7, 6.8, 6.8, 6.9, 6.9, 7.0, 7.0, 7.1, 7.2, 7.2, 7.3,
        7.4, 7.5, 7.6, 7.7, 7.8, 7.9, 8.0, 8.1, 8.2, 8.4, 8.5, 8.7, 8.9, 9.1,
        9.3, 9.5,
    ]
]


def story_rating_histogram():
    return (
        chart(MOVIES, axes=True)
        .flow(spread(by=field("rating").bin(Bin.step(0.5)), dir="x", spacing=1))
        .mark(rect(h=field("rating").count(), fill="steelblue")),
        {"w": 560, "h": 200},
    )


def _all_daily():
    """Daily sales in three regions from January to August 2024."""
    out = []
    t = datetime(2024, 1, 1, tzinfo=timezone.utc)
    end = datetime(2024, 8, 31, tzinfo=timezone.utc)
    i = 0
    while t <= end:
        date = t.strftime("%Y-%m-%d")
        for r, region in enumerate(["North", "South", "West"]):
            value = (
                10
                + 4 * math.sin(i / 20 + r)
                + 2 * math.sin(i / 3.1 + 2 * r)
                + 3 * r
            )
            out.append(
                {"date": date, "region": region, "value": round(value * 10) / 10}
            )
        t += timedelta(days=1)
        i += 1
    return out


ALL_DAILY = _all_daily()

# The same sales with none at all in April (the store was closed).
DAILY = [d for d in ALL_DAILY if not d["date"].startswith("2024-04")]


def story_monthly_bars():
    return (
        chart(DAILY, schema={"date": Schema.time()}, axes=True)
        .flow(spread(by=field("date").bin(Calendar.year).bin(Calendar.month), dir="x"))
        .mark(rect(h=field("value").sum(), fill="steelblue")),
        {"w": 560, "h": 200},
    )


def story_stacked_monthly_bars():
    return (
        chart(ALL_DAILY, schema={"date": Schema.time()}, axes=True)
        .flow(
            spread(by=field("date").bin(Calendar.year).bin(Calendar.month), dir="x"),
            stack(by="region", dir="y"),
        )
        .mark(rect(h=field("value").sum(), fill="region")),
        {"w": 560, "h": 200},
    )


def story_rating_histogram_continuous():
    return (
        chart(MOVIES, axes=True)
        .flow(partition(by=field("rating").bin(Bin.step(0.5)), dir="x"))
        .mark(rect(h=field("rating").count(), fill="steelblue", inset=0.5)),
        {"w": 560, "h": 200},
    )


def story_month_bars_true_widths():
    return (
        chart(ALL_DAILY, schema={"date": Schema.time()}, axes=True)
        .flow(partition(by=field("date").bin([Calendar.year, Calendar.month]), dir="x"))
        .mark(rect(h=field("value").sum(), fill="steelblue", inset=1)),
        {"w": 560, "h": 200},
    )


def story_stacked_month_bars_true_widths():
    return (
        chart(DAILY, schema={"date": Schema.time()}, axes=True)
        .flow(
            partition(by=field("date").bin(Calendar.year).bin(Calendar.month), dir="x"),
            stack(by="region", dir="y"),
        )
        .mark(rect(h=field("value").sum(), fill="region", inset=1)),
        {"w": 560, "h": 200},
    )


def story_grouped_month_bars_true_widths():
    return (
        chart(ALL_DAILY, schema={"date": Schema.time()}, axes=True)
        .flow(
            partition(by=field("date").bin([Calendar.year, Calendar.month]), dir="x"),
            spread(by="region", dir="x"),
        )
        .mark(rect(h=field("value").sum(), fill="region")),
        {"w": 560, "h": 200},
    )


# Seattle's daily weather, 2012 to 2015.
WEATHER = SEATTLE_WEATHER


def _between(start, end):
    """The days from `start` to `end` (ISO dates, `end` excluded)."""
    return [d for d in WEATHER if start <= d["date"] < end]


def story_seasonal_precipitation():
    return (
        chart(WEATHER, schema={"date": Schema.time()}, axes=True)
        .flow(spread(by=field("date").bin(Calendar.month), dir="x"))
        .mark(rect(h=field("precipitation").mean(), fill="steelblue")),
        {"w": 560, "h": 220},
    )


def story_month_bars_product():
    return (
        chart(
            _between("2014-07-01", "2015-07-01"),
            schema={"date": Schema.time()},
            axes={"x": {"label_angle": "auto"}, "y": True},
        )
        .flow(spread(by=field("date").bin([Calendar.year, Calendar.month]), dir="x"))
        .mark(rect(h=field("precipitation").sum(), fill="steelblue")),
        {"w": 600, "h": 220},
    )


def story_month_bars_chained():
    return (
        chart(
            _between("2014-01-01", "2016-01-01"),
            schema={"date": Schema.time()},
            axes=True,
        )
        .flow(spread(by=field("date").bin(Calendar.year).bin(Calendar.month), dir="x"))
        .mark(rect(h=field("precipitation").sum(), fill="steelblue")),
        {"w": 640, "h": 220},
    )


# The winter of 2014 to 2015: October to March.
WINTER = _between("2014-10-01", "2015-04-01")

# The kinds of weather, sunniest first.
BY_WEATHER = field("weather").sort(["sun", "fog", "drizzle", "rain", "snow"])


def story_grouped_month_bars():
    return (
        chart(
            WINTER,
            schema={"date": Schema.time()},
            axes={"x": {"label_angle": "auto"}, "y": True},
        )
        .flow(
            spread(
                by=field("date").bin(Calendar.year).bin(Calendar.month),
                dir="x",
                spacing=12,
            ),
            spread(by=BY_WEATHER, dir="x", spacing=1),
        )
        .mark(rect(h=field("weather").count(), fill="weather")),
        {"w": 640, "h": 240},
    )


def story_grouped_month_bars_hidden_inner():
    return (
        chart(
            WINTER,
            schema={"date": Schema.time()},
            axes={"x": {"levels": [False, True]}, "y": True},
        )
        .flow(
            spread(
                by=field("date").bin(Calendar.year).bin(Calendar.month),
                dir="x",
                spacing=12,
            ),
            spread(by=BY_WEATHER, dir="x", spacing=1),
        )
        .mark(rect(h=field("weather").count(), fill="weather")),
        {"w": 640, "h": 240},
    )


def story_month_bars_product_true_widths():
    return (
        chart(
            _between("2014-01-01", "2016-01-01"),
            schema={"date": Schema.time()},
            axes=True,
        )
        .flow(partition(by=field("date").bin([Calendar.year, Calendar.month]), dir="x"))
        .mark(rect(h=field("precipitation").sum(), fill="steelblue", inset=1)),
        {"w": 640, "h": 220},
    )


def story_weekday_temperature():
    return (
        chart(WEATHER, schema={"date": Schema.time()}, axes=True)
        .flow(spread(by=field("date").bin(Calendar.weekday), dir="x"))
        .mark(rect(h=field("temp_max").mean(), fill="steelblue")),
        {"w": 420, "h": 220},
    )


def story_calendar_heatmap():
    return (
        chart(
            WEATHER,
            schema={"date": Schema.time()},
            color=Color.gradient(["#fee8c8", "#fd8d3c", "#bd0026"]),
            axes={
                "x": {"title": False, "levels": [False, Calendar.month, Calendar.year]},
                "y": {"title": False},
            },
        )
        .flow(
            # Weeks from Sunday, as GitHub's calendar has them: 2012 starts
            # on a Sunday, so the first column is the first week of 2012.
            table(
                by={
                    "x": field("date").bin(Calendar.week(start="sunday")),
                    "y": field("date").bin(Calendar.weekday(start="sunday")),
                },
                spacing=1,
            )
        )
        .mark(rect(fill=field("temp_max").mean())),
        {"w": 1100, "h": 120},
    )
