"""Tests for AST to IR conversion."""

import pytest
from gofish import (
    chart,
    layer,
    LayerBuilder,
    spread,
    stack,
    derive,
    log,
    clock,
    ref,
    selectAll,
    palette,
    gradient,
    normalize,
    repeat,
    rect,
    circle,
    line,
    area,
    ellipse,
    petal,
    text,
    image,
)
from gofish.ast import _RefProxy


class TestOperators:
    """Test operator creation and serialization."""

    def test_spread_operator_missing_dir(self):
        """Test spread operator requires dir."""
        with pytest.raises(ValueError, match="requires 'dir' option"):
            spread(by="field")

    def test_stack_operator_missing_dir(self):
        """Test stack operator requires dir."""
        with pytest.raises(ValueError, match="requires 'dir' option"):
            stack(by="field")

    def test_stack_combinator_form(self):
        """Test stack([marks], dir=...) returns a combinator-form Mark."""
        m = stack([rect(h="a"), rect(h="b")], dir="y")
        d = m.to_dict()
        assert d["type"] == "stack"
        assert d["__combinator"] is True
        assert d["options"] == {"dir": "y"}
        assert len(d["children"]) == 2
        assert d["children"][0]["type"] == "rect"

    def test_stack_combinator_rejects_by(self):
        """Test combinator-form stack rejects the operator-only `by` kwarg."""
        with pytest.raises(ValueError, match="does not accept"):
            stack([rect(h="a")], by="field", dir="y")

    def test_derive_operator(self):
        """Test derive operator."""
        fn = lambda d: d
        op = derive(fn)
        assert op.op_type == "derive"
        assert op.fn is fn
        assert "lambdaId" in op.to_dict()
        assert op.to_dict()["type"] == "derive"

    def test_derive_operator_unique_ids(self):
        """Test derive operators have unique lambda IDs."""
        fn = lambda d: d
        op1 = derive(fn)
        op2 = derive(fn)
        assert op1.lambda_id != op2.lambda_id

    def test_log_operator_no_label(self):
        """Test log operator without label."""
        op = log()
        assert op.op_type == "log"
        d = op.to_dict()
        assert d["type"] == "log"
        assert "label" not in d

    def test_log_operator_with_label(self):
        """Test log operator with label."""
        op = log("my label")
        d = op.to_dict()
        assert d["type"] == "log"
        assert d["label"] == "my label"


class TestMarkName:
    """Test Mark.name() method."""

    def test_name_returns_new_mark(self):
        """Test .name() returns a new Mark with name set."""
        m = rect(h="value")
        named = m.name("bars")
        assert named is not m
        assert named._name == "bars"
        assert m._name is None

    def test_name_in_to_dict(self):
        """Test name appears in to_dict() output."""
        m = rect(h="value").name("bars")
        d = m.to_dict()
        assert d["name"] == "bars"
        assert d["type"] == "rect"
        assert d["h"] == "value"

    def test_no_name_not_in_to_dict(self):
        """Test name not present in to_dict() when not set."""
        m = rect(h="value")
        d = m.to_dict()
        assert "name" not in d


class TestRefData:
    """Test `ref(...)` / `selectAll(...)` used as chart data."""

    def test_select_all_returns_ref_proxy(self):
        """Test selectAll() returns a _RefProxy carrying multiplicity='all'."""
        s = selectAll("bars")
        assert isinstance(s, _RefProxy)
        assert s.multiplicity == "all"
        assert s._sel() == ["bars"]

    def test_ref_singular_multiplicity(self):
        """Test ref() yields a _RefProxy with no (singular) multiplicity."""
        r = ref("bars")
        assert isinstance(r, _RefProxy)
        assert r.multiplicity is None

    def test_chart_with_ref_data_ir(self):
        """Test chart(ref(...)) serializes data as select spec, mode 'one'."""
        c = chart(ref("bars")).mark(line())
        ir = c.to_ir()
        assert ir["data"] == {"type": "select", "layer": "bars", "mode": "one"}

    def test_chart_with_select_all_data_ir(self):
        """Test chart(selectAll(...)) serializes with mode 'all'."""
        c = chart(selectAll("bars")).mark(line())
        ir = c.to_ir()
        assert ir["data"] == {"type": "select", "layer": "bars", "mode": "all"}

    def test_select_all_inline_raises(self):
        """selectAll() cannot be used inline in a layout."""
        with pytest.raises(ValueError, match="cannot be used inline"):
            selectAll("bars").to_dict()

    def test_chart_with_regular_data_ir(self):
        """Test regular chart has null data in IR."""
        c = chart([{"x": 1}]).mark(rect(h="x"))
        ir = c.to_ir()
        assert ir["data"] is None


