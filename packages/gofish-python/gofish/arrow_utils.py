"""Utilities for converting between pandas DataFrames and Apache Arrow format."""

import io
from typing import Union
import pandas as pd
import pyarrow as pa


def dataframe_to_arrow(df: pd.DataFrame) -> bytes:
    """
    Convert a pandas DataFrame to Apache Arrow format (bytes).

    Args:
        df: pandas DataFrame to convert

    Returns:
        Arrow IPC format bytes

    Example:
        >>> df = pd.DataFrame({"x": [1, 2, 3], "y": [4, 5, 6]})
        >>> arrow_bytes = dataframe_to_arrow(df)
    """
    # Convert DataFrame to Arrow table
    table = pa.Table.from_pandas(df)
    
    # Convert Int64 columns to Int32 to avoid BigInt issues in JavaScript
    # This is safe for most charting use cases where values are reasonable
    fields = []
    arrays = []
    schema_changed = False
    for i, field in enumerate(table.schema):
        array = table.column(i)
        # Convert Int64/UInt64 to Int32/UInt32 if values fit
        if pa.types.is_int64(field.type) or pa.types.is_uint64(field.type):
            try:
                # Try to cast to Int32/UInt32
                if pa.types.is_int64(field.type):
                    new_type = pa.int32()
                else:
                    new_type = pa.uint32()
                array = array.cast(new_type, safe=True)
                fields.append(pa.field(field.name, new_type))
                schema_changed = True
            except (pa.ArrowInvalidError, OverflowError):
                # If casting fails (values too large), keep original type
                fields.append(field)
        else:
            fields.append(field)
        arrays.append(array)
    
    # Reconstruct table with converted types if any were changed
    if schema_changed:
        table = pa.Table.from_arrays(arrays, schema=pa.schema(fields))
    
    sink = pa.BufferOutputStream()
    with pa.ipc.new_stream(sink, table.schema) as writer:
        writer.write_table(table)
    return sink.getvalue().to_pybytes()


def empty_placeholder_arrow_bytes() -> bytes:
    """
    Arrow IPC bytes for an empty table with a single dummy `_placeholder`
    column — the wire payload for a chart tier that has no data of its own
    (a `ref`/`selectAll` chart borrowing nodes from a sibling, or a tier
    whose data is an empty DataFrame/list). The widget only needs *some*
    valid Arrow stream; the placeholder column is never read.

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


def arrow_to_dataframe(arrow_bytes: bytes) -> pd.DataFrame:
    """
    Convert Apache Arrow bytes back to a pandas DataFrame.

    Args:
        arrow_bytes: Arrow IPC format bytes

    Returns:
        pandas DataFrame

    Example:
        >>> df = arrow_to_dataframe(arrow_bytes)
    """
    reader = pa.ipc.open_stream(arrow_bytes)
    table = reader.read_all()
    return table.to_pandas()

