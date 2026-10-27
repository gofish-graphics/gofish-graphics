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

from typing import Any, Dict, Sequence

__all__ = ["discrete", "ordered"]


def _levels_domain(kind: str, levels: Sequence[Any]) -> Dict[str, Any]:
    if not isinstance(levels, (list, tuple)):
        raise TypeError(
            f"Domain.{kind}: levels must be a list, e.g. "
            f'Domain.{kind}(["low", "mid", "high"]), got {levels!r}.'
        )
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
