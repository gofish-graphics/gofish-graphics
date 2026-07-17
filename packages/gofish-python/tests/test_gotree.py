"""Tests for the `gofish.gotree` bridge (issue #792).

Covers wire-shape parity with the pinned `gotree-tree` IR contract:
`{type, data, node, link?, parentChild?, sibling?, coord?}`. `gotree` is
deliberately NOT re-exported from top-level `gofish` (same category as
`derive`/`field`/`ref`), so every import here goes through
`gofish.gotree` / `from gofish.gotree import ...`.
"""

import pytest

from gofish import circle, rect
from gofish.ast import _MarkFn, _PendingAccessor
from gofish.gotree import alternate, combine, distribute, nest, spread, tree

TREE_DATA = {
    "name": "root",
    "children": [{"name": "A"}, {"name": "B"}],
}


class TestPureSpec:
    """A pure (no-callable) spec serializes to exactly the pinned wire shape."""

    def test_full_spec_golden_dict(self):
        t = tree(
            TREE_DATA,
            node=circle(r=7, fill="#08306b"),
            link={"curve": "orthogonal", "stroke": "#90a4ae", "stroke_width": 1.5},
            parent_child=combine(
                x={"kind": "distribute", "spacing": 18},
                y={"kind": "distribute", "spacing": 18},
            ),
            sibling=combine(
                x={"kind": "distribute", "spacing": 18},
                y={"kind": "distribute", "spacing": 18},
            ),
        )
        assert t.to_dict() == {
            "type": "gotree-tree",
            "data": TREE_DATA,
            "node": {"type": "circle", "r": 7, "fill": "#08306b"},
            "link": {
                "curve": "orthogonal",
                "stroke": "#90a4ae",
                "strokeWidth": 1.5,
            },
            "parentChild": {
                "kind": "combine",
                "options": {
                    "x": {"kind": "distribute", "spacing": 18},
                    "y": {"kind": "distribute", "spacing": 18},
                },
            },
            "sibling": {
                "kind": "combine",
                "options": {
                    "x": {"kind": "distribute", "spacing": 18},
                    "y": {"kind": "distribute", "spacing": 18},
                },
            },
        }

    def test_to_ir_wraps_in_raw_mark_envelope(self):
        t = tree(TREE_DATA, node=rect(w=12, h=12))
        assert t.to_ir() == {"type": "raw-mark", "mark": t.to_dict()}


class TestOmittedOptionals:
    """Optional keys are absent entirely when unset, not null."""

    def test_minimal_tree_omits_optionals(self):
        t = tree(TREE_DATA)
        d = t.to_dict()
        assert d["type"] == "gotree-tree"
        assert d["data"] == TREE_DATA
        # Default node mirrors JS's DEFAULT_NODE.
        assert d["node"] == {"type": "rect", "w": 12, "h": 12, "fill": "#4682b4"}
        for key in ("link", "parentChild", "sibling", "coord"):
            assert key not in d

    def test_explicit_node_only(self):
        t = tree(TREE_DATA, node=circle(r=4))
        d = t.to_dict()
        assert d["node"] == {"type": "circle", "r": 4}
        assert "link" not in d

    def test_link_none_is_emitted_as_string(self):
        t = tree(TREE_DATA, link="none")
        assert t.to_dict()["link"] == "none"


class TestNodeCallable:
    """node=callable emits a mark-fn sentinel with a registered lambda."""

    def test_node_callable_emits_mark_fn(self):
        def node_factory(row):
            return circle(r=7)

        t = tree(TREE_DATA, node=node_factory)
        assert isinstance(t._node, _MarkFn)
        assert t._node.fn is node_factory
        d = t.to_dict()
        assert d["node"]["type"] == "mark-fn"
        assert d["node"]["lambdaId"] == t._node.lambda_id

    def test_node_callable_lambda_id_stable_across_calls(self):
        t = tree(TREE_DATA, node=lambda row: circle(r=1))
        assert t.to_dict()["node"]["lambdaId"] == t.to_dict()["node"]["lambdaId"]


class TestChannelCallableInsideNode:
    """A channel-level callable inside a static node mark template already
    works via the existing `_PendingAccessor` machinery (`_channel` in
    ast.py) — verified here in the gotree context.
    """

    def test_channel_callable_emits_lambda_sentinel(self):
        node_mark = circle(r=7, fill=lambda d: "#ff0000")
        t = tree(TREE_DATA, node=node_mark)
        d = t.to_dict()
        assert isinstance(d["node"]["fill"], dict)
        assert "__gofish_lambda" in d["node"]["fill"]


