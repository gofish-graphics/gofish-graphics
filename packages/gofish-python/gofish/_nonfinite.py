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
from typing import Any

NON_FINITE_KEY = "$numberDouble"


def encode_number(x: float) -> Any:
    """The tagged form of a non-finite float; a finite one is unchanged."""
    if math.isfinite(x):
        return x
    if math.isnan(x):
        return {NON_FINITE_KEY: "NaN"}
    return {NON_FINITE_KEY: "Infinity" if x > 0 else "-Infinity"}


def encode_non_finite(value: Any) -> Any:
    """Encode every non-finite float in a JSON-shaped value (dicts, lists,
    tuples, primitives). Returns ``value`` itself when nothing in it changed,
    and shares every unchanged part otherwise."""
    if isinstance(value, float):
        return encode_number(value)
    if isinstance(value, dict):
        out = None
        for k, v in value.items():
            nv = encode_non_finite(v)
            if nv is not v:
                if out is None:
                    out = dict(value)
                out[k] = nv
        return value if out is None else out
    if isinstance(value, (list, tuple)):
        out_list = None
        for i, v in enumerate(value):
            nv = encode_non_finite(v)
            if nv is not v:
                if out_list is None:
                    out_list = list(value)
                out_list[i] = nv
        return value if out_list is None else out_list
    return value
