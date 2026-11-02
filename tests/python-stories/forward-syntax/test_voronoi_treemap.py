"""Equivalent of VoronoiTreemap.stories.tsx — Forward Syntax/Voronoi Treemap.

Seventy countries as cells with areas proportional to population, nested by
region and continent. Each ``treemap`` is one level with ``Tile.voronoi``;
``region()`` draws the cell it is in, and ``spacing`` sets the gaps.
"""

from gofish import Shape, Tile, chart, enclose, rect, region, treemap
from python_stories.data import COUNTRY_POPULATIONS


def story_default():
    return (
        chart(COUNTRY_POPULATIONS, axes=False, w=480, h=480)
        .flow(
            treemap(by="continent", size="pop", spacing=5, tile=Tile.voronoi),
            treemap(by="region", size="pop", spacing=2.5, tile=Tile.voronoi),
            treemap(size="pop", spacing=1, tile=Tile.voronoi),
        )
        .mark(region(fill="continent")),
        {},
    )


def story_circle():
    # The enclose above the treemap hands its oval down as the treemap's
    # region.
    return (
        chart(COUNTRY_POPULATIONS, axes=False, w=480, h=480)
        .flow(
            enclose(shape=Shape.oval, fill="none"),
            treemap(by="continent", size="pop", spacing=5, tile=Tile.voronoi),
            treemap(by="region", size="pop", spacing=2.5, tile=Tile.voronoi),
            treemap(size="pop", spacing=1, tile=Tile.voronoi),
        )
        .mark(region(fill="continent")),
        {},
    )


def story_squarify_then_voronoi():
    return (
        chart(COUNTRY_POPULATIONS, axes=False, w=480, h=480)
        .flow(
            treemap(by="continent", size="pop", spacing=8),
            treemap(by="region", size="pop", spacing=2.5, tile=Tile.voronoi),
            treemap(size="pop", spacing=1, tile=Tile.voronoi),
        )
        .mark(region(fill="continent")),
        {},
    )


def story_slice_then_dice():
    return (
        chart(COUNTRY_POPULATIONS, axes=False, w=320, h=320)
        .flow(
            treemap(by="continent", size="pop", spacing=4, tile=Tile.slice),
            treemap(by="region", size="pop", spacing=2, tile=Tile.dice),
        )
        .mark(rect(fill="continent")),
        {},
    )


def story_continent_outlines():
    # In a Voronoi cell, Shape.box is the cell itself.
    return (
        chart(COUNTRY_POPULATIONS, axes=False, w=480, h=480)
        .flow(
            treemap(by="continent", size="pop", spacing=6, tile=Tile.voronoi),
            enclose(shape=Shape.box, fill="none", stroke="#333", stroke_width=1.5),
            treemap(by="region", size="pop", spacing=3, tile=Tile.voronoi),
            treemap(size="pop", spacing=1, tile=Tile.voronoi),
        )
        .mark(region(fill="continent")),
        {},
    )
