"""
The ``Dist`` family: distributions. The package binds this module as
``Dist``, so ``Dist.normal(mean=0, sd=1)`` and
``from gofish.dist import normal`` reach the same function. Mirrors JS
``gofish-graphics/dist``.

A family is an expression a spec holds: each parameter is a number, a
column whose value is one number in each group, or a value expression
(``field("t").mean()``). Its members are channels: ``d.density()``,
``d.cdf()`` and ``d.domain()`` are functions of t for ``ribbon`` and
``line``, and ``d.median()``, ``d.mean()``, ``d.mass()`` and
``d.quantile(p)`` are values for any channel. It goes on the wire as data,
``{"type": "dist", "family", "params", "ops"}``, and JS computes it.

- ``normal(mean, sd)``: drawn between its 0.001 and 0.999 quantiles.
- ``lognormal(meanlog, sdlog)``: ``exp`` of a normal, drawn from 0 to its
  0.999 quantile.
- ``uniform(min, max)``.
- ``exponential(rate)``: drawn from 0 to its 0.999 quantile.

``d.bin(Bin.quantiles(n))`` is a key for ``partition``: the cells of the
distribution at its own quantiles, each group the distribution restricted
to its cell.

A distribution of a sample is not a family: ``derive(kde("x"))`` smooths a
group's values into a distribution the column holds, and ``field("x")``'s
members read it (``kde`` in ``ast.py``).
"""

import copy
from typing import Any, Dict, List, Optional, Union

__all__ = ["normal", "lognormal", "uniform", "exponential"]


def _check_param(family: str, key: str, value: Any) -> Any:
    if isinstance(value, bool) or not (
        isinstance(value, (int, float, str))
        or (isinstance(value, dict) and value.get("type") == "field")
    ):
        raise TypeError(
            f"Dist.{family}: {key} must be a number, a column name or a value "
            f"expression (field('x').mean()), got {value!r}."
        )
    return copy.deepcopy(value) if isinstance(value, dict) else value


class DistAccessor(dict):
    """A distribution as a spec holds it, the wire shape
    ``{"type": "dist", "family", "params", "ops"?}``. Each member method
    returns a new accessor with one more ``member`` op. Mirrors JS
    ``DistExpr`` (``ast/distExpr.ts``)."""

    def _member(self, name: str, args: Optional[List[Any]] = None) -> "DistAccessor":
        out = DistAccessor(copy.deepcopy(dict(self)))
        op: Dict[str, Any] = {"op": "member", "name": name}
        if args:
            op["args"] = list(args)
        out["ops"] = list(self.get("ops", [])) + [op]
        return out

    def density(self) -> "DistAccessor":
        """The probability density over the interval it is drawn over. Valid
        only in a channel of ``ribbon`` or ``line``."""
        return self._member("density")

    def cdf(self) -> "DistAccessor":
        """The probability at or below t, over the same interval as
        :meth:`density`. A ratio."""
        return self._member("cdf")

    def domain(self) -> "DistAccessor":
        """``t`` over the interval :meth:`density` is drawn over: the
        position channel that reads it at the mark's parameter."""
        return self._member("domain")

    def quantile(self, p: float) -> "DistAccessor":
        """The value with probability ``p`` at or below it."""
        if isinstance(p, bool) or not isinstance(p, (int, float)) or not 0 <= p <= 1:
            raise ValueError(
                f"Dist.{self['family']}(...).quantile(p): p must be a number "
                f"in [0, 1], got {p!r}."
            )
        return self._member("quantile", [p])

    def median(self) -> "DistAccessor":
        """The median, ``quantile(0.5)``."""
        return self._member("median")

    def mean(self) -> "DistAccessor":
        """The mean."""
        return self._member("mean")

    def mass(self) -> "DistAccessor":
        """The probability in the distribution: 1, or, in a cell of
        :meth:`bin`, the cell's share of it."""
        return self._member("mass")

    def bin(self, cells: Dict[str, Any]) -> "DistAccessor":
        """A grouping key with regions: the cells of ``cells`` (``Bin.step``,
        ``Bin.thresholds`` or ``Bin.quantiles``) over the interval the
        density is drawn over, ``Bin.quantiles(n)`` at the distribution's
        own quantiles. Each group is the distribution restricted to its
        cell. Valid only as ``partition``'s ``by``."""
        if self.get("ops"):
            raise ValueError(
                f"Dist.{self['family']}(...).bin: bin a distribution itself, "
                f"not one of its members or its cells."
            )
        kind = cells.get("kind") if isinstance(cells, dict) else None
        if kind not in ("step", "thresholds", "quantiles"):
            raise ValueError(
                f"Dist.{self['family']}(...).bin: a distribution's cells are "
                f"intervals of numbers: use Bin.step, Bin.thresholds or "
                f"Bin.quantiles, got {cells!r}."
            )
        out = DistAccessor(copy.deepcopy(dict(self)))
        out["ops"] = [{"op": "bin", "partition": dict(cells)}]
        return out


def _dist(family: str, **params: Any) -> DistAccessor:
    return DistAccessor(
        {
            "type": "dist",
            "family": family,
            "params": {k: _check_param(family, k, v) for k, v in params.items()},
        }
    )


Param = Union[int, float, str, Dict[str, Any]]


def normal(*, mean: Param, sd: Param) -> DistAccessor:
    """The normal distribution with mean ``mean`` and standard deviation
    ``sd``, drawn between its 0.001 and 0.999 quantiles."""
    return _dist("normal", mean=mean, sd=sd)


def lognormal(*, meanlog: Param, sdlog: Param) -> DistAccessor:
    """The lognormal distribution: ``exp`` of a normal with mean
    ``meanlog`` and standard deviation ``sdlog``. Drawn from 0 to its 0.999
    quantile."""
    return _dist("lognormal", meanlog=meanlog, sdlog=sdlog)


def uniform(*, min: Param, max: Param) -> DistAccessor:  # noqa: A002
    """The uniform distribution from ``min`` to ``max``."""
    return _dist("uniform", min=min, max=max)


def exponential(*, rate: Param) -> DistAccessor:
    """The exponential distribution with rate ``rate`` (mean ``1 / rate``),
    drawn from 0 to its 0.999 quantile."""
    return _dist("exponential", rate=rate)
