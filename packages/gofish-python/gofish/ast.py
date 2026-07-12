"""AST classes for building GoFish chart specifications."""

from typing import Any, Callable, Dict, List, Optional, TypeVar, Union
import uuid

T = TypeVar("T")


class Operator:
    """Base class for chart operators."""

    def __init__(self, op_type: str, **kwargs):
        self.op_type = op_type
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
        self,
        accessor: Union[str, "FieldAccessor"],
        position: Optional[str] = None,
        fontSize: Optional[int] = None,
        color: Optional[str] = None,
        offset: Optional[int] = None,
        rotate: Optional[int] = None,
        font_family: Optional[str] = None,
        font_weight: Optional[Union[int, str]] = None,
        font_style: Optional[str] = None,
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

        Returns:
            New Operator (same subclass as self) with the label appended.
        """
        new_op = type(self)(self.op_type, **self.kwargs)
        new_op._translate = self._translate
        label_spec: Dict[str, Any] = {
            "accessor": dict(accessor) if isinstance(accessor, FieldAccessor) else accessor
        }
        if position is not None:
            label_spec["position"] = position
        if fontSize is not None:
            label_spec["fontSize"] = fontSize
        if color is not None:
            label_spec["color"] = color
        if offset is not None:
            label_spec["offset"] = offset
        if rotate is not None:
            label_spec["rotate"] = rotate
        if font_family is not None:
            label_spec["fontFamily"] = font_family
        if font_weight is not None:
            label_spec["fontWeight"] = font_weight
        if font_style is not None:
            label_spec["fontStyle"] = font_style
        new_op._labels = [*self._labels, label_spec]
        return new_op

    def to_dict(self) -> dict:
        """Convert operator to dictionary for JSON IR."""
        d = {"type": self.op_type, **self.kwargs}
        if self._translate:
            d["translate"] = self._translate
        if self._labels:
            d["label"] = self._labels
        return d


class DeriveOperator(Operator):
    """Operator for deriving new data via Python function."""

    def __init__(self, fn: Callable, provenance: Optional[dict] = None):
        super().__init__("derive")
        self.fn = fn
        self.lambda_id = str(uuid.uuid4())
        # Measure provenance a data transform (e.g. `bin`) declares for its
        # output columns. It can't ride the data rows across the derive RPC
        # bridge, so it travels in the operator IR and is re-applied JS-side via
        # `setMeasureProvenance` — mirroring the JS bin's array-symbol
        # provenance so a histogram's edges unify on the source field's axis.
        self.provenance = provenance

    def translate(
        self,
        *,
        x: Optional[float] = None,
        y: Optional[float] = None,
    ) -> "DeriveOperator":
        """Translate a derived operator while preserving its lambda handle."""
        new_op = DeriveOperator(self.fn, self.provenance)
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

    def to_dict(self) -> dict:
        """Convert to dict - return lambda ID (+ measure provenance, if any)."""
        out = {"type": "derive", "lambdaId": self.lambda_id}
        if self.provenance:
            out["provenance"] = self.provenance
        if self._translate:
            out["translate"] = self._translate
        return out


def _collect_derive_operators(ops: List[Operator]) -> List[DeriveOperator]:
    return [op for op in ops if isinstance(op, DeriveOperator)]


class _MarkFn:
    """Sentinel wrapping a Python callable used as a *whole* mark.

    `ChartBuilder.mark(lambda data: chart(data[0]["collection"]).flow(...).mark(...))`
    — the lambda receives the per-group data slice and returns a new
    `ChartBuilder` for that slice. JS storybook calls this "mark-as-function"
    (see `Scatter.stories.tsx::WithPieGlyphs`).

    The wire shape is `{type: "mark-fn", lambdaId: <uuid>}`. The harness
    builds a JS Mark whose body fetches `/derive/<id>` per invocation,
    receives a chart IR, and constructs a ChartBuilder JS-side — the same
    object `resolveMarkResult` already accepts as a mark return value.
    """

    def __init__(self, fn: Callable):
        self.fn = fn
        self.lambda_id = str(uuid.uuid4())


class _PendingAccessor:
    """Sentinel wrapping a Python callable used as a mark kwarg accessor.

    JS's `createMark` accepts a callable for encoding channels like
    `text({text: (d) => `${d.amount}%`})`. The harness can't ship a Python
    callable to JS, so the factory wraps it here with a fresh `lambda_id`
    (same UUID shape as `DeriveOperator`, sharing one registry).
    `Mark.to_dict()` serializes it as `{"__gofish_lambda": id}`; the
    harness/widget swaps that sentinel for an `async (d) => fetch
    /derive/<id>(d)` arrow at render time, so JS sees a real accessor
    function whose body happens to RPC into Python.
    """

    def __init__(self, fn: Callable):
        self.fn = fn
        self.lambda_id = str(uuid.uuid4())


def _channel(v: Any) -> Any:
    """Wrap a bare callable channel value in `_PendingAccessor`.

    Generalizes what `text()` already did for its `text=` kwarg (the only
    channel that supported an accessor lambda) to any generated leaf-mark
    channel kwarg — a plain literal/field-name/`datum()` passes through
    unchanged, a callable `(row) -> value` gets wrapped so
    `_collect_mark_lambdas` can register it with the derive RPC bridge.
    """
    if v is not None and not isinstance(v, (str, int, float, bool)) and callable(v):
        return _PendingAccessor(v)
    return v


def _collect_mark_lambdas(mark: "Mark") -> List[tuple]:
    """Walk a Mark tree, yielding `(lambda_id, rows_fn)` pairs for every
    `_PendingAccessor` in mark kwargs (and recursively in combinator
    `_children`). `rows_fn` adapts the user's `(row) -> value` callable to
    the rows-in / rows-out shape the existing `/derive/<id>` endpoint
    expects, so mark accessors and `derive()` operators share one registry
    and one endpoint.
    """
    pairs: List[tuple] = []
    for val in mark.kwargs.values():
        if isinstance(val, _PendingAccessor):
            fn = val.fn
            pairs.append(
                (val.lambda_id, lambda rows, _fn=fn: [_fn(r) for r in rows])
            )
    if mark._children is not None:
        for child in mark._children:
            pairs.extend(_collect_mark_lambdas(child))
    return pairs


class Token:
    """Hygienic name for a sub-mark inside a `@mark` component.

    Mirrors JS `createName(tag) -> Token`
    (`packages/gofish-graphics/src/ast/createName.ts`). Each Token carries
    an opaque UUID `id` so two `createName("box")` calls in different
    components don't collide, plus a `tag` string used as the scope-map
    path segment for both `.constrain(lambda box: ...)` callbacks and
    outer `ref(t).box` navigation.
    """

    def __init__(self, tag: str):
        self.tag = tag
        self.id = str(uuid.uuid4())

    def to_dict(self) -> dict:
        return {"__gofish_token": self.id, "__tag": self.tag}


def createName(tag: str) -> Token:
    """Mint a hygienic token. See `Token`."""
    return Token(tag)


def mark(fn: Callable) -> Callable:
    """Decorator that promotes a `(**props) -> Mark` function into a
    reusable component factory.

    Calling the decorated function eagerly runs `fn(**props)` to produce
    a Mark tree, then flags the result as a scope boundary so the
    harness wraps it in `node.scope()` post-resolution. Internal names
    declared via `createName(...)` therefore don't leak to outer scope.

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


