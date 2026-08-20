"""
Python derive server — executes Python derive functions during test rendering.

Endpoints:
  POST /load           — Import a story file, build its IR, and register
                         derive functions in one shot. Returns the IR + data
                         + deriveIds. Combining import + register avoids the
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

    - NaN/Infinity floats → None (json.dumps writes the literal `NaN`, which
      the harness's JSON.parse rejects).
    - pandas Timestamps and other "stringifiable" non-native types →
      `str(obj)` so a Seattle-weather `date` column survives the round-trip
      as the same `YYYY-MM-DD HH:MM:SS` string the harness would have seen
      from JSON anyway.
    """
    if obj is None or isinstance(obj, (bool, int, str)):
        return obj
    if isinstance(obj, float):
        if math.isnan(obj) or math.isinf(obj):
            return None
        return obj
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

# Registry: lambdaId → Python function
_registry: dict = {}


def _collect_raw_accessor_lambdas(mark) -> list:
    """Like `gofish.ast._collect_mark_lambdas`, but yields `(lambda_id,
    raw_fn)` pairs — the bare `(row) -> value` callable itself, not the
    rows-batched `lambda rows: [fn(r) for r in rows]` wrapper.

    Used only for gotree node templates (#792): a channel lambda embedded
    directly in a gotree `node=` Mark template is resolved one row at a
    time via the `__gofish_args` positional-call convention (see
    `_register_gotree_lambdas`/`_handle_derive`), never batched, so the
    registry must hold the raw callable.
    """
    from gofish.ast import _PendingAccessor

    pairs: list = []
    for val in mark.kwargs.values():
        if isinstance(val, _PendingAccessor):
            pairs.append((val.lambda_id, val.fn))
    if mark._children is not None:
        for child in mark._children:
            pairs.extend(_collect_raw_accessor_lambdas(child))
    return pairs


