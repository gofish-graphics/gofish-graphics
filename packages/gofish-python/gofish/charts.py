"""Chart templates — Python mirror of the JS ``src/charts/`` helpers.

Each template is a thin composition over the public ``chart``/``spread``/mark
wrapper functions, so it lowers to exactly the same IR as hand-writing the
builder chain (and byte-identically to the JS helper's output).

Currently ports ``barChart`` (packages/gofish-graphics/src/charts/bar.ts).
"""

from typing import Any, Callable, List, Optional

from ._generated import rect
from .ast import ChartBuilder, Mark, chart, spread

__all__ = ["bar_chart"]


def bar_chart(
    data: List[dict],
    *,
    x: Optional[str] = None,
    y: Optional[str] = None,
    orientation: str = "y",
    fill: Optional[str] = None,
    axes: Any = None,
    mark: Optional[Callable[..., Mark]] = None,
) -> ChartBuilder:
    """Bar-chart template mirroring the JS ``barChart(data, options)`` helper.

    Desugars to a plain builder chain:

    - ``orientation="y"`` (vertical, the default): spread along x by the ``x``
      field, bar height from the ``y`` field::

          chart(data, axes=...).flow(spread(by=x, dir="x")).mark(rect(h=y, fill=fill))

    - ``orientation="x"`` (horizontal): spread along y by the ``y`` field, bar
      width from the ``x`` field::

          chart(data, axes=...).flow(spread(by=y, dir="y")).mark(rect(w=x, fill=fill))

    Args:
        data: Rows to chart (positional, per wrapper conventions).
        x: Field for the x encoding channel. Required.
        y: Field for the y encoding channel. Required.
        orientation: ``"y"`` for vertical bars (default) or ``"x"`` for
            horizontal bars.
        fill: Fill color (CSS string) or a field name for a color scale.
        axes: Chart-level axes option (``True``/``False``/per-dimension dict),
            passed through to ``chart(data, axes=...)``.
        mark: Mark factory to use instead of ``rect`` — called with the same
            kwargs (``h=``/``w=`` and ``fill=``), e.g. ``mark=circle``.

    Returns:
        A ``ChartBuilder``. NOTE: the JS helper wraps its builder in a
        ``BarChartBuilder`` adding a ``.stack(field, options)`` convenience;
        that wrapper is not ported (the parity harness serializes plain
        ``ChartBuilder``s) — call ``.flow(stack(by=field, dir=orientation))``
        on the returned builder directly instead.
    """
    # Both x and y are required (mirrors the JS error).
    if x is None or y is None:
        raise ValueError("bar chart requires both 'x' and 'y' encoding channels")

    mark_fn = mark if mark is not None else rect
    chart_options = {} if axes is None else {"axes": axes}

    # Vertical bar chart (orientation "y"): spread along x-axis using the x
    # field, height from the y field.
    if orientation == "y":
        return (
            chart(data, chart_options or None)
            .flow(spread(by=x, dir="x"))
            .mark(mark_fn(h=y, fill=fill))
        )

    # Horizontal bar chart (orientation "x"): spread along y-axis using the y
    # field, width from the x field.
    if orientation == "x":
        return (
            chart(data, chart_options or None)
            .flow(spread(by=y, dir="y"))
            .mark(mark_fn(w=x, fill=fill))
        )

    raise ValueError(
        f"bar chart orientation must be either 'x' or 'y', got '{orientation}'"
    )
