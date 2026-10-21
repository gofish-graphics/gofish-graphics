"""
Python derive server: the parity harness's Python host. It answers the JS
bridge's one call for every Python callback a story names (a derive
operator, an accessor, a mark function), as the notebook widget does.

Endpoints:
  POST /load           — Import a story file and build its document in one
                         shot (`ir_payload`): the root and its tables as base64
                         Arrow by id, as the widget ships them. Registers the
                         callbacks the document names, and returns the
                         document, the render options and the callback ids.
                         Combining import + register avoids the two-process
                         pitfall: `derive(lambda)` mints a fresh UUID per
                         call, so importing the story separately from
                         extracting the IR yields divergent lambda ids.
  POST /call/<id>      — Answer one bridge call (`answer`): the body is the
                         call as JSON, its rows and the refs they hold as
                         base64 Arrow, the reply a document of the same
                         shape as /load's. A mark function's reply
                         registers the callbacks it names.
  POST /reset          — Clear all registered callbacks
  GET  /health         — Health check

The capture-python-dom.ts script starts this server and posts /load for each
story; the test harness calls /call/<id> during the render.
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

# Registry: lambda id → callback (`_Payload.callbacks`)
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
        elif parsed.path.startswith("/call/"):
            lambda_id = parsed.path[len("/call/"):]
            self._handle_call(lambda_id, body)
        elif parsed.path == "/reset":
            _registry.clear()
            self._json_response(200, {"status": "cleared"})
        else:
            self._json_response(404, {"error": "not found"})

    def _handle_load(self, body: bytes):
        """Import a story, build its document, and register the callbacks
        it names.

        Body: {"storyFile": "/abs/path/test_X.py", "function": "story_default",
               "pythonStoriesDir": "/abs/path/tests/python-stories"}

        Response: {"doc": <the builder's document, as the widget ships it
                           (`ir_payload`): its root and its tables as base64
                           Arrow IPC by id>,
                   "render": <the story's render options>,
                   "callbackIds": [<every lambda id the IR names>]}
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

            from gofish.ast import ChartBuilder, LayerBuilder, Mark, ir_payload

            if not isinstance(builder, (ChartBuilder, LayerBuilder, Mark)):
                raise TypeError(
                    "a story must return a chart, a layer chain or a mark, got "
                    f"{type(builder).__name__}"
                )
            doc, callbacks = ir_payload(builder)
            _registry.update(callbacks)
            self._json_response(200, {
                "doc": doc,
                "render": render,
                "callbackIds": list(callbacks),
            })
        except Exception as e:
            self._json_response(500, {
                "error": str(e),
                "traceback": traceback.format_exc(),
            })

    def _handle_call(self, lambda_id: str, body: bytes):
        """Answer one bridge call: the body is the call as JSON, its rows and
        the refs they hold as base64 Arrow (``rows_b64``, ``refs_b64``)."""
        from gofish.ast import answer

        try:
            call = json.loads(body)
            self._json_response(
                200,
                answer(_registry, lambda_id, call["rows_b64"], call["refs_b64"]),
            )
        except Exception as e:
            self._json_response(500, {
                "error": str(e),
                "lambda_id": lambda_id,
                "traceback": traceback.format_exc(),
            })

    def _json_response(self, status: int, data):
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()
        self.wfile.write(json.dumps(data, allow_nan=False).encode())

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
