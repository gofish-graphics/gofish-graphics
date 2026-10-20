"""Tests for `gofish.gotree` (#792).

`tree()` expands a hierarchy into ordinary GoFish marks, so these tests read
the IR it produces: the node marks and their path names, the combiner layers
and their relate constraints, and the link lines. Whether that IR renders as
the JS `tree()` does is checked by the parity stories under
tests/python-stories/go-tree/.
"""

import time

import pytest

from gofish import Coord, Curve, circle, layer, rect
from gofish.ast import Mark
from gofish.gotree import (
    Combiner,
    alternate,
    combine,
    distribute,
    nest,
    per_depth,
    spread,
    tree,
)

DATA = {
    "name": "root",
    "children": [
        {"name": "A", "children": [{"name": "A1"}, {"name": "A2"}]},
        {"name": "B"},
    ],
}


def ir(mark):
    return mark.to_ir()["root"]


def find(node, pred):
    """Every IR dict under `node` (inclusive) for which `pred` holds."""
    out = []
    if isinstance(node, dict):
        if pred(node):
            out.append(node)
        for v in node.values():
            out.extend(find(v, pred))
    elif isinstance(node, list):
        for v in node:
            out.extend(find(v, pred))
    return out


def node_marks(mark):
    return find(ir(mark), lambda d: str(d.get("name", "")).startswith("root"))


def links(mark):
    return [c for c in ir(mark).get("relate", []) if c["type"] == "line"]


class TestTree:
    def test_returns_a_layer_mark(self):
        t = tree(DATA)
        assert isinstance(t, Mark)
        # A root holds the mark itself (#1181).
        assert ir(t)["type"] == "layer"
        assert ir(t)["__combinator"] is True

    def test_node_receives_the_hierarchy_datum(self):
        seen = []

        def node(d):
            seen.append(d)
            return circle(r=4)

        tree(DATA, node=node)
        by_name = {d["data"]["name"]: d for d in seen}
        assert [d["data"]["name"] for d in seen] == ["root", "A", "A1", "A2", "B"]
        assert by_name["root"]["depth"] == 0
        assert by_name["root"]["height"] == 2
        assert by_name["root"]["width"] == 3
        assert by_name["A"]["height"] == 1
        assert by_name["B"]["width"] == 1
        assert by_name["A1"]["value"] is None
        assert by_name["A"]["data"] is DATA["children"][0]

    def test_node_marks_are_named_by_path(self):
        names = [m["name"] for m in node_marks(tree(DATA, node=lambda d: circle(r=4)))]
        assert sorted(names) == ["root", "root/0", "root/0/0", "root/0/1", "root/1"]

    def test_default_node_is_a_blue_square(self):
        (root,) = [m for m in node_marks(tree(DATA)) if m["name"] == "root"]
        assert root == {"type": "rect", "w": 12, "h": 12, "fill": "#4682b4", "name": "root"}

    def test_empty_children_is_a_leaf(self):
        t = tree({"name": "root", "children": []})
        assert ir(t)["children"][0]["name"] == "root"

    def test_data_must_be_a_dict(self):
        with pytest.raises(TypeError, match="nested tree dict"):
            tree([1, 2, 3])

    def test_deep_chain_builds(self):
        # The combiners' relate callbacks build their references directly,
        # so building a deep tree is linear and needs no recursion.
        data = {"name": "leaf"}
        for i in range(1000):
            data = {"name": str(i), "children": [data]}
        start = time.perf_counter()
        t = tree(data)
        assert time.perf_counter() - start < 5
        assert isinstance(t, Mark)

    def test_coord_wraps_the_tree_in_a_layer(self):
        t = tree(DATA, coord=Coord.polar())
        assert ir(t)["options"] == {"coord": {"type": "polar"}}
        assert ir(t)["children"][0]["type"] == "layer"


