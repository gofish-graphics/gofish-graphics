"""AnyWidget-based chart rendering for GoFish.

Uses the Altair / Plotly trait protocol: synced traitlets + observer
handlers, no `experimental.invoke` / `@command`. JS reads the chart spec
and data on mount; for `derive` operators it round-trips through the
`derive_request` / `derive_response` trait pair, which works identically
in Jupyter and marimo.
"""

import base64
import uuid
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional

import anywidget
import traitlets

from .arrow_utils import arrow_to_dataframe, dataframe_to_arrow


class GoFishChartWidget(anywidget.AnyWidget):
    """Widget for rendering GoFish charts from JSON specifications."""

    # Spec + data: set once in __init__, read by JS on mount.
    spec = traitlets.Dict().tag(sync=True)
    arrow_data = traitlets.Unicode().tag(sync=True)  # base64 Arrow IPC bytes
    width = traitlets.Int(800).tag(sync=True)
    height = traitlets.Int(600).tag(sync=True)
    axes = traitlets.Bool(False).tag(sync=True)
    debug = traitlets.Bool(False).tag(sync=True)
    container_id = traitlets.Unicode().tag(sync=True)

    # Derive RPC: JS posts a request, Python's observer handles it and
    # writes the response. Sequential — at most one in-flight per widget.
    derive_request = traitlets.Dict(allow_none=True, default_value=None).tag(sync=True)
    derive_response = traitlets.Dict(allow_none=True, default_value=None).tag(sync=True)

    # Terminal status from the JS side: {value: True} on success or
    # {error: str} on failure. Powers .result/.error/.done.
    render_result = traitlets.Dict(allow_none=True, default_value=None).tag(sync=True)

    # Rendered SVG reported by the JS side once the chart mounts:
    # {value: "<svg…>"}. Powers .svg / .to_svg() / .save(). See #571.
    svg_result = traitlets.Dict(allow_none=True, default_value=None).tag(sync=True)

    # Python-only registry: lambda_id -> callable. Never synced.
    derive_functions = traitlets.Dict().tag(sync=False)

    def __init__(
        self,
        spec: Dict[str, Any],
        arrow_data: bytes,
        derive_functions: Optional[Dict[str, Callable]] = None,
        width: int = 800,
        height: int = 600,
        axes: bool = False,
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

        arrow_data_b64 = base64.b64encode(arrow_data).decode("utf-8")

        super().__init__(
            _esm=esm_code,
            spec=spec,
            arrow_data=arrow_data_b64,
            width=width,
            height=height,
            axes=axes,
            debug=debug,
            container_id=container_id,
            derive_functions=derive_functions or {},
            **kwargs,
        )

        # SVG export state (#571). The front-end reports its rendered SVG via
        # the `svg_result` trait; we stash the latest here and flush any saves
        # that were requested before the render completed.
        self._svg: Optional[str] = None
        self._pending_saves: List[Any] = []

    @traitlets.observe("derive_request")
    def _on_derive_request(self, change):
        """Run a Python derive callback and publish the result.

        JS sets ``derive_request = {request_id, lambda_id, arrow_b64}``.
        We look up the registered function, run it on the decoded data,
        and publish ``derive_response = {request_id, result_b64}``.
        Errors are surfaced via ``derive_response = {request_id, error}``
        so the JS bridge can reject the awaiting promise.
        """
        msg = change["new"]
        if not msg:
            return
        request_id = msg.get("request_id")
        lambda_id = msg.get("lambda_id")
        arrow_b64 = msg.get("arrow_b64")
        if not request_id or not lambda_id or not arrow_b64:
            return

        try:
            fn = self.derive_functions.get(lambda_id)
            if fn is None:
                raise ValueError(f"Derive function with ID {lambda_id} not found")

            df = arrow_to_dataframe(base64.b64decode(arrow_b64))
            result = fn(df.to_dict("records"))

            try:
                import pandas as pd
            except Exception as exc:  # pragma: no cover
                raise RuntimeError("pandas is required for derive execution") from exc

            if result is None:
                result_df = pd.DataFrame()
            elif isinstance(result, pd.DataFrame):
                result_df = result
            else:
                result_df = pd.DataFrame(result)

            result_b64 = base64.b64encode(dataframe_to_arrow(result_df)).decode("utf-8")
            self.derive_response = {"request_id": request_id, "result_b64": result_b64}
        except Exception as exc:
            self.derive_response = {"request_id": request_id, "error": str(exc)}

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
