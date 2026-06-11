"""Equivalent of Scatter.stories.tsx — Forward Syntax V3/Scatter."""

from collections import defaultdict

from gofish import (
    Layer,
    chart,
    circle,
    clock,
    line,
    rect,
    scatter,
    selectAll,
    stack,
)
from python_stories.data import (
    CATCH_LOCATIONS_ARRAY,
    DRIVING_SHIFTS,
    SEAFOOD,
)


# JS Scatter.stories.tsx imports `catchLocations` (a dict by lake name)
# alongside `catchLocationsArray`. Reconstruct it here.
CATCH_LOCATIONS = {row["lake"]: row for row in CATCH_LOCATIONS_ARRAY}


def story_basic():
    return (
        chart(CATCH_LOCATIONS_ARRAY)
        .flow(scatter(by="lake", x="x", y="y"))
        .mark(circle(r=5)),
        {"w": 400, "h": 400, "axes": True},
    )


def story_with_pie_glyphs():
    # Group seafood by lake. For each lake, build a row with the lake's
    # x/y and a `collection` of {species, count} per species. Matches the
    # JS storybook's lodash `.groupBy("lake").map(...)`.
    by_lake: dict = defaultdict(list)
    for row in SEAFOOD:
        by_lake[row["lake"]].append(row)
    scatter_data = [
        {
            "lake": lake,
            "x": CATCH_LOCATIONS[lake]["x"],
            "y": CATCH_LOCATIONS[lake]["y"],
            "collection": [
                {"species": item["species"], "count": item["count"]}
                for item in items
            ],
        }
        for lake, items in by_lake.items()
    ]

    # Mark-as-function: each per-lake group becomes its own polar
    # `stack`-by-species chart. Mirrors JS storybook's
    # `.mark((data) => Chart(data[0].collection, {coord: clock()}).flow(...))`.
    def _pie_glyph(data):
        return (
            chart(data[0]["collection"], coord=clock())
            .flow(stack(by="species", dir="x", h=20))
            .mark(rect(w="count", fill="species"))
        )

    return (
        chart(scatter_data)
        .flow(scatter(by="lake", x="x", y="y"))
        .mark(_pie_glyph),
        {"w": 400, "h": 400, "axes": True},
    )


def story_connected():
    points = (
        chart(DRIVING_SHIFTS)
        .flow(scatter(by="year", x="miles", y="gas"))
        .mark(circle(r=4, fill="white", stroke="black", strokeWidth=2).name("points"))
    )
    lines = (
        chart(selectAll("points"))
        .mark(line(stroke="black", strokeWidth=2))
        .zOrder(-1)
    )
    return (
        Layer([points, lines]),
        {"w": 400, "h": 400, "axes": True},
    )
