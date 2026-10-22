"""Read a table of keyframes at one moment, in data space. Mirrors JS
``interpolate`` (``src/interpolate.ts``, with the curves of ``src/spline.ts``).

The arithmetic is the JS module's, operation for operation, so a Python
``derive`` that interpolates a run gives the rows a JS one gives, to the bit.
"""

from __future__ import annotations

import math
from typing import Any, Dict, List, Optional, Sequence

__all__ = ["interpolate"]

_METHODS = ("step", "linear", "monotone", "smooth")


def _method(curve: Optional[Dict[str, Any]]) -> str:
    """The reading a `method` names; unset is monotone, as in JS."""
    if curve is None:
        return "monotone"
    kind = curve.get("kind") if isinstance(curve, dict) else None
    if kind not in _METHODS:
        raise ValueError(
            f"interpolate(method=...): {curve!r} is not a way to read a run "
            f"between its keyframes. Use Curve.step(), Curve.linear(), "
            f"Curve.monotone() or Curve.smooth()."
        )
    return kind


def _locate(knots: List[float], t: float):
    """The segment `t` falls in and the local fraction in it (`locate`)."""
    n = len(knots)
    if t <= knots[0]:
        return 0, 0
    if t >= knots[n - 1]:
        return n - 2, 1
    i = 0
    while i < n - 2 and knots[i + 1] <= t:
        i += 1
    span = knots[i + 1] - knots[i]
    return i, 1 if span == 0 else (t - knots[i]) / span


def _sign(x: float) -> int:
    return -1 if x < 0 else 1


def _monotone_slopes(t: List[float], v: List[float]) -> List[float]:
    """Steffen's slopes, d3's `curveMonotoneX` (`monotoneSlopes`)."""
    n = len(t)
    if n == 2:
        s = (v[1] - v[0]) / (t[1] - t[0])
        return [s, s]
    m = [0.0] * n
    for i in range(1, n - 1):
        h0 = t[i] - t[i - 1]
        h1 = t[i + 1] - t[i]
        s0 = (v[i] - v[i - 1]) / h0
        s1 = (v[i + 1] - v[i]) / h1
        p = (s0 * h1 + s1 * h0) / (h0 + h1)
        mi = (_sign(s0) + _sign(s1)) * min(abs(s0), abs(s1), 0.5 * abs(p))
        # JS `x || 0`: NaN and -0 are 0.
        m[i] = 0 if (mi != mi or mi == 0) else mi

    def slope2(i: int, tangent: float) -> float:
        return ((3 * (v[i + 1] - v[i])) / (t[i + 1] - t[i]) - tangent) / 2

    m[0] = slope2(0, m[1])
    m[n - 1] = slope2(n - 2, m[n - 2])
    return m


def _smooth_slopes(t: List[float], v: List[float]) -> List[float]:
    """The modified Akima slopes (`smoothSlopes`)."""
    n = len(t)
    s = [0.0] * (n + 3)
    for i in range(n - 1):
        s[i + 2] = (v[i + 1] - v[i]) / (t[i + 1] - t[i])
    if n == 2:
        return [s[2], s[2]]
    s[1] = 2 * s[2] - s[3]
    s[0] = 2 * s[1] - s[2]
    s[n + 1] = 2 * s[n] - s[n - 1]
    s[n + 2] = 2 * s[n + 1] - s[n]
    w1 = [0.0] * n
    w2 = [0.0] * n
    largest = 0.0
    for i in range(n):
        w1[i] = abs(s[i + 3] - s[i + 2]) + abs(s[i + 3] + s[i + 2]) / 2
        w2[i] = abs(s[i + 1] - s[i]) + abs(s[i + 1] + s[i]) / 2
        largest = max(largest, w1[i] + w2[i])
    out = []
    for i in range(n):
        total = w1[i] + w2[i]
        out.append(
            (w1[i] * s[i + 1] + w2[i] * s[i + 2]) / total
            if total > 1e-9 * largest
            else (s[i] + s[i + 3]) / 2
        )
    return out


def _read(knots: List[float], values: List[float], method: str, i: int, u: float) -> float:
    """One channel of the run at segment `i`, fraction `u` (`channelReader`)."""
    if len(knots) < 2:
        return math.nan if len(knots) == 0 else values[0]
    if method == "step":
        return values[i + 1] if u >= 1 else values[i]
    if method == "linear":
        a, b = values[i], values[i + 1]
        return a + u * (b - a)
    slopes = (_monotone_slopes if method == "monotone" else _smooth_slopes)(knots, values)
    h = knots[i + 1] - knots[i]
    b0 = values[i]
    b1 = values[i] + (h / 3) * slopes[i]
    b2 = values[i + 1] - (h / 3) * slopes[i + 1]
    b3 = values[i + 1]
    w = 1 - u
    return w * w * w * b0 + 3 * w * w * u * b1 + 3 * w * u * u * b2 + u * u * u * b3


def _source_index(knots: List[float], t: float, method: str) -> int:
    """The keyframe a non-blended field is copied from (`sourceIndex`)."""
    best = 0
    if method == "step":
        for i, k in enumerate(knots):
            if k <= t:
                best = i
        return best
    for i, k in enumerate(knots):
        if abs(k - t) < abs(knots[best] - t):
            best = i
    return best


def _is_number(v: Any) -> bool:
    return isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v)


def interpolate(
    rows: Sequence[Dict[str, Any]],
    *,
    along: str,
    key: str,
    at: float,
    method: Optional[Dict[str, Any]] = None,
    fields: Optional[List[str]] = None,
) -> List[Dict[str, Any]]:
    """One row per ``key``, with its numeric fields read at ``at`` along
    ``along`` and ``along`` set to ``at``. Non-numeric fields are copied from
    the keyframe nearest ``at`` (the previous one under ``Curve.step()``).

    Args:
        rows: The keyframes.
        along: The field the rows are keyed by in time, the playhead's units.
        key: The field that says which rows are the same thing over time.
        at: Where to read the run, in ``along``'s units.
        method: ``Curve.step()``, ``Curve.linear()``, ``Curve.monotone()``
            (the default) or ``Curve.smooth()``.
        fields: Which fields to interpolate. By default every field that is a
            finite number at every keyframe, apart from ``along`` and ``key``.
    """
    how = _method(method)
    runs: Dict[Any, List[Dict[str, Any]]] = {}
    for row in rows:
        runs.setdefault(row[key], []).append(row)
    out = []
    for k, run in runs.items():
        ordered = sorted(run, key=lambda r: float(r[along]))
        knots = [float(r[along]) for r in ordered]
        if any(not math.isfinite(v) for v in knots):
            raise ValueError(
                f'interpolate(): "{along}" needs a number in every row; {k!r} has a row without one.'
            )
        if len(set(knots)) != len(knots):
            raise ValueError(
                f"interpolate(): the run for {k!r} has two rows at one {along}; "
                f"aggregate to one row per {along} first."
            )
        names: List[str] = []
        for r in ordered:
            for f in r:
                if f not in names:
                    names.append(f)
        blended = (
            set(fields)
            if fields is not None
            else {
                f
                for f in names
                if f != along and f != key and all(_is_number(r.get(f)) for r in ordered)
            }
        )
        source = _source_index(knots, at, how)
        i, u = (0, 0) if len(knots) < 2 else _locate(knots, at)
        out_row = dict(ordered[source])
        for f in names:
            if f in blended:
                out_row[f] = _read(knots, [float(r[f]) for r in ordered], how, i, u)
        out_row[along] = at
        out_row[key] = k
        out.append(out_row)
    return out
