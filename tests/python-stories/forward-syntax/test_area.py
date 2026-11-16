"""Equivalent of Area.stories.tsx — Forward Syntax/Area."""

from gofish import chart, spread, stack, ribbon, line, group, Coord, Unit
from python_stories.data import SEAFOOD, UNEMPLOYMENT


def story_basic():
    construction = [d for d in UNEMPLOYMENT if d["series"] == "Construction"]
    return (
        chart(construction, w=560, h=300, schema={"date": Unit.time()}).mark(
            ribbon(x="date", h="count", opacity=0.8)
        ),
        {},
    )


def story_stacked():
    return (
        chart(SEAFOOD, h=400)
        .flow(
            spread(by="lake", dir="x", spacing=64),
            stack(by="species", dir="y"),
        )
        .mark(ribbon(h="count", fill="species", opacity=0.8)),
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
        chart(rows, w=560, h=300, schema={"date": Unit.time()})
        .flow(group(by="series"))
        .mark(ribbon(x="date", h="count", fill="series", opacity=0.5)),
        {},
    )
