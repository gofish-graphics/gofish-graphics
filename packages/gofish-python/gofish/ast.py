"""AST classes for building GoFish chart specifications."""

from typing import Any, Callable, Dict, List, Optional, Tuple, TypeVar, Union
import datetime
import decimal
import hashlib
import inspect
import json
import math
import re
import sys
import uuid

from . import _nonfinite
from ._nonfinite import KEEP, encode_number

T = TypeVar("T")


class Operator:
    """Base class for chart operators."""

    def __init__(self, op_type: str, **kwargs):
        self.op_type = op_type
        # A callable in a channel option was wrapped as an accessor by the
        # factory (`_channel`); one anywhere else has no meaning on the wire.
        self._accessors = _scan_options(op_type, kwargs)
        self.kwargs = kwargs
        self._translate: Optional[dict] = None
        # One entry per `.label(accessor, options?)` call, in call order —
        # repeated calls append rather than overwrite. Mirrors JS
        # createOperator.ts's `labelState` array.
        self._labels: List[dict] = []

    def translate(
        self,
        *,
        x: Optional[float] = None,
        y: Optional[float] = None,
    ) -> "Operator":
        """Translate the operator's arranged output by literal pixels.

        Mirrors JS ``scatter({...}).translate({ y: 50 })``. This is structural:
        it offsets the arranged result without merging ``x`` / ``y`` into the
        operator's own channel grammar.
        """
        new_op = type(self)(self.op_type, **self.kwargs)
        new_op._labels = list(self._labels)
        new_op._translate = {
            k: v for k, v in {"x": x, "y": y}.items() if v is not None
        }
        return new_op

    def label(
        self, accessor: Union[str, "FieldAccessor"], **options: Any
    ) -> "Operator":
        """Attach a per-group label to this operator (traversal form).

        Mirrors JS ``stack({by, dir}).label(accessor, options?)``: at
        execution time, every node a split leaf produces gets stamped with
        the leaf's own subdata and a deferred label. Calling ``.label()``
        more than once appends — each call adds its own label.

        `accessor` is either:

        - a plain field name (``str``) — must be constant across every row
          in the group (true by construction for a ``by`` field); raises
          loudly at render time otherwise.
        - a ``field(...)`` aggregate (``field("count").sum()`` /
          ``.mean()`` / ``.count()`` / ``.distinct()``), folding the
          group's rows to one value — use this for a group total/mean.

        Python has no function-accessor form; use one of the above.

        `options` are the label options (``position``, ``font_size``,
        ``color``, ...), the same as on :meth:`Mark.label`; see the generated
        ``_label_opts`` or the docs options table.

        Returns:
            New Operator (same subclass as self) with the label appended.
        """
        new_op = type(self)(self.op_type, **self.kwargs)
        new_op._translate = self._translate
        new_op._labels = [*self._labels, _label_spec(accessor, options)]
        return new_op

    def to_dict(self, payload: "_Payload") -> dict:
        """The operator's IR. ``payload`` records the callbacks its options
        name (see ``_Payload``)."""
        d = {
            "type": self.op_type,
            **_wire_options(self.kwargs, self._accessors, payload),
        }
        if self._translate:
            d["translate"] = self._translate
        if self._labels:
            d["label"] = self._labels
        return d


class DeriveOperator(Operator):
    """Operator for deriving new data via Python function."""

    def __init__(
        self,
        fn: Callable,
        schema: Optional[dict] = None,
    ):
        super().__init__("derive")
        self.fn = fn
        self.lambda_id = str(uuid.uuid4())
        # The column types of the result (``derive(fn, schema={...})``), in
        # the wire form of a chart's ``schema``; JS applies them to the rows
        # the callback returns.
        self.schema = schema

    def translate(
        self,
        *,
        x: Optional[float] = None,
        y: Optional[float] = None,
    ) -> "DeriveOperator":
        """Translate a derived operator while preserving its lambda handle."""
        new_op = DeriveOperator(self.fn, self.schema)
        new_op.lambda_id = self.lambda_id
        new_op._labels = list(self._labels)
        new_op._translate = {
            k: v for k, v in {"x": x, "y": y}.items() if v is not None
        }
        return new_op

    def label(self, *args, **kwargs) -> "DeriveOperator":
        """`derive(fn)` has no JS-side `.label()` — it isn't built via
        `createOperator`'s dual-mode traversal form, so there's no per-leaf
        split to stamp a label onto. Raise rather than silently no-op.
        """
        raise NotImplementedError(
            "derive(fn) does not support .label() — it's a data transform, "
            "not a layout operator with per-group leaves to label. Chain "
            ".label() on the layout operator (stack/spread/group/scatter/"
            "table/treemap) instead."
        )

    def to_dict(self, payload: "_Payload") -> dict:
        """The lambda id (+ the result's schema, if any). ``payload`` records
        the callback, which answers with the rows ``fn`` returns."""
        out = {
            "type": "derive",
            "lambdaId": payload.callback(self.lambda_id, _table_reply(self.fn)),
        }
        if self.schema is not None:
            out["schema"] = self.schema
        if self._translate:
            out["translate"] = self._translate
        return out


class Composed:
    """A reusable flow fragment: a left-to-right sequence of operators.

    Built by :func:`compose`. It holds its operators already flattened, and
    ``ChartBuilder.flow()`` expands it into them, so the IR carries the
    constituent operators and has no compose node. Mirrors JS
    ``compose(...ops)`` (ast/marks/compose.ts).
    """

    def __init__(self, operators: List[Operator]):
        self.operators: tuple = tuple(operators)


def _expand_composed(op: Union[Operator, Composed]) -> tuple:
    return op.operators if isinstance(op, Composed) else (op,)


def compose(*ops: Union[Operator, Composed]) -> Composed:
    """Package a left-to-right sequence of operators as one flow fragment.

    Nested fragments are flattened, and ``compose()`` with no arguments is
    the identity fragment. Pass the result to ``.flow()`` like an operator;
    it expands into its constituent operators.

    Example::

        grid = compose(spread(dir="y"), spread(dir="x"))
        chart(data).flow(spread(by="lake", dir="x"), grid).mark(rect(w=8, h=8))
    """
    return Composed([o for op in ops for o in _expand_composed(op)])


class _MarkFn:
    """Sentinel wrapping a Python callable used as a *whole* mark.

    `ChartBuilder.mark(lambda data: chart(data[0]["collection"]).flow(...).mark(...))`
    — the lambda receives the per-group data slice and returns a mark, a
    chart or a layer for that slice. JS storybook calls this
    "mark-as-function" (see `Scatter.stories.tsx::WithPieGlyphs`).

    The wire shape is `{type: "mark-fn", lambdaId: <uuid>}`. JS builds a
    Mark whose body calls the bridge per invocation and gets back a document
    whose root is the mark-position IR of what the callback returned, which
    JS rebuilds like any other mark position.
    """

    def __init__(self, fn: Callable):
        self.fn = fn
        self.lambda_id = str(uuid.uuid4())

    def children(self) -> List[Any]:
        """What it draws is built per call, so it holds no mark positions."""
        return []

    def to_dict(self, payload: "_Payload") -> dict:
        return {
            "type": "mark-fn",
            "lambdaId": payload.callback(self.lambda_id, _mark_fn_reply(self.fn)),
        }


def _as_mark(mark: Any) -> Any:
    """What a mark position holds: the chart's `.mark(...)` and each child of
    a combinator (`layer([...])`, `spread([...])`, ...). A `Mark`, a nested
    `ChartBuilder` and a `LayerBuilder` stay as they are: each serializes as
    its own IR (`to_dict()`), and JS rebuilds the same object a JS author
    writes there. A callable `(data) -> mark | chart` is arbitrary Python
    code, so it becomes a `_MarkFn` that JS calls back per partition.
    """
    if not isinstance(mark, (Mark, _MarkFn, ChartBuilder, LayerBuilder)) and callable(mark):
        return _MarkFn(mark)
    return mark


class _PendingAccessor:
    """Sentinel wrapping a Python callable used as an accessor in a mark or
    operator option (top-level, or nested as in `dims={"r": {"size": fn}}`).

    JS's `createMark` accepts a callable for encoding channels like
    `text({text: (d) => `${d.amount}%`})`. A host can't ship a Python
    callable to JS, so the factory wraps it here with a fresh `lambda_id`
    (same UUID shape as `DeriveOperator`). `_wire_options` writes it as
    `{"__gofish_lambda": id}` and records its callback in the payload; JS
    swaps the sentinel for an accessor that calls the bridge once with all
    of its rows.
    """

    def __init__(self, fn: Callable):
        self.fn = fn
        self.lambda_id = str(uuid.uuid4())


def _is_tagged(v: Any) -> bool:
    """A `field(...)` or `datum(...)` value: a dict subclass that already holds
    wire data, so the option walks treat it as a leaf."""
    return isinstance(v, (FieldAccessor, DatumValue))


def _channel(v: Any) -> Any:
    """Wrap every callable in a channel option's value in `_PendingAccessor`.

    A channel value is a literal, a field name, a tagged value (`datum()`,
    `field(...)`), or a plain dict/list/tuple of those
    (`dims={"r": {"size": ...}}`). A callable `(row) -> value` may sit at any
    depth, so this wraps each one; the `Mark` or `Operator` built from the
    options records the accessors (`_scan_options`). The generated factories
    call it only on options the descriptor declares as channels. A value with
    no callable comes back as the same object.
    """
    return _nonfinite.walk(
        v,
        lambda x: x
        if _is_tagged(x)
        else _PendingAccessor(x)
        if callable(x) and not isinstance(x, _PendingAccessor)
        else KEEP,
    )


def _scan_options(construct: str, options: Dict[str, Any]) -> Dict[str, List["_PendingAccessor"]]:
    """The accessors in a construct's options, by option key, in one walk.

    A Python callable crosses to JS only as a channel accessor, which the
    generated factories wrap with `_channel` for the options the descriptor
    declares as channels. A raw callable anywhere else (a `by`, a `dir`, ...)
    would reach JS as an RPC handle it never resolves, so it fails loudly
    here. The `Mark` / `Operator` keeps the result, so serializing and
    registering its accessors never walks large options (`join`'s rows) again.
    """
    found: Dict[str, List[_PendingAccessor]] = {}
    for key, value in options.items():
        accessors: List[_PendingAccessor] = []

        def visit(x: Any, key: str = key, accessors: list = accessors) -> Any:
            if isinstance(x, _PendingAccessor):
                accessors.append(x)
                return x
            if _is_tagged(x):
                return x
            if callable(x):
                raise TypeError(
                    f"{construct}: {key} holds a function, but only channel "
                    f"options take a function. Pass a field name or a "
                    f"field(...) accessor."
                )
            return KEEP

        _nonfinite.walk(value, visit)
        if accessors:
            found[key] = accessors
    return found


def _wire_options(
    options: Dict[str, Any], accessors: Dict[str, list], payload: "_Payload"
) -> Dict[str, Any]:
    """The options as the wire carries them: each `_PendingAccessor` becomes
    its `{"__gofish_lambda": id}` sentinel, at any depth, and ``payload``
    records its callback (``_accessor_reply``). Only the options
    `_scan_options` found accessors in are walked; the rest are the same
    objects. The JS deserializer turns each sentinel back into an accessor
    that calls into Python."""
    return {
        k: _nonfinite.walk(
            v,
            lambda x: {
                "__gofish_lambda": payload.callback(
                    x.lambda_id, _accessor_reply(x.fn)
                )
            }
            if isinstance(x, _PendingAccessor)
            else x
            if _is_tagged(x)
            else KEEP,
        )
        if k in accessors
        else v
        for k, v in options.items()
    }


def _select_ref(proxy: "_RefProxy") -> Dict[str, Any]:
    """A ref by a layer name (`ref(name)`, `select_all(name)`) as its wire
    form, `SelectRefIR`: `{"type": "select", "layer": name, "mode": "one" |
    "all"}`, "one" for a singular `ref(name)`, "all" for `select_all(name)`.
    Chart data takes it, and so does an option that names nodes."""
    selection = proxy._sel()
    if len(selection) != 1 or not isinstance(selection[0], str):
        raise ValueError(
            "a ref used as a layer selection must be a flat single-name "
            "selection (e.g. `ref(\"bars\")` / `select_all(\"bars\")`); "
            "token/path refs cannot serialize as one"
        )
    return {
        "type": "select",
        "layer": selection[0],
        "mode": proxy.multiplicity or "one",
    }


def _mark_in_option(m: "Mark", payload: "_Payload") -> Any:
    """A mark named inside an option (a blob's `avoiding`), as the wire names
    it (`NodeSelectionIR`): `select_all(name)` is every node of the layer, the
    `SelectRefIR` chart data takes; any other mark (a `ref(...)`, a
    `.relate()` operand) is its IR, and ``payload`` collects what ships
    beside it."""
    if getattr(m, "multiplicity", None) == "all":
        return _select_ref(m)
    return m.to_dict(payload)


def _marks_in_options(
    options: Dict[str, Any], payload: "_Payload"
) -> Dict[str, Any]:
    """The options with every mark in them, at any depth, written as its IR
    (`_mark_in_option`). Options without one are the same objects."""
    return {
        k: _nonfinite.walk(
            v,
            lambda x: _mark_in_option(x, payload)
            if isinstance(x, Mark)
            else x
            if _is_tagged(x)
            else KEEP,
        )
        for k, v in options.items()
    }


class Token:
    """Hygienic name for a sub-mark inside a `@mark` component.

    Mirrors JS `createName(tag) -> Token`
    (`packages/gofish-graphics/src/ast/createName.ts`). Each Token carries
    an opaque UUID `id` so two `create_name("box")` calls in different
    components don't collide, plus a `tag` string used as the scope-map
    path segment for both `.relate(lambda box: ...)` callbacks and
    outer `ref(t).box` navigation.
    """

    def __init__(self, tag: str):
        self.tag = tag
        self.id = str(uuid.uuid4())

    def to_dict(self) -> dict:
        return {"__gofish_token": self.id, "__tag": self.tag}


def create_name(tag: str) -> Token:
    """Mint a hygienic token. See `Token`."""
    return Token(tag)


def mark(fn: Callable) -> Callable:
    """Decorator that promotes a `(**props) -> Mark` function into a
    reusable component factory.

    Calling the decorated function eagerly runs `fn(**props)` to produce
    a Mark tree, then flags the result as a scope boundary. Internal names
    declared via `create_name(...)` therefore don't leak to outer scope.

    Mirrors JS `createMark(shapeFn)`
    (`packages/gofish-graphics/src/ast/withGoFish.ts:525`). Channel
    annotations (the `(shapeFn, channels)` overload) are out of scope
    here — Python components take plain kwargs and produce IR eagerly.
    """

    def wrapped(**props):
        result = fn(**props)
        if not isinstance(result, Mark):
            raise TypeError(
                f"@mark function `{fn.__name__}` must return a Mark"
            )
        result._is_scope = True
        return result

    wrapped.__name__ = getattr(fn, "__name__", "mark_component")
    wrapped.__doc__ = fn.__doc__
    return wrapped


class _Root:
    """What can be a root: a mark, a chart, or a ``.layer(...)`` chain. A
    root holds anything a mark position does, so all three have one IR
    entry point, ``to_ir()``."""

    def to_ir(self) -> dict:
        """The frontend-IR document whose root is this: the same envelope JS
        ``toJSON`` writes (``irVersion``, ``ir``, ``root``, and ``tables``,
        the rows of every chart in it that has rows of its own, as JSON rows
        by the id its data names). A host ships the same document with its
        tables as Arrow instead (``ir_payload``)."""
        root, payload = _walk(self)
        return _document(root, payload.json_tables())


