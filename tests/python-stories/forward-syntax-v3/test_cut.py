"""Equivalent of forwardsyntax/Cut.stories.tsx — Forward Syntax V3/Cut.

`cut` slices a single source shape (image or rect) into N clipped sub-shapes
along `dir`. Two surfaces, one IR node:
  - chart `.mark(image(...).cut({...}))` — the v3 expand-mark form (a field-name
    string `size` resolves per-row);
  - pure `cut(source, ...)` dropped into a `Spread` / `Stack` combinator's
    children — the JS side flat-expands it into its N slice nodes in place.

Image assets: the JS storybook imports `wilsonblanco.png` and `bellcurve.svg`
via Vite. The PNG (104KB, over Vite's 4KB inline threshold) is served from the
harness Vite dev server via the `/@fs/<absolute-path>` form Vite generates in
dev; the DOM normalizer reduces it to its basename so it matches the JS
baseline. The SVG (1.5KB, under the threshold) is INLINED by Vite as a
`data:image/svg+xml,` URI — the normalizer leaves data URIs untouched, so we
reconstruct the byte-identical data URI here with Vite's exact encoding.

`story_image_cut_with_labels` (JS `ImageCutWithLabels`) is exempt — see
tests/.python-sync-exempt. It builds a per-slice `layer(...)` inside a
mark-as-function over `selectAll("part")`, embedding each JS ref node directly
(`d.name("slice")`) and reading its bound datum (`d.datum.category`). The Python
mark-fn runs over the RPC bridge and receives plain JSON rows, not JS ref nodes,
so it cannot embed the slice nodes or project `.datum` — a wrapper project, not
a port.
"""

import os
import re

from gofish import chart, cut, datum, image, layer, mask, offset, rect, spread, stack, text
from gofish import Constraint

# Vite-served URL of the bottle PNG. JS imports it via
# `import bottlePng from "../assets/wilsonblanco.png"`, which Vite resolves to
# `/@fs/<absolute-path>` in dev. The parity harness is also Vite, so the same
# path works here; the DOM normalizer collapses it to its basename.
_REPO_ROOT = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "..", "..")
)
_ASSETS = f"{_REPO_ROOT}/packages/gofish-graphics/stories/assets"
BOTTLE_PNG = f"/@fs{_ASSETS}/wilsonblanco.png"


def _vite_svg_data_uri(path: str) -> str:
    """Reconstruct the `data:image/svg+xml,` URI Vite emits when it inlines a
    small SVG asset. Mirrors Vite's `svgToDataURL` (non-base64 branch) exactly:
    collapse inter-tag whitespace, `"`→`'`, then percent-encode `%`, `#`, `<`,
    `>`, and runs of whitespace. bellcurve.svg has no `<text`/`<foreignObject`
    and no nested quotes, so it takes this branch (not base64).
    """
    s = open(path).read().strip()
    s = re.sub(r">\s+<", "><", s)
    s = s.replace('"', "'")
    s = s.replace("%", "%25")
    s = s.replace("#", "%23")
    s = s.replace("<", "%3c")
    s = s.replace(">", "%3e")
    s = re.sub(r"\s+", "%20", s)
    return "data:image/svg+xml," + s


BELL_CURVE_SVG = _vite_svg_data_uri(f"{_ASSETS}/bellcurve.svg")

# What's actually in a bottle of wine, by volume.
BOTTLE_DATA = [
    {"category": "Marketing", "amount": 6},
    {"category": "Pretentiousness", "amount": 7},
    {"category": "Sulfites", "amount": 2},
    {"category": "Tannins", "amount": 3},
    {"category": "Water", "amount": 40},
    {"category": "Grape juice", "amount": 42},
]

ABCD_DATA = [{"label": "A"}, {"label": "B"}, {"label": "C"}, {"label": "D"}]


def story_image_cut():
    """Bottle sliced horizontally by `amount`, arranged vertically by spread."""
    return (
        chart(BOTTLE_DATA)
        .flow(spread(dir="y", spacing=4, reverse=True))
        .mark(
            image(href=BOTTLE_PNG, w=193, h=600).cut(
                dir="y", size="amount", inset=4
            )
        ),
        {"w": 400, "h": 700, "axes": False},
    )


