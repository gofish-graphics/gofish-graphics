"""Equivalent of Area.stories.tsx — Forward Syntax/Area."""

from gofish import chart, stack, ribbon, line, group, Baseline, Coord, Unit
from python_stories.data import UNEMPLOYMENT

# The six industries with the most unemployment over the decade, one for
# each color of the default palette.
LARGEST = [
    "Wholesale and Retail Trade",
    "Manufacturing",
    "Leisure and hospitality",
    "Business services",
    "Construction",
    "Education and Health",
]
AXES = {"x": {"title": False}, "y": {"title": "Unemployed (thousands)"}}


def story_basic():
    construction = [d for d in UNEMPLOYMENT if d["series"] == "Construction"]
    return (
        chart(
            construction, w=560, h=300, schema={"date": Unit.time()}, axes=AXES
        ).mark(ribbon(x="date", h="count", opacity=0.8)),
        {},
    )


def story_stacked():
    rows = [d for d in UNEMPLOYMENT if d["series"] in LARGEST]
    return (
        chart(rows, w=560, h=400, schema={"date": Unit.time()}, axes=AXES)
        .flow(stack(by="series", dir="y"))
        .mark(ribbon(x="date", h="count", fill="series")),
        {},
    )


def story_stacked_middle():
    return (
        chart(UNEMPLOYMENT, w=560, h=400, schema={"date": Unit.time()})
        .flow(stack(by="series", dir="y", baseline=Baseline.middle()))
        .mark(ribbon(x="date", h="count", fill="series")),
        {},
    )


def story_stacked_uneven_samples():
    rows = [
        *({"s": "a", "x": x, "v": v} for x, v in zip([0, 2, 4, 6, 8], [3, 4, 2, 5, 3])),
        *({"s": "b", "x": x, "v": v} for x, v in zip([1, 2.5, 5, 7], [1, 2, 3, 1])),
        *({"s": "c", "x": x, "v": v} for x, v in zip([0, 3, 8], [2, 1, 2])),
    ]
    return (
        chart(rows, w=420, h=300)
        .flow(stack(by="s", dir="y"))
        .mark(ribbon(x="x", h="v", fill="s")),
        {},
    )


def story_stacked_polar():
    industries = ["Construction", "Finance", "Manufacturing"]
    rows = [
        d
        for d in UNEMPLOYMENT
        if d["series"] in industries and d["date"].startswith("2009")
    ]
    return (
        chart(
            rows,
            coord=Coord.clock(),
            w=420,
            h=420,
            schema={"date": Unit.time()},
        )
        .flow(stack(by="series", dir="y"))
        .mark(ribbon(x="date", h="count", fill="series")),
        {},
    )


def story_polar():
    industries = ["Construction", "Finance"]
    rows = [
        d
        for d in UNEMPLOYMENT
        if d["series"] in industries and d["date"].startswith("2009")
    ]
    return (
        chart(
            rows,
            coord=Coord.clock(),
            w=420,
            h=420,
            schema={"date": Unit.time()},
        )
        .flow(group(by="series"))
        .mark(ribbon(x="date", h="count", fill="series", opacity=0.6)),
        {},
    )


def story_labeled():
    schema = {"date": Unit.time()}
    construction = [d for d in UNEMPLOYMENT if d["series"] == "Construction"]
    lines = [d for d in UNEMPLOYMENT if d["series"] in ("Finance", "Information")]
    return (
        chart(construction, w=560, h=300, schema=schema)
        .mark(ribbon(x="date", h="count", opacity=0.4).label("series"))
        .layer(
            chart(lines, schema=schema)
            .flow(group(by="series"))
            .mark(line(x="date", y="count", stroke="series").label("series"))
        ),
        {},
    )


def story_layered():
    industries = ["Manufacturing", "Construction", "Finance"]
    rows = [d for d in UNEMPLOYMENT if d["series"] in industries]
    return (
        chart(rows, w=560, h=300, schema={"date": Unit.time()}, axes=AXES)
        .flow(group(by="series"))
        .mark(ribbon(x="date", h="count", fill="series", opacity=0.5)),
        {},
    )
