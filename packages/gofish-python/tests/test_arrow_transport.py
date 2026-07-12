"""Tests for the Python-side decode contract of the widget RPC transport
(issue #783).

The JS-side encoder (`widget-src/arrowTransport.ts`) builds an explicit
Arrow schema per RPC call instead of relying on `Arrow.tableFromJSON`'s
inference (which can't handle a `list<struct>` column at all — the shape
of a mark-fn's `{__inputRef, datum}` sentinel when the ref's bound datum
is a multi-row bag). These tests build the equivalent Arrow IPC bytes
directly with pyarrow (mirroring what the JS encoder produces) and assert
on `arrow_to_records`'s decode contract: a `list<struct>` column must come
back as a plain `list[dict]`, not a numpy `ndarray` of dicts, so a mark-fn
sees the exact same shape whether it runs over this Arrow transport or the
parity test harness's plain-JSON transport (`tests/scripts/derive-server.py`).
"""

import base64
import json

import pyarrow as pa
import pytest

from gofish.arrow_utils import arrow_to_records
from gofish.widget import GoFishChartWidget


def _ipc_bytes(table: pa.Table) -> bytes:
    sink = pa.BufferOutputStream()
    with pa.ipc.new_stream(sink, table.schema) as writer:
        writer.write_table(table)
    return sink.getvalue().to_pybytes()


class TestArrowToRecords:
    def test_flat_table(self):
        table = pa.table({"x": pa.array([1.0, 2.0]), "name": pa.array(["a", "b"])})
        records = arrow_to_records(_ipc_bytes(table))
        assert records == [{"x": 1.0, "name": "a"}, {"x": 2.0, "name": "b"}]

    def test_single_row_struct(self):
        struct_type = pa.struct([("x", pa.float64()), ("label", pa.string())])
        table = pa.table(
            {
                "__inputRef": pa.array([0.0], type=pa.float64()),
                "datum": pa.array([{"x": 1.0, "label": "a"}], type=struct_type),
            }
        )
        records = arrow_to_records(_ipc_bytes(table))
        assert records == [{"__inputRef": 0.0, "datum": {"x": 1.0, "label": "a"}}]

    def test_multi_row_bag_decodes_to_plain_list_of_dicts(self):
        """The #783 repro shape: a mark-fn's `datum` bound to a group's
        multiple rows, transported as a `list<struct>` column."""
        struct_type = pa.struct([("x", pa.float64()), ("label", pa.string())])
        list_type = pa.list_(struct_type)
        table = pa.table(
            {
                "__inputRef": pa.array([0.0, 1.0], type=pa.float64()),
                "datum": pa.array(
                    [
                        [{"x": 1.0, "label": "a"}, {"x": 2.0, "label": "b"}],
                        [{"x": 3.0, "label": "c"}],
                    ],
                    type=list_type,
                ),
            }
        )
        records = arrow_to_records(_ipc_bytes(table))

        assert records[0]["datum"] == [{"x": 1.0, "label": "a"}, {"x": 2.0, "label": "b"}]
        assert records[1]["datum"] == [{"x": 3.0, "label": "c"}]
        # The whole point of #783: plain `list`, not a numpy `ndarray`.
        assert isinstance(records[0]["datum"], list)
        assert isinstance(records[0]["datum"][0], dict)
        # Round-trips cleanly through JSON too — further evidence there's no
        # numpy/pandas type hiding in the decoded shape.
        json.dumps(records)

    def test_ragged_keys_missing_key_becomes_none(self):
        """A struct field present in some bag rows and absent in others —
        the encoder fills the gap with a column-level null; decode must
        surface that as `None`, not drop the key or raise."""
        struct_type = pa.struct([("x", pa.float64()), ("label", pa.string())])
        list_type = pa.list_(struct_type)
        table = pa.table(
            {
                "datum": pa.array(
                    [[{"x": 1.0, "label": "a"}, {"x": 2.0, "label": None}]],
                    type=list_type,
                ),
            }
        )
        records = arrow_to_records(_ipc_bytes(table))
        assert records[0]["datum"][1] == {"x": 2.0, "label": None}

    def test_empty_bag_decodes_to_empty_list(self):
        struct_type = pa.struct([("x", pa.float64())])
        list_type = pa.list_(struct_type)
        table = pa.table(
            {
                "__inputRef": pa.array([0.0], type=pa.float64()),
                "datum": pa.array([[]], type=list_type),
            }
        )
        records = arrow_to_records(_ipc_bytes(table))
        assert records == [{"__inputRef": 0.0, "datum": []}]
        assert isinstance(records[0]["datum"], list)


class TestWidgetMarkFnBagContract:
    """End-to-end through the real trait observer (`_on_derive_request`),
    not just the arrow_utils helper — confirms widget.py actually calls
    `arrow_to_records` (plain list[dict] rows) rather than the old, deleted
    `arrow_to_dataframe(...).to_dict("records")` pandas path (numpy-wrapped
    bags).
    """

    def test_mark_fn_receives_plain_list_of_dicts_for_a_bag(self):
        seen = {}

        def mark_fn(rows):
            seen["rows"] = rows
            return [{"ok": True}]

        widget = GoFishChartWidget(
            spec={"data": None, "mark": {"type": "rect"}, "operators": [], "options": {}, "zOrder": None},
            arrow_data=b"",
            derive_functions={"mark-fn-1": mark_fn},
            width=400,
            height=300,
        )

        struct_type = pa.struct([("x", pa.float64()), ("label", pa.string())])
        list_type = pa.list_(struct_type)
        table = pa.table(
            {
                "__inputRef": pa.array([0.0], type=pa.float64()),
                "datum": pa.array(
                    [[{"x": 1.0, "label": "a"}, {"x": 2.0, "label": None}]],
                    type=list_type,
                ),
            }
        )
        arrow_b64 = base64.b64encode(_ipc_bytes(table)).decode("utf-8")

        widget.derive_request = {
            "request_id": "r-0",
            "lambda_id": "mark-fn-1",
            "arrow_b64": arrow_b64,
        }

        assert "result_b64" in widget.derive_response, widget.derive_response
        rows = seen["rows"]
        assert isinstance(rows, list)
        assert isinstance(rows[0], dict)
        bag = rows[0]["datum"]
        assert isinstance(bag, list)
        assert bag == [{"x": 1.0, "label": "a"}, {"x": 2.0, "label": None}]
