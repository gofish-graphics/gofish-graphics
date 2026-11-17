"""Equivalent of Scatter.stories.tsx — Forward Syntax/Scatter."""

from gofish import (
    Curve,
    chart,
    circle,
    derive,
    join,
    line,
    rect,
    scatter,
    stack,
    Coord,
)
from python_stories.data import (
    CATCH_DATA_WITH_LOCATIONS,
    CATCH_LOCATIONS_ARRAY,
    DRIVING_SHIFTS,
    PENGUINS,
    SEAFOOD,
)


def story_basic():
    return (
        chart(CATCH_LOCATIONS_ARRAY, w=400, h=400)
        .flow(scatter(by="lake", x="x", y="y"))
        .mark(circle(r=5)),
        {},
    )


def story_with_pie_glyphs():
    # The glyph chart leaves off its data: as a nested mark it inherits its
    # parent partition (the lake's row), joins in that lake's catch rows, and
    # draws them as a polar pie — no `lambda data: chart(data, ...)` callback.
    # Mirrors JS storybook's `.mark(chart({coord: clock()}).flow(...))`.
    return (
        chart(CATCH_LOCATIONS_ARRAY, w=400, h=400)
        .flow(scatter(by="lake", x="x", y="y"))
        .mark(
            chart(coord=Coord.clock())
            .flow(join(SEAFOOD, on="lake"), stack(by="species", dir="x", h=20))
            .mark(rect(w="count", fill="species"))
        ),
        {},
    )


def story_with_pie_glyphs_denormalized():
    # Same pie-glyph chart from a single denormalized table: each catch row
    # already carries its lake's x/y, so the scatter partition holds each
    # glyph's rows — the nested chart inherits them directly, no join. Mirrors
    # JS `Scatter.stories.tsx::WithPieGlyphsDenormalized`.
    return (
        chart(CATCH_DATA_WITH_LOCATIONS, w=400, h=400)
        .flow(scatter(by="lake", x="x", y="y"))
        .mark(
            chart(coord=Coord.clock())
            .flow(stack(by="species", dir="x", h=20))
            .mark(rect(w="count", fill="species"))
        ),
        {},
    )


def story_connected():
    return (
        chart(DRIVING_SHIFTS, w=400, h=400)
        .flow(scatter(by="year", x="miles", y="gas"))
        .mark(circle(r=4, fill="white", stroke="black", stroke_width=2))
        .layer(line(stroke="black", stroke_width=2)),
        {},
    )


MEASURED = [
    p
    for p in PENGUINS
    if p["Flipper Length (mm)"] is not None and p["Body Mass (g)"] is not None
]


def _least_squares(rows, x, y):
    """The least-squares line of ``y`` on ``x`` through ``rows``, as two rows
    at the least and the greatest ``x``, with the same column names as the
    rows, so a line through them shares the scatter's axes."""
    n = len(rows)
    mx = sum(r[x] for r in rows) / n
    my = sum(r[y] for r in rows) / n
    sxy = sum((r[x] - mx) * (r[y] - my) for r in rows)
    sxx = sum((r[x] - mx) ** 2 for r in rows)
    slope = sxy / sxx
    xs = [r[x] for r in rows]
    return [{x: t, y: my + slope * (t - mx)} for t in (min(xs), max(xs))]


def story_trend_line():
    return (
        chart(MEASURED, w=400, h=400)
        .flow(scatter(x="Flipper Length (mm)", y="Body Mass (g)"))
        .mark(circle(r=2.5, fill="#9aa7b8"))
        .layer(
            chart(MEASURED)
            .flow(
                derive(
                    lambda rows: _least_squares(
                        rows, "Flipper Length (mm)", "Body Mass (g)"
                    )
                )
            )
            .mark(
                line(
                    x="Flipper Length (mm)",
                    y="Body Mass (g)",
                    stroke="#c0392b",
                    stroke_width=2,
                    curve=Curve.linear(),
                )
            )
        ),
        {},
    )