class Mark(_Root):
    """Base class for chart marks."""

    def __init__(
        self,
        mark_type: str,
        _children: Optional[List["Mark"]] = None,
        **kwargs,
    ):
        self.mark_type = mark_type
        # As on Operator: only channel options may hold a callable.
        self._accessors = _scan_options(mark_type, kwargs)
        self.kwargs = kwargs
        self._name: Optional[Union[str, "Token"]] = None
        # One entry per `.label(accessor, options?)` call, in call order —
        # repeated calls append rather than overwrite. Mirrors JS
        # createOperator.ts's mark-side `labelModifier` accumulation.
        self._labels: List[dict] = []
        # When set, this Mark is the combinator form of a layout operator
        # (e.g. `spread([rect, rect], dir="x")`) and `to_dict()` will emit a
        # `__combinator: true` payload the harness/widget reconstructs by
        # calling the JS-side combinator overload.
        # A child may be anything a mark position holds (see `_as_mark`),
        # including a nested chart or layer.
        self._children: Optional[List[Any]] = (
            None if _children is None else [_as_mark(c) for c in _children]
        )
        # When True, the harness wraps the resulting JS Mark in a
        # `node.scope()` post-pass so that internal names declared via
        # `create_name(...)` don't leak to outer scope. Set by the
        # `@mark` decorator.
        self._is_scope: bool = False
        # When set, the harness invokes the JS-side mark with this datum
        # and key — mirrors the JS `rect({...})(d, key)` pattern used by
        # `treemap([rect(...)(d1, k1), rect(...)(d2, k2), ...], **opts)`.
        # Set via `.bind_data(d, key)`.
        self._datum: Any = None
        self._datum_set: bool = False
        self._key: Optional[str] = None
        # Default z-order hint (sorted within siblings inside `layer`'s
        # render). Mirrors JS `node._zOrder` (`.zOrder(n)`).
        self._z_order: Optional[float] = None
        self._translate: Optional[dict] = None

    def _copy_meta(self, target: "Mark") -> "Mark":
        target._name = self._name
        target._labels = list(self._labels)
        target._children = self._children
        target._is_scope = self._is_scope
        target._datum = self._datum
        target._datum_set = self._datum_set
        target._key = self._key
        target._z_order = self._z_order
        target._translate = self._translate
        return target

    def bind_data(self, datum: Any, key: Optional[str] = None) -> "Mark":
        """Bind a datum (and optional key) to this Mark for the treemap
        combinator pattern.

        Mirrors JS storybook spelling `rect({...})(d, d.key)` — the mark
        factory is invoked with `(d, key)` to produce a pre-resolved node
        with `.datum = d` set. The harness emits the equivalent call.
        """
        new_mark = type(self)(
            self.mark_type, _children=self._children, **self.kwargs
        )
        self._copy_meta(new_mark)
        new_mark._datum = datum
        new_mark._datum_set = True
        new_mark._key = key
        return new_mark

    def name(self, name_or_token: Union[str, "Token"]) -> "Mark":
        """
        Set a layer name on this mark for cross-chart referencing via
        `ref(...)` / `select_all(...)` as chart data (string form) or
        hygienic in-component naming (`create_name(...)` token form).

        Args:
            name_or_token: A bare string for flat naming, or a `Token`
                returned by `create_name()` for hygienic scoping inside a
                `@mark`-decorated component.

        Returns:
            New Mark (same subclass as self) with name set
        """
        new_mark = type(self)(
            self.mark_type, _children=self._children, **self.kwargs
        )
        self._copy_meta(new_mark)
        new_mark._name = name_or_token
        return new_mark

    def z_order(self, value: float) -> "Mark":
        """Set the default z-order hint for this mark.

        Within a single layer's render, marks are sorted by `(z_order, index)`
        before painting. Lower values paint first (further back). Mirrors
        JS `node.zOrder(n)`.

        For *relational* paint order ("this above that"), use
        `Constraint.z_above(a, b)` / `Constraint.z_below(a, b)` inside the
        enclosing layer's `.relate(...)` instead.

        Returns:
            New Mark (same subclass as self) with the z-order set.
        """
        new_mark = type(self)(
            self.mark_type, _children=self._children, **self.kwargs
        )
        self._copy_meta(new_mark)
        new_mark._z_order = value
        return new_mark

    def translate(
        self,
        *,
        x: Optional[float] = None,
        y: Optional[float] = None,
    ) -> "Mark":
        """Translate this mark by literal pixels without consuming channels."""
        new_mark = type(self)(
            self.mark_type, _children=self._children, **self.kwargs
        )
        self._copy_meta(new_mark)
        new_mark._translate = {
            k: v for k, v in {"x": x, "y": y}.items() if v is not None
        }
        return new_mark

    def cut(
        self,
        *,
        dir: str,
        size: Optional[Union[str, List[Any]]] = None,
        inset: Optional[float] = None,
    ) -> "CutMark":
        """Slice this mark into N clipped sub-shapes along `dir` — the
        expand-mark form. Mirrors JS `image(...).cut({ dir, size, inset })`.

        Returns a `CutMark` (the `{type:"cut"}` IR node) with `self` as the
        source. See the module-level `cut(...)` for the `size` semantics.
        """
        return CutMark("cut", source=self, dir=dir, size=size, inset=inset)

    def label(
        self, accessor: Union[str, "FieldAccessor"], **options: Any
    ) -> "Mark":
        """
        Attach a label to this mark. Calling `.label()` more than once
        appends — each call adds its own label (e.g. a value centered
        inside a bar plus a category name above it).

        Args:
            accessor: Field name to use as label text (must be constant
                across the datum's rows when the datum is a group of rows —
                true by construction for a `by` field; raises otherwise), or
                a `field(...)` aggregate (`field("count").sum()`, etc.)
                folding the group's rows to one value.
            **options: Label options (``position``, ``font_size``, ``color``,
                ...): see the generated ``_label_opts`` or the docs options
                table. An unknown option raises TypeError.

        Returns:
            New Mark (same subclass as self) with the label appended
        """
        new_mark = type(self)(
            self.mark_type, _children=self._children, **self.kwargs
        )
        self._copy_meta(new_mark)
        new_mark._labels = [*self._labels, _label_spec(accessor, options)]
        return new_mark

    def children(self) -> List[Any]:
        """The mark positions this mark holds: a combinator's children."""
        return self._children or []

    def to_dict(self, payload: "_Payload") -> dict:
        """The mark's IR, wherever it sits: the root, a mark position, a
        tier of a ``.layer(...)`` chain. ``payload`` collects what ships beside
        the IR (see ``_Payload``)."""
        # Each `_PendingAccessor` (at any depth) becomes its lambda-id
        # sentinel, and the payload records its callback.
        # A mark named inside an option (a blob's `avoiding`) is its IR.
        serialized_kwargs = _marks_in_options(
            _wire_options(self.kwargs, self._accessors, payload), payload
        )
        if self._children is not None:
            # Combinator form: emit a nested payload the JS side reconstructs
            # via the operator's `(opts, marks)` overload.
            d: dict = {
                "type": self.mark_type,
                "__combinator": True,
                "options": serialized_kwargs,
                "children": [child.to_dict(payload) for child in self._children],
            }
        else:
            d = {"type": self.mark_type, **serialized_kwargs}
        if self._name is not None:
            d["name"] = (
                self._name.to_dict()
                if isinstance(self._name, Token)
                else self._name
            )
        if self._labels:
            d["label"] = self._labels
        # Only RelatableMark carries _relate, but reading via getattr keeps
        # the base class oblivious to the subclass extension.
        relate = getattr(self, "_relate", None)
        if relate is not None:
            d["relate"] = [c.to_dict(payload) for c in relate]
        # `@mark`-decorated components flag their output Mark as a
        # scope boundary so the harness wraps the resolved node in
        # `node.scope()` — matches JS createMark's behavior.
        if self._is_scope:
            d["__scope"] = True
        # `bind_data()` pre-binds a datum + key for the
        # `rect({...})(d, key)` treemap-combinator invocation pattern.
        if self._datum_set:
            d["__datum"] = self._datum
            d["__key"] = self._key
        # `.zOrder(n)` — applied post-construction on the JS side.
        if self._z_order is not None:
            d["zOrder"] = self._z_order
        if self._translate:
            d["translate"] = self._translate
        return d

    def render(
        self,
        w: int = 800,
        h: int = 600,
        axes: Optional[Any] = None,
        legend: Optional[bool] = None,
        debug: bool = False,
    ):
        """
        Render this Mark directly (no Chart wrapper) — mirrors the JS storybook
        pattern `spread({...}, [marks]).render(container, {w, h})`.

        The options are the JS ``.render(container, options)`` options
        (``w``, ``h``, ``axes``, ``legend``, ``debug``); one left
        unset (``None``) takes its default.

        Returns a GoFishChartWidget; in a notebook this auto-displays.
        """
        return _render_widget(
            self, w=w, h=h, axes=axes, legend=legend, debug=debug
        )

    def save(
        self,
        path,
        w: int = 800,
        h: int = 600,
        axes: Optional[Any] = None,
        legend: Optional[bool] = None,
        debug: bool = False,
    ):
        """Save this mark's render to ``path`` (see ``ChartBuilder.save``)."""
        widget = self.render(
            w=w, h=h, axes=axes, legend=legend, debug=debug
        )
        widget.save(path)
        return widget

    def _repr_mimebundle_(self, include=None, exclude=None):
        """Auto-display in notebooks (see ChartBuilder._repr_mimebundle_)."""
        return self.render()._repr_mimebundle_(include=include, exclude=exclude)


class _InputRef(Mark):
    """A `GoFishRef` handed into a mark-fn lambda, reconstructed Python-side
    (issue #591).

    JS's `.flow(group(...)).mark((refs) => ...)` invokes the callback with an
    array of live `GoFishRef`s (one per group) — e.g. `d[0]` in
    `BarWithLabels.stories.tsx`'s label mark-fn, whose `.datum` is the group's
    row bag. A `GoFishRef` can't cross the derive RPC as-is (it's a class
    instance over the render's layer registry, not JSON), so the JS side
    (`serializeMarkFnInput` in `fromJSON.ts`/`main.ts`) replaces each ref
    argument with an `{"__inputRef": i, "datum": ...}` sentinel; the derive
    server wraps every such sentinel back into one of these before calling
    the user's function, so `d[0].datum` reads exactly like the JS story.

    `to_dict()` emits `{"type": "ref", "__inputRef": i}` — no `datum`, since
    the datum already made the trip once and the JS side round-trips the
    sentinel back to the *original* live ref object by index rather than
    reconstructing one from the (re-serialized) datum. This lets a mark-fn
    embed the ref directly in its returned layout (mirrors JS
    `spread({...}, [d[0], text(...)])`).

    `.name(...)` (issue #556 — a named ref surviving a mark-fn round trip, so
    an enclosing `.layer([...]).relate(...)` can target it by name, e.g.
    `Cut.stories.tsx::ImageCutWithLabels`'s `d.name("slice")`) is overridden
    rather than inherited from `Mark`: JS `GoFishRef.name()` MUTATES the ref
    in place and returns `this` (not a fresh copy — the ref's identity, not
    just its `_name`, is what the rest of the tree shares), so this mirrors
    that instead of `Mark.name()`'s clone-a-new-instance pattern (which would
    also fail here: `type(self)(self.mark_type, ...)` doesn't match
    `_InputRef.__init__`'s `(index, datum)` signature).
    """

    def __init__(self, index: int, datum: Any):
        super().__init__("ref")
        self.index = index
        self.datum = datum

    def name(self, name_or_token: Union[str, "Token"]) -> "_InputRef":
        self._name = name_or_token
        return self

    def to_dict(self, payload: "_Payload") -> dict:
        d: dict = {"type": "ref", "__inputRef": self.index}
        if self._name is not None:
            d["name"] = (
                self._name.to_dict()
                if isinstance(self._name, Token)
                else self._name
            )
        return d


# The generated factory layer (packages/gofish-python/gofish/_generated.py)
# imports `Mark` / `_channel` from this module, so it can only be imported
# here AFTER both are defined (circular import, resolved by Python's partial
# module semantics: `gofish._generated` reads these two names off the
# already-executing `gofish.ast` module object). See
# apps/docs/docs/internals/design/python-wrapper-codegen.md.
from ._generated import (  # noqa: E402
    rect,
    circle,
    ellipse,
    petal,
    text,
    image,
    polygon,
    blank,
    region,
    over,
    intersect,
    exclude,
    subtract,
    paint,
    mask,
    position,
    arrow,
    _spread_opts,
    _stack_opts,
    _scatter_opts,
    _group_opts,
    _table_opts,
    _treemap_opts,
    _treemap_combinator_opts,
    _spread_combinator_opts,
    _stack_combinator_opts,
    _pack_opts,
    _partition_opts,
    _line_opts,
    _ribbon_opts,
    _enclose_opts,
    _layer_opts,
    _chart_opts,
    _label_opts,
)


def _label_spec(accessor: Union[str, "FieldAccessor"], options: Dict[str, Any]) -> dict:
    """One `.label(accessor, **options)` call's wire entry, shared by
    `Mark.label` and `Operator.label`."""
    return {
        "accessor": dict(accessor) if isinstance(accessor, FieldAccessor) else accessor,
        **_label_opts(**options),
    }


# Low-level constraint surface — mirrors JS `Constraint.align` / `Constraint.distribute`
# from packages/gofish-graphics/src/ast/constraints/index.ts. Used only by the
# low-level `layer([marks]).relate(...)` combinator. The Python user authors
# constraints by name; the IR carries the names; the harness/widget rebuilds
# the JS-side ref objects from those names.


class RefSentinel(Mark):
    """Opaque handle for a named node inside a layer, passed to a `.relate()`
    callback.

    `layer([rect(...).name("a")]).relate(lambda a, b: [...])` receives one of
    these per callback parameter, carrying the parameter's name. As a
    constraint operand it serializes as the name; as a child of a drawing
    clause (`arrow([a, b])`) it serializes as `ref("a")`. JS resolves the
    name at layout, from the relating layer.
    """

    def __init__(self, ref_name: str):
        super().__init__("ref", selection=ref_name)

    @property
    def ref_name(self) -> str:
        """The name this operand stands for."""
        return self.kwargs["selection"]


def _subtree_names(children: List[Any]) -> List[str]:
    """Every string name (or token tag) inside `children`, at any depth: each
    node's mark positions (`children()`: a combinator's children, a nested
    chart's mark, a chain's tiers), not descending into `@mark` components (a
    component's own name still counts). The JS `visibleNodes` walk, over the
    Python tree."""
    out: List[str] = []
    for child in children:
        n = getattr(child, "_name", None)
        if n is not None:
            out.append(n.tag if isinstance(n, Token) else n)
        if not getattr(child, "_is_scope", False):
            out.extend(_subtree_names(child.children()))
    return out


def _callback_refs(
    callback: Callable[..., Any], children: List[Any]
) -> Dict[str, RefSentinel]:
    """The keyword arguments a `.relate()` callback receives: one
    `RefSentinel` per parameter it declares without a default, named after
    the parameter. A parameter with a default keeps it and gets no
    `RefSentinel`: that is the loop idiom `lambda a, b, gap=gap: [...]`,
    which binds a loop variable, not a node. A callback with a `**rest`
    catch-all also receives every other name inside the layer
    (`_subtree_names`), the same set the JS `relateEnv` holds, so it can
    look names up dynamically (`rest[key]`). JS resolves every name at
    layout, and a name that matches no node inside the layer is an error
    there."""
    params = list(inspect.signature(callback).parameters.values())
    named = (
        inspect.Parameter.POSITIONAL_OR_KEYWORD,
        inspect.Parameter.KEYWORD_ONLY,
    )
    declared = {p.name for p in params if p.kind in named}
    names = [
        p.name for p in params if p.kind in named and p.default is p.empty
    ]
    if any(p.kind == inspect.Parameter.VAR_KEYWORD for p in params):
        names += [n for n in _subtree_names(children) if n not in declared]
    return {name: RefSentinel(name) for name in names}


class AlignConstraint:
    """IR carrier for `Constraint.align(refs, x=..., y=...)`."""

    def __init__(self, refs: List[RefSentinel], options: Dict[str, Any]):
        self.refs = refs
        self.options = options

    def to_dict(self, payload: "_Payload") -> dict:
        return {
            "type": "align",
            "options": self.options,
            "refs": [r.ref_name for r in self.refs],
        }


class DistributeConstraint:
    """IR carrier for `Constraint.distribute(refs, dir=..., spacing=..., ...)`."""

    def __init__(self, refs: List[RefSentinel], options: Dict[str, Any]):
        self.refs = refs
        self.options = options

    def to_dict(self, payload: "_Payload") -> dict:
        return {
            "type": "distribute",
            "options": self.options,
            "refs": [r.ref_name for r in self.refs],
        }


class PositionConstraint:
    """IR carrier for `Constraint.position(refs, x=..., y=..., anchor=...)`.

    Unlike align/distribute (relative to siblings), `position` places the ref at
    an x/y coordinate — a literal pixel or a `datum(...)`. A datum is mapped to a
    pixel by the layer's position scale, which the layer derives from the datum
    coordinates of these constraints (its POSITION underlying space).
    """

    def __init__(self, refs: List[RefSentinel], options: Dict[str, Any]):
        self.refs = refs
        self.options = options

    def to_dict(self, payload: "_Payload") -> dict:
        return {
            "type": "position",
            "options": self.options,
            "refs": [r.ref_name for r in self.refs],
        }


class NestConstraint:
    """IR carrier for `Constraint.nest([outer, inner], x=..., y=...)`.

    A size-setting constraint: `outer = inner + 2*padding` holds per constrained
    axis (`outer = refs[0]`, `inner = refs[1]`), and `inner` is centered in
    `outer`. Which side is *derived* is resolved engine-side from which side
    carries the size — inside-out (`outer = inner + 2p`) when the inner is sized,
    outside-in / CSS padding (`inner = outer - 2p`) when the outer is sized — so
    the IR carries only the padding (`x` / `y`, in pixels).
    """

    def __init__(self, refs: List[RefSentinel], options: Dict[str, Any]):
        self.refs = refs
        self.options = options

    def to_dict(self, payload: "_Payload") -> dict:
        return {
            "type": "nest",
            "options": self.options,
            "refs": [r.ref_name for r in self.refs],
        }