def story_grouped_cut():
    """Two vintages side by side, each bottle exploded into its own rows'
    proportions: outer spread by vintage along x, inner per-item spread along y
    with visible spacing so each bottle reads as an exploded stack of slices."""
    data = [
        {"vintage": "2019", "category": "Water", "amount": 40},
        {"vintage": "2019", "category": "Grape juice", "amount": 42},
        {"vintage": "2019", "category": "Other", "amount": 18},
        {"vintage": "2021", "category": "Water", "amount": 55},
        {"vintage": "2021", "category": "Grape juice", "amount": 30},
        {"vintage": "2021", "category": "Other", "amount": 15},
    ]
    return (
        chart(data)
        .flow(
            spread(by="vintage", dir="x", spacing=40),
            spread(dir="y", spacing=14, reverse=True),
        )
        .mark(
            image(href=BOTTLE_PNG, w=193, h=600).cut(
                dir="y", size="amount", inset=4
            )
        ),
        {"w": 600, "h": 760, "axes": False},
    )


def story_rect_equal_slices():
    """Solid rect cut into 4 equal slices along x with 4px gaps (sizes
    defaulted to equal, one slice per abcd row)."""
    return (
        chart(ABCD_DATA)
        .flow(spread(dir="x", spacing=4))
        .mark(rect(w=400, h=80, fill="steelblue").cut(dir="x")),
        {"w": 600, "h": 200, "axes": False},
    )


def story_rect_flush_stack():
    """Regression coverage for `stack`'s flush recomposition of a cut: the same
    rect cut into 4 equal slices and collapsed back flush with `stack` (no
    spacing option) — a correct recompose shows one continuous border."""
    return (
        chart(ABCD_DATA)
        .flow(stack(dir="x"))
        .mark(
            rect(
                w=400, h=80, fill="tomato", stroke="#333", strokeWidth=3
            ).cut(dir="x")
        ),
        {"w": 600, "h": 200, "axes": False},
    )


def story_image_equal_slices():
    """Image cut into 3 equal slices along y, exploded vertically with a 14px
    gap so the bottle reads as three separated horizontal slabs."""
    return (
        chart([{"k": "top"}, {"k": "mid"}, {"k": "bot"}])
        .flow(spread(dir="y", spacing=14, reverse=True))
        .mark(image(href=BOTTLE_PNG, w=193, h=600).cut(dir="y")),
        {"w": 600, "h": 700, "axes": False},
    )


def story_low_level_form():
    """Low-level form: the pure `cut(source, ...)` primitive dropped straight
    into a Spread combinator (no Chart, no async plumbing). With `datum()`
    weights this is visually identical to ImageCut."""
    return (
        spread(
            [
                cut(
                    image(href=BOTTLE_PNG, w=193, h=600),
                    dir="y",
                    size=[datum(d["amount"]) for d in BOTTLE_DATA],
                    inset=4,
                )
            ],
            dir="y",
            spacing=4,
            reverse=True,
        ),
        {"w": 400, "h": 700, "axes": False},
    )


def story_rect_absolute_sizes():
    """Absolute-pixel sizes: a 600px-wide rect cut into windows of
    [100, 100, 200] along x. Raw numbers are ABSOLUTE source pixels; the
    leftover 200px of source is omitted, never appearing in any slice."""
    return (
        spread(
            [
                cut(
                    rect(w=600, h=80, fill="seagreen"),
                    dir="x",
                    size=[100, 100, 200],
                )
            ],
            dir="x",
            spacing=8,
        ),
        {"w": 600, "h": 200, "axes": False},
    )


def story_mixed_sizes():
    """Flexbox-style mixed sizes: a 600px-wide stroked rect cut into four
    windows `[100, datum(1), datum(2), 50]` along x. The raw numbers are fixed
    end caps; the two datum() weights split the remaining 450px 1:2 (150, 300).
    Widths read left-to-right as 100, 150, 300, 50."""
    return (
        spread(
            [
                cut(
                    rect(
                        w=600,
                        h=80,
                        fill="mediumpurple",
                        stroke="#2e1065",
                        strokeWidth=3,
                    ),
                    dir="x",
                    size=[100, datum(1), datum(2), 50],
                )
            ],
            dir="x",
            spacing=8,
        ),
        {"w": 700, "h": 200, "axes": False},
    )


def story_image_horizontal_cut():
    """dir: "x" — the upright bottle sliced into vertical strips of varying
    width by `weight`, then exploded apart along x at its natural 193x600
    aspect so every strip masks real image content."""
    data = [
        {"label": "I", "weight": 1},
        {"label": "II", "weight": 2},
        {"label": "III", "weight": 3},
        {"label": "IV", "weight": 2},
        {"label": "V", "weight": 1},
    ]
    return (
        chart(data)
        .flow(spread(dir="x", spacing=12))
        .mark(
            image(href=BOTTLE_PNG, w=193, h=600).cut(
                dir="x", size="weight", inset=4
            )
        ),
        {"w": 700, "h": 700, "axes": False},
    )


