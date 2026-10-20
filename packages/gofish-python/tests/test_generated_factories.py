"""Regression tests for the generated factory layer (gofish/_generated.py).

Each case pins a behavior from the descriptor-table codegen review: the
`debug` base kwarg on every leaf mark, the universal operator debug flag,
combinator-only fields on the treemap combinator, required wire fields, and
callable accessors on undeclared channels.

Labeling a leaf mark is done exclusively via the `.label(accessor, options?)`
chain (there is no leaf-mark `label` kwarg — the legacy boolean/string
shorthand kwarg was removed).
"""

import json

from gofish.ast import ir_payload

from ._ir import call, ir

import pytest

from gofish import (
    Calendar,
    Schema,
    blank,
    chart,
    circle,
    datum,
    ellipse,
    field,
    group,
    join,
    layer,
    line,
    pack,
    partition,
    petal,
    polygon,
    rect,
    region,
    ribbon,
    spread,
    scatter,
    stack,
    struct,
    table,
    text,
    treemap,
    Bin,
    Color,
    Overlap,
    Tile,
)


def test_text_accepts_debug_kwarg():
    mark = text(text="hi", debug=True)
    d = ir(mark)
    assert d["debug"] is True


def test_text_has_no_label_kwarg():
    with pytest.raises(TypeError):
        text(text="hi", label="name")


def test_text_label_via_chain():
    mark = text(text="hi").label("name")
    d = ir(mark)
    assert d["label"] == [{"accessor": "name"}]


def test_repeated_label_calls_append():
    """Calling `.label()` more than once appends to the wire array rather
    than overwriting — mirrors JS createOperator.ts's mark-side
    `labelModifier` accumulation."""
    mark = (
        text(text="hi")
        .label("name", position="center", color="white", font_weight="bold")
        .label("count", position="outset-top", font_size=9)
    )
    d = ir(mark)
    assert d["label"] == [
        {
            "accessor": "name",
            "position": "center",
            "color": "white",
            "fontWeight": "bold",
        },
        {"accessor": "count", "position": "outset-top", "fontSize": 9},
    ]


def test_operators_accept_universal_debug_flag():
    assert ir(spread(by="a", dir="x", debug=True))["debug"] is True
    assert ir(group(by="a", debug=True))["debug"] is True
    assert ir(table(by={"x": "a", "y": "b"}, debug=True))["debug"] is True
    assert ir(treemap(size="v", debug=True))["debug"] is True


def test_stack_operator_accepts_spread_parity_options():
    d = ir(stack(by="a", dir="x", spacing=2))
    assert d["spacing"] == 2


def test_pack_serializes_by():
    d = ir(pack(by="lake"))
    assert d["type"] == "pack"
    assert d["by"] == "lake"
    assert ir(pack())["type"] == "pack"
    # One packing strategy, so no option to choose one (#1013).
    with pytest.raises(TypeError):
        pack(by="lake", method={"kind": "circles"})


def test_partition_serializes_a_binned_key():
    d = ir(partition(by=field("date").bin(Calendar.month), dir="x"))
    assert d["type"] == "partition"
    assert d["dir"] == "x"
    assert d["by"] == {
        "type": "field",
        "name": "date",
        "ops": [{"op": "bin", "partition": {"kind": "month"}}],
    }


def test_partition_requires_a_key_with_a_region():
    for by in ["rating", field("rating")]:
        with pytest.raises(ValueError, match=r'field\("rating"\)\.bin\('):
            partition(by=by, dir="x")


def test_partition_key_per_axis_is_two_partitions():
    a = field("a").bin(Bin.step(1))
    b = field("b").bin(Bin.step(0.5))
    product = partition(by={"x": a, "y": b})
    assert [ir(op) for op in product.operators] == [
        ir(partition(by=a, dir="x")),
        ir(partition(by=b, dir="y")),
    ]


def test_partition_key_per_axis_checks():
    a = field("a").bin(Bin.step(1))
    with pytest.raises(ValueError, match="exactly the keys x and y"):
        partition(by={"x": a})
    with pytest.raises(ValueError, match="divides both axes"):
        partition(by={"x": a, "y": a}, dir="x")
    with pytest.raises(ValueError, match="divides both axes"):
        partition(by={"x": a, "y": a}, alignment="middle")
    with pytest.raises(ValueError, match=r'field\("b"\)\.bin\('):
        partition(by={"x": a, "y": field("b")})
    with pytest.raises(ValueError, match="`dir` names the axis"):
        partition(by=a)


