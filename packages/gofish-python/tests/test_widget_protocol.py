"""In-process tests for the widget's trait protocol.

These exercise the Python observer side of the JS↔Python bridge without
spinning up a browser. We render a real chart to a ``GoFishChartWidget`` and
drive its ``call_request`` trait the way the JS bundle would: the rows as
base64 Arrow in, the reply's document (its tables as base64 Arrow) out.
"""

import base64

import pyarrow as pa
import pyarrow.ipc as pa_ipc

from gofish import chart, derive, layer, rect, text
from gofish.arrow_utils import arrow_to_records, data_to_arrow_bytes


def _arrow_b64(rows: list) -> str:
    return base64.b64encode(data_to_arrow_bytes(rows)).decode("utf-8")


def _reply_rows(response: dict) -> list:
    """The rows of the table a reply's root names."""
    reply = response["reply"]
    return arrow_to_records(base64.b64decode(reply["tables"][reply["root"]["id"]]))


def _derive_widget(fn):
    """A rendered chart whose flow derives with ``fn``, and its lambda id."""
    op = derive(fn)
    widget = chart([{"x": 1}]).flow(op).mark(rect(h="x")).render(w=400, h=300)
    return widget, op.lambda_id


def _call(widget, lambda_id: str, rows: list, request_id: str = "r-0") -> dict:
    widget.call_request = {
        "request_id": request_id,
        "lambda_id": lambda_id,
        "rows_b64": _arrow_b64(rows),
    }
    return widget.call_response


class TestCallProtocol:
    def test_derive_round_trip(self):
        """call_request -> observer runs the callback -> call_response set,
        whose reply's root names the table of the rows it returned."""
        seen = {}

        def fn(rows):
            seen["rows"] = rows
            return [{**r, "doubled": r["x"] * 2} for r in rows]

        widget, lambda_id = _derive_widget(fn)
        response = _call(widget, lambda_id, [{"x": 1}, {"x": 2}, {"x": 3}])

        assert response["request_id"] == "r-0"
        assert seen["rows"] == [{"x": 1}, {"x": 2}, {"x": 3}]
        assert response["reply"]["root"]["type"] == "table"
        assert _reply_rows(response) == [
            {"x": 1, "doubled": 2},
            {"x": 2, "doubled": 4},
            {"x": 3, "doubled": 6},
        ]

    def test_accessor_answers_one_value_per_row(self):
        """An accessor's reply names the list of its values, one per row."""
        mark = text(text=lambda d: f"{d['x']}%")
        widget = chart([{"x": 1}]).mark(mark).render()
        lambda_id = widget.doc["root"]["mark"]["text"]["__gofish_lambda"]
        response = _call(widget, lambda_id, [{"x": 1}, {"x": 2}])
        assert _reply_rows(response) == ["1%", "2%"]

    def test_mark_function_reply_registers_its_callbacks(self):
        """A mark function's reply is a document whose root is what it drew;
        the callbacks that IR names are registered for later calls."""
        widget = (
            chart([{"x": 1}])
            .mark(lambda d: layer([text(text=lambda r: str(len(d)))]))
            .render()
        )
        lambda_id = widget.doc["root"]["mark"]["lambdaId"]
        reply = _call(widget, lambda_id, [{"x": 1}, {"x": 2}])["reply"]
        accessor = reply["root"]["children"][0]["text"]["__gofish_lambda"]
        assert accessor in widget.callbacks
        response = _call(widget, accessor, [{"x": 5}], "r-1")
        assert _reply_rows(response) == ["2"]

    def test_request_id_preserved_across_calls(self):
        """Each request_id is echoed back unchanged."""
        widget, lambda_id = _derive_widget(lambda rows: rows)
        for rid in ("r-1", "r-7", "r-99"):
            assert _call(widget, lambda_id, [{"x": 0}], rid)["request_id"] == rid

    def test_unknown_lambda_id_yields_error(self):
        """A missing lambda id surfaces as call_response.error, not an exception."""
        widget, _ = _derive_widget(lambda rows: rows)
        response = _call(widget, "does-not-exist", [{"x": 1}])
        assert response["request_id"] == "r-0"
        assert "does-not-exist" in response["error"]

    def test_callback_exception_yields_error_response(self):
        """A raising user callback becomes a call_response.error."""

        def boom(rows):
            raise RuntimeError("kaboom")

        widget, lambda_id = _derive_widget(boom)
        response = _call(widget, lambda_id, [{"x": 1}])
        assert response["request_id"] == "r-0"
        assert "kaboom" in response["error"]

    def test_empty_request_is_ignored(self):
        """A None or {} call_request must not produce a response."""
        widget, _ = _derive_widget(lambda rows: rows)
        widget.call_request = {}
        assert widget.call_response is None

    def test_callback_receives_list_of_dicts(self):
        """The callback contract is: receive list[dict], return list[dict]."""

        def assert_shape(rows):
            assert isinstance(rows, list)
            assert all(isinstance(r, dict) for r in rows)
            return rows

        widget, lambda_id = _derive_widget(assert_shape)
        response = _call(widget, lambda_id, [{"a": 1, "b": "x"}, {"a": 2, "b": "y"}])
        assert "reply" in response


