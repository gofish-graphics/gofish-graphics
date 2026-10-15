"""GoTree, the tree grammar of ``gofish-gotree``, in Python (#792).

``gofish-gotree`` (``packages/gofish-gotree/src/``) implements the GoTree
grammar (Li et al., CHI 2020) as a library over public GoFish combinators:
``tree()`` walks the hierarchy, draws each node with the ``node`` function,
composes each level with the ``sibling`` and ``parent_child`` combiners, and
adds one ``line`` per edge as a ``.relate()`` clause. This module is the same
library over the Python GoFish API. ``tree()`` returns an ordinary layer
mark, so its IR is ordinary GoFish IR and renders through the same engine,
with no gotree construct on the wire and no Python callback crossing it: the
``node``, ``link`` and ``per_depth`` functions run here, while the tree is
built.

Each function mirrors its JS counterpart in ``helpers.ts``, ``recursion.ts``,
``links.ts`` and ``tree.tsx``, and the parity stories under
``tests/python-stories/go-tree/`` check that the two produce the same render.
A change to the JS grammar needs the same change here.

    from gofish.gotree import tree, combine, spread, distribute, nest, alternate
"""

from typing import Any, Callable, Dict, List, Optional, Union

from .. import curve as Curve
from ..ast import Constraint, Mark, layer, line, rect, ref
from ..ast import spread as _gofish_spread

__all__ = [
    "tree",
    "spread",
    "distribute",
    "combine",
    "nest",
    "alternate",
    "per_depth",
    "Combiner",
    "DepthCombiner",
]


# ---------------------------------------------------------------------------
# Combiners (helpers.ts)
# ---------------------------------------------------------------------------


class Combiner:
    """A function from a list of child marks to one composed mark. The
    ``parent_child`` slot receives ``[parent, child_group]``; ``sibling``
    receives the full list of children.

    ``growth_dir`` is the axis along which the combiner separates parent from
    child, or ``None`` when that is ambiguous. Links read it to bend along the
    tree's growth axis. Any callable ``(children) -> Mark`` can be used as a
    combiner; one without a ``growth_dir`` attribute has none.
    """

    def __init__(
        self,
        fn: Callable[[List[Any]], Mark],
        growth_dir: Optional[str] = None,
    ):
        self._fn = fn
        self.growth_dir = growth_dir

    def __call__(self, children: List[Any]) -> Mark:
        return self._fn(children)


class DepthCombiner:
    """A combiner chosen by the depth of the subtree being assembled. Build
    one with :func:`alternate` or :func:`per_depth`."""

    def __init__(self, at_depth: Callable[[int], Any]):
        self.at_depth = at_depth


CombinerSpec = Union[Combiner, DepthCombiner, Callable[[List[Any]], Mark]]


def per_depth(fn: Callable[[int], Any]) -> DepthCombiner:
    """A depth-indexed combiner: ``fn(depth)`` returns the combiner to use for
    the subtree at that depth. Mirrors JS ``perDepth``."""
    return DepthCombiner(fn)


def alternate(combiners: List[Any]) -> DepthCombiner:
    """Cycle through ``combiners`` by ``depth % len(combiners)``, e.g. to swap
    the spread axis every level (H-tree) or slice and dice every level
    (treemap). Mirrors JS ``alternate``."""
    combiners = list(combiners)
    if not combiners:
        raise ValueError("gotree.alternate() requires at least one combiner")
    return DepthCombiner(lambda depth: combiners[depth % len(combiners)])


def _given(**options: Any) -> Dict[str, Any]:
    return {k: v for k, v in options.items() if v is not None}


def _get(spec: Dict[str, Any], key: str, default: Any) -> Any:
    # JS `spec[key] ?? default`: a key set to None takes the default too.
    value = spec.get(key)
    return default if value is None else value


def spread(
    *,
    dir: str,
    spacing: Optional[float] = None,
    alignment: Optional[str] = None,
    anchor: Optional[str] = None,
) -> Combiner:
    """Lay the children out along ``dir`` with the GoFish ``spread``
    combinator. As a ``parent_child`` combiner the parent comes first: on the
    left for ``dir="x"``, at the top for ``dir="y"``.

    ``anchor`` is ``"edge"`` (the default; spacing between facing edges) or a
    fixed pitch between one anchor point on each child. Use ``"middle"``
    under a coordinate transform where nodes render as points. Mirrors JS
    ``spread``.
    """
    opts = _given(dir=dir, spacing=spacing, alignment=alignment, anchor=anchor)
    return Combiner(lambda children: _gofish_spread(children, **opts), dir)


