"""
The ``Coord`` family: the coordinate transforms of a chart's or a layer's
``coord`` option.

The package binds this module as ``Coord``, so ``Coord.polar()`` and
``from gofish.coord import polar`` reach the same function. Each transform is
a plain dict on the wire, tagged by ``type``; the JS side rebuilds the
transform from it. Mirrors JS ``gofish-graphics/coord``.
"""

from ._generated import _polar_config

__all__ = ["polar", "clock", "wavy"]


# `clock()`/`polar()` are hand-written because the `clock`-vs-`polar` type
# tag isn't part of the descriptor; both call the generated `_polar_config`.


def clock(
    inner_radius: float | None = None,
    central_angle: float | None = None,
    start_angle: float | None = None,
    direction: int | None = None,
    center: tuple[float, float] | list[float] | None = None,
) -> dict:
    """
    Clock coordinate transform — a ``Coord.polar()`` preset with 0° at 12 o'clock,
    increasing clockwise (its defaults). Accepts the same options. Use as:
    ``chart(data, coord=Coord.clock())``.

    Args:
        inner_radius: donut hole as a fraction [0,1) of the outer radius (e.g. a
            clock rim). Default 0 (filled disc).
        central_angle: total angular sweep in radians. Default 2π (full circle).
        start_angle: angle (radians) of θ=0. Default π/2 (12 o'clock).
        direction: +1 counter-clockwise, -1 clockwise. Default -1.
        center: screen-space center offset [x, y]. Default [0, 0].

    Returns:
        Coord config dict for use in chart options
    """
    return _polar_config(
        "clock",
        inner_radius=inner_radius,
        central_angle=central_angle,
        start_angle=start_angle,
        direction=direction,
        center=center,
    )


def polar(
    inner_radius: float | None = None,
    central_angle: float | None = None,
    start_angle: float | None = None,
    direction: int | None = None,
    center: tuple[float, float] | list[float] | None = None,
) -> dict:
    """
    Polar coordinate transform — angle θ on the x-axis, radius r on the y-axis,
    with 0 at 12 o'clock. Use as: ``chart(data, coord=Coord.polar())``.

    The actual transform/domain is reconstructed on the JS side from this tag
    (the function body can't cross the IR bridge), mirroring ``Coord.clock()``.

    Args:
        inner_radius: donut hole as a fraction [0,1) of the outer radius.
            Default 0 (filled disc).
        central_angle: total angular sweep in radians. Default 2π (full circle).
        start_angle: angle (radians) of θ=0. Default π/2 (12 o'clock).
        direction: +1 counter-clockwise, -1 clockwise. Default -1 (clockwise).
        center: screen-space center offset [x, y]. Default [0, 0].

    Returns:
        Coord config dict for use in chart/layer options
    """
    return _polar_config(
        "polar",
        inner_radius=inner_radius,
        central_angle=central_angle,
        start_angle=start_angle,
        direction=direction,
        center=center,
    )


def wavy() -> dict:
    """
    Wavy coordinate transform — adds a sinusoidal ripple to both axes. Use as:
    ``layer([...], coord=Coord.wavy())``.

    The actual transform/domain is reconstructed on the JS side from this tag
    (the function body can't cross the IR bridge), mirroring ``Coord.clock()``.

    Returns:
        Coord config dict for use in chart/layer options
    """
    return {"type": "wavy"}
