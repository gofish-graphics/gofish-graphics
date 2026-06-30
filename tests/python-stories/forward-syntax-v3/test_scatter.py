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
    # Mark-as-function: each lake glyph inherits its parent partition (the
    # lake's row) and joins in that lake's catch rows, then draws them as a
    # polar pie. Mirrors JS storybook's
    # `.mark((data) => chart(data, {coord: clock()})
    #     .flow(join(seafood, {on: "lake"}), stack(...)))`.
    def _pie_glyph(data):
        return (
            chart(data, coord=clock())
            .flow(join(SEAFOOD, on="lake"), stack(by="species", dir="x", h=20))
            .mark(rect(w="count", fill="species"))
        )

    return (
        chart(CATCH_LOCATIONS_ARRAY)
        .flow(scatter(by="lake", x="x", y="y"))
        .mark(_pie_glyph),
        {"w": 400, "h": 400, "axes": True},
    )


def story_connected():
    return (
        chart(DRIVING_SHIFTS)
        .flow(scatter(by="year", x="miles", y="gas"))
        .mark(circle(r=4, fill="white", stroke="black", strokeWidth=2))
        .connect(line(stroke="black", strokeWidth=2)),
        {"w": 400, "h": 400, "axes": True},
    )
