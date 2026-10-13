"""Datum-path projection: field access over a ref's bag of rows.

A Python port of ``pluck`` from the JS package
(``packages/gofish-graphics/src/ast/datumProjection.ts``). A ref that a mark
function receives carries ``.datum``, the bag of rows that flowed into its
node (a list of dicts; a fully-split leaf is a 1-row list). ``pluck`` reads a
field across that bag and returns every distinct value it finds.

It is the uncollapsed counterpart of ``by="field"``. ``by`` resolves to one
value only when every row agrees on the field, and to nothing otherwise.
``pluck`` keeps all the values.

``pluck`` runs in Python, on data that has already crossed the bridge. It has
no IR form, just as JS ``pluck`` is a plain function the IR never sees.
"""

import json
import re
from typing import Any, List

from .ast import _InputRef

_SEGMENT = re.compile(r"[^.\[\]]+")


def _eq_key(value: Any) -> str:
    """A hashable key for value equality, so dicts and lists de-duplicate by
    content (JS uses ``JSON.stringify`` the same way)."""
    return json.dumps(value, default=str)


def pluck(source: Any, path: str) -> List[Any]:
    """Every distinct value at ``path``, in first-seen order.

    ``source`` may be a ref a mark function received (its ``.datum`` bag is
    read), a list of rows (refs or dicts), or a single row. ``path`` is a
    field name or a dotted path (``"a.b"``). A list met along the path is
    read element by element, and a row that lacks a field adds no value.

    Example::

        def label(d):
            species = pluck(d[0], "species")
            return spread([text(text=f"{len(species)} spp"), d[0]], dir="y")
    """
    segments = _SEGMENT.findall(path)
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
