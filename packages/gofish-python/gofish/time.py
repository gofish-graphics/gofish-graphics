"""The time surface: keyframes of data time and build-ins. Mirrors JS
``time`` (``src/ast/marks/time.ts``, ``src/animation/timeArrangements.ts``).

- ``time.sequence(by=...)`` shows one keyframe per value of a field as a
  clock plays: its own clock, or the ``timer`` passed as ``on``.
- ``time.history(last=...)`` keeps the marks of past keyframes on screen.
- ``time.transition(...)`` is the mark that moves between keyframes, or,
  with no sequence and an ``enter``, the build-in of the marks it selects.
- ``time.stagger(...)`` and ``time.parallel()`` start children one after
  another or together: as operators over refs, or as the value of an
  operator's ``.transition(enter=...)``.

The package binds this module as ``time``, so ``from gofish import time``
shadows the standard library's ``time`` in that namespace (import it as
``import time as _time`` beside it if you need both).
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from .ast import Mark, Operator
from .sources import Source

__all__ = ["sequence", "history", "transition", "stagger", "parallel"]


def sequence(*, by: str, on: Optional[Source] = None, **options: Any) -> Operator:
    """One keyframe per value of ``by``, laid out in one shared frame and
    shown one at a time as a clock plays.

    With no ``on``, the sequence has its own clock (``duration``, ``loop``,
    ``playing``, ``at``). With ``on``, it plays on that ``timer``, which owns
    its domain and play state, so the clock options are errors beside it.

    Example::

        year = timer(domain=[1955, 2005], duration=10_000)
        chart(data).flow(time.sequence(by="year", on=year), scatter(by="country", x="fertility", y="life_expect"))
    """
    from ._generated import _time_sequence_opts

    if on is not None and getattr(on, "_kind", None) != "timer":
        raise TypeError(
            f"time.sequence(on=...) takes a timer(...), got {on!r}"
        )
    return Operator("time.sequence", **_time_sequence_opts(by=by, on=on, **options))


def history(children: Optional[List[Any]] = None, **options: Any) -> Any:
    """Keep the marks below on screen for ``last`` units of the sequence's
    field after their keyframe.

    Operator form (no children): ``.flow(time.sequence(...), time.history(last=20), ...)``.
    Combinator form: ``time.history([circle(...)], last=20)``, the history
    of these marks alone.
    """
    from ._generated import _time_history_opts

    kwargs = _time_history_opts(**options)
    if children is not None:
        return Mark("time.history", _children=list(children), **kwargs)
    return Operator("time.history", **kwargs)


def transition(children: Optional[List[Any]] = None, **options: Any) -> Mark:
    """The mark that moves between the keyframes of a ``time.sequence``,
    or, with no sequence and an ``enter``, the build-in of the marks it
    selects.

    Options (the generated ``_time_transition_opts``): ``along``, ``at`` (a
    number or an expression, such as a clock), ``curve``, ``fill``,
    ``stroke``, ``stroke_width``, ``opacity``, ``enter``, ``exit``.

    Example::

        .layer(time.transition(curve=Curve.linear()))
        .mark(time.transition(enter=Animation.wipe(from_="bottom")))
    """
    from ._generated import _time_transition_opts

    kwargs = _time_transition_opts(**options)
    if children is not None:
        return Mark("time.transition", _children=list(children), **kwargs)
    return Mark("time.transition", **kwargs)


class _Arrangement(Operator):
    """``time.stagger(...)`` or ``time.parallel()``: an operator that groups
    the refs it is given, and also the arrangement an operator's
    ``.transition(enter=...)`` takes."""

    def arrangement(self) -> Dict[str, Any]:
        """The arrangement's wire form, ``{"kind": "stagger", ...}``."""
        opts = {k: v for k, v in self.kwargs.items() if k != "debug"}
        return {"kind": self.op_type.split(".", 1)[1], **opts}


def stagger(**options: Any) -> Operator:
    """Start the children (or the groups of ``by``) one after another.

    Options (the generated ``_time_stagger_opts``): ``lag``, ``spacing``,
    ``dwell``, ``by``, ``from_``.
    """
    from ._generated import _time_stagger_opts

    return _Arrangement("time.stagger", **_time_stagger_opts(**options))


def parallel() -> Operator:
    """Start the children together."""
    return _Arrangement("time.parallel")


def _arrangement(value: Any, phase: str) -> Dict[str, Any]:
    """The wire form of ``.transition(<phase>=value)`` on an operator."""
    if not isinstance(value, _Arrangement):
        raise TypeError(
            f".transition({phase}=...) on an operator takes time.stagger(...) "
            f"or time.parallel(), got {value!r}"
        )
    return value.arrangement()
