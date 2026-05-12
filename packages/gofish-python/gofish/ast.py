"""AST classes for building GoFish chart specifications."""

from typing import Any, Callable, Dict, List, Optional, TypeVar, Union
import uuid

T = TypeVar("T")


class Operator:
    """Base class for chart operators."""

    def __init__(self, op_type: str, **kwargs):
        self.op_type = op_type
        self.kwargs = kwargs

    def to_dict(self) -> dict:
        """Convert operator to dictionary for JSON IR."""
        return {"type": self.op_type, **self.kwargs}


class DeriveOperator(Operator):
    """Operator for deriving new data via Python function."""

    def __init__(self, fn: Callable):
        super().__init__("derive")
        self.fn = fn
        self.lambda_id = str(uuid.uuid4())

    def to_dict(self) -> dict:
        """Convert to dict - return lambda ID."""
        return {"type": "derive", "lambdaId": self.lambda_id}


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
        self._name: Optional[str] = None
        self._label: Optional[dict] = None
        # When set, this Mark is the combinator form of a layout operator
        # (e.g. `spread([rect, rect], dir="x")`) and `to_dict()` will emit a
        # `__combinator: true` payload the harness/widget reconstructs by
        # calling the JS-side combinator overload.
        self._children: Optional[List["Mark"]] = _children

    def _copy_meta(self, target: "Mark") -> "Mark":
        target._name = self._name
        target._label = self._label
        target._children = self._children
        return target

    def name(self, layer_name: str) -> "Mark":
        """
        Set a layer name on this mark for cross-chart referencing via select().

        Args:
            layer_name: Name to register this mark's output under

        Returns:
            New Mark (same subclass as self) with name set
        """
        new_mark = type(self)(
            self.mark_type, _children=self._children, **self.kwargs
        )
        self._copy_meta(new_mark)
        new_mark._name = layer_name
        return new_mark

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
            d["name"] = self._name
        if self._label is not None:
            d["label"] = self._label
        # Only ConstrainableMark carries _constraints, but reading via getattr
        # keeps the base class oblivious to the subclass extension.
        constraints = getattr(self, "_constraints", None)
        if constraints is not None:
            d["constraints"] = [c.to_dict() for c in constraints]
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


class Constraint:
    """Namespace for low-level constraint factories.

    Mirrors JS `Constraint.align` / `Constraint.distribute` exactly. Both
    return IR carriers consumed by `layer(...).constrain(...)`.
    """

    @staticmethod
    def align(
        refs: List[RefSentinel],
        *,
        x: Optional[str] = None,
        y: Optional[str] = None,
    ) -> AlignConstraint:
        """Align the given refs on one or both axes.

        Args:
            refs: List of RefSentinels (typically the kwargs given to the
                constrain callback).
            x: Optional "start" | "middle" | "end" — alignment on the x-axis.
            y: Optional "start" | "middle" | "end" — alignment on the y-axis.

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
    ) -> DistributeConstraint:
        """Distribute the given refs along an axis.

        Args:
            refs: List of RefSentinels.
            dir: "x" or "y" — required.
            spacing: Number of pixels between successive refs (default 8).
            mode: "edge" (default) or "center" — edge-to-edge or
                center-to-center spacing.
            order: "forward" (default) or "reverse" — distribute in reverse order.
        """
        options: Dict[str, Any] = {"dir": dir}
        if spacing is not None:
            options["spacing"] = spacing
        if mode is not None:
            options["mode"] = mode
        if order is not None:
            options["order"] = order
        return DistributeConstraint(refs, options)


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
        """
        if self._children is None:
            raise ValueError(
                ".constrain() requires combinator children — use "
                "`layer([...]).constrain(...)`"
            )
        child_names: List[str] = []
        for child in self._children:
            if getattr(child, "_name", None) is None:
                raise ValueError(
                    "every child of layer(...) used with .constrain() must be "
                    "named via .name(...) so the callback can reference it"
                )
            child_names.append(child._name)
        refs = {name: RefSentinel(name) for name in child_names}
        constraints = callback(**refs)
        new_mark = type(self)(
            self.mark_type, _children=self._children, **self.kwargs
        )
        self._copy_meta(new_mark)
        new_mark._constraints = list(constraints)
        return new_mark