def test_partition_serializes_a_binned_struct():
    key = struct(x="lon", y="lat").bin(Bin.hex(radius={"x": 2, "y": 500}))
    d = ir(partition(by=key))
    assert "dir" not in d
    assert d["by"] == {
        "type": "struct",
        "fields": {"x": "lon", "y": "lat"},
        "ops": [{"op": "bin", "partition": {"kind": "hex", "radius": {"x": 2, "y": 500}}}],
    }
    seeds = [{"lon": 1, "lat": 2}]
    v = struct(x="lon", y="lat").bin(Bin.voronoi(seeds=seeds))
    assert v["ops"][0]["partition"] == {"kind": "voronoi", "seeds": seeds}


def test_partition_struct_checks():
    with pytest.raises(ValueError, match="has none until it is binned"):
        partition(by=struct(x="a", y="b"))
    key = struct(x="a", y="b").bin(Bin.hex(radius=1))
    with pytest.raises(ValueError, match="divides both axes at once"):
        partition(by=key, dir="x")
    with pytest.raises(ValueError, match="already binned"):
        key.bin(Bin.hex(radius=1))
    with pytest.raises(TypeError, match="Bin family"):
        struct(x="a", y="b").bin({"size": 1})
    with pytest.raises(TypeError, match=r"field\(x\)\.bin\(Bin\.step"):
        struct(x="a", y="b").bin(Bin.step(1))


def test_bin_factories_check_their_params():
    assert Bin.hex(radius=0.5) == {"kind": "hex", "radius": 0.5}
    with pytest.raises(ValueError, match="must be > 0"):
        Bin.hex(radius=0)
    with pytest.raises(TypeError, match="missing the key 'y'"):
        Bin.hex(radius={"x": 1})
    with pytest.raises(TypeError, match="unexpected key 'z'"):
        Bin.hex(radius={"x": 1, "y": 1, "z": 1})
    with pytest.raises(ValueError, match=r"\['x'\] must be > 0"):
        Bin.hex(radius={"x": -1, "y": 1})


def test_voronoi_seeds_take_a_dataframe():
    import pandas as pd

    rows = Bin.voronoi(seeds=pd.DataFrame({"lon": [1.5, 2.0], "lat": [3.0, 4.0]}))
    assert rows["seeds"] == [{"lon": 1.5, "lat": 3.0}, {"lon": 2.0, "lat": 4.0}]


def test_region_takes_paint_only():
    d = ir(region(fill=field("a").count(), stroke="white", stroke_width=1))
    assert d["type"] == "region"
    assert d["strokeWidth"] == 1
    with pytest.raises(TypeError):
        region(w=10)


def test_rect_inset_is_a_kwarg():
    assert ir(rect(h="count", inset=1))["inset"] == 1


def test_scatter_serializes_separate_overlap():
    d = ir(scatter(x="mass", alignment="middle", overlap=Overlap.separate(padding=1)))
    assert d["type"] == "scatter"
    assert d["overlap"] == {"kind": "separate", "padding": 1}
    assert Overlap.separate() == {"kind": "separate"}
    assert "overlap" not in ir(scatter(x="mass"))


def test_scatter_serializes_noise_overlap():
    d = ir(scatter(
        x="mass", alignment="middle", overlap=Overlap.noise(randomness="quasi", smoothing=100)
    ))
    assert d["overlap"] == {"kind": "noise", "randomness": "quasi", "smoothing": 100}
    assert Overlap.noise() == {"kind": "noise"}
    assert Overlap.noise(padding=1, seed=3) == {"kind": "noise", "padding": 1, "seed": 3}
    # `overlap` is a tagged union: the `kind` picks the branch whose keys are
    # checked, as for any nested option dict.
    with pytest.raises(TypeError):
        scatter(x="mass", overlap={"kind": "swarm"})
    with pytest.raises(TypeError):
        scatter(x="mass", overlap={"kind": "separate", "randomness": "blue"})
    assert Overlap.noise(smoothing=0) == {"kind": "noise", "smoothing": 0}
    # A param's type and bounds (randomness "pink", smoothing -1, ...) are
    # checked at the factory call: see test_families.py.


