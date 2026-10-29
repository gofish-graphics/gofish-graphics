"""Equivalent of forwardsyntax/Croissant.stories.tsx — Forward Syntax/Croissant.

Croissant charts: a density curve cut at its quantiles into equal-probability
slices, each drawn on its own with a small gap, with one dot per slice at the
slice's median. The first layer draws the curve, unseen; the `.relate()`
clause turns the grid into quantile rows of that curve, partitions them into
`Bin.quantiles(n)` cells (ten, or five a month in the ridgeline), and in each
cell draws the curve intersected with the cell's region, drawn in by a few
pixels, plus a dot at the cell's median. The last story cuts an area into
calendar months the same way.
"""

import math

from gofish import (
    Bin,
    Calendar,
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
)
from python_stories.data import PENGUINS, SEATTLE_WEATHER

FILL = "#D1E4F6"
STROKE = "#467DA8"


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


def _croissant(grid, x_title=None):
    return layer(
        [
            chart(grid)
            .flow(scatter(x="x"))
            .mark(ribbon(h="pdf", fill="none").name("density")),
        ]
    ).relate(
        lambda density: [
            chart(grid)
            .flow(
                derive(
                    lambda rows: quantile_rows(rows, x="x", density="pdf", n=1000)
                ),
                partition(by=field("x").bin(Bin.quantiles(10)), dir="x"),
            )
            .mark(
                layer(
                    [
                        intersect(
                            [density, region(inset=3)],
                            fill=FILL,
                            stroke=STROKE,
                            stroke_width=2,
                        ),
                        circle(cx=field("x").median(), cy=6, r=3, fill=STROKE),
                    ]
                )
            ),
        ]
    )


NORMAL_GRID = _grid_of(lambda x: _norm_pdf(x), -4, 4, 401)


def story_croissant():
    return _croissant(NORMAL_GRID), {
        "w": 480,
        "h": 200,
        "axes": {"x": True, "y": False},
    }


_MASSES = [p["Body Mass (g)"] for p in PENGUINS if p["Body Mass (g)"] is not None]
MASS_GRID = _grid_of(_kde(_MASSES)[0], 2200, 6800, 461)


def story_penguin_body_mass():
    return _croissant(MASS_GRID), {
        "w": 520,
        "h": 220,
        "axes": {"x": {"title": "Body mass (g)"}, "y": False},
    }


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
                anchor="baseline",
                spacing=36,
            )
        )
        .mark(
            layer(
                [
                    chart()
                    .flow(scatter(x="temp_max"))
                    .mark(ribbon(h="pdf", fill="none").name("density")),
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
    it (fewer at the ends of the year)."""
    days = [d for d in SEATTLE_WEATHER if d["date"].startswith("2012")]
    rows = []
    for i, d in enumerate(days):
        window = days[max(0, i - 7) : i + 8]
        total = 0.0
        for w in window:
            total += w["temp_max"]
        rows.append({"date": d["date"][:10], "temp_smooth": total / len(window)})
    return rows


HIGHS_2012 = _highs_2012()
SCHEMA_2012 = {"date": Unit.time()}


def story_seattle_highs_by_month():
    return (
        layer(
            [
                chart(HIGHS_2012, schema=SCHEMA_2012)
                .flow(scatter(x="date"))
                .mark(ribbon(h="temp_smooth", fill="none").name("temps")),
            ]
        ).relate(
            lambda temps: [
                chart(HIGHS_2012, schema=SCHEMA_2012)
                .flow(
                    partition(
                        by=field("date").bin([Calendar.year, Calendar.month]),
                        dir="x",
                    )
                )
                .mark(
                    intersect(
                        [temps, region(inset=2)],
                        fill=FILL,
                        stroke=STROKE,
                        stroke_width=1.5,
                    )
                ),
            ]
        ),
        {
            "w": 560,
            "h": 220,
            "axes": {
                "x": {"title": False},
                "y": {"title": "Daily high, 15-day mean (°C)"},
            },
        },
    )
