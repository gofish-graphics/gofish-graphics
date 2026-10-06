"""Regression tests for the generated factory layer (gofish/_generated.py).

Each case pins a behavior from the descriptor-table codegen review: the
`debug` base kwarg on every leaf mark, the universal operator debug flag,
combinator-only fields on the treemap combinator, required wire fields, and
callable accessors on undeclared channels.

Labeling a leaf mark is done exclusively via the `.label(accessor, options?)`
chain (there is no leaf-mark `label` kwarg — the legacy boolean/string
shorthand kwarg was removed).
"""

import pytest

from gofish import (
    binary,
    Schema,
    chart,
    circle,
    circles,
    dice,
    group,
    jitter,
    join,
    noise,
    layer,
    pack,
    palette,
    polygon,
    slice,
    slice_dice,
    rect,
    spread,
    scatter,
    squarify,
    stack,
    separate,
    sina,
    table,
    text,
    treemap,
)


def test_text_accepts_debug_kwarg():
    mark = text(text="hi", debug=True)
    d = mark.to_dict()
    assert d["debug"] is True


def test_text_has_no_label_kwarg():
    with pytest.raises(TypeError):
        text(text="hi", label="name")


def test_text_label_via_chain():
    mark = text(text="hi").label("name")
    d = mark.to_dict()
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
    d = mark.to_dict()
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
    assert spread(by="a", dir="x", debug=True).to_dict()["debug"] is True
    assert group(by="a", debug=True).to_dict()["debug"] is True
    assert table(by={"x": "a", "y": "b"}, debug=True).to_dict()["debug"] is True
    assert treemap(size="v", debug=True).to_dict()["debug"] is True


def test_stack_operator_accepts_spread_parity_options():
    d = stack(by="a", dir="x", spacing=2).to_dict()
    assert d["spacing"] == 2


def test_pack_serializes_by_and_method():
    d = pack(by="lake", method=circles()).to_dict()
    assert d["type"] == "pack"
    assert d["by"] == "lake"
    assert d["method"] == {"kind": "circles"}
    assert pack().to_dict()["type"] == "pack"
    assert "method" not in pack().to_dict()


def test_scatter_serializes_separate_overlap():
    d = scatter(x="mass", alignment="middle", overlap=separate(padding=1)).to_dict()
    assert d["type"] == "scatter"
    assert d["overlap"] == {"kind": "separate", "padding": 1}
    assert separate() == {"kind": "separate"}
    assert "overlap" not in scatter(x="mass").to_dict()
    with pytest.raises(ValueError):
        separate(padding=-1)


def test_scatter_serializes_noise_overlap():
    d = scatter(
        x="mass", alignment="middle", overlap=noise(randomness="quasi", smoothing=100)
    ).to_dict()
    assert d["overlap"] == {"kind": "noise", "randomness": "quasi", "smoothing": 100}
    assert noise() == {"kind": "noise"}
    assert noise(padding=1, seed=3) == {"kind": "noise", "padding": 1, "seed": 3}
    # `overlap` is a tagged union: the `kind` picks the branch whose keys are
    # checked, as for any nested option dict.
    with pytest.raises(TypeError):
        scatter(x="mass", overlap={"kind": "swarm"})
    with pytest.raises(TypeError):
        scatter(x="mass", overlap={"kind": "separate", "randomness": "blue"})
    with pytest.raises(ValueError):
        noise(randomness="pink")
    assert noise(smoothing=0) == {"kind": "noise", "smoothing": 0}
    with pytest.raises(ValueError):
        noise(smoothing=-1)
    with pytest.raises(ValueError):
        noise(smoothing=float("nan"))
    with pytest.raises(ValueError):
        noise(smoothing="scott")
    with pytest.raises(ValueError):
        noise(seed=float("inf"))
    with pytest.raises(ValueError):
        noise(seed="1")


