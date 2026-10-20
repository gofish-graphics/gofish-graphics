"""In-process tests for the widget's trait protocol.

These exercise the Python observer side of the JS↔Python derive bridge
without spinning up a browser. We construct a real ``GoFishChartWidget``
and drive its ``derive_request`` trait the way the JS bundle would.
"""

import base64
from typing import Any, Dict

import pyarrow as pa
import pyarrow.ipc as pa_ipc
import pytest

from gofish import chart, layer, rect
from gofish.arrow_utils import data_to_arrow_bytes
from gofish.widget import GoFishChartWidget


def _arrow_b64(rows: list) -> str:
    return base64.b64encode(data_to_arrow_bytes(rows)).decode("utf-8")


def _decode_arrow_b64(b64: str) -> list:
    buf = base64.b64decode(b64)
    reader = pa_ipc.open_stream(pa.BufferReader(buf))
    table = reader.read_all()
    return table.to_pylist()


def _make_widget(derive_functions: Dict[str, Any]) -> GoFishChartWidget:
    spec = {
        "type": "chart",
        "data": {"type": "table", "id": "t0"},
        "operators": [{"type": "derive", "lambdaId": next(iter(derive_functions), "x")}],
        "mark": {"type": "rect"},
        "options": {},
        "zOrder": None,
    }
    return GoFishChartWidget(
        spec=spec,
        tables={"t0": data_to_arrow_bytes([{"x": 1}])},
        derive_functions=derive_functions,
        width=400,
        height=300,
    )


class TestDeriveProtocol:
    def test_derive_request_round_trip(self):
        """derive_request -> observer runs callback -> derive_response set."""
        seen = {}

        def fn(rows):
            seen["rows"] = rows
            return [{**r, "doubled": r["x"] * 2} for r in rows]

        widget = _make_widget({"abc": fn})

        widget.derive_request = {
            "request_id": "r-0",
            "lambda_id": "abc",
            "arrow_b64": _arrow_b64([{"x": 1}, {"x": 2}, {"x": 3}]),
        }

        assert widget.derive_response is not None
        assert widget.derive_response["request_id"] == "r-0"
        assert "result_b64" in widget.derive_response
        assert seen["rows"] == [{"x": 1}, {"x": 2}, {"x": 3}]

        result_rows = _decode_arrow_b64(widget.derive_response["result_b64"])
        assert result_rows == [
            {"x": 1, "doubled": 2},
            {"x": 2, "doubled": 4},
            {"x": 3, "doubled": 6},
        ]

    def test_request_id_preserved_across_calls(self):
        """Each request_id is echoed back unchanged."""
        widget = _make_widget({"abc": lambda rows: rows})

        for rid in ("r-1", "r-7", "r-99"):
            widget.derive_request = {
                "request_id": rid,
                "lambda_id": "abc",
                "arrow_b64": _arrow_b64([{"x": 0}]),
            }
            assert widget.derive_response["request_id"] == rid

    def test_unknown_lambda_id_yields_error(self):
        """Missing lambda_id surfaces as derive_response.error, not an exception."""
        widget = _make_widget({"abc": lambda rows: rows})

        widget.derive_request = {
            "request_id": "r-0",
            "lambda_id": "does-not-exist",
            "arrow_b64": _arrow_b64([{"x": 1}]),
        }

        assert widget.derive_response is not None
        assert widget.derive_response["request_id"] == "r-0"
        assert "error" in widget.derive_response
        assert "does-not-exist" in widget.derive_response["error"]

    def test_callback_exception_yields_error_response(self):
        """A raising user callback becomes a derive_response.error."""
        def boom(rows):
            raise RuntimeError("kaboom")

        widget = _make_widget({"abc": boom})
        widget.derive_request = {
            "request_id": "r-0",
            "lambda_id": "abc",
            "arrow_b64": _arrow_b64([{"x": 1}]),
        }

        assert widget.derive_response["request_id"] == "r-0"
        assert "kaboom" in widget.derive_response["error"]

    def test_empty_request_is_ignored(self):
        """A None or {} derive_request must not produce a response."""
        widget = _make_widget({"abc": lambda rows: rows})
        # Default value is None — set to {} explicitly. The observer
        # should bail before producing a response.
        widget.derive_request = {}
        assert widget.derive_response is None

    def test_callback_receives_list_of_dicts(self):
        """The callback contract is: receive list[dict], return list[dict]."""
        def assert_shape(rows):
            assert isinstance(rows, list)
            assert all(isinstance(r, dict) for r in rows)
            return rows

        widget = _make_widget({"abc": assert_shape})
        widget.derive_request = {
            "request_id": "r-0",
            "lambda_id": "abc",
            "arrow_b64": _arrow_b64([{"a": 1, "b": "x"}, {"a": 2, "b": "y"}]),
        }
        assert "result_b64" in widget.derive_response


