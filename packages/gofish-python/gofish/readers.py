"""The sources with several readable values, a pointer and a drag, and the
spelling of their reads. Mirrors JS ``src/interaction/readers.ts``.

Each read is an expression, so it composes with ``when``, ``clip`` and
``fill_null`` like any value, and crosses the IR as a source read,
``{"type": "source", "id", "read", "arg"?}``::

    hover = pointer()
    fill=when(hover.over).then("#d62728").otherwise("#6b9bd1")

    dr = drag()
    cut = dr.y.clip(0, 95).fill_null(60)

This module is the whole of their spelling (the read names below are what
the IR carries), so respelling a read is a change here alone.
"""

from __future__ import annotations

from typing import Any, Optional

from .expr import Expr
from .sources import Source


class SourceRead(Expr):
    """One read of a source with several readable values."""

    __slots__ = ("_source", "_read", "_arg")

    def __init__(self, source: Source, read: str, arg: Optional[str] = None):
        self._source = source
        self._read = read
        self._arg = arg

    def _expr_ir(self, payload: Any) -> Any:
        out = {"type": "source", "id": payload.source(self._source), "read": self._read}
        if self._arg is not None:
            out["arg"] = self._arg
        return out

    def __repr__(self) -> str:
        arg = "" if self._arg is None else f"({self._arg!r})"
        return f"{self._source!r}.{self._read}{arg}"


class Pointer(Source):
    """The pointer over the chart (``pointer()``)."""

    _kind = "pointer"

    def _reads_hint(self) -> str:
        return ".over or .field(name)"

    @property
    def over(self) -> Expr:
        """True on the mark under the pointer; false everywhere when the
        pointer is off the chart."""
        return SourceRead(self, "over")

    def field(self, name: str) -> Expr:
        """That field of the mark under the pointer, collapsed over its rows
        (null when no mark is hit)."""
        if not isinstance(name, str):
            raise TypeError(f"pointer().field(name): name must be a str, got {type(name).__name__}")
        return SourceRead(self, "field", name)


class Drag(Source):
    """A drag on the chart, in data units (``drag()``). Every read is null
    before the first drag."""

    _kind = "drag"

    def _reads_hint(self) -> str:
        return ".x, .y, .x0, .y0, .dx, .dy or .active"

    @property
    def x(self) -> Expr:
        """The drag's current position on x, in data units."""
        return SourceRead(self, "x")

    @property
    def y(self) -> Expr:
        """The drag's current position on y, in data units."""
        return SourceRead(self, "y")

    @property
    def x0(self) -> Expr:
        """Where the drag started on x."""
        return SourceRead(self, "x0")

    @property
    def y0(self) -> Expr:
        """Where the drag started on y."""
        return SourceRead(self, "y0")

    @property
    def dx(self) -> Expr:
        """How far the drag has moved on x."""
        return SourceRead(self, "dx")

    @property
    def dy(self) -> Expr:
        """How far the drag has moved on y."""
        return SourceRead(self, "dy")

    @property
    def active(self) -> Expr:
        """True while a drag is in progress."""
        return SourceRead(self, "active")


class Click(Source):
    """Clicks on the chart's marks (``click()``). JS reads it with closures
    only (``c.count()``), so it has no expression reads yet."""

    _kind = "click"

    def _reads_hint(self) -> str:
        return "nothing in Python yet"


def pointer() -> Pointer:
    """The pointer over the chart. Read ``.over`` and ``.field(name)``."""
    from ._generated import _pointer_source_opts

    return Pointer(_pointer_source_opts())


def drag() -> Drag:
    """A drag on the chart. Read ``.x``, ``.y``, ``.x0``, ``.y0``, ``.dx``,
    ``.dy`` and ``.active``."""
    from ._generated import _drag_source_opts

    return Drag(_drag_source_opts())


def click() -> Click:
    """Clicks on the chart's marks."""
    from ._generated import _click_source_opts

    return Click(_click_source_opts())
