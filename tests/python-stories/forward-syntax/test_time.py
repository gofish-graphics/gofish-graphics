"""Equivalent of Time.stories.tsx — Forward Syntax/Time.

QuarterlyBars is exempt: its row labels come from a JS format function.
"""

import math
from datetime import datetime, timedelta, timezone

from gofish import chart, scatter, line, circle, Schema, Calendar

DAY = timedelta(days=1)


def _prices():
    t = datetime(2023, 11, 1, tzinfo=timezone.utc)
    end = datetime(2024, 12, 31, tzinfo=timezone.utc)
    out = []
    i = 0
    while t <= end:
        p = (
            100
            + 6 * math.sin(i / 45)
            + 2.5 * math.sin(i / 9.3)
            + 1.2 * math.sin(i / 2.7)
            + 0.6 * math.sin(i * 1.9)
        )
        out.append({"date": t.strftime("%Y-%m-%d"), "price": round(p * 100) / 100})
        t += DAY
        i += 1
    return out


PRICES = _prices()


def _readings():
    start = datetime(2024, 2, 28, tzinfo=timezone.utc)
    out = []
    for h in range(85):
        temp = 4 - 5 * math.cos(((h - 3) / 24) * 2 * math.pi) + 0.4 * math.sin(h * 1.7)
        out.append(
            {"time": start + timedelta(hours=h), "temp": round(temp * 10) / 10}
        )
    return out


# Datetimes: a datetime column is a time without a schema entry.
READINGS = _readings()

# Hourly readings in New York across the spring daylight saving change, as
# epoch milliseconds read in the schema's zone.
NEW_YORK = [
    {
        "time": 1709960400000 + h * 3600000,  # Mar 9 2024, midnight in New York
        "load": round(50 + 30 * math.sin((h / 24) * 2 * math.pi)),
    }
    for h in range(72)
]

RELEASES = [
    {"name": name, "date": date}
    for name, date in [
        ("v1.0", "2018-03-12"),
        ("v1.1", "2018-09-03"),
        ("v1.2", "2019-02-18"),
        ("v2.0", "2019-10-07"),
        ("v2.1", "2020-05-25"),
        ("v2.2", "2020-12-01"),
        ("v3.0", "2021-08-16"),
        ("v3.1", "2022-04-04"),
        ("v3.2", "2022-10-31"),
        ("v4.0", "2023-06-19"),
        ("v4.1", "2024-01-08"),
        ("v5.0", "2024-06-24"),
    ]
]


def _visits():
    start = datetime(2024, 1, 22, tzinfo=timezone.utc)
    return [
        {
            "day": (start + i * DAY).strftime("%Y-%m-%d"),
            "visits": round(
                120 + 40 * math.sin((i / 7) * 2 * math.pi) + 15 * math.sin(i * 1.3)
            ),
        }
        for i in range(70)
    ]


VISITS = _visits()


def story_daily_line():
    return (
        chart(PRICES, schema={"date": Schema.time()}, axes=True)
        .flow(scatter(by="date", x="date", y="price"))
        .mark(line(stroke="steelblue", stroke_width=2)),
        {"w": 560, "h": 200},
    )


def story_hourly_line():
    return (
        chart(READINGS, axes=True)
        .flow(scatter(by="time", x="time", y="temp"))
        .mark(line(stroke="steelblue", stroke_width=2)),
        {"w": 560, "h": 200},
    )


def story_daylight_saving_zone():
    return (
        chart(
            NEW_YORK,
            schema={"time": Schema.time(zone="America/New_York")},
            axes=True,
        )
        .flow(scatter(by="time", x="time", y="load"))
        .mark(line(stroke="steelblue", stroke_width=2)),
        {"w": 560, "h": 200},
    )


def story_event_timeline():
    return (
        chart(RELEASES, schema={"date": Schema.time()}, axes={"x": True, "y": False})
        .flow(scatter(by="name", x="date"))
        .mark(circle(r=5, fill="steelblue")),
        {"w": 560, "h": 80},
    )


def story_week_over_month_rows():
    return (
        chart(
            VISITS,
            schema={"day": Schema.time()},
            axes={"x": {"rows": [Calendar.week, Calendar.month]}, "y": True},
        )
        .flow(scatter(by="day", x="day", y="visits"))
        .mark(line(stroke="steelblue", stroke_width=2)),
        {"w": 560, "h": 200},
    )


def story_vertical_daily_dots():
    return (
        chart(PRICES, schema={"date": Schema.time()}, axes=True)
        .flow(scatter(by="date", x="price", y="date"))
        .mark(circle(r=1.5, fill="steelblue")),
        {"w": 300, "h": 480},
    )
