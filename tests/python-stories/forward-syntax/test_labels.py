"""Equivalent of Labels.stories.tsx — Forward Syntax/Labels."""

import pandas as pd

from gofish import (
    chart,
    derive,
    field,
    layer,
    rect,
    spread,
    stack,
    table,
    text,
    Color,
)
from python_stories.data import SEAFOOD
from python_stories.vega_data_urls import read_json


# ─── default (no position) ───────────────────────────────────────────────────

def story_default():
    return (
        chart(SEAFOOD, w=400, h=300)
        .flow(spread(by="lake", dir="x"))
        .mark(rect(h="count").label(field("count").sum())),
        {},
    )


# ─── center ──────────────────────────────────────────────────────────────────

def story_center():
    return (
        chart(SEAFOOD, w=400, h=300)
        .flow(
            spread(by="lake", dir="x"),
            stack(by="species", dir="y"),
        )
        .mark(
            rect(h="count", fill="species").label(
                "count", position="center", font_size=10
            )
        ),
        {},
    )


# ─── outset (top) ────────────────────────────────────────────────────────────

def story_above():
    return (
        chart(SEAFOOD, w=400, h=300)
        .flow(spread(by="lake", dir="x"))
        .mark(rect(h="count").label(field("count").sum(), position="outset")),
        {},
    )


# ─── outset-bottom ───────────────────────────────────────────────────────────

def story_below():
    return (
        chart(SEAFOOD, axes=False, w=400, h=390)
        .flow(
            spread(by="lake", dir="y", spacing=48),
            stack(by="species", dir="x"),
        )
        .mark(
            rect(w="count", fill="species").label(
                "count", position="outset-bottom", font_size=9
            )
        ),
        {},
    )


# ─── outset-left ─────────────────────────────────────────────────────────────

def story_left():
    return (
        chart(SEAFOOD, axes=False, w=400, h=300)
        .flow(
            spread(by="lake", dir="y"),
            spread(by="species", dir="x", spacing=25),
        )
        .mark(
            rect(w="count", fill="species").label(
                "count",
                position="outset-left",
                font_size=9,
                offset=13,
            )
        ),
        {},
    )


# ─── outset-right ────────────────────────────────────────────────────────────

def story_right():
    return (
        chart(SEAFOOD, w=400, h=300)
        .flow(spread(by="lake", dir="y"))
        .mark(
            rect(w="count").label(
                field("count").sum(), position="outset-right", offset=15
            )
        ),
        {},
    )


# ─── outset-top-start ────────────────────────────────────────────────────────

def story_above_start():
    return (
        chart(SEAFOOD, w=500, h=300)
        .flow(
            spread(by="lake", dir="x", spacing=24),
            stack(by="species", dir="x"),
        )
        .mark(
            rect(h="count", fill="species").label(
                "count", position="outset-top-start", font_size=9
            )
        ),
        {},
    )


# ─── outset-top-end ──────────────────────────────────────────────────────────

def story_above_end():
    return (
        chart(SEAFOOD, w=500, h=300)
        .flow(
            spread(by="lake", dir="x", spacing=24),
            stack(by="species", dir="x"),
        )
        .mark(
            rect(h="count", fill="species").label(
                "count", position="outset-top-end", font_size=9
            )
        ),
        {},
    )


# ─── all positions grid ──────────────────────────────────────────────────────
# The same bars once per position, each captioned with its position, two to a
# row (a position beside its counterpart) so they can be compared side by side.
# A row lines its cells up by their outer boxes, labels included, so the caption
# is layered at a fixed height above the plot rather than spread above the
# cell: labels above the bars then sit under the caption instead of pushing the
# plot down.

ALL_POSITIONS = [
    "center",
    "outset",
    "inset-top",
    "inset-bottom",
    "inset-left",
    "inset-right",
    "inset-top-start",
    "inset-top-end",
    "outset-top",
    "outset-bottom",
    "outset-left",
    "outset-right",
    "outset-top-start",
    "outset-top-end",
]


def _captioned(caption, body):
    """A chart captioned above with `caption`."""
    return spread(
        [text(text=caption, font_size=12, font_family="monospace"), body],
        dir="y",
        spacing=16,
        alignment="start",
    )


