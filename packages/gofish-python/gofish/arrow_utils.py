"""Dataframe-agnostic ingestion + Arrow-format wire encoding.

Chart data can arrive as a plain list of dict rows, or as a dataframe from
any backend — pandas, polars, pyarrow, a DuckDB relation, etc. This module
is the one place that ingests those shapes and turns them into Apache Arrow,
the hand-off format the JS widget actually consumes (Arrow IPC bytes over
the anywidget trait channel). Everything upstream of this module (chart
builders, `join()`, the derive-callback bridge) should call `to_arrow_table`
or `data_to_arrow_bytes` rather than branching on `isinstance(x, pd.DataFrame)`
itself — narwhals (https://narwhals-dev.github.io/narwhals/) is what makes a
single code path transparently support every backend, so pandas is no longer
a hard runtime dependency of this package.
"""

from typing import Any, List

import narwhals as nw
import pyarrow as pa

_SUPPORTED_INPUTS_MSG = (
    "a list of dict rows, or a dataframe supported by narwhals "
    "(pandas, polars, pyarrow, DuckDB relation, etc.)"
)


def to_arrow_table(data: Any) -> pa.Table:
    """
    Ingest chart/layer/derive data of *any* supported shape into a
    `pyarrow.Table`. This is the single ingestion choke point: every call
    site that used to branch on `isinstance(data, pd.DataFrame)` now just
    calls this (or `data_to_arrow_bytes`, below).

    Supported shapes:
        - A list of dict rows (including `[]`) — built directly with
          `pa.Table.from_pylist`, no dataframe library involved.
        - A `pyarrow.Table` — returned as-is.
        - Any dataframe/lazyframe narwhals recognizes (pandas, polars,
          pyarrow, DuckDB relation, cuDF, Modin, ...) — routed through
          `narwhals.from_native`. Lazy frames are collected before the
          Arrow export, since the wire format is always a materialized
          table.

    Anything else raises `TypeError` naming the actual type received and
    the supported inputs, rather than failing deep inside pandas/pyarrow
    with an opaque message.

    Args:
        data: List of dict rows, or a narwhals-supported dataframe.

    Returns:
        A `pyarrow.Table`.

    Example:
        >>> to_arrow_table([{"x": 1, "y": 2}])
        >>> to_arrow_table(pd.DataFrame({"x": [1, 2]}))
        >>> to_arrow_table(pl.DataFrame({"x": [1, 2]}))
    """
    if isinstance(data, (list, tuple)):
        return pa.Table.from_pylist(list(data))

    if isinstance(data, pa.Table):
        return data

    try:
        nwdata = nw.from_native(data)
    except TypeError as exc:
        raise TypeError(
            f"Unsupported chart data type: {type(data).__name__!r}. "
            f"Expected {_SUPPORTED_INPUTS_MSG}."
        ) from exc

    if isinstance(nwdata, nw.LazyFrame):
        nwdata = nwdata.collect()

    return nwdata.to_arrow()


def _downcast_wide_ints(table: pa.Table) -> pa.Table:
    """
    Convert Int64/UInt64 columns to Int32/UInt32 where the values fit, to
    avoid BigInt issues in JavaScript (JS numbers safely represent
    integers only up to 2**53, and the Arrow JS bindings surface 64-bit
    integer columns as `BigInt64Array`, which most chart code doesn't
    expect). This is safe for the reasonable-magnitude values charting
    data has in practice; if a column doesn't fit, it's left at its
    original width.
    """
    fields = []
    arrays = []
    schema_changed = False
    for i, field in enumerate(table.schema):
        array = table.column(i)
        if pa.types.is_int64(field.type) or pa.types.is_uint64(field.type):
            try:
                new_type = pa.int32() if pa.types.is_int64(field.type) else pa.uint32()
                array = array.cast(new_type, safe=True)
                fields.append(pa.field(field.name, new_type))
                schema_changed = True
            except (pa.ArrowInvalidError, OverflowError):
                # Values too large to fit — keep the original width.
                fields.append(field)
        else:
            fields.append(field)
        arrays.append(array)

    if schema_changed:
        table = pa.Table.from_arrays(arrays, schema=pa.schema(fields))
    return table


def arrow_table_to_bytes(table: pa.Table) -> bytes:
    """
    Serialize a `pyarrow.Table` to Arrow IPC format (bytes), applying the
    Int64/UInt64 -> Int32/UInt32 downcast described in `_downcast_wide_ints`.

    Args:
        table: `pyarrow.Table` to serialize.

    Returns:
        Arrow IPC format bytes.
    """
    table = _downcast_wide_ints(table)
    sink = pa.BufferOutputStream()
    with pa.ipc.new_stream(sink, table.schema) as writer:
        writer.write_table(table)
    return sink.getvalue().to_pybytes()