class TestRenderResultStatus:
    def test_done_starts_false(self):
        widget = _make_widget({"abc": lambda rows: rows})
        assert widget.done is False
        assert widget.result is False
        assert widget.error is None

    def test_done_true_on_success(self):
        widget = _make_widget({"abc": lambda rows: rows})
        widget.render_result = {"value": True}
        assert widget.done is True
        assert widget.result is True
        assert widget.error is None

    def test_error_string_on_failure(self):
        widget = _make_widget({"abc": lambda rows: rows})
        widget.render_result = {"error": "boom"}
        assert widget.done is True
        assert widget.result is False
        assert widget.error == "boom"


class TestTablesWireShape:
    """`tables` carries one wire shape (#683, #1088): base64 Arrow IPC
    streams by the table id a chart's data names. Every chart in the spec
    that has rows of its own names one, wherever it sits: the root, each
    child of a layer, a chart nested in a mark position. A bare mark has
    none.
    """

    def test_tables_are_base64_by_id(self):
        raw0 = data_to_arrow_bytes([{"x": 1}])
        raw1 = data_to_arrow_bytes([{"x": 2}])
        widget = GoFishChartWidget(
            spec={"type": "chart", "data": {"type": "table", "id": "t0"}},
            tables={"t0": raw0, "t1": raw1},
            width=400,
            height=300,
        )
        assert {k: base64.b64decode(b) for k, b in widget.tables.items()} == {
            "t0": raw0,
            "t1": raw1,
        }

    def test_chart_and_mark_tables(self):
        c = chart([{"x": 1, "y": 2}]).mark(rect(h="y"))
        assert list(c.render().tables) == ["t0"]
        assert rect(w=1, h=1).render().tables == {}

    def test_nested_chart_rows_ship_as_a_table(self):
        """A chart nested in a mark position ships its rows beside the IR
        like the root's, so the widget draws it with no call to Python."""
        inner = chart([{"v": 5}, {"v": 7}]).mark(rect(h="v"))
        widget = chart([{"k": "a"}]).mark(inner).render()
        assert widget.spec["mark"]["data"] == {"type": "table", "id": "t1"}
        buf = base64.b64decode(widget.tables["t1"])
        reader = pa_ipc.open_stream(pa.BufferReader(buf))
        assert reader.read_all().num_rows == 2

    def test_layer_builder_render_does_not_raise(self):
        """Regression test for #683: rendering a `.layer()` chain through the
        widget path used to raise `TypeError: a bytes-like object is
        required, not 'str'` because `LayerBuilder.render` handed the widget
        a JSON string where it expected raw Arrow bytes.
        """
        c1 = chart([{"x": 1, "y": 2}]).mark(rect(h="y").name("bars"))
        c2 = chart([{"x": 1, "y": 3}]).mark(rect(h="y").name("more_bars"))

        widget = layer([c1, c2]).render()

        assert widget.spec["type"] == "layer"
        assert len(widget.tables) == 2
        for b64 in widget.tables.values():
            buf = base64.b64decode(b64)
            reader = pa_ipc.open_stream(pa.BufferReader(buf))
            assert reader.read_all().num_rows == 1