def test_sina_and_jitter_are_noise_with_other_defaults():
    import math

    assert Overlap.sina() == {"kind": "noise", "smoothing": "silverman"}
    assert Overlap.noise(smoothing="silverman") == Overlap.sina()
    assert Overlap.jitter() == {"kind": "noise", "randomness": "uniform", "smoothing": math.inf}
    # Any option overrides the default.
    assert Overlap.sina(smoothing=50, padding=1) == {"kind": "noise", "smoothing": 50, "padding": 1}
    assert Overlap.jitter(randomness="blue")["randomness"] == "blue"
    d = ir(scatter(x="mass", alignment="middle", overlap=Overlap.sina()))
    assert d["overlap"] == {"kind": "noise", "smoothing": "silverman"}


def test_non_finite_numbers_are_tagged_in_the_ir():
    import json
    import math

    from gofish import chart, circle

    node = (
        chart([{"v": 1.0}, {"v": math.inf}])
        .flow(scatter(x="v", overlap=Overlap.jitter(smoothing=math.inf)))
        .mark(circle(r=3))
        .to_ir()["root"]
    )
    overlap = node["operators"][0]["overlap"]
    assert overlap["smoothing"] == {"$numberDouble": "Infinity"}
    # The document is strict JSON: no bare Infinity / NaN.
    json.dumps(node, allow_nan=False)
    from gofish._nonfinite import encode_non_finite

    assert encode_non_finite([-math.inf, math.nan, 2.0, "x"]) == [
        {"$numberDouble": "-Infinity"},
        {"$numberDouble": "NaN"},
        2.0,
        "x",
    ]
    # Nothing to encode: the same object back (and unchanged parts shared).
    finite = {"a": [1.0, {"b": "x"}], "c": 2}
    assert encode_non_finite(finite) is finite
    mixed = {"keep": [1.0], "inf": math.inf}
    out = encode_non_finite(mixed)
    assert out["keep"] is mixed["keep"] and out is not mixed


def test_pack_combinator_form():
    d = ir(pack([circle(r=10), pack([circle(r=4)])]))
    assert d["type"] == "pack"
    assert d["__combinator"] is True
    assert d["options"] == {}
    assert [c["type"] for c in d["children"]] == ["circle", "pack"]
    assert d["children"][1]["__combinator"] is True
    assert ir(pack([circle(r=1)]))["options"] == {}
    with pytest.raises(ValueError):
        pack([circle(r=1)], by="lake")


def test_treemap_serializes_tile_strategy_and_gaps():
    d = ir(treemap(by="g", tile=Tile.squarify(ratio=1), spacing=2, padding=3))
    assert d["tile"] == {"kind": "squarify", "ratio": 1}
    assert d["spacing"] == 2
    assert d["padding"] == 3
    assert Tile.squarify() == {"kind": "squarify"}
    assert [f()["kind"] for f in (Tile.slice, Tile.dice, Tile.binary, Tile.slice_dice)] == [
        "slice",
        "dice",
        "binary",
        "sliceDice",
    ]
    assert "tile" not in ir(treemap())


def test_treemap_tile_is_a_tagged_union():
    # `tile` is a union of dict shapes told apart by `kind`; `_to_wire` picks
    # the branch by the dict's `kind` and checks its keys against that branch.
    assert ir(treemap(by="g", tile=Tile.squarify(ratio=1)))["tile"] == {
        "kind": "squarify",
        "ratio": 1,
    }
    assert ir(treemap(by="g", tile=Tile.slice_dice()))["tile"] == {
        "kind": "sliceDice"
    }
    with pytest.raises(TypeError, match="ratio"):
        treemap(by="g", tile={"kind": "slice", "ratio": 2})
    with pytest.raises(TypeError, match="'nope'"):
        treemap(by="g", tile={"kind": "nope"})
    with pytest.raises(TypeError, match="missing"):
        treemap(by="g", tile={"ratio": 2})


def test_treemap_combinator_accepts_key():
    node = treemap([], size="gross", key="genre")
    d = ir(node)
    assert d["options"]["key"] == "genre"
    assert d["options"]["size"] == "gross"


def test_polygon_requires_points():
    with pytest.raises(TypeError):
        polygon(fill="red")
    d = ir(polygon(points=[[0, 0], [1, 1], [0, 1]]))
    assert d["points"] == [[0, 0], [1, 1], [0, 1]]


