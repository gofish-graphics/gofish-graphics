"""Equivalent of ColorScales.stories.tsx — Forward Syntax V3/Color Scales."""

import math

from gofish import (
    Layer,
    chart,
    clock,
    spread,
    stack,
    derive,
    rect,
    select,
    area,
    group,
    palette,
    gradient,
)
from python_stories.data import SEAFOOD, SCORES_DATA


def story_palette_named_scheme():
    return (
        chart(SEAFOOD, color=palette("tableau10"))
        .flow(spread(by="species", dir="x"))
        .mark(rect(h="count", fill="species")),
        {"w": 400, "h": 400, "axes": True},
    )


def story_palette_string_array():
    return (
        chart(SEAFOOD, color=palette(["#e41a1c", "#377eb8", "#4daf4a", "#984ea3", "#ff7f00"]))
        .flow(spread(by="species", dir="x"))
        .mark(rect(h="count", fill="species")),
        {"w": 400, "h": 400, "axes": True},
    )


def story_gradient_named_scheme():
    return (
        chart(SCORES_DATA, color=gradient("blues"))
        .flow(spread(by="label", dir="x"))
        .mark(rect(h="value", fill="value")),
        {"w": 400, "h": 400, "axes": True},
    )


def story_gradient_string_array():
    return (
        chart(SCORES_DATA, color=gradient(["#f7fbff", "#42c663", "#6b0808"]))
        .flow(spread(by="label", dir="x"))
        .mark(rect(h="value", fill="value")),
        {"w": 400, "h": 400, "axes": True},
    )


def story_nested_derive():
    lake_order = ["Lake A", "Lake B", "Lake C", "Lake D", "Lake E", "Lake F"]
    return (
        chart(SEAFOOD, color=palette({"salmon-highlight": "#e15759", "first-half": "#4e79a7"}))
        .flow(
            derive(lambda d: [
                {
                    **item,
                    "highlight": (
                        "salmon-highlight"
                        if lake_order.index(item["lake"]) < 3 and item["species"] == "Salmon"
                        else "first-half"
                        if lake_order.index(item["lake"]) < 3
                        else ""
                    ),
                }
                for item in d
            ]),
            spread(by="lake", dir="x"),
            stack(by="species", dir="x"),
        )
        .mark(rect(h="count", fill="highlight")),
        {"w": 400, "h": 400, "axes": True},
    )


def story_selective_derive():
    return (
        chart(SEAFOOD, color=palette({"highlighted": "#e15759"}))
        .flow(
            derive(lambda d: [
                {**item, "highlight": "highlighted" if item["species"] == "Salmon" else ""}
                for item in d
            ]),
            spread(by="lake", dir="x"),
            stack(by="species", dir="x"),
        )
        .mark(rect(h="count", fill="highlight")),
        {"w": 400, "h": 400, "axes": True},
    )


def story_selective_group():
    return (
        chart(SEAFOOD, color=palette({"Salmon": "#e15759"}))
        .flow(
            spread(by="lake", dir="x"),
            stack(by="species", dir="x"),
        )
        .mark(rect(h="count", fill="species")),
        {"w": 400, "h": 400, "axes": True},
    )


_NUM_RINGS = 6
_NUM_SECTORS = 12
_ROSE_DATA = [
    {
        "sector": f"S{(i % _NUM_SECTORS) + 1}",
        "ring": i // _NUM_SECTORS,
        "value": 2
        + 25 * abs(math.sin((i % _NUM_SECTORS) * 1.3) * math.cos((i // _NUM_SECTORS) * 0.9 + 1)),
    }
    for i in range(_NUM_RINGS * _NUM_SECTORS)
]


def story_rose_gradient():
    return (
        chart(_ROSE_DATA, color=gradient("blues"), coord=clock())
        .flow(
            spread(by="sector", dir="x", spacing=0, axes=False),
            stack(by="ring", dir="y", axes=True),
        )
        .mark(rect(w=(math.pi * 2) / _NUM_SECTORS, emX=True, h="value", fill="ring")),
        {"w": 400, "h": 400, "axes": True},
    )


def story_ribbon_highlight():
    bars = (
        chart(SEAFOOD, color=palette({"Salmon": "#e15759", "Trout": "#4e79a7"}))
        .flow(
            spread(by="lake", dir="x", spacing=64),
            derive(lambda d: sorted(d, key=lambda r: r["count"])),
            stack(by="species", dir="y"),
        )
        .mark(rect(h="count", fill="species").name("bars"))
    )
    overlay = chart(select("bars")).flow(group(by="species")).mark(area(opacity=0.6))
    return (
        Layer([bars, overlay]),
        {"w": 400, "h": 400, "axes": True},
    )
