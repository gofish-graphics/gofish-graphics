"""Datum-path projection: field access over a ref's bag of rows.

A Python port of ``pluck`` and ``project`` from the JS package
(``packages/gofish-graphics/src/ast/datumProjection.ts``). A ref that a mark
function receives carries ``.datum``, the bag of rows that flowed into its
node (a list of dicts; a fully-split leaf is a 1-row list). ``pluck`` reads a
field across that bag and returns every distinct value it finds.

It is the uncollapsed counterpart of ``by="field"``. ``by`` resolves to one
value only when every row agrees on the field, and to nothing otherwise.
``pluck`` keeps all the values.

Both read a value as JS reads it: a path parses as lodash ``toPath`` parses
it, a missing or ``None`` value is no value, and two values are the same when
JS's key for them is (``eqKey``: ``JSON.stringify`` for a dict or a list, and
``String(v)`` for anything else, so ``1``, ``1.0`` and ``"1"`` are one value).

``pluck`` runs in Python, on data that has already crossed the bridge. It has
no IR form, just as JS ``pluck`` is a plain function the IR never sees.
"""

import decimal
import json
import math
import re
from typing import Any, List

from .ast import _InputRef

# lodash's `rePropName` and `reEscapeChar` (`stringToPath`): a bare name, a
# bracketed number, a bracketed quoted name, or an empty segment.
_PROP_NAME = re.compile(
    r"""[^.[\]]+|\[(?:(-?\d+(?:\.\d+)?)|(["'])((?:(?!\2)[^\\]|\\.)*?)\2)\]"""
    r"""|(?=(?:\.|\[\])(?:\.|\[\]|$))"""
)
_ESCAPE_CHAR = re.compile(r"\\(\\)?")


def _to_path(path: str) -> List[str]:
    """``path``'s segments, as lodash ``toPath`` splits it (``"a.b"``,
    ``"a[0]"``, ``'a["b.c"]'``)."""
    segments = [""] if path.startswith(".") else []
    for m in _PROP_NAME.finditer(path):
        number, quote, sub = m.group(1), m.group(2), m.group(3)
        if quote:
            segments.append(_ESCAPE_CHAR.sub(lambda e: e.group(1) or "", sub))
        else:
            segments.append(number or m.group(0))
    return segments


def _js_number(x: float) -> str:
    """``String(x)`` in JS: the shortest digits that read back as ``x``, in
    JS's notation (Number::toString)."""
    if math.isnan(x):
        return "NaN"
    if math.isinf(x):
        return "Infinity" if x > 0 else "-Infinity"
    if x == 0:
        return "0"
    if x < 0:
        return "-" + _js_number(-x)
    sign, digits, exp = decimal.Decimal(repr(float(x))).normalize().as_tuple()
    s = "".join(map(str, digits))
    k = len(s)
    n = exp + k
    if k <= n <= 21:
        return s + "0" * (n - k)
    if 0 < n <= 21:
        return s[:n] + "." + s[n:]
    if -6 < n <= 0:
        return "0." + "0" * (-n) + s
    e = n - 1
    mantissa = s if k == 1 else s[0] + "." + s[1:]
    return f"{mantissa}e{'+' if e >= 0 else '-'}{abs(e)}"


def _js_json(value: Any) -> Any:
    """``value`` with every number as ``JSON.stringify`` writes it: a whole
    float as an int, a non-finite one as null."""
    if isinstance(value, dict):
        return {k: _js_json(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [_js_json(v) for v in value]
    if isinstance(value, float):
        if not math.isfinite(value):
            return None
        if value.is_integer():
            return int(value)
    return value


def _eq_key(value: Any) -> str:
    """JS's ``eqKey``: ``JSON.stringify`` for a dict or a list, ``String(v)``
    for anything else."""
    if isinstance(value, (dict, list, tuple)):
        return json.dumps(
            _js_json(value), separators=(",", ":"), ensure_ascii=False, default=str
        )
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, float):
        return _js_number(value)
    return str(value)


def _values(source: Any, path: str) -> List[Any]:
    """The distinct values at ``path`` from ``source``, in first-seen order
    (JS ``projectValues``): a list is read element by element and a ref
    through its ``.datum`` wherever either sits on the path, and a missing or
    ``None`` value adds no value."""
    segments = _to_path(path)
    out: List[Any] = []
    seen = set()

    def walk(current: Any, i: int) -> None:
        if current is None:
            return
        if isinstance(current, _InputRef):
            # A ref stands for its bag of rows: read its datum at the same
            # segment.
            walk(current.datum, i)
            return
        if isinstance(current, (list, tuple)):
            for el in current:
                walk(el, i)
            return
        if i == len(segments):
            key = _eq_key(current)
            if key not in seen:
                seen.add(key)
                out.append(current)
            return
        if isinstance(current, dict):
            walk(current.get(segments[i]), i + 1)

    walk(source, 0)
    return out


def pluck(source: Any, path: str) -> List[Any]:
    """Every distinct value at ``path``, in first-seen order.

    ``source`` may be a ref a mark function received (its ``.datum`` bag is
    read), a list of rows (refs or dicts), or a single row. As in JS, a
    ``source`` that has a ``datum`` (a ref, or a row with a ``"datum"`` key)
    is read through it. ``path`` is a field name or a path (``"a.b"``,
    ``"a[0]"``). A list met along the path is read element by element, and a
    row that lacks a field adds no value.

    Example::

        def label(d):
            species = pluck(d[0], "species")
            return spread([text(text=f"{len(species)} spp"), d[0]], dir="y")
    """
    if isinstance(source, _InputRef):
        source = source.datum
    elif isinstance(source, dict) and "datum" in source:
        source = source["datum"]
    return _values(source, path)


def project(source: Any, path: str) -> Any:
    """The single value at ``path``: the distinct values collapsed, as
    ``by="field"`` collapses them. It is ``None`` when no row has the field
    or the rows disagree. Use it to read a field off the bag a node was built
    from, ``project(d, "site")``. Unlike :func:`pluck`, it reads a row's own
    ``"datum"`` key as a field, as JS ``project`` does.
    """
    values = _values(source, path)
    return values[0] if len(values) == 1 else None