def test_circle_ellipse_petal_blank_signatures_are_closed():
    # These four used to take open **kwargs that reached the wire unchecked
    # (#1007). Now an undeclared or camelCase kwarg is a TypeError, as on
    # every other generated factory.
    with pytest.raises(TypeError):
        circle(r=3, rx=10)
    with pytest.raises(TypeError):
        circle(r=3, fillOpacity=0.6)
    with pytest.raises(TypeError):
        ellipse(w=4, h=4, stroke_dasharray="2 2")
    with pytest.raises(TypeError):
        petal(w=4, h=4, opacity=0.5)
    with pytest.raises(TypeError):
        blank(w=4, stroke="red")


def test_circle_takes_box_dims():
    # circle takes ellipse's box dimensions (#851): w or h sets the diameter,
    # and the positions and dims pass through.
    assert ir(circle(h="value", fill="red")) == {
        "type": "circle",
        "h": "value",
        "fill": "red",
    }
    assert ir(circle(w=8, cx=10, em_x=True)) == {
        "type": "circle",
        "w": 8,
        "cx": 10,
        "emX": True,
    }
    assert ir(circle(dims={"r": {"size": "v"}}))["dims"] == {
        "r": {"size": "v"}
    }


def test_fill_opacity_serializes_to_camel_case():
    assert ir(circle(r=3, fill_opacity=0.6)) == {
        "type": "circle",
        "r": 3,
        "fillOpacity": 0.6,
    }
    assert ir(ellipse(w=4, h=4, fill_opacity=0.5))["fillOpacity"] == 0.5


def test_callables_nested_in_options_bridge_at_any_depth():
    # A callable inside an option's dicts/lists (here `dims`) gets the same
    # bridge sentinel as a top-level channel, and the payload records its
    # callback under the same id (#937).
    m = rect(dims={"theta": {"size": 0.9}, "r": {"size": lambda d: d["v"] * 2}})
    d = ir(m)
    assert d["dims"]["theta"] == {"size": 0.9}
    lambda_id = d["dims"]["r"]["size"]["__gofish_lambda"]
    assert list(ir_payload(m)[1]) == [lambda_id]
    assert call(m, lambda_id, [{"v": 1}, {"v": 3}]) == [2, 6]
    json.dumps(d)  # no raw function object left on the wire

    op = scatter(dims={"theta": lambda d: d["a"], "r": "dist"})
    od = ir(op)
    assert od["dims"]["r"] == "dist"
    lambda_id = od["dims"]["theta"]["__gofish_lambda"]
    assert call(op, lambda_id, [{"a": 7}]) == [7]
    # Copies made by `.translate()` / `.label()` keep the same callback id.
    assert ir(op.translate(x=5))["dims"] == od["dims"]
    json.dumps(od)


def test_a_callable_outside_a_channel_is_a_type_error():
    # Only channel options become accessors the JS side resolves. A callable
    # anywhere else (a grouping key, a direction) has no meaning on the wire,
    # so it fails at construction rather than grouping one row per group.
    for make in (
        lambda: spread(by=lambda d: d["a"], dir="x"),
        lambda: stack(by=lambda d: d["a"], dir="y"),
        lambda: group(by=lambda d: d["a"]),
        lambda: treemap(by=lambda d: d["a"]),
        lambda: rect(h="v", rx=lambda d: 2),
    ):
        with pytest.raises(TypeError, match="only channel options take a function"):
            make()
    # Channel options still take one, including circle's raw opacity channel.
    assert "__gofish_lambda" in ir(rect(h=lambda d: d["v"]))["h"]
    assert "__gofish_lambda" in ir(circle(r=3, opacity=lambda d: 0.5))["opacity"]
    assert "__gofish_lambda" in ir(ellipse(w=4, h=4, stroke=lambda d: "red"))["stroke"]
    assert "__gofish_lambda" in ir(spread(by="a", dir="x", w=lambda d: 1))["w"]


