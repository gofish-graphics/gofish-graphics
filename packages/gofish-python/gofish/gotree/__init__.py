"""GoTree, the tree grammar of ``gofish-gotree`` (Li et al., CHI 2020), in Python (#792).

``tree()`` builds an ordinary GoFish layer mark, so no gotree construct and no
Python callback cross the wire. Each function mirrors its JS counterpart in
``packages/gofish-gotree/src/``; the parity stories under
``tests/python-stories/go-tree/`` check that the two render the same.

This module is a declared shortcut: it re-implements the JS grammar instead of
sharing it. TODO(#1163): extension packages should each cross to Python from
one definition, without a second implementation.
"""

from collections import deque
from typing import Any, Callable, Dict, Iterator, List, Optional, Union

from .. import curve as Curve
from ..ast import Constraint, Mark, RefSentinel, layer, line, rect, ref
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


def _or(value: Any, default: Any) -> Any:
    # JS `value ?? default`.
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
    return Combiner(
        lambda children: _gofish_spread(
            children, dir=dir, spacing=spacing, alignment=alignment, anchor=anchor
        ),
        dir,
    )


def _named(children: List[Any], prefix: str) -> List[Mark]:
    # Each child is wrapped in a thin named layer, so the constraints can
    # refer to it by name (as the JS helpers do).
    return [layer([c]).name(f"{prefix}-{i}") for i, c in enumerate(children)]


def _refs(
    operand: Callable[[str], RefSentinel], prefix: str, n: int
) -> List[RefSentinel]:
    # The operands of these names, asked for by name (`_relate_env`). A `**c`
    # catch-all would make `.relate()` collect every name in the subtree at
    # every level, which is quadratic in the tree's depth.
    return [operand(f"{prefix}-{i}") for i in range(n)]


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

        def clauses(operand: Callable[[str], RefSentinel]) -> List[Any]:
            cs: List[Any] = [
                Constraint.distribute(
                    _refs(operand, prefix, n),
                    dir=dir,
                    spacing=_or(spacing, 0),
                    anchor=_or(anchor, "edge"),
                    order=_or(order, "forward"),
                )
            ]
            if alignment is not None:
                cs.append(Constraint.align(_refs(operand, prefix, n), **{other: alignment}))
            return cs

        return layer(_named(children, prefix))._relate_env(clauses)

    return Combiner(combine_children, dir)


# Each axis kind and the options its dict takes besides "kind".
_AXIS_OPTIONS = {
    "align": ("alignment",),
    "distribute": ("spacing", "order", "anchor"),
    "nest": ("pad",),
}


