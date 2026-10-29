"""Equivalent of forwardsyntax/Cut.stories.tsx — Forward Syntax/Cut.

`cut` slices a single source shape (image or rect) into N clipped sub-shapes
along `dir`. Two surfaces, one IR node:
  - chart `.mark(image(...).cut({...}))` — the expand-mark form (a field-name
    string `size` resolves per-row);
  - pure `cut(source, ...)` dropped into a `Spread` / `Stack` combinator's
    children — the JS side flat-expands it into its N slice nodes in place.

Image assets: the JS storybook imports `wilsonblanco.png` via Vite. The PNG
(104KB, over Vite's 4KB inline threshold) is served from the harness Vite dev
server via the `/@fs/<absolute-path>` form Vite generates in dev; the DOM
normalizer reduces it to its basename so it matches the JS baseline.

The croissant chart moved to Forward Syntax/Croissant (`test_croissant.py`),
which cuts the drawn density curve with `intersect` instead of slicing an image.

`story_image_cut_with_labels` (JS `ImageCutWithLabels`) is now ported (#591 —
the ref/datum mark-fn bridge). The mark-fn receives one `_InputRef` per slice
(reconstructed from the `BridgeRef` and datum the JS harness/widget sends
across the RPC in place of the live ref); `.name("slice")` on it
survives the round trip (#556) via the `_InputRef.name()` override, so the
per-slice `layer([...]).relate(...)` can target it by name exactly like
the JS story's `d.name("slice")`.
"""

import os

from gofish import chart, cut, datum, image, layer, rect, spread, stack, text
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
        chart(BOTTLE_DATA, w=400, h=700)
        .flow(spread(dir="y", spacing=4, reverse=True))
        .mark(
            image(href=BOTTLE_PNG, w=193, h=600).cut(
                dir="y", size="amount", inset=4
            )
        ),
        {"axes": False},
    )


def story_image_cut_with_labels():
    """Cut chart with labels added via a chained `.layer()` sub-chart. The cut
    chart returns just the named slices; the empty-scope `.layer(chart()...)`
    tier inherits those slices (one ref per slice) and overlays category and
    amount labels at each slice's position. Each ref exposes the slice's
    datum via `.datum`.

    The cut ties each slice's image band to data order (slice i = band i,
    top→bottom). To land Grape juice (the bulk) at the BOTTOM showing the
    bottle BODY, it must be the LAST data row (bottom band) AND positioned
    last — so reverse the data and keep `reverse=True` on the spread.
    """

    def label_mark(data):
        slices = []
        for d in data:
            d.name("slice")
            category_label = text(
                font_size=18,
                font_weight="bold",
                fill="#1c5e20",
                text=d.datum[0]["category"],
            ).name("label")
            amount_label = text(
                font_size=36,
                font_family="Impact",
                fill="#1c5e20",
                text=str(d.datum[0]["amount"]),
            ).name("amount")

            def _relate(slice, label, amount):
                return [
                    Constraint.align([slice, label], y="middle"),
                    Constraint.distribute([slice, label], dir="x", spacing=12),
                    Constraint.align([slice, amount], x="middle"),
                    Constraint.align([slice, amount], y="middle"),
                ]

            slices.append(layer([d, category_label, amount_label]).relate(_relate))
        return layer(slices)

    return (
        chart(list(reversed(BOTTLE_DATA)))
        .flow(spread(dir="y", spacing=20, reverse=True))
        .mark(
            image(href=BOTTLE_PNG, w=193, h=600).cut(
                dir="y", size="amount", inset=4
            )
        )
        .layer(chart().mark(label_mark)),
        {"axes": False},
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
        chart(data, w=600, h=760)
        .flow(
            spread(by="vintage", dir="x", spacing=40),
            spread(dir="y", spacing=14, reverse=True),
        )
        .mark(
            image(href=BOTTLE_PNG, w=193, h=600).cut(
                dir="y", size="amount", inset=4
            )
        ),
        {"axes": False},
    )


def story_rect_equal_slices():
    """Solid rect cut into 4 equal slices along x with 4px gaps (sizes
    defaulted to equal, one slice per abcd row)."""
    return (
        chart(ABCD_DATA, w=600, h=200)
        .flow(spread(dir="x", spacing=4))
        .mark(rect(w=400, h=80, fill="steelblue").cut(dir="x")),
        {"axes": False},
    )


def story_rect_flush_stack():
    """Regression coverage for `stack`'s flush recomposition of a cut: the same
    rect cut into 4 equal slices and collapsed back flush with `stack` (no
    spacing option) — a correct recompose shows one continuous border."""
    return (
        chart(ABCD_DATA, w=600, h=200)
        .flow(stack(dir="x"))
        .mark(
            rect(
                w=400, h=80, fill="tomato", stroke="#333", stroke_width=3
            ).cut(dir="x")
        ),
        {"axes": False},
    )


def story_image_equal_slices():
    """Image cut into 3 equal slices along y, exploded vertically with a 14px
    gap so the bottle reads as three separated horizontal slabs."""
    return (
        chart([{"k": "top"}, {"k": "mid"}, {"k": "bot"}], w=600, h=700)
        .flow(spread(dir="y", spacing=14, reverse=True))
        .mark(image(href=BOTTLE_PNG, w=193, h=600).cut(dir="y")),
        {"axes": False},
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
                        stroke_width=3,
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
        chart(data, w=700, h=700)
        .flow(spread(dir="x", spacing=12))
        .mark(
            image(href=BOTTLE_PNG, w=193, h=600).cut(
                dir="x", size="weight", inset=4
            )
        ),
        {"axes": False},
    )
