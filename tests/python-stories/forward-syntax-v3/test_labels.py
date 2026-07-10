"""Equivalent of Labels.stories.tsx — Forward Syntax V3/Labels.

Ports the single-chart label position/style stories. Multi-chart DOM
stories (AllPositions, Rotated), the async mark-as-function story
(LabelOnSpread) and the raw-SVG showcase (PositionShowcase) are exempt
per `tests/.python-sync-exempt`.
"""

import pandas as pd

from gofish import (
    chart,
    derive,
    field,
    gradient,
    palette,
    rect,
    spread,
    stack,
    table,
)
from python_stories.data import SEAFOOD
from python_stories.vega_data_urls import read_json


# ─── default (no position) ───────────────────────────────────────────────────

def story_default():
    return (
        chart(SEAFOOD)
        .flow(spread(by="lake", dir="x"))
        .mark(rect(h="count").label(field("count").sum())),
        {"w": 400, "h": 300, "axes": True},
    )


# ─── center ──────────────────────────────────────────────────────────────────

def story_center():
    return (
        chart(SEAFOOD)
        .flow(
            spread(by="lake", dir="x"),
            stack(by="species", dir="y"),
        )
        .mark(
            rect(h="count", fill="species").label(
                "count", position="center", fontSize=10
            )
        ),
        {"w": 400, "h": 300, "axes": True},
    )


# ─── outset (top) ────────────────────────────────────────────────────────────

def story_above():
    return (
        chart(SEAFOOD)
        .flow(spread(by="lake", dir="x"))
        .mark(rect(h="count").label(field("count").sum(), position="outset")),
        {"w": 400, "h": 300, "axes": True},
    )


# ─── outset-bottom ───────────────────────────────────────────────────────────

def story_below():
    return (
        chart(SEAFOOD)
        .flow(
            spread(by="lake", dir="y", spacing=30),
            stack(by="species", dir="x"),
        )
        .mark(
            rect(w="count", fill="species").label(
                "count", position="outset-bottom", fontSize=9
            )
        ),
        {"w": 400, "h": 300, "axes": False},
    )


# ─── outset-left ─────────────────────────────────────────────────────────────

def story_left():
    return (
        chart(SEAFOOD)
        .flow(
            spread(by="lake", dir="y"),
            spread(by="species", dir="x", spacing=25),
        )
        .mark(
            rect(w="count", fill="species").label(
                "count",
                position="outset-left",
                fontSize=9,
                offset=13,
            )
        ),
        {"w": 400, "h": 300, "axes": False},
    )


# ─── outset-right ────────────────────────────────────────────────────────────

def story_right():
    return (
        chart(SEAFOOD)
        .flow(spread(by="lake", dir="y"))
        .mark(
            rect(w="count").label(
                field("count").sum(), position="outset-right", offset=15
            )
        ),
        {"w": 400, "h": 300, "axes": True},
    )


# ─── outset-top-start ────────────────────────────────────────────────────────

def story_above_start():
    return (
        chart(SEAFOOD)
        .flow(
            spread(by="lake", dir="x"),
            stack(by="species", dir="x"),
        )
        .mark(
            rect(h="count", fill="species").label(
                "count", position="outset-top-start", fontSize=9
            )
        ),
        {"w": 500, "h": 300, "axes": True},
    )


# ─── outset-top-end ──────────────────────────────────────────────────────────

def story_above_end():
    return (
        chart(SEAFOOD)
        .flow(
            spread(by="lake", dir="x"),
            stack(by="species", dir="x"),
        )
        .mark(
            rect(h="count", fill="species").label(
                "count", position="outset-top-end", fontSize=9
            )
        ),
        {"w": 500, "h": 300, "axes": True},
    )


# ─── heatmap – center labels (auto-contrast) ─────────────────────────────────

_HEAT_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"]
_HEAT_HOURS = ["9am", "12pm", "3pm"]
_HEAT_VALUES = [42, 78, 55, 91, 33, 67, 24, 89, 61, 15, 74, 48, 36, 83, 70]
_HEAT_DATA = [
    {"day": day, "hour": hour, "value": _HEAT_VALUES[di * 3 + hi]}
    for di, day in enumerate(_HEAT_DAYS)
    for hi, hour in enumerate(_HEAT_HOURS)
]


def story_heatmap_with_labels():
    return (
        chart(_HEAT_DATA, color=gradient(["#e0f3ff", "#08519c"]))
        .flow(table(by={"x": "hour", "y": "day"}, spacing=4))
        .mark(
            rect(fill="value").label(
                "value", position="center", fontSize=11
            )
        ),
        {"w": 420, "h": 280, "axes": True},
    )


# ─── label on stack operator (per-group, #702) ──────────────────────────────

def story_label_on_stack_operator():
    titanic_passengers = pd.read_json(
        "packages/gofish-graphics/src/data/titanicPassengers.json"
    )
    return (
        chart(titanic_passengers)
        .flow(
            stack(by="pclass", dir="y").label(
                "pclass", position="center", fontSize=14, color="white"
            )
        )
        .mark(rect(w=120, h=field("survived").count())),
        {"w": 260, "h": 300, "axes": False},
    )


# ─── label on stack operator (group total, #702 redesign) ──────────────────

def story_label_on_stack_aggregate():
    titanic_passengers = pd.read_json(
        "packages/gofish-graphics/src/data/titanicPassengers.json"
    )
    return (
        chart(titanic_passengers)
        .flow(
            stack(by="pclass", dir="y").label(
                field("survived").count(),
                position="center",
                fontSize=14,
                color="white",
            )
        )
        .mark(rect(w=120, h=field("survived").count())),
        {"w": 260, "h": 300, "axes": False},
    )


# ─── normalized stacked bar – center labels ──────────────────────────────────
# Mirrors https://vega.github.io/vega-lite/examples/bar_stacked_normalize_labeled.html

def _decode_sex(data):
    return [
        {**row, "sex": "Male" if row["sex"] == 1 else "Female"}
        for row in data
    ]


def story_normalized_stacked_bar_with_labels():
    population = read_json("population.json")
    year2000 = population[population["year"] == 2000].to_dict("records")
    return (
        chart(
            year2000,
            color=palette({"Female": "#675193", "Male": "#ca8861"}),
        )
        .flow(
            derive(_decode_sex),
            # y-down reads top→bottom, so age 0 lands at the top (Vega-Lite ref).
            spread(by="age", dir="y", spacing=2),
            # Female left, Male right; normalize within each age group so
            # bars span 0→1.
            stack(
                by=field("sex").sort(),
                dir="x",
                size=field("people").normalize(),
            ),
        )
        .mark(
            rect(fill="sex").label("people", position="center", color="white")
        ),
        # Keep the continuous proportion x-axis at the bottom (y-end).
        {
            "w": 350,
            "h": 400,
            "axes": {"x": {"side": "end", "title": "proportion"}, "y": True},
        },
    )