class ZOrderConstraint:
    """IR carrier for `Constraint.zAbove(a, b)` / `Constraint.zBelow(a, b)`.

    Z-order constraints declare a partial-order relation between two named
    children of a layer. They do not affect position; the JS engine
    topologically sorts the layer's children to resolve the total paint
    order at render time.
    """

    def __init__(self, ctype: str, refs: List[RefSentinel]):
        # `ctype` is "zAbove" or "zBelow"; preserved as-is on the wire so the
        # JS widget dispatches to the matching `Constraint.zAbove/zBelow`.
        self.ctype = ctype
        self.refs = refs

    def to_dict(self, payload: "_Payload") -> dict:
        return {
            "type": self.ctype,
            "refs": [r.ref_name for r in self.refs],
        }


class Constraint:
    """Namespace for low-level constraint factories.

    Mirrors JS `Constraint.align` / `Constraint.distribute` /
    `Constraint.zAbove` / `Constraint.zBelow`. Method names are
    snake-cased Python-side (`z_above`, `z_below`); the wire-format
    discriminator (`"zAbove"` / `"zBelow"`) preserves the JS spelling.
    """

    @staticmethod
    def align(
        refs: List[RefSentinel],
        *,
        x: Optional[Union[str, List[str]]] = None,
        y: Optional[Union[str, List[str]]] = None,
    ) -> AlignConstraint:
        """Align the given refs on one or both axes.

        Args:
            refs: List of RefSentinels (typically the kwargs given to the
                relate callback).
            x: Optional `"start" | "middle" | "end" | "baseline"` — alignment
                on the x-axis. Also accepts the interval-statistic values
                `"span"` (the target adopts the source's position AND size)
                and `"size"` (the target adopts only the source's length,
                without moving) — see the docs page for the unbound-target
                scope these require. Pass a list of the same length as
                `refs` to assign one point anchor per child positionally
                (e.g. `["middle", "start"]` aligns the first child's center
                to the second child's start) — `"span"`/`"size"` cannot
                appear inside a list.
            y: Optional alignment on the y-axis. Same shape as `x`.

        At least one of `x` or `y` must be provided.
        """
        if x is None and y is None:
            raise ValueError("Constraint.align requires at least one of x, y")
        options: Dict[str, Any] = {}
        if x is not None:
            options["x"] = x
        if y is not None:
            options["y"] = y
        return AlignConstraint(refs, options)

    @staticmethod
    def distribute(
        refs: List[RefSentinel],
        *,
        dir: str,
        spacing: Optional[float] = None,
        anchor: Optional[str] = None,
        order: Optional[str] = None,
        glue: Optional[bool] = None,
    ) -> DistributeConstraint:
        """Distribute the given refs along an axis.

        Args:
            refs: List of RefSentinels.
            dir: "x" or "y" — required.
            spacing: Number of pixels between successive refs (default 8).
            anchor: "edge" (default) — edge-to-edge spacing between facing
                edges — or a fixed-pitch anchor point (`"start"`, `"middle"`,
                `"end"`, `"baseline"`) placed at
                `anchor[i+1] = anchor[i] + spacing`.
            order: "forward" (default) or "reverse" — distribute in reverse order.
            glue: Stack semantics — glue the refs together (their sizes sum
                into a position at the layer) instead of slicing a budget.
                Forces `spacing` to 0. Mirrors spread's `glue`.
        """
        options: Dict[str, Any] = {"dir": dir}
        if spacing is not None:
            options["spacing"] = spacing
        if anchor is not None:
            options["anchor"] = anchor
        if order is not None:
            options["order"] = order
        if glue is not None:
            options["glue"] = glue
        return DistributeConstraint(refs, options)

    @staticmethod
    def position(
        refs: List[RefSentinel],
        *,
        x: Optional[Any] = None,
        y: Optional[Any] = None,
        anchor: Optional[str] = None,
    ) -> PositionConstraint:
        """Place the given refs at an x and/or y coordinate.

        Mirrors positioning a shape (or the `position` operator): each of `x` /
        `y` is either a **literal** pixel coordinate or a **datum** (`datum(n)`)
        — a literal is placed as-is; a datum is mapped through the layer's
        position scale (which the layer infers from the datum coordinates of its
        `position` constraints). At least one of `x` / `y` is required.

        Args:
            refs: List of RefSentinels (typically one).
            x: Literal pixel or `datum(...)` coordinate on the x axis.
            y: Literal pixel or `datum(...)` coordinate on the y axis.
            anchor: "start" | "middle" | "end" — which anchor of the ref lands
                on the coordinate. Defaults to "middle" (the ref's center).
        """
        if x is None and y is None:
            raise ValueError(
                "Constraint.position requires at least one of x, y"
            )
        options: Dict[str, Any] = {}
        if x is not None:
            options["x"] = x
        if y is not None:
            options["y"] = y
        if anchor is not None:
            options["anchor"] = anchor
        return PositionConstraint(refs, options)

    @staticmethod
    def nest(
        refs: List[RefSentinel],
        *,
        x: Optional[float] = None,
        y: Optional[float] = None,
    ) -> NestConstraint:
        """Nest `inner` inside `outer` with per-axis padding.

        `refs` is exactly `[outer, inner]`. On each constrained axis the relation
        `outer = inner + 2*padding` holds and `inner` is centered in `outer`.
        Which side is *derived* is resolved engine-side from which side carries
        the size: inside-out (`outer = inner + 2p`, a box that shrink-wraps its
        content) when the inner is sized, outside-in (`inner = outer - 2p`, CSS
        padding) when the outer carries the size. An unspecified axis is left
        unconstrained.

        Args:
            refs: Exactly `[outer, inner]` — outer nests inner.
            x: Per-axis padding in pixels on the x axis (omit to leave x
                unconstrained).
            y: Per-axis padding in pixels on the y axis.

        At least one of `x` / `y` must be provided, and `refs` must have exactly
        two entries.
        """
        if x is None and y is None:
            raise ValueError(
                "Constraint.nest requires at least one of x, y"
            )
        if len(refs) != 2:
            raise ValueError(
                "Constraint.nest requires exactly 2 refs [outer, inner], "
                f"got {len(refs)}"
            )
        options: Dict[str, Any] = {}
        if x is not None:
            options["x"] = x
        if y is not None:
            options["y"] = y
        return NestConstraint(refs, options)

    @staticmethod
    def z_above(a: RefSentinel, b: RefSentinel) -> ZOrderConstraint:
        """`a` paints in front of `b` (on top in z).

        Declares a partial-order relation for paint order only — does not
        affect position. `z_below(a, b)` is equivalent to `z_above(b, a)`;
        both spellings are provided so the spec reads naturally either way.
        """
        return ZOrderConstraint("zAbove", [a, b])

    @staticmethod
    def z_below(a: RefSentinel, b: RefSentinel) -> ZOrderConstraint:
        """`a` paints behind `b` (under in z). See `Constraint.z_above`."""
        return ZOrderConstraint("zBelow", [a, b])


def _relate_clauses(result: Any) -> List[Any]:
    """Flatten a `.relate()` callback's result into its clauses, dropping
    `None` / `False` entries (so `cond and clause` works), as the JS side
    does. A clause is a constraint (`Constraint.align(...)`, ...) or a mark
    that draws (`arrow([a, b])`, `enclose([a, b])`, ...)."""
    if not isinstance(result, (list, tuple)):
        raise TypeError(
            ".relate(): the callback must return a list of clauses, got "
            f"{type(result).__name__}"
        )
    out: List[Any] = []

    def visit(c: Any) -> None:
        if isinstance(c, (list, tuple)):
            for x in c:
                visit(x)
        elif c is None or c is False:
            return
        elif isinstance(c, RefSentinel):
            raise TypeError(
                f'.relate(): a clause is a bare reference ("{c.ref_name}"). '
                "A reference draws nothing and places nothing on its own; use "
                "it as an operand of a constraint or as a child of a drawing "
                "clause, e.g. arrow([a, b])."
            )
        else:
            out.append(c)

    visit(result)
    return out


class RelatableMark(Mark):
    """A combinator-form Mark returned by `layer(...)`.

    Adds a `.relate(callback)` method that the spread combinator lacks.
    The callback receives one `RefSentinel` per named child as a kwarg and
    returns a list of clauses: constraints (`Constraint.align(...)` /
    `.distribute(...)`) and marks that draw (`arrow([a, b])`).
    """

    def __init__(
        self,
        mark_type: str,
        _children: Optional[List["Mark"]] = None,
        **kwargs,
    ):
        super().__init__(mark_type, _children=_children, **kwargs)
        self._relate: Optional[List[Any]] = None

    def _copy_meta(self, target: "Mark") -> "Mark":
        super()._copy_meta(target)
        if isinstance(target, RelatableMark):
            target._relate = self._relate
        return target

    def relate(self, callback: Callable[..., List[Any]]) -> "RelatableMark":
        """Relate named nodes inside this layer.

        The callback receives one `RefSentinel` per parameter it declares
        without a default, named after the parameter (a parameter with a
        default, such as `gap=gap` in a loop, keeps its default; a `**rest`
        catch-all also receives every other name inside the layer), and must
        return a list of clauses. A clause is a constraint, which places its
        operands, or a mark that draws over them:

            layer([rect(...).name("a"), rect(...).name("b")]).relate(
                lambda a, b: [
                    Constraint.distribute([a, b], dir="x", spacing=60),
                    arrow([a, b], stroke="#1a5683"),
                ]
            )

        A drawing clause is laid out after the constraints that place the
        nodes it reads, so the arrow above runs between the final positions.

        Names are resolved on the JS side, at layout, by the same lookup
        `ref("name")` uses: start at this layer, and take the closest node
        with the name, never crossing a `@mark` boundary. So a parameter can
        name a node nested anywhere inside the layer, and a direct child
        beats a deeper node with the same name. A name that matches no node
        inside the layer, or two nodes at the same smallest distance, is an
        error at render time. Mirrors `GoFishNode.relate` and the JS
        `relateEnv` in `packages/gofish-graphics/src/ast/constraints/index.ts`.
        """
        if self._children is None:
            raise ValueError(
                ".relate() requires combinator children — use "
                "`layer([...]).relate(...)`"
            )

        clauses = _relate_clauses(
            callback(**_callback_refs(callback, self._children))
        )
        new_mark = type(self)(
            self.mark_type, _children=self._children, **self.kwargs
        )
        self._copy_meta(new_mark)
        new_mark._relate = clauses
        return new_mark


# Sentinel chart-data for an empty `chart()` scope: its rows are the enclosing
# scope's. It crosses as `{"type": "previous-tier"}` (see
# `ChartBuilder.to_dict`), and JS binds it: in a `.layer(...)` chain to the
# previous tier's marks, in a mark position to the rows of the partition the
# chart sits in.
_PREVIOUS_LAYER_MARKS = object()


class ChartBuilder(_Root):
    """Builder class for creating GoFish charts."""

    def __init__(
        self,
        data: Any,
        options: Optional[dict] = None,
        operators: Optional[List[Operator]] = None,
        z_order: Optional[float] = None,
    ):
        """
        Initialize a ChartBuilder.

        Args:
            data: Input data, or a `_RefProxy` (`ref(name)` /
                `select_all(name)`) for cross-chart references
            options: Chart options (w, h, coord, color, etc.)
            operators: List of operators to apply
        """
        self.data = data
        self.options = options or {}
        self.operators: List[Operator] = operators or []
        self._mark: Optional[Mark] = None
        self._z_order = z_order
        self._name: Optional[Union[str, "Token"]] = None

    def flow(self, *ops: Union[Operator, Composed]) -> "ChartBuilder":
        """
        Add operators to the flow pipeline.

        Args:
            *ops: One or more operators (spread, stack, derive, etc.) or
                ``compose(...)`` fragments, which expand into their operators

        Returns:
            New ChartBuilder with operators added
        """
        return ChartBuilder(
            self.data,
            self.options,
            operators=[
                *self.operators,
                *(o for op in ops for o in _expand_composed(op)),
            ],
            z_order=self._z_order,
        )

    def mark(self, mark) -> "ChartBuilder":
        """
        Set the mark for the chart.

        Args:
            mark: A mark, a chart or a layer: a `Mark` (rect/circle/line/...,
                or a ``layer([...])`` of marks and charts), a nested
                `ChartBuilder`, or a ``chart(...).layer(...)`` chain (a
                `LayerBuilder`). An empty-scope chart (``chart()`` /
                ``chart(coord=...)``), or a chain whose first tier is one,
                binds the rows of the partition it sits in, wherever it sits.
                A callable `(data) -> mark | chart` receives the per-group
                data slice and returns what to draw for it, calling back into
                Python.

        Returns:
            New ChartBuilder with mark set
        """
        new_builder = ChartBuilder(
            self.data, self.options, self.operators, z_order=self._z_order
        )
        new_builder._mark = _as_mark(mark)
        return new_builder

    def layer(self, child: Any) -> "LayerBuilder":
        """Stack another tier over this one. A tier is a mark position: it
        holds a ``chart(...)`` pipeline, a chain, a mark, or a mark function
        ``(data) -> mark | chart``, which gets the previous tier's marks.
        ``child`` is often its own ``chart(...)``
        pipeline; an empty ``chart()`` scope (no data) inherits *this* tier's
        marks (so ``.layer(chart().flow(group(by=...)).mark(ribbon()))`` connects
        what you just drew), while ``chart(table)`` drives the tier from another
        dataset (resolve back into the chart with
        ``resolve(..., from_=select_all(...))``). Returns a ``LayerBuilder`` so
        tiers keep chaining: ``.layer(a).layer(b)``. Mirrors the JS ``.layer()``.

        The auto-naming/``selectAll`` wiring for an empty-scope ``child`` is
        NOT resolved here — each tier is emitted as authored (see
        ``_PREVIOUS_LAYER_MARKS``) and JS's real ``LayerBuilder`` derives it,
        the same as a native ``chart(...).layer(...)`` chain.
        """
        return LayerBuilder([self, child])

    def _uses_previous_marks(self) -> bool:
        """True for an empty ``chart()`` scope (data defers to the prev tier)."""
        return self.data is _PREVIOUS_LAYER_MARKS

    def name(self, name_or_token: Union[str, "Token"]) -> "ChartBuilder":
        """Tag this chart with a name so a `layer([...]).relate(...)` callback
        can reference it (mirrors JS `chart.resolve().name(...)`).

        Args:
            name_or_token: A flat string name, or a `Token` from `create_name(...)`.

        Returns:
            New ChartBuilder carrying the name.
        """
        new_builder = ChartBuilder(
            self.data, self.options, self.operators, z_order=self._z_order
        )
        new_builder._mark = self._mark
        new_builder._name = name_or_token
        return new_builder

    def z_order(self, value: float) -> "ChartBuilder":
        """Set z-order for this chart when rendered inside a Layer. Mirrors
        JS ``chart(...).zOrder(n)``."""
        new_builder = ChartBuilder(
            self.data, self.options, self.operators, z_order=value
        )
        new_builder._mark = self._mark
        new_builder._name = self._name
        return new_builder

    def facet(self, *, by: str, **kwargs: Any) -> "ChartBuilder":
        """
        Convenience method: spread data by `by` (shortcut for .flow(spread(by=..., ...))).

        Args:
            by: Field name to facet by
            **kwargs: Options passed to spread() (must include dir)

        Returns:
            New ChartBuilder with spread operator added
        """
        return self.flow(spread(by=by, **kwargs))

    def stack(self, *, by: str, **kwargs: Any) -> "ChartBuilder":
        """
        Convenience method: stack data by `by` (shortcut for .flow(stack(by=..., ...))).

        Args:
            by: Field name to stack by
            **kwargs: Options passed to stack() (must include dir)

        Returns:
            New ChartBuilder with stack operator added
        """
        return self.flow(stack(by=by, **kwargs))

    def children(self) -> List[Any]:
        """The mark position this chart holds: its mark, once it has one."""
        return [] if self._mark is None else [self._mark]

    def to_dict(self, payload: "_Payload") -> dict:
        """The chart's ``ChartIR``, wherever it sits: the root, a mark
        position (``.mark(chart(...))``, a ``layer([...])`` child), a tier of
        a ``.layer(...)`` chain. Its data is one of three: an empty
        ``chart()`` scope crosses as ``previous-tier`` data, which JS binds to
        the rows of the enclosing scope; a ``ref`` / ``select_all`` as a
        selection; and rows of its own as a table, ``{"type": "table", "id"}``,
        whose rows ``payload`` collects to ship beside the IR, as it does the
        callbacks the chart names."""
        if self._mark is None:
            raise ValueError("Chart must have a mark before converting to IR")

        # Serialize data: a `_RefProxy` used as chart data (`ref(name)` or
        # `select_all(name)`) becomes a select spec; an empty `chart()` scope
        # becomes `{"type": "previous-tier"}` (inside a `.layer(...)` chain,
        # JS's `LayerBuilder.wireTiers()` derives the auto-name/selectAll
        # wiring from this marker — see `_PREVIOUS_LAYER_MARKS`); anything
        # else is rows, a table. The select wire shape is `SelectRefIR`
        # (`_select_ref`).
        if self._uses_previous_marks():
            data_ir: Any = {"type": "previous-tier"}
        elif isinstance(self.data, _RefProxy):
            data_ir = _select_ref(self.data)
        else:
            data_ir = payload.table(self.data)

        mark_ir = self._mark.to_dict(payload)

        # Build the IR conditionally: omit optional fields that are unset
        # so the canonical schema's `zOrder: number` (no null) matches
        # what we emit, and consumers don't see spurious `null`s.
        result: dict = {
            "type": "chart",
            "data": data_ir,
            "operators": [op.to_dict(payload) for op in self.operators],
            "mark": mark_ir,
            "options": self.options,
        }
        if self._z_order is not None:
            result["zOrder"] = self._z_order
        # `.name(...)` lets a `layer([...]).relate(...)` callback refer to
        # this chart; JS names the resolved tier with it.
        if self._name is not None:
            result["name"] = (
                self._name.to_dict()
                if isinstance(self._name, Token)
                else self._name
            )
        return result

    def render(
        self,
        w: int = 800,
        h: int = 600,
        axes: Optional[Any] = None,
        legend: Optional[bool] = None,
        debug: bool = False,
    ):
        """
        Render the chart as an anywidget for Jupyter notebooks.

        The options are the JS ``.render(container, options)`` options.

        Args:
            w: Width of the whole graphic in pixels, axes and legend included
            h: Height of the whole graphic in pixels, axes and legend included
            axes: Draw axes (the JS render option ``axes``). Leave unset to
                use the chart's own ``axes`` option.
            legend: Draw the color legend (the JS render option ``legend``).
                Leave unset for the default; a ``chart()`` ``legend`` option
                wins over this one.
            debug: Whether to enable debug mode

        Returns:
            GoFishChartWidget instance that will display in Jupyter

        Note:
            ``axes`` can be given to ``chart(data, ...)`` or here, as in
            JS. See ``chart`` for the full ``axes`` shape.

        Example:
            >>> data = [{"x": 1, "y": 2}]
            >>> chart(data, axes=True).mark(rect(h="y")).render()
            >>> chart(data).mark(rect(h="y")).render(w=500, h=300)
        """
        if self._mark is None:
            raise ValueError("Chart must have a mark before rendering")
        return _render_widget(
            self, w=w, h=h, axes=axes, legend=legend, debug=debug
        )

    def save(
        self,
        path,
        w: int = 800,
        h: int = 600,
        axes: Optional[Any] = None,
        legend: Optional[bool] = None,
        debug: bool = False,
    ):
        """Save the rendered chart to ``path`` (format inferred from the
        extension — ``.svg`` today; PNG/HTML tracked in #578).

        The SVG is produced by the notebook front-end, so this returns a widget
        that writes the file *once it renders*. Make it the last expression in a
        cell (or otherwise display it) so the render — and the write — happen.
        Truly synchronous, headless export is tracked in #577.

        Example:
            >>> chart(data).mark(rect(h="y")).save("chart.svg")
        """
        widget = self.render(
            w=w, h=h, axes=axes, legend=legend, debug=debug
        )
        widget.save(path)
        return widget

    def _repr_mimebundle_(self, include=None, exclude=None):
        """Auto-display in notebooks.

        When a ChartBuilder is the last expression in a Jupyter / marimo
        cell, the runtime calls this and inlines the widget's mimebundle.
        Use ``.render(w=..., h=...)`` for explicit sizing.
        """
        if self._mark is None:
            raise ValueError("Chart must have a mark before display")
        return self.render()._repr_mimebundle_(include=include, exclude=exclude)


