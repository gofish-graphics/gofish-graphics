"""Bare strategy kinds (#1133).

A kind of a strategy family with no required option is a value as it is, and
calling it sets options: ``Curve.monotone`` is ``Curve.monotone()``,
``Calendar.month`` is ``Calendar.month()``, and ``Calendar.month(every=3)``
sets its step. A kind with a required option stays a function only
(``Bin.step(0.5)``). Mirrors JS ``gofish-graphics/src/ast/strategyKind.ts``.

The generated family modules (``gofish/<family>.py``) apply
:func:`bare_kind` to each such factory. The bare kind is the dict the
factory returns with no arguments, made callable, so it compares, serializes
and renames to wire keys exactly as that dict does, and nothing that reads a
strategy needs to know which spelling it was given.
"""

from __future__ import annotations

import inspect
from typing import Any, Callable, Dict


class StrategyKind(dict):
    """A strategy kind used bare: the dict its factory returns with no
    arguments, which can also be called like the factory."""

    def __init__(self, label: str, factory: Callable[..., Dict[str, Any]]):
        super().__init__(factory())
        self._label = label
        self._factory = factory
        self.__doc__ = factory.__doc__
        self.__wrapped__ = factory

    def _options(self) -> str:
        """The kind's options, as an error message lists them."""
        return ", ".join(
            f"{p}=..." for p in inspect.signature(self._factory).parameters
        )

    def __call__(self, *args: Any, **kwargs: Any) -> Dict[str, Any]:
        try:
            inspect.signature(self._factory).bind(*args, **kwargs)
        except TypeError as e:
            raise TypeError(
                f"{self._label}: {e}. Its options are {self._options() or 'none'}; "
                f"{self._label} alone is the kind with its defaults."
            ) from None
        return self._factory(*args, **kwargs)

    def __getattr__(self, name: str) -> Any:
        if name.startswith("__"):
            raise AttributeError(name)
        raise AttributeError(
            f"{self._label} has no attribute {name!r}. A kind's options are "
            f"set by calling it: {self._label}({self._options()})."
        )


def bare_kind(family: str) -> Callable[[Callable[..., Dict[str, Any]]], StrategyKind]:
    """Make a factory whose options are all optional into its bare kind,
    named ``<family>.<factory name>`` in errors."""

    def wrap(factory: Callable[..., Dict[str, Any]]) -> StrategyKind:
        return StrategyKind(f"{family}.{factory.__name__}", factory)

    return wrap
