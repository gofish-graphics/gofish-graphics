"""
The ``Domain`` family: what a unit's values are, a unit definition's
``domain``: ``Unit(domain=Domain.discrete(["low", "mid", "high"]))``.
A domain says only which values exist. Everything else about them (an
order, a midpoint, a sum) is a trait, listed in the unit's ``traits``.

The package binds this module as ``Domain``, so ``Domain.discrete(levels)``
and ``from gofish.domain import discrete`` reach the same function. A domain
never reaches the wire as itself: ``Unit`` turns it into the trait it
declares, ``HasLevels``. Mirrors JS ``gofish-graphics/domain``.

- ``discrete(levels)``: a finite set of levels. The levels are unordered
  (nominal) unless the unit lists ``Trait.ordered()``.

A domain that is an interval of numbers (``Domain.continuous``) comes later.
"""

import json
from typing import Any, Dict, List, Sequence

__all__ = ["discrete"]


def discrete(levels: Sequence[Any]) -> Dict[str, Any]:
    """A finite set of levels: the values a column in the unit takes, listed
    in the order to lay them out in, with at least one level and no level
    listed twice. JS ``Domain.discrete`` raises the same messages, with
    code spelled in Python."""
    if not isinstance(levels, (list, tuple)):
        raise TypeError(
            "Domain.discrete: levels must be a list, e.g. "
            f'Domain.discrete(["low", "mid", "high"]), got {levels!r}.'
        )
    if len(levels) == 0:
        raise ValueError(
            "Domain.discrete: levels must list at least one level, e.g. "
            'Domain.discrete(["low", "mid", "high"]).'
        )
    seen: List[Any] = []
    for level in levels:
        if level in seen:
            raise ValueError(
                "Domain.discrete: the level "
                f"{json.dumps(level, ensure_ascii=False)} is listed twice. "
                "Each level is listed once, in its place."
            )
        seen.append(level)
    return {"kind": "discrete", "levels": list(levels)}
