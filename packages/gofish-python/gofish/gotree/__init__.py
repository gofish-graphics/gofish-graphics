"""Python bridge for `gofish-gotree` (issue #792).

`gofish-gotree` (packages/gofish-gotree/src/) implements the GoTree grammar
(Li et al., CHI 2020) on top of GoFish. This submodule is a pure snake_case
mirror of its JS API — `tree`, `combine`, `spread`, `distribute`, `nest`,
`alternate` — that builds the `{"type": "gotree-tree", ...}` mark-level IR
node the JS harness reconstructs by calling the real `tree(spec, data)`.

Deliberately NOT re-exported from the top-level `gofish` namespace (same
category as `derive`/`field`/`ref`, which also live outside the generated
descriptor table) — users write::

    from gofish.gotree import tree, combine, spread, distribute, nest, alternate

or::

    from gofish import gotree
    gotree.tree(...)

Validation here is intentionally cheap and structural (unknown combiner
kind, unknown link option, wrong arg count) — the canonical `gofish-ir` JSON
Schema is the source of truth for the wire shape; see `gotree-tree` there.
"""

from typing import Any, Callable, Dict, List, Optional, Union

from ..ast import Mark, _MarkFn, _PendingAccessor

__all__ = [
    "tree",
    "combine",
    "spread",
    "distribute",
    "nest",
    "alternate",
    "Tree",
]


# ---------------------------------------------------------------------------
# Combiners — each builder returns a plain CombinerIR wire dict directly
# (no wrapper class needed: the dict *is* the wire shape, matching
# packages/gofish-gotree/src/helpers.ts's SpreadOptions / DistributeOptions /
# NestOptions / CombineOptions). None of these fields are camelCase in JS
# (dir/spacing/alignment/anchor/order/kind/pad are all single words), so no
# snake_case -> camelCase rename table is needed here (unlike `link`, below).
# ---------------------------------------------------------------------------

_AXIS_KINDS = {"align", "distribute", "nest"}


def spread(
    *,
    dir: str,
    spacing: Optional[float] = None,
    alignment: Optional[str] = None,
    anchor: Optional[str] = None,
) -> Dict[str, Any]:
    """Combiner: distribute children along `dir` via the `spread` operator.

    Mirrors JS `spread({dir, spacing?, alignment?, anchor?})`
    (helpers.ts `SpreadOptions`). `anchor` is `"edge"` (default, sums bbox
    extents) or a fixed-pitch point (`"start"`/`"middle"`/`"end"`/
    `"baseline"`) — use `"middle"` under a `coord=polar()` tree.
    """
    options: Dict[str, Any] = {"dir": dir}
    if spacing is not None:
        options["spacing"] = spacing
    if alignment is not None:
        options["alignment"] = alignment
    if anchor is not None:
        options["anchor"] = anchor
    return {"kind": "spread", "options": options}


def distribute(
    *,
    dir: str,
    spacing: Optional[float] = None,
    anchor: Optional[str] = None,
    order: Optional[str] = None,
    alignment: Optional[str] = None,
) -> Dict[str, Any]:
    """Combiner: place children along `dir` via `Constraint.distribute`,
    optionally pairing a `Constraint.align` on the orthogonal axis.

    Mirrors JS `distribute({dir, spacing?, anchor?, order?, alignment?})`
    (helpers.ts `DistributeOptions`).
    """
    options: Dict[str, Any] = {"dir": dir}
    if spacing is not None:
        options["spacing"] = spacing
    if anchor is not None:
        options["anchor"] = anchor
    if order is not None:
        options["order"] = order
    if alignment is not None:
        options["alignment"] = alignment
    return {"kind": "distribute", "options": options}


