"""Equivalent of BubbleTreemap.stories.tsx — Forward Syntax/Bubble Treemap.

Seventy countries packed by region and continent, with a ``Shape.arcs``
contour around each region and each continent: ``enclose`` as a flow step,
between the packs. Each country's circle takes its pixel radius from the
population (area proportional to it), since ``pack`` does not size children
from the data yet (#967).
"""

import math

from gofish import Shape, chart, circle, compose, enclose, pack
from python_stories.data import COUNTRY_POPULATIONS


def country(d):
    return circle(r=1.6 * math.sqrt(d[0]["pop"]), fill="continent")(d)


def story_default():
    return (
        chart(COUNTRY_POPULATIONS)
        .flow(
            pack(by="continent", spacing=4),
            enclose(
                shape=Shape.arcs(radius=12),
                padding=4,
                fill="none",
                stroke="#333",
                stroke_width=1.5,
            ),
            pack(by="region", spacing=4),
            enclose(shape=Shape.arcs(radius=8), padding=4, fill="none", stroke="#999"),
            pack(),
        )
        .mark(country),
        {"w": 720, "h": 600},
    )


def story_uncertainty():
    # Each region's contour sits `uncertainty` pixels from its countries (the
    # column is made up; see src/data/countryPopulations.ts).
    return (
        chart(COUNTRY_POPULATIONS)
        .flow(
            pack(by="continent", spacing=4),
            enclose(
                shape=Shape.arcs(radius=12),
                padding=4,
                fill="none",
                stroke="#333",
                stroke_width=1.5,
            ),
            pack(by="region", spacing=4),
            enclose(
                shape=Shape.arcs(radius=8),
                padding="uncertainty",
                fill="none",
                stroke="#999",
            ),
            pack(),
        )
        .mark(country),
        {"w": 760, "h": 640},
    )


def bubble_treemap(by, shape=None, spacing=4, padding=4):
    """A bubble treemap as one flow step: a pack and an enclose per level."""
    shape = shape if shape is not None else Shape.arcs()
    steps = []
    for key in by:
        steps += [
            pack(by=key, spacing=spacing),
            enclose(shape=shape, padding=padding, fill="none"),
        ]
    return compose(*steps, pack())


def story_composed():
    return (
        chart(COUNTRY_POPULATIONS)
        .flow(bubble_treemap(by=["continent", "region"]))
        .mark(country),
        {"w": 720, "h": 600},
    )