def _register_gotree_lambdas(tree_obj) -> list:
    """Register the lambdas hanging off a `gofish.gotree.Tree` (#792):
    a `node=` mark-fn callable, a `node=` template's own channel
    accessors, and/or a `link=` callable. All three are invoked by the JS
    reconstruction (`reconstructGotreeTree` in
    `packages/gofish-gotree/src/serialize.ts`) as single positional-arg
    RPCs (`ctx.applyLambda(id, args)`), never as row batches — see
    `makeGotreeApplyLambda`'s doc comment in
    `packages/gofish-python/widget-src/index.ts` for the wire convention
    (`{"__gofish_args": args}`) and `_handle_derive` below for the
    Python-side unwrap. Returns the registered lambda ids.
    """
    from gofish.ast import Mark, _MarkFn, _PendingAccessor, _collect_mark_lambdas

    derive_ids: list = []

    node = tree_obj._node
    if isinstance(node, _MarkFn):
        user_fn = node.fn

        def _node_fn(row, _fn=user_fn):
            mark = _fn(row)
            if not isinstance(mark, Mark):
                raise TypeError(
                    "gotree.tree(): node= callable must return a gofish "
                    f"Mark, got {type(mark).__name__}"
                )
            # The returned mark may itself carry channel accessors (fresh
            # `_PendingAccessor`s minted inside the call) — register them
            # under the ordinary rows-batched contract, since those are
            # resolved by `mapMark`'s normal DeriveBridge, not by another
            # `ctx.applyLambda` round trip.
            for lam_id, rows_fn in _collect_mark_lambdas(mark):
                _registry[lam_id] = rows_fn
            return mark.to_dict()

        _registry[node.lambda_id] = _node_fn
        derive_ids.append(node.lambda_id)
    elif isinstance(node, Mark):
        for lam_id, fn in _collect_raw_accessor_lambdas(node):
            _registry[lam_id] = fn
            derive_ids.append(lam_id)

    link = tree_obj._link
    if isinstance(link, _PendingAccessor):
        _registry[link.lambda_id] = link.fn
        derive_ids.append(link.lambda_id)

    return derive_ids

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

        Response (chart): {operators, mark, options, data, deriveIds}
        Response (layer): {"_kind": "layer", charts, options, deriveIds}
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

            builder = result[0]
            options = result[1] if len(result) > 1 else {}

            from gofish.ast import (
                ChartBuilder,
                DeriveOperator,
                LayerBuilder,
                Mark,
                Token,
                _RefProxy,
                _collect_mark_lambdas,
                _MarkFn,
                _InputRef,
            )
            from gofish.gotree import Tree

            if isinstance(builder, Tree):
                # A gotree Tree is a standalone top-level render, like a
                # raw Mark story (#792) — it is never a ChartBuilder/
                # LayerBuilder, and its lambdas (node mark-fn/template
                # accessors, link callable) use the positional
                # `__gofish_args` convention, not the rows-batched one.
                self._json_response(200, {
                    "_kind": "raw-mark",
                    "mark": builder.to_dict(),
                    "options": options,
                    "deriveIds": _register_gotree_lambdas(builder),
                })
                return

            def serialize_chart(child) -> tuple:
                """Return (child_payload, derive_ids) for one layer tier.

                child_payload: {operators, mark, options, data, zOrder}
                  data is the canonical Frontend.DataIR shape:
                    - {"type": "inline", "rows": [...]} for inline rows
                    - {"type": "select", "layer": name, "mode": ...} for ref/selectAll data
                  See packages/gofish-ir/src/frontend/schema.ts.

                A bare `Mark` tier (a component-level annotation via
                ``.layer(mark)``) serializes as a ``{type: "raw-mark", mark}``
                payload; its accessor lambdas are registered so paint-time reads
                resolve over the derive RPC.
                """
                if isinstance(child, Mark):
                    mark_ids = []
                    for lambda_id, rows_fn in _collect_mark_lambdas(child):
                        mark_ids.append(lambda_id)
                        _registry[lambda_id] = rows_fn
                    return (
                        {"type": "raw-mark", "mark": child.to_dict()},
                        mark_ids,
                    )
                child_ir = child.to_ir()
                if isinstance(child.data, _RefProxy) or child._uses_previous_marks():
                    # `_RefProxy` (ref/selectAll) → {"type": "select", ...};
                    # an empty `chart()` scope inside a `.layer(...)` chain →
                    # {"type": "previous-tier"} (JS's LayerBuilder derives the
                    # auto-name/selectAll wiring from that marker — see
                    # ChartBuilder.to_ir / _PREVIOUS_LAYER_MARKS in ast.py).
                    child_data = child_ir["data"]
                else:
                    raw = child.data
                    if hasattr(raw, "to_dict"):
                        rows = raw.to_dict("records")
                    elif hasattr(raw, "to_dicts"):
                        rows = raw.to_dicts()
                    else:
                        rows = raw
                    # Wrap inline rows in the canonical DataIR shape.
                    if isinstance(rows, list):
                        child_data = {"type": "inline", "rows": rows}
                    else:
                        child_data = rows

                child_derive_ids = []
                for op in child.operators:
                    if isinstance(op, DeriveOperator):
                        child_derive_ids.append(op.lambda_id)
                        _registry[op.lambda_id] = op.fn

                # Register every callable accessor on the mark in the same
                # registry. The harness/widget rebuilds an async arrow that
                # POSTs `[row]` to `/derive/<lambda_id>` per invocation.
                if child._mark is not None and not isinstance(child._mark, _MarkFn):
                    for lambda_id, rows_fn in _collect_mark_lambdas(child._mark):
                        child_derive_ids.append(lambda_id)
                        _registry[lambda_id] = rows_fn
                # Mark-as-function: register a wrapper that runs the user's
                # `(data) -> ChartBuilder` callable, recursively serializes
                # the resulting ChartBuilder (which also registers its own
                # derive ops + nested mark lambdas), and returns the chart
                # IR. The JS harness fetches this IR per invocation and
                # builds a ChartBuilder from it.
                if isinstance(child._mark, _MarkFn):
                    mark_fn = child._mark
                    child_derive_ids.append(mark_fn.lambda_id)

                    def _mark_fn_wrapped(data, _user_fn=mark_fn.fn):
                        # The JS harness/widget replaces each live `GoFishRef`
                        # argument (e.g. `.flow(group(...)).mark((refs) =>
                        # ...)`'s per-group refs) with an `{"__inputRef": i,
                        # "datum": ...}` sentinel before the RPC — a ref can't
                        # cross as JSON. Reconstruct an `_InputRef` per
                        # sentinel so the user's function sees `d[0].datum`
                        # exactly like the JS story does (issue #591). Rows
                        # with no sentinel (the pre-#591 plain-data contract)
                        # pass through unchanged.
                        wrapped_data = [
                            _InputRef(row["__inputRef"], row.get("datum"))
                            if isinstance(row, dict) and "__inputRef" in row
                            else row
                            for row in data
                        ]
                        result = _user_fn(wrapped_data)
                        # A mark-fn may return a ChartBuilder (build a chart
                        # for the group) or a bare Mark (e.g. a `spread([...])`
                        # combinator embedding one of the input refs directly,
                        # mirroring JS `spread({...}, [d[0], text(...)])`).
                        # `serialize_chart` already dispatches on both.
                        payload, _inner_ids = serialize_chart(result)
                        # Return as a single-element list to fit the existing
                        # `/derive/<id>` rows-in / rows-out contract.
                        return [payload]

                    _registry[mark_fn.lambda_id] = _mark_fn_wrapped

                # A chart layered with `.name(...)` carries its name so a
                # `Layer([...]).constrain(...)` callback can reference it.
                child_name = getattr(child, "_name", None)
                if isinstance(child_name, Token):
                    child_name = child_name.to_dict()

                return (
                    {
                        "type": "chart",
                        "operators": child_ir["operators"],
                        "mark": child_ir["mark"],
                        "options": child_ir.get("options", {}),
                        "data": child_data,
                        "zOrder": child_ir.get("zOrder"),
                        "name": child_name,
                    },
                    child_derive_ids,
                )

            if isinstance(builder, Mark):
                # Raw-mark render path: a Mark returned directly from a
                # story (no Chart, no Layer). Mirrors JS storybook spelling
                # `spread(opts, [marks]).render(container, {w, h})`.
                raw_mark_derive_ids = []
                for lambda_id, rows_fn in _collect_mark_lambdas(builder):
                    raw_mark_derive_ids.append(lambda_id)
                    _registry[lambda_id] = rows_fn
                self._json_response(200, {
                    "_kind": "raw-mark",
                    "mark": builder.to_dict(),
                    "options": options,
                    "deriveIds": raw_mark_derive_ids,
                })
                return

            if isinstance(builder, LayerBuilder):
                child_payloads = []
                derive_ids: list = []
                for child in builder.children:
                    payload, child_derive_ids = serialize_chart(child)
                    child_payloads.append(payload)
                    derive_ids.extend(child_derive_ids)

                layer_payload = {
                    "_kind": "layer",
                    "charts": child_payloads,
                    "options": {**(builder.options or {}), **options},
                    "deriveIds": derive_ids,
                    # Only the fluent `chart(...).layer(...)` chain is the v3
                    # builder (JS reconstructs it through its own LayerBuilder).
                    # The array form `layer([c1, c2])` is the low-level
                    # combinator, mirroring JS `layer([...])`.
                    "builder": getattr(builder, "_builder_chain", False),
                }
                # `.constrain(...)` constraints relating the named children.
                layer_constraints = getattr(builder, "_constraints", None)
                if layer_constraints is not None:
                    layer_payload["constraints"] = [
                        c.to_dict() for c in layer_constraints
                    ]
                self._json_response(200, layer_payload)
                return

            chart_payload, derive_ids = serialize_chart(builder)
            chart_payload["options"] = {**chart_payload["options"], **options}
            chart_payload["deriveIds"] = derive_ids
            self._json_response(200, chart_payload)
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

            # gotree lambda calls (#792): the JS adapter
            # (`makeGotreeApplyLambda`/`applyGotreeLambda`) sends a single
            # positional-arg call as a one-row batch, `[{"__gofish_args":
            # args}]`, because gofish-gotree's own `applyLambda(id, args)`
            # contract is one-call/positional-args, not rows-in/rows-out.
            # Ordinary derive/channel lambdas never send this shape, so
            # this unwrap only ever fires for `_register_gotree_lambdas`-
            # registered callables, which expect their args positionally.
            if (
                isinstance(data, list)
                and len(data) == 1
                and isinstance(data[0], dict)
                and set(data[0].keys()) == {"__gofish_args"}
            ):
                result = fn(*data[0]["__gofish_args"])
                self._json_response(200, [result])
                return

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
