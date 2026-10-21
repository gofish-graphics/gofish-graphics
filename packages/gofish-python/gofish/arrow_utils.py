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

A table is a list, so it crosses as one Arrow column, `item`, of the list's
items, in both directions: a struct column for records, a scalar column for
values, a list column for groups. The JS codec (`widget-src/arrowTransport.ts`
and `widget-src/arrowDecode.ts`) writes and reads the same shape.

A ref in a bridge call (`BridgeRef`) is a value of its own type, the Arrow
extension type `gofish.ref`, in both codecs.
"""

import base64
from typing import Any, Dict, List, Optional, Tuple

import narwhals as nw
import pyarrow as pa

_SUPPORTED_INPUTS_MSG = (
    "a list of dict rows, or a dataframe supported by narwhals "
    "(pandas, polars, pyarrow, DuckDB relation, etc.)"
)

# The name of a table's one column, the list's items.
ITEM = "item"


class BridgeRef:
    """A ref as data crossing the bridge: its index in the call's refs (JS
    ``Serialize.BridgeRef``). A ref is a node of the JS render, so it cannot
    cross as data; this stands in for it in a call's rows and in a reply's
    tables. It crosses as a value of its own Arrow type, the extension type
    ``gofish.ref`` (storage ``{index}``), never as a row that looks like one,
    so no data is read as a ref and no ref adds keys to data."""

    __slots__ = ("index",)

    def __init__(self, index: int):
        self.index = index

    def __eq__(self, other: Any) -> bool:
        return isinstance(other, BridgeRef) and other.index == self.index

    def __hash__(self) -> int:
        return hash(("BridgeRef", self.index))

    def __repr__(self) -> str:
        return f"BridgeRef({self.index})"


class _RefScalar(pa.ExtensionScalar):
    def as_py(self, *args: Any, **kwargs: Any) -> Optional[BridgeRef]:
        return None if self.value is None else BridgeRef(self.value["index"].as_py())


class _RefType(pa.ExtensionType):
    """The Arrow type of a ref (see ``BridgeRef``), as the JS codec writes it
    (``inferField`` in ``widget-src/arrowTransport.ts``)."""

    def __init__(self) -> None:
        super().__init__(pa.struct([("index", pa.int64())]), "gofish.ref")

    def __arrow_ext_serialize__(self) -> bytes:
        return b""

    @classmethod
    def __arrow_ext_deserialize__(cls, storage_type: pa.DataType, serialized: bytes):
        return cls()

    def __arrow_ext_scalar_class__(self):
        return _RefScalar


REF_TYPE = _RefType()
pa.register_extension_type(REF_TYPE)


def to_arrow_table(data: Any) -> pa.Table:
    """
    Ingest chart/layer/derive data of *any* supported shape into the
    `pyarrow.Table` that crosses the bridge. This is the single ingestion
    choke point: every call site that used to branch on
    `isinstance(data, pd.DataFrame)` now just calls this (or
    `data_to_arrow_bytes`, below).

    A table is a list, so it is one Arrow column, `item`, whose type is the
    type of the list's items: a struct for records (its fields are the
    columns), a scalar for values, a list for groups. Data flows as lists,
    so nothing inspects an item's shape; the decode on either side
    (`arrow_to_records`, `widget-src/arrowDecode.ts`) reads column 0 back
    as the list.

    Supported shapes:
        - Any list (including `[]`): its items as one column, `pa.array` of
          the items. A list of dicts is a struct column, one field per key
          in the order keys first appear (a dict without the key holds null
          there). None is a missing value (null); a float NaN stays NaN, a
          number, since GoFish never reads NaN as missing.
        - A `pyarrow.Table`: a list of records, its columns the struct's
          fields, wrapped without a copy.
        - Any dataframe/lazyframe narwhals recognizes (pandas, polars,
          pyarrow, DuckDB relation, cuDF, Modin, ...) — routed through
          `narwhals.from_native`, exported to Arrow, and wrapped as a
          `pyarrow.Table` is. Lazy frames are collected before the Arrow
          export, since the wire format is always a materialized table. A
          pandas float column's NaN crosses as null: pandas defines NaN as
          the missing value of its own float columns, and pyarrow's
          `from_pandas` follows that rule. It is pandas' rule about pandas
          data, not a GoFish rule; a polars NaN stays NaN.

    Every column keeps its Arrow type: timestamp and date columns keep their
    time zone, and integers stay integers (the JS decode types them
    `HasInteger`, so the JS encode sends them back as integers).

    Anything else raises `TypeError` naming the actual type received and
    the supported inputs, rather than failing deep inside pandas/pyarrow
    with an opaque message. So does a list whose values conflict in type at
    some column (a string in one row, a number in another): the error names
    the column and the types; the data is never coerced silently.

    Args:
        data: A list, or a narwhals-supported dataframe.

    Returns:
        A `pyarrow.Table` of one column, `item`.

    Example:
        >>> to_arrow_table([{"x": 1, "y": 2}])
        >>> to_arrow_table(pd.DataFrame({"x": [1, 2]}))
        >>> to_arrow_table(pl.DataFrame({"x": [1, 2]}))
    """
    if isinstance(data, (list, tuple)):
        return _items_table(list(data))

    if isinstance(data, pa.Table):
        return _records_table(data)

    try:
        nwdata = nw.from_native(data)
    except TypeError as exc:
        raise TypeError(
            f"Unsupported chart data type: {type(data).__name__!r}. "
            f"Expected {_SUPPORTED_INPUTS_MSG}."
        ) from exc

    if isinstance(nwdata, nw.LazyFrame):
        nwdata = nwdata.collect()

    return _records_table(nwdata.to_arrow())


def _records_table(table: pa.Table) -> pa.Table:
    """The records of ``table`` as one struct column whose fields are its
    columns, each record batch wrapped without a copy."""
    chunks = [
        pa.StructArray.from_arrays(batch.columns, fields=list(batch.schema))
        for batch in table.to_batches()
    ]
    return pa.table(
        {ITEM: pa.chunked_array(chunks, type=pa.struct(list(table.schema)))}
    )


def _items_table(items: List[Any]) -> pa.Table:
    """``items`` as one column of their type. Values whose types conflict at
    some column are a loud ``TypeError`` naming the column. A ref
    (``BridgeRef``) is a value of the ``gofish.ref`` type: Arrow cannot read
    an extension type from Python values, so the items are read with each
    ref as its storage, ``{index}``, and each column of refs is then cast to
    the ref type. Since a ref's storage looks like a record, a column
    that holds refs is first checked to hold nothing else."""
    ref_paths: List[Tuple[Any, ...]] = []
    storage = [_ref_storage(item, (), ref_paths) for item in items]
    conflict = _conflict(items, "") if ref_paths else None
    if conflict is None:
        try:
            array = pa.array(storage, from_pandas=False)
            for path in dict.fromkeys(ref_paths):
                array = array.cast(_with_ref(array.type, path))
            return pa.table({ITEM: array})
        except (pa.ArrowTypeError, pa.ArrowInvalid):
            conflict = _conflict(items, "")
            if conflict is None:
                raise
    path, kinds = conflict
    where = f'column "{path}" has' if path else "the items have"
    raise TypeError(
        f"Chart data: {where} conflicting types across rows "
        f"({', '.join(kinds)}) — rows sharing a column must share a "
        f"type; coerce the column to one type or drop it before passing "
        f"the data to chart()."
    )


# A step into the items of a list, in the path of a column of refs.
_ELEMENT = object()


def _ref_storage(value: Any, path: Tuple[Any, ...], ref_paths: list) -> Any:
    """``value`` with each ``BridgeRef`` as its storage, ``{index}``, and the
    path of each column that holds one (a key of a record, ``_ELEMENT`` for
    the items of a list) added to ``ref_paths``. Shares what holds no ref."""
    if isinstance(value, BridgeRef):
        ref_paths.append(path)
        return {"index": value.index}
    if isinstance(value, dict):
        out = {k: _ref_storage(v, (*path, k), ref_paths) for k, v in value.items()}
        return out if any(out[k] is not value[k] for k in value) else value
    if isinstance(value, (list, tuple)):
        out_list = [_ref_storage(v, (*path, _ELEMENT), ref_paths) for v in value]
        changed = any(a is not b for a, b in zip(out_list, value))
        return out_list if changed else value
    return value


def _with_ref(t: pa.DataType, path: Tuple[Any, ...]) -> pa.DataType:
    """``t`` with the column at ``path`` (see ``_ref_storage``) the ref
    type."""
    if not path:
        return REF_TYPE
    step, rest = path[0], path[1:]
    if step is _ELEMENT:
        return pa.list_(t.value_field.with_type(_with_ref(t.value_type, rest)))
    return pa.struct(
        [f.with_type(_with_ref(f.type, rest)) if f.name == step else f for f in t]
    )


def _conflict(values: List[Any], path: str) -> Optional[Tuple[str, List[str]]]:
    """Where ``values`` conflict in kind, found by the walk the JS encode's
    type inference makes (``inferType`` in ``arrowTransport.ts``, which
    names a column the same way): the column's path and its kinds, or None.
    Only the error message reads it."""
    present = [v for v in values if v is not None]
    kinds = list(dict.fromkeys(_value_kind(v) for v in present))
    if len(kinds) > 1:
        return path, kinds
    if kinds == ["object"]:
        for key in dict.fromkeys(key for v in present for key in v):
            name = f"{path}.{key}" if path else key
            found = _conflict([v.get(key) for v in present], name)
            if found is not None:
                return found
    if kinds == ["array"]:
        return _conflict([x for v in present for x in v], f"{path}[]")
    return None


def _value_kind(value: Any) -> str:
    """The kind of one value, as the JS transport names kinds
    (`arrowTransport.ts`): ints and floats are both numbers."""
    if isinstance(value, BridgeRef):
        return "ref"
    if isinstance(value, bool):
        return "boolean"
    if isinstance(value, (int, float)):
        return "number"
    if isinstance(value, str):
        return "string"
    if isinstance(value, (list, tuple)):
        return "array"
    if isinstance(value, dict):
        return "object"
    return type(value).__name__


def _table_to_list(table: pa.Table) -> list:
    """A table as the list it holds: its one column's values, records as
    dicts."""
    if table.num_columns != 1:
        raise ValueError(
            "Arrow transport: a table is one column of its items, but this "
            f"one has {table.num_columns} ({', '.join(table.column_names)})"
        )
    return table.column(0).to_pylist()


def arrow_table_to_bytes(table: pa.Table) -> bytes:
    """
    Serialize a `pyarrow.Table` to Arrow IPC format (bytes). Every column
    crosses unchanged: timestamp and date columns keep their time zone, and
    64-bit integers keep their width. The widget's decode
    (`widget-src/arrowDecode.ts`) reads times as times and turns 64-bit
    integers into JS numbers.

    Args:
        table: `pyarrow.Table` to serialize.

    Returns:
        Arrow IPC format bytes.
    """
    sink = pa.BufferOutputStream()
    with pa.ipc.new_stream(sink, table.schema) as writer:
        writer.write_table(table)
    return sink.getvalue().to_pybytes()


def data_to_arrow_bytes(data: Any) -> bytes:
    """
    Full ingestion pipeline from chart/layer/derive data to the Arrow IPC
    wire bytes the widget expects: `to_arrow_table`, then
    `arrow_table_to_bytes`. `None` (a tier with no data of its own) is no
    items, `[]`.

    Every host ships tables through it (`b64_tables`), so nothing branches on
    the input's dataframe backend itself.

    Args:
        data: `None`, a list, or a narwhals-supported dataframe.

    Returns:
        Arrow IPC format bytes.
    """
    return arrow_table_to_bytes(to_arrow_table([] if data is None else data))


def b64_tables(tables: Dict[str, Any]) -> Dict[str, str]:
    """Each table's data (any shape `data_to_arrow_bytes` takes) as a base64
    Arrow IPC stream, by table id: how a document's `tables` cross to JS from
    either host (the notebook widget, the parity harness's derive server)."""
    return {
        table_id: base64.b64encode(data_to_arrow_bytes(data)).decode("ascii")
        for table_id, data in tables.items()
    }


def to_records(data: Any) -> List[Any]:
    """
    Ingest data of any supported shape (see `to_arrow_table`) and return it
    as the plain list it holds (dict rows for records) — used where the
    caller needs JSON-able rows rather than an Arrow table (e.g. `join()`'s
    right-hand table, which is inlined into the IR as JSON).

    Args:
        data: A list, or a narwhals-supported dataframe.

    Returns:
        The list, dicts for records, in column order.
    """
    return _table_to_list(to_arrow_table(data))


def arrow_to_records(arrow_bytes: bytes) -> list:
    """
    Convert Apache Arrow bytes back to the list they encode: column 0's
    values, dicts for records (see `to_arrow_table`).

    Deliberately bypasses pandas for this: pandas' `to_pandas()` decodes a
    `list<struct>` column (the JS-side widget transport's explicit-schema
    encoding for a mark-fn's multi-row `datum` bag — see
    `widget-src/arrowTransport.ts`, issue #783) into a numpy `ndarray` of
    dicts rather than a plain Python `list` of dicts.
    `pyarrow.Array.to_pylist()` decodes straight to native Python
    containers — `list`/`dict`/`None`/scalars — for every level of
    nesting, so a `list<struct>` column round-trips to exactly a
    `list[dict]`, and a struct field missing from some bag rows (ragged
    but homogeneous data — the encoder fills those with a column-level
    null) comes back as `None`.

    Args:
        arrow_bytes: Arrow IPC format bytes

    Returns:
        The list the table holds.

    Example:
        >>> rows = arrow_to_records(arrow_bytes)
    """
    return _table_to_list(pa.ipc.open_stream(arrow_bytes).read_all())
