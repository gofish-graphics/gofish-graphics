"""Equivalent of RidgelineChart.stories.tsx — Forward Syntax V3/Ridgeline Chart."""

import math

from gofish import chart, spread, scatter, field, rect, text, layer, ribbon, Constraint
from python_stories.data import SEATTLE_WEATHER

MONTH_NAMES = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
]

# Classic "temperature distributions by month" ridgeline: bin every day's
# high temperature (across all four years) into fixed-width buckets shared
# by every month, then count days per (month, bucket). Zero-count buckets
# are included at both ends of each month's range so every ridge returns to
# its own baseline instead of getting clipped mid-slope.
BIN_WIDTH = 2.5
_temps = [d["temp_max"] for d in SEATTLE_WEATHER]
MIN_TEMP = math.floor(min(_temps) / BIN_WIDTH) * BIN_WIDTH
MAX_TEMP = math.ceil(max(_temps) / BIN_WIDTH) * BIN_WIDTH
BIN_COUNT = round((MAX_TEMP - MIN_TEMP) / BIN_WIDTH)
BIN_CENTERS = [MIN_TEMP + (i + 0.5) * BIN_WIDTH for i in range(BIN_COUNT)]

_counts: dict = {}
for d in SEATTLE_WEATHER:
    # All dates are "YYYY-MM-DDT00:00:00.000Z" — month is a fixed slice, no
    # need for a date parse (mirrors JS `new Date(d.date).getUTCMonth()`).
    month = MONTH_NAMES[int(d["date"][5:7]) - 1]
    bin_ = min(BIN_COUNT - 1, math.floor((d["temp_max"] - MIN_TEMP) / BIN_WIDTH))
    key = (month, bin_)
    _counts[key] = _counts.get(key, 0) + 1

RIDGELINE_DATA = [
    {"month": month, "temp_max": temp_max, "count": _counts.get((month, bin_), 0)}
    for month in MONTH_NAMES
    for bin_, temp_max in enumerate(BIN_CENTERS)
]

# Fixed row-to-row pitch shared by the ridge spread and the label spread
# below, so a month's rule+label always sit at the same baseline as its
# silhouette. Both tiers chain their rows with `anchor="baseline"` at this
# pitch, and both rows put their semantic baseline at local 0 (the ribbon's
# zero-count line; the rule), so the two chains solve to identical lines.
ROW_PITCH = 24

# Right-aligning the month labels (issue #757: `text` has no textAnchor —
# it always anchors "start") is done with a constraint instead of a
# hardcoded per-string pixel-width table: each row gets a zero-size
# invisible anchor rect at the fixed x just left of the plot edge, and
# `Constraint.align([label, anchor], x="end")` pins the label's END (using
# the text mark's own LAYOUT-TIME measured width) to the anchor's end —
# which, for a zero-width box, is just its `x`. This is the bottle-chart
# pattern (`test_bottle.py` / `stories/piccl/Bottle.stories.tsx`); it uses
# real measured glyph widths so JS and Python need no shared precomputed
# table.
LABEL_MARGIN_X = -6


def story_default():
    w, h = 500, 330
    return (
        chart(RIDGELINE_DATA, axes={"x": True, "y": False})
        .flow(
            spread(
                by=field("month").sort(MONTH_NAMES),
                dir="y",
                anchor="baseline",
                spacing=ROW_PITCH,
                h=h,
                axes={"x": True, "y": False},
            ),
            scatter(
                x="temp_max",
                w=w,
                axes={"x": True, "y": False},
            ),
        )
        .mark(
            ribbon(
                h="count",
                fill="steelblue",
                stroke="white",
                strokeWidth=1,
                by="month",
                opacity=0.85,
                mixBlendMode="normal",
            )
        )
        # Per-row baseline labeling, in the style of a ggridges ridgeline: a
        # thin rule along each month's baseline with the month name sticking
        # out to the LEFT of the plot (tick-label style), instead of a standard
        # y axis that can't line up with 12 overlapping, unevenly-tall
        # silhouettes. Two extra tiers:
        #
        #  - RULES: the same fixed-pitch baseline spread as the ridges, marking
        #    a bare rect per month. The rect sits at its row's baseline anchor,
        #    so it registers exactly on the ribbon's zero line. `.z_order(-1)`
        #    paints the rules BEHIND the ribbons — visible only outside the
        #    silhouettes, the classic look.
        #  - LABELS: a datumless annotation overlay (a bare mark tier — no
        #    flow), one text per month at literal frame coordinates. This is
        #    deliberate: a spread-laid row normalizes away any extent above or
        #    left of its baseline anchor, so a label can never overhang its own
        #    row — but a bare tier shares the frame origin and CAN reach into
        #    the canvas margin (the render's overhang reserve), exactly like
        #    the ridge peaks reach above the first baseline. Each label's END
        #    is constraint-aligned to a same-row invisible anchor rect fixed
        #    at `LABEL_MARGIN_X` (6px left of the plot edge) — see
        #    `LABEL_MARGIN_X`'s comment; y = k*pitch - 9 puts the glyph
        #    baseline on the rule.
        .layer(
            chart([{"month": month} for month in MONTH_NAMES])
            .flow(
                spread(
                    by=field("month").sort(MONTH_NAMES),
                    dir="y",
                    anchor="baseline",
                    spacing=ROW_PITCH,
                    h=h,
                )
            )
            .mark(rect(h=1, w=w, fill="#999").z_order(-1))
        )
        .layer(
            layer(
                [
                    mark
                    for k, month in enumerate(MONTH_NAMES)
                    for mark in (
                        rect(w=0, h=0, x=LABEL_MARGIN_X, y=ROW_PITCH * k).name(
                            f"anchor{k}"
                        ),
                        text(
                            text=month,
                            fontSize=11,
                            fill="#666",
                            y=ROW_PITCH * k - 9,
                        ).name(f"label{k}"),
                    )
                ]
            ).constrain(
                lambda **refs: [
                    Constraint.align(
                        [refs[f"label{k}"], refs[f"anchor{k}"]], x="end"
                    )
                    for k in range(len(MONTH_NAMES))
                ]
            )
        ),
        {"w": w, "h": h},
    )
