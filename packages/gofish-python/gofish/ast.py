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
        new_op._translate = {
            k: v for k, v in {"x": x, "y": y}.items() if v is not None
        }
        return new_op

    def to_dict(self) -> dict:
        """Convert operator to dictionary for JSON IR."""
        d = {"type": self.op_type, **self.kwargs}
        if self._translate:
            d["translate"] = self._translate
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
        new_op._translate = {
            k: v for k, v in {"x": x, "y": y}.items() if v is not None
        }
        return new_op

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
        self._label: Optional[dict] = None
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
        target._label = self._label
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
        accessor: str,
        position: Optional[str] = None,
        fontSize: Optional[int] = None,
        color: Optional[str] = None,
        offset: Optional[int] = None,
        minSpace: Optional[int] = None,
        rotate: Optional[int] = None,
    ) -> "Mark":
        """
        Attach a label to this mark.

        Args:
            accessor: Field name to use as label text
            position: Label position (e.g. "center", "outset-top", "inset-bottom-start")
            fontSize: Font size in pixels
            color: Label color (auto-contrasted if omitted)
            offset: Offset from shape edge in pixels
            minSpace: Minimum space required to show label
            rotate: Rotation angle in degrees

        Returns:
            New Mark (same subclass as self) with label set
        """
        new_mark = type(self)(
            self.mark_type, _children=self._children, **self.kwargs
        )
        self._copy_meta(new_mark)
        label_spec: Dict[str, Any] = {"accessor": accessor}
        if position is not None:
            label_spec["position"] = position
        if fontSize is not None:
            label_spec["fontSize"] = fontSize
        if color is not None:
            label_spec["color"] = color
        if offset is not None:
            label_spec["offset"] = offset
        if minSpace is not None:
            label_spec["minSpace"] = minSpace
        if rotate is not None:
            label_spec["rotate"] = rotate
        new_mark._label = label_spec
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
        if self._label is not None:
            d["label"] = self._label
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
        import base64
        import json
        from .widget import GoFishChartWidget
        import pyarrow as pa

        schema = pa.schema([pa.field("_placeholder", pa.int32())])
        table = pa.Table.from_arrays([], schema=schema)
        sink = pa.BufferOutputStream()
        with pa.ipc.new_stream(sink, schema) as writer:
            writer.write_table(table)
        arrow_data = sink.getvalue().to_pybytes()

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
            x: Optional `"start" | "middle" | "end"` — alignment on the
                x-axis. Pass a list of the same length as `refs` to assign
                one anchor per child positionally (e.g.
                `["middle", "start"]` aligns the first child's center to
                the second child's start).
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
        mode: Optional[str] = None,
        order: Optional[str] = None,
        glue: Optional[bool] = None,
    ) -> DistributeConstraint:
        """Distribute the given refs along an axis.

        Args:
            refs: List of RefSentinels.
            dir: "x" or "y" — required.
            spacing: Number of pixels between successive refs (default 8).
            mode: "edge" (default) or "center" — edge-to-edge or
                center-to-center spacing.
            order: "forward" (default) or "reverse" — distribute in reverse order.
            glue: Stack semantics — glue the refs together (their sizes sum
                into a position at the layer) instead of slicing a budget.
                Forces `spacing` to 0. Mirrors spread's `glue`.
        """
        options: Dict[str, Any] = {"dir": dir}
        if spacing is not None:
            options["spacing"] = spacing
        if mode is not None:
            options["mode"] = mode
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
        self._connect: Optional["Mark"] = None
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
            mark: A `Mark` (rect/circle/line/...) **or** a callable
                `(data) -> ChartBuilder` — the mark-as-function pattern. The
                callable receives the per-group data slice (after the
                pipeline operators run on the JS side) and returns a new
                ChartBuilder for that slice. Mirrors JS storybook spelling
                `.mark((data) => Chart(data[0].collection, ...).flow(...).mark(...))`.

        Returns:
            New ChartBuilder with mark set
        """
        new_builder = ChartBuilder(
            self.data, self.options, self.operators, z_order=self._z_order
        )
        # Wrap callables in `_MarkFn` so the IR carries a stable lambda_id
        # the derive-server can register and the harness can RPC into.
        if not isinstance(mark, Mark) and callable(mark):
            new_builder._mark = _MarkFn(mark)
        else:
            new_builder._mark = mark
        new_builder._connect = self._connect
        return new_builder

    def connect(self, mark: "Mark") -> "ChartBuilder":
        """
        Overlay a connector mark under this chart's mark nodes.

        Sugar for the ``Layer([...])`` + ``selectAll(name)`` pattern. Only
        one connector per chart is supported; the JS side elaborates it at
        resolve time.

        Args:
            mark: A connector `Mark` (e.g. `line()`, `area()`)

        Returns:
            New ChartBuilder with the connector set
        """
        if self._connect is not None:
            raise ValueError(
                ".connect() was already called on this chart; only one "
                "connector is supported. Use Layer([...]) with "
                "selectAll(name) for additional overlays."
            )
        if not isinstance(mark, Mark):
            raise TypeError(".connect() expects a Mark (e.g. line(), area())")
        new_builder = ChartBuilder(
            self.data, self.options, self.operators, z_order=self._z_order
        )
        new_builder._mark = self._mark
        new_builder._connect = mark
        return new_builder

    def name(self, name_or_token: Union[str, "Token"]) -> "ChartBuilder":
        """Tag this chart with a name so a `Layer([...]).constrain(...)` callback
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
        new_builder._connect = self._connect
        new_builder._name = name_or_token
        return new_builder

    def zOrder(self, value: float) -> "ChartBuilder":
        """Set z-order for this chart when rendered inside a Layer."""
        new_builder = ChartBuilder(
            self.data, self.options, self.operators, z_order=value
        )
        new_builder._mark = self._mark
        new_builder._connect = self._connect
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
        # `selectAll(name)`) becomes a select spec; otherwise None. The wire
        # shape is `{"type": "select", "layer": <name>, "mode": "one"|"all"}`
        # — "one" for a singular `ref(name)`, "all" for `selectAll(name)`.
        if isinstance(self.data, _RefProxy):
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
            data_ir: Any = {
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
        if self._connect is not None:
            result["connect"] = self._connect.to_dict()
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
        from .arrow_utils import dataframe_to_arrow
        import pandas as pd

        # Ref-data charts (`ref(name)` / `selectAll(name)`) have no data of
        # their own — they borrow nodes from a sibling chart.
        if isinstance(self.data, _RefProxy):
            import pyarrow as pa
            schema = pa.schema([pa.field("_placeholder", pa.int32())])
            table = pa.Table.from_arrays([], schema=schema)
            sink = pa.BufferOutputStream()
            with pa.ipc.new_stream(sink, schema) as writer:
                writer.write_table(table)
            arrow_data = sink.getvalue().to_pybytes()
        else:
            # Convert data to Arrow format
            if isinstance(self.data, pd.DataFrame):
                df = self.data
            elif self.data is None:
                df = pd.DataFrame()
            else:
                df = pd.DataFrame(self.data)

            if len(df) == 0:
                import pyarrow as pa
                schema = pa.schema([pa.field("_placeholder", pa.int32())])
                table = pa.Table.from_arrays([], schema=schema)
                sink = pa.BufferOutputStream()
                with pa.ipc.new_stream(sink, schema) as writer:
                    writer.write_table(table)
                arrow_data = sink.getvalue().to_pybytes()
            else:
                arrow_data = dataframe_to_arrow(df)

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
    by: Optional[str] = None,
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
        by: Field name to partition by (operator form only). Omit for
            per-item spread.
        **options: dir ("x"|"y"), spacing, alignment, sharedScale, mode, etc.

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
        return Mark("spread", _children=list(children), **options)
    if by is not None:
        options["by"] = by
    return Operator("spread", **options)


def layer(
    children: List["Mark"],
    **options: Any,
) -> ConstrainableMark:
    """
    Low-level combinator-form layer mark.

    Wraps a list of child marks in a layer node. Children typically carry
    `.name(...)` tags so they can be referenced from a `.constrain(...)`
    callback:

        layer([
            rect(w=80, h=40, fill="#e63946").name("a"),
            rect(w=120, h=60, fill="#457b9d").name("b"),
            rect(w=60, h=30, fill="#2a9d8f").name("c"),
        ]).constrain(lambda a, b, c: [
            Constraint.align([a, b, c], x="end"),
            Constraint.distribute([a, b, c], dir="y", spacing=10),
        ]).render(w=300, h=300)

    Mirrors JS `layer([marks]).constrain(...).render(...)` from
    packages/gofish-graphics/src/ast/marks/chart.ts:367 — a ConstrainableMark
    that renders directly (no Chart wrapper).
    """
    return ConstrainableMark("layer", _children=list(children), **options)


# Attribute names reserved on `_RefProxy` so they pass through normal
# Python lookup (Mark fields + methods) rather than being treated as
# selection-path segments. Hits `__getattr__` ONLY when normal lookup
# fails, so this is mostly defensive — but explicit guards make the
# failure mode loud if a child happens to be named e.g. "kwargs".
_REF_PROXY_RESERVED = frozenset({
    "mark_type", "kwargs", "_name", "_label", "_children", "_is_scope",
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
    or `circle(...).bind_data(d, key)`) and lays them out by the
    `valueField` on each mark's datum.

        Treemap(
            [rect(fill=datum(genre)).bind_data({"worldwideGross": gross}, genre)
             for genre, gross in groups],
            valueField="worldwideGross",
            paddingInner=2,
            paddingOuter=2,
            round=True,
            tile="squarify",
        ).render(w=700, h=420)

    Mirrors JS `Treemap({valueField, ...}, nodes)` from
    `packages/gofish-graphics/src/ast/graphicalOperators/treemap.tsx:62`.
    """
    return Mark("treemap", _children=list(children), **options)


def arrow(
    children: List["Mark"],
    **options: Any,
) -> Mark:
    """
    Low-level combinator-form arrow.

    Takes a list of two (or more) refs / marks and draws an arrow between
    them. Mirrors JS `arrow({stroke?, strokeWidth?, ...}, [from, to])` from
    `packages/gofish-graphics/src/ast/graphicalOperators/arrow.tsx:45`.

        arrow([ref("label"), ref("Mercury")])
        arrow([ref("a"), ref("b")], stroke="red", strokeWidth=2)
    """
    return Mark("arrow", _children=list(children), **options)


# ─── Region-compositing combinators (Porter-Duff) ──────────────────────────
# Mirrors the JS region-compositing operators from
# `packages/gofish-graphics/src/ast/graphicalOperators/porterDuff` (and the
# v3 re-exports in `marks/chart.ts`). Each is a two-children combinator whose
# IR carries the same `__combinator: true` shape as `spread`/`layer`/`arrow`.
# The harness/widget reconstructs by calling the JS factory.
#
# PR #404's Stage-2 rename (#196/#202) renamed the public Porter-Duff exports
# to Figma-inspired names:
#   inside → intersect, xor → exclude, out → subtract, atop → paint.
# `over` stays internal-for-IR (conceptually `layer`, #196) — prefer `layer`
# in user code. Only the Python user-facing NAMES changed: the emitted IR wire
# `type` strings stay the OLD spellings ("inside"/"xor"/"out"/"atop"), which the
# IR serializer never renamed (the COMBINATOR_FACTORIES map in tests/harness and
# packages/gofish-graphics/src/serialize/registry.ts is still keyed by the old
# wire types). This divergence mirrors the matching comments there.


def over(children: List["Mark"], **options: Any) -> Mark:
    """Region union — destination painted over source.

    Internal-for-IR: emits the "over" wire type, but the JS side treats it as
    a `layer`. Prefer `layer(...)` in user code; this is re-exported only so the
    low-level Union demo can mirror the JS storybook.
    """
    return Mark("over", _children=list(children), **options)


def intersect(children: List["Mark"], **options: Any) -> Mark:
    """Region intersection — keep only where source and destination overlap.

    Renamed from `inside` (#196/#202). Emits the OLD "inside" wire type.
    """
    return Mark("inside", _children=list(children), **options)


def exclude(children: List["Mark"], **options: Any) -> Mark:
    """Region symmetric difference — keep where exactly one of source /
    destination is present.

    Renamed from `xor` (#196/#202). Emits the OLD "xor" wire type.
    """
    return Mark("xor", _children=list(children), **options)


def subtract(children: List["Mark"], **options: Any) -> Mark:
    """Region difference — source minus destination.

    Renamed from `out` (#196/#202). Emits the OLD "out" wire type.
    """
    return Mark("out", _children=list(children), **options)


def paint(children: List["Mark"], **options: Any) -> Mark:
    """Region paint — source painted only where destination is.

    Renamed from `atop` (#196/#202). Emits the OLD "atop" wire type.
    """
    return Mark("atop", _children=list(children), **options)


def mask(children: List["Mark"], **options: Any) -> Mark:
    """Alpha-mask compositing (unchanged name)."""
    return Mark("mask", _children=list(children), **options)


def stack(
    children: Optional[List["Mark"]] = None,
    *,
    by: Optional[str] = None,
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
        by: Field name to partition by (operator form only). Omit for
            per-item stack.
        **options: dir ("x"|"y"), alignment, sharedScale, mode, etc.

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
        return Mark("stack", _children=list(children), **options)
    if by is not None:
        options["by"] = by
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


def group(*, by: str, **options: Any) -> Operator:
    """
    Group operator — partition data by `by`, wrap each group in a frame.

    Args:
        by: Field name to group by.

    Returns:
        Operator object
    """
    options["by"] = by
    return Operator("group", **options)


def scatter(
    *,
    by: Optional[str] = None,
    **options: Any,
) -> Operator:
    """
    Scatter operator — position children at per-group means (when `by` is
    given) or per-item (when omitted).

    Args:
        by: Field name to group by. Omit for per-item scatter.
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
    return Operator("scatter", **options)


def treemap(**options: Any) -> Operator:
    """
    Treemap operator — lay out children in fare/weight-proportional rectangles.

    Mirrors JS ``treemap({ valueField, tile, sort, flipY, ... })`` in
    ``.flow()``.
    """
    return Operator("treemap", **options)


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
    return Operator("table", **options)


def log(label: Optional[str] = None) -> Operator:
    """
    Log operator - logs data to the console for debugging.

    Args:
        label: Optional label to prefix the log output

    Returns:
        Operator object
    """
    kwargs: Dict[str, Any] = {}
    if label is not None:
        kwargs["label"] = label
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


# Coordinate transforms


def clock() -> dict:
    """
    Clock coordinate transform — polar coordinates with 0° at 12 o'clock,
    increasing clockwise. Use as: chart(data, {"coord": clock()}).

    Returns:
        Coord config dict for use in chart options
    """
    return {"type": "clock"}


def polar() -> dict:
    """
    Polar coordinate transform — angle θ on the x-axis, radius r on the y-axis,
    with 0 at 12 o'clock. Use as: `layer({"coord": polar()}, [...])`.

    The actual transform/domain is reconstructed on the JS side from this tag
    (the function body can't cross the IR bridge), mirroring `clock()`.

    Returns:
        Coord config dict for use in chart/layer options
    """
    return {"type": "polar"}


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


def field(name: str, measure: Optional[str] = None) -> dict:
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

    Emits the canonical `{type: "field", name, measure?}` wire shape; an
    annotation that contradicts known provenance is a type error.

    Args:
        name: The field name to read from each row.
        measure: Optional unit-of-measure annotation for the channel.
    """
    out: dict = {"type": "field", "name": name}
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


def rect(
    w: Optional[Union[int, str]] = None,
    h: Optional[Union[int, str]] = None,
    fill: Optional[str] = None,
    stroke: Optional[str] = None,
    strokeWidth: Optional[int] = None,
    opacity: Optional[float] = None,
    rx: Optional[int] = None,
    ry: Optional[int] = None,
    emX: Optional[bool] = None,
    emY: Optional[bool] = None,
    rs: Optional[int] = None,
    ts: Optional[int] = None,
    x: Optional[Union[int, str]] = None,
    y: Optional[Union[int, str]] = None,
    cx: Optional[Union[int, str]] = None,
    cy: Optional[Union[int, str]] = None,
    x2: Optional[Union[int, str]] = None,
    y2: Optional[Union[int, str]] = None,
    aspectRatio: Optional[float] = None,
    filter: Optional[str] = None,
    label: Optional[Union[bool, str]] = None,
    key: Optional[str] = None,
    debug: Optional[bool] = None,
) -> Mark:
    """Rectangle mark."""
    kwargs: Dict[str, Any] = {}
    for k, value in [
        ("w", w),
        ("h", h),
        ("fill", fill),
        ("stroke", stroke),
        ("strokeWidth", strokeWidth),
        ("opacity", opacity),
        ("rx", rx),
        ("ry", ry),
        ("emX", emX),
        ("emY", emY),
        ("rs", rs),
        ("ts", ts),
        ("x", x),
        ("y", y),
        ("cx", cx),
        ("cy", cy),
        ("x2", x2),
        ("y2", y2),
        ("aspectRatio", aspectRatio),
        ("filter", filter),
        ("label", label),
        ("key", key),
        ("debug", debug),
    ]:
        if value is not None:
            kwargs[k] = value
    return Mark("rect", **kwargs)


def circle(
    r: Optional[Union[int, str]] = None,
    fill: Optional[str] = None,
    stroke: Optional[str] = None,
    strokeWidth: Optional[int] = None,
    opacity: Optional[float] = None,
    label: Optional[Union[bool, str]] = None,
    debug: Optional[bool] = None,
    **kwargs: Any,
) -> Mark:
    """Circle mark. Extra channels (`x`, `y`, `cx`, …) accepted via `**kwargs`."""
    mark_kwargs: Dict[str, Any] = {}
    for k, value in [
        ("r", r),
        ("fill", fill),
        ("stroke", stroke),
        ("strokeWidth", strokeWidth),
        ("opacity", opacity),
        ("label", label),
        ("debug", debug),
    ]:
        if value is not None:
            mark_kwargs[k] = value
    mark_kwargs.update(kwargs)
    return Mark("circle", **mark_kwargs)


def line(
    stroke: Optional[str] = None,
    strokeWidth: Optional[int] = None,
    opacity: Optional[float] = None,
    interpolation: Optional[str] = None,
) -> Mark:
    """Line mark."""
    kwargs: Dict[str, Any] = {}
    for k, value in [
        ("stroke", stroke),
        ("strokeWidth", strokeWidth),
        ("opacity", opacity),
        ("interpolation", interpolation),
    ]:
        if value is not None:
            kwargs[k] = value
    return Mark("line", **kwargs)


def area(
    stroke: Optional[str] = None,
    strokeWidth: Optional[int] = None,
    opacity: Optional[float] = None,
    mixBlendMode: Optional[str] = None,
    dir: Optional[str] = None,
    interpolation: Optional[str] = None,
) -> Mark:
    """Area mark."""
    kwargs: Dict[str, Any] = {}
    for k, value in [
        ("stroke", stroke),
        ("strokeWidth", strokeWidth),
        ("opacity", opacity),
        ("mixBlendMode", mixBlendMode),
        ("dir", dir),
        ("interpolation", interpolation),
    ]:
        if value is not None:
            kwargs[k] = value
    return Mark("area", **kwargs)


def blank(
    w: Optional[Union[int, str]] = None,
    h: Optional[Union[int, str]] = None,
    **kwargs: Any,
) -> Mark:
    """Blank mark - invisible guide for positioning."""
    blank_kwargs: Dict[str, Any] = {}
    if w is not None:
        blank_kwargs["w"] = w
    if h is not None:
        blank_kwargs["h"] = h
    blank_kwargs.update(kwargs)
    return Mark("blank", **blank_kwargs)


def ellipse(
    w: Optional[Union[int, str]] = None,
    h: Optional[Union[int, str]] = None,
    fill: Optional[str] = None,
    stroke: Optional[str] = None,
    strokeWidth: Optional[int] = None,
    debug: Optional[bool] = None,
    **kwargs: Any,
) -> Mark:
    """Ellipse mark.

    Extra positioning channels (`x`, `y`, `cx`, `cy`, `emX`, …) accepted via
    `**kwargs`, matching JS `ellipse({...})` which takes the full shape-channel
    set — the low-level stories position ellipses with `x`/`cx`/`cy`.
    """
    mark_kwargs: Dict[str, Any] = {}
    for k, value in [
        ("w", w),
        ("h", h),
        ("fill", fill),
        ("stroke", stroke),
        ("strokeWidth", strokeWidth),
        ("debug", debug),
    ]:
        if value is not None:
            mark_kwargs[k] = value
    mark_kwargs.update(kwargs)
    return Mark("ellipse", **mark_kwargs)


def petal(
    w: Optional[Union[int, str]] = None,
    h: Optional[Union[int, str]] = None,
    fill: Optional[str] = None,
    stroke: Optional[str] = None,
    strokeWidth: Optional[int] = None,
    debug: Optional[bool] = None,
    **kwargs: Any,
) -> Mark:
    """Petal mark. Extra channels (`x`, `cx`, …) accepted via `**kwargs`."""
    mark_kwargs: Dict[str, Any] = {}
    for k, value in [
        ("w", w),
        ("h", h),
        ("fill", fill),
        ("stroke", stroke),
        ("strokeWidth", strokeWidth),
        ("debug", debug),
    ]:
        if value is not None:
            mark_kwargs[k] = value
    mark_kwargs.update(kwargs)
    return Mark("petal", **mark_kwargs)


def text(
    text: Optional[Any] = None,
    fill: Optional[str] = None,
    fontSize: Optional[Union[int, str]] = None,
    fontWeight: Optional[Union[int, str]] = None,
    fontFamily: Optional[str] = None,
    debugBoundingBox: Optional[bool] = None,
    label: Optional[str] = None,
    debug: Optional[bool] = None,
) -> Mark:
    """Text mark.

    Args:
        text: String content, a field-name accessor, or a callable
            `(row) -> str`. Callables are routed through the same derive RPC
            as `derive()` operators — `ChartBuilder.mark()` walks the mark
            tree, registers the callable, and prepends a derive step that
            populates an auto-generated field per row.
        fill: Text color.
        fontSize / fontWeight / fontFamily: Typography.
        debugBoundingBox: Draw the text's bounding box (for layout debug).
        label: Auto-value-label flag (different from text content).
    """
    if (
        text is not None
        and not isinstance(text, (str, int, float, bool))
        and callable(text)
    ):
        text = _PendingAccessor(text)
    kwargs: Dict[str, Any] = {}
    for k, value in [
        ("text", text),
        ("fill", fill),
        ("fontSize", fontSize),
        ("fontWeight", fontWeight),
        ("fontFamily", fontFamily),
        ("debugBoundingBox", debugBoundingBox),
        ("label", label),
        ("debug", debug),
    ]:
        if value is not None:
            kwargs[k] = value
    return Mark("text", **kwargs)


def image(
    href: Optional[str] = None,
    w: Optional[Union[int, str]] = None,
    h: Optional[Union[int, str]] = None,
    x: Optional[Union[int, str]] = None,
    y: Optional[Union[int, str]] = None,
    debug: Optional[bool] = None,
) -> Mark:
    """Image mark.

    Args:
        href: URL of the image. Matches the JS storybook spelling
            (`image({href: ...})`). For local files in the parity-test
            environment, use Vite's `/@fs/<absolute-path>` form.
        w, h: Width/height.
        x, y: Position.
    """
    kwargs: Dict[str, Any] = {}
    for k, value in [
        ("href", href),
        ("w", w),
        ("h", h),
        ("x", x),
        ("y", y),
        ("debug", debug),
    ]:
        if value is not None:
            kwargs[k] = value
    return Mark("image", **kwargs)


def polygon(
    points: List[List[float]],
    fill: Optional[str] = None,
    stroke: Optional[str] = None,
    strokeWidth: Optional[float] = None,
    debug: Optional[bool] = None,
) -> Mark:
    """Polygon mark — closed polygon from explicit local-coord points.

    Args:
        points: Vertices `[[x, y], ...]` in local coordinates. GoFish is
            y-up: `[0, 0]` is the bottom-left.
        fill: Fill color.
        stroke: Stroke color (defaults to `fill`).
        strokeWidth: Stroke width.

    Mirrors JS `polygon({ points, fill?, stroke?, strokeWidth? })` from
    `packages/gofish-graphics/src/ast/shapes/polygon.tsx`.
    """
    kwargs: Dict[str, Any] = {"points": points}
    for k, value in [
        ("fill", fill),
        ("stroke", stroke),
        ("strokeWidth", strokeWidth),
        ("debug", debug),
    ]:
        if value is not None:
            kwargs[k] = value
    return Mark("polygon", **kwargs)


def connect(
    children: List["Mark"],
    *,
    source: Optional[
        Union[str, List[Union[str, float]], Dict[str, Union[str, float]]]
    ] = None,
    target: Optional[
        Union[str, List[Union[str, float]], Dict[str, Union[str, float]]]
    ] = None,
    stroke: Optional[str] = None,
    strokeWidth: Optional[float] = None,
    fill: Optional[str] = None,
    opacity: Optional[float] = None,
    mixBlendMode: Optional[str] = None,
    interpolation: Optional[str] = None,
    direction: Optional[Union[str, int]] = None,
    mode: Optional[str] = None,
) -> Mark:
    """Low-level combinator-form connector.

    Draws a connector (line) between each consecutive pair of children.
    Children are typically `ref(...)` calls pointing at named elements
    placed by an earlier tier.

    Anchor mode (recommended): provide `source` and/or `target` as one of:
        - `"start"` | `"middle"` | `"end"` (single keyword, both axes)
        - `["start", "middle"]` (tuple, per-axis)
        - `{"x": "start", "y": 0.5}` (axis-keyed dict; omitted axis = 0.5)

    Where `start` → 0, `middle` → 0.5, `end` → 1. GoFish is y-up. If only
    one anchor is given, the other endpoint is the same point clamped onto
    the opposite bbox per axis (Bluefish `Line` behavior).

    Edge mode (no anchors): falls back to routing between the children's
    facing edges along `direction`.

    Mirrors JS `connect({source?, target?, stroke?, ...}, [m1, m2, ...])`
    from `packages/gofish-graphics/src/ast/graphicalOperators/connect.tsx`.
    """
    options: Dict[str, Any] = {}
    for k, value in [
        ("source", source),
        ("target", target),
        ("stroke", stroke),
        ("strokeWidth", strokeWidth),
        ("fill", fill),
        ("opacity", opacity),
        ("mixBlendMode", mixBlendMode),
        ("interpolation", interpolation),
        ("direction", direction),
        ("mode", mode),
    ]:
        if value is not None:
            options[k] = value
    return Mark("connect", _children=list(children), **options)


# JS exports both spellings (`connect` and `Connect`); mirror that.
Connect = connect


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
    data: Any, options: Optional[dict] = None, **kwargs: Any
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
    ):
        self.children = children
        self.options = options or {}
        self._constraints: Optional[List[Any]] = None

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
                    "every child of Layer(...) used with .constrain() must be "
                    "named via .name(...) so the callback can reference it"
                )
            if key in refs:
                raise ValueError(
                    f".constrain() children must have unique names; saw "
                    f"duplicate: {key!r}"
                )
            refs[key] = RefSentinel(key)

        constraints = callback(**refs)
        new_layer = LayerBuilder(self.children, self.options)
        new_layer._constraints = list(constraints)
        return new_layer

    def to_ir(self) -> dict:
        """Convert the layer specification to JSON IR."""
        result: dict = {
            "type": "layer",
            "charts": [child.to_ir() for child in self.children],
            "options": self.options,
        }
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
        import base64
        import json
        from .widget import GoFishChartWidget
        from .arrow_utils import dataframe_to_arrow
        import pandas as pd
        import pyarrow as pa

        def _serialize_child_data(child: ChartBuilder) -> str:
            """Serialize a child chart's data to base64 Arrow bytes."""
            if isinstance(child.data, _RefProxy):
                schema = pa.schema([pa.field("_placeholder", pa.int32())])
                table = pa.Table.from_arrays([], schema=schema)
                sink = pa.BufferOutputStream()
                with pa.ipc.new_stream(sink, schema) as writer:
                    writer.write_table(table)
                return base64.b64encode(sink.getvalue().to_pybytes()).decode("ascii")

            if isinstance(child.data, pd.DataFrame):
                df = child.data
            elif child.data is None:
                df = pd.DataFrame()
            else:
                df = pd.DataFrame(child.data)

            if len(df) == 0:
                schema = pa.schema([pa.field("_placeholder", pa.int32())])
                table = pa.Table.from_arrays([], schema=schema)
                sink = pa.BufferOutputStream()
                with pa.ipc.new_stream(sink, schema) as writer:
                    writer.write_table(table)
                return base64.b64encode(sink.getvalue().to_pybytes()).decode("ascii")

            return base64.b64encode(dataframe_to_arrow(df)).decode("ascii")

        # Serialize each child's data and collect derive functions
        arrow_dict: dict = {}
        derive_functions: dict = {}
        for i, child in enumerate(self.children):
            arrow_dict[str(i)] = _serialize_child_data(child)
            for op in _collect_derive_operators(child.operators):
                derive_functions[op.lambda_id] = op.fn

        arrow_data = json.dumps(arrow_dict)
        spec = self.to_ir()

        widget = GoFishChartWidget(
            spec=spec,
            arrow_data=arrow_data,
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


def Layer(
    children_or_options: Union[List[ChartBuilder], dict],
    children: Optional[List[ChartBuilder]] = None,
) -> LayerBuilder:
    """
    Compose multiple ChartBuilder instances as a layered chart.

    Two calling conventions:
        Layer([chart1, chart2])
        Layer({"coord": clock()}, [chart1, chart2])

    Args:
        children_or_options: List of ChartBuilders, or options dict
        children: List of ChartBuilders (when first arg is options dict)

    Returns:
        LayerBuilder instance
    """
    if isinstance(children_or_options, list):
        return LayerBuilder(children_or_options)
    else:
        return LayerBuilder(children or [], children_or_options)
