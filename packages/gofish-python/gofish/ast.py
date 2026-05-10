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


class Mark:
    """Base class for chart marks."""

    def __init__(self, mark_type: str, **kwargs):
        self.mark_type = mark_type
        self.kwargs = kwargs
        self._name: Optional[str] = None
        self._label: Optional[dict] = None

    def name(self, layer_name: str) -> "Mark":
        """
        Set a layer name on this mark for cross-chart referencing via select().

        Args:
            layer_name: Name to register this mark's output under

        Returns:
            New Mark with name set
        """
        new_mark = Mark(self.mark_type, **self.kwargs)
        new_mark._name = layer_name
        new_mark._label = self._label
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
            New Mark with label set
        """
        new_mark = Mark(self.mark_type, **self.kwargs)
        new_mark._name = self._name
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
        d: dict = {"type": self.mark_type, **self.kwargs}
        if self._name is not None:
            d["name"] = self._name
        if self._label is not None:
            d["label"] = self._label
        return d


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
    *,
    by: Optional[str] = None,
    **options: Any,
) -> Operator:
    """
    Spread operator — partitions data by `by` (or iterates per-item when
    omitted) and lays out children with spacing along an axis.

    Args:
        by: Field name to partition by. Omit for per-item spread.
        **options: dir ("x"|"y"), spacing, alignment, sharedScale, mode, etc.

    Returns:
        Operator object
    """
    if by is not None:
        options["by"] = by
    if "dir" not in options:
        raise ValueError("spread() requires 'dir' option ('x' or 'y')")
    return Operator("spread", **options)


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
    filter: Optional[str] = None,
    label: Optional[str] = None,
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
    fill: Optional[str] = None,
    fontSize: Optional[Union[int, str]] = None,
    fontWeight: Optional[Union[int, str]] = None,
    label: Optional[str] = None,
    debug: Optional[bool] = None,
) -> Mark:
    """Text mark."""
    kwargs: Dict[str, Any] = {}
    for k, value in [
        ("fill", fill),
        ("fontSize", fontSize),
        ("fontWeight", fontWeight),
        ("label", label),
        ("debug", debug),
    ]:
        if value is not None:
            kwargs[k] = value
    return Mark("text", **kwargs)


def image(
    w: Optional[Union[int, str]] = None,
    h: Optional[Union[int, str]] = None,
    src: Optional[str] = None,
    debug: Optional[bool] = None,
) -> Mark:
    """Image mark."""
    kwargs: Dict[str, Any] = {}
    for k, value in [
        ("w", w),
        ("h", h),
        ("src", src),
        ("debug", debug),
    ]:
        if value is not None:
            kwargs[k] = value
    return Mark("image", **kwargs)


def chart(data: Any, options: Optional[dict] = None) -> ChartBuilder:
    """
    Create a new chart builder.

    Args:
        data: Input data or select() for cross-chart layer references
        options: Optional chart options (w, h, color, etc.)

    Returns:
        ChartBuilder instance
    """
    return ChartBuilder(data, options)


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