class TestRenderResultStatus:
    def test_done_starts_false(self):
        widget, _ = _derive_widget(lambda rows: rows)
        assert widget.done is False
        assert widget.result is False
        assert widget.error is None

    def test_done_true_on_success(self):
        widget, _ = _derive_widget(lambda rows: rows)
        widget.render_result = {"value": True}
        assert widget.done is True
        assert widget.result is True
        assert widget.error is None

    def test_error_string_on_failure(self):
        widget, _ = _derive_widget(lambda rows: rows)
        widget.render_result = {"error": "boom"}
        assert widget.done is True
        assert widget.result is False
        assert widget.error == "boom"


def _table_rows(b64: str) -> int:
    reader = pa_ipc.open_stream(pa.BufferReader(base64.b64decode(b64)))
    return reader.read_all().num_rows


class TestDocumentWireShape:
    """The widget's `doc` is the IR document with its `tables` as base64
    Arrow IPC streams by the table id a chart's data names (#683, #1088).
    Every chart in the document that has rows of its own names one,
    wherever it sits: the root, each child of a layer, a chart nested in a
    mark position. A bare mark has none.
    """

    def test_chart_and_mark_tables(self):
        c = chart([{"x": 1, "y": 2}]).mark(rect(h="y"))
        assert list(c.render().doc["tables"]) == ["t0"]
        assert "tables" not in rect(w=1, h=1).render().doc

    def test_nested_chart_rows_ship_as_a_table(self):
        """A chart nested in a mark position ships its rows beside the IR
        like the root's, so the widget draws it with no call to Python."""
        inner = chart([{"v": 5}, {"v": 7}]).mark(rect(h="v"))
        doc = chart([{"k": "a"}]).mark(inner).render().doc
        assert doc["root"]["mark"]["data"] == {"type": "table", "id": "t1"}
        assert _table_rows(doc["tables"]["t1"]) == 2

    def test_layer_builder_render_does_not_raise(self):
        """Regression test for #683: rendering a `.layer()` chain through the
        widget path used to raise `TypeError: a bytes-like object is
        required, not 'str'` because `LayerBuilder.render` handed the widget
        a JSON string where it expected raw Arrow bytes.
        """
        c1 = chart([{"x": 1, "y": 2}]).mark(rect(h="y").name("bars"))
        c2 = chart([{"x": 1, "y": 3}]).mark(rect(h="y").name("more_bars"))

        doc = layer([c1, c2]).render().doc

        assert doc["root"]["type"] == "layer"
        assert len(doc["tables"]) == 2
        for b64 in doc["tables"].values():
            assert _table_rows(b64) == 1
