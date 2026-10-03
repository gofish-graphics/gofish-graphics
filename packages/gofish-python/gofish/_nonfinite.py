"""Non-finite numbers in the IR.

JSON has no ``Infinity``, ``-Infinity`` or ``NaN``. ``json.dumps`` writes them
as bare ``Infinity`` / ``NaN``, which JavaScript's ``JSON.parse`` rejects. So
the IR carries each non-finite float as a tagged object, the way MongoDB
Extended JSON does::

    math.inf   -> {"$numberDouble": "Infinity"}
    -math.inf  -> {"$numberDouble": "-Infinity"}
    math.nan   -> {"$numberDouble": "NaN"}

Mirrors gofish-ir's ``frontend/nonFinite.ts``: the writer encodes the whole
IR document as it makes it (``to_ir()``), and the JS reader decodes it before
rebuilding the chart. The validator accepts the tagged infinities wherever a
number is expected and rejects a tagged NaN there.
"""

import math
from typing import Any

NON_FINITE_KEY = "$numberDouble"


def encode_number(x: float) -> Any:
    """The tagged form of a non-finite float; any other value is unchanged."""
    if isinstance(x, float) and not math.isfinite(x):
        if math.isnan(x):
            spelling = "NaN"
        else:
            spelling = "Infinity" if x > 0 else "-Infinity"
        return {NON_FINITE_KEY: spelling}
    return x


def encode_non_finite(value: Any) -> Any:
    """Encode every non-finite float in a JSON-shaped value (dicts, lists,
    tuples, primitives). Other values are returned as they are."""
    if isinstance(value, float):
        return encode_number(value)
    if isinstance(value, dict):
        return {k: encode_non_finite(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [encode_non_finite(v) for v in value]
    return value
