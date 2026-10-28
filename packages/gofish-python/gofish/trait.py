"""
The ``Trait`` family: the capabilities a unit's values have, listed in a
unit definition's ``traits``: ``Unit("USD", traits=[Trait.summable()])``.

The package binds this module as ``Trait``, so ``Trait.summable()`` and
``from gofish.trait import summable`` reach the same function. A unit takes a
set of traits, not one choice from them, and a trait never reaches the wire:
``Unit`` turns each into the column class it declares. Mirrors JS
``gofish-graphics/trait``.

- ``diverging(midpoint=None)``: the order has a midpoint (``HasMidpoint``),
  in edge coordinates over the levels, ``n / 2`` for ``n`` levels by
  default. It needs an ordered domain, ``Domain.ordered(levels)``.
- ``summable()``: the unit's amounts add up (``CanAdd``). It needs a name.
"""

from typing import Any, Dict, Optional

__all__ = ["diverging", "summable"]


def diverging(midpoint: Optional[float] = None) -> Dict[str, Any]:
    """The order of the unit's levels has a midpoint, ``midpoint`` in edge
    coordinates over the levels: 0 is the first level's leading edge, ``n``
    the last level's trailing edge, and level ``i`` spans ``[i, i + 1]``.
    The default, ``n / 2``, is the middle of the middle level when ``n`` is
    odd, the boundary between the two middle levels when it is even. A stack
    over a column in the unit puts its 0 there. It needs an ordered domain,
    ``Domain.ordered(levels)``."""
    if midpoint is None:
        return {"kind": "diverging"}
    return {"kind": "diverging", "midpoint": midpoint}


def summable() -> Dict[str, Any]:
    """The unit's amounts add up (``CanAdd``): a sum of them means something
    (money, counts, lengths), so a ``size`` channel, ``stack``, treemap
    ``size`` and ``.sum()`` may sum a column in the unit. Amounts that do not
    add up (temperatures, prices, rates) are in a unit without it."""
    return {"kind": "summable"}
