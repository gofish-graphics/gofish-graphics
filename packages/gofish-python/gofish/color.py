"""
The ``Color`` family: the color scales of a chart's ``color`` option.

The package binds this module as ``Color``, so ``Color.palette("tableau10")``
and ``from gofish.color import palette`` reach the same function. Each scale
is a plain dict on the wire, tagged by ``_tag``. Mirrors JS
``gofish-graphics/color``.
"""

from typing import Any, List, Union

__all__ = ["palette", "gradient"]


def palette(values: Any) -> dict:
    """
    Create a palette color configuration.

    Args:
        values: Palette name (e.g. "tableau10") or list of color strings

    Returns:
        Color config dict for use in chart options
    """
    return {"_tag": "palette", "values": values}


def gradient(stops: Union[str, List[str]]) -> dict:
    """
    Create a gradient color configuration.

    Args:
        stops: Color stop(s) - a single color string or list of color strings

    Returns:
        Color config dict for use in chart options
    """
    return {"_tag": "gradient", "stops": stops}
