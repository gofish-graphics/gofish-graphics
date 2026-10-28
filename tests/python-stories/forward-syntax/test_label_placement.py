"""Equivalent of LabelPlacement.stories.tsx — Forward Syntax/Label Placement.

ArrowLabelsLeft, ArrowLabelsOnBackground and ArrowLabelsAbove are exempt:
each edge label is a JS function accessor, and each node's box and name are
aligned in a JS `.relate()` callback.
"""

import math
from datetime import datetime

from gofish import (
    chart,
    blank,
    circle,
    group,
    line,
    polygon,
    rect,
    ribbon,
    scatter,
    select_all,
    spread,
    stack,
    Place,
    Unit,
)
from python_stories.data import SEAFOOD
from python_stories.vega_data_urls import read_csv, read_json


def _js_round(x):
    """JS `Math.round`: halves round up."""
    return math.floor(x + 0.5)


def _countries():
    """The 36 most populous countries in 2005, largest first."""
    rows = [r for r in read_json("gapminder.json").to_dict("records") if r["year"] == 2005]
    return sorted(rows, key=lambda r: -r["pop"])[:36]


def _yearly_stocks():
    """Yearly averages of vega-datasets' monthly stock prices."""
    acc = {}
    for d in read_csv("stocks.csv").to_dict("records"):
        year = datetime.strptime(d["date"], "%b %d %Y").year
        key = f"{d['symbol']}{year}"
        e = acc.setdefault(
            key, {"symbol": d["symbol"], "date": f"{year}-07-01", "sum": 0, "n": 0}
        )
        e["sum"] += float(d["price"])
        e["n"] += 1
    return [
        {
            "symbol": e["symbol"],
            "date": e["date"],
            "price": _js_round(e["sum"] / e["n"] * 100) / 100,
        }
        for e in acc.values()
    ]


# ─── points: Place.around() ──────────────────────────────────────────────────

def story_scatter_point_labels():
    return (
        chart(_countries())
        .flow(scatter(by="country", x="fertility", y="life_expect"))
        .mark(circle(r=4).label("country")),
        {"w": 640, "h": 440, "axes": True},
    )


# ─── lines: Place.end() ──────────────────────────────────────────────────────

def story_line_end_labels():
    return (
        chart(_yearly_stocks(), schema={"date": Unit.time()})
        .flow(group(by="symbol"), scatter(by="date", x="date", y="price"))
        .mark(
            line(stroke="symbol", stroke_width=2).label("symbol", position=Place.end())
        ),
        {"w": 560, "h": 320, "axes": True, "legend": False},
    )


# ─── lines: Place.along(orient="sloped") ─────────────────────────────────────

def story_inline_sloped_labels():
    return (
        chart(_yearly_stocks(), schema={"date": Unit.time()})
        .flow(group(by="symbol"), scatter(by="date", x="date", y="price"))
        .mark(
            line(stroke="symbol", stroke_width=2).label(
                "symbol",
                position=Place.along(at=0.6, orient="sloped"),
                halo={},
                font_weight=600,
            )
        ),
        {"w": 560, "h": 320, "axes": True, "legend": False},
    )


# ─── areas: Place.interior() ─────────────────────────────────────────────────

def story_streamgraph_interior_labels():
    return (
        chart(SEAFOOD)
        .flow(
            spread(by="lake", dir="x", spacing=64, alignment="middle"),
            stack(by="species", dir="y"),
        )
        .mark(ribbon(h="count", fill="species", opacity=0.8).label("species")),
        {"w": 520, "h": 360, "legend": False},
    )


# ─── regions: Place.interior() on non-convex polygons ────────────────────────

T = 1.4
WINGS = [
    {
        "name": "West Wing",
        "ring": [[0, 0], [4, 0], [4, T], [T, T], [T, 4 - T], [4, 4 - T], [4, 4], [0, 4]],
    },
    {
        "name": "Cloister",
        "ring": [[5, 0], [9, 0], [9, 4], [9 - T, 4], [9 - T, T], [5 + T, T], [5 + T, 4], [5, 4]],
    },
    {
        "name": "Annex",
        "ring": [[10, 0], [14, 0], [14, T], [10 + T, T], [10 + T, 4], [10, 4]],
    },
    {
        "name": "Gallery",
        "ring": [[15, 4], [17, 0], [19, 4], [19 - T * 0.9, 4], [17, 1.7], [15 + T * 0.9, 4]],
    },
]


def story_polygon_interior_labels():
    return (
        chart(WINGS, axes=False)
        .flow(group(by="name"))
        .mark(polygon(points="ring", fill="name", opacity=0.85).label("name")),
        {"w": 640, "h": 150, "legend": False},
    )


def story_polygon_center_labels():
    return (
        chart(WINGS, axes=False)
        .flow(group(by="name"))
        .mark(
            polygon(points="ring", fill="name", opacity=0.85).label(
                "name", position="center"
            )
        ),
        {"w": 640, "h": 150, "legend": False},
    )


