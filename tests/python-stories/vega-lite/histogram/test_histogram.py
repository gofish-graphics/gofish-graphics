"""Equivalent of Histogram/Histogram.stories.tsx — Vega-Lite/Histogram/Histogram."""

import math

from gofish import chart, derive, scatter, rect
from vega_datasets import data as vega_data

# JS uses `bin("IMDB Rating")` which delegates to d3-array's d3.bin with
# the default `thresholds(10)` setting. Replicate that here in Python so
# the derive's output matches byte-for-byte with what JS would produce.

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


def _bin_field(data, field, count=10):
    """Port of gofish' `bin(field)` (d3-array's d3.bin().thresholds(count))."""
    values = [d[field] for d in data if d.get(field) is not None]
    if not values:
        return []
    vmin = min(values)
    vmax = max(values)
    x0, x1 = _nice(vmin, vmax, count)
    thresholds = _ticks(x0, x1, count)
    if len(thresholds) < 2:
        return []
    # d3.bin: bin[i] covers [thresholds[i], thresholds[i+1]); the last bin
    # also includes thresholds[-1] (the upper edge).
    n_bins = len(thresholds) - 1
    counts = [0] * n_bins
    last_edge = thresholds[-1]
    for v in values:
        if v == last_edge:
            counts[-1] += 1
            continue
        # Binary search would be more faithful, but linear scan suffices
        # for our small thresholds list.
        for i in range(n_bins):
            if thresholds[i] <= v < thresholds[i + 1]:
                counts[i] += 1
                break

    return [
        {
            "start": thresholds[i],
            "end": thresholds[i + 1],
            "size": thresholds[i + 1] - thresholds[i],
            "count": counts[i],
        }
        for i in range(n_bins)
    ]


def story_default():
    df = vega_data.movies().rename(columns={"IMDB_Rating": "IMDB Rating"})
    movies = df.to_dict("records")
    return (
        chart(movies)
        .flow(
            derive(lambda d: _bin_field(d, "IMDB Rating")),
            scatter(xMin="start", xMax="end"),
        )
        .mark(rect(h="count")),
        {"w": 500, "h": 300, "axes": True},
    )