class Mark:
    """Base class for chart marks."""

    def __init__(
        self,
        mark_type: str,
        _children: Optional[List["Mark"]] = None,
        **kwargs,
    ):
        self.mark_type = mark_type
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
        self._children: Optional[List["Mark"]] = _children
        # When True, the harness wraps the resulting JS Mark in a
        # `node.scope()` post-pass so that internal names declared via
        # `createName(...)` don't leak to outer scope. Set by the
        # `@mark` decorator.
        self._is_scope: bool = False
        # When set, the harness invokes the JS-side mark with this datum
        # and key — mirrors the JS `rect({...})(d, key)` pattern used by
        # `Treemap(opts, [rect(...)(d1, k1), rect(...)(d2, k2), ...])`.
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
        """Bind a datum (and optional key) to this Mark for the Treemap
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
        `ref(...)` / `selectAll(...)` as chart data (string form) or
        hygienic in-component naming (`createName(...)` token form).

        Args:
            name_or_token: A bare string for flat naming, or a `Token`
                returned by `createName()` for hygienic scoping inside a
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
        enclosing layer's `.constrain(...)` instead.

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
        """Slice this mark into N clipped sub-shapes along `dir` — the v3
        expand-mark form. Mirrors JS `image(...).cut({ dir, size, inset })`.

        Returns a `CutMark` (the `{type:"cut"}` IR node) with `self` as the
        source. See the module-level `cut(...)` for the `size` semantics.
        """
        return CutMark("cut", source=self, dir=dir, size=size, inset=inset)

    def label(
        self,
        accessor: Union[str, "FieldAccessor"],
        position: Optional[str] = None,
        fontSize: Optional[int] = None,
        color: Optional[str] = None,
        offset: Optional[int] = None,
        rotate: Optional[int] = None,
        font_family: Optional[str] = None,
        font_weight: Optional[Union[int, str]] = None,
        font_style: Optional[str] = None,
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
            position: Label position (e.g. "center", "outset-top", "inset-bottom-start")
            fontSize: Font size in pixels
            color: Label color (auto-contrasted if omitted)
            offset: Offset from shape edge in pixels
            rotate: Rotation angle in degrees
            font_family: Font family passed straight through to the label's
                text node (defaults to the elaborator's own font family)
            font_weight: Font weight (e.g. `"bold"` or a numeric weight)
            font_style: Font style (e.g. `"italic"`)

        Returns:
            New Mark (same subclass as self) with the label appended
        """
        new_mark = type(self)(
            self.mark_type, _children=self._children, **self.kwargs
        )
        self._copy_meta(new_mark)
        label_spec: Dict[str, Any] = {
            "accessor": dict(accessor) if isinstance(accessor, FieldAccessor) else accessor
        }
        if position is not None:
            label_spec["position"] = position
        if fontSize is not None:
            label_spec["fontSize"] = fontSize
        if color is not None:
            label_spec["color"] = color
        if offset is not None:
            label_spec["offset"] = offset
        if rotate is not None:
            label_spec["rotate"] = rotate
        if font_family is not None:
            label_spec["fontFamily"] = font_family
        if font_weight is not None:
            label_spec["fontWeight"] = font_weight
        if font_style is not None:
            label_spec["fontStyle"] = font_style
        new_mark._labels = [*self._labels, label_spec]
        return new_mark

    def to_dict(self) -> dict:
        """Convert mark to dictionary for JSON IR."""
        # Replace `_PendingAccessor` kwarg values with their lambda-id
        # sentinel. The derive-server walks the Mark tree separately to
        # register the underlying callable in the shared registry; the JS
        # harness/widget substitutes the sentinel for a real `(d) => ...`
        # arrow function whose body RPCs into Python.
        def _wire(v):
            if isinstance(v, _PendingAccessor):
                return {"__gofish_lambda": v.lambda_id}
            return v

        serialized_kwargs = {k: _wire(v) for k, v in self.kwargs.items()}
        if self._children is not None:
            # Combinator form: emit a nested payload the JS side reconstructs
            # via the operator's `(opts, marks)` overload.
            d: dict = {
                "type": self.mark_type,
                "__combinator": True,
                "options": serialized_kwargs,
                "children": [child.to_dict() for child in self._children],
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
        # Only ConstrainableMark carries _constraints, but reading via getattr
        # keeps the base class oblivious to the subclass extension.
        constraints = getattr(self, "_constraints", None)
        if constraints is not None:
            d["constraints"] = [c.to_dict() for c in constraints]
        # `@mark`-decorated components flag their output Mark as a
        # scope boundary so the harness wraps the resolved node in
        # `node.scope()` — matches JS createMark's behavior.
        if self._is_scope:
            d["__scope"] = True
        # `bind_data()` pre-binds a datum + key for the
        # `rect({...})(d, key)` Treemap-style invocation pattern.
        if self._datum_set:
            d["__datum"] = self._datum
            d["__key"] = self._key
        # `.zOrder(n)` — applied post-construction on the JS side.
        if self._z_order is not None:
            d["zOrder"] = self._z_order
        if self._translate:
            d["translate"] = self._translate
        return d

    def to_ir(self) -> dict:
        """
        Top-level IR shape when this Mark is rendered directly (no Chart).

        Mirrors JS storybook spelling `spread(opts, [marks]).render(...)`:
        no data, no operators, no chart-level color/coord config. The harness
        calls the NameableMark's own `.render(container, opts)` and skips the
        Chart/Frame wrapper, which is what gives byte-identical output to a
        JS storybook export that renders a mark directly.
        """
        return {"type": "raw-mark", "mark": self.to_dict()}

    def render(
        self,
        w: int = 800,
        h: int = 600,
        axes: bool = False,
        debug: bool = False,
    ):
        """
        Render this Mark directly (no Chart wrapper) — mirrors the JS storybook
        pattern `spread({...}, [marks]).render(container, {w, h})`.

        Returns a GoFishChartWidget; in a notebook this auto-displays.
        """
        from .widget import GoFishChartWidget
        from .arrow_utils import empty_placeholder_arrow_bytes

        arrow_data = empty_placeholder_arrow_bytes()

        widget = GoFishChartWidget(
            spec=self.to_ir(),
            arrow_data=arrow_data,
            derive_functions={},
            width=w,
            height=h,
            axes=axes,
            debug=debug,
        )
        return widget

    def save(
        self,
        path,
        w: int = 800,
        h: int = 600,
        axes: bool = False,
        debug: bool = False,
    ):
        """Save this mark's render to ``path`` (see ``ChartBuilder.save``)."""
        widget = self.render(w=w, h=h, axes=axes, debug=debug)
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
    an enclosing `.layer([...]).constrain(...)` can target it by name, e.g.
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

    def to_dict(self) -> dict:
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
    over,
    intersect,
    exclude,
    subtract,
    paint,
    mask,
    enclose,
    arrow,
    _spread_opts,
    _stack_opts,
    _scatter_opts,
    _group_opts,
    _table_opts,
    _treemap_opts,
    _treemap_combinator_opts,
    _line_opts,
    _ribbon_opts,
    _polar_config,
)


# Low-level constraint surface — mirrors JS `Constraint.align` / `Constraint.distribute`
# from packages/gofish-graphics/src/ast/constraints/index.ts. Used only by the
# v2-style `layer([marks]).constrain(...)` combinator. The Python user authors
# constraints by name; the IR carries the names; the harness/widget rebuilds
# the JS-side ref objects from those names.


class RefSentinel:
    """Opaque handle for a named layer child, passed to a constrain callback.

    `layer([rect(...).name("a")]).constrain(lambda a, b: [...])` receives one
    of these per child, keyed by the child's `.name(...)` tag.
    """

    def __init__(self, ref_name: str):
        self.ref_name = ref_name


class AlignConstraint:
    """IR carrier for `Constraint.align(refs, x=..., y=...)`."""

    def __init__(self, refs: List[RefSentinel], options: Dict[str, Any]):
        self.refs = refs
        self.options = options

    def to_dict(self) -> dict:
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

    def to_dict(self) -> dict:
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

    def to_dict(self) -> dict:
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

    def to_dict(self) -> dict:
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

    def to_dict(self) -> dict:
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
                constrain callback).
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


class ConstrainableMark(Mark):
    """A combinator-form Mark returned by `layer(...)`.

    Adds a `.constrain(callback)` method that the spread combinator lacks.
    The callback receives one `RefSentinel` per named child as a kwarg and
    returns a list of constraint specs (`Constraint.align(...)` / `.distribute(...)`).
    """

    def __init__(
        self,
        mark_type: str,
        _children: Optional[List["Mark"]] = None,
        **kwargs,
    ):
        super().__init__(mark_type, _children=_children, **kwargs)
        self._constraints: Optional[List[Any]] = None

    def _copy_meta(self, target: "Mark") -> "Mark":
        super()._copy_meta(target)
        if isinstance(target, ConstrainableMark):
            target._constraints = self._constraints
        return target

    def constrain(self, callback: Callable[..., List[Any]]) -> "ConstrainableMark":
        """Apply constraints relating named children of this layer.

        The callback receives one `RefSentinel` per named child as a kwarg
        and must return a list of constraint specs:

            layer([rect(...).name("a"), rect(...).name("b")]).constrain(
                lambda a, b: [
                    Constraint.align([a, b], x="end"),
                    Constraint.distribute([a, b], dir="y", spacing=10),
                ]
            )

        Direct children are collected first; then the walker descends into
        any **non-component** nested `layer(...)` children (i.e. those not
        produced by `@mark`) so the callback can reach across tier
        boundaries — e.g. an outer layer's `Constraint.z_above` can
        reference a name declared inside an inner shapes layer. Direct
        children win on name collision. Mirrors JS-side
        `collectConstraintRefs` in
        `packages/gofish-graphics/src/ast/constraints/index.ts`.
        """
        if self._children is None:
            raise ValueError(
                ".constrain() requires combinator children — use "
                "`layer([...]).constrain(...)`"
            )

        def _name_key(child: "Mark") -> Optional[str]:
            n = getattr(child, "_name", None)
            if n is None:
                return None
            return n.tag if isinstance(n, Token) else n

        # Two phases, mirroring the JS-side descent: collect direct-child
        # names first (so they win on collision), then recurse into any
        # unnamed nested non-component layer.
        refs: Dict[str, RefSentinel] = {}
        seen_dupes: List[str] = []

        def collect(children: List["Mark"], is_direct: bool) -> None:
            # Phase 1 (this layer): named children.
            for child in children:
                key = _name_key(child)
                if key is None:
                    continue
                if is_direct and key in refs:
                    seen_dupes.append(key)
                elif key not in refs:
                    refs[key] = RefSentinel(key)
            # Phase 2 (this layer): recurse into non-component plain layers.
            for child in children:
                if not isinstance(child, ConstrainableMark):
                    continue
                if getattr(child, "_is_scope", False):
                    continue
                if child._children is None:
                    continue
                collect(child._children, is_direct=False)

        # Validate that every direct child can contribute names — either
        # by being named itself, or by being a non-component layer the
        # walker will descend into.
        for child in self._children:
            name = _name_key(child)
            if name is not None:
                continue
            if (
                isinstance(child, ConstrainableMark)
                and not getattr(child, "_is_scope", False)
                and child._children is not None
            ):
                continue
            raise ValueError(
                "every child of layer(...) used with .constrain() must be "
                "named via .name(...) so the callback can reference it "
                "(or be an unnamed non-component nested layer)"
            )

        collect(self._children, is_direct=True)

        if seen_dupes:
            raise ValueError(
                ".constrain() children must have unique names; saw "
                f"duplicates: {sorted(set(seen_dupes))}"
            )

        constraints = callback(**refs)
        new_mark = type(self)(
            self.mark_type, _children=self._children, **self.kwargs
        )
        self._copy_meta(new_mark)
        new_mark._constraints = list(constraints)
        return new_mark