# Operator factory functions


def spread(
    children: Optional[List["Mark"]] = None,
    *,
    by: Optional[Union[str, "FieldAccessor"]] = None,
    **options: Any,
) -> Union[Operator, "Mark"]:
    """
    Spread — polymorphic.

    Operator form (no positional arg): partitions data by `by` (or iterates
    per-item when omitted) and lays children out along an axis. Used inside
    `.flow(...)`.

        spread(by="category", dir="x", spacing=24)

    Combinator form (positional list of marks): returns a low-level Mark
    that lays the given child marks out along an axis. Used inside `.mark()`
    when you want explicit nested marks instead of repeating a single mark
    across data.

        spread([rect(h="A"), rect(h="B")], dir="x", spacing=0)

    Args:
        children: When provided, switches to combinator form. List of child
            Marks to lay out side-by-side.
        by: Field name to partition by (operator form only), or a
            ``field(...)`` accessor carrying domain ops
            (``field("site").sort("yield")``). Omit for per-item spread.
        **options: The generated ``_spread_opts`` core's options (the
            combinator form's: ``_spread_combinator_opts``); see the docs
            options table. ``dir`` is required. ``size=field("count").normalize()``
            makes the stack axis a space-filling spine (the mosaic/marimekko
            conditional axis).

    Returns:
        Operator (no children) or Mark (with children).
    """
    if "dir" not in options:
        raise ValueError(
            "spread() requires 'dir' option ('x', 'y', or an axis name the "
            "enclosing coordinate space declares)"
        )
    if children is not None:
        if by is not None:
            raise ValueError(
                "spread() combinator form (with children) does not accept "
                "`by` — the layout is over the explicit child list, not data."
            )
        return Mark(
            "spread",
            _children=list(children),
            **_spread_combinator_opts(**options),
        )
    if by is not None:
        options["by"] = by
    return Operator("spread", **_spread_opts(**options))


def layer(
    children: List[Any],
    **options: Any,
) -> "RelatableMark":
    """Layer marks or charts: the ``layer`` combinator mark over its children.

    A child is anything a mark position holds: a mark, a nested
    ``chart(...)``, a ``.layer(...)`` chain, or another ``layer([...])``. The
    layer renders directly (``.render(...)``) or sits in a mark position, and
    ``.relate(...)`` adds clauses that relate the names inside it::

        layer([
            rect(w=80, h=40).name("a"),
            rect(w=120, h=60).name("b"),
        ]).relate(lambda a, b: [Constraint.align([a, b], x="end")])

    The options are the JS ``layer(options, children)`` options (box dims,
    ``coord``, ``axes``, ``transform``, ``box``, ``key``), as keyword
    arguments: ``layer([chart1, chart2], coord=Coord.clock())``. Render
    options such as ``legend`` go to ``.render(...)``, as in JS.

    Mirrors the JS ``layer([...])`` combinator, which is likewise universal
    over charts and marks.
    """
    return RelatableMark(
        "layer", _children=list(children), **_layer_opts(**options)
    )


# Attribute names reserved on `_RefProxy` so they pass through normal
# Python lookup (Mark fields + methods) rather than being treated as
# selection-path segments. Hits `__getattr__` ONLY when normal lookup
# fails, so this is mostly defensive — but explicit guards make the
# failure mode loud if a child happens to be named e.g. "kwargs".
_REF_PROXY_RESERVED = frozenset({
    "mark_type", "kwargs", "_name", "_labels", "_children", "_is_scope",
    "name", "label", "to_dict", "to_ir", "render", "_copy_meta",
    "_repr_mimebundle_", "relate", "multiplicity",
})


class _RefProxy(Mark):
    """Chainable reference. Property access (`.foo`, `[2]`) extends the
    selection path; `.path(*segs)` is the variadic-segments escape hatch.

    Mirrors JS `RefProxy` (`packages/gofish-graphics/src/ast/shapes/ref.tsx:60`):
    `ref(token).variables[i].value` accumulates a selection array that
    the harness/widget reconstructs by calling JS `ref([token, "variables", i, "value"])`.
    """

    def __init__(self, selection: list, multiplicity: Optional[str] = None):
        super().__init__("ref", selection=list(selection))
        # None means singular (`ref(name)`); "all" means the plural
        # `select_all(name)` — one ref per matching node. Only meaningful when
        # the proxy is used as chart data; a ref in a mark position is one
        # node.
        self.multiplicity = multiplicity

    def _sel(self) -> list:
        return self.kwargs["selection"]

    def __getattr__(self, name: str):
        # `__getattr__` only fires when normal lookup fails — Mark's own
        # fields/methods take precedence. Guard against private dunders
        # and the explicit reserved set so we don't shadow internals.
        if name.startswith("_") or name in _REF_PROXY_RESERVED:
            raise AttributeError(name)
        if name == "path":
            return lambda *segs: _RefProxy(self._sel() + list(segs))
        return _RefProxy(self._sel() + [name])

    def __getitem__(self, idx):
        return _RefProxy(self._sel() + [idx])

    def translate(self, x: Optional[float] = None, y: Optional[float] = None) -> "_RefProxy":
        translated = _RefProxy(self._sel(), multiplicity=self.multiplicity)
        self._copy_meta(translated)
        translated._translate = {k: v for k, v in {"x": x, "y": y}.items() if v is not None}
        return translated

    def name(self, name_or_token: Union[str, "Token"]) -> "_RefProxy":
        # Override Mark.name(): the base implementation reconstructs via
        # `type(self)(mark_type, _children=..., **kwargs)`, which assumes
        # the standard Mark constructor shape — `_RefProxy.__init__` takes
        # `(selection, multiplicity=None)` instead, so that reconstruction
        # raises. Mirrors the `translate()` override immediately above and
        # JS `RefProxy`'s inherited `Node.name()` (`_node.ts`), which just
        # sets `_name` and returns `this`. Lets `ref(token).name("a")`
        # re-expose a node from outside a layer as a named constraint
        # operand of that layer (e.g. the tick/label helpers in
        # `tests/python-stories/bluefish/test_dfscq_file_system.py`).
        named = _RefProxy(self._sel(), multiplicity=self.multiplicity)
        self._copy_meta(named)
        named._name = name_or_token
        return named

    def to_dict(self, payload: "_Payload") -> dict:
        # `select_all(...)` is a plural chart-data selector, so it has no
        # meaning in a mark position. As chart data it is written by
        # `ChartBuilder.to_dict`, not here.
        if self.multiplicity == "all":
            raise ValueError(
                "select_all(...) cannot be used inline in a layout; pass it "
                'as chart data: chart(select_all("name"))'
            )
        # Serialize each selection segment: tokens become sentinel dicts;
        # primitives pass through unchanged.
        serialized = [
            seg.to_dict() if isinstance(seg, Token) else seg
            for seg in self._sel()
        ]
        # Single-string selection stays in the "scalar" shape the JS
        # `ref(stringName)` path expects — preserves byte-parity for
        # existing flat-name callsites (e.g. the Planets stories).
        if len(serialized) == 1 and isinstance(serialized[0], str):
            d = {"type": "ref", "selection": serialized[0]}
        else:
            d = {"type": "ref", "selection": serialized}
        # A named ref stand-in (`ref(token).name("a")`) must carry its
        # name on the wire so the reconstructed GoFishRef answers to it as
        # a constraint operand of the enclosing layer (RefMarkIR
        # declares `name`; same emission shape as Mark.to_dict above).
        if self._name is not None:
            d["name"] = (
                self._name.to_dict()
                if isinstance(self._name, Token)
                else self._name
            )
        if self._translate:
            d["translate"] = self._translate
        return d


def ref(target: Union[str, Token]) -> _RefProxy:
    """
    Reference a previously-named node by selection.

    - `ref("name")` — flat string selection.
    - `ref(token)` — Token returned by `create_name(...)`. Subsequent
      `.attr` / `[i]` / `.path(...)` calls extend the selection.

    Two roles, both spelled `ref(...)`:

    - **Inline in a layout**: as a child of a combinator
      (spread/layer/arrow) to insert an already-named-and-resolved node.
    - **As chart data**: `chart(ref("bars"))` borrows the single node named
      "bars" from a sibling chart (requires exactly one match). The plural
      counterpart is `select_all("bars")`.

    Mirrors JS `ref(...)` (`packages/gofish-graphics/src/ast/shapes/ref.tsx:86`).
    """
    return _RefProxy([target])


# `arrow` and the region-compositing quartet (Porter-Duff-style
# inside/xor/out/atop, renamed intersect/exclude/subtract/paint per #196/#202,
# plus `over`/`mask`) are generated (packages/gofish-python/gofish/_generated.py)
# — pure kwargs-collection + the `pyName` rename table, imported above. Wire
# `type` strings stay the OLD Porter-Duff spellings ("inside"/"xor"/"out"/
# "atop") per the descriptor's `pyName` — the IR serializer never renamed them
# (FACTORIES in packages/gofish-graphics/src/serialize/registry.ts is still
# keyed by the old wire types).


def stack(
    children: Optional[List["Mark"]] = None,
    *,
    by: Optional[Union[str, "FieldAccessor"]] = None,
    **options: Any,
) -> Union[Operator, "Mark"]:
    """
    Stack — polymorphic. Like spread with no spacing between children.

    Operator form (no positional arg): partitions data by `by` (or iterates
    per-item when omitted) and stacks children along an axis. Used inside
    `.flow(...)`.

        stack(by="category", dir="y")

    Combinator form (positional list of marks): returns a low-level Mark
    that stacks the given child marks along an axis. Used inside `.mark()`
    when you want explicit nested marks instead of repeating a single mark
    across data. Mirrors the JS `stackX`/`stackY` operators.

        stack([rect(h="A"), rect(h="B")], dir="y")

    Args:
        children: When provided, switches to combinator form. List of child
            Marks to stack.
        by: Field name to partition by (operator form only), or a
            ``field(...)`` accessor carrying domain ops
            (``field("site").sort("yield")``). Omit for per-item stack.
        **options: The generated ``_stack_opts`` core's options (the
            combinator form's: ``_stack_combinator_opts``); see the docs
            options table. ``dir`` is required. ``size=field("count").normalize()``
            makes the stack axis a space-filling spine (the mosaic/marimekko
            conditional axis).

    Returns:
        Operator (no children) or Mark (with children).
    """
    if "dir" not in options:
        raise ValueError(
            "stack() requires 'dir' option ('x', 'y', or an axis name the "
            "enclosing coordinate space declares)"
        )
    if children is not None:
        if by is not None:
            raise ValueError(
                "stack() combinator form (with children) does not accept "
                "`by` — the layout is over the explicit child list, not data."
            )
        return Mark(
            "stack",
            _children=list(children),
            **_stack_combinator_opts(**options),
        )
    if by is not None:
        options["by"] = by
    return Operator("stack", **_stack_opts(**options))


def derive(fn: Callable, *, schema: Optional[dict] = None) -> DeriveOperator:
    """
    Derive operator - apply a Python function to transform data.

    Args:
        fn: Function that takes the list of rows and returns the new list of
            rows (a list of dicts, ``None``, or a dataframe). It returns a
            list even for one row: ``lambda d: [d[0]]``, not ``d[0]``.
        schema: Column types of the result, keyed by column name, as in
            ``chart(data, schema={...})``: ``Schema.ordered(levels)`` or
            ``Schema.time(zone=...)``. Without it, a result column keeps the
            type it had in the input while its values still fit it, a
            datetime column is a time, and any other column has no type. A
            ``schema`` entry overrides those and converts the column's
            values, as a chart's schema does.

    Returns:
        DeriveOperator object
    """
    return DeriveOperator(fn, schema)


def group(*, by: Union[str, "FieldAccessor"], **options: Any) -> Operator:
    """
    Group operator — partition data by `by`, wrap each group in a frame.

    Args:
        by: Field name to group by, or a ``field(...)`` accessor carrying
            domain ops (``field("site").sort("yield")``).

    Returns:
        Operator object
    """
    options["by"] = by
    return Operator("group", **_group_opts(**options))


