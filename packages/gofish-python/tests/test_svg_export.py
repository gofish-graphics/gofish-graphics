"""In-process tests for SVG export — the notebook case (#571).

In a real notebook the SVG is produced by the JS front-end and handed back to
the kernel via the ``svg_result`` trait; ``.save()`` / ``.to_svg()`` then run in
Python. These tests exercise that kernel-side path without a browser by driving
``svg_result`` exactly the way the widget bundle does once the chart mounts —
the same approach as ``test_widget_protocol.py`` for the derive bridge.

The one thing that genuinely needs a browser (turning the spec into SVG markup)
is stubbed with a representative string shaped like ``serializeSVG``'s output;
everything these tests cover is code that actually runs in Kartik's kernel.
"""

import pandas as pd
import pytest

from gofish import chart, rect
from gofish.widget import GoFishChartWidget

# Representative of what the JS `serializeSVG` reports back over `svg_result`.
SAMPLE_SVG = (
    '<?xml version="1.0" encoding="UTF-8"?>\n'
    '<svg xmlns="http://www.w3.org/2000/svg" '
    'xmlns:xlink="http://www.w3.org/1999/xlink" '
    'width="500" height="345" viewBox="0 0 500 345">'
    '<rect fill="#4190c5" width="60" height="100" x="0" y="0"></rect>'
    "</svg>"
)

SEAFOOD = [
    {"lake": "A", "count": 102},
    {"lake": "B", "count": 137},
    {"lake": "C", "count": 124},
]


def _bar_chart():
    """A minimal real chart builder, like the one a notebook user writes."""
    return chart(SEAFOOD, axes=True).mark(rect(h="count"))


def _emit_svg(widget: GoFishChartWidget, svg: str = SAMPLE_SVG) -> None:
    """Simulate the front-end reporting its rendered SVG once the chart mounts.

    This is the single browser-side step we stand in for: when the widget
    renders in a notebook, the JS bundle sets ``svg_result = {"value": ...}``.
    """
    widget.svg_result = {"value": svg}


class TestSvgResultChannel:
    def test_svg_result_populates_svg_and_to_svg(self):
        """Front-end push -> widget.svg / to_svg() return the markup."""
        widget = _bar_chart().render()
        assert widget.svg is None  # nothing until the front-end renders

        _emit_svg(widget)

        assert widget.svg == SAMPLE_SVG
        assert widget.to_svg() == SAMPLE_SVG

    def test_to_svg_before_render_raises_pointing_to_headless(self):
        """Before the front-end reports, to_svg() can't synthesize one (see #577)."""
        widget = _bar_chart().render()
        with pytest.raises(RuntimeError) as exc:
            widget.to_svg()
        assert "577" in str(exc.value)

    def test_empty_svg_result_is_ignored(self):
        """A None/empty svg_result must not clobber state or crash the observer."""
        widget = _bar_chart().render()
        widget.svg_result = {}
        assert widget.svg is None
        widget.svg_result = {"value": None}
        assert widget.svg is None


class TestSaveAfterRender:
    def test_save_writes_file_once_rendered(self, tmp_path):
        widget = _bar_chart().render()
        _emit_svg(widget)

        out = tmp_path / "chart.svg"
        widget.save(out)

        assert out.read_text(encoding="utf-8") == SAMPLE_SVG

    def test_save_rejects_non_svg_extension(self, tmp_path):
        """Unsupported formats fail fast, pointing at the PNG/HTML follow-up (#578)."""
        widget = _bar_chart().render()
        _emit_svg(widget)
        with pytest.raises(ValueError) as exc:
            widget.save(tmp_path / "chart.png")
        assert "578" in str(exc.value)


class TestNotebookSaveFlow:
    """The flow Kartik actually writes: `chart(...).save("chart.svg")` as the
    last expression in a cell. The builder returns a widget with a deferred
    write; displaying it renders the chart, which fires `svg_result`, which
    flushes the write."""

    def test_builder_save_returns_widget_and_defers_write(self, tmp_path):
        out = tmp_path / "chart.svg"
        widget = _bar_chart().save(out)

        # Returned so the cell auto-displays it; nothing written yet.
        assert isinstance(widget, GoFishChartWidget)
        assert not out.exists()

        # Front-end renders -> file appears.
        _emit_svg(widget)
        assert out.read_text(encoding="utf-8") == SAMPLE_SVG

    def test_builder_save_rejects_bad_extension_eagerly(self, tmp_path):
        """The extension is validated when .save() is called, before any render."""
        with pytest.raises(ValueError) as exc:
            _bar_chart().save(tmp_path / "chart.pdf")
        assert "578" in str(exc.value)

    def test_widget_save_before_render_defers(self, tmp_path):
        """widget.save() called before the SVG arrives queues the write."""
        widget = _bar_chart().render()
        out = tmp_path / "chart.svg"
        widget.save(out)
        assert not out.exists()

        _emit_svg(widget)
        assert out.read_text(encoding="utf-8") == SAMPLE_SVG

    def test_multiple_pending_saves_all_flush(self, tmp_path):
        widget = _bar_chart().render()
        a, b = tmp_path / "a.svg", tmp_path / "b.svg"
        widget.save(a)
        widget.save(b)

        _emit_svg(widget)

        assert a.read_text(encoding="utf-8") == SAMPLE_SVG
        assert b.read_text(encoding="utf-8") == SAMPLE_SVG

    def test_save_path_accepts_str(self, tmp_path):
        widget = _bar_chart().render()
        out = tmp_path / "chart.svg"
        widget.save(str(out))  # str, not Path
        _emit_svg(widget)
        assert out.exists()