class TestColorConfig:
    """Test palette() and gradient() color config."""

    def test_palette_string(self):
        """Test palette() with string name."""
        p = palette("tableau10")
        assert p == {"_tag": "palette", "values": "tableau10"}

    def test_palette_list(self):
        """Test palette() with color list."""
        p = palette(["red", "blue", "green"])
        assert p == {"_tag": "palette", "values": ["red", "blue", "green"]}

    def test_gradient_string(self):
        """Test gradient() with single color."""
        g = gradient("blue")
        assert g == {"_tag": "gradient", "stops": "blue"}

    def test_gradient_list(self):
        """Test gradient() with stop list."""
        g = gradient(["#fff", "#000"])
        assert g == {"_tag": "gradient", "stops": ["#fff", "#000"]}

    def test_palette_in_chart_options(self):
        """Test palette flows through chart options to IR."""
        c = chart([{"x": 1}], {"color": palette("tableau10")}).mark(rect(h="x"))
        ir = c.to_ir()
        assert ir["options"]["color"] == {"_tag": "palette", "values": "tableau10"}


class TestDataUtilities:
    """Test normalize() and repeat() utilities."""

    def test_normalize(self):
        """Test normalize() sums field to 1."""
        data = [{"v": 1}, {"v": 3}]
        result = normalize(data, "v")
        assert result[0]["v"] == pytest.approx(0.25)
        assert result[1]["v"] == pytest.approx(0.75)

    def test_normalize_preserves_other_fields(self):
        """Test normalize() keeps non-normalized fields."""
        data = [{"cat": "a", "v": 2}, {"cat": "b", "v": 2}]
        result = normalize(data, "v")
        assert result[0]["cat"] == "a"
        assert result[1]["cat"] == "b"

    def test_normalize_zero_total(self):
        """Test normalize() returns data unchanged when total is 0."""
        data = [{"v": 0}, {"v": 0}]
        result = normalize(data, "v")
        assert result == data

    def test_repeat(self):
        """Test repeat() creates N copies of a row."""
        row = {"item": "apple", "count": 3}
        result = repeat(row, "count")
        assert len(result) == 3
        assert all(r == row for r in result)

    def test_repeat_zero(self):
        """Test repeat() with count of 0 returns empty list."""
        row = {"item": "apple", "count": 0}
        result = repeat(row, "count")
        assert result == []


class TestConvenienceMethods:
    """Test ChartBuilder.facet() and .stack() convenience methods."""

    def test_facet_adds_spread_operator(self):
        """Test .facet() adds a spread operator."""
        data = [{"cat": "a", "v": 1}]
        c = chart(data).facet(by="cat", dir="x")
        ir = c.mark(rect(h="v")).to_ir()
        ops = ir["operators"]
        assert len(ops) == 1
        assert ops[0]["type"] == "spread"
        assert ops[0]["by"] == "cat"
        assert ops[0]["dir"] == "x"

    def test_stack_shortcut_adds_stack_operator(self):
        """Test .stack() convenience method adds a stack operator."""
        data = [{"grp": "a", "v": 1}]
        c = chart(data).stack(by="grp", dir="y")
        ir = c.mark(rect(h="v")).to_ir()
        ops = ir["operators"]
        assert len(ops) == 1
        assert ops[0]["type"] == "stack"
        assert ops[0]["by"] == "grp"
        assert ops[0]["dir"] == "y"

    def test_facet_and_stack_chained(self):
        """Test chaining .facet() and .stack()."""
        data = [{"cat": "a", "grp": "x", "v": 1}]
        c = (
            chart(data)
            .facet(by="cat", dir="x")
            .stack(by="grp", dir="y")
            .mark(rect(h="v"))
        )
        ir = c.to_ir()
        ops = ir["operators"]
        assert len(ops) == 2
        assert ops[0]["type"] == "spread"
        assert ops[1]["type"] == "stack"


