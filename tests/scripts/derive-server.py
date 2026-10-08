"""
Python derive server — executes Python derive functions during test rendering.

Endpoints:
  POST /load           — Import a story file, build its IR, and register
                         derive functions in one shot. Returns the IR, each
                         chart tier's rows as base64 Arrow (as the widget
                         ships them), the render options, and the deriveIds.
                         Combining import + register avoids the
                         two-process pitfall: `derive(lambda)` mints a fresh
                         UUID per call, so importing the story separately
                         from extracting the IR yields divergent lambda_ids.
  POST /derive/<id>    — Execute a registered derive function on JSON data
  POST /reset          — Clear all registered functions
  GET  /health         — Health check

The capture-python-dom.ts script starts this server, posts /load for each
story (which both extracts the IR and registers derives), then the test
harness calls /derive/<id> during chart rendering.
"""

import base64
import importlib
import importlib.util
import json
import math
import sys
import os
import traceback
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse


def _sanitize_for_json(obj):
    """Make values JSON-safe.

    - ±Infinity floats → the IR's tagged form `{"$numberDouble": "Infinity"}`
      (gofish's `_nonfinite.py`), which the harness decodes back to a number.
      json.dumps would write a bare `Infinity`, which JSON.parse rejects.
    - NaN floats → None: in rows (pandas' missing value) NaN means "no
      value", which JS spells `null`. Spec fields never get here as NaN:
      `to_ir()` has already tagged them.
    - pandas Timestamps and other "stringifiable" non-native types →
      `str(obj)` so a Seattle-weather `date` column survives the round-trip
      as the same `YYYY-MM-DD HH:MM:SS` string the harness would have seen
      from JSON anyway.
    """
    if obj is None or isinstance(obj, (bool, int, str)):
        return obj
    if isinstance(obj, float):
        if math.isnan(obj):
            return None
        return encode_number(obj)
    if isinstance(obj, dict):
        return {k: _sanitize_for_json(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [_sanitize_for_json(v) for v in obj]
    # numpy scalars, pandas Timestamps, datetime.date / datetime — fall
    # back to the value's own string form so we never crash the response.
    try:
        return str(obj)
    except Exception:
        return None

# Add project root to path so we can import gofish
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "../.."))
sys.path.insert(0, os.path.join(PROJECT_ROOT, "packages/gofish-python"))
sys.path.insert(0, os.path.join(PROJECT_ROOT, "tests"))

from gofish._nonfinite import encode_number  # noqa: E402

# Registry: lambdaId → Python function
_registry: dict = {}

# Track where the `python_stories` package was registered from, so a /load
# request with a different pythonStoriesDir can re-register against the new
# path instead of silently reusing a stale registration.
_python_stories_pkg_dir: "str | None" = None


class DeriveHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path == "/health":
            self._json_response(200, {"status": "ok", "registered": len(_registry)})
        else:
            self._json_response(404, {"error": "not found"})

    def do_POST(self):
        parsed = urlparse(self.path)
        content_length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(content_length) if content_length > 0 else b""

        if parsed.path == "/load":
            self._handle_load(body)
        elif parsed.path.startswith("/derive/"):
            lambda_id = parsed.path[len("/derive/"):]
            self._handle_derive(lambda_id, body)
        elif parsed.path == "/reset":
            _registry.clear()
            self._json_response(200, {"status": "cleared"})
        else:
            self._json_response(404, {"error": "not found"})

    def _handle_load(self, body: bytes):
        """Import a story, extract its IR, and register its derive functions.

        Body: {"storyFile": "/abs/path/test_X.py", "function": "story_default",
               "pythonStoriesDir": "/abs/path/tests/python-stories"}

        Response: {"ir": <the builder's `to_ir()`>,
                   "tierArrow": [<each chart tier's rows: base64 Arrow IPC,
                                  `tier_arrow_bytes`, as the widget ships
                                  them>],
                   "render": <the story's render options>,
                   "deriveIds": [<every lambda id the IR names>]}
        """
        try:
            data = json.loads(body)
            story_file = data["storyFile"]
            function_name = data["function"]
            pkg_dir = data.get("pythonStoriesDir")

            # Make `from python_stories.data import ...` resolvable, the same
            # way capture-python-dom.ts had to set it up before. If a prior
            # /load registered the package against a different directory
            # (e.g. a test run crossing pythonStoriesDir boundaries), drop
            # the stale registration so imports resolve against the new path.
            if pkg_dir:
                global _python_stories_pkg_dir
                normalized = os.path.abspath(pkg_dir)
                if (
                    "python_stories" in sys.modules
                    and _python_stories_pkg_dir != normalized
                ):
                    for mod_name in [
                        name
                        for name in sys.modules
                        if name == "python_stories"
                        or name.startswith("python_stories.")
                    ]:
                        sys.modules.pop(mod_name, None)
                if "python_stories" not in sys.modules:
                    pkg_init = os.path.join(pkg_dir, "__init__.py")
                    pkg_spec = importlib.util.spec_from_file_location(
                        "python_stories", pkg_init,
                        submodule_search_locations=[pkg_dir]
                    )
                    pkg_mod = importlib.util.module_from_spec(pkg_spec)
                    sys.modules["python_stories"] = pkg_mod
                    pkg_spec.loader.exec_module(pkg_mod)
                    _python_stories_pkg_dir = normalized

            # Always reimport the story file fresh — Python caches by module
            # name, and we use the same name across stories. Without
            # invalidating, a later /load would silently return the *first*
            # story's module.
            story_mod_name = "_gofish_story_module"
            sys.modules.pop(story_mod_name, None)
            story_spec = importlib.util.spec_from_file_location(
                story_mod_name, story_file
            )
            story_mod = importlib.util.module_from_spec(story_spec)
            story_spec.loader.exec_module(story_mod)

            story_fn = getattr(story_mod, function_name)
            result = story_fn()
            if not isinstance(result, tuple):
                self._json_response(400, {
                    "error": "story function must return a tuple"
                })
                return

            # A story returns `(builder, render)`: `render` holds the options
            # of the builder's `.render(...)` call (w, h, axes, ...).
            builder = result[0]
            render = result[1] if len(result) > 1 else {}

            from gofish.ast import (
                ChartBuilder,
                DeriveOperator,
                LayerBuilder,
                Mark,
                _collect_mark_lambdas,
                _MarkFn,
                _InputRef,
                tier_arrow_bytes,
            )

            derive_ids: list = []

            def register(lambda_id, fn):
                derive_ids.append(lambda_id)
                _registry[lambda_id] = fn

            def register_mark(mark):
                """Register every callable accessor in a mark tree. The
                harness rebuilds an async arrow that POSTs `[row]` to
                `/derive/<lambda_id>` per invocation."""
                for lambda_id, rows_fn in _collect_mark_lambdas(mark):
                    register(lambda_id, rows_fn)

            def mark_fn(user_fn):
                """Wrap a `(data) -> ChartBuilder | Mark` mark function for
                the rows-in / rows-out `/derive/<id>` contract: it answers
                with a one-element list holding the result's IR."""

                def wrapped(data):
                    # The harness replaces each live `GoFishRef` argument with
                    # an `{"__inputRef": i, "datum": ...}` sentinel (a ref
                    # can't cross as JSON). Rebuild an `_InputRef` per
                    # sentinel so the user's function sees `d[0].datum` as in
                    # JS (issue #591). Plain rows pass through unchanged.
                    wrapped_data = [
                        _InputRef(row["__inputRef"], row.get("datum"))
                        if isinstance(row, dict) and "__inputRef" in row
                        else row
                        for row in data
                    ]
                    return [ir_of(user_fn(wrapped_data), inline=True)]

                return wrapped

            def chart_ir(chart_ir: dict, chart: "ChartBuilder", inline: bool) -> dict:
                """A chart's IR, after registering the callbacks it names.
                The story's own tiers ship their rows beside the IR, as
                Arrow (`tierArrow`), like the widget. A chart a mark
                function returns comes back over the JSON `/derive` RPC, so
                with `inline` its rows are inlined in the IR's inline form,
                `{type: "inline", rows}`. Select and previous-tier data are
                already in the IR."""
                for op in chart.operators:
                    if isinstance(op, DeriveOperator):
                        register(op.lambda_id, op.fn)
                if isinstance(chart._mark, _MarkFn):
                    register(chart._mark.lambda_id, mark_fn(chart._mark.fn))
                elif chart._mark is not None:
                    register_mark(chart._mark)
                if not inline or chart_ir.get("data") is not None:
                    return chart_ir
                raw = chart.data
                if hasattr(raw, "to_dict"):
                    rows = raw.to_dict("records")
                elif hasattr(raw, "to_dicts"):
                    rows = raw.to_dicts()
                else:
                    rows = raw
                if isinstance(rows, list):
                    return {**chart_ir, "data": {"type": "inline", "rows": rows}}
                return {**chart_ir, "data": rows}

            def ir_of(b, inline: bool = False) -> dict:
                """`b.to_ir()`, unchanged except for inlined rows (with
                `inline`; see `chart_ir`)."""
                if isinstance(b, Mark):
                    register_mark(b)
                    return b.to_ir()
                if isinstance(b, LayerBuilder):
                    ir = b.to_ir()
                    tiers = []
                    for child, tier in zip(b.children, ir["charts"]):
                        if isinstance(child, Mark):
                            register_mark(child)
                            tiers.append(tier)
                        else:
                            tiers.append(chart_ir(tier, child, inline))
                    # A `.relate(...)` clause that draws is a mark, and may
                    # carry accessors too (a constraint carries none).
                    for clause in b._relate or []:
                        if isinstance(clause, Mark):
                            register_mark(clause)
                    return {**ir, "charts": tiers}
                if isinstance(b, ChartBuilder):
                    return chart_ir(b.to_ir(), b, inline)
                raise TypeError(
                    f"a story must return a chart, layer or mark, got {type(b).__name__}"
                )

            # Each chart tier's rows, as the widget ships them: one tier for
            # a chart, one per child for a layer, none for a bare mark.
            tiers = (
                builder.children
                if isinstance(builder, LayerBuilder)
                else [builder]
                if isinstance(builder, ChartBuilder)
                else []
            )
            self._json_response(200, {
                "ir": ir_of(builder),
                "tierArrow": [
                    base64.b64encode(tier_arrow_bytes(t)).decode("ascii")
                    for t in tiers
                ],
                "render": render,
                "deriveIds": derive_ids,
            })
        except Exception as e:
            self._json_response(500, {
                "error": str(e),
                "traceback": traceback.format_exc(),
            })

    def _handle_derive(self, lambda_id: str, body: bytes):
        """Execute a registered derive function on JSON data."""
        if lambda_id not in _registry:
            self._json_response(404, {
                "error": f"Unknown lambda_id: {lambda_id}",
                "registered": list(_registry.keys()),
            })
            return

        try:
            data = json.loads(body)
            fn = _registry[lambda_id]
            result = fn(data)

            # Ensure result is JSON-serializable
            if hasattr(result, "to_dicts"):
                # Polars DataFrame
                result = result.to_dicts()
            elif hasattr(result, "to_dict"):
                # Pandas DataFrame
                result = result.to_dict("records")

            self._json_response(200, result)
        except Exception as e:
            self._json_response(500, {"error": str(e), "lambda_id": lambda_id})

    def _json_response(self, status: int, data):
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()
        self.wfile.write(json.dumps(_sanitize_for_json(data)).encode())

    def do_OPTIONS(self):
        """Handle CORS preflight."""
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def log_message(self, format, *args):
        """Suppress default logging unless DEBUG is set."""
        if os.environ.get("DEBUG"):
            super().log_message(format, *args)


def register_story_derives(story_module_name: str):
    """
    Import a story module and register all DeriveOperator functions.

    Story modules define story_*() functions that return (ChartBuilder, options).
    We extract DeriveOperator instances from the builder's operators list.
    """
    from gofish.ast import DeriveOperator

    mod = importlib.import_module(story_module_name)

    for attr_name in dir(mod):
        if not attr_name.startswith("story_"):
            continue
        story_fn = getattr(mod, attr_name)
        if not callable(story_fn):
            continue

        result = story_fn()
        if not isinstance(result, tuple) or len(result) < 1:
            continue

        builder = result[0]
        if not hasattr(builder, "operators"):
            continue

        for op in builder.operators:
            if isinstance(op, DeriveOperator):
                _registry[op.lambda_id] = op.fn


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 3002
    server = HTTPServer(("localhost", port), DeriveHandler)
    print(f"Derive server listening on http://localhost:{port}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    server.server_close()


if __name__ == "__main__":
    main()
