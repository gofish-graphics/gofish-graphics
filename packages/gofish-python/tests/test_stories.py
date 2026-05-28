"""Tests that all Python story modules produce valid chart IR.

Each story is imported, called with inline/default data, and its IR structure
is validated. Network-dependent stories (vega-lite with remote data) are tested
with minimal stub data to verify the chart spec is structurally correct.
"""

import pytest
from gofish.ast import ChartBuilder, LayerBuilder

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _assert_valid_ir(builder: ChartBuilder):
    """Assert a ChartBuilder produces a structurally valid IR dict."""
    assert isinstance(builder, ChartBuilder), "story must return a ChartBuilder"
    ir = builder.to_ir()
    assert "mark" in ir
    assert "type" in ir["mark"]
    assert "operators" in ir
    assert isinstance(ir["operators"], list)
    assert "options" in ir


def _assert_valid_layer_ir(builder: LayerBuilder):
    """Assert a LayerBuilder produces a structurally valid IR dict."""
    assert isinstance(builder, LayerBuilder), "story must return a LayerBuilder"
    ir = builder.to_ir()
    assert ir["type"] == "layer"
    assert "charts" in ir
    assert isinstance(ir["charts"], list)
    assert len(ir["charts"]) >= 2
    for chart_ir in ir["charts"]:
        assert "mark" in chart_ir
        assert "type" in chart_ir["mark"]


# ---------------------------------------------------------------------------
# Forward Syntax — Bar stories (all use inline data, no network)
# ---------------------------------------------------------------------------

class TestForwardsyntaxBar:
    def test_bar_basic(self):
        from stories.forwardsyntax.bar.bar_basic import default
        _assert_valid_ir(default())

    def test_bar_grouped(self):
        from stories.forwardsyntax.bar.bar_grouped import default
        _assert_valid_ir(default())

    def test_bar_stacked(self):
        from stories.forwardsyntax.bar.bar_stacked import default
        _assert_valid_ir(default())

    def test_bar_horizontal(self):
        from stories.forwardsyntax.bar.bar_horizontal import default
        _assert_valid_ir(default())

    def test_bar_stacked_with_labels(self):
        from stories.forwardsyntax.bar.bar_stacked_with_labels import default
        _assert_valid_ir(default())

    def test_bar_stacked_fluent(self):
        from stories.forwardsyntax.bar.bar_stacked_fluent import default
        _assert_valid_ir(default())

    def test_bar_negative(self):
        from stories.forwardsyntax.bar.bar_negative import default
        _assert_valid_ir(default())

    def test_bar_sorted_stacked(self):
        from stories.forwardsyntax.bar.bar_sorted_stacked import default
        _assert_valid_ir(default())


# ---------------------------------------------------------------------------
# Forward Syntax — other charts
# ---------------------------------------------------------------------------

class TestForwardsyntaxOther:
    def test_mosaic_chart(self):
        from stories.forwardsyntax.mosaic_chart import default
        _assert_valid_ir(default())

    def test_scatter_basic(self):
        from stories.forwardsyntax.scatter import basic
        _assert_valid_ir(basic())


# ---------------------------------------------------------------------------
# Vega-Lite stories — use stub data to avoid network calls
# ---------------------------------------------------------------------------

class TestVegaLite:
    def test_simple_bar_chart(self):
        from stories.vega_lite.simple_bar_chart import default
        _assert_valid_ir(default())

    def test_aggregate_bar_chart(self):
        from stories.vega_lite.aggregate_bar_chart import default
        stub = [{"age": 5, "people": 1000, "year": 2000, "sex": 1}]
        _assert_valid_ir(default(data=stub))

    def test_aggregate_bar_chart_sorted(self):
        from stories.vega_lite.aggregate_bar_chart_sorted import default
        stub = [{"age": 5, "people": 1000}, {"age": 10, "people": 500}]
        _assert_valid_ir(default(data=stub))

    def test_grouped_bar_chart(self):
        from stories.vega_lite.grouped_bar_chart import default
        _assert_valid_ir(default())

    def test_horizontal_stacked_bar_chart(self):
        from stories.vega_lite.horizontal_stacked_bar_chart import default
        stub = [{"variety": "V1", "site": "S1", "yield": 25.0}]
        _assert_valid_ir(default(data=stub))

    def test_normalized_stacked_bar_chart(self):
        from stories.vega_lite.normalized_stacked_bar_chart import default
        stub = [
            {"age": 5, "people": 600, "sex": 1, "year": 2000},
            {"age": 5, "people": 400, "sex": 2, "year": 2000},
        ]
        _assert_valid_ir(default(data=stub))

    def test_scatter_plot(self):
        from stories.vega_lite.scatter_plot import default
        stub = [{"Name": "Car A", "Horsepower": 100, "Miles_per_Gallon": 20}]
        _assert_valid_ir(default(data=stub))

    def test_stacked_bar_chart(self):
        from stories.vega_lite.stacked_bar_chart import default
        stub = [{"date": "2012-01-01", "weather": "sun", "precipitation": 0.0}]
        _assert_valid_ir(default(data=stub))

    def test_stacked_bar_chart_rounded(self):
        from stories.vega_lite.stacked_bar_chart_rounded import default
        stub = [{"date": "2012-01-01", "weather": "sun"}]
        _assert_valid_ir(default(data=stub))

    def test_strip_plot(self):
        from stories.vega_lite.strip_plot import default
        stub = [{"name": "Car A", "horsepower": 100, "cylinders": 4}]
        _assert_valid_ir(default(data=stub))

    def test_strip_plot_1d(self):
        from stories.vega_lite.strip_plot_1d import default
        stub = [{"date": "2012-01-01", "precipitation": 0.5, "stripY": 0.1}]
        _assert_valid_ir(default(data=stub))


