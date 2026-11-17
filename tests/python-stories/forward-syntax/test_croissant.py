"""Equivalent of forwardsyntax/Croissant.stories.tsx — Forward Syntax/Croissant.

Croissant charts: a density curve cut at its quantiles into equal-probability
slices, each drawn on its own with a small gap, with one dot per slice at the
slice's median. A partition by the distribution's cells gives each cell the
distribution restricted to it, and a ribbon of its domain and density,
drawn in by a few pixels, draws the cell's slice. The standard normal is cut
at its quintiles, the penguins' body mass at the deciles of its values. The
ridgeline still draws each month's curve hidden and intersects it with each
cell's region. The last story cuts an area into calendar months.
"""

import math

from gofish import (
    Bin,
    Calendar,
    Dist,
    Spacing,
    Unit,
    chart,
    circle,
    derive,
    field,
    intersect,
    layer,
    partition,
    quantile_rows,
    region,
    ribbon,
    scatter,
    spread,
    text,
)
from python_stories.data import PENGUINS, SEATTLE_WEATHER

FILL = "#D1E4F6"
STROKE = "#467DA8"
# The colors of the paper's "Anatomy of a Croissant Chart" figure.
PAPER_FILL = "#CBA45F"
PAPER_STROKE = "#745931"


def _norm_pdf(x, mu=0.0, sd=1.0):
    return math.exp(-0.5 * ((x - mu) / sd) ** 2) / (sd * math.sqrt(2 * math.pi))


def _grid_of(f, lo, hi, n):
    """`n` evenly spaced grid rows `{x, pdf}` of `f` over `[lo, hi]`."""
    rows = []
    for i in range(n):
        x = lo + ((hi - lo) * i) / (n - 1)
        rows.append({"x": x, "pdf": f(x)})
    return rows


def _kde(values):
    """A Gaussian kernel density estimate with Silverman's bandwidth."""
    n = len(values)
    mean = sum(values) / n
    sd = math.sqrt(sum((v - mean) ** 2 for v in values) / (n - 1))
    bw = 1.06 * sd * n**-0.2

    def f(x):
        total = 0.0
        for v in values:
            total += _norm_pdf(x, v, bw)
        return total / n

    return f, bw


D = Dist.normal(mean="mean", sd="sd")


def story_croissant():
    return (
        chart([{"mean": 0, "sd": 1}])
        .flow(partition(by=D.bin(Bin.quantiles(5)), dir="x"))
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
        chart([p for p in PENGUINS if p["Body Mass (g)"] is not None])
        .flow(partition(by=MASS.bin(Bin.quantiles(10)), dir="x"))
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


def _monthly_density():
    rows = []
    for m, month in enumerate(MONTHS):
        highs = [
            d["temp_max"] for d in SEATTLE_WEATHER if int(d["date"][5:7]) - 1 == m
        ]
        f, bw = _kde(highs)
        lo = min(highs) - 3 * bw
        hi = max(highs) + 3 * bw
        for r in _grid_of(f, lo, hi, 161):
            rows.append({"month": month, "temp_max": r["x"], "pdf": r["pdf"]})
    return rows


MONTHLY_DENSITY = _monthly_density()


def story_ridgeline():
    return (
        chart(
            MONTHLY_DENSITY,
            w=520,
            axes={"x": {"title": "Daily high (°C)"}, "y": False},
        )
        .flow(
            spread(
                by=field("month").sort(MONTHS),
                dir="y",
                spacing=Spacing.pitch(36, at="baseline"),
            )
        )
        .mark(
            layer(
                [
                    chart()
                    .flow(scatter(x="temp_max"))
                    .mark(ribbon(h="pdf").name("density").hidden()),
                ],
                h=34,
            ).relate(
                lambda density: [
                    chart()
                    .flow(
                        derive(
                            lambda rows: quantile_rows(
                                rows, x="temp_max", density="pdf", n=1000
                            )
                        ),
                        partition(
                            by=field("temp_max").bin(Bin.quantiles(5)), dir="x"
                        ),
                    )
                    .mark(
                        layer(
                            [
                                intersect(
                                    [density, region(inset=2)],
                                    fill=FILL,
                                    stroke=STROKE,
                                    stroke_width=1.5,
                                ),
                                circle(
                                    cx=field("temp_max").median(),
                                    cy=5,
                                    r=2.25,
                                    fill=STROKE,
                                ),
                            ]
                        )
                    ),
                ]
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
