"""Tests for the Python-side decode contract of the widget RPC transport
(issue #783).

The JS-side encoder (`widget-src/arrowTransport.ts`) builds an explicit
Arrow schema per RPC call instead of relying on `Arrow.tableFromJSON`'s
inference (which can't handle a `list<struct>` column at all — the shape
of a ref's datum when it is a multi-row bag). These tests build the equivalent Arrow IPC bytes
directly with pyarrow (mirroring what the JS encoder produces) and assert
on `arrow_to_records`'s decode contract: a `list<struct>` column must come
back as a plain `list[dict]`, not a numpy `ndarray` of dicts, so a mark-fn
sees the same shape in either host (the notebook widget, or the parity
harness's `tests/scripts/derive-server.py`), which both decode it this way.
"""

import base64
import json

import pyarrow as pa
import pytest

from gofish import chart, derive, rect
from gofish.arrow_utils import BridgeRef, arrow_to_records, data_to_arrow_bytes
from gofish.ast import _InputRef


def _ipc_bytes(table: pa.Table) -> bytes:
    sink = pa.BufferOutputStream()
    with pa.ipc.new_stream(sink, table.schema) as writer:
        writer.write_table(table)
    return sink.getvalue().to_pybytes()


def _records(columns: dict) -> pa.Table:
    """A table of records, as the JS encoder writes one: one struct column,
    `item`, whose fields are ``columns``."""
    return pa.table(
        {"item": pa.StructArray.from_arrays(list(columns.values()), names=list(columns))}
    )