def _named(children: List[Any], prefix: str) -> List[Mark]:
    # Each child is wrapped in a thin named layer, so the constraints can
    # refer to it by name (as the JS helpers do).
    return [layer([c]).name(f"{prefix}-{i}") for i, c in enumerate(children)]


def _refs(c: Dict[str, Any], prefix: str, n: int) -> List[Any]:
    return [c[f"{prefix}-{i}"] for i in range(n)]


def distribute(
    *,
    dir: str,
    spacing: Optional[float] = None,
    anchor: Optional[str] = None,
    order: Optional[str] = None,
    alignment: Optional[str] = None,
) -> Combiner:
    """Place the children along ``dir`` with ``spacing`` between them, by a
    ``Constraint.distribute``. Unlike :func:`spread`, it leaves the other axis
    alone, unless ``alignment`` is set, which adds a ``Constraint.align`` on
    that axis. ``order="reverse"`` puts the first child at the high end.
    Mirrors JS ``distribute``.
    """
    other = "y" if dir == "x" else "x"
    prefix = "__distribute"

    def combine_children(children: List[Any]) -> Mark:
        n = len(children)

        def clauses(**c: Any) -> List[Any]:
            cs: List[Any] = [
                Constraint.distribute(
                    _refs(c, prefix, n),
                    dir=dir,
                    spacing=spacing if spacing is not None else 0,
                    anchor=anchor if anchor is not None else "edge",
                    order=order if order is not None else "forward",
                )
            ]
            if alignment is not None:
                cs.append(Constraint.align(_refs(c, prefix, n), **{other: alignment}))
            return cs

        return layer(_named(children, prefix)).relate(clauses)

    return Combiner(combine_children, dir)


_AXIS_KINDS = ("align", "distribute", "nest")


def _axis(spec: Any, axis: str) -> Optional[Dict[str, Any]]:
    if spec is None:
        return None
    if isinstance(spec, str):
        spec = {"kind": spec}
    if not isinstance(spec, dict) or spec.get("kind") not in _AXIS_KINDS:
        raise ValueError(
            f"gotree.combine(): {axis}= must be one of {list(_AXIS_KINDS)} or a "
            f'dict with one of them as "kind", got {spec!r}'
        )
    return spec


def combine(
    *,
    x: Optional[Union[str, Dict[str, Any]]] = None,
    y: Optional[Union[str, Dict[str, Any]]] = None,
) -> Combiner:
    """The general per-axis combiner (GoTree's ``Layout(x, y)``): one
    constraint kind per axis, ``"align"``, ``"distribute"`` or ``"nest"``.

    Each axis is the kind's name, or a dict with ``kind`` and its options:
    ``{"kind": "align", "alignment": ...}``, ``{"kind": "distribute",
    "spacing": ..., "order": ..., "anchor": ...}`` or ``{"kind": "nest",
    "pad": ...}``. ``nest`` takes exactly two children, ``[outer, inner]``.
    Mirrors JS ``combine``.
    """
    axes = {"x": _axis(x, "x"), "y": _axis(y, "y")}
    prefix = "__combine"

    def combine_children(children: List[Any]) -> Mark:
        n = len(children)

        def clauses(**c: Any) -> List[Any]:
            cs: List[Any] = []
            for axis, spec in axes.items():
                if spec is None:
                    continue
                kind = spec["kind"]
                if kind == "align":
                    cs.append(
                        Constraint.align(
                            _refs(c, prefix, n),
                            **{axis: _get(spec, "alignment", "middle")},
                        )
                    )
                elif kind == "distribute":
                    cs.append(
                        Constraint.distribute(
                            _refs(c, prefix, n),
                            dir=axis,
                            spacing=_get(spec, "spacing", 0),
                            order=_get(spec, "order", "forward"),
                            anchor=_get(spec, "anchor", "edge"),
                        )
                    )
                else:
                    if n != 2:
                        raise ValueError(
                            f"gotree.combine(): nest on the {axis} axis requires "
                            f"exactly 2 children [outer, inner], got {n}"
                        )
                    cs.append(
                        Constraint.nest(
                            [c[f"{prefix}-0"], c[f"{prefix}-1"]],
                            **{axis: _get(spec, "pad", 0)},
                        )
                    )
            return cs

        return layer(_named(children, prefix)).relate(clauses)

    # The growth axis is the lone distribute axis; with both or neither it is
    # ambiguous, and links infer the bend from the geometry.
    distributed = [a for a, s in axes.items() if s is not None and s["kind"] == "distribute"]
    return Combiner(combine_children, distributed[0] if len(distributed) == 1 else None)


