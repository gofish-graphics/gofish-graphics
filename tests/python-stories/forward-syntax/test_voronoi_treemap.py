"""Equivalent of VoronoiTreemap.stories.tsx — Forward Syntax/Voronoi Treemap.

Seventy countries as cells with areas proportional to population, nested by
region and continent. Each ``tile`` is one level with ``Tiling.voronoi``;
``region()`` draws the cell it is in, and ``spacing`` sets the gaps.
"""

from gofish import Shape, Tiling, chart, enclose, rect, region, tile
from python_stories.data import COUNTRY_POPULATIONS


def story_default():
    return (
        chart(COUNTRY_POPULATIONS, axes=False, w=480, h=480)
        .flow(
            tile(by="continent", size="pop", spacing=5, method=Tiling.voronoi),
            tile(by="region", size="pop", spacing=2.5, method=Tiling.voronoi),
            tile(size="pop", spacing=1, method=Tiling.voronoi),
        )
        .mark(region(fill="continent")),
        {},
    )


def story_circle():
    # The enclose above the `tile` hands its oval down as the `tile`'s
    # region.
    return (
        chart(COUNTRY_POPULATIONS, axes=False, w=480, h=480)
        .flow(
            enclose(shape=Shape.oval, fill="none"),
            tile(by="continent", size="pop", spacing=5, method=Tiling.voronoi),
            tile(by="region", size="pop", spacing=2.5, method=Tiling.voronoi),
            tile(size="pop", spacing=1, method=Tiling.voronoi),
        )
        .mark(region(fill="continent")),
        {},
    )


def story_squarify_then_voronoi():
    return (
        chart(COUNTRY_POPULATIONS, axes=False, w=480, h=480)
        .flow(
            tile(by="continent", size="pop", spacing=8),
            tile(by="region", size="pop", spacing=2.5, method=Tiling.voronoi),
            tile(size="pop", spacing=1, method=Tiling.voronoi),
        )
        .mark(region(fill="continent")),
        {},
    )


def story_slice_then_dice():
    return (
        chart(COUNTRY_POPULATIONS, axes=False, w=320, h=320)
        .flow(
            tile(by="continent", size="pop", spacing=4, method=Tiling.slice),
            tile(by="region", size="pop", spacing=2, method=Tiling.dice),
        )
        .mark(rect(fill="continent")),
        {},
    )


def story_continent_outlines():
    # In a Voronoi cell, Shape.box is the cell itself.
    return (
        chart(COUNTRY_POPULATIONS, axes=False, w=480, h=480)
        .flow(
            tile(by="continent", size="pop", spacing=6, method=Tiling.voronoi),
            enclose(shape=Shape.box, fill="none", stroke="#333", stroke_width=1.5),
            tile(by="region", size="pop", spacing=3, method=Tiling.voronoi),
            tile(size="pop", spacing=1, method=Tiling.voronoi),
        )
        .mark(region(fill="continent")),
        {},
    )
