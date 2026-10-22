"""Equivalent of RidgelineChart.stories.tsx — Forward Syntax/Ridgeline Chart."""

import math

from gofish import chart, spread, scatter, field, rect, datum, ribbon, Schema
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

# Each month's section is a fixed height: the tallest ridge (the largest
# count) is this many px, whatever the width, the pitch or the number of
# months. The ridges overlap because it is far more than ROW_PITCH, and the
# chart's height follows from the sections, so the chart sets no `h`.
RIDGE_HEIGHT = 140


def story_default():
    return (
        chart(
            RIDGELINE_DATA,
            axes={"x": True, "y": False},
            schema={"temp_max": Schema.quantity("Max temperature").unit("°C")},
            w=500,
        )
        .flow(
            spread(
                by=field("month").sort(MONTH_NAMES),
                dir="y",
                anchor="baseline",
                spacing=ROW_PITCH,
            ),
            scatter(x="temp_max", h=RIDGE_HEIGHT),
        )
        .mark(
            ribbon(
                h="count",
                fill="steelblue",
                stroke="white",
                stroke_width=1,
                opacity=0.85,
                mix_blend_mode="normal",
            )
        )
        # Per-row baseline labeling, in the style of a ggridges ridgeline: a
        # thin rule along each month's baseline with the month name to the
        # LEFT of the plot (tick-label style), instead of a standard y axis
        # that can't line up with 12 overlapping, unevenly-tall silhouettes.
        # The rules are the same fixed-pitch baseline spread as the ridges, a
        # bare rect per month, so each registers exactly on its ribbon's zero
        # line. Each rule spans the ribbon's run, from the first bin's center
        # to the last's, so the ribbon's white outline lies along the whole
        # rule. Each rule carries its month as a label outside its left end,
        # standing on the rule. `.z_order(-1)` paints the rules BEHIND the
        # ribbons, visible only outside the silhouettes, the classic look.
        .layer(
            chart([{"month": month} for month in MONTH_NAMES])
            .flow(
                spread(
                    by=field("month").sort(MONTH_NAMES),
                    dir="y",
                    anchor="baseline",
                    spacing=ROW_PITCH,
                )
            )
            .mark(
                rect(
                    x=datum(BIN_CENTERS[0]),
                    w=datum(BIN_CENTERS[BIN_COUNT - 1] - BIN_CENTERS[0]),
                    h=1,
                    fill="#999",
                ).label(
                    "month",
                    position="outset-left-end",
                    font_size=11,
                    color="#666",
                )
            )
            .z_order(-1)
        ),
        {},
    )