def partition(
    *,
    by: Union["FieldAccessor", Dict[str, "FieldAccessor"], "StructAccessor"],
    dir: Optional[str] = None,
    **options: Any,
) -> Union[Operator, Composed]:
    """
    Partition operator: divide the space into the cells of a binned key, one
    group per cell, and give each group its cell. Each cell sits at its true
    place on one continuous scale, so a cell's width follows its width in data
    (a 29-day February is narrower than a 31-day March), and an empty cell
    keeps its place. A mark with no size of its own fills its cell, and a mark
    with a size of its own is centered in it.

        chart(daily, schema={"date": Schema.time()}).flow(
            partition(by=field("date").bin(Calendar.month), dir="x")
        ).mark(rect(h=field("value").sum()))

    With one binned key per axis it divides both axes into rectangles. This is
    the partition on x, then the partition on y, and it returns those two
    partitions as one flow fragment (``compose``):

        chart(movies).flow(
            partition(by={
                "x": field("IMDB Rating").bin(Bin.step(0.5)),
                "y": field("Rotten Tomatoes Rating").bin(Bin.step(5)),
            })
        ).mark(region(fill=field("IMDB Rating").count()))

    With two fields binned together, ``struct(x=..., y=...).bin(...)``, it
    divides the plane into the polygon cells of a ``Bin`` call, hexagons or
    Voronoi cells:

        chart(airports).flow(
            partition(by=struct(x="longitude", y="latitude").bin(Bin.hex(radius=1)))
        ).mark(region(fill=field("longitude").count()))

    Args:
        by: A key that has a region: a binned field, ``field(x).bin(...)``,
            a dict of one per axis, ``{"x": ..., "y": ...}``, or a binned
            struct, ``struct(x=..., y=...).bin(...)``. A plain field, or a
            struct with no bin, has no region and is an error.
        dir: The axis to divide: ``"x"``, ``"y"``, or an axis name the
            enclosing coordinate space declares. Required with a single key,
            and not allowed with a key per axis.
        **options: The generated ``_partition_opts`` core's options; see
            the docs options table.

    Returns:
        Operator object, or for a key per axis the fragment of two
    """

    def check_key(key: Any) -> None:
        if not (
            isinstance(key, FieldAccessor)
            and any(op.get("op") == "bin" for op in key.get("ops", []))
        ):
            name = key["name"] if isinstance(key, FieldAccessor) else key
            raise ValueError(
                f"partition: `by` must be a key that has a region, such as "
                f'field("{name}").bin(Calendar.month) or '
                f'field("{name}").bin(Bin.step(1)). Each group is placed in its '
                f"cell, so the key must say what the cells are. To give each "
                f"value an equal slot instead, use spread(by=..., dir=...)."
            )

    if isinstance(by, StructAccessor):
        if not by.get("ops"):
            fields = by["fields"]
            raise ValueError(
                f"partition: `by` must be a key that has a region, and "
                f'struct(x="{fields["x"]}", y="{fields["y"]}") has none until '
                f"it is binned: add .bin(Bin.hex(radius=...)) or "
                f".bin(Bin.voronoi(seeds=...)), so each group is placed in its "
                f"cell."
            )
        if dir is not None or "alignment" in options:
            raise ValueError(
                "partition: a struct key divides both axes at once, so `dir` "
                "and `alignment` do not apply. Each child is placed in its "
                "cell."
            )
    elif isinstance(by, dict) and not isinstance(by, FieldAccessor):
        if sorted(by) != ["x", "y"]:
            raise ValueError(
                f"partition: a `by` keyed by axis takes exactly the keys x "
                f"and y, got {', '.join(by) or 'none'}. To divide one axis, "
                f"pass partition(by=field(f).bin(...), dir=...)."
            )
        if dir is not None or "alignment" in options:
            raise ValueError(
                "partition: a `by` keyed by axis divides both axes, so `dir` "
                "and `alignment` do not apply. Each child is placed in its "
                "cell."
            )
        check_key(by["x"])
        check_key(by["y"])
        return compose(
            partition(by=by["x"], dir="x", **options),
            partition(by=by["y"], dir="y", **options),
        )
    else:
        check_key(by)
        if dir is None:
            raise ValueError(
                'partition: `dir` names the axis to divide, e.g. '
                'partition(by=..., dir="x"). To divide both axes, key `by` '
                'by axis: partition(by={"x": ..., "y": ...}).'
            )
    options["by"] = by
    if dir is not None:
        options["dir"] = dir
    return Operator("partition", **_partition_opts(**options))


def resolve(cols: List[str], *, from_: Any, key: Optional[str] = None) -> Operator:
    """Resolve reference columns into the drawn nodes they name.

    For each row, the values in ``cols`` are matched against the keyed nodes of
    ``from_`` (a ``select_all(layer_name)``) and replaced in place with the
    matching node ref — a many-to-one dereference (no fan-out, grain preserved).
    Backs node-link edges and label anchoring; pair with ``.layer(chart(table))``
    and ``line(from_=..., to=...)``.

    Args:
        cols: Column names holding references to resolve in place.
        from_: ``select_all(layer_name)`` (or a layer-name string) whose nodes the
            columns are matched against.
        key: Optional match field; defaults to the field those nodes were grouped
            by (e.g. ``scatter(by="id")`` ⇒ match on ``id``).

    Returns:
        Operator object — IR ``{type: "resolve", cols, from, key?}``.
    """
    if isinstance(from_, _RefProxy):
        selection = from_._sel()
        if len(selection) != 1 or not isinstance(selection[0], str):
            raise ValueError('resolve(from_=...) must be select_all("layer_name")')
        from_name = selection[0]
    elif isinstance(from_, str):
        from_name = from_
    else:
        raise TypeError(
            'resolve(from_=...) expects select_all(name) or a layer-name string'
        )
    op_kwargs: Dict[str, Any] = {"cols": list(cols), "from": from_name}
    if key is not None:
        op_kwargs["key"] = key
    return Operator("resolve", **op_kwargs)


def join(right: Any, *, on: str) -> Operator:
    """One-to-many equi-join of the incoming rows against another table.

    For each incoming (left) row, every ``right`` row whose ``on`` value matches
    contributes one merged output row (``{**left, **right}``); incoming rows with
    no match drop out. This is the relational join of two data tables — SQL
    ``JOIN ... USING (on)``, pandas/polars ``left.merge(right, on=...)``, dplyr
    ``left_join(right, by = on)``.

    Unlike :func:`resolve` (which dereferences columns into drawn nodes of a
    prior layer), ``join`` relates two plain tables, so ``right`` is inlined into
    the IR as JSON rows and round-trips without a bridge.

    Pairs with a nested chart that inherits its parent partition::

        chart(catch_locations).flow(scatter(by="lake", x="x", y="y")).mark(
            lambda data: chart(data, coord=Coord.clock())
            .flow(join(SEAFOOD, on="lake"), stack(by="species", dir="x", h=20))
            .mark(rect(w="count", fill="species"))
        )

    Args:
        right: The right-hand table — a list of row dicts, or any dataframe
            narwhals supports (pandas, polars, pyarrow, DuckDB relation, etc.).
        on: Shared key field matched between the incoming rows and ``right``.

    Returns:
        Operator object — IR ``{type: "join", on, right}``.
    """
    from .arrow_utils import to_records

    right_rows: List[Any] = to_records(right)
    return Operator("join", on=on, right=right_rows)


def scatter(
    *,
    by: Optional[Union[str, "FieldAccessor"]] = None,
    **options: Any,
) -> Operator:
    """
    Scatter operator — position children at per-group means (when `by` is
    given) or per-item (when omitted).

    Args:
        by: Field name to group by, or a ``field(...)`` accessor carrying
            domain ops (``field("site").sort("yield")``). Omit for per-item
            scatter.
        **options: The generated ``_scatter_opts`` core's options; see the
            docs options table. Give at least one of ``x``, ``y``,
            ``x_min``/``x_max``, ``y_min``/``y_max``, or ``dims`` (placement
            by axis name, e.g. ``dims={"theta": "bearing", "r": "distance"}``
            in polar).

    Returns:
        Operator object
    """
    if by is not None:
        options["by"] = by
    return Operator("scatter", **_scatter_opts(**options))


def treemap(
    children: Optional[List["Mark"]] = None,
    *,
    by: Optional[Union[str, "FieldAccessor"]] = None,
    **options: Any,
) -> Union[Operator, "Mark"]:
    """
    Treemap — polymorphic. Lays out children in weight-proportional rectangles.

    Operator form (no positional arg): partitions data by `by` (or iterates
    per-item when omitted). Used inside `.flow(...)`.

        treemap(by="genre", size="gross")

    Combinator form (positional list of marks): returns a low-level Mark that
    lays out the given pre-data-bound child marks (typically
    `rect(...).bind_data(d, key)`) by the per-leaf weight given as `size`, one
    value per child, in child order.

        treemap(
            [rect(fill=datum(genre)).bind_data({"worldwideGross": gross}, genre)
             for genre, gross in groups],
            size=[gross for genre, gross in groups],
            spacing=2,
        ).render(w=700, h=420)

    Args:
        children: When provided, switches to combinator form. List of child
            Marks to lay out.
        by: Field name to partition rows by (operator form only, like
            ``spread``/``group``), or a ``field(...)`` accessor carrying domain
            ops (``field("site").sort("yield")``, ``field("genre").drop_nulls()``).
            Without ``by``, one leaf is emitted per row.
        **options: The generated ``_treemap_opts`` core's options (the
            combinator form's: ``_treemap_combinator_opts``); see the docs
            options table. ``size`` sizes each leaf's tile area, one value
            per split entry. ``tile`` takes a strategy from the ``Tile``
            family: ``Tile.squarify()`` (the default), ``Tile.slice()``,
            ``Tile.dice()``, ``Tile.binary()``, or ``Tile.slice_dice()``.

    The largest tile (under the default sort) lands at the top left.

    Mirrors JS ``treemap({ by, size, tile, sort, spacing, ... })`` in
    ``.flow()`` and ``treemap({ size, ... }, marks)`` as a combinator.

    Returns:
        Operator (no children) or Mark (with children).
    """
    if children is not None:
        if by is not None:
            raise ValueError(
                "treemap() combinator form (with children) does not accept "
                "`by` — the layout is over the explicit child list, not data."
            )
        return Mark(
            "treemap",
            _children=list(children),
            **_treemap_combinator_opts(**options),
        )
    if by is not None:
        options["by"] = by
    return Operator("treemap", **_treemap_opts(**options))


def pack(
    children: Optional[List["Mark"]] = None,
    *,
    by: Optional[Union[str, "FieldAccessor"]] = None,
    **options: Any,
) -> Union[Operator, "Mark"]:
    """
    Pack — polymorphic. Places children so their enclosing circles touch
    without overlapping.

    Operator form (no positional arg): packs each group (or row, without
    ``by``). Used inside `.flow(...)`.

        chart(seafood).flow(pack(by="lake"), pack()).mark(circle(r=12))

    Combinator form (positional list of marks): returns a low-level Mark that
    packs the given child marks. A pack nested in a pack is packed by the
    circle around its own children.

        pack([circle(r=60), ellipse(w=90, h=44), pack([circle(r=26), circle(r=18)])])

    Children keep their pixel size, and the pack does not yet fit itself to
    the available space (#967).

    Args:
        children: When provided, switches to combinator form. List of child
            Marks to pack.
        by: Field name to group by, or a ``field(...)`` accessor (operator
            form only). Omit for one child per row.
        **options: The generated ``_pack_opts`` core's options; see the docs
            options table.

    Returns:
        Operator (no children) or Mark (with children).
    """
    if children is not None:
        if by is not None:
            raise ValueError(
                "pack() combinator form (with children) does not accept "
                "`by` — the layout is over the explicit child list, not data."
            )
        return Mark("pack", _children=list(children), **_pack_opts(**options))
    if by is not None:
        options["by"] = by
    return Operator("pack", **_pack_opts(**options))


def table(
    *,
    by: Optional[Dict[str, Union[str, "FieldAccessor"]]] = None,
    **options: Any,
) -> Operator:
    """
    Table operator — cross-product over two keys, lay out as a 2D grid.

    Args:
        by: Dict with `x` (the column key) and `y` (the row key). Each
            takes what ``spread``'s ``by`` takes: a field name or a
            ``field(...)`` key, e.g. ``table(by={"x": "model", "y": "year"})``
            or ``table(by={"x": field("date").bin(Calendar.week),
            "y": field("date").bin(Calendar.weekday)})``.
        **options: The generated ``_table_opts`` core's options; see the
            docs options table.

    Returns:
        Operator object
    """
    if by is not None:
        options["by"] = by
    return Operator("table", **_table_opts(**options))


def log(prefix: Optional[str] = None) -> Operator:
    """
    Log operator - logs data to the console for debugging.

    Args:
        prefix: Optional prefix to prepend to the log output

    Returns:
        Operator object
    """
    kwargs: Dict[str, Any] = {}
    if prefix is not None:
        kwargs["prefix"] = prefix
    return Operator("log", **kwargs)


# Column types


class ColumnSchema(dict):
    """A column type for ``chart(data, schema={...})``: the classes the
    column has, keyed by class name (the wire form JS reads as is).

    Mirrors JS ``ColumnSchema``. Build one with ``Schema.ordered(levels)``;
    each method adds one class. Constructing one checks that an order's
    levels fit the column's other classes (``_check_levels_fit``).
    """

    def __init__(self, *args: Any, **kwargs: Any) -> None:
        super().__init__(*args, **kwargs)
        _check_levels_fit("schema: the column", self)

    def diverging(self, midpoint: Optional[float] = None) -> "ColumnSchema":
        """Give the column a midpoint (``HasMidpoint``) along its order.

        ``midpoint`` is in edge coordinates over the order: 0 is the first
        level's leading edge, ``n`` is the last level's trailing edge (``n``
        levels), and 2.25 has two levels and a quarter of the third before it.
        The default is ``n / 2``: the middle of the middle level when ``n`` is
        odd, the boundary between the two middle levels when it is even. A
        stack over the column puts its 0 there.
        """
        if "HasOrder" not in self:
            raise ValueError(
                "HasMidpoint needs HasOrder: a midpoint is a point along an "
                "order. Declare the order with `Schema.ordered(levels)` before "
                "`.diverging()`."
            )
        levels = self["HasOrder"]["levels"]
        n = len(levels)
        at = n / 2 if midpoint is None else midpoint
        # The same two messages as JS `checkMidpointOnOrder` in schema.ts,
        # word for word.
        order = (
            "the edges of the order ["
            + ", ".join(_show_level(level) for level in levels)
            + "]"
        )
        if (
            isinstance(at, bool)
            or not isinstance(at, (int, float))
            or not math.isfinite(at)
        ):
            raise ValueError(
                f"diverging: midpoint must be a finite number from 0 to {n}, "
                f"{order}."
            )
        if not 0 <= at <= n:
            raise ValueError(
                f"diverging: midpoint {_js_number(at)} is outside 0..{n}, {order}."
            )
        return ColumnSchema({**self, "HasMidpoint": {"at": at}})

    def quantity(self, name: str) -> "ColumnSchema":
        """Say what the column's values are amounts of (``HasQuantity``): the
        quantity ``name``, which titles the axis in place of the column's
        name."""
        return ColumnSchema(
            {**self, "HasQuantity": {"name": _require_str(name, "name")}}
        )

    def unit(self, unit: str) -> "ColumnSchema":
        """Say what unit the column's values are in (``HasUnit``): the unit
        ``unit``, whose symbol follows the quantity in the axis title,
        "Pay (USD)". A column has one unit, so ``.unit`` on a column that has
        one (``Schema.time()`` writes the instant) raises a TypeError, with
        the message of JS ``checkNoUnit`` in schema.ts."""
        if "HasUnit" in self:
            raise TypeError(
                ".unit: the column already has the unit "
                f"{json.dumps(self['HasUnit']['unit'], ensure_ascii=False)}."
            )
        name = _require_str(unit, "unit")
        return ColumnSchema({**self, "HasUnit": {"unit": name, "symbol": name}})


def _require_str(value: Any, what: str) -> str:
    """``value``, checked to be a string; ``what`` names it in the message."""
    if not isinstance(value, str):
        raise TypeError(f"{what} must be a string, got {value!r}")
    return value


# The unit of a time column, which ``Schema.time()`` writes beside
# ``HasCalendar``: JS ``INSTANT`` in measure.ts.
_INSTANT = {"unit": "instant"}


def _is_number(v: Any) -> bool:
    return isinstance(v, (int, float)) and not isinstance(v, bool)


# Which values each class accepts, given the class's own record: JS
# ``ACCEPTS`` in schema.ts. A datetime is an instant.
_ACCEPTS: Dict[str, Callable[[Any, Any], bool]] = {
    "HasCalendar": lambda v, c: v is None
    or (_is_number(v) and math.isfinite(v))
    or isinstance(v, datetime.date),
    "HasOrder": lambda v, c: v is None or isinstance(v, str) or _is_number(v),
    "HasMidpoint": lambda v, c: True,
    "HasUnit": lambda v, c: v is None
    or _is_number(v)
    or (c.get("unit") == _INSTANT["unit"] and isinstance(v, datetime.date)),
    "HasQuantity": lambda v, c: True,
}


def _check_levels_fit(who: str, column_type: Dict[str, Any]) -> None:
    """Raise when one of an order's levels is not a value one of the
    column's classes accepts, with the message of JS ``checkLevelsFit`` in
    schema.ts, which explains the rule."""
    for level in column_type.get("HasOrder", {}).get("levels", []):
        for cls, accepts in _ACCEPTS.items():
            if cls in column_type and not accepts(level, column_type[cls]):
                raise TypeError(
                    f"{who} has the level {_show_level(level)}, which is not "
                    f"a value {cls} accepts."
                )


def _show_level(level: Any) -> str:
    """``level`` as JS ``showLevel`` in schema.ts writes it."""
    if isinstance(level, str):
        return json.dumps(level, ensure_ascii=False)
    return _js_number(level) if _is_number(level) else repr(level)


def _js_number(x: Union[int, float]) -> str:
    """``x`` as JS ``String(x)`` writes it (6.0 is "6", 1e-05 is "0.00001"),
    so an error message reads the same in both languages."""
    if isinstance(x, int):
        return str(x)
    if x.is_integer() and abs(x) < 1e21:
        return str(int(x))
    if 1e-7 <= abs(x) < 1e21:
        return format(decimal.Decimal(repr(x)), "f")
    return re.sub(r"e([+-])0*(\d)", r"e\1\2", repr(x))


