"""
The ``Overlap`` family: the strategies of ``scatter``'s ``overlap`` option.

The package binds this module as ``Overlap``, so ``Overlap.separate(padding=1)``
and ``from gofish.overlap import separate`` reach the same function. Each
strategy is a plain dict on the wire, tagged by ``kind``. Mirrors JS
``gofish-graphics/overlap``.
"""

import math
from typing import Any, Dict, Optional, Union

__all__ = ["separate", "noise", "sina", "jitter"]


def separate(*, padding: Optional[float] = None) -> Dict[str, Any]:
    """
    The ``separate()`` overlap strategy for ``scatter``: it keeps dots
    apart, so no two overlap, and the result is a beeswarm. Each dot keeps its
    position on the data axis and moves along the axis no field places, to the
    free spot nearest the ``alignment`` line (Observable Plot's ``dodge``).

        chart(penguins).flow(
            scatter(x="Body Mass (g)", alignment="middle", overlap=Overlap.separate(padding=1))
        ).mark(circle(r=3))

    Mirrors JS ``Overlap.separate({ padding })``; the strategy is a plain object on the
    wire, ``{"kind": "separate", "padding": ...}``.

    Args:
        padding: Pixels kept between neighboring dots. Default 0.
    """
    if padding is not None and not (padding >= 0 and math.isfinite(padding)):
        raise ValueError(f"separate: padding must be a finite non-negative number, got {padding}")
    return {"kind": "separate"} if padding is None else {"kind": "separate", "padding": padding}


def _is_real(v: Any) -> bool:
    """A real number: an int or float, not a bool."""
    return isinstance(v, (int, float)) and not isinstance(v, bool)


def _make_noise(
    name: str,
    randomness: Optional[str],
    smoothing: Optional[Union[float, str]],
    padding: Optional[float],
    seed: Optional[float],
) -> Dict[str, Any]:
    """Check the options and build the ``{"kind": "noise", ...}`` object;
    ``name`` is the function the user called, for the error messages."""
    if randomness is not None and randomness not in ("blue", "quasi", "uniform"):
        raise ValueError(
            f'{name}: randomness must be "blue", "quasi" or "uniform", got {randomness!r}'
        )
    if smoothing is not None and smoothing != "silverman" and not (
        _is_real(smoothing) and smoothing >= 0
    ):
        raise ValueError(
            f'{name}: smoothing must be a non-negative number of data units, math.inf, '
            f'or "silverman", got {smoothing!r}'
        )
    if padding is not None and not (padding >= 0 and math.isfinite(padding)):
        raise ValueError(f"{name}: padding must be a finite non-negative number, got {padding}")
    if seed is not None and not (_is_real(seed) and math.isfinite(seed)):
        raise ValueError(f"{name}: seed must be a number, got {seed}")
    out: Dict[str, Any] = {"kind": "noise"}
    for key, value in (
        ("randomness", randomness),
        ("smoothing", smoothing),
        ("padding", padding),
        ("seed", seed),
    ):
        if value is not None:
            out[key] = value
    return out


def noise(
    *,
    randomness: Optional[str] = None,
    smoothing: Optional[Union[float, str]] = None,
    padding: Optional[float] = None,
    seed: Optional[float] = None,
) -> Dict[str, Any]:
    """
    The ``noise()`` overlap strategy for ``scatter``. Each dot keeps its
    position on the data axis and gets an offset on the axis no field places,
    inside an outline that follows how many dots share that part of the data
    axis. Each dot adds a small bell-shaped bump, and the outline is the sum
    of the bumps. :func:`sina` and :func:`jitter` are this strategy with other
    defaults.

        chart(penguins).flow(
            scatter(x="Body Mass (g)", alignment="middle",
                    overlap=Overlap.noise(randomness="quasi", smoothing=100))
        ).mark(circle(r=3))

    Mirrors JS ``Overlap.noise({ randomness, smoothing, padding, seed })``; the
    strategy is a plain object on the wire, ``{"kind": "noise", ...}``.

    Args:
        randomness: ``"blue"`` (default) keeps each dot far from its
            neighbors, ``"quasi"`` spreads dots by rank (fastest),
            ``"uniform"`` draws seeded uniform offsets.
        smoothing: The bandwidth of each dot's bell, in data units of the
            data axis. Default 0: no smoothing beyond the dots' own size.
            ``math.inf`` gives a flat outline (classic fixed-band jitter).
            ``"silverman"`` computes it from the data, as :func:`sina` does.
        padding: Pixels added to each dot's width. Default 0.
        seed: Seed for ``"blue"`` and ``"uniform"``. Default 0.
    """
    return _make_noise("noise", randomness, smoothing, padding, seed)


def sina(
    *,
    randomness: Optional[str] = None,
    smoothing: Optional[Union[float, str]] = None,
    padding: Optional[float] = None,
    seed: Optional[float] = None,
) -> Dict[str, Any]:
    """
    A sina plot: :func:`noise` with ``smoothing="silverman"``, a bandwidth
    computed per group from the data by Silverman's rule of thumb, as
    ggforce's ``geom_sina`` does. The outline is the smooth curve a violin
    plot draws, filled with dots. Any option overrides the default.

        chart(penguins).flow(
            spread(by="Species", dir="y"),
            scatter(x="Body Mass (g)", alignment="middle", overlap=Overlap.sina()),
        ).mark(circle(r=3))

    Mirrors JS ``Overlap.sina({ ... })``; on the wire it is
    ``{"kind": "noise", "smoothing": "silverman", ...}``.

    Args: as :func:`noise`.
    """
    return _make_noise(
        "sina",
        randomness,
        "silverman" if smoothing is None else smoothing,
        padding,
        seed,
    )


def jitter(
    *,
    randomness: Optional[str] = None,
    smoothing: Optional[Union[float, str]] = None,
    padding: Optional[float] = None,
    seed: Optional[float] = None,
) -> Dict[str, Any]:
    """
    Classic jitter: :func:`noise` with ``randomness="uniform"`` and
    ``smoothing=math.inf``, so the dots get uniform random offsets in a flat
    band. Any option overrides the default.

        chart(penguins).flow(
            scatter(x="Body Mass (g)", alignment="middle", overlap=Overlap.jitter())
        ).mark(circle(r=3))

    Mirrors JS ``Overlap.jitter({ ... })``; on the wire it is
    ``{"kind": "noise", "randomness": "uniform", "smoothing": Infinity, ...}``.

    Args: as :func:`noise`.
    """
    return _make_noise(
        "jitter",
        "uniform" if randomness is None else randomness,
        math.inf if smoothing is None else smoothing,
        padding,
        seed,
    )