def data_to_arrow_bytes(data: Any) -> bytes:
    """
    Full ingestion pipeline from chart/layer/derive data to the Arrow IPC
    wire bytes the widget expects: `None` or zero rows become the shared
    placeholder table; anything else goes through `to_arrow_table` and
    `arrow_table_to_bytes`.

    This is the one function `ChartBuilder.render`, `LayerBuilder.render`,
    `join()`, and the derive-callback bridge in `widget.py` should call —
    none of them should branch on the input's dataframe backend themselves.

    Args:
        data: `None`, a list of dict rows, or a narwhals-supported dataframe.

    Returns:
        Arrow IPC format bytes.
    """
    if data is None:
        return empty_placeholder_arrow_bytes()

    table = to_arrow_table(data)
    if table.num_rows == 0:
        return empty_placeholder_arrow_bytes()

    return arrow_table_to_bytes(table)


def to_records(data: Any) -> List[dict]:
    """
    Ingest data of any supported shape (see `to_arrow_table`) and return it
    as a plain list of dict rows — used where the caller needs JSON-able
    rows rather than an Arrow table (e.g. `join()`'s right-hand table,
    which is inlined into the IR as JSON).

    Args:
        data: List of dict rows, or a narwhals-supported dataframe.

    Returns:
        A list of dicts, one per row, in column order.
    """
    return to_arrow_table(data).to_pylist()


def empty_placeholder_arrow_bytes() -> bytes:
    """
    Arrow IPC bytes for an empty table with a single dummy `_placeholder`
    column — the wire payload for a chart tier that has no data of its own
    (a `ref`/`selectAll` chart borrowing nodes from a sibling, or a tier
    whose data is `None`/empty). The widget only needs *some* valid Arrow
    stream; the placeholder column is never read.

    Extracted so `Mark.render`, `ChartBuilder.render`, and
    `LayerBuilder.render`'s `_serialize_child_data` all emit byte-identical
    empty tables from one place instead of re-deriving the schema/sink/
    writer boilerplate.

    Example:
        >>> arrow_data = empty_placeholder_arrow_bytes()
    """
    schema = pa.schema([pa.field("_placeholder", pa.int32())])
    # NOTE: the copy-pasted originals built this via
    # `pa.Table.from_arrays([], schema=schema)`, which modern pyarrow rejects
    # ("Schema and number of arrays unequal" — one field, zero arrays), so any
    # widget render hitting this path crashed. `empty_table()` is the
    # supported spelling for the same 0-row, 1-column table.
    table = schema.empty_table()
    sink = pa.BufferOutputStream()
    with pa.ipc.new_stream(sink, schema) as writer:
        writer.write_table(table)
    return sink.getvalue().to_pybytes()


def arrow_to_records(arrow_bytes: bytes) -> list:
    """
    Convert Apache Arrow bytes back to a list of plain-dict rows.

    Deliberately bypasses pandas for this: pandas' `to_pandas()` decodes a
    `list<struct>` column (the JS-side widget transport's explicit-schema
    encoding for a mark-fn's multi-row `datum` bag — see
    `widget-src/arrowTransport.ts`, issue #783) into a numpy `ndarray` of
    dicts rather than a plain Python `list` of dicts, which doesn't match
    the plain-JSON-over-HTTP shape the parity test harness's derive server
    hands a mark-fn (`tests/scripts/derive-server.py`).
    `pyarrow.Array.to_pylist()` decodes straight to native Python
    containers — `list`/`dict`/`None`/scalars — for every level of
    nesting, so a `list<struct>` column round-trips to exactly a
    `list[dict]`, and a struct field missing from some bag rows (ragged
    but homogeneous data — the encoder fills those with a column-level
    null) comes back as `None`.

    Args:
        arrow_bytes: Arrow IPC format bytes

    Returns:
        A list of dicts, one per row, in column order.

    Example:
        >>> rows = arrow_to_records(arrow_bytes)
    """
    reader = pa.ipc.open_stream(arrow_bytes)
    table = reader.read_all()
    columns = {name: table.column(name).to_pylist() for name in table.column_names}
    return [
        {name: columns[name][i] for name in table.column_names}
        for i in range(table.num_rows)
    ]
