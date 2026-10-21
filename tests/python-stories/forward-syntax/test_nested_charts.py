"""Equivalent of NestedCharts.stories.tsx — Forward Syntax/Nested Charts."""

import math
from datetime import datetime, timedelta, timezone

from gofish import chart, circle, line, rect, scatter, spread, text

# Quarterly sales at three stores.
SALES = [
    {"store": store, "quarter": q + 1, "sales": s}
    for store, values in [
        ("North", [32, 41, 38, 52]),
        ("Harbor", [24, 22, 30, 27]),
        ("Hill", [45, 39, 33, 36]),
    ]
    for q, s in enumerate(values)
]


def story_connected_dots_per_group():
    """A `.layer(...)` chain in a mark position (#1181): one small line chart
    per store, dots with a line over them. The chain's first tier is an empty
    `chart()` scope, so it draws the store's rows, and the line tier connects
    the dots that tier drew."""
    return (
        chart(SALES)
        .flow(spread(by="store", dir="x", spacing=32))
        .mark(
            chart(axes=False)
            .flow(scatter(by="quarter", x="quarter", y="sales"))
            .mark(circle(r=4, fill="#08519c"))
            .layer(line(stroke="#6baed6", stroke_width=2))
        ),
        {"w": 420, "h": 220},
    )


def _readings():
    start = datetime(2024, 2, 28, tzinfo=timezone.utc)
    out = []
    for h in range(85):
        temp = 4 - 5 * math.cos(((h - 3) / 24) * 2 * math.pi) + 0.4 * math.sin(h * 1.7)
        out.append(
            {"time": start + timedelta(hours=h), "temp": round(temp * 10) / 10}
        )
    return out


# Hourly temperatures from Feb 28 00:00 to Mar 2 12:00, 2024 (UTC): a
# datetime column is a time without a schema entry.
READINGS = _readings()


def _daily_highs(rows):
    """Each day's high: the first hottest reading of each UTC day."""
    high = {}
    for r in rows:
        day = r["time"].date()
        if day not in high or r["temp"] > high[day]["temp"]:
            high[day] = r
    return list(high.values())


DAILY_HIGHS = _daily_highs(READINGS)


def story_daily_highs_over_readings():
    """A chart with rows of its own in a mark position (#1088): the hourly
    line, with a tier over it that draws each day's high from a table of its
    own. The tier's rows, with their time column, travel as an Arrow table of
    their own, so they keep their time type and share the line's time axis."""
    return (
        chart(READINGS)
        .flow(scatter(by="time", x="time", y="temp"))
        .mark(line(stroke="steelblue", stroke_width=2))
        .layer(
            chart(DAILY_HIGHS)
            .flow(scatter(by="time", x="time", y="temp"))
            .mark(circle(r=4, fill="firebrick"))
        ),
        {"w": 560, "h": 220},
    )


def story_captioned_bars_per_group():
    """An empty `chart()` scope as a child of a combinator in a mark
    position: per store, its name under a small bar chart of its quarters.
    The mark is the `spread([...])`, and its chart child binds the store's
    rows, as an empty scope does wherever a chart sits."""
    return (
        chart(SALES, axes=False)
        .flow(spread(by="store", dir="x", spacing=32, alignment="end"))
        .mark(
            spread(
                [
                    chart()
                    .flow(spread(by="quarter", dir="x", spacing=4))
                    .mark(rect(w=16, h="sales", fill="#08519c")),
                    text(text="store", font_size=12),
                ],
                dir="y",
                spacing=8,
                alignment="middle",
            )
        ),
        {"w": 420, "h": 220},
    )