def test_line_and_ribbon_fill_take_a_function():
    # A field name is shorthand for an accessor, so the connector paint takes
    # a lambda wherever it takes a field name (#1097). It crosses as a
    # sentinel whose callback the payload records.
    for m in (line(fill=lambda d: d["g"]), ribbon(fill=lambda d: d["g"])):
        lambda_id = ir(m)["fill"]["__gofish_lambda"]
        assert list(ir_payload(m)[1]) == [lambda_id]
        assert call(m, lambda_id, [{"g": "a"}]) == ["a"]
    # stroke is a color channel too, as in JS.
    assert "__gofish_lambda" in ir(line(stroke=lambda d: d["g"]))["stroke"]
    # A non-channel option still rejects a function.
    with pytest.raises(TypeError, match="only channel options take a function"):
        line(stroke_width=lambda d: 2)


def test_wire_does_not_copy_options_without_accessors():
    # A literal option with no callable inside reaches the IR as the same
    # object, so a large table is not copied on every to_dict().
    op = join([{"k": "a", "v": 1}, {"k": "b", "v": 2}], on="k")
    assert ir(op)["right"] is op.kwargs["right"]
    m = rect(dims={"theta": {"size": 0.9}})
    assert ir(m)["dims"] is m.kwargs["dims"]


def test_snake_case_kwargs_serialize_to_camel_case_wire_keys():
    # Python kwargs are snake_case; the IR keeps the camelCase wire keys.
    assert ir(text(text="hi", font_size=12, text_anchor="start")) == {
        "type": "text",
        "text": "hi",
        "fontSize": 12,
        "textAnchor": "start",
    }
    assert ir(stack([], dir="x", em_x=True, key="k"))["options"] == {
        "dir": "x",
        "emX": True,
        "key": "k",
    }
    assert ir(text(text="hi").label("n", font_size=9))["label"] == [
        {"accessor": "n", "fontSize": 9}
    ]


def test_camel_case_kwargs_are_rejected():
    with pytest.raises(TypeError):
        text(text="hi", fontSize=12)
    with pytest.raises(TypeError):
        stack([], dir="x", emX=True)


# --- Nested option dicts ------------------------------------------------------
# Keys inside a nested option dict follow the same snake_case rule as the
# top-level kwargs, by the declared type of the field (OPTION_TYPES in
# descriptors.ts). Dicts whose keys are data pass through untouched.


def test_nested_axes_keys_serialize_to_wire_keys():
    node = (
        chart(
            [{"a": "x", "v": 1}],
            axes={"x": {"label": {"angle": 45}, "side": "end"}, "y": True},
        )
        .flow(
            spread(
                by="a",
                dir="x",
                axes={"y": {"label": {"angle": [90]}, "title": False}},
            )
        )
        .mark(rect(h="v"))
        .to_ir()["root"]
    )
    assert node["options"]["axes"] == {
        "x": {"label": {"angle": 45}, "side": "end"},
        "y": True,
    }
    assert node["operators"][0]["axes"] == {"y": {"label": {"angle": [90]}, "title": False}}
    # The boolean forms pass through at both levels.
    assert chart([], axes=False).mark(rect()).to_ir()["root"]["options"]["axes"] is False
    assert ir(stack([], dir="x", axes={"x": False}))["options"]["axes"] == {
        "x": False
    }


def test_nested_unknown_key_is_rejected():
    # The flat label keys the nested `label` dict replaced are unknown keys,
    # and the error lists the keys an axis takes, `label` among them.
    with pytest.raises(TypeError, match="unexpected key 'label_angle'.*'label'"):
        chart([], axes={"x": {"label_angle": 45}})
    with pytest.raises(TypeError, match="unexpected key 'labelAlign'.*'label'"):
        chart([], axes={"x": {"labelAlign": "center"}})
    with pytest.raises(TypeError, match="unexpected key 'rotate'.*'angle'"):
        chart([], axes={"x": {"label": {"rotate": 45}}})
    with pytest.raises(TypeError, match="unexpected key 'z'"):
        spread(by="a", dir="x", axes={"z": True})
    with pytest.raises(TypeError, match="unexpected key 'colour'"):
        table(by={"x": "a", "y": "b", "colour": "c"})


def test_unknown_chart_option_is_rejected():
    with pytest.raises(TypeError):
        chart([], label_angle=45)


