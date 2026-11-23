"""Equivalent of forwardsyntax/Croissant.stories.tsx — Forward Syntax/Croissant.

Croissant charts: a density curve cut at its quantiles into equal-probability
slices, each drawn on its own with a small gap, with one dot per slice at the
slice's median. A partition by the distribution's cells gives each cell the
distribution restricted to it, and a ribbon of its domain and density,
drawn in by a few pixels, draws the cell's slice. The standard normal is cut
at its quintiles. ``derive(kde(x))`` smooths the rows into a kernel density
the column then holds, cut at its own quantiles: the penguins' body mass at
its deciles, and each month's highs at the month's own quintiles. The last
story cuts an area into calendar months.
"""

from gofish import (
    Binning,
    Calendar,
    Dist,
    Spacing,
    Unit,
    chart,
    circle,
    derive,
    field,
    kde,
    layer,
    partition,
    ribbon,
    spread,
    text,
)
from python_stories.data import PENGUINS, SEATTLE_WEATHER

FILL = "#D1E4F6"
STROKE = "#467DA8"
# The colors of the paper's "Anatomy of a Croissant Chart" figure.
PAPER_FILL = "#CBA45F"
PAPER_STROKE = "#745931"


D = Dist.normal(mean="mean", sd="sd")


def story_croissant():
    return (
        chart([{"mean": 0, "sd": 1}])
        .flow(partition(by=D.bin(Binning.quantiles(5)), dir="x"))
        .mark(
            layer(
                [
                    ribbon(
                        x=D.domain(),
                        h=D.density(),
                        inset=3,
                        fill=PAPER_FILL,
                        stroke=PAPER_STROKE,
                        stroke_width=2,
                    ),
                    circle(cx=D.median(), cy=6, r=3, fill=PAPER_STROKE),
                ]
            )
        ),
        {"w": 480, "h": 200, "axes": {"x": {"title": "x"}, "y": False}},
    )


MASS = field("Body Mass (g)")


def story_penguin_body_mass():
    return (
        chart(PENGUINS)
        .flow(
            derive(kde("Body Mass (g)")),
            partition(by=MASS.bin(Binning.quantiles(10)), dir="x"),
        )
        .mark(
            layer(
                [
                    ribbon(
                        x=MASS.domain(),
                        h=MASS.density(),
                        inset=3,
                        fill=FILL,
                        stroke=STROKE,
                        stroke_width=2,
                    ),
                    circle(cx=MASS.median(), cy=6, r=3, fill=STROKE),
                ]
            )
        ),
        {"w": 520, "h": 220, "axes": {"x": {"title": "Body mass (g)"}, "y": False}},
    )


MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
          "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]


# Seattle's daily highs, each with its month.
HIGHS = [
    {"month": MONTHS[int(d["date"][5:7]) - 1], "temp_max": d["temp_max"]}
    for d in SEATTLE_WEATHER
]
TEMP = field("temp_max")


def story_ridgeline():
    return (
        chart(
            HIGHS,
            w=520,
            axes={"x": {"title": "Daily high (°C)"}, "y": False},
        )
        .flow(
            spread(
                by=field("month").sort(MONTHS),
                dir="y",
                spacing=Spacing.pitch(36, at="baseline"),
            ),
            derive(kde("temp_max")),
            partition(by=TEMP.bin(Binning.quantiles(5)), dir="x"),
        )
        .mark(
            layer(
                [
                    ribbon(
                        x=TEMP.domain(),
                        h=TEMP.density(),
                        inset=2,
                        fill=FILL,
                        stroke=STROKE,
                        stroke_width=1.5,
                    ),
                    circle(cx=TEMP.median(), cy=5, r=2.25, fill=STROKE),
                ],
                h=34,
            )
        ),
        {},
    )


def _highs_2012():
    """Seattle's daily highs in 2012, each the mean of the 15 days centered on
    it (fewer at the ends of the year), with its month's initial."""
    days = [d for d in SEATTLE_WEATHER if d["date"].startswith("2012")]
    rows = []
    for i, d in enumerate(days):
        window = days[max(0, i - 7) : i + 8]
        total = 0.0
        for w in window:
            total += w["temp_max"]
        rows.append(
            {
                "date": d["date"][:10],
                "letter": MONTHS[int(d["date"][5:7]) - 1][0],
                "temp_smooth": total / len(window),
            }
        )
    return rows


HIGHS_2012 = _highs_2012()
SCHEMA_2012 = {"date": Unit.time()}


def story_seattle_highs_by_month():
    return (
        chart(HIGHS_2012, schema=SCHEMA_2012)
        .flow(
            partition(
                by=field("date").bin([Calendar.year, Calendar.month]),
                dir="x",
            )
        )
        .mark(
            layer(
                [
                    ribbon(
                        x="date",
                        h="temp_smooth",
                        inset=2,
                        fill=FILL,
                        stroke=STROKE,
                        stroke_width=1.5,
                    ),
                    text(
                        cx=field("date").median(),
                        y=6,
                        text="letter",
                        font_size=11,
                        fill="#333",
                    ),
                ]
            )
        ),
        {
            "w": 560,
            "h": 220,
            "axes": {"x": False, "y": {"title": "Daily high, 15-day mean (°C)"}},
        },
    )
