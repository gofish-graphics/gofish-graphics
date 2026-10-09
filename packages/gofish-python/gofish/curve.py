"""
The ``Curve`` family: how a path runs through its points, the value of the
``curve`` option of ``line`` and ``ribbon``.

The package binds this module as ``Curve``, so ``Curve.monotone()`` and
``from gofish.curve import monotone`` reach the same function. Every member is
a function call, including the ones that take no options. A curve is a plain
dict on the wire, ``{"type": name}`` plus ``"options"`` for the curves that
take some. Mirrors JS ``gofish-graphics/curve``.

``linear``, ``step``, ``monotone`` and ``smooth`` are read over the parameter
of the run, from the least to the most smooth. ``catmull_rom`` is a shape on
screen. ``bezier``, ``orthogonal``, ``arc`` and ``perfect_arrows`` route each
pair of neighboring points.
"""

from typing import Any, Dict, Optional

__all__ = [
    "linear",
    "step",
    "monotone",
    "smooth",
    "catmull_rom",
    "bezier",
    "orthogonal",
    "arc",
    "perfect_arrows",
]


def _curve(type_: str, options: Dict[str, Any]) -> Dict[str, Any]:
    """The wire dict of a curve, with only the options that were given."""
    given = {k: v for k, v in options.items() if v is not None}
    return {"type": type_, "options": given} if given else {"type": type_}


def linear() -> Dict[str, Any]:
    """Straight segments from each point to the next. Mirrors JS
    ``Curve.linear()``."""
    return _curve("linear", {})


def step() -> Dict[str, Any]:
    """Hold every value that depends on the ordering field until the next
    point, then jump: a staircase when the ordering field is an axis. Mirrors
    JS ``Curve.step()``."""
    return _curve("step", {})


def monotone() -> Dict[str, Any]:
    """Piecewise monotone cubic: between two neighboring points each
    coordinate only rises or only falls (d3 ``curveMonotoneX``). Mirrors JS
    ``Curve.monotone()``."""
    return _curve("monotone", {})


def smooth() -> Dict[str, Any]:
    """A rounder cubic over the same parameter as ``monotone``; it can go a
    little past a point, but keeps a run of equal values flat. Mirrors JS
    ``Curve.smooth()``."""
    return _curve("smooth", {})


def catmull_rom() -> Dict[str, Any]:
    """A centripetal Catmull-Rom through the points on screen. Mirrors JS
    ``Curve.catmullRom()``."""
    return _curve("catmullRom", {})


def bezier() -> Dict[str, Any]:
    """Cubic bezier (the d3 ``linkVertical``/``linkHorizontal`` convention).
    Mirrors JS ``Curve.bezier()``."""
    return _curve("bezier", {})


def orthogonal(*, bend: Optional[str] = None) -> Dict[str, Any]:
    """Right-angle elbow bending at the main-axis midpoint (GoTree
    orthogonal). The bend axis is the connector's ``dir`` by default;
    ``bend="auto"`` infers it from the endpoint geometry instead. Mirrors JS
    ``Curve.orthogonal({ bend })``."""
    return _curve("orthogonal", {"bend": bend})


def arc(*, direction: Optional[str] = None) -> Dict[str, Any]:
    """Semicircular arc through both endpoints (GoTree arccurve);
    ``direction`` is ``"up"`` or ``"down"``. Mirrors JS
    ``Curve.arc({ direction })``."""
    return _curve("arc", {"direction": direction})


def perfect_arrows(
    *,
    bow: Optional[float] = None,
    stretch: Optional[float] = None,
    stretch_min: Optional[float] = None,
    stretch_max: Optional[float] = None,
    pad_start: Optional[float] = None,
    pad_end: Optional[float] = None,
    flip: Optional[bool] = None,
    straights: Optional[bool] = None,
) -> Dict[str, Any]:
    """Box-to-box arrow arc via the perfect-arrows library, with its options.
    Mirrors JS ``Curve.perfectArrows({ bow, stretch, ... })``."""
    return _curve(
        "perfectArrows",
        {
            "bow": bow,
            "stretch": stretch,
            "stretchMin": stretch_min,
            "stretchMax": stretch_max,
            "padStart": pad_start,
            "padEnd": pad_end,
            "flip": flip,
            "straights": straights,
        },
    )