def nest(*, x: Optional[float] = None, y: Optional[float] = None) -> Dict[str, Any]:
    """Combiner: wrap `[outer, inner]` via `Constraint.nest({x?, y?}, ...)`.

    Mirrors JS `nest({x?, y?})` (helpers.ts `NestOptions`). At least one of
    `x` / `y` is required.
    """
    if x is None and y is None:
        raise ValueError("gotree.nest() requires at least one of x, y")
    options: Dict[str, Any] = {}
    if x is not None:
        options["x"] = x
    if y is not None:
        options["y"] = y
    return {"kind": "nest", "options": options}


def _normalize_axis(axis: Union[str, dict], axis_name: str) -> dict:
    if isinstance(axis, str):
        if axis not in _AXIS_KINDS:
            raise ValueError(
                f"gotree.combine(): unknown {axis_name} axis kind {axis!r}; "
                f"expected one of {sorted(_AXIS_KINDS)}"
            )
        return {"kind": axis}
    if isinstance(axis, dict):
        kind = axis.get("kind")
        if kind not in _AXIS_KINDS:
            raise ValueError(
                f"gotree.combine(): unknown {axis_name} axis kind {kind!r}; "
                f"expected one of {sorted(_AXIS_KINDS)}"
            )
        return dict(axis)
    raise TypeError(
        f"gotree.combine(): {axis_name} must be a string or dict CombineAxis, "
        f"got {type(axis).__name__}"
    )


def combine(
    *,
    x: Optional[Union[str, dict]] = None,
    y: Optional[Union[str, dict]] = None,
) -> Dict[str, Any]:
    """Combiner: the general per-axis primitive — one `"align"` /
    `"distribute"` / `"nest"` choice per axis (GoTree's `Layout(x, y)`
    model).

    Each of `x` / `y` accepts the same shorthands as JS `CombineAxis`
    (helpers.ts:122-135): a bare string (`"align"` / `"distribute"` /
    `"nest"`) or the object form with knobs (e.g.
    `{"kind": "distribute", "spacing": 18}`, `{"kind": "nest", "pad": 10}`).
    `nest` is only valid on a 2-child relationship. At least one of `x` /
    `y` is required.
    """
    if x is None and y is None:
        raise ValueError("gotree.combine() requires at least one of x, y")
    options: Dict[str, Any] = {}
    if x is not None:
        options["x"] = _normalize_axis(x, "x")
    if y is not None:
        options["y"] = _normalize_axis(y, "y")
    return {"kind": "combine", "options": options}


def alternate(combiners: List[dict]) -> Dict[str, Any]:
    """Depth-indexed combiner: cycles through `combiners` by `depth %
    len(combiners)`. Mirrors JS `alternate([...])` (helpers.ts).

    `perDepth(fn)` (the raw-function depth-indexed form) is not exposed
    here — it can't cross the wire as JSON, and `alternate` covers every
    real gallery use (H-tree axis swap, slice-and-dice treemap levels).
    """
    combiners = list(combiners)
    if not combiners:
        raise ValueError("gotree.alternate() requires at least one combiner")
    for c in combiners:
        if not isinstance(c, dict) or "kind" not in c:
            raise ValueError(
                "gotree.alternate(): every entry must be a combiner built "
                "with spread()/distribute()/nest()/combine(), got "
                f"{c!r}"
            )
    return {"kind": "alternate", "combiners": combiners}


_COMBINER_KINDS = {"spread", "distribute", "nest", "combine", "alternate"}


def _validate_combiner(value: Optional[dict], argname: str) -> Optional[dict]:
    if value is None:
        return None
    if not isinstance(value, dict) or value.get("kind") not in _COMBINER_KINDS:
        raise ValueError(
            f"gotree.tree(): {argname}= must be built with spread()/"
            f"distribute()/nest()/combine()/alternate(), got {value!r}"
        )
    return value


# ---------------------------------------------------------------------------
# link — "none" | LinkOptions dict | callable (source, target) -> LinkOptions
# ---------------------------------------------------------------------------

# snake_case Python kwarg -> camelCase wire key (LinkOptions is the one
# gotree shape that actually has a multi-word field — strokeWidth).
_LINK_KEY_MAP = {
    "curve": "curve",
    "stroke": "stroke",
    "stroke_width": "strokeWidth",
    "opacity": "opacity",
}