class Schema:
    """Factories for column types, used in ``chart(data, schema={...})``.

    Mirrors JS ``Schema``::

        chart(survey, schema={"response": Schema.ordered(LEVELS).diverging()})
    """

    @staticmethod
    def ordered(levels: List[Any]) -> ColumnSchema:
        """A column whose values are ``levels``, in this order (``HasOrder``).

        Every ``by`` split over the column lays its groups out in this order,
        and a value outside the levels is an error.
        """
        return ColumnSchema({"HasOrder": {"levels": list(levels)}})

    @staticmethod
    def time(zone: str = "UTC") -> ColumnSchema:
        """A column whose values are instants (``HasCalendar``) in the
        instant unit (``HasUnit``), read on the calendar of ``zone``, an IANA
        time zone (``"UTC"`` by default).

        A value may be an ISO 8601 string (``"2024-03-05"`` is the start of
        that day in ``zone``; a string without an offset is a wall-clock time
        in ``zone``), a datetime, or epoch milliseconds. A pandas or polars
        datetime column is a time without a schema entry. An axis over the
        column labels its ticks with calendar cells (see ``Calendar``).
        """
        if not isinstance(zone, str):
            raise TypeError(
                f"Schema.time: zone must be an IANA time zone name, got {zone!r}"
            )
        return ColumnSchema(
            {"HasCalendar": {"zone": zone}, "HasUnit": dict(_INSTANT)}
        )

    @staticmethod
    def unit(unit: str) -> ColumnSchema:
        """A column whose values are amounts in the unit ``unit``
        (``HasUnit``), an opaque name such as ``"USD"`` or ``"mm"``.

        Columns in the same unit may share an axis; two different units on
        one axis are an error. A column with no unit declared may share an
        axis with any other. An axis title shows the unit after its
        quantity: "Pay (USD)".
        """
        return ColumnSchema({}).unit(unit)

    @staticmethod
    def quantity(name: str) -> ColumnSchema:
        """A column whose values are amounts of the quantity ``name``
        (``HasQuantity``), e.g. ``"Pay"``. The quantity titles the axis in
        place of the column's name, and columns of one quantity share one
        unit.
        """
        return ColumnSchema({}).quantity(name)


# Color helpers (the scales themselves are the `Color` family, color.py)


# Named gradient schemes, mirrored from packages/gofish-graphics/src/ast/colorSchemes.ts.
# Only the gradient-type schemes are needed here; assign_gradient_color() is the
# Python-side counterpart of assignGradientColor() for use inside a derive()
# callback, where the interpolated hex must be byte-identical to the JS one.
_GRADIENT_SCHEMES: Dict[str, List[str]] = {
    "viridis": ["#440154", "#31688e", "#35b779", "#fde725"],
    "blues": ["#f7fbff", "#deebf7", "#9ecae1", "#3182bd", "#08306b"],
    "reds": ["#fff5f0", "#fc9272", "#de2d26", "#67000d"],
}

# The color a gradient returns for a missing (NaN) position, as in colorSchemes.ts.
_MISSING_COLOR = "#cccccc"

# sRGB <-> CIE Lab (D65 white point) conversion as defined by CSS Color 4,
# transcribed from culori's `lab65` mode (culori/src/lrgb, xyz65, lab65) with
# the same constants and the same order of operations, so both sides compute
# the same IEEE-754 doubles.
_D65_X = 0.3127 / 0.329
_D65_Y = 1.0
_D65_Z = (1 - 0.3127 - 0.329) / 0.329
_LAB_K = 29.0**3 / 3.0**3
_LAB_E = 6.0**3 / 29.0**3

# JS `Math.cbrt`. `math.cbrt` only exists from Python 3.11; on 3.10 the `** (1/3)`
# fallback can differ from it in the last bit, which changes a hex channel only
# when a value lands within about 1e-13 of a rounding boundary.
_cbrt = getattr(math, "cbrt", lambda v: v ** (1.0 / 3.0))


def _hex_to_rgb(hex_color: str) -> tuple[float, float, float]:
    """Parse a `#rgb` / `#rrggbb` hex string into sRGB components in [0, 1]."""
    s = hex_color.lstrip("#")
    if len(s) == 3:
        s = "".join(ch * 2 for ch in s)
    return (int(s[0:2], 16) / 255, int(s[2:4], 16) / 255, int(s[4:6], 16) / 255)


def _srgb_to_linear(c: float) -> float:
    a = abs(c)
    if a <= 0.04045:
        return c / 12.92
    return (1.0 if c >= 0 else -1.0) * ((a + 0.055) / 1.055) ** 2.4


def _linear_to_srgb(c: float) -> float:
    a = abs(c)
    if a > 0.0031308:
        return (1.0 if c >= 0 else -1.0) * (1.055 * a ** (1 / 2.4) - 0.055)
    return c * 12.92


def _lab_f(v: float) -> float:
    return _cbrt(v) if v > _LAB_E else (_LAB_K * v + 16) / 116


def _lab_f_inv(v: float) -> float:
    return v**3 if v**3 > _LAB_E else (116 * v - 16) / _LAB_K


def _rgb_to_lab(r: float, g: float, b: float) -> tuple[float, float, float]:
    lr, lg, lb = _srgb_to_linear(r), _srgb_to_linear(g), _srgb_to_linear(b)
    x = 0.4123907992659593 * lr + 0.357584339383878 * lg + 0.1804807884018343 * lb
    y = 0.2126390058715102 * lr + 0.715168678767756 * lg + 0.0721923153607337 * lb
    z = 0.0193308187155918 * lr + 0.119194779794626 * lg + 0.9505321522496607 * lb
    f0 = _lab_f(x / _D65_X)
    f1 = _lab_f(y / _D65_Y)
    f2 = _lab_f(z / _D65_Z)
    lab_l = 116 * f1 - 16
    lab_a = 500 * (f0 - f1)
    lab_b = 200 * (f1 - f2)
    # A gray has no chroma; zero out the floating-point residue (as culori does).
    if r == b and b == g:
        lab_a = lab_b = 0.0
    return (lab_l, lab_a, lab_b)


def _lab_to_rgb(lab_l: float, lab_a: float, lab_b: float) -> tuple[float, float, float]:
    fy = (lab_l + 16) / 116
    fx = lab_a / 500 + fy
    fz = fy - lab_b / 200
    x = _lab_f_inv(fx) * _D65_X
    y = _lab_f_inv(fy) * _D65_Y
    z = _lab_f_inv(fz) * _D65_Z
    r = x * 3.2409699419045226 - y * 1.5373831775700939 - 0.4986107602930034 * z
    g = x * -0.9692436362808796 + y * 1.8759675015077204 + 0.0415550574071756 * z
    b = x * 0.0556300796969936 - y * 0.2039769588889765 + 1.0569715142428784 * z
    return (_linear_to_srgb(r), _linear_to_srgb(g), _linear_to_srgb(b))


def _to_8bit(v: float) -> int:
    """Clip an sRGB channel to [0, 1] and round it to 8 bits like JS `Math.round`."""
    v = 0.0 if v != v else max(0.0, min(1.0, v))
    scaled = v * 255
    floor = math.floor(scaled)
    return int(floor) + (1 if scaled - floor >= 0.5 else 0)


def _rgb_to_hex(r: float, g: float, b: float) -> str:
    return f"#{_to_8bit(r):02x}{_to_8bit(g):02x}{_to_8bit(b):02x}"


def _lab_mix_hex(hex1: str, hex2: str, t: float) -> str:
    """Mix two colors linearly in CIE Lab (D65) at `t` and return `#rrggbb`."""
    l0, a0, b0 = _rgb_to_lab(*_hex_to_rgb(hex1))
    l1, a1, b1 = _rgb_to_lab(*_hex_to_rgb(hex2))
    lab_l = l0 + t * (l1 - l0)
    lab_a = a0 + t * (a1 - a0)
    lab_b = b0 + t * (b1 - b0)
    return _rgb_to_hex(*_lab_to_rgb(lab_l, lab_a, lab_b))


def assign_gradient_color(gradient_config: dict, t: float) -> str:
    """
    Assign a gradient color by interpolating at position t in [0, 1].

    Python-side counterpart of `assignGradientColor` (colorSchemes.ts). Meant for
    use inside a `derive()` callback that needs to precompute a literal hex fill
    (a raw `fill` channel) rather than going through the JS-side `color:
    Color.gradient(...)` chart option. Gives the same hex as the JS function: evenly
    spaced stops mixed linearly in CIE Lab (D65 white point, CSS Color 4
    conversions), clipped to the sRGB gamut and rounded to 8 bits per channel.

    Args:
        gradient_config: A `Color.gradient(...)` config dict (`{"_tag": "gradient",
            "stops": ...}`). Stops are hex colors.
        t: Interpolation position in [0, 1] (values outside are clamped; NaN
            gives `#cccccc`).

    Returns:
        A lowercase `#rrggbb` hex color string.
    """
    stops = gradient_config["stops"]
    if isinstance(stops, str):
        scheme = _GRADIENT_SCHEMES.get(stops)
        if scheme is None:
            return stops
        colors = scheme
    else:
        colors = list(stops)

    if t != t:
        return _MISSING_COLOR

    if len(colors) == 1:
        colors = [colors[0], colors[0]]

    n = len(colors) - 1
    tt = max(0.0, min(1.0, t))

    for i in range(n):
        p0 = i / n
        p1 = (i + 1) / n
        if tt <= p0:
            return _rgb_to_hex(*_hex_to_rgb(colors[i]))
        if tt < p1:
            local_t = (tt - p0) / (p1 - p0)
            return _lab_mix_hex(colors[i], colors[i + 1], local_t)
    return _rgb_to_hex(*_hex_to_rgb(colors[n]))


# Layer selection


def select_all(layer_name: str) -> _RefProxy:
    """
    Select all named nodes from a sibling chart — one ref per matching node.

    The plural counterpart of passing `ref(name)` as chart data (which
    requires exactly one match). Used as the `chart(...)` data argument:
    `chart(select_all("bars"))`.

    Args:
        layer_name: Name of the layer to select (set via mark.name())

    Returns:
        `_RefProxy` carrying `multiplicity="all"`.
    """
    return _RefProxy([layer_name], multiplicity="all")


# Literal-value wrapper


class DatumValue(dict):
    """
    The `{type: "datum", ...}` wire shape, as a dict subclass so a datum
    supports pixel-offset arithmetic: `datum(v) + px` / `datum(v) - px`
    yield a new datum whose `offset` field carries the accumulated pixels.
    The JS side applies `offset` AFTER mapping the datum through its
    scale — "this data position, plus pixels" (e.g. an axis line seated a
    fixed standoff outside the plot edge). Mirrors `datum(v).offset(px)`
    in JS. Serializes like a plain dict (it is one), so it crosses the IR
    bridge unchanged.
    """

    def _with_offset(self, px):
        if isinstance(px, bool) or not isinstance(px, (int, float)):
            return NotImplemented
        out = DatumValue(self)
        out["offset"] = self.get("offset", 0) + px
        return out

    def __add__(self, px):  # datum(v) + 6
        return self._with_offset(px)

    def __radd__(self, px):  # 6 + datum(v)
        return self._with_offset(px)

    def __sub__(self, px):  # datum(v) - 6
        if isinstance(px, bool) or not isinstance(px, (int, float)):
            return NotImplemented
        return self._with_offset(-px)

    def offset(self, px):
        """Method form, for parity with JS ``datum(v).offset(px)``."""
        return self._with_offset(px)

    def _with_color_op(self, op, amount):
        if isinstance(amount, bool) or not isinstance(amount, (int, float)):
            raise TypeError("lighten/darken amount must be a number in 0..1")
        out = DatumValue(self)
        out["colorOps"] = list(self.get("colorOps", [])) + [
            {"op": op, "amount": amount}
        ]
        return out

    def lighten(self, amount):
        """A new datum whose resolved color is lightened by ``amount`` (0–1)
        toward white, applied AFTER the color scale maps the datum — the color
        analog of ``offset``. Mirrors JS ``datum(v).lighten(t)``. Chains with
        ``darken``."""
        return self._with_color_op("lighten", amount)

    def darken(self, amount):
        """A new datum whose resolved color is darkened by ``amount`` (0–1)
        toward black, applied AFTER the color scale maps the datum. Mirrors JS
        ``datum(v).darken(t)``. Chains with ``lighten``."""
        return self._with_color_op("darken", amount)


def datum(value: Any) -> DatumValue:
    """
    Wrap a value as an embedded data-space value (the per-row,
    scale-aware form). Mirrors the JS `datum(...)` constructor in
    `packages/gofish-graphics/src/ast/data.ts`.

    - `rect(fill=datum("Worldwide Gross"))` — use the row's
      `Worldwide Gross` column value as the literal fill color, skipping
      categorical-color encoding.
    - `image(h=datum(100))` — declare height 100 as an *embedded* size
      in data space. `inferEmbedded` (see `data.ts`) flips the
      interval's `embedded` flag, which changes how the layout system
      places the mark vs. a plain `h=100` (literal pixel value).
    - `datum(0) - 6` — a pixel offset from the data position: the value
      maps through its scale, then shifts 6px (see `DatumValue`).

    Emits the canonical `{type: "datum", datum: value}` shape directly;
    the widget consumes it without any unwrap step.

    Args:
        value: A field name string, a literal number, or any value to
            wrap.
    """
    return DatumValue({"type": "datum", "datum": value})


class FieldAccessor(dict):
    """
    The `{type: "field", name, ops?}` wire shape, as a dict
    subclass so `field(name)` supports the same chainable pipeline syntax as
    JS's `FieldExpr` (`ast/fieldExpr.ts`) — a Polars-column-expression-style
    builder where each method returns a NEW accessor with one more op
    appended (immutable, own dict so it survives `dict(self)` copies), and
    the wire form omits `ops` entirely when the pipeline is empty (matching
    JS `toJSON` byte-for-byte for parity). Order matters: `.bin().sort()`
    bins first, then sorts the resulting bins.

    Two disjoint slots consume the pipeline (see the JS module's docstring
    for the full contract — this class is a thin wire builder and does no
    evaluation-time validation; the JS side is the single evaluator, so an
    invalid op for a slot throws there, not here):

    - DOMAIN ops (`sort`/`reverse`/`bin`/`drop_nulls`) apply to a `by`
      grouping key, e.g. `spread(by=field("site").sort("yield"))`.
    - AGGREGATE ops (`sum`/`mean`/`count`/`distinct`) fold a value channel's
      rows to a single value, e.g. `rect(h=field("price").mean())`.
    - `normalize()` is valid only on an operator's (`spread`/`stack`)
      entry-flagged `size` channel — `size=field("count").normalize()` turns
      the stack axis into a space-filling spine (the mosaic/marimekko case).
    """

    def _with_op(self, op: dict) -> "FieldAccessor":
        out = FieldAccessor(self)
        out["ops"] = list(self.get("ops", [])) + [op]
        return out

    def sort(
        self,
        by: Optional[Union[str, List[Union[str, float]]]] = None,
        order: Optional[str] = None,
    ) -> "FieldAccessor":
        """Order groups by the SUM of `by` over each group's rows (ascending
        unless `order="desc"`), or by the group key itself when `by` is
        omitted. Valid only in a `by` (domain) slot.

        Pass a list instead of a field name for an explicit group order
        (#735), e.g. `field("weather").sort(["sun", "fog", "drizzle",
        "rain", "snow"])` — a domain-specific order that no aggregate
        expresses. Groups whose key isn't in the list are appended after,
        in natural sort order. Mutually exclusive with `order`.
        """
        if isinstance(by, list):
            return self._with_op({"op": "sort", "values": by})
        op: dict = {"op": "sort"}
        if by is not None:
            op["by"] = by
        if order is not None:
            op["order"] = order
        return self._with_op(op)

    def reverse(self) -> "FieldAccessor":
        """Reverse the group order. Valid only in a `by` (domain) slot."""
        return self._with_op({"op": "reverse"})

    def bin(
        self,
        partition: Optional[
            Union[Dict[str, Any], List[Dict[str, Any]]]
        ] = None,
    ) -> "FieldAccessor":
        """Map each value to its CELL. ``partition`` is:

        - a Calendar value. A level that is a part of a larger one gives its
          parts: ``field("date").bin(Calendar.month)`` is the month of the
          year, so all Junes are one cell, and every month is a cell. A level
          that is a part of nothing (``Calendar.year``, ``Calendar.week``)
          gives cells of the time line.
        - a product of Calendar values, a list:
          ``.bin([Calendar.year, Calendar.month])``, one cell where one cell
          of each level meet, each level a part of the one before it (the
          June of 2015, labeled "Jun 2015").
        - cells of one width (``.bin(Bin.step(0.5))``), or
          ``Bin.thresholds(...)``, a cell count or a list of edges
          (``.bin(Bin.thresholds(20))``). About 10 cells when none is given.

        A second ``.bin(...)`` splits each cell of the first, a chain:
        ``.bin(Calendar.year).bin(Calendar.month)`` gives the months of each
        year, and an axis over it shows a month level and a year level. The
        groups are the cells, in order, over the column's whole domain in the
        chart's data, so every group of a split sees the same cells, and
        empty cells are kept. Valid only in a `by` (domain) slot. Emits the
        wire op ``{"op": "bin", "partition": ...}``, one per ``.bin``."""
        op: dict = {"op": "bin"}
        if isinstance(partition, (list, tuple)):
            from ._generated import _OPTION_TYPES, _to_wire

            calendar = _OPTION_TYPES["Calendar"]
            if len(partition) < 2 or not all(
                isinstance(p, dict) and p.get("kind") in calendar[2]
                for p in partition
            ):
                raise TypeError(
                    "field(...).bin: a product of bins is a list of two or more "
                    "Calendar values, e.g. [Calendar.year, Calendar.month]; got "
                    f"{partition!r}."
                )
            op["partition"] = [
                _to_wire(calendar, p, f"field(...).bin[{i}]")
                for i, p in enumerate(partition)
            ]
        elif partition is not None:
            op["partition"] = _check_bin("field", partition, "field(...).bin")
        return self._with_op(op)

    def drop_nulls(self) -> "FieldAccessor":
        """Drop rows whose value at this field is `None`, BEFORE grouping —
        named after polars' `drop_nulls` (pandas `dropna`, tidyr
        `drop_na`). Valid only in a `by` (domain) slot. Emits the wire op
        `{"op": "dropNulls"}`."""
        return self._with_op({"op": "dropNulls"})

    def normalize(self) -> "FieldAccessor":
        """Space-filling normalization on an operator's (`spread`/`stack`)
        `size` channel: replaces each split entry's size with its SHARE of
        the window. Valid only there."""
        return self._with_op({"op": "normalize"})

    def sum(self) -> "FieldAccessor":
        """Fold the group's rows to the sum of this field. Valid only in a
        value (size/pos) slot."""
        return self._with_op({"op": "sum"})

    def mean(self) -> "FieldAccessor":
        """Fold the group's rows to the mean of this field. Valid only in a
        value (size/pos) slot."""
        return self._with_op({"op": "mean"})

    def count(self) -> "FieldAccessor":
        """Fold the group's rows to the row count (ignores the field's own
        values). Valid only in a value (size/pos) slot."""
        return self._with_op({"op": "count"})

    def distinct(self) -> "FieldAccessor":
        """Fold the group's rows to the number of distinct values of this
        field. Valid only in a value (size/pos) slot."""
        return self._with_op({"op": "distinct"})

    def between(
        self, lo: float, hi: float, *, closed: Optional[str] = None
    ) -> "FieldPredicate":
        """A row predicate for :func:`filter`: is this field's value in
        ``[lo, hi]``? ``closed`` picks which ends are inclusive (``"both"``,
        the default, ``"left"``, ``"right"`` or ``"none"``), as in polars'
        ``is_between``.

        Not a pipeline op. Mirrors JS ``field(name).between(lo, hi,
        { closed })``, which returns a predicate rather than appending to
        ``ops``, so it raises when the expression already carries ops: the
        predicate would test the raw field and silently drop them.
        """
        ops = self.get("ops", [])
        if ops:
            names = ", ".join(op["op"] for op in ops)
            raise ValueError(
                f'field("{self["name"]}").between(...) does not apply the '
                f"expression pipeline ({names}): a predicate is not a value "
                "slot. Filter on the raw field, or derive the binned/sorted "
                "column first."
            )
        pred = FieldPredicate(field=self["name"], between=[lo, hi])
        if closed is not None:
            pred["closed"] = closed
        return pred