# Sentinel chart-data for an empty `chart()` scope used inside `.layer(...)`:
# "inherit the previous tier's marks". Unlike earlier revisions, this wrapper
# no longer resolves that wiring itself — it emits `{"type": "previous-tier"}`
# on the wire (see `ChartBuilder.to_ir`) and lets JS's `LayerBuilder.wireTiers()`
# (the real `.layer()` chain's own logic — see chartBuilder.ts) auto-name the
# preceding tier's mark and bind this tier to `selectAll(thatName)`. This is
# the shallow-port goal: Python emits tiers as authored, JS owns the auto-naming
# (see apps/docs/docs/internals/design/python-wrapper-codegen.md, "Recommended
# staging" step 1).
_PREVIOUS_LAYER_MARKS = object()


class ChartBuilder:
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
                `selectAll(name)`) for cross-chart references
            options: Chart options (w, h, coord, color, etc.)
            operators: List of operators to apply
        """
        self.data = data
        self.options = options or {}
        self.operators: List[Operator] = operators or []
        self._mark: Optional[Mark] = None
        self._z_order = z_order
        self._name: Optional[Union[str, "Token"]] = None

    def flow(self, *ops: Operator) -> "ChartBuilder":
        """
        Add operators to the flow pipeline.

        Args:
            *ops: One or more operators (spread, stack, derive, etc.)

        Returns:
            New ChartBuilder with operators added
        """
        return ChartBuilder(
            self.data,
            self.options,
            operators=[*self.operators, *ops],
            z_order=self._z_order,
        )

    def mark(self, mark) -> "ChartBuilder":
        """
        Set the mark for the chart.

        Args:
            mark: A `Mark` (rect/circle/line/...), a nested `ChartBuilder`, or a
                callable `(data) -> ChartBuilder`. A nested ChartBuilder is the
                preferred spelling for a per-group sub-chart (issue #243): an
                empty-scope child (``chart()`` / ``chart(coord=...)``) inherits
                the incoming partition datum, replacing the
                ``.mark(lambda data: chart(data, ...).flow(...).mark(...))``
                callback. A callable receives the per-group data slice and
                returns a ChartBuilder for that slice (the older spelling).

        Returns:
            New ChartBuilder with mark set
        """
        new_builder = ChartBuilder(
            self.data, self.options, self.operators, z_order=self._z_order
        )
        # A nested ChartBuilder becomes a mark-fn that binds the incoming
        # partition datum (empty scope) or draws as-is — reusing the same
        # lambda_id / derive-server path as an explicit callback.
        if isinstance(mark, ChartBuilder):
            child = mark
            new_builder._mark = _MarkFn(
                (lambda data: child._with_data(data))
                if child._uses_previous_marks()
                else (lambda data: child)
            )
        # Wrap callables in `_MarkFn` so the IR carries a stable lambda_id
        # the derive-server can register and the harness can RPC into.
        elif not isinstance(mark, Mark) and callable(mark):
            new_builder._mark = _MarkFn(mark)
        else:
            new_builder._mark = mark
        return new_builder

    def layer(self, child: "ChartBuilder") -> "LayerBuilder":
        """Stack another tier over this one. ``child`` is its own ``chart(...)``
        pipeline; an empty ``chart()`` scope (no data) inherits *this* tier's
        marks (so ``.layer(chart().flow(group(by=...)).mark(ribbon()))`` connects
        what you just drew), while ``chart(table)`` drives the tier from another
        dataset (resolve back into the chart with
        ``resolve(..., from_=selectAll(...))``). Returns a ``LayerBuilder`` so
        tiers keep chaining: ``.layer(a).layer(b)``. Mirrors the JS ``.layer()``.

        The auto-naming/``selectAll`` wiring for an empty-scope ``child`` is
        NOT resolved here — each tier is emitted as authored (see
        ``_PREVIOUS_LAYER_MARKS``) and JS's real ``LayerBuilder`` derives it,
        the same as a native ``chart(...).layer(...)`` chain.
        """
        return LayerBuilder([self, child], builder_chain=True)

    def _uses_previous_marks(self) -> bool:
        """True for an empty ``chart()`` scope (data defers to the prev tier)."""
        return self.data is _PREVIOUS_LAYER_MARKS

    def _with_data(self, data: Any) -> "ChartBuilder":
        """Copy of this builder with its data replaced (used by ``.mark()``'s
        nested-``ChartBuilder`` form to bind an empty scope to the incoming
        partition datum — see ``ChartBuilder.mark``)."""
        nb = ChartBuilder(
            data, self.options, self.operators, z_order=self._z_order
        )
        nb._mark = self._mark
        nb._name = self._name
        return nb

    def name(self, name_or_token: Union[str, "Token"]) -> "ChartBuilder":
        """Tag this chart with a name so a `layer([...]).constrain(...)` callback
        can reference it (mirrors JS `chart.resolve().name(...)`).

        Args:
            name_or_token: A flat string name, or a `Token` from `createName(...)`.

        Returns:
            New ChartBuilder carrying the name.
        """
        new_builder = ChartBuilder(
            self.data, self.options, self.operators, z_order=self._z_order
        )
        new_builder._mark = self._mark
        new_builder._name = name_or_token
        return new_builder

    def zOrder(self, value: float) -> "ChartBuilder":
        """Set z-order for this chart when rendered inside a Layer."""
        new_builder = ChartBuilder(
            self.data, self.options, self.operators, z_order=value
        )
        new_builder._mark = self._mark
        new_builder._name = self._name
        return new_builder

    def zIndex(self, value: float) -> "ChartBuilder":
        """Alias for zOrder()."""
        return self.zOrder(value)

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

    def to_ir(self) -> dict:
        """
        Convert the chart specification to JSON IR.

        Returns:
            Dictionary representing the chart IR
        """
        if self._mark is None:
            raise ValueError("Chart must have a mark before converting to IR")

        # Serialize data: a `_RefProxy` used as chart data (`ref(name)` or
        # `selectAll(name)`) becomes a select spec; an empty `chart()` scope
        # inside a `.layer(...)` chain becomes `{"type": "previous-tier"}` (JS's
        # `LayerBuilder.wireTiers()` derives the auto-name/selectAll wiring from
        # this marker — see `_PREVIOUS_LAYER_MARKS`); otherwise None. The select
        # wire shape is `{"type": "select", "layer": <name>, "mode": "one"|"all"}`
        # — "one" for a singular `ref(name)`, "all" for `selectAll(name)`.
        if self._uses_previous_marks():
            data_ir: Any = {"type": "previous-tier"}
        elif isinstance(self.data, _RefProxy):
            selection = self.data._sel()
            if (
                len(selection) != 1
                or not isinstance(selection[0], str)
            ):
                raise ValueError(
                    "a ref used as chart data must be a flat single-name "
                    "selection (e.g. `ref(\"bars\")` / `selectAll(\"bars\")`); "
                    "token/path refs cannot serialize as chart data"
                )
            data_ir = {
                "type": "select",
                "layer": selection[0],
                "mode": self.data.multiplicity or "one",
            }
        else:
            data_ir = None

        if isinstance(self._mark, _MarkFn):
            mark_ir = {"type": "mark-fn", "lambdaId": self._mark.lambda_id}
        else:
            mark_ir = self._mark.to_dict()

        # Build the IR conditionally: omit optional fields that are unset
        # so the canonical schema's `zOrder: number` (no null) matches
        # what we emit, and consumers don't see spurious `null`s.
        result: dict = {
            "data": data_ir,
            "operators": [op.to_dict() for op in self.operators],
            "mark": mark_ir,
            "options": self.options,
        }
        if self._z_order is not None:
            result["zOrder"] = self._z_order
        return result

    def render(
        self,
        w: int = 800,
        h: int = 600,
        debug: bool = False,
    ):
        """
        Render the chart as an anywidget for Jupyter notebooks.

        Args:
            w: Chart width in pixels
            h: Chart height in pixels
            debug: Whether to enable debug mode

        Returns:
            GoFishChartWidget instance that will display in Jupyter

        Note:
            Axes are a *chart* option, not a render option — pass `axes=...`
            (and `padding=...`) to ``chart(data, axes=True)``, mirroring the
            JS ``Chart(data, { axes: true })``. See ``chart`` for the full
            ``axes`` shape.

        Example:
            >>> data = [{"x": 1, "y": 2}]
            >>> chart(data, axes=True).mark(rect(h="y")).render()
            >>> chart(data).mark(rect(h="y")).render(w=500, h=300)
        """
        if self._mark is None:
            raise ValueError("Chart must have a mark before rendering")

        # Import here to avoid circular dependencies
        from .widget import GoFishChartWidget
        from .arrow_utils import data_to_arrow_bytes, empty_placeholder_arrow_bytes

        # Ref-data charts (`ref(name)` / `selectAll(name)`) have no data of
        # their own — they borrow nodes from a sibling chart.
        if isinstance(self.data, _RefProxy):
            arrow_data = empty_placeholder_arrow_bytes()
        else:
            arrow_data = data_to_arrow_bytes(self.data)

        # Get the IR spec
        spec = self.to_ir()

        # Collect derive functions for RPC execution in the widget
        derive_functions = {
            op.lambda_id: op.fn
            for op in _collect_derive_operators(self.operators)
        }

        # Create and return widget. Axes flow through the chart options
        # (spec["options"]["axes"]), not a render-time trait.
        widget = GoFishChartWidget(
            spec=spec,
            arrow_data=arrow_data,
            derive_functions=derive_functions,
            width=w,
            height=h,
            debug=debug,
        )

        return widget

    def save(self, path, w: int = 800, h: int = 600, debug: bool = False):
        """Save the rendered chart to ``path`` (format inferred from the
        extension — ``.svg`` today; PNG/HTML tracked in #578).

        The SVG is produced by the notebook front-end, so this returns a widget
        that writes the file *once it renders*. Make it the last expression in a
        cell (or otherwise display it) so the render — and the write — happen.
        Truly synchronous, headless export is tracked in #577.

        Example:
            >>> chart(data).mark(rect(h="y")).save("chart.svg")
        """
        widget = self.render(w=w, h=h, debug=debug)
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
        **options: dir ("x"|"y"), spacing, alignment, sharedScale, anchor, glue.
            Also `w`/`h` — a field name or pixel number sizing this operator's
            box (data-driven operator extent, e.g. a mosaic's column width), and
            `size` — a field name, pixel number, or ``field(...)`` accessor
            sizing each split entry along the stack axis;
            `size=field("count").normalize()` makes it a space-filling spine
            (the mosaic/marimekko conditional axis).

    Returns:
        Operator (no children) or Mark (with children).
    """
    if "dir" not in options:
        raise ValueError("spread() requires 'dir' option ('x' or 'y')")
    if children is not None:
        if by is not None:
            raise ValueError(
                "spread() combinator form (with children) does not accept "
                "`by` — the layout is over the explicit child list, not data."
            )
        # Combinator form: the low-level `Spread`/`SpreadOptions` factory
        # additionally takes the full box-dims passthrough (x/y/w/h/key/...),
        # which the v3-operator IR doesn't — stays open (see the `w`/`h` drift
        # note on COMBINATOR_MARKS.spread in the descriptor table).
        return Mark("spread", _children=list(children), **options)
    if by is not None:
        options["by"] = by
    return Operator("spread", **_spread_opts(**options))


def layer(
    children_or_options: Union[List[Any], dict],
    children: Optional[List[Any]] = None,
    **options: Any,
) -> Union["LayerBuilder", "ConstrainableMark"]:
    """Layer marks or charts — a single dual-form `layer` (like spread/stack).

    Two element kinds, dispatched by child type:

    - **Chart tiers** — ``layer([chart(...), chart(...)])`` stacks each chart and
      emits ``{type: "layer", charts: [...]}`` (returns a ``LayerBuilder``). An
      options dict may lead: ``layer({"coord": clock()}, [chart1, chart2])``.
    - **Marks** — ``layer([rect(...).name("a"), ...])`` wraps child marks in a
      layer node (returns a ``ConstrainableMark`` that renders directly), with
      ``.constrain(...)`` for cross-mark constraints::

          layer([
              rect(w=80, h=40).name("a"),
              rect(w=120, h=60).name("b"),
          ]).constrain(lambda a, b: [Constraint.align([a, b], x="end")])

    Mirrors the JS ``layer([...])`` combinator, which is likewise universal over
    charts and marks.
    """
    if isinstance(children_or_options, dict):
        opts = {**children_or_options, **options}
        kids = children or []
    else:
        opts = options
        kids = children_or_options
    # Chart tiers → LayerBuilder; marks → combinator mark.
    if kids and all(isinstance(c, ChartBuilder) for c in kids):
        return LayerBuilder(list(kids), opts or None)
    return ConstrainableMark("layer", _children=list(kids), **opts)


# `enclose` is generated (packages/gofish-python/gofish/_generated.py) —
# pure kwargs-collection, imported above.


# Attribute names reserved on `_RefProxy` so they pass through normal
# Python lookup (Mark fields + methods) rather than being treated as
# selection-path segments. Hits `__getattr__` ONLY when normal lookup
# fails, so this is mostly defensive — but explicit guards make the
# failure mode loud if a child happens to be named e.g. "kwargs".
_REF_PROXY_RESERVED = frozenset({
    "mark_type", "kwargs", "_name", "_labels", "_children", "_is_scope",
    "name", "label", "to_dict", "to_ir", "render", "_copy_meta",
    "_repr_mimebundle_", "constrain", "multiplicity",
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
        # `selectAll(name)` — one ref per matching node. Only meaningful when
        # the proxy is used as chart data; ignored for inline-layout refs.
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

    def to_dict(self) -> dict:
        # `selectAll(...)` is a plural chart-data selector — it has no
        # inline-layout meaning. Chart-data serialization is handled by
        # `ChartBuilder.to_ir`, not here.
        if self.multiplicity == "all":
            raise ValueError(
                "selectAll(...) cannot be used inline in a layout; pass it "
                'as chart data: chart(selectAll("name"))'
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
        if self._translate:
            d["translate"] = self._translate
        return d


def ref(target: Union[str, Token]) -> _RefProxy:
    """
    Reference a previously-named node by selection.

    - `ref("name")` — flat string selection.
    - `ref(token)` — Token returned by `createName(...)`. Subsequent
      `.attr` / `[i]` / `.path(...)` calls extend the selection.

    Two roles, both spelled `ref(...)`:

    - **Inline in a layout**: as a child of a combinator
      (spread/layer/arrow) to insert an already-named-and-resolved node.
    - **As chart data**: `chart(ref("bars"))` borrows the single node named
      "bars" from a sibling chart (requires exactly one match). The plural
      counterpart is `selectAll("bars")`.

    Mirrors JS `ref(...)` (`packages/gofish-graphics/src/ast/shapes/ref.tsx:86`).
    """
    return _RefProxy([target])


def Treemap(  # noqa: N802  — match JS storybook spelling
    children: List["Mark"],
    **options: Any,
) -> Mark:
    """
    Low-level combinator-form treemap.

    Takes a list of pre-data-bound marks (typically `rect(...).bind_data(d, key)`
    or `circle(...).bind_data(d, key)`) and lays them out by the per-leaf
    weight given as `size` — one value per child, in child order (an
    explicit list; there's no per-child data to group here).

        Treemap(
            [rect(fill=datum(genre)).bind_data({"worldwideGross": gross}, genre)
             for genre, gross in groups],
            size=[gross for genre, gross in groups],
            paddingInner=2,
            paddingOuter=2,
            round=True,
            tile="squarify",
        ).render(w=700, h=420)

    Mirrors JS `Treemap({size, ...}, nodes)` from
    `packages/gofish-graphics/src/ast/graphicalOperators/treemap.tsx`.
    """
    return Mark(
        "treemap",
        _children=list(children),
        **_treemap_combinator_opts(**options),
    )


# `arrow` and the region-compositing quartet (Porter-Duff-style
# inside/xor/out/atop, renamed intersect/exclude/subtract/paint per #196/#202,
# plus `over`/`mask`) are generated (packages/gofish-python/gofish/_generated.py)
# — pure kwargs-collection + the `pyName` rename table, imported above. Wire
# `type` strings stay the OLD Porter-Duff spellings ("inside"/"xor"/"out"/
# "atop") per the descriptor's `pyName` — the IR serializer never renamed them
# (COMBINATOR_FACTORIES in tests/harness and
# packages/gofish-graphics/src/serialize/registry.ts are still keyed by the
# old wire types).


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
    across data. Mirrors the v1 `stackX`/`stackY` operators.

        stack([rect(h="A"), rect(h="B")], dir="y")

    Args:
        children: When provided, switches to combinator form. List of child
            Marks to stack.
        by: Field name to partition by (operator form only), or a
            ``field(...)`` accessor carrying domain ops
            (``field("site").sort("yield")``). Omit for per-item stack.
        **options: dir ("x"|"y"), alignment, sharedScale, anchor. Also `w`/`h` —
            a field name or pixel number sizing this operator's box (data-driven
            operator extent, e.g. a mosaic's column width), and `size` — a
            field name, pixel number, or ``field(...)`` accessor sizing each
            split entry along the stack axis; `size=field("count").normalize()`
            makes it a space-filling spine (the mosaic/marimekko conditional
            axis).

    Returns:
        Operator (no children) or Mark (with children).
    """
    if "dir" not in options:
        raise ValueError("stack() requires 'dir' option ('x' or 'y')")
    if children is not None:
        if by is not None:
            raise ValueError(
                "stack() combinator form (with children) does not accept "
                "`by` — the layout is over the explicit child list, not data."
            )
        # Combinator form stays open — see the matching note in spread().
        return Mark("stack", _children=list(children), **options)
    if by is not None:
        options["by"] = by
    # Stays open (not routed through `_stack_opts`'s closed signature): real
    # stories pass `spacing`/`y`/`h`/`label` to the stack OPERATOR even
    # though schema.ts's `StackOperator` doesn't declare them — pre-existing
    # wire-level drift beyond this stage's scope to resolve (would need a
    # schema.ts change, not just a Python-wrapper one).
    return Operator("stack", **options)


def derive(fn: Callable) -> DeriveOperator:
    """
    Derive operator - apply a Python function to transform data.

    Args:
        fn: Function that takes data and returns transformed data

    Returns:
        DeriveOperator object

    A transform may declare measure provenance for its output columns by
    setting `_gofish_measure_provenance` on the callable (e.g. `bin`); it is
    carried into the operator IR so the JS side can re-tag the rows after the
    RPC. This is what lets `derive(bin("X"))` produce `start`/`end` edges that
    unify on X's axis without an explicit `field(name, measure=...)`.
    """
    provenance = getattr(fn, "_gofish_measure_provenance", None)
    return DeriveOperator(fn, provenance)


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


def resolve(cols: List[str], *, from_: Any, key: Optional[str] = None) -> Operator:
    """Resolve reference columns into the drawn nodes they name.

    For each row, the values in ``cols`` are matched against the keyed nodes of
    ``from_`` (a ``selectAll(layerName)``) and replaced in place with the
    matching node ref — a many-to-one dereference (no fan-out, grain preserved).
    Backs node-link edges and label anchoring; pair with ``.layer(chart(table))``
    and ``line(from_=..., to=...)``.

    Args:
        cols: Column names holding references to resolve in place.
        from_: ``selectAll(layerName)`` (or a layer-name string) whose nodes the
            columns are matched against.
        key: Optional match field; defaults to the field those nodes were grouped
            by (e.g. ``scatter(by="id")`` ⇒ match on ``id``).

    Returns:
        Operator object — IR ``{type: "resolve", cols, from, key?}``.
    """
    if isinstance(from_, _RefProxy):
        selection = from_._sel()
        if len(selection) != 1 or not isinstance(selection[0], str):
            raise ValueError('resolve(from_=...) must be selectAll("layerName")')
        from_name = selection[0]
    elif isinstance(from_, str):
        from_name = from_
    else:
        raise TypeError(
            'resolve(from_=...) expects selectAll(name) or a layer-name string'
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
            lambda data: chart(data, coord=clock())
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
        **options:
            x, y: Field-name accessors (str) for position; or arrays for
                  combinator form. Required: at least one of x, y, xMin/xMax,
                  yMin/yMax.
            xMin, xMax, yMin, yMax: Range-form accessors (str) — children span
                                    [xMin[i], xMax[i]] in data space.
            alignment: "start" | "middle" | "end" | "baseline".

    Returns:
        Operator object
    """
    if by is not None:
        options["by"] = by
    return Operator("scatter", **_scatter_opts(**options))


def treemap(
    *,
    by: Optional[Union[str, "FieldAccessor"]] = None,
    **options: Any,
) -> Operator:
    """
    Treemap operator — lay out children in weight-proportional rectangles.

    Args:
        by: Field name to partition rows by (like ``spread``/``group``), or a
            ``field(...)`` accessor carrying domain ops
            (``field("site").sort("yield")``, ``field("genre").drop_nulls()``).
            Without ``by``, one leaf is emitted per row.
        **options: ``size`` (a field name, pixel number, or ``field(...)``
            accessor sizing each leaf's tile area — entry-flagged, one value
            per split entry), ``tile``, ``sort``, ``flipY``, ``paddingInner``,
            ``paddingOuter``, ``round``, ``leafIntrinsicRadiusField``.

    Mirrors JS ``treemap({ by, size, tile, sort, flipY, ... })`` in
    ``.flow()``.
    """
    if by is not None:
        options["by"] = by
    return Operator("treemap", **_treemap_opts(**options))


def table(
    *,
    by: Optional[Dict[str, str]] = None,
    **options: Any,
) -> Operator:
    """
    Table operator — cross-product over two fields, lay out as a 2D grid.

    Args:
        by: Dict with `x` and `y` keys naming the two fields, e.g.
            ``table(by={"x": "model", "y": "year"})``.
        **options: spacing (number or [x_sp, y_sp] tuple), numCols.

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


# Color configuration


def palette(values: Any) -> dict:
    """
    Create a palette color configuration.

    Args:
        values: Palette name (e.g. "tableau10") or list of color strings

    Returns:
        Color config dict for use in chart options
    """
    return {"_tag": "palette", "values": values}


def gradient(stops: Union[str, List[str]]) -> dict:
    """
    Create a gradient color configuration.

    Args:
        stops: Color stop(s) - a single color string or list of color strings

    Returns:
        Color config dict for use in chart options
    """
    return {"_tag": "gradient", "stops": stops}


# Named gradient schemes, mirrored from packages/gofish-graphics/src/ast/colorSchemes.ts.
# Only the gradient-type schemes are needed here; assign_gradient_color() is the
# Python-side counterpart of assignGradientColor() for use inside a derive()
# callback, where the interpolated hex must be byte-identical to chroma-js's
# `chroma.scale(stops).mode("lab")(t).hex()`.
_GRADIENT_SCHEMES: Dict[str, List[str]] = {
    "viridis": ["#440154", "#31688e", "#35b779", "#fde725"],
    "blues": ["#f7fbff", "#deebf7", "#9ecae1", "#3182bd", "#08306b"],
    "reds": ["#fff5f0", "#fc9272", "#de2d26", "#67000d"],
}

# chroma-js Lab constants (D65 white point), transcribed verbatim from
# chroma-js/src/io/lab/lab-constants.js so the Lab<->sRGB round trip below
# matches chroma-js bit-for-bit (both are IEEE-754 doubles).
_LAB_XN = 0.95047
_LAB_YN = 1.0
_LAB_ZN = 1.08883
_LAB_KE = 216.0 / 24389.0
_LAB_KK = 24389.0 / 27.0

_MTX_RGB2XYZ = {
    "m00": 0.4124564390896922,
    "m01": 0.21267285140562253,
    "m02": 0.0193338955823293,
    "m10": 0.357576077643909,
    "m11": 0.715152155287818,
    "m12": 0.11919202588130297,
    "m20": 0.18043748326639894,
    "m21": 0.07217499330655958,
    "m22": 0.9503040785363679,
}
_MTX_XYZ2RGB = {
    "m00": 3.2404541621141045,
    "m01": -0.9692660305051868,
    "m02": 0.055643430959114726,
    "m10": -1.5371385127977166,
    "m11": 1.8760108454466942,
    "m12": -0.2040259135167538,
    "m20": -0.498531409556016,
    "m21": 0.041556017530349834,
    "m22": 1.0572251882231791,
}
# used in rgb2xyz's chromatic adaptation
_LAB_AS = 0.9414285350000001
_LAB_BS = 1.040417467
_LAB_CS = 1.089532651
_MTX_ADAPT_MA = {
    "m00": 0.8951,
    "m01": -0.7502,
    "m02": 0.0389,
    "m10": 0.2664,
    "m11": 1.7135,
    "m12": -0.0685,
    "m20": -0.1614,
    "m21": 0.0367,
    "m22": 1.0296,
}
_MTX_ADAPT_MA_I = {
    "m00": 0.9869929054667123,
    "m01": 0.43230526972339456,
    "m02": -0.008528664575177328,
    "m10": -0.14705425642099013,
    "m11": 0.5183602715367776,
    "m12": 0.04004282165408487,
    "m20": 0.15996265166373125,
    "m21": 0.0492912282128556,
    "m22": 0.9684866957875502,
}
# RefWhiteRGB in chroma-js is D65 too, same as the default Lab white point
_REF_WHITE_RGB = {"X": 0.95047, "Y": 1.0, "Z": 1.08883}


def _hex_to_rgb(hex_color: str) -> tuple[float, float, float]:
    """Parse a `#rgb` / `#rrggbb` hex string into 0-255 rgb components."""
    s = hex_color.lstrip("#")
    if len(s) == 3:
        s = "".join(ch * 2 for ch in s)
    r = int(s[0:2], 16)
    g = int(s[2:4], 16)
    b = int(s[4:6], 16)
    return (float(r), float(g), float(b))


def _gamma_adjust_srgb(companded: float) -> float:
    sign = -1.0 if companded < 0 else (1.0 if companded > 0 else 0.0)
    companded = abs(companded)
    linear = (
        companded / 12.92
        if companded <= 0.04045
        else ((companded + 0.055) / 1.055) ** 2.4
    )
    return linear * sign


def _rgb_to_xyz(r: float, g: float, b: float) -> tuple[float, float, float]:
    r = _gamma_adjust_srgb(r / 255)
    g = _gamma_adjust_srgb(g / 255)
    b = _gamma_adjust_srgb(b / 255)

    m = _MTX_RGB2XYZ
    x = r * m["m00"] + g * m["m10"] + b * m["m20"]
    y = r * m["m01"] + g * m["m11"] + b * m["m21"]
    z = r * m["m02"] + g * m["m12"] + b * m["m22"]

    ma = _MTX_ADAPT_MA
    ad = _LAB_XN * ma["m00"] + _LAB_YN * ma["m10"] + _LAB_ZN * ma["m20"]
    bd = _LAB_XN * ma["m01"] + _LAB_YN * ma["m11"] + _LAB_ZN * ma["m21"]
    cd = _LAB_XN * ma["m02"] + _LAB_YN * ma["m12"] + _LAB_ZN * ma["m22"]

    xx = x * ma["m00"] + y * ma["m10"] + z * ma["m20"]
    yy = x * ma["m01"] + y * ma["m11"] + z * ma["m21"]
    zz = x * ma["m02"] + y * ma["m12"] + z * ma["m22"]

    xx *= ad / _LAB_AS
    yy *= bd / _LAB_BS
    zz *= cd / _LAB_CS

    mai = _MTX_ADAPT_MA_I
    x2 = xx * mai["m00"] + yy * mai["m10"] + zz * mai["m20"]
    y2 = xx * mai["m01"] + yy * mai["m11"] + zz * mai["m21"]
    z2 = xx * mai["m02"] + yy * mai["m12"] + zz * mai["m22"]

    return (x2, y2, z2)


def _xyz_to_lab(x: float, y: float, z: float) -> tuple[float, float, float]:
    xr = x / _LAB_XN
    yr = y / _LAB_YN
    zr = z / _LAB_ZN

    fx = xr ** (1.0 / 3.0) if xr > _LAB_KE else (_LAB_KK * xr + 16.0) / 116.0
    fy = yr ** (1.0 / 3.0) if yr > _LAB_KE else (_LAB_KK * yr + 16.0) / 116.0
    fz = zr ** (1.0 / 3.0) if zr > _LAB_KE else (_LAB_KK * zr + 16.0) / 116.0

    return (116.0 * fy - 16.0, 500.0 * (fx - fy), 200.0 * (fy - fz))


def _rgb_to_lab(r: float, g: float, b: float) -> tuple[float, float, float]:
    x, y, z = _rgb_to_xyz(r, g, b)
    return _xyz_to_lab(x, y, z)


def _lab_to_xyz(lab_l: float, lab_a: float, lab_b: float) -> tuple[float, float, float]:
    fy = (lab_l + 16.0) / 116.0
    fx = 0.002 * lab_a + fy
    fz = fy - 0.005 * lab_b

    fx3 = fx * fx * fx
    fz3 = fz * fz * fz

    xr = fx3 if fx3 > _LAB_KE else (116.0 * fx - 16.0) / _LAB_KK
    yr = ((lab_l + 16.0) / 116.0) ** 3.0 if lab_l > 8.0 else lab_l / _LAB_KK
    zr = fz3 if fz3 > _LAB_KE else (116.0 * fz - 16.0) / _LAB_KK

    return (xr * _LAB_XN, yr * _LAB_YN, zr * _LAB_ZN)


def _compand(linear: float) -> float:
    sign = -1.0 if linear < 0 else (1.0 if linear > 0 else 0.0)
    linear = abs(linear)
    companded = (
        linear * 12.92 if linear <= 0.0031308 else 1.055 * (linear ** (1.0 / 2.4)) - 0.055
    )
    return companded * sign


def _xyz_to_rgb(x: float, y: float, z: float) -> tuple[float, float, float]:
    ma = _MTX_ADAPT_MA
    mai = _MTX_ADAPT_MA_I
    m = _MTX_XYZ2RGB
    rw = _REF_WHITE_RGB

    as_ = _LAB_XN * ma["m00"] + _LAB_YN * ma["m10"] + _LAB_ZN * ma["m20"]
    bs_ = _LAB_XN * ma["m01"] + _LAB_YN * ma["m11"] + _LAB_ZN * ma["m21"]
    cs_ = _LAB_XN * ma["m02"] + _LAB_YN * ma["m12"] + _LAB_ZN * ma["m22"]

    ad = rw["X"] * ma["m00"] + rw["Y"] * ma["m10"] + rw["Z"] * ma["m20"]
    bd = rw["X"] * ma["m01"] + rw["Y"] * ma["m11"] + rw["Z"] * ma["m21"]
    cd = rw["X"] * ma["m02"] + rw["Y"] * ma["m12"] + rw["Z"] * ma["m22"]

    x1 = (x * ma["m00"] + y * ma["m10"] + z * ma["m20"]) * (ad / as_)
    y1 = (x * ma["m01"] + y * ma["m11"] + z * ma["m21"]) * (bd / bs_)
    z1 = (x * ma["m02"] + y * ma["m12"] + z * ma["m22"]) * (cd / cs_)

    x2 = x1 * mai["m00"] + y1 * mai["m10"] + z1 * mai["m20"]
    y2 = x1 * mai["m01"] + y1 * mai["m11"] + z1 * mai["m21"]
    z2 = x1 * mai["m02"] + y1 * mai["m12"] + z1 * mai["m22"]

    r = _compand(x2 * m["m00"] + y2 * m["m10"] + z2 * m["m20"])
    g = _compand(x2 * m["m01"] + y2 * m["m11"] + z2 * m["m21"])
    b = _compand(x2 * m["m02"] + y2 * m["m12"] + z2 * m["m22"])

    return (r * 255, g * 255, b * 255)


def _lab_to_rgb(lab_l: float, lab_a: float, lab_b: float) -> tuple[float, float, float]:
    x, y, z = _lab_to_xyz(lab_l, lab_a, lab_b)
    return _xyz_to_rgb(x, y, z)


def _clip_channel(v: float) -> float:
    return max(0.0, min(255.0, v))


def _rgb_to_hex(r: float, g: float, b: float) -> str:
    ri = round(_clip_channel(r))
    gi = round(_clip_channel(g))
    bi = round(_clip_channel(b))
    return f"#{ri:02x}{gi:02x}{bi:02x}"


def _lab_mix_hex(hex1: str, hex2: str, t: float) -> str:
    """chroma.js `mix(col1, col2, t, 'lab')` — Lab-space linear interpolation."""
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
    gradient(...)` chart option. Reproduces chroma-js's
    `chroma.scale(stops).mode("lab")(t).hex()` byte-for-bit: Lab-space
    (D65, `mode("lab")`) piecewise-linear interpolation across the stops, with
    chroma-js's exact clip-then-`Math.round` behavior converting back to sRGB.

    Args:
        gradient_config: A `gradient(...)` config dict (`{"_tag": "gradient",
            "stops": ...}`).
        t: Interpolation position in [0, 1] (values outside are clamped).

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

    if len(colors) == 1:
        colors = [colors[0], colors[0]]

    n = len(colors)
    positions = [i / (n - 1) for i in range(n)]
    tt = max(0.0, min(1.0, t))

    for i, p in enumerate(positions):
        if tt <= p:
            return colors[i]
        if tt >= p and i == len(positions) - 1:
            return colors[i]
        if tt > p and tt < positions[i + 1]:
            local_t = (tt - p) / (positions[i + 1] - p)
            return _lab_mix_hex(colors[i], colors[i + 1], local_t)

    # unreachable: positions[0] == 0 and tt is clamped to [0, 1]
    return colors[-1]


# Coordinate transforms


# `_polar_config` is generated (packages/gofish-python/gofish/_generated.py)
# from the shared `polarFields` group in the descriptor table — imported
# above. `clock()`/`polar()`/`wavy()` stay hand-written thin wrappers (the
# snake_case-kwarg convention and the `clock`-vs-`polar` type-tag dispatch
# aren't part of the descriptor).


def clock(
    inner_radius: float | None = None,
    central_angle: float | None = None,
    start_angle: float | None = None,
    direction: int | None = None,
    center: tuple[float, float] | list[float] | None = None,
) -> dict:
    """
    Clock coordinate transform — a ``polar()`` preset with 0° at 12 o'clock,
    increasing clockwise (its defaults). Accepts the same options. Use as:
    ``chart(data, coord=clock())``.

    Args:
        inner_radius: donut hole as a fraction [0,1) of the outer radius (e.g. a
            clock rim). Default 0 (filled disc).
        central_angle: total angular sweep in radians. Default 2π (full circle).
        start_angle: angle (radians) of θ=0. Default π/2 (12 o'clock).
        direction: +1 counter-clockwise, -1 clockwise. Default -1.
        center: screen-space center offset [x, y]. Default [0, 0].

    Returns:
        Coord config dict for use in chart options
    """
    return _polar_config(
        "clock",
        inner_radius=inner_radius,
        central_angle=central_angle,
        start_angle=start_angle,
        direction=direction,
        center=center,
    )


def polar(
    inner_radius: float | None = None,
    central_angle: float | None = None,
    start_angle: float | None = None,
    direction: int | None = None,
    center: tuple[float, float] | list[float] | None = None,
) -> dict:
    """
    Polar coordinate transform — angle θ on the x-axis, radius r on the y-axis,
    with 0 at 12 o'clock. Use as: ``chart(data, coord=polar())``.

    The actual transform/domain is reconstructed on the JS side from this tag
    (the function body can't cross the IR bridge), mirroring ``clock()``.

    Args:
        inner_radius: donut hole as a fraction [0,1) of the outer radius.
            Default 0 (filled disc).
        central_angle: total angular sweep in radians. Default 2π (full circle).
        start_angle: angle (radians) of θ=0. Default π/2 (12 o'clock).
        direction: +1 counter-clockwise, -1 clockwise. Default -1 (clockwise).
        center: screen-space center offset [x, y]. Default [0, 0].

    Returns:
        Coord config dict for use in chart/layer options
    """
    return _polar_config(
        "polar",
        inner_radius=inner_radius,
        central_angle=central_angle,
        start_angle=start_angle,
        direction=direction,
        center=center,
    )


def wavy() -> dict:
    """
    Wavy coordinate transform — adds a sinusoidal ripple to both axes. Use as:
    `layer({"coord": wavy()}, [...])`.

    The actual transform/domain is reconstructed on the JS side from this tag
    (the function body can't cross the IR bridge), mirroring `clock()`.

    Returns:
        Coord config dict for use in chart/layer options
    """
    return {"type": "wavy"}


# Layer selection


def selectAll(layer_name: str) -> _RefProxy:
    """
    Select all named nodes from a sibling chart — one ref per matching node.

    The plural counterpart of passing `ref(name)` as chart data (which
    requires exactly one match). Used as the `chart(...)` data argument:
    `chart(selectAll("bars"))`.

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
    The `{type: "field", name, measure?, ops?}` wire shape, as a dict
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
        self, thresholds: Optional[Union[int, float, List[float]]] = None
    ) -> "FieldAccessor":
        """Bin this (numeric) field into groups, REPLACING the base
        grouping. Valid only in a `by` (domain) slot."""
        op: dict = {"op": "bin"}
        if thresholds is not None:
            op["thresholds"] = thresholds
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


def field(name: str, measure: Optional[str] = None) -> FieldAccessor:
    """
    Explicit field-accessor wrapper. Mirrors the JS `field(...)` constructor
    in `packages/gofish-graphics/src/ast/data.ts` (the field/datum/literal
    trichotomy). Equivalent to passing a bare field-name string, plus an
    optional **measure annotation** — a unit-of-measure type claim for the
    channel (see the underlying-space measure system).

    Use the measure annotation when YOUR OWN derive transform has renamed
    fields so the weak field-name default would mis-tag the channel — e.g. a
    lambda that renames a length column to "lo"/"hi":

        scatter(
            xMin=field("lo", measure="Beak Length (mm)"),
            xMax=field("hi", measure="Beak Length (mm)"),
        )

    Built-in transforms like `bin()` declare their output provenance, which now
    travels in the derive operator's IR (see DeriveOperator), so a binned
    histogram's `start`/`end` edges auto-tag with the source field's units — no
    explicit annotation needed.

    The returned `FieldAccessor` is also chainable, mirroring JS's
    `field(...)` pipeline syntax — `field("site").sort("yield")` as an
    operator's `by`, or `field("count").normalize()` as a `spread`/`stack`
    `size` channel (see `FieldAccessor` for the full method list).

    Emits the canonical `{type: "field", name, measure?, ops?}` wire shape; an
    annotation that contradicts known provenance is a type error.

    Args:
        name: The field name to read from each row.
        measure: Optional unit-of-measure annotation for the channel.
    """
    out = FieldAccessor({"type": "field", "name": name})
    if measure is not None:
        out["measure"] = measure
    return out


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
# and gains the real coord aliases (`theta`/`thetaSize`/`r`/`rSize`); `text()`
# drops a phantom `fontWeight=` (also nowhere in JS).


def line(
    children: Optional[List["Mark"]] = None,
    *,
    dir: Optional[str] = None,
    source: Optional[
        Union[str, List[Union[str, float]], Dict[str, Union[str, float]]]
    ] = None,
    target: Optional[
        Union[str, List[Union[str, float]], Dict[str, Union[str, float]]]
    ] = None,
    fill: Optional[str] = None,
    stroke: Optional[str] = None,
    strokeWidth: Optional[int] = None,
    strokeDasharray: Optional[str] = None,
    opacity: Optional[float] = None,
    mixBlendMode: Optional[str] = None,
    curve: Optional[Union[str, Dict[str, Any]]] = None,
    from_: Optional[str] = None,
    to: Optional[str] = None,
    by: Optional[Union[str, "FieldAccessor"]] = None,
    emX: Optional[bool] = None,
    emY: Optional[bool] = None,
    w: Optional[Union[int, float, str]] = None,
    h: Optional[Union[int, float, str]] = None,
) -> Mark:
    """Line mark — a center-mode connector (the path between mark centers).

    Four forms:
      - combinator form ``line([ref(a), ref(b)], dir="x")`` — the low-level
        connector over explicitly listed children (the drop-in for the removed
        ``connect``). ``source``/``target`` pin each endpoint to a normalized
        anchor on its bbox (Bluefish-style ``Line``) instead of the center.
      - bag form ``line(...)`` over a ``selectAll(...)`` ref array (one polyline)
      - bag form with ``by=...`` — partition the ref bag by a field (or
        ``field(...)`` accessor) and draw one polyline per group.
      - pairwise form ``line(from_=..., to=...)`` over rows whose ``from``/``to``
        columns hold refs (one segment per row, after :func:`resolve`).

    ``strokeDasharray`` (e.g. ``"12"``) draws a dashed line, matching
    ``enclose``'s option of the same name.

    ``emX``/``emY``/``w``/``h`` are blank-fusion anchor keys: placed directly
    in ``.mark(...)`` position, ``line(...)`` elaborates to an invisible
    anchor tier (a ``blank()`` carrying just these four keys) plus this
    connector. ``line`` itself ignores them.
    """
    kwargs = _line_opts(
        dir=dir,
        source=source,
        target=target,
        fill=fill,
        stroke=stroke,
        strokeWidth=strokeWidth,
        strokeDasharray=strokeDasharray,
        opacity=opacity,
        mixBlendMode=mixBlendMode,
        curve=curve,
        from_=from_,
        to=to,
        by=by,
        emX=emX,
        emY=emY,
        w=w,
        h=h,
    )
    if children is not None:
        return Mark("line", _children=list(children), **kwargs)
    return Mark("line", **kwargs)


def ribbon(
    children: Optional[List["Mark"]] = None,
    *,
    dir: Optional[str] = None,
    fill: Optional[str] = None,
    stroke: Optional[str] = None,
    strokeWidth: Optional[int] = None,
    opacity: Optional[float] = None,
    mixBlendMode: Optional[str] = None,
    curve: Optional[Union[str, Dict[str, Any]]] = None,
    from_: Optional[str] = None,
    to: Optional[str] = None,
    by: Optional[Union[str, "FieldAccessor"]] = None,
    emX: Optional[bool] = None,
    emY: Optional[bool] = None,
    w: Optional[Union[int, float, str]] = None,
    h: Optional[Union[int, float, str]] = None,
) -> Mark:
    """Ribbon mark — an edge-mode connector: a filled band between the facing
    edges of consecutive marks (areas, streamgraphs, sankey ribbons).

    Four forms, like :func:`line`: combinator form
    ``ribbon([ref(a), ref(b)], dir="x")`` (the low-level connector over listed
    children — drop-in for the removed ``connect``), bag form, bag form with
    ``by=...`` (partition the ref bag by a field and draw one ribbon per
    group), and pairwise form ``ribbon(from_=..., to=...)`` (one band per row,
    after :func:`resolve`).

    ``emX``/``emY``/``w``/``h`` are blank-fusion anchor keys: placed directly
    in ``.mark(...)`` position, ``ribbon(...)`` elaborates to an invisible
    anchor tier (a ``blank()`` carrying just these four keys) plus this
    connector. ``ribbon`` itself ignores them.
    """
    kwargs = _ribbon_opts(
        dir=dir,
        fill=fill,
        stroke=stroke,
        strokeWidth=strokeWidth,
        opacity=opacity,
        mixBlendMode=mixBlendMode,
        curve=curve,
        from_=from_,
        to=to,
        by=by,
        emX=emX,
        emY=emY,
        w=w,
        h=h,
    )
    if children is not None:
        return Mark("ribbon", _children=list(children), **kwargs)
    return Mark("ribbon", **kwargs)


# ─── cut: slice a source shape into N clipped sub-shapes ────────────────────
# Mirrors JS `cut` from
# `packages/gofish-graphics/src/ast/graphicalOperators/cut.tsx`. The Python
# wrapper only emits the `{type:"cut", source, dir, size?, inset?}` IR node;
# extent resolution (the flexbox-style number/datum split) lives entirely on
# the JS side — see the harness/serializer. The SAME IR node serves both
# surfaces:
#   - As a chart `.mark(...)` spec → the v3 expand-mark form (`cutMark`); a
#     field-name string `size` resolves per-row.
#   - As a combinator CHILD (a value dropped into a `Spread`/`Stack` children
#     list) → flat-expanded in place into its N slice nodes via the pure
#     `cut(source, opts)`.


class CutMark(Mark):
    """The `{type:"cut", ...}` IR node — a sliced source shape.

    Stored params live in `kwargs` (`source` is a `Mark`, `dir`/`size`/`inset`
    are plain values) so the inherited `.name()` / `.zOrder()` clone path works;
    `to_dict()` serializes the source mark and drops `None` options.
    """

    def to_dict(self) -> dict:
        source = self.kwargs["source"]
        d: dict = {
            "type": "cut",
            "source": source.to_dict(),
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
    slice nodes in place. Used inside `.mark(...)`, the same node is the v3
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

    def to_dict(self) -> dict:
        child = self.kwargs["child"]
        d: dict = {"type": "offset", "children": [child.to_dict()]}
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
    options: Optional[dict] = None,
    **kwargs: Any,
) -> ChartBuilder:
    """
    Create a new chart builder.

    Chart-level options can be passed either as a positional dict (mirroring
    the JS ``Chart(data, { axes, coord, ... })``) or as keyword arguments —
    both forms are accepted and merged (kwargs win on conflict):

        chart(data, {"color": palette("tableau10")})   # JS-style options object
        chart(data, color=palette("tableau10"))         # keyword form
        chart(data, color=gradient("blues"), coord=clock())

    Axes are a chart option (not a render option). ``axes`` accepts:

        axes=True                      # show both axes, titles inferred
        axes=False                     # no axes
        axes={"x": True, "y": False}   # per-dimension on/off
        axes={"x": {"title": "Year"}}  # custom title (title=False suppresses it)

        chart(data, axes=True)
        chart(data, axes={"x": {"title": "Year"}, "y": True})
        chart(data, coord=clock(), axes=True, padding=80)   # polar chart

    Per-operator overrides use the same shape on spread()/scatter():

        spread(by="species", dir="x", axes={"x": True, "y": False})

    Args:
        data: Input data, or `ref(name)` / `selectAll(name)` for cross-chart
            layer references
        options: Chart options as a dict (JS-style positional object)
        **kwargs: Chart options as keywords — ``axes``, ``color``, ``coord``,
            ``padding``, ... (merged over ``options``)

    Returns:
        ChartBuilder instance
    """
    merged: dict = dict(options) if options else {}
    merged.update(kwargs)
    return ChartBuilder(data, merged if merged else None)


class LayerBuilder:
    """Builder class for composing multiple ChartBuilder instances as a layer."""

    def __init__(
        self,
        children: List[ChartBuilder],
        options: Optional[dict] = None,
        builder_chain: bool = False,
    ):
        self.children = children
        self.options = options or {}
        self._constraints: Optional[List[Any]] = None
        # True only for the fluent ``chart(...).layer(...)`` chain (v3 builder
        # semantics — JS reconstructs it through its own LayerBuilder, inferred
        # axis titles and all). The array form ``layer([chart1, chart2])`` is
        # the low-level combinator (mirrors JS ``layer([...])``), so it stays
        # False and renders without those inferred titles.
        self._builder_chain = builder_chain

    def layer(self, child: ChartBuilder) -> "LayerBuilder":
        """Stack another tier; an empty ``chart()`` scope inherits the marks of
        the immediately preceding tier (see ``ChartBuilder.layer`` — the
        auto-naming/``selectAll`` wiring is JS-side, not resolved here)."""
        return LayerBuilder(
            [*self.children, child],
            self.options,
            builder_chain=True,
        )

    def constrain(self, callback: Callable[..., List[Any]]) -> "LayerBuilder":
        """Apply constraints relating the named children of this layer.

        Mirrors the JS storybook spelling
        ``layer([sc.name("a"), other.name("b")]).constrain(({a, b}) => [...])``:
        each child must be tagged with ``.name(...)`` so the callback can
        reference it. The callback receives one ``RefSentinel`` per named child
        as a kwarg and returns a list of constraint specs
        (``Constraint.align(...)`` / ``Constraint.position(...)`` / ...).

        Returns:
            A new LayerBuilder carrying the resolved constraints.
        """

        def _name_key(child: ChartBuilder) -> Optional[str]:
            n = getattr(child, "_name", None)
            if n is None:
                return None
            return n.tag if isinstance(n, Token) else n

        refs: Dict[str, RefSentinel] = {}
        for child in self.children:
            key = _name_key(child)
            if key is None:
                raise ValueError(
                    "every child of layer(...) used with .constrain() must be "
                    "named via .name(...) so the callback can reference it"
                )
            if key in refs:
                raise ValueError(
                    f".constrain() children must have unique names; saw "
                    f"duplicate: {key!r}"
                )
            refs[key] = RefSentinel(key)

        constraints = callback(**refs)
        new_layer = LayerBuilder(
            self.children, self.options, builder_chain=self._builder_chain
        )
        new_layer._constraints = list(constraints)
        return new_layer

    def to_ir(self) -> dict:
        """Convert the layer specification to JSON IR.

        A fluent ``chart(...).layer(...)`` chain tags the node ``builder: True``
        so JS reconstructs it through the real v3 ``LayerBuilder`` (which owns
        the builder's render logic — inferred axis titles, etc.) rather than the
        low-level ``layer([...])`` combinator. This keeps that logic in one place
        (JS) instead of re-deriving it in the wrapper. The array form
        ``layer([chart1, chart2])`` leaves it off and renders as the low-level
        combinator, mirroring JS ``layer([...])``.
        """
        result: dict = {
            "type": "layer",
            "charts": [child.to_ir() for child in self.children],
            "options": self.options,
        }
        if self._builder_chain:
            result["builder"] = True
        if self._constraints is not None:
            result["constraints"] = [c.to_dict() for c in self._constraints]
        return result

    def render(
        self,
        w: int = 800,
        h: int = 600,
        axes: bool = False,
        debug: bool = False,
    ):
        """
        Render the layer as an anywidget for Jupyter notebooks.

        Args:
            w: Chart width in pixels
            h: Chart height in pixels
            axes: Whether to show axes
            debug: Whether to enable debug mode

        Returns:
            GoFishChartWidget instance that will display in Jupyter
        """
        from .widget import GoFishChartWidget
        from .arrow_utils import data_to_arrow_bytes, empty_placeholder_arrow_bytes

        def _serialize_child_data(child: ChartBuilder) -> bytes:
            """Serialize a child chart's data to raw Arrow IPC bytes.

            ``GoFishChartWidget`` owns the base64/JSON wire encoding (see
            ``arrow_dict`` there) — this only ever hands it plain bytes.
            """
            # Ref-data tiers borrow nodes from a sibling; empty `chart()`
            # scopes (previous-tier) inherit the preceding tier's marks
            # JS-side — neither ships rows of its own.
            if isinstance(child.data, _RefProxy) or child._uses_previous_marks():
                return empty_placeholder_arrow_bytes()

            return data_to_arrow_bytes(child.data)

        # Serialize each child's data and collect derive functions
        arrow_dict: dict = {}
        derive_functions: dict = {}
        for i, child in enumerate(self.children):
            arrow_dict[str(i)] = _serialize_child_data(child)
            for op in _collect_derive_operators(child.operators):
                derive_functions[op.lambda_id] = op.fn

        spec = self.to_ir()

        widget = GoFishChartWidget(
            spec=spec,
            arrow_dict=arrow_dict,
            derive_functions=derive_functions,
            width=w,
            height=h,
            axes=axes,
            debug=debug,
        )
        return widget

    def save(
        self,
        path,
        w: int = 800,
        h: int = 600,
        axes: bool = False,
        debug: bool = False,
    ):
        """Save the layer's render to ``path`` (see ``ChartBuilder.save``)."""
        widget = self.render(w=w, h=h, axes=axes, debug=debug)
        widget.save(path)
        return widget

    def _repr_mimebundle_(self, include=None, exclude=None):
        """Auto-display in notebooks (see ChartBuilder._repr_mimebundle_)."""
        return self.render()._repr_mimebundle_(include=include, exclude=exclude)


