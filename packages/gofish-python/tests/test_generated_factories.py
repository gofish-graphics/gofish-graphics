"""Regression tests for the generated factory layer (gofish/_generated.py).

Each case pins a behavior from the descriptor-table codegen review: the
`debug` base kwarg on every leaf mark, the universal operator debug flag,
combinator-only fields on Treemap, required wire fields, and callable
accessors on undeclared channels.

Labeling a leaf mark is done exclusively via the `.label(accessor, options?)`
chain (there is no leaf-mark `label` kwarg — the legacy boolean/string
shorthand kwarg was removed).
"""

import pytest

from gofish import (
    Treemap,
    circle,
    group,
    polygon,
    spread,
    stack,
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
        .label("count", position="outset-top", fontSize=9)
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


def test_treemap_combinator_accepts_key():
    node = Treemap([], size="gross", key="genre")
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
