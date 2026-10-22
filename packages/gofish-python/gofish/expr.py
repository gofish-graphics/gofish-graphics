"""Expressions: values built from field reads, source reads, literals and a
fixed set of operations, written as data so they cross to JS and run there.
Mirrors JS ``src/ast/expr.ts``.

The vocabulary is polars'. Python spells the operations with its operators
(``a > b``, ``a + b``, ``a & b``, ``~a``) and the rest as methods
(``.clip(lo, hi)``, ``.fill_null(v)``, ``.floor()``, ``.round()``), plus
``when(c).then(x).otherwise(y)`` and ``concat_str(...)``::

    when(field("count").sum() > cut).then("#d62728").otherwise("#6b9bd1")

The leaves are literals, ``field(name)`` (with its aggregates), and the
sources of one value (``timer``, ``signal``, ``wheel``) or the reads of a
source with several (``hover.over``, ``dr.y``; see ``readers.py``). An
expression is accepted wherever a channel value is, and as a ``filter``
predicate. Which tier it runs in (paint or re-layout) is inferred in JS from
the channel, so there is no ``live()``.

As in polars, ``==`` builds an expression, so an expression is not a bool
(``if expr:`` raises) and cannot be a dict key or a set member.
"""

from __future__ import annotations

from typing import Any, List, Optional, Tuple

_LITERALS = (str, int, float, bool, type(None))


class ExprMethods:
    """The operations every expression has: on an ``Expr``, on
    ``field(...)``, and on a source of one value. Each returns a new
    expression; nothing is evaluated in Python."""

    __slots__ = ()

    def _expr_ir(self, payload: Any) -> Any:
        """The expression's IR (``ExprIR``). ``payload`` declares the
        sources it reads (see ``_Payload.source``)."""
        raise NotImplementedError

    # Comparisons. Null on either side is null, as in polars.
    def __gt__(self, other: Any) -> "Expr":
        return _op("gt", self, other)

    def __ge__(self, other: Any) -> "Expr":
        return _op("gtEq", self, other)

    def __lt__(self, other: Any) -> "Expr":
        return _op("lt", self, other)

    def __le__(self, other: Any) -> "Expr":
        return _op("ltEq", self, other)

    def __eq__(self, other: Any) -> "Expr":  # type: ignore[override]
        return _op("eq", self, other)

    def __ne__(self, other: Any) -> "Expr":  # type: ignore[override]
        return _op("neq", self, other)

    # Arithmetic.
    def __add__(self, other: Any) -> "Expr":
        return _op("add", self, other)

    def __radd__(self, other: Any) -> "Expr":
        return _op("add", other, self)

    def __sub__(self, other: Any) -> "Expr":
        return _op("sub", self, other)

    def __rsub__(self, other: Any) -> "Expr":
        return _op("sub", other, self)

    def __mul__(self, other: Any) -> "Expr":
        return _op("mul", self, other)

    def __rmul__(self, other: Any) -> "Expr":
        return _op("mul", other, self)

    def __truediv__(self, other: Any) -> "Expr":
        return _op("div", self, other)

    def __rtruediv__(self, other: Any) -> "Expr":
        return _op("div", other, self)

    # Boolean logic, three-valued as in polars.
    def __and__(self, other: Any) -> "Expr":
        return _op("and", self, other)

    def __rand__(self, other: Any) -> "Expr":
        return _op("and", other, self)

    def __or__(self, other: Any) -> "Expr":
        return _op("or", self, other)

    def __ror__(self, other: Any) -> "Expr":
        return _op("or", other, self)

    def __invert__(self) -> "Expr":
        return _op("not", self)

    def clip(self, lo: Any, hi: Any) -> "Expr":
        """Clamp into ``[lo, hi]``."""
        return _op("clip", self, lo, hi)

    def fill_null(self, value: Any) -> "Expr":
        """This value, or ``value`` where it is null."""
        return _op("fillNull", self, value)

    def floor(self) -> "Expr":
        return _op("floor", self)

    def round(self) -> "Expr":
        return _op("round", self)

    def __bool__(self) -> bool:
        raise TypeError(
            "an expression has no truth value in Python: it is evaluated in "
            "the browser, per mark. To choose between values, write "
            "when(condition).then(a).otherwise(b); to combine conditions, "
            "use & | ~ instead of and/or/not."
        )

    def __hash__(self) -> int:
        raise TypeError(
            "an expression cannot be a dict key or a set member: == builds an "
            "expression (as in polars) instead of comparing. Key by a name "
            "instead."
        )


