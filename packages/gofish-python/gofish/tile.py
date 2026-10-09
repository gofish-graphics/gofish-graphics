"""
The ``Tile`` family: the tiling strategies of ``treemap``'s ``tile`` option.

The package binds this module as ``Tile``, so ``Tile.squarify(ratio=1)`` and
``from gofish.tile import squarify`` reach the same function. Each strategy
is a plain dict on the wire, tagged by ``kind``; each is one of d3-hierarchy's
tiling methods. Mirrors JS ``gofish-graphics/tile``. (``Tile.slice`` is
reached through the namespace, so it does not hide Python's built-in
``slice``.)
"""

from typing import Any, Dict, Optional, Union

__all__ = ["squarify", "slice", "dice", "binary", "slice_dice"]


def squarify(*, ratio: Optional[Union[int, float]] = None) -> Dict[str, Any]:
    """
    The ``squarify()`` tiling strategy for ``treemap`` (the default):
    make tiles as close as possible to the aspect ``ratio``: the longer side
    over the shorter side, so at least 1, with no orientation chosen. Omitted, ``ratio`` is d3's default, the golden ratio.
    ``Tile.squarify(ratio=1)`` aims for square tiles, which suits one circle per
    leaf.

    Mirrors JS ``Tile.squarify({ ratio })``; on the wire it is the plain object
    ``{"kind": "squarify", "ratio": ...}``.
    """
    if ratio is None:
        return {"kind": "squarify"}
    return {"kind": "squarify", "ratio": ratio}


def slice() -> Dict[str, Any]:
    """
    The ``slice()`` tiling strategy for ``treemap``: lay the tiles out in
    one column, stacked along y. Mirrors JS ``Tile.slice()``; on the wire it is
    ``{"kind": "slice"}``.
    """
    return {"kind": "slice"}


def dice() -> Dict[str, Any]:
    """
    The ``dice()`` tiling strategy for ``treemap``: lay the tiles out in
    one row, side by side along x. Mirrors JS ``Tile.dice()``; on the wire it is
    ``{"kind": "dice"}``.
    """
    return {"kind": "dice"}


def binary() -> Dict[str, Any]:
    """
    The ``binary()`` tiling strategy for ``treemap``: split the tiles into
    two halves of near-equal weight, recursively. Mirrors JS ``Tile.binary()``; on
    the wire it is ``{"kind": "binary"}``.
    """
    return {"kind": "binary"}


def slice_dice() -> Dict[str, Any]:
    """
    The ``slice_dice()`` tiling strategy for ``treemap``: alternate slice
    and dice by depth. Mirrors JS ``Tile.sliceDice()``; on the wire it is
    ``{"kind": "sliceDice"}``.
    """
    return {"kind": "sliceDice"}
