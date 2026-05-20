"""In-process tests for the widget's trait protocol.

These exercise the Python observer side of the JS↔Python derive bridge
without spinning up a browser. We construct a real ``GoFishChartWidget``
and drive its ``derive_request`` trait the way the JS bundle would.
"""

import base64
from typing import Any, Dict

import pandas as pd
import pyarrow as pa
import pyarrow.ipc as pa_ipc
import pytest

from gofish.arrow_utils import dataframe_to_arrow
from gofish.widget import GoFishChartWidget


def _arrow_b64(rows: list) -> str:
    return base64.b64encode(dataframe_to_arrow(pd.DataFrame(rows))).decode("utf-8")


def _decode_arrow_b64(b64: str) -> list:
    buf = base64.b64decode(b64)
    reader = pa_ipc.open_stream(pa.BufferReader(buf))
    table = reader.read_all()
    return table.to_pylist()


def _make_widget(derive_functions: Dict[str, Any]) -> GoFishChartWidget:
    spec = {
        "data": None,
        "operators": [{"type": "derive", "lambdaId": next(iter(derive_functions), "x")}],
        "mark": {"type": "rect"},
        "options": {},
        "zOrder": None,
    }
    return GoFishChartWidget(
        spec=spec,
        arrow_data=dataframe_to_arrow(pd.DataFrame([{"x": 1}])),
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