# ---------------------------------------------------------------------------
# Layer stories — unblocked now that Layer is implemented
# ---------------------------------------------------------------------------

class TestLayerStories:
    def test_ribbon_basic(self):
        from stories.forwardsyntax.ribbon import basic
        _assert_valid_layer_ir(basic())

    def test_ribbon_polar(self):
        from stories.forwardsyntax.ribbon import polar
        _assert_valid_layer_ir(polar())

    def test_line_chart(self):
        from stories.forwardsyntax.line_chart import default
        _assert_valid_layer_ir(default())

    def test_streamgraph(self):
        from stories.forwardsyntax.streamgraph import default
        _assert_valid_layer_ir(default())

    def test_scatter_connected(self):
        from stories.forwardsyntax.scatter_connected import connected
        _assert_valid_layer_ir(connected())


# ---------------------------------------------------------------------------
# Pie / clock() stories
# ---------------------------------------------------------------------------

class TestPieStories:
    def test_pie_basic(self):
        from stories.forwardsyntax.pie import basic
        _assert_valid_ir(basic())

    def test_pie_donut(self):
        from stories.forwardsyntax.pie import donut
        _assert_valid_ir(donut())

    def test_pie_rose(self):
        from stories.forwardsyntax.pie import rose
        _assert_valid_ir(rose())


# ---------------------------------------------------------------------------
# Blocked stories — xfail for remaining unsupported features
# ---------------------------------------------------------------------------

_V1_REASON = "requires v1 primitives (Spread, ref) — not yet in Python wrapper"


class TestBlockedStories:

    @pytest.mark.xfail(raises=NotImplementedError, reason=_V1_REASON, strict=True)
    def test_bar_with_labels(self):
        from stories.forwardsyntax.bar.bar_with_labels import default
        default()

    @pytest.mark.xfail(raises=NotImplementedError, reason="requires nested chart as mark function — not yet supported", strict=True)
    def test_scatter_with_pie_glyphs(self):
        from stories.forwardsyntax.scatter_connected import with_pie_glyphs
        with_pie_glyphs()


# ---------------------------------------------------------------------------
# Spot-check: verify IR operator/mark details for key stories
# ---------------------------------------------------------------------------

class TestIRDetails:
    def test_bar_basic_ir(self):
        from stories.forwardsyntax.bar.bar_basic import default
        ir = default().to_ir()
        assert ir["mark"]["type"] == "rect"
        assert ir["mark"]["h"] == "count"
        assert len(ir["operators"]) == 1
        assert ir["operators"][0]["type"] == "spread"
        assert ir["operators"][0]["by"] == "lake"
        assert ir["operators"][0]["dir"] == "x"

    def test_bar_stacked_fluent_ir(self):
        from stories.forwardsyntax.bar.bar_stacked_fluent import default
        ir = default().to_ir()
        ops = ir["operators"]
        assert len(ops) == 2
        assert ops[0]["type"] == "spread"
        assert ops[1]["type"] == "stack"

    def test_mosaic_ir(self):
        from stories.forwardsyntax.mosaic_chart import default
        ir = default().to_ir()
        ops = ir["operators"]
        assert len(ops) == 3
        assert ops[0]["type"] == "spread"
        assert ops[1]["type"] == "derive"
        assert ops[2]["type"] == "stack"

    def test_grouped_bar_color_option(self):
        from stories.vega_lite.grouped_bar_chart import default
        ir = default().to_ir()
        assert ir["options"]["color"]["_tag"] == "palette"

    def test_normalized_stacked_bar_ops(self):
        from stories.vega_lite.normalized_stacked_bar_chart import default
        stub = [
            {"age": 5, "people": 600, "sex": 1, "year": 2000},
            {"age": 5, "people": 400, "sex": 2, "year": 2000},
        ]
        ir = default(data=stub).to_ir()
        ops = ir["operators"]
        types = [o["type"] for o in ops]
        assert types == ["derive", "spread", "derive", "stack"]