class TestLinks:
    def test_one_line_per_edge_in_breadth_first_order(self):
        lines = links(tree(DATA))
        assert [[c["selection"] for c in l["children"]] for l in lines] == [
            ["root", "root/0"],
            ["root", "root/1"],
            ["root/0", "root/0/0"],
            ["root/0", "root/0/1"],
        ]

    def test_default_link_options(self):
        line = links(tree(DATA))[0]
        assert line["options"] == {
            "fill": "none",
            "stroke": "gray",
            "strokeWidth": 1,
            "curve": {"kind": "linear"},
            # The default parent_child distributes on y.
            "dir": "y",
        }
        assert line["zOrder"] == -1

    def test_link_dict(self):
        line = links(
            tree(DATA, link={"curve": Curve.bezier, "stroke": "#555", "stroke_width": 2, "opacity": 0.5})
        )[0]
        assert line["options"]["curve"] == {"kind": "bezier"}
        assert line["options"]["stroke"] == "#555"
        assert line["options"]["strokeWidth"] == 2
        assert line["options"]["opacity"] == 0.5

    def test_link_function_gets_source_and_target(self):
        pairs = []

        def link(s, t):
            pairs.append((s["data"]["name"], t["data"]["name"]))
            return {"stroke": "red" if t["depth"] == 2 else "blue"}

        lines = links(tree(DATA, link=link))
        assert pairs == [("root", "A"), ("root", "B"), ("A", "A1"), ("A", "A2")]
        assert [l["options"]["stroke"] for l in lines] == ["blue", "blue", "red", "red"]

    def test_link_none(self):
        assert links(tree(DATA, link="none")) == []

    def test_link_function_returning_none_skips_the_edge(self):
        # As in JS, where a link function returning null skips the edge.
        lines = links(tree(DATA, link=lambda s, t: None if t["depth"] == 2 else {}))
        assert [[c["selection"] for c in l["children"]] for l in lines] == [
            ["root", "root/0"],
            ["root", "root/1"],
        ]

    def test_link_bad_string(self):
        with pytest.raises(ValueError, match='"none"'):
            tree(DATA, link="straight")

    def test_link_unknown_option(self):
        with pytest.raises(ValueError, match="strokeWidth"):
            tree(DATA, link={"strokeWidth": 2})

    def test_orthogonal_bends_automatically_without_a_growth_axis(self):
        diagonal = combine(x="distribute", y="distribute")
        line = links(tree(DATA, link={"curve": Curve.orthogonal}, parent_child=diagonal))[0]
        assert line["options"]["curve"] == {"kind": "orthogonal", "bend": "auto"}
        assert "dir" not in line["options"]

    def test_orthogonal_keeps_the_growth_axis(self):
        line = links(tree(DATA, link={"curve": Curve.orthogonal}))[0]
        assert line["options"]["curve"] == {"kind": "orthogonal"}
        assert line["options"]["dir"] == "y"


class TestCombiners:
    def test_spread_uses_the_spread_combinator(self):
        out = ir(spread(dir="x", spacing=4)([circle(r=1), circle(r=2)]))
        assert out["type"] == "spread"
        assert out["options"] == {"dir": "x", "spacing": 4}
        assert spread(dir="y").growth_dir == "y"

    def test_distribute_names_children_and_relates_them(self):
        out = ir(distribute(dir="x", alignment="start")([circle(r=1), circle(r=2)]))
        assert [c["name"] for c in out["children"]] == ["__distribute-0", "__distribute-1"]
        assert out["relate"] == [
            {
                "type": "distribute",
                "options": {"dir": "x", "spacing": 0, "anchor": "edge", "order": "forward"},
                "refs": ["__distribute-0", "__distribute-1"],
            },
            {"type": "align", "options": {"y": "start"}, "refs": ["__distribute-0", "__distribute-1"]},
        ]

    def test_combine_axes(self):
        out = ir(combine(x={"kind": "nest", "pad": 3}, y="align")([circle(r=1), circle(r=2)]))
        assert out["relate"] == [
            {"type": "nest", "options": {"x": 3}, "refs": ["__combine-0", "__combine-1"]},
            {"type": "align", "options": {"y": "middle"}, "refs": ["__combine-0", "__combine-1"]},
        ]

    def test_combine_growth_dir_is_the_lone_distribute_axis(self):
        assert combine(x="align", y="distribute").growth_dir == "y"
        assert combine(x="distribute", y="distribute").growth_dir is None
        assert combine(x="nest", y="align").growth_dir is None

    def test_combine_nest_needs_two_children(self):
        with pytest.raises(ValueError, match="exactly 2 children"):
            combine(x="nest")([circle(r=1), circle(r=2), circle(r=3)])

    def test_combine_unknown_kind(self):
        with pytest.raises(ValueError, match="kind"):
            combine(x="stack")
        with pytest.raises(ValueError, match="kind"):
            combine(y={"kind": "stack"})

    def test_combine_unknown_axis_option(self):
        with pytest.raises(ValueError, match=r"\['spacng'\].*\['kind', 'spacing', 'order', 'anchor'\]"):
            combine(x={"kind": "distribute", "spacng": 40})
        with pytest.raises(ValueError, match="'spacing'"):
            combine(y={"kind": "align", "spacing": 4})

    def test_nest(self):
        out = ir(nest(x=4)([rect(), circle(r=2)]))
        assert [c["name"] for c in out["children"]] == ["__nest-outer", "__nest-inner"]
        assert out["relate"] == [
            {"type": "nest", "options": {"x": 4}, "refs": ["__nest-outer", "__nest-inner"]}
        ]
        with pytest.raises(ValueError, match="exactly 2 children"):
            nest(x=4)([rect()])

    def test_alternate_and_per_depth_pick_by_depth(self):
        a, b = spread(dir="x"), spread(dir="y")
        assert alternate([a, b]).at_depth(0) is a
        assert alternate([a, b]).at_depth(3) is b
        assert per_depth(lambda d: a if d < 1 else b).at_depth(2) is b
        with pytest.raises(ValueError):
            alternate([])

    def test_depth_combiners_in_a_tree(self):
        t = tree(DATA, sibling=alternate([spread(dir="x"), spread(dir="y")]))
        spreads = find(ir(t), lambda d: d.get("type") == "spread")
        # root's children group (depth 0) and A's (depth 1).
        assert sorted(s["options"]["dir"] for s in spreads) == ["x", "y"]

    def test_any_callable_is_a_combiner(self):
        t = tree(DATA, sibling=lambda children: layer(children))
        assert isinstance(t, Mark)
        assert isinstance(spread(dir="x"), Combiner)
