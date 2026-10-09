"""Non-finite numbers in the IR.

JSON has no ``Infinity``, ``-Infinity`` or ``NaN``. ``json.dumps`` writes them
as bare ``Infinity`` / ``NaN``, which JavaScript's ``JSON.parse`` rejects. So
the IR carries each non-finite float as a tagged object, the way MongoDB
Extended JSON does::

    math.inf   -> {"$numberDouble": "Infinity"}
    -math.inf  -> {"$numberDouble": "-Infinity"}
    math.nan   -> {"$numberDouble": "NaN"}

Mirrors gofish-ir's ``frontend/nonFinite.ts``: the writer encodes the whole
IR document once, at its top (``to_ir()``), and the JS reader decodes it
(``Serialize.readIR``) before rebuilding the chart. The validator accepts the
tagged infinities wherever a number is expected and rejects a tagged NaN
there.
"""

import math
from typing import Any, Callable

NON_FINITE_KEY = "$numberDouble"


def encode_number(x: float) -> Any:
    """The tagged form of a non-finite float; a finite one is unchanged."""
    if math.isfinite(x):
        return x
    if math.isnan(x):
        return {NON_FINITE_KEY: "NaN"}
    return {NON_FINITE_KEY: "Infinity" if x > 0 else "-Infinity"}


KEEP = object()
"""Returned by a `walk` swap to mean "not this one, look inside"."""


def walk(value: Any, swap: Callable[[Any], Any]) -> Any:
    """Rebuild `value` bottom-up, replacing each part `swap` answers for.

    `swap(v)` returns `KEEP` to leave `v` to the walk, which then looks inside
    a dict, list or tuple; anything else replaces `v` (return `v` itself to
    keep it as a leaf). Returns `value` itself when nothing in it changed and
    shares every unchanged part otherwise; a changed list or tuple keeps its
    type, and a changed dict is a plain dict.
    """
    swapped = swap(value)
    if swapped is not KEEP:
        return swapped
    if isinstance(value, dict):
        out = None
        for k, v in value.items():
            nv = walk(v, swap)
            if nv is not v:
                if out is None:
                    out = dict(value)
                out[k] = nv
        return value if out is None else out
    if isinstance(value, (list, tuple)):
        items = None
        for i, v in enumerate(value):
            nv = walk(v, swap)
            if nv is not v:
                if items is None:
                    items = list(value)
                items[i] = nv
        if items is None:
            return value
        return items if isinstance(value, list) else type(value)(items)
    return value


def encode_non_finite(value: Any) -> Any:
    """Encode every non-finite float in a JSON-shaped value (dicts, lists,
    tuples, primitives). Returns ``value`` itself when nothing in it changed,
    and shares every unchanged part otherwise."""
    return walk(
        value, lambda v: encode_number(v) if isinstance(v, float) else KEEP
    )