class TestLinkCallable:
    """link=callable emits a lambda sentinel."""

    def test_link_callable_emits_sentinel(self):
        def link_fn(source, target):
            return {"stroke": "red"}

        t = tree(TREE_DATA, link=link_fn)
        assert isinstance(t._link, _PendingAccessor)
        d = t.to_dict()
        assert d["link"] == {"__gofish_lambda": t._link.lambda_id}

    def test_link_dict_maps_stroke_width(self):
        t = tree(TREE_DATA, link={"stroke_width": 2})
        assert t.to_dict()["link"] == {"strokeWidth": 2}

    def test_link_dict_unknown_key_raises(self):
        with pytest.raises(ValueError, match="unknown link option"):
            tree(TREE_DATA, link={"bogus": 1})

    def test_link_bad_string_raises(self):
        with pytest.raises(ValueError, match='must be "none"'):
            tree(TREE_DATA, link="dotted")


class TestAlternate:
    """alternate() nests its combiners correctly."""

    def test_alternate_nests_combiners(self):
        c = alternate([spread(dir="x", spacing=10), spread(dir="y", spacing=20)])
        assert c == {
            "kind": "alternate",
            "combiners": [
                {"kind": "spread", "options": {"dir": "x", "spacing": 10}},
                {"kind": "spread", "options": {"dir": "y", "spacing": 20}},
            ],
        }

    def test_alternate_as_parent_child(self):
        t = tree(
            TREE_DATA,
            parent_child=alternate(
                [distribute(dir="y", spacing=10), distribute(dir="x", spacing=10)]
            ),
        )
        assert t.to_dict()["parentChild"]["kind"] == "alternate"
        assert len(t.to_dict()["parentChild"]["combiners"]) == 2

    def test_alternate_empty_raises(self):
        with pytest.raises(ValueError, match="at least one combiner"):
            alternate([])

    def test_alternate_rejects_non_combiner_entries(self):
        with pytest.raises(ValueError, match="must be a combiner"):
            alternate([{"not": "a combiner"}])


class TestCombinerBuilders:
    def test_spread_requires_dir(self):
        with pytest.raises(TypeError):
            spread()

    def test_distribute_shape(self):
        assert distribute(dir="x", spacing=8, order="reverse") == {
            "kind": "distribute",
            "options": {"dir": "x", "spacing": 8, "order": "reverse"},
        }

    def test_nest_requires_an_axis(self):
        with pytest.raises(ValueError, match="at least one of x, y"):
            nest()

    def test_nest_shape(self):
        assert nest(x=10, y=10) == {"kind": "nest", "options": {"x": 10, "y": 10}}

    def test_combine_requires_an_axis(self):
        with pytest.raises(ValueError, match="at least one of x, y"):
            combine()

    def test_combine_string_shorthand(self):
        assert combine(x="nest", y="align") == {
            "kind": "combine",
            "options": {"x": {"kind": "nest"}, "y": {"kind": "align"}},
        }

    def test_combine_unknown_kind_raises(self):
        with pytest.raises(ValueError, match="unknown x axis kind"):
            combine(x="bogus")

    def test_combine_dict_unknown_kind_raises(self):
        with pytest.raises(ValueError, match="unknown y axis kind"):
            combine(y={"kind": "bogus"})


class TestTreeValidation:
    def test_data_must_be_dict(self):
        with pytest.raises(TypeError, match="data must be a nested tree dict"):
            tree([1, 2, 3])

    def test_parent_child_must_be_a_combiner(self):
        with pytest.raises(ValueError, match="parent_child="):
            tree(TREE_DATA, parent_child={"not": "a combiner"})

    def test_sibling_must_be_a_combiner(self):
        with pytest.raises(ValueError, match="sibling="):
            tree(TREE_DATA, sibling="bogus")

    def test_node_wrong_type_raises(self):
        with pytest.raises(TypeError, match="node="):
            tree(TREE_DATA, node=42)

    def test_coord_passthrough(self):
        from gofish import polar

        t = tree(TREE_DATA, coord=polar())
        assert t.to_dict()["coord"] == polar()