def nest(*, x: Optional[float] = None, y: Optional[float] = None) -> Combiner:
    """Nest ``[outer, inner]`` with ``Constraint.nest``: the outer node grows
    to the inner one plus ``x`` / ``y`` padding on each constrained axis, and
    the inner one is centered in it. Mirrors JS ``nest``."""
    opts = _given(x=x, y=y)

    def combine_children(children: List[Any]) -> Mark:
        if len(children) != 2:
            raise ValueError(
                "gotree.nest(): expected exactly 2 children [outer, inner], "
                f"got {len(children)}"
            )
        outer, inner = children
        return layer(
            [layer([outer]).name("__nest-outer"), layer([inner]).name("__nest-inner")]
        ).relate(
            lambda **c: [
                Constraint.nest([c["__nest-outer"], c["__nest-inner"]], **opts)
            ]
        )

    return Combiner(combine_children)


# ---------------------------------------------------------------------------
# The hierarchy (data.ts)
# ---------------------------------------------------------------------------


class _Node:
    """One node of the hierarchy, as d3-hierarchy builds it: the raw data,
    its depth from the root, its height above its deepest leaf, and its
    children (a node whose ``children`` is missing or empty is a leaf)."""

    def __init__(self, data: Any, depth: int, parent: Optional["_Node"], index: int):
        self.data = data
        self.depth = depth
        self.path = "root" if parent is None else f"{parent.path}/{index}"
        kids = data.get("children") if isinstance(data, dict) else None
        self.children = [
            _Node(child, depth + 1, self, i) for i, child in enumerate(kids or [])
        ]
        self.height = 1 + max((c.height for c in self.children), default=-1)
        self.leaves = sum((c.leaves for c in self.children), 0) or 1

    def datum(self) -> Dict[str, Any]:
        # What the node and link functions receive: JS `HierarchyDatum`.
        # `value` is d3's summed value, which gotree never computes.
        return {
            "data": self.data,
            "depth": self.depth,
            "height": self.height,
            "value": None,
            "width": self.leaves,
        }

    def breadth_first(self):
        queue = [self]
        while queue:
            node = queue.pop(0)
            yield node
            queue.extend(node.children)


# ---------------------------------------------------------------------------
# tree (recursion.ts, links.ts, tree.tsx)
# ---------------------------------------------------------------------------

# Parent above its children, siblings side by side; see recursion.ts.
_DEFAULT_PARENT_CHILD = distribute(dir="y", spacing=32, alignment="middle", order="forward")
_DEFAULT_SIBLING = distribute(dir="x", spacing=16, alignment="start")
_LINK_OPTIONS = ("curve", "stroke", "stroke_width", "opacity")


def _default_node(_d: Dict[str, Any]) -> Mark:
    return rect(w=12, h=12, fill="#4682b4")


def _resolve(c: CombinerSpec, depth: int) -> Any:
    return c.at_depth(depth) if isinstance(c, DepthCombiner) else c


def _render_subtree(node: _Node, spec: Dict[str, Any]) -> Mark:
    node_mark = spec["node"](node.datum()).name(node.path)
    if not node.children:
        return node_mark
    kids = [_render_subtree(c, spec) for c in node.children]
    # Both combiners are resolved at this node's depth, so a level's
    # parent_child and its children's sibling grouping alternate in sync.
    child_group = _resolve(spec["sibling"], node.depth)(kids)
    return _resolve(spec["parent_child"], node.depth)([node_mark, child_group])