class TestNewMarks:
    """Test ellipse, petal, text, image marks."""

    def test_ellipse_mark(self):
        """Test ellipse mark creation."""
        m = ellipse(w=10, h=20, fill="blue")
        d = m.to_dict()
        assert d["type"] == "ellipse"
        assert d["w"] == 10
        assert d["h"] == 20
        assert d["fill"] == "blue"

    def test_petal_mark(self):
        """Test petal mark creation."""
        m = petal(w="size", h="size")
        d = m.to_dict()
        assert d["type"] == "petal"
        assert d["w"] == "size"
        assert d["h"] == "size"

    def test_text_mark(self):
        """Test text mark creation."""
        m = text(fill="black", label="name")
        d = m.to_dict()
        assert d["type"] == "text"
        assert d["fill"] == "black"
        assert d["label"] == "name"

    def test_image_mark(self):
        """Test image mark creation."""
        m = image(w=100, h=100, href="url")
        d = m.to_dict()
        assert d["type"] == "image"
        assert d["w"] == 100
        assert d["href"] == "url"

    def test_marks_support_name(self):
        """Test all marks support .name()."""
        for mark_fn in [
            lambda: ellipse(w=10),
            lambda: petal(w=10),
            lambda: text(fill="red"),
            lambda: image(w=10),
        ]:
            m = mark_fn().name("layer1")
            assert m._name == "layer1"
            assert m.to_dict()["name"] == "layer1"


class TestClockCoord:
    """Test clock() coordinate transform."""

    def test_clock_returns_dict(self):
        """Test clock() returns the correct sentinel dict."""
        c = clock()
        assert c == {"type": "clock"}

    def test_clock_in_chart_options_ir(self):
        """Test clock() serializes correctly through chart options."""
        c = chart([{"x": 1}], {"coord": clock()}).mark(rect(h="x"))
        ir = c.to_ir()
        assert ir["options"]["coord"] == {"type": "clock"}

    def test_clock_in_layer_options_ir(self):
        """Test clock() in layer options IR."""
        child = chart([{"x": 1}]).mark(rect(h="x"))
        ir = layer({"coord": clock()}, [child]).to_ir()
        assert ir["options"]["coord"] == {"type": "clock"}


