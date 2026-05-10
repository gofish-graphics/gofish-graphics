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
import sys
import os
import traceback
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse

# Add project root to path so we can import gofish
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "../.."))
sys.path.insert(0, os.path.join(PROJECT_ROOT, "packages/gofish-python"))
sys.path.insert(0, os.path.join(PROJECT_ROOT, "tests"))

# Registry: lambdaId → Python function
_registry: dict = {}


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
        Response (layer): {"_kind": "layer-unsupported"}
        """
        try:
            data = json.loads(body)
            story_file = data["storyFile"]
            function_name = data["function"]
            pkg_dir = data.get("pythonStoriesDir")

            # Make `from python_stories.data import ...` resolvable, the same
            # way capture-python-dom.ts had to set it up before.
            if pkg_dir and "python_stories" not in sys.modules:
                pkg_init = os.path.join(pkg_dir, "__init__.py")
                pkg_spec = importlib.util.spec_from_file_location(
                    "python_stories", pkg_init,
                    submodule_search_locations=[pkg_dir]
                )
                pkg_mod = importlib.util.module_from_spec(pkg_spec)
                sys.modules["python_stories"] = pkg_mod
                pkg_spec.loader.exec_module(pkg_mod)

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

            # Layer detection — same handling capture-python-dom.ts used to
            # do inline. Surfacing as a structured payload so the caller
            # can categorize.
            from gofish.ast import DeriveOperator, LayerBuilder
            if isinstance(builder, LayerBuilder):
                self._json_response(200, {"_kind": "layer-unsupported"})
                return

            ir = builder.to_ir()
            data_attr = builder.data

            # Register every DeriveOperator using the *same* lambda_ids that
            # appear in the IR — this is the whole point of doing it in the
            # same call.
            derive_ids = []
            for op in builder.operators:
                if isinstance(op, DeriveOperator):
                    derive_ids.append(op.lambda_id)
                    _registry[op.lambda_id] = op.fn

            # Serialize data
            if hasattr(data_attr, "to_dict"):
                data_attr = data_attr.to_dict("records")
            elif hasattr(data_attr, "to_dicts"):
                data_attr = data_attr.to_dicts()

            self._json_response(200, {
                "operators": ir["operators"],
                "mark": ir["mark"],
                "options": {**ir.get("options", {}), **options},
                "data": data_attr,
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
        self.wfile.write(json.dumps(data).encode())

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
