"""Function values and per-group expressions (stack profiles S9, S10)."""

import pytest

from gofish import Trait, Unit, chart, field, fun, rect, spread

from ._ir import call, ir


def test_fun_raises_until_the_bridge_can_read_it():
    with pytest.raises(NotImplementedError, match="synchronous"):
        fun(lambda t: t, domain=(0, 1))


def _h(node):
    """The ``h`` channel of the chart's mark, as the wire writes it."""
    return ir(node)["mark"]["h"]


def _bars(h):
    return chart([]).flow(spread(by="k", dir="x")).mark(rect(w=10, h=h))


@pytest.mark.parametrize("name", ["sum", "mean", "median", "count", "distinct"])
def test_named_methods_cross_as_data(name):
    # A named method runs in JS, so its wire is the op alone, with no
    # callback to call back.
    h = _h(_bars(getattr(field("v"), name)()))
    assert h == {"type": "field", "name": "v", "ops": [{"op": name}]}


def test_reduce_crosses_as_a_bridge_handle_and_its_members_as_ops():
    s = field("v").reduce(lambda xs: {"lo": min(xs), "hi": max(xs)}, unit="g")
    h = _h(_bars(s.lo()))
    fn = h["ops"][0].pop("fn")
    assert set(fn) == {"__gofish_lambda"}
    assert h == {
        "type": "field",
        "name": "v",
        "ops": [{"op": "reduce", "unit": "g"}, {"op": "member", "name": "lo"}],
    }


def test_a_member_named_like_a_method_is_a_member():
    # A record's "median" is its member, not FieldAccessor.median.
    s = field("v").reduce(lambda xs: {"median": 1})
    h = _h(_bars(s.median()))
    assert h["ops"][1] == {"op": "member", "name": "median"}


def test_member_args_cross():
    s = field("v").reduce(lambda xs: {"at": 1})
    assert _h(_bars(s.at(2)))["ops"][1] == {"op": "member", "name": "at", "args": [2]}


def test_reduce_is_called_once_with_every_group():
    node = _bars(field("v").reduce(lambda xs: {"lo": min(xs), "n": len(xs)}).lo())
    lid = _h(node)["ops"][0]["fn"]["__gofish_lambda"]
    assert call(node, lid, [[3, 1, 2], [5]]) == [{"lo": 1, "n": 3}, {"lo": 5, "n": 1}]


def test_map_takes_as_many_arguments_as_it_names():
    one = _bars(field("v").map(lambda x: x * 2).sum())
    lid = _h(one)["ops"][0]["fn"]["__gofish_lambda"]
    assert call(one, lid, [[1, 2], [3]]) == [[2, 4], [6]]
    three = _bars(field("v").map(lambda x, i, xs: x / sum(xs)).sum())
    lid = _h(three)["ops"][0]["fn"]["__gofish_lambda"]
    assert call(three, lid, [[1, 3]]) == [[0.25, 0.75]]


def test_a_python_reduce_that_returns_a_function_raises():
    node = _bars(field("v").reduce(lambda xs: (lambda t: t)))
    lid = _h(node)["ops"][0]["fn"]["__gofish_lambda"]
    with pytest.raises(TypeError, match="synchronous"):
        call(node, lid, [[1]])


def test_a_python_reduce_that_returns_a_list_raises():
    node = _bars(field("v").reduce(lambda xs: list(xs)))
    lid = _h(node)["ops"][0]["fn"]["__gofish_lambda"]
    with pytest.raises(TypeError, match="returned a list"):
        call(node, lid, [[1]])


def test_unit_mirrors_the_result():
    usd = Unit("USD", traits=[Trait.summable()])
    s = field("v").reduce(lambda xs: {"lo": 1}, unit={"lo": usd, "hi": "g"})
    op = _h(_bars(s.lo()))["ops"][0]
    assert op["unit"] == {
        "lo": {"HasUnit": {"unit": "USD", "symbol": "USD", "traits": {"CanSum": {}}}},
        "hi": "g",
    }
    with pytest.raises(TypeError, match="unit must be"):
        field("v").reduce(lambda xs: 1, unit=3)