class TestArrowToRecords:
    def test_flat_table(self):
        table = _records({"x": pa.array([1.0, 2.0]), "name": pa.array(["a", "b"])})
        records = arrow_to_records(_ipc_bytes(table))
        assert records == [{"x": 1.0, "name": "a"}, {"x": 2.0, "name": "b"}]

    def test_single_row_struct(self):
        struct_type = pa.struct([("x", pa.float64()), ("label", pa.string())])
        table = _records(
            {
                "i": pa.array([0.0], type=pa.float64()),
                "datum": pa.array([{"x": 1.0, "label": "a"}], type=struct_type),
            }
        )
        records = arrow_to_records(_ipc_bytes(table))
        assert records == [{"i": 0.0, "datum": {"x": 1.0, "label": "a"}}]

    def test_multi_row_bag_decodes_to_plain_list_of_dicts(self):
        """The #783 repro shape: a mark-fn's `datum` bound to a group's
        multiple rows, transported as a `list<struct>` column."""
        struct_type = pa.struct([("x", pa.float64()), ("label", pa.string())])
        list_type = pa.list_(struct_type)
        table = _records(
            {
                "i": pa.array([0.0, 1.0], type=pa.float64()),
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
        table = _records(
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
        table = _records(
            {
                "i": pa.array([0.0], type=pa.float64()),
                "datum": pa.array([[]], type=list_type),
            }
        )
        records = arrow_to_records(_ipc_bytes(table))
        assert records == [{"i": 0.0, "datum": []}]
        assert isinstance(records[0]["datum"], list)


def _b64(items: list) -> str:
    return base64.b64encode(data_to_arrow_bytes(items)).decode("utf-8")


def _mark_fn_widget(seen: dict):
    """A rendered chart whose mark is a mark function that records its
    input, and the function's lambda id."""

    def mark_fn(rows):
        seen["rows"] = rows
        return rect(w=1, h=1)

    widget = chart([{"x": 1}]).mark(mark_fn).render(w=400, h=300)
    return widget, widget.doc["root"]["mark"]["lambdaId"]


class TestWidgetMarkFnBagContract:
    """End-to-end through the real trait observer (`_on_call_request`), not
    just the arrow_utils helper: a mark function gets the `GoFishRef`
    arguments JS sends as `BridgeRef`s, each with its datum in the call's
    refs, as `_InputRef`s whose `datum` bag is a plain `list[dict]`, not a
    numpy `ndarray` of dicts.
    """

    def test_mark_fn_receives_plain_list_of_dicts_for_a_bag(self):
        seen = {}
        widget, lambda_id = _mark_fn_widget(seen)
        widget.call_request = {
            "request_id": "r-0",
            "lambda_id": lambda_id,
            "rows_b64": _b64([BridgeRef(0)]),
            "refs_b64": _b64([[{"x": 1.0, "label": "a"}, {"x": 2.0, "label": None}]]),
        }

        assert widget.call_response["reply"]["root"]["type"] == "rect"
        [ref] = seen["rows"]
        assert isinstance(ref, _InputRef)
        assert ref.index == 0
        assert isinstance(ref.datum, list)
        assert ref.datum == [{"x": 1.0, "label": "a"}, {"x": 2.0, "label": None}]

    def test_a_ref_in_a_row_field_is_a_ref(self):
        """A ref in a field of a row (`resolve` fills one) crosses as a
        `BridgeRef` and decodes into an `_InputRef` where it sits (#1046)."""
        seen = {}
        widget, lambda_id = _mark_fn_widget(seen)
        widget.call_request = {
            "request_id": "r-0",
            "lambda_id": lambda_id,
            "rows_b64": _b64(
                [
                    {"ref": BridgeRef(0), "label": "Alpha"},
                    {"ref": BridgeRef(1), "label": "Bravo"},
                ]
            ),
            "refs_b64": _b64([[{"id": "a"}], [{"id": "b"}]]),
        }

        assert widget.call_response["reply"]["root"]["type"] == "rect"
        [a, b] = seen["rows"]
        assert a["label"] == "Alpha" and b["label"] == "Bravo"
        assert isinstance(a["ref"], _InputRef) and a["ref"].index == 0
        assert b["ref"].index == 1 and b["ref"].datum == [{"id": "b"}]

    def test_one_node_is_one_ref(self):
        """A node the rows hold many times crosses once and is one
        `_InputRef`, wherever the rows hold it."""
        seen = {}
        widget, lambda_id = _mark_fn_widget(seen)
        widget.call_request = {
            "request_id": "r-0",
            "lambda_id": lambda_id,
            "rows_b64": _b64(
                [
                    {"source": BridgeRef(0), "target": BridgeRef(1)},
                    {"source": BridgeRef(1), "target": BridgeRef(0)},
                ]
            ),
            "refs_b64": _b64([[{"id": "a"}], [{"id": "b"}]]),
        }
        [r0, r1] = seen["rows"]
        assert r0["source"] is r1["target"] and r0["target"] is r1["source"]

    def test_data_is_never_read_as_a_ref(self):
        """A ref is a value of its own Arrow type, so a column named like
        the old sentinel is data, and a row keeps exactly its own keys."""
        seen = {}
        widget, lambda_id = _mark_fn_widget(seen)
        rows = [{"__inputRef": 3, "datum": {"x": 1}}, {"__inputRef": None, "datum": None}]
        widget.call_request = {
            "request_id": "r-0",
            "lambda_id": lambda_id,
            "rows_b64": _b64(rows),
            "refs_b64": _b64([]),
        }
        assert seen["rows"] == rows


class TestRefsCrossBack:
    """A reply hands a ref it was given back by its index: a derive that keeps
    the refs `resolve` filled ships them as `gofish.ref` values, which JS
    resolves to the live refs (`callBridge` in registry.ts)."""

    def test_a_derive_hands_its_refs_back(self):
        op = derive(lambda rows: rows[:1])
        widget = chart([{"x": 1}]).flow(op).mark(rect(h="x")).render(w=400, h=300)
        widget.call_request = {
            "request_id": "r-0",
            "lambda_id": op.lambda_id,
            "rows_b64": _b64(
                [
                    {"source": BridgeRef(0), "target": BridgeRef(1)},
                    {"source": BridgeRef(1), "target": BridgeRef(0)},
                ]
            ),
            "refs_b64": _b64([[{"id": "a"}], [{"id": "b"}]]),
        }
        reply = widget.call_response["reply"]
        table = pa.ipc.open_stream(
            base64.b64decode(reply["tables"][reply["root"]["id"]])
        ).read_all()
        source = table.schema.field("item").type.field("source").type
        assert source.extension_name == "gofish.ref"
        assert table.column(0).to_pylist() == [
            {"source": BridgeRef(0), "target": BridgeRef(1)}
        ]

    def test_refs_and_other_values_in_one_column_conflict(self):
        with pytest.raises(TypeError, match='column "a"'):
            data_to_arrow_bytes([{"a": BridgeRef(0)}, {"a": {"index": 1}}])


def test_a_list_of_groups_or_values_round_trips():
    """Data flows as lists, so a callback may return groups or values rather
    than records: every list crosses as one column of its items and decodes
    back to them (the JS codec does the same)."""
    from gofish.arrow_utils import data_to_arrow_bytes

    groups = [[{"x": 1}, {"x": 2}], [{"x": 3}]]
    for items in (groups, ["a", "b"], [1.5, None], []):
        assert arrow_to_records(data_to_arrow_bytes(items)) == items
