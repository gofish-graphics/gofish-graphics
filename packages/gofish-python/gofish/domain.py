"""
The ``Domain`` family: what a unit's values are, a unit definition's
``domain``: ``Unit(domain=Domain.ordered(["low", "mid", "high"]))``.

The package binds this module as ``Domain``, so ``Domain.ordered(levels)``
and ``from gofish.domain import ordered`` reach the same function. A domain
never reaches the wire as itself: ``Unit`` turns it into the column classes
it declares (``HasLevels``, and ``HasOrder`` for an ordered one). Mirrors JS
``gofish-graphics/domain``.

- ``discrete(levels)``: a finite set of levels with no order (nominal).
- ``ordered(levels)``: a finite set of levels ordered first to last
  (ordinal). It is what ``Trait.diverging()`` needs.

A domain that is an interval of numbers (``Domain.continuous``) comes later.
"""

import json
from typing import Any, Dict, List, Sequence

__all__ = ["discrete", "ordered"]


def _levels_domain(kind: str, levels: Sequence[Any]) -> Dict[str, Any]:
    """The domain of ``kind`` over ``levels``, checked to be a list of at
    least one level with no level listed twice: JS ``levelsDomain`` in
    families/domain.ts, with the same messages."""
    if not isinstance(levels, (list, tuple)):
        raise TypeError(
            f"Domain.{kind}: levels must be a list, e.g. "
            f'Domain.{kind}(["low", "mid", "high"]), got {levels!r}.'
        )
    if len(levels) == 0:
        raise ValueError(
            f"Domain.{kind}: levels must list at least one level, e.g. "
            f'Domain.{kind}(["low", "mid", "high"]).'
        )
    seen: List[Any] = []
    for level in levels:
        if level in seen:
            raise ValueError(
                f"Domain.{kind}: the level "
                f"{json.dumps(level, ensure_ascii=False)} is listed twice. "
                "Each level is listed once, in its place."
            )
        seen.append(level)
    return {"kind": kind, "levels": list(levels)}


def discrete(levels: Sequence[Any]) -> Dict[str, Any]:
    """Levels with no order (nominal): the values a column in the unit
    takes, listed in the order to lay them out in."""
    return _levels_domain("discrete", levels)


def ordered(levels: Sequence[Any]) -> Dict[str, Any]:
    """Levels ordered first to last (ordinal): the values a column in the
    unit takes, in their order. Every ``by`` split over the column is an
    ordered split, so an ordinal axis over it reads its groups as ordered."""
    return _levels_domain("ordered", levels)