class FieldPredicate(dict):
    """The ``{field, between: [lo, hi], closed?}`` wire shape of a field
    predicate, built by ``field(name).between(lo, hi, closed=...)`` and
    consumed by :func:`filter`. It is data, so a filter over it crosses to JS
    with no callback."""


def filter(
    predicate: Union[FieldPredicate, Callable[[dict], bool]],
) -> Operator:
    """Keep the rows a predicate accepts, and drop the rest.

    Mirrors JS ``filter(pred)``. A field predicate,
    ``field("day").between(100, 120, closed="right")``, goes on the wire as
    ``{type: "filter", predicate}``. A plain Python function of one row is a
    callback, so that filter is a :func:`derive` and runs in Python, like
    JS's ``filter`` over a hand-written predicate.

    Returns:
        Operator object for use inside ``.flow()``.
    """
    if isinstance(predicate, FieldPredicate):
        return Operator("filter", predicate=dict(predicate))
    if callable(predicate):
        # Data always flows as a list, so the filter keeps a sublist.
        return derive(lambda rows: [row for row in rows if predicate(row)])
    raise TypeError(
        "filter(...) expects field(name).between(lo, hi) or a function of one "
        f"row, got {type(predicate).__name__}"
    )


def field(name: str) -> FieldAccessor:
    """
    Explicit field-accessor wrapper. Mirrors the JS `field(...)` constructor
    in `packages/gofish-graphics/src/ast/data.ts` (the field/datum/literal
    trichotomy). Equivalent to passing a bare field-name string. Use it when
    a field name could be read as a literal, or to chain a pipeline.

    A column's unit is declared in the chart's schema
    (``Schema.unit("USD")``), not here. A column with no declared unit may
    share an axis with any other.

    The returned `FieldAccessor` is chainable, mirroring JS's
    `field(...)` pipeline syntax — `field("site").sort("yield")` as an
    operator's `by`, or `field("count").normalize()` as a `spread`/`stack`
    `size` channel (see `FieldAccessor` for the full method list).

    Emits the canonical `{type: "field", name, ops?}` wire shape.

    Args:
        name: The field name to read from each row.
    """
    return FieldAccessor({"type": "field", "name": name})


class ChunkKey(dict):
    """The ``{type: "chunk", size}`` wire shape of a ``chunk(size)`` grouping
    key. It is data, so a ``by=chunk(size)`` crosses to JS with no
    callback."""


def chunk(size: int) -> ChunkKey:
    """
    A ``by`` key that groups consecutive rows: row ``i`` goes to group
    ``i // size``. It is a bin of width ``size`` over row position, so
    ``spread(by=chunk(5), dir="y")`` lays the rows out five to a group (the
    rows of a waffle chart). Like ``itertools.batched``, lodash ``_.chunk``
    and Rust ``chunks(n)``. The key names no field, so its groups draw no
    axis or labels. Mirrors the JS ``chunk(size)`` in
    ``packages/gofish-graphics/src/ast/data.ts``.

    Args:
        size: How many consecutive rows go in each group (a positive integer).
    """
    if isinstance(size, bool) or not isinstance(size, int) or size < 1:
        raise ValueError(f"chunk(size): size must be a positive integer, got {size!r}")
    return ChunkKey({"type": "chunk", "size": size})


def _check_bin(key: str, value: Any, where: str) -> Dict[str, Any]:
    """The cells a key is binned into, in their wire form, on the key that
    takes them: ``"field"`` for ``field(x).bin(...)``, which takes a Calendar
    value, ``Bin.step`` and ``Bin.thresholds``, and ``"struct"`` for
    ``struct(x=..., y=...).bin(...)``, which takes ``Bin.hex`` and
    ``Bin.voronoi``. A kind of the other key is a TypeError naming the key
    that takes it. The kinds of each key are the ``Partition`` and
    ``StructBin`` option types, each one tagged union (gofish-ir
    ``BIN_KINDS``). Mirrors JS ``Frontend.checkPartition`` and
    ``Frontend.checkStructBin``."""
    from ._generated import _OPTION_TYPES, _to_wire

    own, other = ("Partition", "StructBin") if key == "field" else ("StructBin", "Partition")
    kind = value.get("kind") if isinstance(value, dict) else None
    # A Calendar value bins one field only: on a struct it is no other
    # key's kind, just not one of the struct's.
    if kind in _OPTION_TYPES[other][2] and kind not in _OPTION_TYPES["Calendar"][2]:
        if key == "field":
            raise TypeError(
                f"{where}: Bin.{kind} bins two fields together into cells of "
                f"the plane. Bin them with struct(x=..., y=...).bin(Bin.{kind}(...)); "
                "field(x).bin takes Bin.step(size), Bin.thresholds(count_or_edges), "
                "or a Calendar value."
            )
        raise TypeError(
            f"{where}: Bin.{kind} bins one field. Bin each field with "
            f"field(x).bin(Bin.{kind}(...)); struct(x=..., y=...).bin takes "
            "Bin.hex(radius=...) or Bin.voronoi(seeds=...)."
        )
    if kind not in _OPTION_TYPES[own][2]:
        expected = (
            "a Calendar value (Calendar.month, ...), Bin.step(size), or "
            "Bin.thresholds(count_or_edges)"
            if key == "field"
            else "a call in the Bin family, Bin.hex(radius=...) or "
            "Bin.voronoi(seeds=...)"
        )
        raise TypeError(f"{where}: expected {expected}, got {value!r}")
    return _to_wire(_OPTION_TYPES[own], value, where)


class StructAccessor(dict):
    """
    The ``{type: "struct", fields: {x, y}, ops?}`` wire shape: a key that
    reads two fields at once, built by :func:`struct`. Mirrors JS's
    ``StructExpr`` (``ast/structExpr.ts``). Its one op is ``bin``, which takes
    a call in the ``Bin`` family; the JS side bins the rows.
    """

    def bin(self, cells: Dict[str, Any]) -> "StructAccessor":
        """Map each row's point ``(x, y)`` to its cell in ``cells``, a call
        in the ``Bin`` family: ``Bin.hex(radius=...)`` or
        ``Bin.voronoi(seeds=...)``. The groups are the cells over the two
        columns' domain in the chart's data, so every group of a split sees
        the same cells, and empty cells are kept. Emits the wire op
        ``{"op": "bin", "partition": ...}``."""
        if self.get("ops"):
            raise ValueError(
                "struct(...).bin(...) is already binned: a struct takes one bin."
            )
        wire = _check_bin("struct", cells, "struct(...).bin")
        if wire.get("kind") == "voronoi" and isinstance(wire.get("seeds"), list):
            # A seed is read only at the struct's two fields, so the wire
            # carries those and not every column of the seed rows.
            fields = self["fields"]
            wire = {
                **wire,
                "seeds": [
                    {f: row.get(f) for f in (fields["x"], fields["y"])}
                    if isinstance(row, dict)
                    else row
                    for row in wire["seeds"]
                ],
            }
        out = StructAccessor(self)
        out["ops"] = [{"op": "bin", "partition": wire}]
        return out


def struct(*, x: str, y: str) -> StructAccessor:
    """
    A key that reads two fields at once, named after polars' ``pl.struct``:
    ``struct(x="lon", y="lat")``. ``x`` and ``y`` name the column read on each
    axis. Bin it with ``.bin(...)``, a call in the ``Bin`` family, to give
    each group its cell of the plane:

        chart(airports).flow(
            partition(by=struct(x="longitude", y="latitude").bin(Bin.hex(radius=1)))
        ).mark(region(fill=field("longitude").count()))

    Mirrors JS ``struct({ x, y })``. A struct is a key only once it is binned.

    Args:
        x: The column read on the x axis.
        y: The column read on the y axis.
    """
    if not isinstance(x, str) or not isinstance(y, str):
        raise TypeError(
            f"struct(x=..., y=...): each is a field name, got x={x!r}, y={y!r}"
        )
    return StructAccessor({"type": "struct", "fields": {"x": x, "y": y}})


# Data utilities (for use inside derive() callbacks)


def normalize(data: List[dict], field: str) -> List[dict]:
    """
    Normalize a numeric field so values sum to 1.

    Args:
        data: List of row dicts
        field: Field name to normalize

    Returns:
        New list of dicts with field normalized
    """
    total = sum(row[field] for row in data)
    if total == 0:
        return data
    return [{**row, field: row[field] / total} for row in data]


def repeat(row: dict, field: str) -> List[dict]:
    """
    Repeat a row N times based on a numeric field value.

    Args:
        row: A single data row dict
        field: Field name containing the repeat count

    Returns:
        List of copies of the row, length = row[field]
    """
    n = int(row[field])
    return [row] * n


# Mark factory functions
#
# rect / circle / ellipse / petal / text / image / polygon / blank are
# generated (packages/gofish-python/gofish/_generated.py) — pure
# kwargs-collection + wire rename, imported above. `rect()`'s generated
# signature drops the phantom `rs=`/`ts=` kwargs (they existed nowhere in JS)
# and takes one `dims={...}` escape-hatch kwarg for axis names a coordinate
# space declares (`dims={"theta": {"size": 1}}` in polar); `text()`
# drops a phantom `fontWeight=` (also nowhere in JS).


def line(children: Optional[List["Mark"]] = None, **options: Any) -> Mark:
    """Line mark — a center-mode connector (the path between mark centers).

    Three forms:
      - combinator form ``line([ref(a), ref(b)], dir="x")`` — the low-level
        connector over explicitly listed children (the drop-in for the removed
        ``connect``). ``source``/``target`` pin each endpoint to a normalized
        anchor on its bbox (Bluefish-style ``Line``) instead of the center.
      - bag form ``line(...)`` fused over the chart's own flow (in ``.mark()``
        position, or ``.layer()`` over the previous tier's marks): the split
        is inferred from the flow, or pinned with ``along="year"`` (names a
        flow tier by its ``by`` field — that tier becomes the path, every
        other grouping tier splits). A refs bag spells an explicit split
        structurally instead: ``chart(select_all(...)).flow(group(by="species"
        )).mark(line())``.
      - pairwise form ``line(from_=..., to=...)`` over rows whose ``from``/``to``
        columns hold refs (one segment per row, after :func:`resolve`).

    ``stroke_dasharray`` (e.g. ``"12"``) draws a dashed line, matching
    ``enclose``'s option of the same name.

    ``em_x``/``em_y``/``w``/``h`` are blank-fusion anchor keys: placed directly
    in ``.mark(...)`` position, ``line(...)`` elaborates to an invisible
    anchor tier (a ``blank()`` carrying just these four keys) plus this
    connector. ``line`` itself ignores them.

    The options are the generated ``_line_opts`` core's (see the docs options
    table); an unknown option raises TypeError.
    """
    kwargs = _line_opts(**options)
    if children is not None:
        return Mark("line", _children=list(children), **kwargs)
    return Mark("line", **kwargs)


def ribbon(children: Optional[List["Mark"]] = None, **options: Any) -> Mark:
    """Ribbon mark — an edge-mode connector: a filled band between the facing
    edges of consecutive marks (areas, streamgraphs, sankey ribbons).

    Three forms, like :func:`line`: combinator form
    ``ribbon([ref(a), ref(b)], dir="x")`` (the low-level connector over listed
    children — drop-in for the removed ``connect``), bag form fused over the
    chart's own flow (split inferred, or pinned with ``along="year"`` — see
    :func:`line`), and pairwise form ``ribbon(from_=..., to=...)`` (one band
    per row, after :func:`resolve`).

    ``em_x``/``em_y``/``w``/``h`` are blank-fusion anchor keys: placed directly
    in ``.mark(...)`` position, ``ribbon(...)`` elaborates to an invisible
    anchor tier (a ``blank()`` carrying just these four keys) plus this
    connector. ``ribbon`` itself ignores them.

    The options are the generated ``_ribbon_opts`` core's (see the docs
    options table); an unknown option raises TypeError.
    """
    kwargs = _ribbon_opts(**options)
    if children is not None:
        return Mark("ribbon", _children=list(children), **kwargs)
    return Mark("ribbon", **kwargs)


def enclose(children: Optional[List["Mark"]] = None, **options: Any) -> Mark:
    """Enclose mark: an outline drawn around nodes, under them. The outline is
    a ``shape`` from the ``Shape`` family: the padded bounding box
    (``Shape.box(rx=..., ry=...)``, the default), the smallest ellipse around
    the members (``Shape.oval()``), or a smooth region (``Shape.blob(...)``,
    ``Shape.hull(...)``, ``Shape.spine(...)``).

    Two forms, like :func:`line`: combinator form ``enclose([a, c], ...)``
    (fresh children are laid out as ``layer`` lays them out; ``ref(...)``
    children and ``.relate()`` operands are enclosed where they are), and bag
    form ``chart(select_all("points")).flow(group(by="species"))
    .mark(enclose(...))``, one outline per group.

    The options are the generated ``_enclose_opts`` core's (see the docs
    options table); an unknown option raises TypeError.
    """
    kwargs = _enclose_opts(**options)
    if children is not None:
        return Mark("enclose", _children=list(children), **kwargs)
    return Mark("enclose", **kwargs)


# ─── cut: slice a source shape into N clipped sub-shapes ────────────────────
# Mirrors JS `cut` from
# `packages/gofish-graphics/src/ast/graphicalOperators/cut.tsx`. The Python
# wrapper only emits the `{type:"cut", source, dir, size?, inset?}` IR node;
# extent resolution (the flexbox-style number/datum split) lives entirely on
# the JS side — see the harness/serializer. The SAME IR node serves both
# surfaces:
#   - As a chart `.mark(...)` spec → the expand-mark form (`cutMark`); a
#     field-name string `size` resolves per-row.
#   - As a combinator CHILD (a value dropped into a `Spread`/`Stack` children
#     list) → flat-expanded in place into its N slice nodes via the pure
#     `cut(source, opts)`.