def _link_options(link: Any, source: _Node, target: _Node) -> Optional[Dict[str, Any]]:
    if link == "none":
        return None
    if link is None:
        return {}
    opts = link(source.datum(), target.datum()) if callable(link) else link
    unknown = sorted(set(opts) - set(_LINK_OPTIONS))
    if unknown:
        raise ValueError(
            f"gotree.tree(): unknown link option(s) {unknown}; "
            f"expected {list(_LINK_OPTIONS)}"
        )
    return opts


def _link_mark(opts: Dict[str, Any], source: str, target: str, growth_dir: Optional[str]) -> Mark:
    curve = _get(opts, "curve", Curve.linear)
    # A tree with no single growth axis lets an orthogonal elbow pick its
    # bend from the endpoint geometry.
    if curve["kind"] == "orthogonal" and "bend" not in curve and growth_dir is None:
        curve = Curve.orthogonal(bend="auto")
    return line(
        [ref(source), ref(target)],
        curve=curve,
        dir=growth_dir,
        # Under a coordinate transform the line is resampled into an arc,
        # which a fill would close into a band.
        fill="none",
        stroke=_get(opts, "stroke", "gray"),
        stroke_width=_get(opts, "stroke_width", 1),
        opacity=opts.get("opacity"),
    ).z_order(-1)


def _edges(root: _Node, spec: Dict[str, Any]) -> List[Mark]:
    link = spec["link"]
    if link == "none":
        return []
    edges = []
    for node in root.breadth_first():
        # The growth axis of the parent_child combiner at the parent's depth.
        growth_dir = getattr(_resolve(spec["parent_child"], node.depth), "growth_dir", None)
        for child in node.children:
            opts = _link_options(link, node, child)
            if opts is not None:
                edges.append(_link_mark(opts, node.path, child.path, growth_dir))
    return edges


def tree(
    data: Dict[str, Any],
    *,
    node: Optional[Callable[[Dict[str, Any]], Mark]] = None,
    link: Any = None,
    parent_child: Optional[CombinerSpec] = None,
    sibling: Optional[CombinerSpec] = None,
    coord: Optional[Dict[str, Any]] = None,
) -> Mark:
    """A GoTree tree visualization of ``data``. Mirrors JS
    ``tree(spec, data)``, with the spec's fields as keyword arguments.

    Args:
        data: A nested tree dict, ``{"name": ..., "children": [...], ...}``.
        node: A function from a node to its mark. It receives
            ``{"data", "depth", "height", "value", "width"}``: the node's
            dict, its depth from the root, its height above its deepest leaf,
            ``None`` (d3's summed value, which gotree does not compute), and
            its number of leaves. Default: a 12 px blue square.
        link: ``"none"`` for no edges, a dict of ``curve`` (a ``Curve``
            member), ``stroke``, ``stroke_width`` and ``opacity``, or a
            function ``(source, target) -> dict`` over two nodes. Default:
            straight gray lines, 1 px wide.
        parent_child: The combiner for a parent and the group of its
            children, built with :func:`spread`, :func:`distribute`,
            :func:`nest`, :func:`combine`, :func:`alternate` or
            :func:`per_depth`. Default: the parent 32 px above its children,
            centered.
        sibling: The combiner for a group of siblings. Default: side by side,
            16 px apart, top-aligned.
        coord: A ``Coord`` member (``Coord.polar()``) to draw the whole tree
            in.

    Returns:
        A layer mark, which renders with ``.render(w=..., h=...)`` and can be
        a child of other marks.
    """
    if not isinstance(data, dict):
        raise TypeError(
            'gotree.tree(): data must be a nested tree dict ({"name": ..., '
            f'"children": [...]}}), got {type(data).__name__}'
        )
    if isinstance(link, str) and link != "none":
        raise ValueError(f'gotree.tree(): link= as a string must be "none", got {link!r}')
    spec = {
        "node": node if node is not None else _default_node,
        "link": link,
        "parent_child": parent_child if parent_child is not None else _DEFAULT_PARENT_CHILD,
        "sibling": sibling if sibling is not None else _DEFAULT_SIBLING,
    }
    root = _Node(data, 0, None, 0)
    node_tree = _render_subtree(root, spec)
    edges = _edges(root, spec)
    # The edges are relate clauses over the node tree's names, so each reads
    # the final positions of the two nodes it connects.
    composed = layer([node_tree]).relate(lambda: edges)
    if coord is not None:
        return layer([composed], coord=coord)
    return composed