def _axis(spec: Any, axis: str) -> Optional[Dict[str, Any]]:
    if spec is None:
        return None
    if isinstance(spec, str):
        spec = {"kind": spec}
    if not isinstance(spec, dict) or spec.get("kind") not in _AXIS_OPTIONS:
        raise ValueError(
            f"gotree.combine(): {axis}= must be one of {list(_AXIS_OPTIONS)} or a "
            f'dict with one of them as "kind", got {spec!r}'
        )
    allowed = ("kind",) + _AXIS_OPTIONS[spec["kind"]]
    unknown = sorted(set(spec) - set(allowed))
    if unknown:
        raise ValueError(
            f"gotree.combine(): unknown option(s) {unknown} for {axis}= "
            f'{{"kind": "{spec["kind"]}"}}; expected {list(allowed)}'
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

        def clauses(operand: Callable[[str], RefSentinel]) -> List[Any]:
            cs: List[Any] = []
            for axis, spec in axes.items():
                if spec is None:
                    continue
                kind = spec["kind"]
                if kind == "align":
                    cs.append(
                        Constraint.align(
                            _refs(operand, prefix, n),
                            **{axis: _or(spec.get("alignment"), "middle")},
                        )
                    )
                elif kind == "distribute":
                    cs.append(
                        Constraint.distribute(
                            _refs(operand, prefix, n),
                            dir=axis,
                            spacing=_or(spec.get("spacing"), 0),
                            order=_or(spec.get("order"), "forward"),
                            anchor=_or(spec.get("anchor"), "edge"),
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
                            _refs(operand, prefix, 2),
                            **{axis: _or(spec.get("pad"), 0)},
                        )
                    )
            return cs

        return layer(_named(children, prefix))._relate_env(clauses)

    # The growth axis is the lone distribute axis; with both or neither it is
    # ambiguous, and links infer the bend from the geometry.
    distributed = [a for a, s in axes.items() if s is not None and s["kind"] == "distribute"]
    return Combiner(combine_children, distributed[0] if len(distributed) == 1 else None)


def nest(*, x: Optional[float] = None, y: Optional[float] = None) -> Combiner:
    """Nest ``[outer, inner]`` with ``Constraint.nest``: the outer node grows
    to the inner one plus ``x`` / ``y`` padding on each constrained axis, and
    the inner one is centered in it. Mirrors JS ``nest``."""
    def combine_children(children: List[Any]) -> Mark:
        if len(children) != 2:
            raise ValueError(
                "gotree.nest(): expected exactly 2 children [outer, inner], "
                f"got {len(children)}"
            )
        outer, inner = children
        return layer(
            [layer([outer]).name("__nest-outer"), layer([inner]).name("__nest-inner")]
        )._relate_env(
            lambda operand: [
                Constraint.nest(
                    [operand("__nest-outer"), operand("__nest-inner")], x=x, y=y
                )
            ]
        )

    return Combiner(combine_children)


# ---------------------------------------------------------------------------
# The hierarchy (data.ts)
# ---------------------------------------------------------------------------


class _Node:
    """One node of the hierarchy, as d3-hierarchy builds it: its depth from
    the root, its height above its deepest leaf, and its children (a node
    whose ``children`` is missing or empty is a leaf). ``datum`` is what the
    node and link functions receive (JS ``HierarchyDatum``), and ``name``
    names the node's mark by its path from the root (``root/0/1``), as JS
    ``nodePath`` does, so the edges, and users, can refer to it."""

    def __init__(self, data: Any, depth: int, name: str):
        self.data = data
        self.depth = depth
        self.name = name
        self.children: List["_Node"] = []
        self.datum: Dict[str, Any] = {}

    def pre_order(self) -> List["_Node"]:
        # Iterative, so a deep tree does not reach Python's recursion limit.
        out, stack = [], [self]
        while stack:
            node = stack.pop()
            out.append(node)
            stack.extend(reversed(node.children))
        return out

    def breadth_first(self) -> Iterator["_Node"]:
        queue = deque([self])
        while queue:
            node = queue.popleft()
            yield node
            queue.extend(node.children)


def _hierarchy(data: Any) -> _Node:
    root = _Node(data, 0, "root")
    stack = [root]
    while stack:
        node = stack.pop()
        kids = node.data.get("children") if isinstance(node.data, dict) else None
        node.children = [
            _Node(child, node.depth + 1, f"{node.name}/{i}")
            for i, child in enumerate(kids or [])
        ]
        stack.extend(node.children)
    # Children before parents, so each node sums over finished children.
    for node in reversed(root.pre_order()):
        # `value` is d3's summed value, which gotree never computes.
        node.datum = {
            "data": node.data,
            "depth": node.depth,
            "height": 1 + max((c.datum["height"] for c in node.children), default=-1),
            "value": None,
            "width": sum((c.datum["width"] for c in node.children), 0) or 1,
        }
    return root


# ---------------------------------------------------------------------------
# tree (recursion.ts, links.ts, tree.tsx)
# ---------------------------------------------------------------------------

# Parent above its children, siblings side by side; see recursion.ts.
_DEFAULT_PARENT_CHILD = distribute(dir="y", spacing=32, alignment="middle")
_DEFAULT_SIBLING = distribute(dir="x", spacing=16, alignment="start")
_LINK_OPTIONS = ("curve", "stroke", "stroke_width", "opacity")


def _default_node(_d: Dict[str, Any]) -> Mark:
    return rect(w=12, h=12, fill="#4682b4")


def _resolve(c: CombinerSpec, depth: int) -> Any:
    return c.at_depth(depth) if isinstance(c, DepthCombiner) else c


def _render_tree(
    root: _Node,
    node_fn: Callable[[Dict[str, Any]], Mark],
    parent_child: CombinerSpec,
    sibling: CombinerSpec,
) -> Mark:
    # JS `renderSubtree`, without recursion: each node's mark in preorder,
    # then each subtree composed after its children's.
    order = root.pre_order()
    marks = {id(n): node_fn(n.datum).name(n.name) for n in order}
    for node in reversed(order):
        if not node.children:
            continue
        kids = [marks[id(c)] for c in node.children]
        # Both combiners are resolved at this node's depth, so a level's
        # parent_child and its children's sibling grouping alternate in sync.
        child_group = _resolve(sibling, node.depth)(kids)
        marks[id(node)] = _resolve(parent_child, node.depth)([marks[id(node)], child_group])
    return marks[id(root)]


def _link_options(link: Any, source: _Node, target: _Node) -> Optional[Dict[str, Any]]:
    if link is None:
        return {}
    opts = link(source.datum, target.datum) if callable(link) else link
    if opts is None:
        # A link function returning null skips the edge in JS.
        return None
    unknown = sorted(set(opts) - set(_LINK_OPTIONS))
    if unknown:
        raise ValueError(
            f"gotree.tree(): unknown link option(s) {unknown}; "
            f"expected {list(_LINK_OPTIONS)}"
        )
    return opts


def _link_mark(opts: Dict[str, Any], source: str, target: str, growth_dir: Optional[str]) -> Mark:
    curve = _or(opts.get("curve"), Curve.linear)
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
        stroke=_or(opts.get("stroke"), "gray"),
        stroke_width=_or(opts.get("stroke_width"), 1),
        opacity=opts.get("opacity"),
    ).z_order(-1)


def _edges(root: _Node, link: Any, parent_child: CombinerSpec) -> List[Mark]:
    if link == "none":
        return []
    edges = []
    for node in root.breadth_first():
        # The growth axis of the parent_child combiner at the parent's depth.
        growth_dir = getattr(_resolve(parent_child, node.depth), "growth_dir", None)
        for child in node.children:
            opts = _link_options(link, node, child)
            if opts is not None:
                edges.append(_link_mark(opts, node.name, child.name, growth_dir))
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
            function ``(source, target) -> dict`` over two nodes, which
            returns ``None`` to skip that edge. Default:
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
    parent_child = _or(parent_child, _DEFAULT_PARENT_CHILD)
    root = _hierarchy(data)
    node_tree = _render_tree(
        root, _or(node, _default_node), parent_child, _or(sibling, _DEFAULT_SIBLING)
    )
    edges = _edges(root, link, parent_child)
    # The edges are relate clauses over the node tree's names, so each reads
    # the final positions of the two nodes it connects.
    composed = layer([node_tree]).relate(lambda: edges)
    if coord is not None:
        return layer([composed], coord=coord)
    return composed