class LayerSelector:
    """Sentinel object representing a cross-chart layer reference."""

    def __init__(self, layer_name: str):
        self.layer_name = layer_name


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
            data: Input data or LayerSelector for cross-chart references
            options: Chart options (w, h, coord, color, etc.)
            operators: List of operators to apply
        """
        self.data = data
        self.options = options or {}
        self.operators: List[Operator] = operators or []
        self._mark: Optional[Mark] = None
        self._z_order = z_order

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

    def mark(self, mark: Mark) -> "ChartBuilder":
        """
        Set the mark (visual encoding) for the chart.

        Args:
            mark: A mark function (rect, circle, line, etc.)

        Returns:
            New ChartBuilder with mark set
        """
        new_builder = ChartBuilder(
            self.data, self.options, self.operators, z_order=self._z_order
        )
        new_builder._mark = mark
        return new_builder

    def zOrder(self, value: float) -> "ChartBuilder":
        """Set z-order for this chart when rendered inside a Layer."""
        new_builder = ChartBuilder(
            self.data, self.options, self.operators, z_order=value
        )
        new_builder._mark = self._mark
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

        # Serialize data: LayerSelector becomes a select spec, otherwise None
        if isinstance(self.data, LayerSelector):
            data_ir: Any = {"type": "select", "layer": self.data.layer_name}
        else:
            data_ir = None

        return {
            "data": data_ir,
            "operators": [op.to_dict() for op in self.operators],
            "mark": self._mark.to_dict(),
            "options": self.options,
            "zOrder": self._z_order,
        }

    def render(
        self,
        w: int = 800,
        h: int = 600,
        axes: bool = False,
        debug: bool = False,
    ):
        """
        Render the chart as an anywidget for Jupyter notebooks.

        Args:
            w: Chart width in pixels
            h: Chart height in pixels
            axes: Whether to show axes
            debug: Whether to enable debug mode

        Returns:
            GoFishChartWidget instance that will display in Jupyter

        Example:
            >>> data = [{"x": 1, "y": 2}]
            >>> chart(data).mark(rect(h="y")).render()
            >>> chart(data).mark(rect(h="y")).render(w=500, h=300)
        """
        if self._mark is None:
            raise ValueError("Chart must have a mark before rendering")

        # Import here to avoid circular dependencies
        from .widget import GoFishChartWidget
        from .arrow_utils import dataframe_to_arrow
        import pandas as pd

        # LayerSelector charts have no data of their own
        if isinstance(self.data, LayerSelector):
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
            for op in self.operators
            if isinstance(op, DeriveOperator)
        }

        # Create and return widget
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


def ref(name: str) -> Mark:
    """
    Reference a previously-named node by string selection.

    Used as a child of a combinator (spread/layer/arrow) to insert an
    already-named-and-resolved node into the layout — e.g. point an arrow
    at, or align with, a mark whose `.name(...)` matches.

    Mirrors JS `ref("Mercury")` (`packages/gofish-graphics/src/ast/shapes/ref.tsx:86`).
    """
    return Mark("ref", selection=name)


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


# ─── Porter-Duff compositing operators ────────────────────────────────────
# Mirrors JS `over`/`inside`/`xor`/`out`/`atop`/`mask` from
# `packages/gofish-graphics/src/ast/graphicalOperators/porterDuff` (and the
# v3 re-exports in `marks/chart.ts`). Each is a two-children combinator
# whose IR carries the same `__combinator: true` shape as `spread`/`layer`/
# `arrow`. The harness/widget reconstructs by calling the JS factory.


def over(children: List["Mark"], **options: Any) -> Mark:
    """Porter-Duff `over` — destination painted over source."""
    return Mark("over", _children=list(children), **options)


def inside(children: List["Mark"], **options: Any) -> Mark:
    """Porter-Duff `in` — intersection of source and destination."""
    return Mark("inside", _children=list(children), **options)


def xor(children: List["Mark"], **options: Any) -> Mark:
    """Porter-Duff `xor` — symmetric difference of source and destination."""
    return Mark("xor", _children=list(children), **options)


def out(children: List["Mark"], **options: Any) -> Mark:
    """Porter-Duff `out` — source minus destination."""
    return Mark("out", _children=list(children), **options)


def atop(children: List["Mark"], **options: Any) -> Mark:
    """Porter-Duff `atop` — source painted only where destination is."""
    return Mark("atop", _children=list(children), **options)


def mask(children: List["Mark"], **options: Any) -> Mark:
    """Porter-Duff `mask` — alpha-mask compositing."""
    return Mark("mask", _children=list(children), **options)


def stack(
    *,
    by: Optional[str] = None,
    **options: Any,
) -> Operator:
    """
    Stack operator — like spread with no spacing between children.

    Args:
        by: Field name to partition by. Omit for per-item stack.
        **options: dir ("x"|"y"), alignment, sharedScale, mode, etc.

    Returns:
        Operator object
    """
    if by is not None:
        options["by"] = by
    if "dir" not in options:
        raise ValueError("stack() requires 'dir' option ('x' or 'y')")
    return Operator("stack", **options)


def derive(fn: Callable) -> DeriveOperator:
    """
    Derive operator - apply a Python function to transform data.

    Args:
        fn: Function that takes data and returns transformed data

    Returns:
        DeriveOperator object
    """
    return DeriveOperator(fn)


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


# Layer selection


def select(layer_name: str) -> LayerSelector:
    """
    Select a named layer from a previous chart for cross-chart referencing.

    Args:
        layer_name: Name of the layer to select (set via mark.name())

    Returns:
        LayerSelector sentinel for use as chart() data argument
    """
    return LayerSelector(layer_name)


# Literal-value wrapper


def v(value: Any) -> dict:
    """
    Wrap a value so a mark prop reads it as an embedded data-space value.

    Mirrors JS `v(...)` (`packages/gofish-graphics/src/ast/data.ts:10`):
    - `rect(fill=v("Worldwide Gross"))` — use the row's `Worldwide Gross`
      column value as the literal fill color, skipping categorical-color
      encoding.
    - `image(h=v(100))` — declare height 100 as an *embedded* size in data
      space. `inferEmbedded` (see `data.ts`) flips the interval's
      `embedded` flag, which changes how the layout system places the mark
      vs. a plain `h=100` (literal pixel value).

    Args:
        value: A field name string, a literal number, or any value to
            wrap. The harness/widget rebuilds it as a JS `v(value)` call.
    """
    return {"__gofish_v": value}


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
    debug: Optional[bool] = None,
) -> Mark:
    """Circle mark."""
    kwargs: Dict[str, Any] = {}
    for k, value in [
        ("r", r),
        ("fill", fill),
        ("stroke", stroke),
        ("strokeWidth", strokeWidth),
        ("debug", debug),
    ]:
        if value is not None:
            kwargs[k] = value
    return Mark("circle", **kwargs)


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
) -> Mark:
    """Ellipse mark."""
    kwargs: Dict[str, Any] = {}
    for k, value in [
        ("w", w),
        ("h", h),
        ("fill", fill),
        ("stroke", stroke),
        ("strokeWidth", strokeWidth),
        ("debug", debug),
    ]:
        if value is not None:
            kwargs[k] = value
    return Mark("ellipse", **kwargs)


def petal(
    w: Optional[Union[int, str]] = None,
    h: Optional[Union[int, str]] = None,
    fill: Optional[str] = None,
    stroke: Optional[str] = None,
    strokeWidth: Optional[int] = None,
    debug: Optional[bool] = None,
) -> Mark:
    """Petal mark."""
    kwargs: Dict[str, Any] = {}
    for k, value in [
        ("w", w),
        ("h", h),
        ("fill", fill),
        ("stroke", stroke),
        ("strokeWidth", strokeWidth),
        ("debug", debug),
    ]:
        if value is not None:
            kwargs[k] = value
    return Mark("petal", **kwargs)


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


def chart(data: Any, **options: Any) -> ChartBuilder:
    """
    Create a new chart builder.

    Chart-level options (color, coord, etc.) are passed as keyword arguments:

        chart(data, color=palette("tableau10"))
        chart(data, color=gradient("blues"), coord=clock())

    Args:
        data: Input data or select() for cross-chart layer references
        **options: Chart options (color, coord, ...)

    Returns:
        ChartBuilder instance
    """
    return ChartBuilder(data, options if options else None)


class LayerBuilder:
    """Builder class for composing multiple ChartBuilder instances as a layer."""

    def __init__(
        self,
        children: List[ChartBuilder],
        options: Optional[dict] = None,
    ):
        self.children = children
        self.options = options or {}

    def to_ir(self) -> dict:
        """Convert the layer specification to JSON IR."""
        return {
            "type": "layer",
            "charts": [child.to_ir() for child in self.children],
            "options": self.options,
        }

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
            if isinstance(child.data, LayerSelector):
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
            for op in child.operators:
                if isinstance(op, DeriveOperator):
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
