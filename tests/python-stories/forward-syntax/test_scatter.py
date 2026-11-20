"""Equivalent of Scatter.stories.tsx — Forward Syntax/Scatter."""

from gofish import (
    chart,
    circle,
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
    SEAFOOD,
)


def story_basic():
    return (
        chart(CATCH_LOCATIONS_ARRAY, w=400, h=400)
        .flow(scatter(by="lake", cx="x", cy="y"))
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
        .flow(scatter(by="lake", cx="x", cy="y"))
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
        .flow(scatter(by="lake", cx="x", cy="y"))
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
        .flow(scatter(by="year", cx="miles", cy="gas"))
        .mark(circle(r=4, fill="white", stroke="black", stroke_width=2))
        .layer(line(stroke="black", stroke_width=2)),
        {},
    )


# The three anchors a scatter places by, on shared axes: `cx`/`cy` centers
# each square on its point, `x`/`y` puts its start edges there, and `x2`/`y2`
# its end edges. The black dots sit on the data points.
ANCHOR_POINTS = [
    {"id": "a", "u": 2, "v": 2},
    {"id": "b", "u": 6, "v": 8},
    {"id": "c", "u": 10, "v": 4},
]


def _anchor_squares(fill, **keys):
    return (
        chart(ANCHOR_POINTS)
        .flow(scatter(by="id", **keys))
        .mark(rect(w=60, h=60, fill=fill, opacity=0.35))
    )


def story_anchors():
    return (
        chart(ANCHOR_POINTS, w=400, h=400)
        .flow(scatter(by="id", cx="u", cy="v"))
        .mark(rect(w=60, h=60, fill="orange", opacity=0.35))
        .layer(_anchor_squares("steelblue", x="u", y="v"))
        .layer(_anchor_squares("seagreen", x2="u", y2="v"))
        .layer(
            chart(ANCHOR_POINTS)
            .flow(scatter(by="id", cx="u", cy="v"))
            .mark(circle(r=3, fill="black"))
        ),
        {},
    )
