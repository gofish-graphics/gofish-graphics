"""Data transforms for use inside ``derive(...)``.

Currently exposes ``bin`` — a faithful Python port of the JS ``bin`` transform
(``packages/gofish-graphics/src/ast/transforms.ts``), which delegates to
d3-array's ``d3.bin().thresholds(10)``. The d3 algorithm (``tickStep`` /
``nice`` / ``ticks``) is reproduced exactly so the emitted bins are
byte-identical to what the JS side produces for the same field.
"""

import math
from typing import Any, Callable, List, Optional, Union

_SQRT50 = math.sqrt(50)
_SQRT10 = math.sqrt(10)
_SQRT2 = math.sqrt(2)


def _tick_step(start: float, stop: float, count: int) -> float:
    """Port of d3-array's tickStep — chooses a 'nice' step for `count` bins."""
    step0 = abs(stop - start) / max(0, count)
    if step0 == 0:
        return 0
    step1 = 10 ** math.floor(math.log10(step0))
    error = step0 / step1
    if error >= _SQRT50:
        step1 *= 10
    elif error >= _SQRT10:
        step1 *= 5
    elif error >= _SQRT2:
        step1 *= 2
    return -step1 if stop < start else step1


def _nice(start: float, stop: float, count: int) -> tuple:
    """Port of d3-array's nice — expand domain to align with tickStep."""
    prestep = None
    while True:
        step = _tick_step(start, stop, count)
        if step == prestep:
            return start, stop
        if step > 0:
            start = math.floor(start / step) * step
            stop = math.ceil(stop / step) * step
        elif step < 0:
            start = math.ceil(start * step) / step
            stop = math.floor(stop * step) / step
        else:
            return start, stop
        prestep = step


def _ticks(start: float, stop: float, count: int) -> list:
    """Port of d3-array's ticks — equally spaced thresholds within domain."""
    if start == stop and count > 0:
        return [start]
    reverse = stop < start
    if reverse:
        start, stop = stop, start
    step = _tick_step(start, stop, count)
    if step == 0 or math.isinf(step):
        return []
    out = []
    if step > 0:
        r0 = math.ceil(start / step)
        r1 = math.floor(stop / step)
        n = math.ceil(r1 - r0 + 1)
        out = [(r0 + i) * step for i in range(int(n))]
    else:
        step = -step
        r0 = math.ceil(start * step)
        r1 = math.floor(stop * step)
        n = math.ceil(r1 - r0 + 1)
        out = [(r0 + i) / step for i in range(int(n))]
    if reverse:
        out.reverse()
    return out


def _run_bin(
    data: List[dict],
    field: str,
    thresholds: Union[int, List[float], None] = None,
) -> List[dict]:
    """Bin ``data`` on ``field`` into ``{start, end, size, count}`` rows.

    Mirrors ``d3.bin().value(d => d[field]).thresholds(thresholds)`` with a
    default of 10 bins (``thresholds=None``). Pass an int for a target bin
    count, or an explicit list of threshold edges.
    """
    count = 10 if thresholds is None else thresholds
    values = [d[field] for d in data if d.get(field) is not None]
    if not values:
        return []

    if isinstance(count, list):
        edges = list(count)
    else:
        vmin = min(values)
        vmax = max(values)
        x0, x1 = _nice(vmin, vmax, count)
        edges = _ticks(x0, x1, count)
    if len(edges) < 2:
        return []

    # d3.bin: bin[i] covers [edges[i], edges[i+1]); the last bin also includes
    # edges[-1] (the upper edge).
    n_bins = len(edges) - 1
    counts = [0] * n_bins
    last_edge = edges[-1]
    for v in values:
        if v == last_edge:
            counts[-1] += 1
            continue
        for i in range(n_bins):
            if edges[i] <= v < edges[i + 1]:
                counts[i] += 1
                break

    return [
        {
            "start": edges[i],
            "end": edges[i + 1],
            "size": edges[i + 1] - edges[i],
            "count": counts[i],
        }
        for i in range(n_bins)
    ]


def bin(
    data_or_field: Union[List[dict], str],
    field: Optional[str] = None,
    *,
    thresholds: Union[int, List[float], None] = None,
) -> Union[List[dict], Callable[[List[dict]], List[dict]]]:
    """Bin numeric data into histogram buckets.

    Mirrors the JS ``bin`` transform: it delegates to d3-array's
    ``d3.bin().thresholds(10)`` by default, producing one row per bucket with
    ``{start, end, size, count}``.

    Two calling conventions, like the JS overloads:

    - **Curried** (for ``derive``): ``bin("field")`` returns a function
      ``data -> rows`` so you can write ``.flow(derive(bin("field")))``.
    - **Direct**: ``bin(data, "field")`` returns the rows immediately.

    Args:
        data_or_field: Either the field name (curried form) or the data list
            (direct form).
        field: The field name (direct form only).
        thresholds: Target bin count (default 10) or an explicit list of edges.

    Returns:
        A list of ``{start, end, size, count}`` dicts (direct form), or a
        ``data -> rows`` callable (curried form).
    """
    if isinstance(data_or_field, str):
        field_name = data_or_field

        def binner(data: List[dict]) -> List[dict]:
            return _run_bin(data, field_name, thresholds)

        # The bin edges (`start`/`end`/`size`) are still in the SOURCE field's
        # units, not the literal column names "start"/"end"; `count` is a count.
        # Mirror the JS bin's measure provenance. It can't ride the data rows
        # across the derive RPC bridge, so it travels in the derive operator's
        # IR and is re-applied JS-side via setMeasureProvenance (see
        # DeriveOperator.to_dict and serialize/registry.ts).
        binner._gofish_measure_provenance = {
            "start": field_name,
            "end": field_name,
            "size": field_name,
            "count": "count",
        }
        return binner
    if field is None:
        raise TypeError("bin(data, field): `field` is required in direct form")
    return _run_bin(data_or_field, field, thresholds=thresholds)