def story_all_positions():
    def cell(position):
        return layer(
            [
                chart(SEAFOOD, axes=False, w=300, h=100)
                .flow(spread(by="lake", dir="x"))
                .mark(
                    rect(h="count").label(
                        field("count").sum(), position=position, font_size=9
                    )
                ),
                # 32 px above the 100 px plot.
                text(
                    x=0, y=132, text=position, font_size=12, font_family="monospace"
                ),
            ]
        )

    rows = [
        spread(
            [cell(ALL_POSITIONS[2 * i]), cell(ALL_POSITIONS[2 * i + 1])],
            dir="x",
            spacing=48,
            alignment="start",
        )
        for i in range(len(ALL_POSITIONS) // 2)
    ]
    return (
        spread(rows, dir="y", spacing=40, alignment="start"),
        {},
    )


# ─── label on spread (group label) ───────────────────────────────────────────
# `.label(...)` on the operator: one label per lake group. Each group is drawn
# by a per-group sub-chart, a callable mark that crosses the derive RPC.

def story_label_on_spread():
    return (
        chart(SEAFOOD, axes=False, w=500, h=300)
        .flow(
            spread(by="lake", dir="x", spacing=50).label(
                "lake", position="outset-top-start", font_size=13, rotate=60
            )
        )
        .mark(
            lambda d: chart(d, axes=False)
            .flow(stack(by="species", dir="x"))
            .mark(rect(h="count", fill="species"))
        ),
        {},
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
        chart(_HEAT_DATA, color=Color.gradient(["#e0f3ff", "#08519c"]), w=420, h=280)
        .flow(table(by={"x": "hour", "y": "day"}, spacing=4))
        .mark(
            rect(fill="value").label(
                "value", position="center", font_size=11
            )
        ),
        {},
    )


# ─── rotated labels ──────────────────────────────────────────────────────────
# Labels rotate clockwise for positive values, pivoting at the label's center.

def story_rotated():
    return (
        spread(
            [
                _captioned(
                    f"rotate: {rotate}°",
                    chart(SEAFOOD, w=400, h=180)
                    .flow(spread(by="lake", dir="x"))
                    .mark(
                        rect(h="count").label(
                            field("count").sum(), position="outset-top", rotate=rotate
                        )
                    ),
                )
                for rotate in [45, -30, 0]
            ],
            dir="y",
            spacing=64,
            alignment="start",
        ),
        {},
    )


# ─── label on stack operator (per-group, #702) ──────────────────────────────

def story_label_on_stack_operator():
    titanic_passengers = pd.read_json(
        "packages/gofish-graphics/src/data/titanicPassengers.json"
    )
    return (
        chart(titanic_passengers, axes=False, w=260, h=300)
        .flow(
            stack(by="pclass", dir="y").label(
                "pclass", position="center", font_size=14, color="white"
            )
        )
        .mark(rect(w=120, h=field("survived").count())),
        {},
    )


# ─── label on stack operator (group total, #702 redesign) ──────────────────

def story_label_on_stack_aggregate():
    titanic_passengers = pd.read_json(
        "packages/gofish-graphics/src/data/titanicPassengers.json"
    )
    return (
        chart(titanic_passengers, axes=False, w=260, h=300)
        .flow(
            stack(by="pclass", dir="y").label(
                field("survived").count(),
                position="center",
                font_size=14,
                color="white",
            )
        )
        .mark(rect(w=120, h=field("survived").count())),
        {},
    )


# ─── two labels per bar (repeated .label(), #706) ───────────────────────────
# Repeated `.label()` calls append rather than overwrite: each bar carries a
# bold white value label centered inside it AND a small category label above
# it, with independent styling.

def story_two_labels_per_bar():
    return (
        chart(SEAFOOD, w=400, h=300)
        .flow(spread(by="lake", dir="x", spacing=40))
        .mark(
            rect(h=field("count").sum())
            .label(
                field("count").sum(),
                position="center",
                color="white",
                font_weight="bold",
            )
            .label("lake", position="outset-top", font_size=9)
        ),
        {},
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
            color=Color.palette({"Female": "#675193", "Male": "#ca8861"}),
            axes={"x": {"side": "end", "title": "proportion"}, "y": True},
            w=300,
            h=19 * 17,
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
        {},
    )


# ─── position showcase ───────────────────────────────────────────────────────
# One rect with a label at every position, each naming its own position.
# Blue = inset positions, amber = outset positions. An inset corner is the
# same spot from either edge (`inset-top-start` is `inset-left-start`), so
# each corner gets one label that names both. The single datum maps each
# position to its text, so `.label(position)` reads that text.

SHOWCASE_LABELS = {
    "center": "center",
    "inset-top": "inset-top",
    "inset-bottom": "inset-bottom",
    "inset-left": "inset-left",
    "inset-right": "inset-right",
    "inset-top-start": "inset-top-start = inset-left-start",
    "inset-top-end": "inset-top-end = inset-right-start",
    "inset-bottom-start": "inset-bottom-start = inset-left-end",
    "inset-bottom-end": "inset-bottom-end = inset-right-end",
    "outset-top": "outset-top",
    "outset-top-start": "outset-top-start",
    "outset-top-end": "outset-top-end",
    "outset-bottom": "outset-bottom",
    "outset-bottom-start": "outset-bottom-start",
    "outset-bottom-end": "outset-bottom-end",
    "outset-left": "outset-left",
    "outset-left-start": "outset-left-start",
    "outset-left-end": "outset-left-end",
    "outset-right": "outset-right",
    "outset-right-start": "outset-right-start",
    "outset-right-end": "outset-right-end",
}


def story_position_showcase():
    mark = rect(w=660, h=280, fill="#dbeafe", stroke="#3b82f6", stroke_width=1.5)
    for position in SHOWCASE_LABELS:
        mark = mark.label(
            position,
            position=position,
            font_size=11,
            font_family="monospace",
            color="#92400e" if position.startswith("outset") else "#1d4ed8",
        )
    return (
        chart([SHOWCASE_LABELS], axes=False).mark(mark),
        {},
    )
