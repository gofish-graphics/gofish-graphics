from __future__ import annotations

from typing import Any, Callable, Concatenate, ParamSpec, TypeVar
from typing_extensions import Self

P = ParamSpec("P")
R = TypeVar("R")


class Mark:
    def __init__(self, **spec: Any) -> None:
        self.spec = spec

    def _with(self, **more: Any) -> Self:
        return type(self)(**{**self.spec, **more})

    def name(self, n: str) -> Self:
        return self._with(name=n)

    def pipe(
        self, f: Callable[Concatenate[Self, P], R], *args: P.args, **kwargs: P.kwargs
    ) -> R:
        """pandas/polars-style pipe: f(self, *args, **kwargs)."""
        return f(self, *args, **kwargs)


class Rect(Mark):
    def corner_radius(self, r: float) -> Self:
        return self._with(rx=r)


def rect(**spec: Any) -> Rect:
    return Rect(type="rect", **spec)


# A pandas-style accessor registry.
_T = TypeVar("_T")


def register_mark_namespace(name: str) -> Callable[[type[_T]], type[_T]]:
    def deco(cls: type[_T]) -> type[_T]:
        setattr(Mark, name, property(lambda self: cls(self)))  # type: ignore[call-arg]
        return cls

    return deco