# ─── paths: a list of sides ──────────────────────────────────────────────────

PLAN = [3.0, 3.6, 4.1, 4.5, 5.0, 5.6, 6.0, 6.3, 6.6]
BUDGET = [
    *({"series": "Plan", "x": x, "y": y} for x, y in enumerate(PLAN)),
    *(
        {"series": "Actual", "x": x, "y": y - 0.55 - 0.05 * math.sin(x)}
        for x, y in enumerate(PLAN)
    ),
    *(
        {"series": "Cost", "x": x, "y": y}
        for x, y in enumerate([1.2, 1.3, 1.25, 1.5, 1.7, 1.6, 1.9, 2.1, 2.0])
    ),
]


def _budget_chart(side):
    return (
        chart(BUDGET)
        .flow(group(by="series"), scatter(by="x", x="x", y="y"))
        .mark(
            line(stroke="series", stroke_width=2).label(
                "series",
                position=Place.along(at=0.5, side=side, orient="sloped"),
                font_weight=600,
            )
        )
    )


def story_side_above():
    return (
        _budget_chart("above"),
        {"w": 360, "h": 220, "axes": True, "legend": False},
    )


def story_side_above_or_below():
    return (
        _budget_chart(["above", "below"]),
        {"w": 360, "h": 220, "axes": True, "legend": False},
    )


# ─── avoiding ────────────────────────────────────────────────────────────────

def _trend_scatter(countries):
    # Plain loops, not sum(): Python's float sum is compensated, JS's reduce
    # is not, and the line's ends must match to the last bit.
    n = len(countries)
    sx = sy = 0
    for r in countries:
        sx += r["fertility"]
        sy += r["life_expect"]
    mx, my = sx / n, sy / n
    sxy = sxx = 0
    for r in countries:
        sxy += (r["fertility"] - mx) * (r["life_expect"] - my)
    for r in countries:
        sxx += (r["fertility"] - mx) ** 2
    slope = sxy / sxx
    xs = [r["fertility"] for r in countries]
    ends = [
        {"fertility": f, "life_expect": my + slope * (f - mx)}
        for f in (min(xs), max(xs))
    ]
    return (
        chart(ends)
        .flow(scatter(by="fertility", x="fertility", y="life_expect"))
        .mark(blank().name("ends"))
        .layer(
            chart(select_all("ends")).mark(
                line(stroke="#9e9e9e", stroke_width=2).name("trend")
            )
        )
        .layer(
            chart(countries)
            .flow(scatter(by="country", x="fertility", y="life_expect"))
            .mark(circle(r=4).label("country", avoiding=select_all("trend")))
        )
    )


def story_avoiding_trend_line():
    return (
        _trend_scatter(_countries()),
        {"w": 640, "h": 440, "axes": True},
    )


# ─── boxes: Place.around on bars ─────────────────────────────────────────────

SALES = [
    {"month": "Jan", "units": 42},
    {"month": "Feb", "units": 58},
    {"month": "Mar", "units": 100},
    {"month": "Apr", "units": 77},
    {"month": "May", "units": 64},
    {"month": "Jun", "units": 91},
]


def story_bar_values_above_or_inside():
    return (
        chart(SALES)
        .flow(spread(by="month", dir="x"))
        .mark(
            rect(h="units", fill="#4e79a7").label(
                "units",
                position=Place.around(directions=["top"], side=["outset", "inset"]),
            )
        ),
        {"w": 320, "h": 200, "axes": True},
    )


# ─── boxes: a part of the outline ────────────────────────────────────────────

def story_bar_end_part():
    return (
        chart(SALES)
        .flow(spread(by="month", dir="y"))
        .mark(
            rect(w="units", fill="#59a14f").label(
                "units",
                position=Place.along(at="x-max", side=["outset", "inset"]),
            )
        ),
        {"w": 320, "h": 200, "axes": True},
    )


# ─── boxes: inside first ─────────────────────────────────────────────────────

COUNTS = [
    {"k": "A", "v": 2},
    {"k": "B", "v": 6},
    {"k": "C", "v": 14},
    {"k": "D", "v": 35},
    {"k": "E", "v": 120},
    {"k": "F", "v": 1450},
]


def story_bar_values_inside_or_above():
    return (
        chart(COUNTS)
        .flow(spread(by="k", dir="x"))
        .mark(
            rect(h="v", fill="#4e79a7").label(
                "v",
                position=Place.around(directions=["top"], side=["inset", "outset"]),
            )
        ),
        {"w": 320, "h": 200, "axes": True},
    )


def story_bar_values_inside_or_past_end():
    return (
        chart(COUNTS)
        .flow(spread(by="k", dir="y"))
        .mark(
            rect(w="v", fill="#59a14f").label(
                "v",
                position=Place.along(at="x-max", side=["inset", "outset"]),
            )
        ),
        {"w": 320, "h": 200, "axes": True},
    )
