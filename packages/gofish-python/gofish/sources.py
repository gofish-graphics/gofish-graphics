"""Sources: the clocks, state and inputs a chart reads. Mirrors JS
``src/interaction/inputs.ts``.

A source is declared in Python and run by the browser. ``timer(...)`` here
builds a declaration; the document writes it once in its ``sources`` table
(keyed by the source object's identity, as ``_Payload`` keys data tables),
and the browser builds the live clock from it. So the state a chart is drawn
in first is the declared one: a clock at ``at`` (or its domain's start), a
signal at its initial value, a wheel at ``initial``, a pointer off the chart,
a drag not started.

A source is read in two ways:

- **in an expression** (``year.floor()``, ``when(hover.over)...``), which
  JS evaluates, at paint or by laying the chart out again;
- **in the kernel**, by calling it inside a Python callback JS calls (a
  ``derive``): ``bins()`` returns the value JS shipped with the call, and
  the chart lays itself out again when that source changes. Calling a source
  while building the spec raises, because the chart would never see it
  change.

Only the sources of one value (``timer``, ``signal``, ``wheel``) can be
called in the kernel. A pointer or a drag has several values, read in
expressions (``readers.py``).
"""

from __future__ import annotations

import contextvars
from typing import Any, Dict, List, Optional, Tuple

from .expr import ExprMethods


class Source:
    """A clock, a piece of state or an input, declared in Python and run by
    the browser. Its identity is the source: two charts that name the same
    object share it, and a document declares it once."""

    _kind: str = ""

    def __init__(self, declaration: Dict[str, Any]):
        # The declaration's options, by their wire names (the generated
        # `_<kind>_source_opts` cores).
        self._declaration = declaration

    def _decl(self) -> Dict[str, Any]:
        """The source's entry in a document's ``sources`` table."""
        return {"kind": self._kind, **self._declaration}

    def _reads_hint(self) -> str:
        return "its reads"

    def __call__(self) -> Any:
        raise TypeError(
            f"{self._kind}() has several values, so a Python callback cannot "
            f"read it as one; read {self._reads_hint()} in an expression. Only "
            f"a timer, a signal or a wheel can be read in a derive."
        )

    def __repr__(self) -> str:
        opts = ", ".join(f"{k}={v!r}" for k, v in self._declaration.items())
        return f"{self._kind}({opts})"


class _ValueSource(ExprMethods, Source):
    """A source of one value: an expression of that value, and, inside a
    Python callback JS calls, callable for it."""

    def _expr_ir(self, payload: Any) -> Any:
        return {"type": "source", "id": payload.source(self)}

    def __call__(self) -> Any:
        reading = _READING.get()
        if reading is None:
            raise RuntimeError(
                f"{self!r} was read while building the spec, so the chart "
                f"would never see it change. Pass the source itself as the "
                f"value (it is an expression), or read it inside a derive."
            )
        return reading.read(self)


class Timer(_ValueSource):
    """A clock (``timer(...)``): its value is the playhead, in its domain's
    units."""

    _kind = "timer"


class Signal(_ValueSource):
    """A piece of state (``signal(init)``)."""

    _kind = "signal"


class Wheel(_ValueSource):
    """A wheel-driven number (``wheel(range=...)``)."""

    _kind = "wheel"


def timer(**options: Any) -> Timer:
    """A clock: a scale from a data domain onto wall-clock time, read
    backward, so its value is a value of the domain. The browser runs it.

    Options (the generated ``_timer_source_opts``): ``domain``, ``duration``,
    ``step``, ``loop``, ``playing``, ``at``. ``playing=False, at=...`` holds
    the clock still, which is how a paused frame is drawn.

    Example::

        year = timer(domain=[1955, 2005], duration=10_000)
        time.sequence(by="year", on=year)
    """
    from ._generated import _timer_source_opts

    return Timer(_timer_source_opts(**options))


def signal(init: Any = None) -> Signal:
    """A piece of state, at its initial value ``init``."""
    from ._generated import _signal_source_opts

    return Signal(_signal_source_opts(init=init))


def wheel(**options: Any) -> Wheel:
    """A number in ``range`` that the mouse wheel over the chart moves.

    Options (the generated ``_wheel_source_opts``): ``range`` (required),
    ``initial``, ``domain``, ``round``, ``sensitivity``.

    Example::

        bins = wheel(range=[3, 40], initial=12, round=True)
    """
    from ._generated import _wheel_source_opts

    return Wheel(_wheel_source_opts(**options))


# ---------------------------------------------------------------------------
# The ids of a document's sources, and the kernel-tier read
# ---------------------------------------------------------------------------


class _SourceIds:
    """The sources of one document, by identity, with their ids. One object
    serves the root walk and every reply to a call from that document
    (``_Payload``), so a source keeps one id across them, and JS resolves a
    reply's read of it to the same live source."""

    def __init__(self) -> None:
        self._by_obj: Dict[int, str] = {}
        self._by_id: Dict[str, Source] = {}
        self._minted: Dict[Optional[str], int] = {}

    def id_of(self, source: Source, scope: Optional[str]) -> str:
        """The source's id, minted on first sight: ``s0``, ``s1``, ... in the
        root walk, ``<scope>.s0``, ... in a call's reply. A source made
        afresh by a callback on every call is named by the call (as the
        callbacks a reply records are), so the same call names the same id
        and the table does not grow with each render."""
        sid = self._by_obj.get(id(source))
        if sid is not None:
            return sid
        n = self._minted.get(scope, 0)
        self._minted[scope] = n + 1
        sid = f"s{n}" if scope is None else f"{scope}.s{n}"
        old = self._by_id.get(sid)
        if old is not None:
            self._by_obj.pop(id(old), None)
        self._by_obj[id(source)] = sid
        self._by_id[sid] = source
        return sid

    def declaration(self, sid: str) -> Dict[str, Any]:
        return self._by_id[sid]._decl()

    def restart(self, scope: Optional[str]) -> None:
        """Mint a call's ids from the start again: the same call (the same
        lambda and rows) names the same ids each time it is answered."""
        self._minted.pop(scope, None)


class _SourceNotShipped(BaseException):
    """A callback read a source JS sent no value for (a source only the
    callback names). The callback stops; the reply declares the source, and
    JS calls again with its value. A BaseException, so a user's
    ``except Exception`` does not swallow it."""


class _Reading:
    """The source values of one call from JS, and the ids the callback read."""

    def __init__(self, values: Dict[str, Any], ids: _SourceIds, scope: str):
        self.values = values
        self.ids = ids
        self.scope = scope
        self.reads: List[str] = []

    def read(self, source: Source) -> Any:
        sid = self.ids.id_of(source, self.scope)
        if sid not in self.reads:
            self.reads.append(sid)
        if sid not in self.values:
            raise _SourceNotShipped(sid)
        return self.values[sid]


_READING: contextvars.ContextVar[Optional[_Reading]] = contextvars.ContextVar(
    "gofish_source_values", default=None
)


def _reading(values: Dict[str, Any], ids: _SourceIds, scope: str) -> Tuple[_Reading, contextvars.Token]:
    """Make ``values`` what the sources read while a callback runs."""
    reading = _Reading(values, ids, scope)
    return reading, _READING.set(reading)