def _normalize_link_dict(link: dict) -> dict:
    out: Dict[str, Any] = {}
    for k, v in link.items():
        if k not in _LINK_KEY_MAP:
            raise ValueError(
                f"gotree.tree(): unknown link option {k!r}; expected one of "
                f"{sorted(_LINK_KEY_MAP)}"
            )
        out[_LINK_KEY_MAP[k]] = v
    return out


def _prepare_link(link: Any) -> Any:
    """Normalize the `link=` argument to one of: `None`, `"none"`, a
    normalized (camelCase-keyed) options dict, or a `_PendingAccessor`
    wrapping a `(source, target) -> LinkOptions` callable.
    """
    if link is None:
        return None
    if isinstance(link, str):
        if link != "none":
            raise ValueError(
                f'gotree.tree(): link string form must be "none", got {link!r}'
            )
        return "none"
    if callable(link):
        # Reuses the existing lambda-sentinel machinery (`_PendingAccessor`)
        # rather than a bespoke registry — the wire shape
        # (`{"__gofish_lambda": id}`) and the derive-RPC lambda_id
        # convention are identical regardless of the wrapped callable's
        # arity; only the caller-side adapter (rows -> args) differs, and
        # that lives with whatever drives the RPC, not with the sentinel.
        return _PendingAccessor(link)
    if isinstance(link, dict):
        return _normalize_link_dict(link)
    raise TypeError(
        "gotree.tree(): link= must be \"none\", a dict of link options, or "
        f"a callable (source, target) -> dict, got {type(link).__name__}"
    )


def _link_wire(link: Any) -> Any:
    if link is None:
        return None
    if link == "none":
        return "none"
    if isinstance(link, _PendingAccessor):
        return {"__gofish_lambda": link.lambda_id}
    return link


# ---------------------------------------------------------------------------
# node — a Mark template, or a callable (row) -> Mark
# ---------------------------------------------------------------------------

def _default_node() -> Mark:
    from ..ast import rect

    return rect(w=12, h=12, fill="#4682b4")


def _prepare_node(node: Any) -> Any:
    if node is None:
        return _default_node()
    if isinstance(node, Mark):
        return node
    if callable(node):
        # Whole-mark callable — mirrors `ChartBuilder.mark(fn)` / JS
        # "mark-as-function": wraps the callable in `_MarkFn` so the IR
        # carries a stable lambda_id the derive-server can register.
        return _MarkFn(node)
    raise TypeError(
        "gotree.tree(): node= must be a Mark (e.g. circle(...)) or a "
        f"callable (row) -> Mark, got {type(node).__name__}"
    )


def _node_wire(node: Any) -> Any:
    if isinstance(node, _MarkFn):
        return {"type": "mark-fn", "lambdaId": node.lambda_id}
    return node.to_dict()


# ---------------------------------------------------------------------------
# Tree — the `{"type": "gotree-tree", ...}` mark-level IR node
# ---------------------------------------------------------------------------


