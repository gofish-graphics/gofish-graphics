"""Equivalent of Scatter.stories.tsx — Forward Syntax V3/Scatter."""

from gofish import (
    chart,
    circle,
    clock,
    join,
    line,
    rect,
    scatter,
    stack,
)
from python_stories.data import (
    CATCH_DATA_WITH_LOCATIONS,
    CATCH_LOCATIONS_ARRAY,
    DRIVING_SHIFTS,
    SEAFOOD,
)


def story_basic():
    return (
        chart(CATCH_LOCATIONS_ARRAY)
        .flow(scatter(by="lake", x="x", y="y"))
        .mark(circle(r=5)),
        {"w": 400, "h": 400, "axes": True},
    )


def story_with_pie_glyphs():
    # The glyph chart leaves off its data: as a nested mark it inherits its
    # parent partition (the lake's row), joins in that lake's catch rows, and
    # draws them as a polar pie — no `lambda data: chart(data, ...)` callback.
    # Mirrors JS storybook's `.mark(chart({coord: clock()}).flow(...))`.
    return (
        chart(CATCH_LOCATIONS_ARRAY)
        .flow(scatter(by="lake", x="x", y="y"))
        .mark(
            chart(coord=clock())
            .flow(join(SEAFOOD, on="lake"), stack(by="species", dir="x", h=20))
            .mark(rect(w="count", fill="species"))
        ),
        {"w": 400, "h": 400, "axes": True},
    )


def story_with_pie_glyphs_denormalized():
    # Same pie-glyph chart from a single denormalized table: each catch row
    # already carries its lake's x/y, so the scatter partition holds each
    # glyph's rows — the nested chart inherits them directly, no join. Mirrors
    # JS `Scatter.stories.tsx::WithPieGlyphsDenormalized`.
    return (
        chart(CATCH_DATA_WITH_LOCATIONS)
        .flow(scatter(by="lake", x="x", y="y"))
        .mark(
            chart(coord=clock())
            .flow(stack(by="species", dir="x", h=20))
            .mark(rect(w="count", fill="species"))
        ),
        {"w": 400, "h": 400, "axes": True},
    )


def story_connected():
    return (
        chart(DRIVING_SHIFTS)
        .flow(scatter(by="year", x="miles", y="gas"))
        .mark(circle(r=4, fill="white", stroke="black", strokeWidth=2))
        .layer(line(stroke="black", strokeWidth=2)),
        {"w": 400, "h": 400, "axes": True},
    )