def story_croissant_stack():
    """Croissant chart: slice a continuous distribution shape (a bell curve)
    into gapped vertical bands that keep their original x positions.

    The JS story wraps EACH cut slice in its own `Stack` with `inset/2`
    transparent spacer rects on both sides, then flush-`Stack`s the padded
    slices so the recomposed row spans the source's exact 400px. The Python IR
    bridge expands a `cut` only as flat combinator children (it has no per-slice
    template), so we cannot route the per-slice padding THROUGH `cut`. Instead we
    HAND-ELABORATE each slice in user space, emitting exactly what JS pure `cut`
    emits per slice — `mask([regionRect, offset(source)])` — and wrap it in the
    same spacer `Stack` the JS story uses.

    This hand-elaboration intentionally mirrors cut's elaboration
    (`mask(window, offset(source))`) 1:1 — see `buildSliceNode` + the pure `cut`
    in `packages/gofish-graphics/src/ast/graphicalOperators/cut.tsx`. It doubles
    as a regression pin that cut's output stays expressible in user-space
    primitives: if cut.tsx's `buildSliceNode` changes, update this story to
    match. For `dir: "x"` (no y-flip) the recipe per slice `i` is, with source
    extent-along `extent_i`, cumulative `offset_i`, cross extent 120:
      insetExtent = extent_i - inset
      insetOffset = offset_i + inset / 2
      regionRect  = rect(x=0, y=0, w=insetExtent, h=120, fill="white")
      slice       = mask([regionRect, offset(source, x=-insetOffset)])
    then pad each slice back to its full logical extent with `inset/2`
    zero-extent spacer rects on both sides (an inner `Stack`) and flush-`Stack`
    the padded slices — identical to the JS story.
    """
    W = 400
    inset = 16
    H = 120
    # Unequal weights: narrow bands in the tails, wide bands over the peak.
    weights = [1, 1.6, 2.4, 2.4, 1.6, 1]

    # Resolve the datum() weights into pixel extents + cumulative offsets along
    # x exactly as the pure cut's resolveExtents does for an all-datum array:
    # the remainder is the whole source width, split proportionally.
    total = sum(weights)
    extents = [(wt / total) * W for wt in weights]
    offsets = []
    acc = 0
    for e in extents:
        offsets.append(acc)
        acc += e

    def make_slice(offset_i, extent_i):
        inset_extent = extent_i - inset
        inset_offset = offset_i + inset / 2  # dir "x" → translate by -insetOffset
        region = rect(x=0, y=0, w=inset_extent, h=H, fill="white")
        source = image(href=BELL_CURVE_SVG, w=W, h=H)
        return mask([region, offset(source, x=-inset_offset)])

    # Pad each slice back to its full logical extent: inset/2 of transparent
    # space on each side along `dir`, via zero-cross-extent spacer rects.
    def spacer():
        return rect(w=inset / 2, h=0, fill="none", stroke="none")

    padded = [
        stack([spacer(), make_slice(o, e), spacer()], dir="x")
        for o, e in zip(offsets, extents)
    ]
    bands = stack(padded, dir="x").name("bands")

    # Hand-composed continuous x axis (domain [-3, 3] standard deviations): a
    # full-width baseline rect plus numeric labels pinned by LITERAL pixel x
    # (frac * W) in the axis sub-layer's frame.
    axis_ticks = [
        {"frac": 0.0, "label": "-3"},
        {"frac": 0.25, "label": "-1.5"},
        {"frac": 0.5, "label": "0"},
        {"frac": 0.75, "label": "1.5"},
        {"frac": 1.0, "label": "3"},
    ]
    axis = (
        layer(
            [
                rect(w=W, h=1.5, fill="#999").name("axisLine"),
                *[
                    text(text=t["label"], fontSize=12, fill="#555").name(
                        f"lab{i}"
                    )
                    for i, t in enumerate(axis_ticks)
                ],
            ]
        )
        .constrain(
            lambda axisLine, lab0, lab1, lab2, lab3, lab4: [
                # Pin the baseline rect at the sub-layer origin, then place each
                # label's center at its literal x = frac * W, dropped below the
                # line.
                Constraint.align([axisLine], x="start", y="start"),
                *[
                    c
                    for i, (lab, t) in enumerate(
                        zip([lab0, lab1, lab2, lab3, lab4], axis_ticks)
                    )
                    for c in (
                        Constraint.position([lab], x=t["frac"] * W),
                        Constraint.distribute(
                            [axisLine, lab], dir="y", spacing=6
                        ),
                    )
                ],
            ]
        )
        .name("axis")
    )

    return (
        layer([bands, axis]).constrain(
            lambda bands, axis, **_: [
                # Axis row centered under the bands (both W wide).
                Constraint.align([bands, axis], x="middle"),
                Constraint.distribute([axis, bands], dir="y", spacing=12),
            ]
        ),
        {"w": 520, "h": 260, "axes": False},
    )