class Expr(ExprMethods):
    """An expression built from other expressions (an operation or a
    ``when`` chain). ``field(...)`` and the sources of one value are
    expressions too, through ``ExprMethods``."""

    __slots__ = ()


def expr_ir(value: Any, payload: Any) -> Any:
    """The IR of an expression input: an expression, a ``field(...)``, a
    source of one value, or a literal (a string, number, bool or None).
    Inside an expression a string is a literal, never a field name."""
    if isinstance(value, ExprMethods):
        return value._expr_ir(payload)
    if isinstance(value, _LITERALS):
        return value
    raise TypeError(_not_an_input(value))


def _not_an_input(value: Any) -> str:
    from .sources import Source

    if isinstance(value, Source):
        return (
            f"{value!r} has several values, so it is not an expression itself; "
            f"read one of them ({value._reads_hint()})."
        )
    if callable(value):
        return (
            "a function is not an expression: Python functions do not run in "
            "the browser. Build the value from field(...), sources, when(...) "
            "and the expression operations, or compute it in a derive."
        )
    return (
        f"{type(value).__name__} {value!r} is not an expression, a source, a "
        f"field(...), or a literal (a str, int, float, bool or None)."
    )


def _check(value: Any) -> Any:
    """An expression input, checked where it is written, so a bad one fails
    at the line that made it."""
    if not isinstance(value, (ExprMethods,) + _LITERALS):
        raise TypeError(_not_an_input(value))
    return value


class _Op(Expr):
    """One operation over its arguments (``EXPR_OPS`` in gofish-ir)."""

    __slots__ = ("_name", "_args")

    def __init__(self, name: str, args: Tuple[Any, ...]):
        self._name = name
        self._args = tuple(_check(a) for a in args)

    def _expr_ir(self, payload: Any) -> Any:
        return {
            "type": "op",
            "op": self._name,
            "args": [expr_ir(a, payload) for a in self._args],
        }

    def __repr__(self) -> str:
        return f"Expr({self._name}{self._args!r})"


def _op(name: str, *args: Any) -> Expr:
    return _Op(name, args)


def concat_str(*parts: Any) -> Expr:
    """The parts as text, joined (polars' ``concat_str``). Null if any part
    is null.

    Example::

        text(text=concat_str("bins: ", bins, " (scroll to re-bin)"))
    """
    return _Op("concatStr", parts)


class _When(Expr):
    """``when(c).then(v)...otherwise(z)``: the value of the first branch
    whose condition is true, else ``otherwise`` (null when absent)."""

    __slots__ = ("_branches", "_otherwise", "_has_otherwise")

    def __init__(
        self,
        branches: List[Tuple[Any, Any]],
        otherwise: Any = None,
        has_otherwise: bool = False,
    ):
        self._branches = branches
        self._otherwise = _check(otherwise)
        self._has_otherwise = has_otherwise

    def _expr_ir(self, payload: Any) -> Any:
        out: dict = {
            "type": "when",
            "branches": [
                [expr_ir(c, payload), expr_ir(v, payload)]
                for c, v in self._branches
            ],
        }
        if self._has_otherwise:
            out["otherwise"] = expr_ir(self._otherwise, payload)
        return out


class Then(_When):
    """What ``when(c).then(v)`` returns: an expression (null where no branch
    holds) that takes more branches and an ``otherwise``."""

    __slots__ = ()

    def when(self, condition: Any) -> "When":
        return When(condition, self._branches)

    def otherwise(self, value: Any) -> Expr:
        return _When(self._branches, value, True)


class When:
    """``when(condition)``, waiting for its ``.then(value)``."""

    __slots__ = ("_condition", "_branches")

    def __init__(self, condition: Any, branches: Optional[list] = None):
        self._condition = _check(condition)
        self._branches = branches or []

    def then(self, value: Any) -> Then:
        return Then([*self._branches, (self._condition, _check(value))])


def when(condition: Any) -> When:
    """polars' conditional. Chain more branches with ``.when(c).then(v)`` and
    end with ``.otherwise(v)``; the first branch whose condition is true
    gives the value.

    Example::

        fill=when(hover.over).then("#d62728").otherwise("#6b9bd1")
    """
    return When(condition)
