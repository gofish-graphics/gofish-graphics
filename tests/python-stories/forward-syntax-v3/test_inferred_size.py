"""Equivalent of InferredSize.stories.tsx — Forward Syntax V3/Inferred Size.

Exercises issue #494: each story omits `w`/`h` (empty options dict) so the
overall size is computed during layout per axis — scale-into-pixels axes fall
back to the 400px default, nothing-to-scale axes shrink to fit.
"""

from gofish import chart, spread, scatter, circle, rect, layer
from python_stories.data import CATCH_LOCATIONS_ARRAY, SEAFOOD


def story_bare_shape_shrink_to_fit():
    """A bare fixed-size shape reports its own bbox, so the SVG shrinks to fit
    ~80x50 (+ padding), not the 400px default."""
    return (
        rect(w=80, h=50, fill="steelblue"),
        {},
    )


def story_layer_shrink_to_fit():
    """A layer of fixed-size, positioned shapes reports the union of child
    bboxes, so the SVG shrinks to that content extent."""
    return (
        layer([
            rect(x=0, y=0, w=90, h=40, fill="steelblue"),
            rect(x=30, y=50, w=90, h=40, fill="tomato"),
        ]),
        {},
    )


def story_data_driven_height_default():
    """Bar chart with both dims omitted: the y axis is a data-driven SIZE (bar
    heights = value) so it falls back to the 400px default; the x axis is
    ORDINAL so bars keep their default width and the chart shrinks horizontally."""
    return (
        chart(SEAFOOD)
        .flow(spread(by="lake", dir="x"))
        .mark(rect(h="count")),
        {"axes": True},
    )


def story_position_scatter_default():
    """POSITION space (scatter) with omitted w/h → 400x400 default."""
    return (
        chart(CATCH_LOCATIONS_ARRAY)
        .flow(scatter(by="lake", x="x", y="y"))
        .mark(circle(r=5)),
        {"axes": True},
    )


def story_legend_tracks_computed_extent():
    """With w/h omitted and a color scale present, the legend is positioned
    relative to the computed content extent (just right of the content width)."""
    return (
        chart(SEAFOOD)
        .flow(spread(by="lake", dir="x"))
        .mark(rect(h="count", fill="species")),
        {},
    )