class CutMark(Mark):
    """The `{type:"cut", ...}` IR node — a sliced source shape.

    Stored params live in `kwargs` (`source` is a `Mark`, `dir`/`size`/`inset`
    are plain values) so the inherited `.name()` / `.z_order()` clone path works;
    `to_dict()` serializes the source mark and drops `None` options.
    """

    def children(self) -> List[Any]:
        """The mark position a cut holds: its source."""
        return [self.kwargs["source"]]

    def to_dict(self, payload: "_Payload") -> dict:
        source = self.kwargs["source"]
        d: dict = {
            "type": "cut",
            "source": source.to_dict(payload),
            "dir": self.kwargs["dir"],
        }
        size = self.kwargs.get("size")
        if size is not None:
            # A field-name string passes through; a list of numbers / `datum()`
            # values passes through too — `DatumValue` IS the `{type:"datum"}`
            # wire dict, so no per-entry wiring is needed.
            d["size"] = size
        inset = self.kwargs.get("inset")
        if inset is not None:
            d["inset"] = inset
        if self._name is not None:
            d["name"] = (
                self._name.to_dict()
                if isinstance(self._name, Token)
                else self._name
            )
        if self._z_order is not None:
            d["zOrder"] = self._z_order
        if self._translate:
            d["translate"] = self._translate
        return d


def cut(
    source: "Mark",
    *,
    dir: str,
    size: Optional[Union[str, List[Union[int, float, "DatumValue"]]]] = None,
    inset: Optional[float] = None,
) -> CutMark:
    """Pure slice primitive — slice `source` into N clipped sub-shapes along
    `dir`. Mirrors JS `cut(source, { dir, size, inset? })`.

    The returned node is usable as a child (or list position) in a `Spread` /
    `Stack` combinator's children list; the JS side flat-expands it into its N
    slice nodes in place. Used inside `.mark(...)`, the same node is the
    expand-mark form.

    Args:
        source: The shape to slice (`image(...)` / `rect(...)`). Must carry an
            explicit `w` and `h`.
        dir: `"x"` or `"y"` — the axis to slice along.
        size: Slice extents along `dir`, resolved JS-side with CSS-flexbox
            semantics:
              - a field-name **string** (expand-mark form only) → per-row datum
                weights;
              - a **list** mixing raw numbers (ABSOLUTE source pixels, fixed
                "flex-basis" items) and `datum(n)` values (RELATIVE weights that
                split the remainder after the fixed items);
              - omitted → equal slices (N taken from the data length).
        inset: Pixels removed from each slice's source region (split half on each
            side along `dir`), creating a gap on every slice. Default 0.
    """
    return CutMark("cut", source=source, dir=dir, size=size, inset=inset)


# ─── offset: shift a single child by (x, y) render-pixels ───────────────────
# Mirrors the public JS `offset` operator
# (`packages/gofish-graphics/src/ast/graphicalOperators/offset.tsx`). Emits the
# `{type:"offset", x?, y?, children:[node]}` IR node the harness maps to it.


class OffsetMark(Mark):
    """The `{type:"offset", ...}` IR node — a child shifted by (x, y) pixels."""

    def children(self) -> List[Any]:
        """The mark position an offset holds: its child."""
        return [self.kwargs["child"]]

    def to_dict(self, payload: "_Payload") -> dict:
        child = self.kwargs["child"]
        d: dict = {"type": "offset", "children": [child.to_dict(payload)]}
        if self.kwargs.get("x") is not None:
            d["x"] = self.kwargs["x"]
        if self.kwargs.get("y") is not None:
            d["y"] = self.kwargs["y"]
        if self._name is not None:
            d["name"] = (
                self._name.to_dict()
                if isinstance(self._name, Token)
                else self._name
            )
        if self._z_order is not None:
            d["zOrder"] = self._z_order
        if self._translate:
            d["translate"] = self._translate
        return d


def offset(
    child: "Mark",
    *,
    x: Optional[float] = None,
    y: Optional[float] = None,
) -> OffsetMark:
    """Shift a single `child` mark by `(x, y)` render-pixels without affecting
    sibling layout. Mirrors JS `offset({ x, y }, [child])`.

    Args:
        child: The mark to shift.
        x: Horizontal shift in render pixels.
        y: Vertical shift in render pixels.
    """
    return OffsetMark("offset", child=child, x=x, y=y)


def chart(
    data: Any = _PREVIOUS_LAYER_MARKS,
    **options: Any,
) -> ChartBuilder:
    """
    Create a new chart builder.

    Chart-level options are keyword arguments (the JS options object
    ``chart(data, { axes, coord, ... })`` becomes kwargs):

        chart(data, color=Color.palette("tableau10"))
        chart(data, color=Color.gradient("blues"), coord=Coord.clock())

    Axes are a chart option (``.render(axes=...)`` can also set them, as in
    JS). ``axes`` accepts:

        axes=True                      # show both axes, titles inferred
        axes=False                     # no axes
        axes={"x": True, "y": False}   # per-dimension on/off
        axes={"x": {"title": "Year"}}  # custom title (title=False suppresses it)
        axes={"x": {"label": {"angle": 45}}}  # rotate x labels (also "side")
        axes={"x": {"label": {"align": ["center", "start"]}}}  # per-level label alignment

        chart(data, axes=True)
        chart(data, axes={"x": {"title": "Year"}, "y": True})
        chart(data, coord=Coord.clock(), axes=True, padding=80)   # polar chart

    Per-operator overrides use the same shape on spread()/scatter():

        spread(by="species", dir="x", axes={"x": True, "y": False})

    ``schema`` declares column types, keyed by column name (see ``Schema``):

        chart(survey, schema={"response": Schema.ordered(LEVELS).diverging()})

    Keys inside the per-axis dict are snake_case like every kwarg; an
    unknown key (such as the old flat ``"label_angle"``) raises TypeError
    naming the keys it takes.

    Args:
        data: Input data, or `ref(name)` / `select_all(name)` for cross-chart
            layer references
        **options: Chart options as keywords — ``w``, ``h``, ``coord``,
            ``color``, ``axes``, ``legend``, ``padding``, ``schema``. Any
            other keyword raises TypeError.

    Returns:
        ChartBuilder instance
    """
    return ChartBuilder(data, _chart_opts(**options) or None)


# A callback, as a payload records it: the rows JS calls it with and the
# call's scope (see `_Payload`), to the reply's root and the payload the reply
# ships (see `_Payload.callback`).
_Reply = Callable[[List[Any], str], Tuple[dict, "_Payload"]]


class _Payload:
    """What one IR walk collects to ship beside the IR, wherever in the IR
    it sits (the root, a mark position, a tier of a ``.layer(...)`` chain, a
    ``.relate(...)`` clause):

    - ``tables``: the rows of each chart that has rows of its own. The
      chart's data names its table by id (``{"type": "table", "id": "t0"}``),
      and the rows travel beside the IR, keyed by that id. Ids are minted in
      walk order, and the same data object, used by two charts, is one table;
    - ``callbacks``: every Python callable the IR names by lambda id (a
      ``derive`` operator, an accessor, a mark function), recorded as the
      walk writes its id. A host registers them and answers JS's calls with
      ``answer``. A call's reply is a payload of its own, so a mark
      function's reply carries the callbacks of what it drew.

    A reply's payload has the call's ``scope`` (see ``answer``), and names
    each callback it records by the scope and its walk order rather than by
    its lambda id, which the callback's code mints afresh on every call. So
    the same call (the same partition, drawn again by a second view of the
    widget) names the same callbacks, and registering them replaces the
    ones it registered before: the registry holds one set per distinct
    call, not one per call."""

    def __init__(self, scope: Optional[str] = None) -> None:
        self.tables: Dict[str, Any] = {}
        self._ids: Dict[int, str] = {}
        self.callbacks: Dict[str, _Reply] = {}
        self._scope = scope
        self._names: Dict[str, str] = {}

    def table(self, data: Any) -> dict:
        """The data IR of a chart over ``data``: its table's id."""
        table_id = self._ids.get(id(data))
        if table_id is None:
            table_id = f"t{len(self._ids)}"
            self._ids[id(data)] = table_id
            self.tables[table_id] = data
        return {"type": "table", "id": table_id}

    def callback(self, lambda_id: str, reply: _Reply) -> str:
        """Record the callback named ``lambda_id``; return the id for the
        IR to write: ``lambda_id`` itself, or, in a reply, its name in the
        call's scope."""
        if self._scope is not None:
            lambda_id = self._names.setdefault(
                lambda_id, f"{self._scope}.{len(self._names)}"
            )
        self.callbacks[lambda_id] = reply
        return lambda_id

    def json_tables(self) -> Dict[str, List[dict]]:
        """Each table's rows as dict rows, by id (``None`` data is no rows),
        which the document writes as JSON (``_json_value``)."""
        from .arrow_utils import to_records

        return {
            tid: [] if d is None else to_records(d)
            for tid, d in self.tables.items()
        }


def _table_reply(fn: Callable[[List[Any]], Any]) -> _Reply:
    """The callback of a ``derive`` operator: its reply's root names the
    table of the list ``fn`` returned (its rows, or any other items; see
    ``arrow_utils.to_arrow_table``)."""

    def reply(rows: List[Any], scope: str) -> Tuple[dict, "_Payload"]:
        payload = _Payload(scope)
        return payload.table(fn(rows)), payload

    return reply


def _accessor_reply(fn: Callable[[Any], Any]) -> _Reply:
    """The callback of an accessor: its reply's root names the table of
    ``fn``'s values, one per row it was called with."""
    return _table_reply(lambda rows: [fn(r) for r in rows])


def _mark_fn_reply(fn: Callable[[List[Any]], Any]) -> _Reply:
    """The callback of a mark function: its reply's root is the
    mark-position IR of what ``fn`` drew, and its payload ships that IR's
    tables and callbacks. JS sends each live ``GoFishRef`` argument as an
    ``{"__inputRef": i, "datum": ...}`` row (a ref can't cross the bridge);
    it becomes an ``_InputRef``, so ``d[0].datum`` reads as in JS (#591)."""

    def reply(rows: List[Any], scope: str) -> Tuple[dict, "_Payload"]:
        return _walk(
            fn(
                [
                    _InputRef(row["__inputRef"], row.get("datum"))
                    if isinstance(row, dict) and "__inputRef" in row
                    else row
                    for row in rows
                ]
            ),
            scope,
        )

    return reply


def _walk(root: Any, scope: Optional[str] = None) -> Tuple[dict, "_Payload"]:
    """``root``'s IR (a chart, a ``.layer(...)`` chain, or a mark: a root
    holds anything a mark position does), and what the walk collected
    beside it, in ``scope`` for a call's reply (see ``_Payload``)."""
    payload = _Payload(scope)
    return root.to_dict(payload), payload


def _json_value(value: Any) -> Any:
    """``value`` as an IR document's JSON holds it, by one rule for every
    part of the document (an option, a channel value, a row of a JSON
    table): a non-finite float in its tagged form (``_nonfinite``), as JS
    ``toJSON`` writes it; a numpy scalar as the Python value it stands for
    (``.item()``; a ``datetime64`` as a ``datetime``); and a date, a time or
    a datetime (a pandas ``Timestamp`` is one) as its ISO 8601 string, as
    JSON writes a JS ``Date``. Both hosts and ``to_ir()`` write every
    document through it, so a document is JSON wherever it goes."""
    np = sys.modules.get("numpy")

    def swap(v: Any) -> Any:
        if np is not None and isinstance(v, np.generic):
            item = (
                v.astype("datetime64[us]").item()
                if isinstance(v, np.datetime64)
                else v.item()
            )
            out = swap(item)
            return item if out is KEEP else out
        if isinstance(v, float):
            return encode_number(v)
        if isinstance(v, (datetime.date, datetime.time)):
            return v.isoformat()
        return KEEP

    return _nonfinite.walk(value, swap)


def _document(root: dict, tables: Dict[str, Any]) -> dict:
    """The IR document envelope around ``root`` and its ``tables``, written
    as JSON once at its top (``_json_value``), as JS ``toJSON`` writes it."""
    doc: dict = {"irVersion": 0, "ir": "gofish-frontend", "root": root}
    if tables:
        doc["tables"] = tables
    return _json_value(doc)


def _transport(root: dict, payload: "_Payload") -> dict:
    """The document a host ships: ``root`` and its tables as base64 Arrow IPC
    by id (timestamp and date columns cross as Arrow times)."""
    from .arrow_utils import b64_tables

    return _document(root, b64_tables(payload.tables))


def ir_payload(root: Any) -> Tuple[dict, Dict[str, _Reply]]:
    """What a host ships to render ``root``: its document, with the tables as
    base64 Arrow, and the callbacks the IR names, by lambda id, which the
    host answers JS's calls with (``answer``). The notebook widget and the
    parity harness's derive server are the two hosts."""
    root_ir, payload = _walk(root)
    return _transport(root_ir, payload), payload.callbacks


def answer(callbacks: Dict[str, _Reply], lambda_id: str, rows_b64: str) -> dict:
    """Answer one call from JS: run the callback named ``lambda_id`` on the
    rows JS sent (base64 Arrow), register the callbacks its reply names, and
    return the reply's document, shipped like a root's: its root (a table
    reference for a derive or an accessor, a mark-position IR for a mark
    function) and its tables as base64 Arrow.

    The reply's scope is the call itself, the callback and the rows, so the
    callbacks a mark function's reply names are named by the call that made
    them (see ``_Payload``): the same call again replaces them, and the
    registry does not grow with each render."""
    import base64

    from .arrow_utils import arrow_to_records

    reply = callbacks.get(lambda_id)
    if reply is None:
        raise KeyError(f"no Python callback is registered as {lambda_id}")
    scope = hashlib.sha256(f"{lambda_id}\n{rows_b64}".encode()).hexdigest()[:16]
    root, payload = reply(arrow_to_records(base64.b64decode(rows_b64)), scope)
    callbacks.update(payload.callbacks)
    return _transport(root, payload)


def _render_widget(
    root: Any,
    w: int,
    h: int,
    axes: Optional[Any],
    legend: Optional[bool],
    debug: bool,
):
    """Render ``root`` as a notebook widget: its document and the callbacks
    it names. The options are the JS ``.render(container, options)``
    options."""
    from .widget import GoFishChartWidget

    doc, callbacks = ir_payload(root)
    return GoFishChartWidget(
        doc=doc,
        callbacks=callbacks,
        width=w,
        height=h,
        axes=axes,
        legend=legend,
        debug=debug,
    )


class LayerBuilder(_Root):
    """A ``chart(...).layer(...)`` chain: tiers stacked in order, each offered
    the previous tier's marks as its scope (an empty ``chart()`` tier binds
    them as data). Mirrors the JS ``LayerBuilder``. The chain sits wherever a
    chart can: it renders on its own, or sits in a mark position
    (``.mark(...)``, a ``layer([...])`` child), where an empty ``chart()``
    first tier binds the rows of the partition it sits in."""

    def __init__(self, tiers: List[Any]):
        # A tier is a mark position, so it holds what one holds (`_as_mark`):
        # a callable `(data) -> mark | chart` is a mark function, as in JS.
        self.tiers = [_as_mark(tier) for tier in tiers]

    def layer(self, child: Any) -> "LayerBuilder":
        """Stack another tier; an empty ``chart()`` scope inherits the marks of
        the immediately preceding tier (see ``ChartBuilder.layer`` — the
        auto-naming/``selectAll`` wiring is JS-side, not resolved here)."""
        return LayerBuilder([*self.tiers, child])

    def children(self) -> List[Any]:
        """The mark positions a chain holds: its tiers."""
        return self.tiers

    def to_dict(self, payload: "_Payload") -> dict:
        """The chain's IR, wherever it sits: ``{"type": "layer-chain",
        "tiers": [...]}``, each tier in its mark-position form. JS rebuilds it
        through its own ``LayerBuilder``, which owns the chain's tier wiring
        and render logic (inferred axis titles, the root tier's ``axes``)."""
        return {
            "type": "layer-chain",
            "tiers": [tier.to_dict(payload) for tier in self.tiers],
        }

    def render(
        self,
        w: int = 800,
        h: int = 600,
        axes: Optional[Any] = None,
        legend: Optional[bool] = None,
        debug: bool = False,
    ):
        """
        Render the chain as an anywidget for Jupyter notebooks.

        The options are the JS ``.render(container, options)`` options.

        Args:
            w: Width of the whole graphic in pixels, axes and legend included
            h: Height of the whole graphic in pixels, axes and legend included
            axes: Draw axes (the JS render option ``axes``). Leave unset to
                use the root tier's own ``axes`` option.
            legend: Draw the color legend (the JS render option ``legend``).
                Leave unset for the default; a ``chart()`` ``legend`` option
                wins over this one.
            debug: Whether to enable debug mode

        Returns:
            GoFishChartWidget instance that will display in Jupyter
        """
        return _render_widget(
            self, w=w, h=h, axes=axes, legend=legend, debug=debug
        )

    def save(
        self,
        path,
        w: int = 800,
        h: int = 600,
        axes: Optional[Any] = None,
        legend: Optional[bool] = None,
        debug: bool = False,
    ):
        """Save the chain's render to ``path`` (see ``ChartBuilder.save``)."""
        widget = self.render(
            w=w, h=h, axes=axes, legend=legend, debug=debug
        )
        widget.save(path)
        return widget

    def _repr_mimebundle_(self, include=None, exclude=None):
        """Auto-display in notebooks (see ChartBuilder._repr_mimebundle_)."""
        return self.render()._repr_mimebundle_(include=include, exclude=exclude)