def test_sina_and_jitter_are_noise_with_other_defaults():
    import math

    assert sina() == {"kind": "noise", "smoothing": "silverman"}
    assert noise(smoothing="silverman") == sina()
    assert jitter() == {"kind": "noise", "randomness": "uniform", "smoothing": math.inf}
    # Any option overrides the default.
    assert sina(smoothing=50, padding=1) == {"kind": "noise", "smoothing": 50, "padding": 1}
    assert jitter(randomness="blue")["randomness"] == "blue"
    with pytest.raises(ValueError, match="sina: randomness"):
        sina(randomness="pink")
    d = scatter(x="mass", alignment="middle", overlap=sina()).to_dict()
    assert d["overlap"] == {"kind": "noise", "smoothing": "silverman"}


def test_non_finite_numbers_are_tagged_in_the_ir():
    import json
    import math

    from gofish import chart, circle

    ir = (
        chart([{"v": 1.0}, {"v": math.inf}])
        .flow(scatter(x="v", overlap=jitter(smoothing=math.inf)))
        .mark(circle(r=3))
        .to_ir()
    )
    overlap = ir["operators"][0]["overlap"]
    assert overlap["smoothing"] == {"$numberDouble": "Infinity"}
    # The document is strict JSON: no bare Infinity / NaN.
    json.dumps(ir, allow_nan=False)
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
    d = pack([circle(r=10), pack([circle(r=4)])], method=circles()).to_dict()
    assert d["type"] == "pack"
    assert d["__combinator"] is True
    assert d["options"] == {"method": {"kind": "circles"}}
    assert [c["type"] for c in d["children"]] == ["circle", "pack"]
    assert d["children"][1]["__combinator"] is True
    assert pack([circle(r=1)]).to_dict()["options"] == {}
    with pytest.raises(ValueError):
        pack([circle(r=1)], by="lake")


def test_treemap_serializes_tile_strategy_and_gaps():
    d = treemap(by="g", tile=squarify(ratio=1), spacing=2, padding=3).to_dict()
    assert d["tile"] == {"kind": "squarify", "ratio": 1}
    assert d["spacing"] == 2
    assert d["padding"] == 3
    assert squarify() == {"kind": "squarify"}
    assert [f()["kind"] for f in (slice, dice, binary, slice_dice)] == [
        "slice",
        "dice",
        "binary",
        "sliceDice",
    ]
    assert "tile" not in treemap().to_dict()


