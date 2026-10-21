"""AnyWidget-based chart rendering for GoFish.

Uses the Altair / Plotly trait protocol: synced traitlets + observer
handlers, no `experimental.invoke` / `@command`. JS reads the IR document on
mount; for every Python callback the IR names (a `derive` operator, an
accessor, a mark function) it round-trips through the `call_request` /
`call_response` trait pair, which works identically in Jupyter and marimo.
"""

import uuid
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional

import anywidget
import traitlets

from ._generated import _to_wire
from .ast import answer


class GoFishChartWidget(anywidget.AnyWidget):
    """Widget for rendering GoFish charts from frontend-IR documents."""

    # The IR document, as a host ships it (`ir_payload` in ast.py): its root
    # and its tables, the rows of every chart in it that has rows of its own,
    # as base64 Arrow IPC by the id the chart's data names. Set once in
    # __init__, read by JS on mount.
    doc = traitlets.Dict().tag(sync=True)
    width = traitlets.Int(800).tag(sync=True)
    height = traitlets.Int(600).tag(sync=True)
    # The JS `.render(container, options)` options. None = the render call did
    # not pass it, so the chart's own option (or the default) decides. `axes`
    # is a boolean or per-axis options (wire spelling), so it is untyped here.
    axes = traitlets.Any(None, allow_none=True).tag(sync=True)
    legend = traitlets.Bool(None, allow_none=True).tag(sync=True)
    padding = traitlets.Float(None, allow_none=True).tag(sync=True)
    debug = traitlets.Bool(False).tag(sync=True)
    container_id = traitlets.Unicode().tag(sync=True)

    # The one bridge call: JS posts a request, Python's observer answers it
    # with the reply's document. Sequential — at most one in flight per widget.
    call_request = traitlets.Dict(allow_none=True, default_value=None).tag(sync=True)
    call_response = traitlets.Dict(allow_none=True, default_value=None).tag(sync=True)

    # Terminal status from the JS side: {value: True} on success or
    # {error: str} on failure. Powers .result/.error/.done.
    render_result = traitlets.Dict(allow_none=True, default_value=None).tag(sync=True)

    # Rendered SVG reported by the JS side once the chart mounts:
    # {value: "<svg…>"}. Powers .svg / .to_svg() / .save(). See #571.
    svg_result = traitlets.Dict(allow_none=True, default_value=None).tag(sync=True)

    # Python-only registry: lambda_id -> callback (`_Payload.callbacks`).
    # Never synced. A mark function's reply adds the callbacks it names.
    callbacks = traitlets.Dict().tag(sync=False)

    def __init__(
        self,
        doc: Dict[str, Any],
        callbacks: Optional[Dict[str, Callable]] = None,
        width: int = 800,
        height: int = 600,
        axes: Optional[Any] = None,
        legend: Optional[bool] = None,
        padding: Optional[float] = None,
        debug: bool = False,
        **kwargs,
    ):
        container_id = f"gofish-chart-{uuid.uuid4().hex[:8]}"

        bundle_path = Path(__file__).parent / "_static" / "widget.esm.js"
        if not bundle_path.exists():
            raise FileNotFoundError(
                f"Widget bundle not found at {bundle_path}.\n"
                f"Build it with:  pnpm --filter gofish-python build:widget\n"
                f"If installing from PyPI, this should be included automatically."
            )
        esm_code = bundle_path.read_text(encoding="utf-8")

        super().__init__(
            _esm=esm_code,
            doc=doc,
            width=width,
            height=height,
            # Per-axis options are snake_case in Python and camelCase on the
            # wire, renamed (and checked) as `chart(axes=...)` does.
            axes=_to_wire(("ref", "AxesOptions"), axes, "axes"),
            legend=legend,
            padding=padding,
            debug=debug,
            container_id=container_id,
            callbacks=callbacks or {},
            **kwargs,
        )

        # SVG export state (#571). The front-end reports its rendered SVG via
        # the `svg_result` trait; we stash the latest here and flush any saves
        # that were requested before the render completed.
        self._svg: Optional[str] = None
        self._pending_saves: List[Any] = []

    @traitlets.observe("call_request")
    def _on_call_request(self, change):
        """Answer one bridge call from JS.

        JS sets ``call_request = {request_id, lambda_id, rows_b64}``, the
        rows as base64 Arrow. ``answer`` runs the callback and returns the
        reply's document, which we publish as ``call_response = {request_id,
        reply}``. Errors are surfaced via ``call_response = {request_id,
        error}`` so the JS bridge can reject the awaiting promise.
        """
        msg = change["new"]
        if not msg:
            return
        request_id = msg.get("request_id")
        lambda_id = msg.get("lambda_id")
        rows_b64 = msg.get("rows_b64")
        if not request_id or not lambda_id or rows_b64 is None:
            return

        try:
            reply = answer(self.callbacks, lambda_id, rows_b64)
            self.call_response = {"request_id": request_id, "reply": reply}
        except Exception as exc:
            self.call_response = {"request_id": request_id, "error": str(exc)}

    @traitlets.observe("svg_result")
    def _on_svg_result(self, change):
        """Stash the SVG reported by JS and flush any deferred saves.

        JS sets ``svg_result = {value: "<svg…>"}`` once the chart mounts.
        Saves requested before the render finished are queued in
        ``_pending_saves`` and written here, when the markup is available.
        """
        msg = change["new"]
        if not msg:
            return
        svg = msg.get("value")
        if not isinstance(svg, str):
            return
        self._svg = svg
        if self._pending_saves:
            pending, self._pending_saves = self._pending_saves, []
            for path in pending:
                self._write_svg(path)

    def _write_svg(self, path) -> None:
        """Write the captured SVG to ``path`` (extension must be ``.svg``)."""
        suffix = Path(path).suffix.lower()
        if suffix != ".svg":
            raise ValueError(
                f'save(): only ".svg" is supported today (got "{suffix or path}"). '
                "PNG and HTML export are tracked in #578."
            )
        if self._svg is None:
            raise RuntimeError("No SVG to write")
        Path(path).write_text(self._svg, encoding="utf-8")

    @property
    def svg(self) -> Optional[str]:
        """The rendered SVG markup, or ``None`` if the chart hasn't rendered yet."""
        return self._svg

    def to_svg(self) -> str:
        """Return the rendered SVG markup.

        Requires the widget to have rendered in a live front-end first
        (display it in a cell, then call ``.to_svg()``). Headless, synchronous
        rendering is tracked in #577.
        """
        if self._svg is None:
            raise RuntimeError(
                "Widget hasn't rendered yet — display it in a cell first, then "
                "call .to_svg(). (Headless rendering is tracked in #577.)"
            )
        return self._svg

    def save(self, path) -> None:
        """Save the rendered SVG to ``path`` (format inferred from extension).

        If the chart has already rendered, the file is written immediately;
        otherwise the write is deferred until the front-end reports its SVG —
        so ``save()`` works even when called before display, as long as the
        widget is then shown in the notebook.
        """
        # Validate the extension eagerly so a bad path fails fast.
        suffix = Path(path).suffix.lower()
        if suffix != ".svg":
            raise ValueError(
                f'save(): only ".svg" is supported today (got "{suffix or path}"). '
                "PNG and HTML export are tracked in #578."
            )
        if self._svg is not None:
            self._write_svg(path)
        else:
            self._pending_saves.append(path)

    @property
    def result(self) -> bool:
        """True once the JS side has reported a successful render."""
        res = self.render_result
        return bool(res and "value" in res)

    @property
    def error(self) -> Optional[str]:
        """Error string from the JS side, or None if there was none."""
        res = self.render_result
        return res.get("error") if res else None

    @property
    def done(self) -> bool:
        """True once the JS side has reported a terminal status."""
        return self.render_result is not None