class Tree:
    """The object returned by `tree(...)`. Not a `Mark` subclass — a
    gotree tree is always a standalone top-level render (like a raw-mark
    story), so it only needs `.to_dict()` / `.to_ir()` / `.render()` /
    `.save()`, mirroring `Mark`'s own implementations of those rather than
    inheriting them (`Mark`'s `.name()`/`.z_order()`/`.label()` clone-via-
    `type(self)(mark_type, **kwargs)`, which doesn't match this
    constructor's shape).
    """

    def __init__(
        self,
        data: Any,
        *,
        node: Any = None,
        link: Any = None,
        parent_child: Optional[dict] = None,
        sibling: Optional[dict] = None,
        coord: Optional[dict] = None,
    ):
        if not isinstance(data, dict):
            raise TypeError(
                "gotree.tree(): data must be a nested tree dict "
                '(e.g. {"name": ..., "children": [...]})'
            )
        self.data = data
        self._node = _prepare_node(node)
        self._link = _prepare_link(link)
        self._parent_child = _validate_combiner(parent_child, "parent_child")
        self._sibling = _validate_combiner(sibling, "sibling")
        self.coord = coord

    def to_dict(self) -> dict:
        d: Dict[str, Any] = {"type": "gotree-tree", "data": self.data}
        d["node"] = _node_wire(self._node)
        link_wire = _link_wire(self._link)
        if link_wire is not None:
            d["link"] = link_wire
        if self._parent_child is not None:
            d["parentChild"] = self._parent_child
        if self._sibling is not None:
            d["sibling"] = self._sibling
        if self.coord is not None:
            d["coord"] = self.coord
        return d

    def to_ir(self) -> dict:
        """Top-level IR shape for a standalone render — mirrors `Mark.to_ir()`
        (the same envelope the low-level Bluefish diagram stories use)."""
        return {"type": "raw-mark", "mark": self.to_dict()}

    def render(
        self,
        w: int = 800,
        h: int = 600,
        axes: bool = False,
        debug: bool = False,
    ):
        """Render this tree directly (no Chart wrapper) — mirrors
        `Mark.render()`. Returns a `GoFishChartWidget`; in a notebook this
        auto-displays.
        """
        from ..widget import GoFishChartWidget
        from ..arrow_utils import empty_placeholder_arrow_bytes

        widget = GoFishChartWidget(
            spec=self.to_ir(),
            arrow_data=empty_placeholder_arrow_bytes(),
            derive_functions={},
            width=w,
            height=h,
            axes=axes,
            debug=debug,
        )
        return widget

    def save(
        self,
        path,
        w: int = 800,
        h: int = 600,
        axes: bool = False,
        debug: bool = False,
    ):
        """Save this tree's render to `path` (see `Mark.save`)."""
        widget = self.render(w=w, h=h, axes=axes, debug=debug)
        widget.save(path)
        return widget

    def _repr_mimebundle_(self, include=None, exclude=None):
        """Auto-display in notebooks (see `Mark._repr_mimebundle_`)."""
        return self.render()._repr_mimebundle_(include=include, exclude=exclude)


def tree(
    data: Any,
    *,
    node: Any = None,
    link: Any = None,
    parent_child: Optional[dict] = None,
    sibling: Optional[dict] = None,
    coord: Optional[dict] = None,
) -> Tree:
    """Build a GoTree tree visualization — a pure snake_case mirror of JS
    `tree(spec, data)` (packages/gofish-gotree/src/tree.tsx).

    Args:
        data: A nested tree dict (`{name?, value?, children?: [...],
            ...extra}`).
        node: A GoFish mark (e.g. `rect(w=12, h=12, fill="#4682b4")`,
            the default) drawn once per tree node, or a callable
            `(row) -> Mark` for per-node styling that isn't expressible as
            plain channel accessors (e.g. color keyed off hierarchy depth
            rather than a data field).
        link: `"none"` to omit edges (default is drawn with GoFish
            defaults — straight, gray, width 1), a dict of
            `curve`/`stroke`/`stroke_width`/`opacity`, or a callable
            `(source, target) -> dict` for per-edge styling.
        parent_child: Combiner for parent <-> children-group, built with
            `spread()`/`distribute()`/`nest()`/`combine()`/`alternate()`.
            Omit to use GoTree's own default (`distribute(dir="y",
            spacing=32, alignment="middle")`).
        sibling: Combiner for the sibling group, same builders. Omit for
            the default (`distribute(dir="x", spacing=16,
            alignment="start")`).
        coord: A coord transform from `gofish` (`polar()`, `clock()`,
            `wavy()`) to render the whole tree under, e.g. for a radial
            layout.

    Returns:
        A `Tree` — call `.render(w=..., h=...)` to display it.
    """
    return Tree(
        data,
        node=node,
        link=link,
        parent_child=parent_child,
        sibling=sibling,
        coord=coord,
    )