class TestLayerBuilder:
    """Test LayerBuilder and Layer() factory."""

    def test_layer_children_only(self):
        """Test layer([...]) with children only."""
        data = [{"x": 1}]
        c1 = chart(data).mark(rect(h="x").name("bars"))
        c2 = chart(ref("bars")).mark(line())
        lb = layer([c1, c2])
        assert isinstance(lb, LayerBuilder)
        assert lb.options == {}
        assert len(lb.children) == 2

    def test_layer_with_options(self):
        """Test layer(options, [...]) with options dict."""
        data = [{"x": 1}]
        c1 = chart(data).mark(rect(h="x"))
        lb = layer({"coord": "clock"}, [c1])
        assert isinstance(lb, LayerBuilder)
        assert lb.options == {"coord": "clock"}
        assert len(lb.children) == 1

    def test_layer_to_ir_structure(self):
        """Test LayerBuilder.to_ir() produces correct structure."""
        data = [{"x": 1}]
        c1 = chart(data).mark(rect(h="x").name("bars"))
        c2 = chart(ref("bars")).mark(line())
        ir = layer([c1, c2]).to_ir()
        assert ir["type"] == "layer"
        assert len(ir["charts"]) == 2
        assert ir["options"] == {}

    def test_layer_to_ir_child_specs(self):
        """Test child chart specs are correctly embedded in layer IR."""
        data = [{"x": 1}]
        c1 = chart(data).flow(spread(by="x", dir="x")).mark(rect(h="x").name("bars"))
        c2 = chart(ref("bars")).mark(line())
        ir = layer([c1, c2]).to_ir()

        chart0 = ir["charts"][0]
        assert chart0["mark"]["type"] == "rect"
        assert chart0["mark"]["name"] == "bars"
        assert chart0["operators"][0]["type"] == "spread"
        assert chart0["data"] is None

        chart1 = ir["charts"][1]
        assert chart1["mark"]["type"] == "line"
        assert chart1["data"] == {"type": "select", "layer": "bars", "mode": "one"}

    def test_layer_to_ir_with_options(self):
        """Test layer options appear in IR."""
        data = [{"x": 1}]
        c1 = chart(data).mark(rect(h="x"))
        ir = layer({"coord": "clock"}, [c1]).to_ir()
        assert ir["options"] == {"coord": "clock"}

    def test_layer_collect_derive_functions(self):
        """Test derive functions from all children are collected."""
        data = [{"x": 1}]
        fn1 = lambda d: d
        fn2 = lambda d: d
        c1 = chart(data).flow(derive(fn1)).mark(rect(h="x").name("bars"))
        c2 = chart(ref("bars")).flow(derive(fn2)).mark(line())
        lb = layer([c1, c2])

        # Collect derive functions manually (mirrors what render() does)
        derive_functions = {}
        for child in lb.children:
            for op in child.operators:
                from gofish.ast import DeriveOperator
                if isinstance(op, DeriveOperator):
                    derive_functions[op.lambda_id] = op.fn

        assert len(derive_functions) == 2
        assert fn1 in derive_functions.values()
        assert fn2 in derive_functions.values()


class TestChartBuilder:
    """Test ChartBuilder and IR generation."""

    def test_to_ir_requires_mark(self):
        """Test to_ir() requires a mark."""
        data = [{"x": 1, "y": 2}]
        c = chart(data).flow(spread(by="x", dir="x"))
        with pytest.raises(ValueError, match="must have a mark"):
            c.to_ir()

    def test_to_ir_with_derive(self):
        """Test to_ir() with derive operator."""
        data = [{"x": 1, "y": 2}]
        fn = lambda d: d
        c = chart(data).flow(derive(fn)).mark(rect(h="y"))
        ir = c.to_ir()
        assert len(ir["operators"]) == 1
        assert ir["operators"][0]["type"] == "derive"
        assert "lambdaId" in ir["operators"][0]

    def test_to_ir_full_example(self):
        """Test a full chart spec round-trips to IR correctly."""
        data = [{"cat": "a", "grp": "x", "value": 1}]
        c = (
            chart(data, {"color": palette("tableau10")})
            .facet(by="cat", dir="x")
            .stack(by="grp", dir="y")
            .mark(rect(h="value", fill="grp").name("bars"))
        )
        ir = c.to_ir()

        assert ir["data"] is None
        assert ir["options"]["color"] == {"_tag": "palette", "values": "tableau10"}
        assert len(ir["operators"]) == 2
        assert ir["operators"][0]["type"] == "spread"
        assert ir["operators"][1]["type"] == "stack"
        assert ir["mark"]["type"] == "rect"
        assert ir["mark"]["name"] == "bars"
        assert ir["mark"]["h"] == "value"
        assert ir["mark"]["fill"] == "grp"

    def test_to_ir_ref_with_line(self):
        """Test ref(...)-as-data chart with line mark."""
        c = chart(ref("bars")).mark(line())
        ir = c.to_ir()
        assert ir["data"] == {"type": "select", "layer": "bars", "mode": "one"}
        assert ir["mark"]["type"] == "line"
