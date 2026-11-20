"""Equivalent of RidgelineChart.stories.tsx — Forward Syntax/Ridgeline Chart."""

from gofish import chart, derive, kde, spread, field, layer, rect, datum, ribbon, Spacing, Unit
from python_stories.data import SEATTLE_WEATHER

MONTH_NAMES = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
]

# Classic "temperature distributions by month" ridgeline: each month's
# density of daily highs (across all four years), a kernel density over
# that month's days.
DAYS = [
    # All dates are "YYYY-MM-DDT00:00:00.000Z": the month is a fixed slice
    # (mirrors JS `new Date(d.date).getUTCMonth()`).
    {**d, "month": MONTH_NAMES[int(d["date"][5:7]) - 1]}
    for d in SEATTLE_WEATHER
]
# The rules under the ridges run across the whole x axis, past the tails
# of every month's density (each runs three bandwidths past its month's
# days), so each month's name sits left of every ridge.
RULE_FROM = -10
RULE_TO = 40

# Fixed row-to-row pitch shared by the ridge spread and the label spread
# below, so a month's rule+label always sit at the same baseline as its
# silhouette. Both tiers chain their rows with
# `Spacing.pitch(ROW_PITCH, at="baseline")`, and both rows put their semantic baseline at local 0 (the ribbon's
# zero-count line; the rule), so the two chains solve to identical lines.
ROW_PITCH = 24

# Each month's section is a fixed height: the tallest ridge (the largest
# density) is this many px, whatever the width, the pitch or the number of
# months. The ridges overlap because it is far more than ROW_PITCH, and the
# chart's height follows from the sections, so the chart sets no `h`.
RIDGE_HEIGHT = 140


def story_default():
    temp = field("temp_max")
    return (
        chart(
            DAYS,
            axes={"x": True, "y": False},
            schema={"temp_max": {"name": "Max temperature", "unit": Unit("°C")}},
            w=500,
        )
        .flow(
            spread(
                by=field("month").sort(MONTH_NAMES),
                dir="y",
                spacing=Spacing.pitch(ROW_PITCH, at="baseline"),
            ),
            derive(kde("temp_max")),
        )
        .mark(
            layer(
                [
                    ribbon(
                        x=temp.domain(),
                        h=temp.density(),
                        fill="steelblue",
                        stroke="white",
                        stroke_width=1,
                        opacity=0.85,
                        blend_mode="normal",
                    )
                ],
                h=RIDGE_HEIGHT,
            )
        )
        # Per-row baseline labeling, in the style of a ggridges ridgeline: a
        # thin rule along each month's baseline with the month name to the
        # LEFT of the plot (tick-label style), instead of a standard y axis
        # that can't line up with 12 overlapping, unevenly-tall silhouettes.
        # The rules are the same fixed-pitch baseline spread as the ridges, a
        # bare rect per month, so each registers exactly on its ribbon's zero
        # line. Each rule spans the x axis. Each rule carries its month as a
        # label outside its left end, standing on the rule. `.z_order(-1)` paints the rules BEHIND the
        # ribbons, visible only outside the silhouettes, the classic look.
        .layer(
            chart([{"month": month} for month in MONTH_NAMES])
            .flow(
                spread(
                    by=field("month").sort(MONTH_NAMES),
                    dir="y",
                    spacing=Spacing.pitch(ROW_PITCH, at="baseline"),
                )
            )
            .mark(
                rect(
                    x=datum(RULE_FROM),
                    w=datum(RULE_TO - RULE_FROM),
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