def test_data_keyed_dicts_are_untouched():
    # A palette keyed by category, a schema keyed by column, join rows, and
    # inline data rows keep their keys exactly, camelCase or not.
    colors = {"fooBar": "#f00", "baz_qux": "#00f"}
    node = (
        chart(
            [{"myCategory": "fooBar", "v": 1}],
            color=Color.palette(colors),
            schema={"myCategory": Schema.ordered(["fooBar", "baz_qux"])},
        )
        .flow(
            join([{"myCategory": "fooBar", "otherCol": 2}], on="myCategory"),
            spread(by="myCategory", dir="x"),
        )
        .mark(rect(h="v", fill="myCategory"))
        .to_ir()["root"]
    )
    assert node["options"]["color"]["values"] == colors
    assert list(node["options"]["schema"]) == ["myCategory"]
    assert node["operators"][0]["right"] == [{"myCategory": "fooBar", "otherCol": 2}]


def test_layer_of_charts_takes_js_layer_options():
    # The chart-tier `layer([...], **options)` takes JS `layer`'s option set,
    # like the mark form, so nested keys are snake_case in Python and camelCase
    # on the wire, and a render option such as `padding` is rejected.
    c1 = chart([{"v": 1}]).mark(rect(h="v"))
    c2 = chart([{"v": 2}]).mark(rect(h="v"))
    node = layer([c1, c2], axes={"x": {"label": {"angle": 45}}}).to_ir()["root"]
    assert node["options"] == {"axes": {"x": {"label": {"angle": 45}}}}
    with pytest.raises(TypeError, match="unexpected key 'label_angle'"):
        layer([c1, c2], axes={"x": {"label_angle": 45}})
    with pytest.raises(TypeError):
        layer([c1, c2], label_angle=45)
    with pytest.raises(TypeError):
        layer([c1, c2], padding=80)


def test_render_axes_convert_on_every_render_path():
    # `.render(axes=...)` on a chart, a mark, and a layer takes the same typed
    # conversion as `chart(axes=...)`: snake_case keys become wire keys, and
    # an unknown key raises TypeError.
    c = chart([{"v": 1}]).mark(rect(h="v"))
    for renderable in [c, rect(w=10, h=10), layer([c])]:
        widget = renderable.render(axes={"x": {"label": {"angle": 45}}, "y": False})
        assert widget.axes == {"x": {"label": {"angle": 45}}, "y": False}
        assert renderable.render(axes=True).axes is True
        assert renderable.render().axes is None
        with pytest.raises(TypeError, match="unexpected key 'label_angle'"):
            renderable.render(axes={"x": {"label_angle": 45}})


# --- Axis-name dims -----------------------------------------------------------
# A `dims` entry (AxisDimsValue) is a channel value or an interval. field(...)
# and datum(...) values are already in wire form and pass through; any other
# dict is an interval, whose keys are checked.


def test_dims_values_pass_channel_values_and_check_intervals():
    d = ir(rect(
        dims={
            "theta": {"size": datum(1), "embedded": True},
            "r": field("v").sort(),
            "lon": "a",
            "lat": {"min": "a", "max": datum(2) + 3},
        }
    ))
    assert d["dims"] == {
        "theta": {"size": {"type": "datum", "datum": 1}, "embedded": True},
        "r": {"type": "field", "name": "v", "ops": [{"op": "sort"}]},
        "lon": "a",
        "lat": {"min": "a", "max": {"type": "datum", "datum": 2, "offset": 3}},
    }
    assert ir(scatter(dims={"lon": field("x")}))["dims"] == {
        "lon": {"type": "field", "name": "x"}
    }


def test_dims_interval_with_unknown_key_is_rejected():
    with pytest.raises(TypeError, match="unexpected key 'width'"):
        rect(dims={"theta": {"width": 2}})
    with pytest.raises(TypeError, match="unexpected key 'start'"):
        scatter(dims={"lon": {"start": "a"}})


# --- Combinator box dims ------------------------------------------------------
# The spread/stack combinators take the full FancyDims box group, like JS
# `Spread`, which spreads `...fancyDims` into its box.


def test_spread_combinator_takes_box_dims():
    children = [rect(w=10, h=10), rect(w=10, h=20)]
    opts = ir(spread(children, dir="x", cx=200, em_x=True))["options"]
    assert opts["cx"] == 200
    assert opts["emX"] is True
    opts = ir(stack(children, dir="y", dims={"y": {"min": 0}}))["options"]
    assert opts["dims"] == {"y": {"min": 0}}