def test_treemap_tile_is_a_tagged_union():
    # `tile` is a union of dict shapes told apart by `kind`; `_to_wire` picks
    # the branch by the dict's `kind` and checks its keys against that branch.
    assert treemap(by="g", tile=squarify(ratio=1)).to_dict()["tile"] == {
        "kind": "squarify",
        "ratio": 1,
    }
    assert treemap(by="g", tile=slice_dice()).to_dict()["tile"] == {
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
    d = node.to_dict()
    assert d["options"]["key"] == "genre"
    assert d["options"]["size"] == "gross"


def test_polygon_requires_points():
    with pytest.raises(TypeError):
        polygon(fill="red")
    d = polygon(points=[[0, 0], [1, 1], [0, 1]]).to_dict()
    assert d["points"] == [[0, 0], [1, 1], [0, 1]]


def test_open_kwargs_channels_wrap_callables():
    # circle's cx is undeclared (reaches the wire via **kwargs); a callable
    # there must bridge through the derive RPC sentinel like any declared
    # channel, not serialize as a raw function object.
    d = circle(r=3, cx=lambda row: row["x"]).to_dict()
    assert isinstance(d["cx"], dict)
    assert "__gofish_lambda" in d["cx"]


def test_snake_case_kwargs_serialize_to_camel_case_wire_keys():
    # Python kwargs are snake_case; the IR keeps the camelCase wire keys.
    assert text(text="hi", font_size=12, text_anchor="start").to_dict() == {
        "type": "text",
        "text": "hi",
        "fontSize": 12,
        "textAnchor": "start",
    }
    assert spread(by="a", dir="x", shared_scale=True).to_dict()["sharedScale"] is True
    assert stack([], dir="x", shared_scale=True, key="k").to_dict()["options"] == {
        "dir": "x",
        "sharedScale": True,
        "key": "k",
    }
    assert text(text="hi").label("n", font_size=9).to_dict()["label"] == [
        {"accessor": "n", "fontSize": 9}
    ]


def test_camel_case_kwargs_are_rejected():
    with pytest.raises(TypeError):
        text(text="hi", fontSize=12)
    with pytest.raises(TypeError):
        spread(by="a", dir="x", sharedScale=True)


# --- Nested option dicts ------------------------------------------------------
# Keys inside a nested option dict follow the same snake_case rule as the
# top-level kwargs, by the declared type of the field (OPTION_TYPES in
# descriptors.ts). Dicts whose keys are data pass through untouched.


def test_nested_axes_keys_serialize_to_camel_case_wire_keys():
    ir = (
        chart(
            [{"a": "x", "v": 1}],
            axes={"x": {"label_angle": 45, "side": "end"}, "y": True},
        )
        .flow(
            spread(
                by="a",
                dir="x",
                axes={"y": {"label_angle": [90], "title": False}},
            )
        )
        .mark(rect(h="v"))
        .to_ir()
    )
    assert ir["options"]["axes"] == {
        "x": {"labelAngle": 45, "side": "end"},
        "y": True,
    }
    assert ir["operators"][0]["axes"] == {"y": {"labelAngle": [90], "title": False}}
    # The boolean forms pass through at both levels.
    assert chart([], axes=False).mark(rect()).to_ir()["options"]["axes"] is False
    assert stack([], dir="x", axes={"x": False}).to_dict()["options"]["axes"] == {
        "x": False
    }


def test_nested_camel_case_key_is_rejected():
    with pytest.raises(TypeError, match="did you mean 'label_angle'"):
        chart([], axes={"x": {"labelAngle": 45}})
    with pytest.raises(TypeError, match="unexpected key 'z'"):
        spread(by="a", dir="x", axes={"z": True})
    with pytest.raises(TypeError, match="unexpected key 'colour'"):
        table(by={"x": "a", "y": "b", "colour": "c"})


def test_unknown_chart_option_is_rejected():
    with pytest.raises(TypeError):
        chart([], labelAngle=45)


def test_data_keyed_dicts_are_untouched():
    # A palette keyed by category, a schema keyed by column, join rows, and
    # inline data rows keep their keys exactly, camelCase or not.
    colors = {"fooBar": "#f00", "baz_qux": "#00f"}
    ir = (
        chart(
            [{"myCategory": "fooBar", "v": 1}],
            color=palette(colors),
            schema={"myCategory": Schema.ordered(["fooBar", "baz_qux"])},
        )
        .flow(
            join([{"myCategory": "fooBar", "otherCol": 2}], on="myCategory"),
            spread(by="myCategory", dir="x"),
        )
        .mark(rect(h="v", fill="myCategory"))
        .to_ir()
    )
    assert ir["options"]["color"]["values"] == colors
    assert list(ir["options"]["schema"]) == ["myCategory"]
    assert ir["operators"][0]["right"] == [{"myCategory": "fooBar", "otherCol": 2}]


def test_layer_of_charts_takes_js_layer_options():
    # The chart-tier `layer([...], **options)` takes JS `layer`'s option set,
    # like the mark form, so nested keys are snake_case in Python and camelCase
    # on the wire, and a render option such as `padding` is rejected.
    c1 = chart([{"v": 1}]).mark(rect(h="v"))
    c2 = chart([{"v": 2}]).mark(rect(h="v"))
    ir = layer([c1, c2], axes={"x": {"label_angle": 45}}).to_ir()
    assert ir["options"] == {"axes": {"x": {"labelAngle": 45}}}
    with pytest.raises(TypeError, match="did you mean 'label_angle'"):
        layer([c1, c2], axes={"x": {"labelAngle": 45}})
    with pytest.raises(TypeError):
        layer([c1, c2], labelAngle=45)
    with pytest.raises(TypeError):
        layer([c1, c2], padding=80)


# --- Combinator box dims ------------------------------------------------------
# The spread/stack combinators take the full FancyDims box group, like JS
# `Spread`, which spreads `...fancyDims` into its box.


def test_spread_combinator_takes_box_dims():
    children = [rect(w=10, h=10), rect(w=10, h=20)]
    opts = spread(children, dir="x", cx=200, em_x=True).to_dict()["options"]
    assert opts["cx"] == 200
    assert opts["emX"] is True
    opts = stack(children, dir="y", dims={"y": {"min": 0}}).to_dict()["options"]
    assert opts["dims"] == {"y": {"min": 0}}
